import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { calculateApc } from "@/lib/services/apc-service";
import { writeAuditLog } from "@/lib/audit";
import { enqueueJob, enqueueEmailJob, enqueueAcceptanceLetter } from "@/lib/jobs";
import { processPendingEmails } from "@/lib/email/send";

const schema = z.object({
  editorReason: z.string().max(5000).optional(),
  nextSteps: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: manuscriptId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Validation failed" }, { status: 400 });
  const { editorReason, nextSteps } = parsed.data;

  // Fetch manuscript + journal
  const { data: manuscript, error: mErr } = await supabase.from("manuscripts").select("id, journal_id, status, title, manuscript_number, submitted_by, corresponding_author_id, accepted_at").eq("id", manuscriptId).single();
  if (mErr || !manuscript) return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  const m = manuscript as {
    id: string;
    journal_id: string;
    status: string;
    title: string;
    manuscript_number: string;
    submitted_by: string | null;
    corresponding_author_id: string | null;
    accepted_at: string | null;
  };

  // Permission: editor/managing_editor/EIC/journal_admin/super_admin
  const { data: membership } = await supabase.from("journal_members").select("role, is_active").eq("user_id", user.id).eq("journal_id", m.journal_id).eq("is_active", true);
  const allowedRoles = ["editor", "section_editor", "editor_in_chief", "managing_editor", "journal_manager", "journal_admin", "super_admin"];
  const hasEditor = (membership ?? []).some((r: { role: string }) => allowedRoles.includes(r.role));
  if (!hasEditor) return NextResponse.json({ error: "Forbidden: editor role required" }, { status: 403 });

  // Validate transition: must be in decision_pending / reviews_complete / revision_submitted / re_review / editorial_screening → accepted
  // Accept from states that are realistically accept-eligible; block published->draft etc.
  const acceptEligible = ["decision_pending", "reviews_complete", "accepted", "re_review", "editorial_screening", "revision_submitted", "under_review"];
  // Allow acceptance even if already accepted (idempotent check)
  if (m.status === "accepted" && m.accepted_at) {
    // Return existing acceptance
    return NextResponse.json({ data: { manuscriptId, alreadyAccepted: true, acceptedAt: m.accepted_at } });
  }
  if (!acceptEligible.includes(m.status) && !["minor_revision", "major_revision"].includes(m.status)) {
    // Still allow from decision_pending etc but also allow from minor/major revision flows where editor may accept directly
    // Strictly we require state machine check: we only block terminal states
    if (["rejected", "withdrawn", "published", "retracted", "draft", "submitted", "technical_check", "returned_to_author", "editor_assignment", "reviewer_invitation"].includes(m.status)) {
      return NextResponse.json({ error: `Cannot accept manuscript in status "${m.status}"` }, { status: 409 });
    }
  }

  const now = new Date().toISOString();

  // 1) Resolve current review round + system recommendation
  let reviewRoundId: string | null = null;
  let systemRecommendation: string | null = null;
  const counts = { accept: 0, minorRevision: 0, majorRevision: 0, reject: 0 };
  try {
    const { data: round } = await supabase.from("review_rounds").select("id, round_number").eq("manuscript_id", manuscriptId).order("round_number", { ascending: false }).limit(1).maybeSingle();
    if (round) {
      reviewRoundId = (round as { id: string }).id;
      // Fetch counts
      const { data: assignments } = await supabase.from("review_assignments").select("id").eq("review_round_id", reviewRoundId).eq("status", "completed");
      const ids = ((assignments ?? []) as { id: string }[]).map((a) => a.id);
      if (ids.length) {
        const { data: reports } = await supabase.from("review_reports").select("recommendation").in("review_assignment_id", ids);
        for (const r of (reports ?? []) as Array<{ recommendation: string }>) {
          if (r.recommendation === "accept") counts.accept++;
          else if (r.recommendation === "minor_revision") counts.minorRevision++;
          else if (r.recommendation === "major_revision") counts.majorRevision++;
          else if (r.recommendation === "reject") counts.reject++;
        }
        // Calculate system recommendation same as SQL function
        if (counts.reject >= 2) systemRecommendation = "reject";
        else if (counts.accept >= 2) systemRecommendation = "accept";
        else if (counts.majorRevision >= 2) systemRecommendation = "major_revision";
        else if (counts.accept + counts.minorRevision >= 2) systemRecommendation = "minor_revision";
        else systemRecommendation = "no_recommendation";
      }
    }
  } catch {
    // best effort
  }

  // 2) Insert editorial decision type accept
  const { data: decision, error: decErr } = await supabase
    .from("editorial_decisions")
    .insert({
      manuscript_id: manuscriptId,
      review_round_id: reviewRoundId,
      editor_id: user.id,
      decision: "accept" as never,
      system_recommendation: systemRecommendation as never,
      accept_votes: counts.accept,
      minor_revision_votes: counts.minorRevision,
      major_revision_votes: counts.majorRevision,
      reject_votes: counts.reject,
      editor_reason: editorReason ?? null,
      override_system_recommendation: systemRecommendation ? systemRecommendation !== "accept" : false,
    } as never)
    .select("*")
    .single();

  if (decErr) return NextResponse.json({ error: `Failed to create editorial decision: ${decErr.message}` }, { status: 500 });

  // 3) Update manuscript accepted_at + status
  const { error: updErr } = await supabase.from("manuscripts").update({ status: "accepted", accepted_at: now } as never).eq("id", manuscriptId);
  if (updErr) return NextResponse.json({ error: `Failed to update manuscript: ${updErr.message}` }, { status: 500 });

  // 4) Calculate APC — resolve journal APC config
  let apcRow: unknown = null;
  try {
    const { data: journal } = await supabase.from("journals").select("default_apc, currency, apc_enabled, settings").eq("id", m.journal_id).single();
    const j = journal as { default_apc: number; currency: string; apc_enabled: boolean; settings: Record<string, unknown> } | null;
    const baseAmount = j?.apc_enabled ? Number(j?.default_apc ?? 0) : 0;
    const taxRate = typeof j?.settings?.tax_rate === "number" ? (j.settings.tax_rate as number) : 0;
    const currency = (j?.currency ?? "USD").toUpperCase();
    const calc = calculateApc({ baseAmount, taxRate, currency });

    // Upsert apcs row (manual, since we need server client)
    const { data: existing } = await supabase.from("apcs").select("id").eq("manuscript_id", manuscriptId).maybeSingle();
    if (existing) {
      const { data } = await supabase.from("apcs").update({ base_amount: calc.baseAmount, discount_amount: calc.discountAmount, waiver_amount: calc.waiverAmount, tax_amount: calc.taxAmount, total_amount: calc.totalAmount, currency: calc.currency, status: calc.totalAmount === 0 ? "not_required" as never : "calculated" as never, calculated_at: now } as never).eq("id", (existing as { id: string }).id).select("*").single();
      apcRow = data;
    } else {
      const { data } = await supabase.from("apcs").insert({ manuscript_id: manuscriptId, base_amount: calc.baseAmount, discount_amount: calc.discountAmount, waiver_amount: calc.waiverAmount, tax_amount: calc.taxAmount, total_amount: calc.totalAmount, currency: calc.currency, status: calc.totalAmount === 0 ? "not_required" as never : "calculated" as never, calculated_at: now } as never).select("*").single();
      apcRow = data;
    }

    // Enqueue jobs for APC
    if (calc.totalAmount > 0) {
      await enqueueJob(supabase as never, { jobType: "calculate_apc", entityType: "manuscript", entityId: manuscriptId, payload: { baseAmount, totalAmount: calc.totalAmount, currency } });
      const apcId = (apcRow as { id: string } | null)?.id;
      if (apcId) await enqueueJob(supabase as never, { jobType: "generate_invoice", entityType: "apc", entityId: apcId, payload: { manuscriptId } });
    }
  } catch (e) {
    console.error("[accept] APC calc failed:", e);
  }

  // 5) Notifications + email jobs for corresponding author
  try {
    const authorId = m.corresponding_author_id ?? m.submitted_by;
    // Fetch profile for email
    let recipientEmail: string | null = null;
    if (authorId) {
      const { data: profile } = await supabase.from("profiles").select("email, first_name, last_name").eq("id", authorId).maybeSingle();
      const p = profile as { email: string | null; first_name: string | null; last_name: string | null } | null;
      recipientEmail = p?.email ?? null;
      const recipientName = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Author";
      // Journal name
      const { data: journalRow } = await supabase.from("journals").select("name").eq("id", m.journal_id).single();
      const journalName = (journalRow as { name: string } | null)?.name ?? "Journal";

      // In-app notification
      await supabase.from("notifications").insert({
        user_id: authorId,
        journal_id: m.journal_id,
        manuscript_id: manuscriptId,
        type: "decision_accept",
        title: "Manuscript accepted",
        message: `"${m.title}" (${m.manuscript_number}) has been accepted for publication.${editorReason ? ` — ${editorReason.slice(0, 140)}` : ""}`,
        action_url: `/author/submissions/${manuscriptId}`,
      } as never);

      // Acceptance letter notification (separate)
      await supabase.from("notifications").insert({
        user_id: authorId,
        journal_id: m.journal_id,
        manuscript_id: manuscriptId,
        type: "acceptance_letter",
        title: "Acceptance letter available",
        message: `Your acceptance letter for "${m.title}" is available. Next steps: APC/production.`,
        action_url: `/author/submissions/${manuscriptId}`,
      } as never);

      // Email jobs (async)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      const actionUrl = `${appUrl}/author/submissions/${manuscriptId}`;
      if (recipientEmail) {
        await enqueueEmailJob(supabase as never, {
          templateName: "decision_accept",
          recipientEmail,
          recipientUserId: authorId,
          manuscriptId,
          context: { recipientName, journalName, manuscriptNumber: m.manuscript_number, manuscriptTitle: m.title, decisionReason: editorReason ?? "", actionUrl },
        });
        await enqueueEmailJob(supabase as never, {
          templateName: "acceptance_letter",
          recipientEmail,
          recipientUserId: authorId,
          manuscriptId,
          context: { recipientName, journalName, manuscriptNumber: m.manuscript_number, manuscriptTitle: m.title, editorName: user.email ?? undefined, actionUrl, acceptanceDate: now, nextSteps: nextSteps ?? "" },
        });
        // Also queue email_logs entries as queued
        await supabase.from("email_logs").insert([
          { recipient_email: recipientEmail, template_name: "decision_accept", subject: `Decision: Accepted — ${m.manuscript_number}`, status: "queued", manuscript_id: manuscriptId, user_id: authorId } as never,
          { recipient_email: recipientEmail, template_name: "acceptance_letter", subject: `Acceptance letter — ${m.manuscript_number}`, status: "queued", manuscript_id: manuscriptId, user_id: authorId } as never,
        ] as never);
      }

      // System jobs for acceptance letter generation (PDF) + overall acceptance
      await enqueueAcceptanceLetter(supabase as never, manuscriptId, { journalName, manuscriptNumber: m.manuscript_number, title: m.title, authorName: recipientName });
    }
  } catch (e) {
    console.error("[accept] notification/email failed:", e);
  }

  // Fire-and-forget: drain the queued email jobs so the author gets the
  // acceptance email immediately. Best-effort; failures are logged by the worker.
  void processPendingEmails(supabase as never).catch((e) => {
    console.error("[accept] email worker drain failed:", e);
  });

  // 6) Workflow event + audit
  await supabase.from("workflow_events").insert({
    manuscript_id: manuscriptId,
    actor_id: user.id,
    from_status: m.status as never,
    to_status: "accepted" as never,
    event_type: "manuscript.accepted",
    description: editorReason ? `Accepted: ${editorReason.slice(0, 500)}` : "Manuscript accepted for publication",
    metadata: { decision_id: (decision as { id: string }).id, system_recommendation: systemRecommendation, apc: apcRow ? (apcRow as { total_amount: number }).total_amount : null } as never,
  } as never);

  await writeAuditLog(supabase as never, {
    actorId: user.id,
    journalId: m.journal_id,
    manuscriptId,
    action: "manuscript.accepted",
    entityType: "manuscript",
    entityId: manuscriptId,
    oldData: { status: m.status } as Record<string, unknown>,
    newData: { status: "accepted", accepted_at: now, decision_id: (decision as { id: string }).id } as Record<string, unknown>,
    metadata: { editorReason, nextSteps },
  });

  return NextResponse.json({ data: { manuscriptId, decision, acceptedAt: now, apc: apcRow } }, { status: 200 });
}
