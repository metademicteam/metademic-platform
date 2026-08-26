import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Analytics aggregation helpers — TASK §41.
 * Do not calculate everything on every dashboard request (comment reflects sql views later).
 * These helpers do simple aggregates with limited queries per request.
 */

export interface AnalyticsParams {
  journalId?: string | null;
  from?: string | null; // ISO
  to?: string | null;
}

export interface AnalyticsResult {
  // Submission-oriented
  submissionsPerMonth: { month: string; count: number }[];
  acceptanceRate: number | null;
  rejectionRate: number | null;
  totalSubmissions: number;
  acceptedCount: number;
  rejectedCount: number;

  // Timing
  avgFirstDecisionDays: number | null;
  avgReviewDays: number | null;
  avgPublicationDays: number | null;

  // Reviewer
  reviewerCompletionRate: number | null;
  reviewerOverdueRate: number | null;
  totalReviews: number;
  completedReviews: number;
  overdueReviews: number;

  // Financial
  apcRevenue: number;
  waiverAmount: number;
  invoiceCount: number;
  paidInvoiceCount: number;

  // Publication
  articlesPublished: number;

  // Dimensions
  countries: { name: string; count: number }[];
  institutions: { name: string; count: number }[];
  subjects: { name: string; count: number }[];
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

export async function getAnalytics(
  supabase: SupabaseClient,
  params: AnalyticsParams = {},
): Promise<AnalyticsResult> {
  // 1) Manuscripts
  let mQuery = supabase.from("manuscripts").select("id, status, submitted_at, accepted_at, created_at, journal_id, country_code, metadata");
  if (params.journalId) mQuery = mQuery.eq("journal_id", params.journalId);
  if (params.from) mQuery = mQuery.gte("submitted_at", params.from);
  if (params.to) mQuery = mQuery.lte("submitted_at", params.to);

  const { data: manuscripts } = await mQuery.limit(2000);

  const ms = (manuscripts ?? []) as Array<{
    id: string;
    status: string;
    submitted_at: string | null;
    accepted_at: string | null;
    created_at: string;
    journal_id: string;
    metadata?: Record<string, unknown> | null;
  }>;

  const totalSubmissions = ms.length;
  const acceptedCount = ms.filter((m) => ["accepted", "apc_pending", "copyediting", "typesetting", "author_proof", "production_approval", "ready_to_publish", "published"].includes(m.status)).length;
  const rejectedCount = ms.filter((m) => m.status === "rejected").length;
  const acceptanceRate = totalSubmissions ? acceptedCount / totalSubmissions : null;
  const rejectionRate = totalSubmissions ? rejectedCount / totalSubmissions : null;

  // Submissions per month (last 12 months based on submitted_at or created_at)
  const perMonthMap = new Map<string, number>();
  for (const m of ms) {
    const dStr = m.submitted_at ?? m.created_at;
    if (!dStr) continue;
    const k = monthKey(new Date(dStr));
    perMonthMap.set(k, (perMonthMap.get(k) ?? 0) + 1);
  }
  const submissionsPerMonth = Array.from(perMonthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([month, count]) => ({ month, count }));

  // Avg first decision time: submitted_at -> accepted_at or rejected_at or first editorial_decisions.created_at
  // We approximate using manuscript submitted_at -> accepted_at/rejected_at where available
  const firstDecisionDays: number[] = [];
  for (const m of ms) {
    if (m.submitted_at && m.accepted_at) {
      firstDecisionDays.push(daysBetween(m.submitted_at, m.accepted_at));
    }
  }
  // Fallback: editorial_decisions for more accurate first decision
  let avgFirstDecisionDays: number | null = avg(firstDecisionDays);
  try {
    let dQuery = supabase.from("editorial_decisions").select("created_at, manuscript_id");
    // Filter to manuscripts in scope if journalId provided
    if (params.journalId) {
      const ids = ms.map((m) => m.id);
      if (ids.length) dQuery = dQuery.in("manuscript_id", ids as never);
      else dQuery = dQuery.limit(0);
    }
    const { data: decisions } = await dQuery.limit(2000);
    const byManuscript = new Map<string, string>();
    for (const dec of (decisions ?? []) as Array<{ manuscript_id: string; created_at: string }>) {
      const existing = byManuscript.get(dec.manuscript_id);
      if (!existing || new Date(dec.created_at) < new Date(existing)) byManuscript.set(dec.manuscript_id, dec.created_at);
    }
    const alt: number[] = [];
    for (const m of ms) {
      const d = byManuscript.get(m.id);
      if (m.submitted_at && d) alt.push(daysBetween(m.submitted_at, d));
    }
    if (alt.length) avgFirstDecisionDays = avg(alt);
  } catch {
    // ignore
  }

  // Average review time / publication time
  let avgReviewDays: number | null = null;
  let avgPublicationDays: number | null = null;
  try {
    const reviewTimes: number[] = [];
    const rQuery = supabase.from("review_assignments").select("deadline_at, completed_at, created_at");
    const { data: assignments } = await rQuery.limit(2000);
    for (const a of (assignments ?? []) as Array<{ completed_at: string | null; created_at: string }>) {
      if (a.completed_at) reviewTimes.push(daysBetween(a.created_at, a.completed_at));
    }
    avgReviewDays = avg(reviewTimes);

    const pubTimes: number[] = [];
    let aQuery = supabase.from("articles").select("received_at, published_at");
    if (params.journalId) aQuery = aQuery.eq("journal_id", params.journalId);
    const { data: articles } = await aQuery.limit(2000);
    for (const ar of (articles ?? []) as Array<{ received_at: string | null; published_at: string | null }>) {
      if (ar.received_at && ar.published_at) pubTimes.push(daysBetween(ar.received_at, ar.published_at));
    }
    avgPublicationDays = avg(pubTimes);
    // Also consider manuscript submitted -> article published
  } catch {
    // ignore
  }

  // Reviewer completion / overdue
  let totalReviews = 0;
  let completedReviews = 0;
  let overdueReviews = 0;
  let reviewerCompletionRate: number | null = null;
  let reviewerOverdueRate: number | null = null;
  try {
    const q = supabase.from("review_assignments").select("status", { count: "exact" });
    const { count: total } = await q;
    totalReviews = total ?? 0;

    const { count: completed } = await supabase.from("review_assignments").select("id", { count: "exact", head: true }).eq("status", "completed");
    completedReviews = completed ?? 0;

    const { count: overdue } = await supabase.from("review_assignments").select("id", { count: "exact", head: true }).eq("status", "overdue");
    overdueReviews = overdue ?? 0;

    reviewerCompletionRate = totalReviews ? completedReviews / totalReviews : null;
    reviewerOverdueRate = totalReviews ? overdueReviews / totalReviews : null;
  } catch {
    // ignore
  }

  // Financial
  let apcRevenue = 0;
  let waiverAmount = 0;
  let invoiceCount = 0;
  let paidInvoiceCount = 0;
  try {
    const { data: invoices } = await supabase.from("invoices").select("amount, status");
    for (const inv of (invoices ?? []) as Array<{ amount: number; status: string }>) {
      invoiceCount++;
      if (["paid"].includes(inv.status)) {
        apcRevenue += Number(inv.amount ?? 0);
        paidInvoiceCount++;
      }
    }
    const { data: apcs } = await supabase.from("apcs").select("waiver_amount");
    for (const apc of (apcs ?? []) as Array<{ waiver_amount: number }>) {
      waiverAmount += Number(apc.waiver_amount ?? 0);
    }
    // Also sum from payments where succeeded
    const { data: payments } = await supabase.from("payments").select("amount, status");
    const payRevenue = (payments ?? [])
      .filter((p: { status: string }) => p.status === "succeeded")
      .reduce((s: number, p: { amount: number }) => s + Number(p.amount ?? 0), 0);
    if (payRevenue) apcRevenue = Math.max(apcRevenue, payRevenue);
  } catch {
    // ignore
  }

  // Articles published
  let articlesPublished = 0;
  try {
    let q = supabase.from("articles").select("id", { count: "exact", head: true }).eq("publication_status", "published");
    if (params.journalId) q = q.eq("journal_id", params.journalId);
    const { count } = await q;
    articlesPublished = count ?? 0;
  } catch {
    // ignore
  }

  // Countries / institutions / subjects
  let countries: { name: string; count: number }[] = [];
  let institutions: { name: string; count: number }[] = [];
  let subjects: { name: string; count: number }[] = [];
  try {
    // Countries from profiles
    const { data: profiles } = await supabase.from("profiles").select("country_code").limit(5000);
    const cMap = new Map<string, number>();
    for (const p of (profiles ?? []) as Array<{ country_code: string | null }>) {
      if (!p.country_code) continue;
      cMap.set(p.country_code, (cMap.get(p.country_code) ?? 0) + 1);
    }
    countries = Array.from(cMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));

    // Institutions from institutions table count of usage?
    const { data: insts } = await supabase.from("institutions").select("name").limit(50);
    // Count by manuscript_authors institution_name_snapshot
    const { data: mAuthors } = await supabase.from("manuscript_authors").select("institution_name_snapshot").limit(5000);
    const iMap = new Map<string, number>();
    for (const a of (mAuthors ?? []) as Array<{ institution_name_snapshot: string | null }>) {
      if (!a.institution_name_snapshot) continue;
      iMap.set(a.institution_name_snapshot, (iMap.get(a.institution_name_snapshot) ?? 0) + 1);
    }
    // Merge with institutions table for naming
    institutions = Array.from(iMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
    if (institutions.length === 0 && insts) {
      institutions = (insts as Array<{ name: string }>).slice(0, 5).map((i) => ({ name: i.name, count: 0 }));
    }

    // Subjects from manuscripts.subject_areas + articles metadata subjects
    const sMap = new Map<string, number>();
    for (const m of ms) {
      const areas = (m as unknown as { subject_areas?: string[] }).subject_areas ?? (m as unknown as { keywords?: string[] }).keywords ?? [];
      // Try manuscripts keywords/subject_areas raw
    }
    // Fetch actual subject_areas arrays
    const { data: mSubjects } = await supabase.from("manuscripts").select("subject_areas").limit(5000);
    for (const row of (mSubjects ?? []) as Array<{ subject_areas: string[] | null }>) {
      for (const s of row.subject_areas ?? []) {
        sMap.set(s, (sMap.get(s) ?? 0) + 1);
      }
    }
    subjects = Array.from(sMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
  } catch {
    // ignore
  }

  return {
    submissionsPerMonth,
    acceptanceRate,
    rejectionRate,
    totalSubmissions,
    acceptedCount,
    rejectedCount,
    avgFirstDecisionDays,
    avgReviewDays,
    avgPublicationDays,
    reviewerCompletionRate,
    reviewerOverdueRate,
    totalReviews,
    completedReviews,
    overdueReviews,
    apcRevenue,
    waiverAmount,
    invoiceCount,
    paidInvoiceCount,
    articlesPublished,
    countries,
    institutions,
    subjects,
  };
}
