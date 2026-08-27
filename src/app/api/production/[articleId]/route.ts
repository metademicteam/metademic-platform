import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const VALID = ["not_started","copyediting","typesetting","proof_ready","author_review","corrections_requested","final_approval","ready","published"] as const;
type ProdStatus = typeof VALID[number];

// Allowed workflow edges (strict)
const EDGES: Record<ProdStatus, ProdStatus[]> = {
  not_started: ["copyediting"],
  copyediting: ["typesetting"],
  typesetting: ["proof_ready"],
  proof_ready: ["author_review"],
  author_review: ["corrections_requested","final_approval"],
  corrections_requested: ["typesetting","proof_ready"],
  final_approval: ["ready"],
  ready: ["published"],
  published: [],
};

const schema = z.object({
  status: z.enum(VALID),
  assignedCopyeditorId: z.string().uuid().nullable().optional(),
  assignedProductionEditorId: z.string().uuid().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  proofUrl: z.string().url().optional(),
  publishedUrl: z.string().url().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ articleId: string }> }) {
  const { articleId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  const { status: targetStatus, assignedCopyeditorId, assignedProductionEditorId, notes, proofUrl, publishedUrl } = parsed.data;

  const admin = createAdminClient();
  const { data: prod, error: prodErr } = await admin.from("production_records").select("id, status, article_id").eq("article_id", articleId).maybeSingle();
  const current = (prod as { status: ProdStatus } | null)?.status ?? "not_started";

  // Validate transition unless same status (allow metadata-only update)
  if (targetStatus !== current) {
    const allowed = EDGES[current] ?? [];
    if (!allowed.includes(targetStatus)) {
      return NextResponse.json({ error: `Invalid production transition from "${current}" to "${targetStatus}". Allowed: ${allowed.join(", ") || "none"}. Workflow: not_started→copyediting→typesetting→proof_ready→author_review→corrections_requested→final_approval→ready→published`, allowed }, { status: 400 });
    }
  }

  // Permission: production roles
  const { data: memberships } = await supabase.from("journal_members").select("role,is_active").eq("user_id", user.id).eq("is_active", true);
  const roles = (memberships ?? []).map((m: { role: string }) => m.role);
  const allowedRoles = ["copyeditor","production_editor","managing_editor","journal_manager","journal_admin","super_admin"];
  const hasProd = roles.some((r: string) => allowedRoles.includes(r));
  if (!hasProd) return NextResponse.json({ error: "Forbidden — production role required" }, { status: 403 });

  const updates: Record<string, unknown> = { status: targetStatus };
  if (assignedCopyeditorId !== undefined) updates.assigned_copyeditor_id = assignedCopyeditorId;
  if (assignedProductionEditorId !== undefined) updates.assigned_production_editor_id = assignedProductionEditorId;
  if (notes !== undefined) updates.notes = notes;
  if (!prod && targetStatus === "copyediting") updates.started_at = new Date().toISOString();
  if (targetStatus === "copyediting" && current === "not_started") updates.started_at = new Date().toISOString();
  if (targetStatus === "typesetting") updates.copyediting_completed_at = new Date().toISOString();
  if (targetStatus === "proof_ready") { updates.typesetting_completed_at = new Date().toISOString(); updates.proof_sent_at = new Date().toISOString(); }
  if (targetStatus === "final_approval") updates.proof_approved_at = new Date().toISOString();
  if (targetStatus === "ready") updates.final_approved_at = new Date().toISOString();

  let record: unknown;
  if (prod) {
    const { data, error } = await admin.from("production_records").update(updates as never).eq("article_id", articleId).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    record = data;
  } else {
    // Create production record if article exists but record missing (e.g. accepted manuscript just created article)
    const { data: article } = await admin.from("articles").select("id").eq("id", articleId).single();
    if (!article) return NextResponse.json({ error: "Article not found (production_records.article_id)" }, { status: 404 });
    const { data, error } = await admin.from("production_records").insert({ article_id: articleId, status: targetStatus, notes: notes ?? null, assigned_copyeditor_id: assignedCopyeditorId ?? null, assigned_production_editor_id: assignedProductionEditorId ?? null } as never).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    record = data;
  }

  // Cloudinary file uploads for proof/published assets — we store secure_url in article_metadata
  if (proofUrl || publishedUrl) {
    const { data: meta } = await admin.from("article_metadata").select("*").eq("article_id", articleId).maybeSingle();
    const metaUpdates: Record<string, unknown> = {};
    if (proofUrl) metaUpdates.pdf_path = proofUrl; // proof can reuse pdf_path or store in metadata json
    if (publishedUrl) metaUpdates.pdf_path = publishedUrl;
    // also store in metadata jsonb
    const existingMeta = (meta as { metadata: Record<string, unknown> } | null)?.metadata ?? {};
    const newMeta = { ...existingMeta, ...(proofUrl ? { proof_url: proofUrl } : {}), ...(publishedUrl ? { published_pdf_url: publishedUrl } : {}) };
    metaUpdates.metadata = newMeta;
    if (meta) {
      await admin.from("article_metadata").update(metaUpdates as never).eq("article_id", articleId);
    } else {
      await admin.from("article_metadata").insert({ article_id: articleId, pdf_path: (metaUpdates.pdf_path as string) ?? null, metadata: newMeta } as never);
    }
  }

  // Also update manuscript status if linked via articles.manuscript_id for visibility
  const { data: articleRow } = await admin.from("articles").select("manuscript_id, journal_id").eq("id", articleId).single();
  if (articleRow) {
    const mId = (articleRow as { manuscript_id: string }).manuscript_id;
    const manuscriptStatusMap: Record<ProdStatus, string> = {
      not_started: "accepted",
      copyediting: "copyediting",
      typesetting: "typesetting",
      proof_ready: "author_proof",
      author_review: "author_proof",
      corrections_requested: "author_proof",
      final_approval: "production_approval",
      ready: "ready_to_publish",
      published: "published",
    };
    const ms = manuscriptStatusMap[targetStatus] as never;
        if (ms) await admin.from("manuscripts").update({ status: ms } as never).eq("id", mId);
    if (targetStatus === "published") {
      await admin.from("articles").update({ publication_status: "published" as never, published_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never).eq("id", articleId);
    }
    await admin.from("workflow_events").insert({ manuscript_id: mId, from_status: current as never, to_status: manuscriptStatusMap[targetStatus] as never, event_type: "production_status", description: `Production ${current} → ${targetStatus}` } as never);
    await admin.from("audit_logs").insert({ actor_id: user.id, journal_id: (articleRow as { journal_id: string }).journal_id, manuscript_id: mId, action: "production.status_changed", entity_type: "production_record", entity_id: (record as { id: string }).id, new_data: { from: current, to: targetStatus } } as never);
    if (targetStatus === "proof_ready" || targetStatus === "author_review") {
      const { data: m } = await admin.from("manuscripts").select("submitted_by, journal_id").eq("id", mId).single();
      const authorId = (m as { submitted_by: string | null } | null)?.submitted_by;
      if (authorId) await admin.from("notifications").insert({ user_id: authorId, journal_id: (articleRow as { journal_id: string }).journal_id, manuscript_id: mId, type: "proof_ready", title: "Proof ready for review", message: "Your article proof is ready. Please review and approve or request corrections.", action_url: `/author/submissions/${mId}` } as never);
    }
  }

  await admin.from("system_jobs").insert({ job_type: "production_transition", entity_type: "article", entity_id: articleId, status: "completed", payload: { from: current, to: targetStatus } } as never);

  return NextResponse.json({ data: record, message: `Production status updated ${current} → ${targetStatus}` });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ articleId: string }> }) {
  const { articleId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("production_records").select("*, articles!inner(title, article_number, journal_id)").eq("article_id", articleId).single();
  if (error || !data) return NextResponse.json({ error: "Production record not found" }, { status: 404 });
  return NextResponse.json({ data });
}
