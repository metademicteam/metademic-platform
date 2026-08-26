import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const inviteSchema = z.object({
  reviewerProfileId: z.string().uuid(),
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
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Validation failed" }, { status: 400 });
  const { reviewerProfileId } = parsed.data;

  // Fetch manuscript and journal
  const { data: manuscript } = await supabase.from("manuscripts").select("id, journal_id, title, current_review_round, status").eq("id", id).single();
  if (!manuscript) return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  const m = manuscript as { id: string; journal_id: string; title: string; current_review_round: number; status: string };

  // Editor check
  const { data: membership } = await supabase.from("journal_members").select("role, is_active").eq("user_id", user.id).eq("journal_id", m.journal_id).eq("is_active", true);
  const hasEditor = (membership ?? []).some((r) => ["editor", "managing_editor", "editor_in_chief", "section_editor", "journal_manager", "journal_admin", "super_admin"].includes((r as { role: string }).role));
  if (!hasEditor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Fetch reviewer profile + journal settings
  const [{ data: reviewerProfile }, { data: journal }] = await Promise.all([
    supabase.from("reviewer_profiles").select("id, user_id, is_available, max_active_reviews").eq("id", reviewerProfileId).single(),
    supabase.from("journals").select("reviewers_required, review_deadline_days").eq("id", m.journal_id).single(),
  ]);
  if (!reviewerProfile) return NextResponse.json({ error: "Reviewer not found" }, { status: 404 });
  const rp = reviewerProfile as { id: string; user_id: string; is_available: boolean; max_active_reviews: number };
  if (!rp.is_available) return NextResponse.json({ error: "Reviewer is not available" }, { status: 400 });
  const j = journal as { reviewers_required: number; review_deadline_days: number } | null;
  const required = j?.reviewers_required ?? 3;
  const deadlineDays = j?.review_deadline_days ?? 14;

  // Check workload
  const { count: activeCount } = await supabase.from("review_assignments").select("id", { count: "exact", head: true }).eq("reviewer_id", reviewerProfileId).in("status", ["invited", "accepted", "reviewing"] as never);
  if ((activeCount ?? 0) >= rp.max_active_reviews) return NextResponse.json({ error: "Reviewer at max active reviews" }, { status: 400 });

  // Ensure review round exists — create if needed, increment if current round is 0
  let roundId: string;
  let roundNumber = m.current_review_round;
  if (roundNumber === 0) roundNumber = 1;
  const { data: existingRound } = await supabase.from("review_rounds").select("id, round_number").eq("manuscript_id", id).eq("round_number", roundNumber).maybeSingle();
  if (existingRound) {
    roundId = (existingRound as { id: string }).id;
  } else {
    const { data: newRound, error: roundErr } = await supabase
      .from("review_rounds")
      .insert({ manuscript_id: id, round_number: roundNumber, required_reviewers: required } as never)
      .select("id")
      .single();
    if (roundErr || !newRound) return NextResponse.json({ error: roundErr?.message ?? "Failed to create review round" }, { status: 500 });
    roundId = (newRound as { id: string }).id;
    await supabase.from("manuscripts").update({ current_review_round: roundNumber, status: "reviewer_invitation" } as never).eq("id", id);
  }

  // Check duplicate invitation
  const { data: existingInvite } = await supabase.from("reviewer_invitations").select("id").eq("review_round_id", roundId).eq("reviewer_id", reviewerProfileId).maybeSingle();
  if (existingInvite) return NextResponse.json({ error: "Reviewer already invited for this round" }, { status: 409 });

  const deadlineAt = new Date(Date.now() + deadlineDays * 24 * 60 * 60 * 1000).toISOString();
  const expiresAt = deadlineAt;

  // Create invitation + assignment together (invitation drives assignment)
  const { data: invitation, error: invErr } = await supabase
    .from("reviewer_invitations")
    .insert({
      review_round_id: roundId,
      reviewer_id: reviewerProfileId,
      invited_by: user.id,
      invited_at: new Date().toISOString(),
      expires_at: expiresAt,
      status: "invited",
    } as never)
    .select("id")
    .single();
  if (invErr || !invitation) return NextResponse.json({ error: invErr?.message ?? "Failed to create invitation" }, { status: 500 });
  const invitationId = (invitation as { id: string }).id;

  const { data: assignment, error: assignErr } = await supabase
    .from("review_assignments")
    .insert({
      review_round_id: roundId,
      reviewer_id: reviewerProfileId,
      invitation_id: invitationId,
      status: "invited",
      invited_at: new Date().toISOString(),
      deadline_at: deadlineAt,
      is_anonymous: true,
    } as never)
    .select("id")
    .single();
  if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 });

  // Update manuscript status to under_review if enough invites sent? Keep as reviewer_invitation until at least one accepts
  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    journal_id: m.journal_id,
    manuscript_id: id,
    action: "reviewer_invited",
    entity_type: "review_assignment",
    entity_id: (assignment as { id: string }).id,
    new_data: { reviewer_id: reviewerProfileId, round: roundNumber } as never,
  } as never);

  // Notify reviewer
  await supabase.from("notifications").insert({
    user_id: rp.user_id,
    manuscript_id: id,
    type: "reviewer_invited",
    title: "Review invitation",
    message: `You are invited to review "${m.title}"`,
    action_url: `/reviewer/invitations`,
    metadata: { review_round_id: roundId, deadline_at: deadlineAt } as never,
  } as never);

  return NextResponse.json({ data: { invitationId, assignmentId: (assignment as { id: string }).id, roundId, deadlineAt } }, { status: 201 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: manuscript } = await supabase.from("manuscripts").select("journal_id").eq("id", id).single();
  if (!manuscript) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const m = manuscript as { journal_id: string };
  const { data: membership } = await supabase.from("journal_members").select("role").eq("user_id", user.id).eq("journal_id", m.journal_id).eq("is_active", true);
  const hasAccess = (membership ?? []).some((r) => ["editor", "managing_editor", "editor_in_chief", "section_editor", "journal_manager", "journal_admin", "super_admin"].includes((r as { role: string }).role));
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: rounds } = await supabase.from("review_rounds").select("id, round_number").eq("manuscript_id", id).order("round_number");
  if (!rounds || rounds.length === 0) return NextResponse.json({ data: [] });
  const roundIds = (rounds as Array<{ id: string }>).map((r) => r.id);
  const { data: assignments } = await supabase.from("review_assignments").select("*, reviewer_profiles!inner(id, user_id, expertise, profiles!inner(display_name, email))").in("review_round_id", roundIds);
  return NextResponse.json({ data: assignments ?? [] });
}
