export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MANUSCRIPT_STATUS_LABELS, type ManuscriptStatus } from "@/lib/constants";
import { FileText, Clock, RefreshCw, CheckCircle, XCircle, BookOpen, Wallet, Plus, Search, Filter, Download, PieChart, BarChart3 } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const label = MANUSCRIPT_STATUS_LABELS[status as ManuscriptStatus] ?? status;
  const map: Record<string, string> = {
    draft: "bg-[#f1f5f9] text-[#475569] border-[#e2e8f0]",
    submitted: "bg-[#eff6ff] text-[#1e40af] border-[#dbeafe]",
    technical_check: "bg-[#f1f5f9] text-[#475569] border-[#e2e8f0]",
    under_review: "bg-[#eff6ff] text-[#1e40af] border-[#dbeafe]",
    reviewer_invitation: "bg-[#eff6ff] text-[#1e40af] border-[#dbeafe]",
    reviews_complete: "bg-[#eff6ff] text-[#1e40af] border-[#dbeafe]",
    decision_pending: "bg-[#fef9c3] text-[#854d0e] border-[#fde68a]",
    minor_revision: "bg-[#fef9c3] text-[#a16207] border-[#fde68a]",
    major_revision: "bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]",
    revision_submitted: "bg-[#eff6ff] text-[#1e40af] border-[#dbeafe]",
    accepted: "bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]",
    rejected: "bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]",
    published: "bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]",
    apc_pending: "bg-[#fef9c3] text-[#854d0e] border-[#fde68a]",
  };
  const cls = map[status] ?? "bg-[#f1f5f9] text-[#475569] border-[#e2e8f0]";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] ${cls}`}>{label}</span>;
}

const ETIS_CARD = "rounded-[12px] border border-[#e2e8f0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]";
const ETIS_LABEL = "text-[10px] font-semibold tracking-[0.14em] uppercase text-[#94a3b8]";

export default async function AuthorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string; journal?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = 10;
  const search = sp.search ?? "";
  const statusFilter = sp.status ?? "all";

  const { data: allManuscripts } = await supabase
    .from("manuscripts")
    .select("status, journal_id, created_at, updated_at, current_version")
    .eq("submitted_by", user.id);

  const list = (allManuscripts ?? []) as { status: string }[];
  const total = list.length;
  const underReview = list.filter((m) => ["under_review", "reviewer_invitation", "reviews_complete", "decision_pending", "re_review"].includes(m.status)).length;
  const revisionsRequired = list.filter((m) => ["minor_revision", "major_revision", "revision_submitted"].includes(m.status)).length;
  const accepted = list.filter((m) => m.status === "accepted").length;
  const rejected = list.filter((m) => m.status === "rejected").length;
  const published = list.filter((m) => m.status === "published").length;
  const apcPending = list.filter((m) => m.status === "apc_pending").length;

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("manuscripts")
    .select("id, manuscript_number, title, status, current_version, current_review_round, submitted_at, updated_at, created_at, journal_id, journals!inner(name, slug)", { count: "exact" })
    .eq("submitted_by", user.id)
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter as never);
  }
  if (search) {
    const term = `%${search}%`;
    query = query.or(`title.ilike.${term},manuscript_number.ilike.${term}`);
  }

  const { data: rows, count, error } = await query;
  const manuscripts = (rows ?? []) as unknown as Array<{
    id: string;
    manuscript_number: string;
    title: string;
    status: string;
    current_version: number;
    current_review_round: number;
    submitted_at: string | null;
    updated_at: string;
    created_at: string;
    journal_id: string;
    journals: { name: string; slug: string } | null;
  }>;
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Server-side auto-heal: reconcile any Stripe-paid but DB-pending APCs for this user before rendering
  // (makes apc_pending -> copyediting automatic on next page load, even if webhook was missed)
  try {
    if (process.env.STRIPE_SECRET_KEY) {
      const { reconcileInvoicesForManuscripts } = await import("@/lib/payments/reconcile");
      const { data: ids } = await supabase.from("manuscripts").select("id").eq("submitted_by", user.id).in("status", ["accepted", "apc_pending"] as never).limit(20);
      const mids = ((ids ?? []) as Array<{ id: string }>).map((r) => r.id);
      if (mids.length) await reconcileInvoicesForManuscripts(mids);
    }
  } catch {}

  let apcCount = apcPending;
  const payableByManuscript = new Map<string, { amount: number; currency: string; status: string }>();
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data: apcRows } = await admin
      .from("apcs")
      .select("id, manuscript_id, status, total_amount, currency, manuscripts!inner(submitted_by)")
      .eq("manuscripts.submitted_by", user.id)
      .in("status", ["calculated", "invoice_issued", "payment_pending"] as never);
    if (apcRows) {
      apcCount = (apcRows as unknown[]).length;
      for (const row of apcRows as Array<{ manuscript_id: string; status: string; total_amount: number; currency: string }>) {
        payableByManuscript.set(row.manuscript_id, { amount: Number(row.total_amount), currency: row.currency, status: row.status });
      }
    }
  } catch {}

  const statCards = [
    { label: "Total Submissions", value: total, icon: FileText, sub: "all manuscripts" },
    { label: "Under Review", value: underReview, icon: Clock, sub: "in peer review" },
    { label: "Revisions Required", value: revisionsRequired, icon: RefreshCw, sub: "action needed" },
    { label: "Accepted", value: accepted, icon: CheckCircle, sub: "accepted" },
    { label: "Rejected", value: rejected, icon: XCircle, sub: "decision" },
    { label: "Published", value: published, icon: BookOpen, sub: "open access" },
    { label: "APC Pending", value: apcCount, icon: Wallet, sub: "payment" },
  ];

  const buildQuery = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if ((overrides.search ?? search) !== "") params.set("search", overrides.search ?? search);
    if ((overrides.status ?? statusFilter) !== "all") params.set("status", overrides.status ?? statusFilter);
    if (overrides.page) params.set("page", overrides.page);
    else if (page !== 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  // derived for tiny pie
  const pieA = total ? Math.round((published / Math.max(1, total)) * 100) : 0;
  const pieB = total ? Math.round((underReview / Math.max(1, total)) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#f0f3f8]">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className={ETIS_LABEL}>Author workspace</p>
            <h1 className="text-[22px] font-extrabold tracking-tight text-[#0f172a] leading-none mt-1">Author Dashboard</h1>
            <p className="text-[12px] leading-5 text-[#64748b] mt-1.5">Track submissions, revisions, and publication progress — ETIS-style dense registry.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" className="h-8 rounded-[8px] border-[#e2e8f0] bg-white text-[12px] font-medium hover:bg-[#f8fafc] hidden sm:inline-flex">
              <Link href="/author/submissions">View all submissions</Link>
            </Button>
            <Button asChild className="h-8 rounded-[8px] bg-[#1e4ed8] text-[12px] font-semibold shadow-[0_1px_2px_rgba(30,78,216,0.18)] hover:bg-[#1e40af]">
              <Link href="/author/submissions/new">
                <Plus className="h-3.5 w-3.5" />
                New Submission
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats grid — ETIS 7 cards with muted icons top-right */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {statCards.map((s) => (
            <div key={s.label} className={`${ETIS_CARD} p-3.5 flex flex-col min-h-[88px]`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#94a3b8] leading-tight pr-2">{s.label}</p>
                <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#f8fafc] border border-[#f1f5f9] shrink-0">
                  <s.icon className="h-3.5 w-3.5 text-[#94a3b8]" />
                </span>
              </div>
              <p className="text-[22px] font-bold leading-none tracking-tight text-[#0f172a] mt-2">{s.value}</p>
              <p className="text-[10px] font-medium text-[#94a3b8] mt-1">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Analytics strip — mini pie + bars like homepage, data-derived */}
        <div className="grid grid-cols-12 gap-4">
          <div className={`${ETIS_CARD} col-span-12 lg:col-span-8 p-4 flex flex-col`}>
            <div className="flex items-center justify-between">
              <p className={ETIS_LABEL}>Overview · by status</p>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#94a3b8]"><BarChart3 className="h-3 w-3" /> Last updated {new Date().toLocaleDateString()}</span>
            </div>
            <div className="mt-3 flex h-[84px] items-end gap-1.5 border-b border-[#f1f5f9] pb-2">
              {[
                { k: "Total", v: total, c: "#1e4ed8" },
                { k: "Review", v: underReview, c: "#1e4ed8" },
                { k: "Rev.", v: revisionsRequired, c: "#facc15" },
                { k: "Acc.", v: accepted, c: "#22c55e" },
                { k: "Rej.", v: rejected, c: "#94a3b8" },
                { k: "Pub.", v: published, c: "#0f172a" },
                { k: "APC", v: apcCount, c: "#facc15" },
              ].map((b) => {
                const max = Math.max(1, ...statCards.map((x) => x.value));
                const h = Math.max(8, Math.round((b.v / max) * 64));
                return (
                  <div key={b.k} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full max-w-[56px] items-end justify-center" style={{ height: 64 }}>
                      <div className="w-full rounded-t-[3px] border border-black/5" style={{ height: h, background: b.c }} />
                    </div>
                    <span className="text-[10px] font-medium text-[#475569]">{b.k}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-[#94a3b8]">
              <span>Distribution across {total} submissions</span>
              <Link href="/author/submissions" className="text-[11px] font-medium text-[#1e4ed8] hover:underline">View breakdown →</Link>
            </div>
          </div>

          <div className={`${ETIS_CARD} col-span-12 lg:col-span-4 p-4 flex flex-col`}>
            <div className="flex items-center justify-between">
              <p className={ETIS_LABEL}>Publication share</p>
              <PieChart className="h-3.5 w-3.5 text-[#94a3b8]" />
            </div>
            <div className="mt-3 flex items-center gap-4">
              <div className="relative h-[84px] w-[84px] shrink-0">
                <div className="h-full w-full rounded-full border border-[#e2e8f0]" style={{ background: `conic-gradient(#1e4ed8 0 ${pieA}%, #facc15 ${pieA}% ${pieA + pieB}%, #e2e8f0 ${pieA + pieB}% 100%)` }} />
                <div className="absolute inset-[12px] rounded-full bg-white border border-[#f1f5f9] flex flex-col items-center justify-center">
                  <span className="text-[12px] font-bold leading-none text-[#0f172a]">{pieA}%</span>
                  <span className="text-[8px] font-medium tracking-wide uppercase text-[#94a3b8]">Published</span>
                </div>
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#1e4ed8]" /> <span className="text-[#334155]">Published {published}</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#facc15] border border-[#eab308]/30" /> <span className="text-[#334155]">Under review {underReview}</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#e2e8f0]" /> <span className="text-[#64748b]">Other {Math.max(0, total - published - underReview)}</span></div>
                <p className="text-[10px] text-[#94a3b8] pt-1">Coverage · updated daily</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters — ETIS pill badges */}
        <div className={`${ETIS_CARD} p-3 sm:p-4`}>
          <div className="flex flex-col lg:flex-row gap-3">
            <form method="GET" className="flex flex-1 gap-2">
              <div className="relative flex-1 max-w-[420px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
                <Input name="search" defaultValue={search} placeholder="Search title, manuscript ID…" className="h-8 rounded-[8px] border-[#e2e8f0] bg-[#f8fafc] pl-8 pr-3 text-[12px] placeholder:text-[#94a3b8] focus-visible:bg-white" />
                {statusFilter !== "all" && <input type="hidden" name="status" value={statusFilter} />}
              </div>
              <Button type="submit" size="sm" className="h-8 rounded-[8px] bg-[#1e4ed8] text-[12px] font-medium px-4">Search</Button>
              {(search || statusFilter !== "all") && (
                <Button variant="outline" size="sm" asChild className="h-8 rounded-[8px] border-[#e2e8f0] bg-white text-[12px]">
                  <Link href="/author/dashboard">Clear</Link>
                </Button>
              )}
            </form>
            <div className="flex gap-2 items-center flex-wrap">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#94a3b8]"><Filter className="h-3 w-3" /> Filter:</span>
              {["all", "draft", "submitted", "under_review", "minor_revision", "major_revision", "accepted", "rejected", "published", "apc_pending"].map((st) => (
                <Link
                  key={st}
                  href={`/author/dashboard${buildQuery({ status: st === "all" ? undefined : st, page: undefined })}`}
                  className={`inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors ${statusFilter === st ? "bg-[#1e4ed8] text-white border-[#1e4ed8] shadow-sm" : "bg-white border-[#e2e8f0] text-[#475569] hover:border-[#cbd5e1] hover:text-[#0f172a]"}`}
                >
                  {st === "all" ? "All" : MANUSCRIPT_STATUS_LABELS[st as ManuscriptStatus] ?? st}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Submissions table — ETIS dense header #f8fafc 11px uppercase */}
        <div className={`${ETIS_CARD} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-[#0f172a]">Recent Submissions</h2>
              <span className="rounded bg-white border border-[#e2e8f0] px-1.5 py-0.5 text-[10px] font-mono text-[#475569]">{totalCount} · Page {page} of {totalPages}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="hidden sm:inline text-[11px] text-[#94a3b8]">984 results · ETIS registry</span>
              <Button variant="outline" size="xs" className="h-6 rounded-[6px] border-[#e2e8f0] bg-white text-[11px]"><Download className="h-3 w-3 mr-1" /> Export</Button>
            </div>
          </div>

          {error ? (
            <div className="p-6 text-[12px] text-[#b91c1c] bg-[#fef2f2]">Failed to load submissions: {error.message}</div>
          ) : manuscripts.length === 0 ? (
            <div className="p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f8fafc] border border-dashed border-[#e2e8f0]">
                <FileText className="h-6 w-6 text-[#94a3b8]" />
              </div>
              <p className="font-semibold text-[13px] text-[#0f172a] mt-3">No submissions found</p>
              <p className="text-[12px] text-[#64748b] mt-1">Start your first manuscript submission — guided wizard with technical check.</p>
              <Button asChild className="mt-4 h-8 rounded-[8px] bg-[#1e4ed8] text-[12px] font-medium">
                <Link href="/author/submissions/new">Submit a manuscript →</Link>
              </Button>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                      <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap"><input type="checkbox" className="h-3 w-3 rounded border-[#cbd5e1] accent-[#1e4ed8]" aria-label="Select all" /></th>
                      <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Publication</th>
                      <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Journal</th>
                      <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Classification</th>
                      <th className="h-8 px-3 text-center align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Version</th>
                      <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Year</th>
                      <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9] bg-white">
                    {manuscripts.map((m) => (
                      <tr key={m.id} className="hover:bg-[#f8fafc]/70 transition-colors">
                        <td className="px-3 py-2.5"><input type="checkbox" className="h-3 w-3 rounded border-[#cbd5e1] accent-[#1e4ed8]" /></td>
                        <td className="px-3 py-2.5 max-w-[360px]">
                          <Link href={`/author/submissions/${m.id}`} className="text-[12px] font-medium leading-tight text-[#1e4ed8] hover:text-[#1e40af] hover:underline line-clamp-2">
                            {m.title || "Untitled manuscript"}
                          </Link>
                          <p className="text-[11px] font-mono text-[#94a3b8] mt-0.5">{m.manuscript_number ?? m.id.slice(0, 8)}</p>
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-[#475569] whitespace-nowrap max-w-[160px] truncate">{m.journals?.name ?? "—"}</td>
                        <td className="px-3 py-2.5"><StatusBadge status={m.status} /></td>
                        <td className="px-3 py-2.5 text-center text-[11px] text-[#334155] whitespace-nowrap">
                          v{m.current_version}
                          {m.current_review_round > 0 && <span className="text-[#94a3b8]"> · R{m.current_review_round}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-[#64748b] whitespace-nowrap">{m.submitted_at ? new Date(m.submitted_at).getFullYear() : new Date(m.updated_at).getFullYear()}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Button asChild variant="outline" size="xs" className="h-6 rounded-[6px] border-[#e2e8f0] bg-white text-[11px] font-medium">
                              <Link href={`/author/submissions/${m.id}`}>View</Link>
                            </Button>
                            {payableByManuscript.has(m.id) && (
                              <Button asChild size="xs" className="h-6 rounded-[6px] bg-[#1e4ed8] text-[11px] font-semibold">
                                <Link href={`/author/submissions/${m.id}#apc`}>Pay APC</Link>
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-[#f1f5f9]">
                {manuscripts.map((m) => (
                  <div key={m.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/author/submissions/${m.id}`} className="font-medium text-[13px] leading-tight text-[#1e4ed8] hover:underline line-clamp-2">
                        {m.title || "Untitled manuscript"}
                      </Link>
                      <StatusBadge status={m.status} />
                    </div>
                    <p className="text-[11px] font-mono text-[#94a3b8]">{m.manuscript_number}</p>
                    <p className="text-[11px] text-[#64748b]">
                      {m.journals?.name} · v{m.current_version} · {m.submitted_at ? new Date(m.submitted_at).toLocaleDateString() : "Draft"}
                    </p>
                    <div className="flex gap-2">
                      <Button asChild variant="outline" size="sm" className="flex-1 rounded-[8px] border-[#e2e8f0]">
                        <Link href={`/author/submissions/${m.id}`}>View details</Link>
                      </Button>
                      {payableByManuscript.has(m.id) && (
                        <Button asChild size="sm" className="flex-1 rounded-[8px] bg-[#1e4ed8]">
                          <Link href={`/author/submissions/${m.id}#apc`}>Pay APC</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination — ETIS */}
              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f1f5f9] bg-[#f8fafc]/60 px-4 py-2.5 text-[11px]">
                  <span className="text-[#64748b]">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount} · Select all {totalCount}</span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="xs" disabled={page <= 1} asChild={page > 1} className="h-7 rounded-[6px] border-[#e2e8f0] bg-white">
                      {page > 1 ? <Link href={`/author/dashboard${buildQuery({ page: String(page - 1) })}`}>‹ Previous</Link> : <span>‹ Previous</span>}
                    </Button>
                    <span className="px-2 text-[#475569] font-medium">Page {page} of {totalPages}</span>
                    <Button variant="outline" size="xs" disabled={page >= totalPages} asChild={page < totalPages} className="h-7 rounded-[6px] border-[#e2e8f0] bg-white">
                      {page < totalPages ? <Link href={`/author/dashboard${buildQuery({ page: String(page + 1) })}`}>Next ›</Link> : <span>Next ›</span>}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end">
          <Link href="/author/submissions" className="text-[11px] font-medium text-[#1e4ed8] hover:text-[#1e40af] hover:underline underline-offset-2">View all submissions →</Link>
        </div>
      </div>
    </div>
  );
}
