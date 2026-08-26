export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReviewerSelector } from "@/components/editor/ReviewerSelector";
import { detectConflicts } from "@/lib/services/conflict-detection";

export default async function ManuscriptReviewersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: manuscript } = await supabase
    .from("manuscripts")
    .select("id, journal_id, title, journals(reviewers_required, review_blind_type), current_review_round")
    .eq("id", id)
    .single();
  if (!manuscript) notFound();
  const m = manuscript as unknown as { id: string; journal_id: string; title: string; journals: { reviewers_required: number; review_blind_type: string } | null; current_review_round: number };
  const reviewersRequired = m.journals?.reviewers_required ?? 3;

  // Check editor access
  const { data: membership } = await supabase.from("journal_members").select("role, is_active").eq("user_id", user.id).eq("journal_id", m.journal_id).eq("is_active", true);
  const hasAccess = (membership ?? []).some((r) => ["editor", "managing_editor", "editor_in_chief", "section_editor", "journal_manager", "journal_admin", "super_admin"].includes((r as { role: string }).role));
  if (!hasAccess) redirect("/auth/login?error=unauthorized");

  // Fetch eligible reviewers
  const { data: reviewers } = await supabase.from("reviewer_profiles").select("id, user_id, expertise, keywords, is_available, max_active_reviews, completed_reviews, overdue_reviews, profiles!inner(display_name, email, first_name, last_name), institutions(name), user_id").limit(100);

  // Active counts
  const reviewerIds = (reviewers ?? []).map((r) => (r as { id: string }).id);
  const activeCounts: Record<string, number> = {};
  if (reviewerIds.length) {
    const { data: assignments } = await supabase.from("review_assignments").select("reviewer_id, status").in("reviewer_id", reviewerIds).in("status", ["invited", "accepted", "reviewing"] as never);
    for (const a of (assignments ?? []) as Array<{ reviewer_id: string }>) activeCounts[a.reviewer_id] = (activeCounts[a.reviewer_id] ?? 0) + 1;
  }

  // Fetch manuscript conflict context
  const [{ data: authors }, { data: excluded }, { data: suggested }] = await Promise.all([
    supabase.from("manuscript_authors").select("user_id, email, institution_name_snapshot, institution_id").eq("manuscript_id", id),
    supabase.from("manuscript_excluded_reviewers").select("reviewer_email, reviewer_name, reason").eq("manuscript_id", id),
    supabase.from("manuscript_reviewer_suggestions").select("reviewer_email, reviewer_name").eq("manuscript_id", id),
  ]);

  const context = {
    manuscriptId: id,
    excludedReviewers: (excluded ?? []) as Array<{ reviewer_email?: string | null; reviewer_name?: string | null; reason?: string | null }>,
    suggestedReviewers: (suggested ?? []) as Array<{ reviewer_email?: string | null; reviewer_name?: string | null }>,
    authors: (authors ?? []).map((a) => ({ id: (a as { user_id: string | null }).user_id, email: (a as { email: string | null }).email, institutionName: (a as { institution_name_snapshot: string | null }).institution_name_snapshot, institutionId: (a as { institution_id: string | null }).institution_id })),
  };

  // Build candidates
  const candidates = (reviewers ?? []).map((r) => {
    const rr = r as unknown as {
      id: string;
      user_id: string;
      expertise: string[];
      keywords: string[];
      is_available: boolean;
      max_active_reviews: number;
      completed_reviews: number;
      overdue_reviews: number;
      profiles: { display_name: string | null; email: string | null; first_name: string | null; last_name: string | null } | null;
      institutions: { name: string } | null;
    };
    const conflicts = detectConflicts(
      {
        userId: rr.user_id,
        email: rr.profiles?.email ?? null,
        institutionName: rr.institutions?.name ?? null,
      },
      context
    );
    return {
      id: rr.id,
      userId: rr.user_id,
      displayName: rr.profiles?.display_name ?? (`${rr.profiles?.first_name ?? ""} ${rr.profiles?.last_name ?? ""}`.trim() || rr.profiles?.email || rr.id.slice(0, 8)),
      email: rr.profiles?.email ?? null,
      institution: rr.institutions?.name ?? null,
      expertise: rr.expertise ?? [],
      keywords: rr.keywords ?? [],
      isAvailable: rr.is_available,
      activeReviews: activeCounts[rr.id] ?? 0,
      maxActiveReviews: rr.max_active_reviews,
      completedReviews: rr.completed_reviews,
      overdueReviews: rr.overdue_reviews,
      conflicts: conflicts.map((c) => ({ type: c.type, message: c.message, severity: c.severity, details: c.details })),
    };
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1280px] mx-auto w-full">
      <div className="flex items-center gap-3">
        <Link href={`/editor/manuscripts/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to manuscript
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-semibold">Select Reviewers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manuscript: {m.title} • Required reviewers: <Badge>{reviewersRequired}</Badge> (from journals.reviewers_required)
        </p>
      </div>

      <ReviewerSelector manuscriptId={id} reviewersRequired={reviewersRequired} candidates={candidates} />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Note on Conflicts</CardTitle>
          <CardDescription className="text-xs">Same institution, same email domain, co-authorship, author exclusion/suggestion warnings are displayed. System does not silently block — editor decides.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
