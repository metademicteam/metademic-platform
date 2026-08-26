import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReviewRecommendation } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecommendationCounts {
  accept: number;
  minorRevision: number;
  majorRevision: number;
  reject: number;
  noRecommendation: number;
  totalCompleted: number;
}

// ---------------------------------------------------------------------------
// Recommendation logic — mirrors public.calculate_review_recommendation
// ---------------------------------------------------------------------------

/**
 * Pure function — deterministic, easy to unit test.
 * Mirrors the SQL function `calculate_review_recommendation(p_review_round_id)`.
 *
 * Rules (in order):
 *  1. >=2 rejects → reject
 *  2. >=2 accepts → accept
 *  3. >=2 major revisions → major_revision
 *  4. accept + minor_revision >=2 → minor_revision
 *  5. otherwise → no_recommendation
 */
export function calculateRecommendation(
  counts: Pick<RecommendationCounts, "accept" | "minorRevision" | "majorRevision" | "reject">,
): ReviewRecommendation {
  if (counts.reject >= 2) return "reject";
  if (counts.accept >= 2) return "accept";
  if (counts.majorRevision >= 2) return "major_revision";
  if (counts.accept + counts.minorRevision >= 2) return "minor_revision";
  return "no_recommendation";
}

/**
 * Fetch completed review recommendations for a round and compute the counts + recommendation.
 * Uses Supabase; falls back to `no_recommendation` if no completed reviews yet.
 */
export async function getRecommendationForRound(
  supabase: SupabaseClient,
  reviewRoundId: string,
): Promise<{ counts: RecommendationCounts; recommendation: ReviewRecommendation }> {
  const { data: assignments, error } = await supabase
    .from("review_assignments")
    .select("id, status")
    .eq("review_round_id", reviewRoundId)
    .eq("status", "completed");

  if (error) throw new Error(`Failed to fetch review assignments: ${error.message}`);

  const assignmentIds = ((assignments ?? []) as { id: string }[]).map((a) => a.id);

  if (assignmentIds.length === 0) {
    return {
      counts: { accept: 0, minorRevision: 0, majorRevision: 0, reject: 0, noRecommendation: 0, totalCompleted: 0 },
      recommendation: "no_recommendation",
    };
  }

  const { data: reports, error: reportError } = await supabase
    .from("review_reports")
    .select("recommendation")
    .in("review_assignment_id", assignmentIds);

  if (reportError) throw new Error(`Failed to fetch review reports: ${reportError.message}`);

  const counts: RecommendationCounts = {
    accept: 0,
    minorRevision: 0,
    majorRevision: 0,
    reject: 0,
    noRecommendation: 0,
    totalCompleted: (reports ?? []).length,
  };

  for (const r of (reports ?? []) as { recommendation: ReviewRecommendation }[]) {
    switch (r.recommendation) {
      case "accept":
        counts.accept++;
        break;
      case "minor_revision":
        counts.minorRevision++;
        break;
      case "major_revision":
        counts.majorRevision++;
        break;
      case "reject":
        counts.reject++;
        break;
      default:
        counts.noRecommendation++;
        break;
    }
  }

  return {
    counts,
    recommendation: calculateRecommendation(counts),
  };
}

/**
 * Wrapper for the SQL function `review_round_completed(p_review_round_id)`.
 * Returns true if completed_count >= required_reviewers.
 */
export async function reviewRoundCompleted(
  supabase: SupabaseClient,
  reviewRoundId: string,
): Promise<boolean> {
  // Prefer RPC if available; fall back to manual check.
  const { data, error } = await supabase.rpc("review_round_completed" as never, {
    p_review_round_id: reviewRoundId,
  } as never);

  if (!error && typeof data === "boolean") {
    return data as boolean;
  }

  // Fallback: manual comparison
  const { data: round, error: roundError } = await supabase
    .from("review_rounds")
    .select("required_reviewers")
    .eq("id", reviewRoundId)
    .single();

  if (roundError || !round) throw new Error(`Review round not found: ${reviewRoundId}`);

  const required = (round as { required_reviewers: number }).required_reviewers;

  const { count, error: countError } = await supabase
    .from("review_assignments")
    .select("id", { count: "exact", head: true })
    .eq("review_round_id", reviewRoundId)
    .eq("status", "completed");

  if (countError) throw new Error(`Failed to count completed reviews: ${countError.message}`);

  return (count ?? 0) >= required;
}

/**
 * Attempt to advance a review round to `reviews_complete`/`decision_pending`
 * if the round is now complete. Returns the recommendation if completed, otherwise null.
 */
export async function tryCompleteReviewRound(
  supabase: SupabaseClient,
  reviewRoundId: string,
): Promise<{ completed: boolean; recommendation: ReviewRecommendation } | null> {
  const completed = await reviewRoundCompleted(supabase, reviewRoundId);
  if (!completed) return { completed: false, recommendation: "no_recommendation" };

  const { recommendation } = await getRecommendationForRound(supabase, reviewRoundId);
  return { completed: true, recommendation };
}
