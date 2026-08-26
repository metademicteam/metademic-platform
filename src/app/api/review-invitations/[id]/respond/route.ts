import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["accept", "decline"]),
  coiConfirmed: z.boolean().optional(),
  confidentialityConfirmed: z.boolean().optional(),
  responsibilityConfirmed: z.boolean().optional(),
  declineReason: z.string().max(2000).optional(),
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
  const { action, coiConfirmed, confidentialityConfirmed, responsibilityConfirmed, declineReason } = parsed.data;

  if (action === "accept" && (!coiConfirmed || !confidentialityConfirmed || !responsibilityConfirmed)) {
    return NextResponse.json({ error: "You must confirm COI, confidentiality, and responsibility before accepting." }, { status: 400 });
  }

  // Fetch invitation + reviewer profile to verify ownership
  const { data: invitation } = await supabase.from("reviewer_invitations").select("id, reviewer_id, review_round_id, status").eq("id", id).single();
  if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  const inv = invitation as { id: string; reviewer_id: string; review_round_id: string; status: string };

  const { data: profile } = await supabase.from("reviewer_profiles").select("id, user_id").eq("id", inv.reviewer_id).single();
  if (!profile) return NextResponse.json({ error: "Reviewer profile not found" }, { status: 404 });
  const prof = profile as { id: string; user_id: string };
  if (prof.user_id !== user.id) {
    // Allow editor to act? No, reviewer must be owner
    return NextResponse.json({ error: "Forbidden: invitation does not belong to you" }, { status: 403 });
  }

  if (inv.status !== "invited") return NextResponse.json({ error: `Invitation already ${inv.status}` }, { status: 409 });

  const newStatus = action === "accept" ? "accepted" : "declined";
  const now = new Date().toISOString();

  const { error: invUpdateErr } = await supabase
    .from("reviewer_invitations")
    .update({ status: newStatus, responded_at: now, decline_reason: action === "decline" ? declineReason ?? null : null } as never)
    .eq("id", id);
  if (invUpdateErr) return NextResponse.json({ error: invUpdateErr.message }, { status: 500 });

  // Update review_assignment
  const { data: assignment } = await supabase.from("review_assignments").select("id, status").eq("invitation_id", id).maybeSingle();
  if (assignment) {
    const ass = assignment as { id: string; status: string };
    await supabase
      .from("review_assignments")
      .update({
        status: newStatus === "accepted" ? "accepted" : "declined",
        accepted_at: action === "accept" ? now : null,
        declined_at: action === "decline" ? now : null,
        // Store confirmations in metadata
        metadata: { coi_confirmed: coiConfirmed, confidentiality_confirmed: confidentialityConfirmed, responsibility_confirmed: responsibilityConfirmed } as never,
      } as never)
      .eq("id", ass.id);
  } else if (action === "accept") {
    // Create assignment if missing (defensive)
    const { data: round } = await supabase.from("review_rounds").select("id").eq("id", inv.review_round_id).single();
    if (round) {
      await supabase.from("review_assignments").insert({
        review_round_id: inv.review_round_id,
        reviewer_id: inv.reviewer_id,
        invitation_id: id,
        status: "accepted",
        accepted_at: now,
        is_anonymous: true,
      } as never);
    }
  }

  // If accepted, move manuscript to under_review if still in invitation stage
  if (action === "accept") {
    const { data: round } = await supabase.from("review_rounds").select("manuscript_id").eq("id", inv.review_round_id).single();
    if (round) {
      const manId = (round as { manuscript_id: string }).manuscript_id;
      const { data: man } = await supabase.from("manuscripts").select("status").eq("id", manId).single();
      if (man && (man as { status: string }).status === "reviewer_invitation") {
        await supabase.from("manuscripts").update({ status: "under_review" } as never).eq("id", manId);
      }
    }
  }

  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    manuscript_id: null,
    action: action === "accept" ? "review_invitation_accepted" : "review_invitation_declined",
    entity_type: "reviewer_invitation",
    entity_id: id,
    new_data: { action, declineReason } as never,
  } as never);

  return NextResponse.json({ data: { invitationId: id, status: newStatus } });
}
