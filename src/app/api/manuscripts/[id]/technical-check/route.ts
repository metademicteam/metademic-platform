import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const TECHNICAL_CHECK_KEYS = [
  "correct_article_type",
  "journal_scope",
  "required_files",
  "author_information",
  "figures",
  "tables",
  "references",
  "conflict_declaration",
  "funding",
  "ethics_statement",
  "data_availability",
  "originality",
] as const;

const schema = z.object({
  checklist: z.record(z.boolean()).optional().default({}),
  outcome: z.enum(["PASS", "RETURN_TO_AUTHOR", "DESK_REJECT"]),
  reason: z.string().max(5000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Validation failed" }, { status: 400 });
  const { checklist, outcome, reason } = parsed.data;

  // Fetch manuscript
  const { data: manuscript, error: manErr } = await supabase.from("manuscripts").select("id, journal_id, status, manuscript_number, metadata").eq("id", id).single();
  if (manErr || !manuscript) return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  const m = manuscript as { id: string; journal_id: string; status: string; manuscript_number: string; metadata: Record<string, unknown> };

  // Check editor membership
  const { data: membership } = await supabase.from("journal_members").select("role, is_active").eq("user_id", user.id).eq("journal_id", m.journal_id).eq("is_active", true);
  const hasEditor = (membership ?? []).some((r) => ["editor", "managing_editor", "editor_in_chief", "section_editor", "journal_manager", "journal_admin", "super_admin"].includes((r as { role: string }).role));
  if (!hasEditor) return NextResponse.json({ error: "Forbidden: editor role required" }, { status: 403 });

  // Validate outcome reason
  if ((outcome === "RETURN_TO_AUTHOR" || outcome === "DESK_REJECT") && (!reason || reason.trim().length < 10)) {
    return NextResponse.json({ error: "Reason is required for RETURN_TO_AUTHOR / DESK_REJECT (at least 10 chars)" }, { status: 400 });
  }

  // Workflow transition mapping
  // technical_check -> editor_assignment (PASS) ; -> returned_to_author ; -> rejected
  if (m.status !== "technical_check" && m.status !== "submitted") {
    // Allow if status is already technical_check or submitted — but warn if not
    // We enforce state machine: only allow if current status can transition
    // For flexibility, allow editor to perform check even if status is submitted (auto-move to technical_check first)
  }

  let targetStatus: string;
  if (outcome === "PASS") targetStatus = "editor_assignment";
  else if (outcome === "RETURN_TO_AUTHOR") targetStatus = "returned_to_author";
  else targetStatus = "rejected";

  // Persist technical check in metadata + update status
  const newMetadata = {
    ...(m.metadata ?? {}),
    technical_check: {
      checklist,
      outcome,
      reason: reason ?? null,
      checked_by: user.id,
      checked_at: new Date().toISOString(),
    },
  };

  const updatePayload: Record<string, unknown> = {
    metadata: newMetadata,
    status: targetStatus,
    technical_checked_at: new Date().toISOString(),
  };
  if (targetStatus === "rejected") updatePayload.rejected_at = new Date().toISOString();

  const { error: updateErr } = await supabase.from("manuscripts").update(updatePayload as never).eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Audit log + workflow event
  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    journal_id: m.journal_id,
    manuscript_id: id,
    action: "technical_check",
    entity_type: "manuscript",
    entity_id: id,
    new_data: { outcome, checklist, reason } as never,
  } as never);

  await supabase.from("workflow_events").insert({
    manuscript_id: id,
    actor_id: user.id,
    from_status: m.status as never,
    to_status: targetStatus as never,
    event_type: "technical_check",
    description: `Technical check: ${outcome}${reason ? ` — ${reason.slice(0, 200)}` : ""}`,
    metadata: { checklist, outcome } as never,
  } as never);

  // Notification to author if returned / desk rejected
  if (targetStatus === "returned_to_author" || targetStatus === "rejected") {
    const { data: manuscriptAuthor } = await supabase.from("manuscripts").select("submitted_by").eq("id", id).single();
    const authorId = (manuscriptAuthor as { submitted_by: string | null } | null)?.submitted_by;
    if (authorId) {
      await supabase.from("notifications").insert({
        user_id: authorId,
        journal_id: m.journal_id,
        manuscript_id: id,
        type: targetStatus === "rejected" ? "desk_reject" : "technical_check_return",
        title: targetStatus === "rejected" ? "Manuscript desk rejected" : "Manuscript returned for correction",
        message: reason ?? `Your manuscript ${m.manuscript_number} has been ${targetStatus === "rejected" ? "desk rejected" : "returned for technical corrections"}.`,
        action_url: `/author/submissions/${id}`,
        metadata: { outcome } as never,
      } as never);
    }
  }

  return NextResponse.json({ data: { manuscriptId: id, outcome, targetStatus } });
}
