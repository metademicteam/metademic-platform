import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: report } = await supabase.from("review_reports").select("*, review_assignments!inner(reviewer_id, review_round_id)").eq("id", id).single();
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const assignment = (report as { review_assignments: { reviewer_id: string; review_round_id: string } }).review_assignments;
  const { data: profile } = await supabase.from("reviewer_profiles").select("user_id").eq("id", assignment.reviewer_id).single();
  const isOwner = profile && (profile as { user_id: string }).user_id === user.id;

  let isEditor = false;
  if (!isOwner) {
    const { data: round } = await supabase.from("review_rounds").select("manuscript_id").eq("id", assignment.review_round_id).single();
    if (round) {
      const { data: man } = await supabase.from("manuscripts").select("journal_id").eq("id", (round as { manuscript_id: string }).manuscript_id).single();
      if (man) {
        const { data: mem } = await supabase.from("journal_members").select("role").eq("user_id", user.id).eq("journal_id", (man as { journal_id: string }).journal_id).eq("is_active", true);
        isEditor = (mem ?? []).some((r) => ["editor", "managing_editor", "editor_in_chief", "section_editor", "journal_manager", "journal_admin", "super_admin"].includes((r as { role: string }).role));
      }
    }
  }

  if (!isOwner && !isEditor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // For reviewer view, hide confidential_comments_to_editor if not editor
  if (!isEditor && !isOwner) {
    // no-op
  }
  // If owner is reviewer, hide nothing; if editor, show all; if author would not reach here
  // For double-blind, ensure we don't leak author identity — this endpoint doesn't contain author data

  return NextResponse.json({ data: report });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: report } = await supabase.from("review_reports").select("*, review_assignments!inner(reviewer_id, status)").eq("id", id).single();
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = report as { review_assignments: { reviewer_id: string; status: string } };
  const { data: profile } = await supabase.from("reviewer_profiles").select("user_id").eq("id", r.review_assignments.reviewer_id).single();
  if (!profile || (profile as { user_id: string }).user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (r.review_assignments.status === "completed") return NextResponse.json({ error: "Cannot edit completed review" }, { status: 409 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const allowed = ["originality_score", "methodology_score", "literature_score", "results_score", "discussion_score", "writing_score", "significance_score", "comments_to_author", "confidential_comments_to_editor", "recommendation"];
  const payload: Record<string, unknown> = {};
  for (const k of allowed) if (k in (body as Record<string, unknown>)) payload[k] = (body as Record<string, unknown>)[k];

  const { error } = await supabase.from("review_reports").update(payload as never).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: { id, ...payload } });
}
