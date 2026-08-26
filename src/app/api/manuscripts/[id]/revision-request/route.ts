import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { enqueueEmailJob, enqueueJob } from "@/lib/jobs";

const schema = z.object({
  decisionId: z.string().uuid().optional().nullable(),
  revisionType: z.enum(["minor_revision", "major_revision"]).optional(),
  deadlineAt: z.string().optional().nullable(), // ISO
  instructions: z.string().max(5000).optional().nullable(),
  deadlineDays: z.number().int().min(1).max(90).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: manuscriptId } = await params;
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
  const { decisionId, deadlineAt, instructions, deadlineDays, revisionType } = parsed.data;

  // Fetch manuscript
  const { data: manuscript } = await supabase.from("manuscripts").select("id, journal_id, status, title, manuscript_number, submitted_by, corresponding_author_id, current_review_round").eq("id", manuscriptId).single();
  if (!manuscript) return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  const m = manuscript as {
    id: string;
    journal_id: string;
    status: string;
    title: string;
    manuscript_number: string;
    submitted_by: string | null;
    corresponding_author_id: string | null;
    current_review_round: number;
  };

  // Permission: editor role
  const { data: membership } = await supabase.from("journal_members").select("role, is_active").eq("user_id", user.id).eq("journal_id", m.journal_id).eq("is_active", true);
  const hasEditor = (membership ?? []).some((r: { role: string }) => ["editor", "section_editor", "editor_in_chief", "managing_editor", "journal_manager", "journal_admin", "super_admin"].includes(r.role));
  if (!hasEditor) return NextResponse.json({ error: "Forbidden: editor role required" }, { status: 403 });

  // Determine revision round: increment
  const revisionRound = (m.current_review_round ?? 0) + 1;

  // Compute deadline
  let dueAt: string | null = deadlineAt ?? null;
  if (!dueAt) {
    const days = deadlineDays ?? (revisionType === "major_revision" ? 28 : 14);
    const d = new Date();
    d.setDate(d.getDate() + days);
    dueAt = d.toISOString();
  }

  // Validate deadline is future
  if (dueAt && new Date(dueAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Deadline must be in the future" }, { status: 400 });
  }

  // Insert revision_requests
  const { data: rr, error: rrErr } = await supabase
    .from("revision_requests")
    .insert({
      manuscript_id: manuscriptId,
      decision_id: decisionId ?? null,
      revision_round: revisionRound,
      due_at: dueAt,
      instructions: instructions ?? null,
    } as never)
    .select("*")
    .single();

  if (rrErr || !rr) return NextResponse.json({ error: rrErr?.message ?? "Failed to create revision request" }, { status: 500 });

  // Update manuscript status to minor_revision or major_revision based on decision or explicit type
  // Prefer explicit revisionType, else infer from last decision
  let targetStatus: string | null = revisionType ?? null;
  if (!targetStatus && decisionId) {
    const { data: dec } = await supabase.from("editorial_decisions").select("decision").eq("id", decisionId).maybeSingle();
    const decType = (dec as { decision: string } | null)?.decision;
    if (decType === "major_revision") targetStatus = "major_revision";
    else if (decType === "minor_revision") targetStatus = "minor_revision";
  }
  // Fallback default
  targetStatus = targetStatus ?? "minor_revision";

  await supabase.from("manuscripts").update({ status: targetStatus as never } as never).eq("id", manuscriptId);

  // Notify author
  const authorId = m.corresponding_author_id ?? m.submitted_by;
  if (authorId) {
    await supabase.from("notifications").insert({
      user_id: authorId,
      journal_id: m.journal_id,
      manuscript_id: manuscriptId,
      type: "revision_requested",
      title: `Revision requested — ${m.manuscript_number}`,
      message: `Your manuscript "${m.title}" requires ${targetStatus === "major_revision" ? "major" : "minor"} revisions. Deadline: ${dueAt ? new Date(dueAt).toLocaleDateString() : "—"}. ${instructions ? instructions.slice(0, 120) : ""}`,
      action_url: `/author/submissions/${manuscriptId}/revision`,
    } as never);

    // Email job
    const { data: profile } = await supabase.from("profiles").select("email, first_name, last_name").eq("id", authorId).maybeSingle();
    const email = (profile as { email: string | null } | null)?.email;
    const name = [((profile as { first_name: string | null } | null)?.first_name), ((profile as { last_name: string | null } | null)?.last_name)].filter(Boolean).join(" ") || "Author";
    const { data: journalRow } = await supabase.from("journals").select("name").eq("id", m.journal_id).single();
    const journalName = (journalRow as { name: string } | null)?.name ?? "Journal";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    if (email) {
      await enqueueEmailJob(supabase as never, {
        templateName: targetStatus === "major_revision" ? "decision_major_revision" : "decision_minor_revision",
        recipientEmail: email,
        recipientUserId: authorId,
        manuscriptId,
        context: { recipientName: name, journalName, manuscriptNumber: m.manuscript_number, manuscriptTitle: m.title, decisionReason: instructions ?? "", deadlineAt: dueAt ?? "", actionUrl: `${appUrl}/author/submissions/${manuscriptId}/revision` },
      });
      await supabase.from("email_logs").insert({ recipient_email: email, template_name: "revision_requested", subject: `Revision requested — ${m.manuscript_number}`, status: "queued", manuscript_id: manuscriptId, user_id: authorId } as never);
    }
    await enqueueJob(supabase as never, { jobType: "send_email", entityType: "revision_request", entityId: (rr as { id: string }).id, payload: { manuscriptId, authorId, revisionRound, dueAt } });
  }

  // Workflow + audit
  await supabase.from("workflow_events").insert({
    manuscript_id: manuscriptId,
    actor_id: user.id,
    from_status: m.status as never,
    to_status: targetStatus as never,
    event_type: "revision.requested",
    description: instructions?.slice(0, 500) ?? `Revision round ${revisionRound} requested`,
    metadata: { revision_request_id: (rr as { id: string }).id, revisionRound, dueAt } as never,
  } as never);

  await writeAuditLog(supabase as never, {
    actorId: user.id,
    journalId: m.journal_id,
    manuscriptId,
    action: "revision.requested",
    entityType: "revision_request",
    entityId: (rr as { id: string }).id,
    newData: rr as Record<string, unknown>,
    metadata: { instructions, dueAt },
  });

  return NextResponse.json({ data: rr }, { status: 201 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: manuscriptId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.from("revision_requests").select("*").eq("manuscript_id", manuscriptId).order("revision_round", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
