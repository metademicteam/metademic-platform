import type { Metadata } from "next";
import Link from "next/link";
import { Search, GraduationCap, Tag, BadgeCheck, Filter } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Reviewers — Metademic",
  description: "Reviewer directory on Metademic — expertise, availability, and review keywords.",
};

const PAGE_SIZE = 15;
const ETIS_CARD = "rounded-[12px] border border-[#e2e8f0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]";
const ETIS_LABEL = "text-[10px] font-semibold tracking-[0.14em] uppercase text-[#94a3b8]";

export default async function ReviewersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; expertise?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const expertise = (sp.expertise ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  let query = supabase
    .from("reviewer_profiles")
    .select("id, user_id, expertise, keywords, is_available, profiles!inner(display_name, first_name, last_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  // Search by name or expertise
  if (q) {
    const safe = q.replace(/[%_\\]/g, "\\$&");
    // name is in profiles, expertise in reviewer_profiles. Use expertise contains for backend,
    // and filter client-side name fallback is not supported in REST — do ilike on joined field via embedding.
    query = query.or(`expertise.cs.{${safe}}`);
    // If the above yields no results, the UI still renders empty; name search is done via
    // the second query stage when needed.
  }
  if (expertise) {
    const safeE = expertise.replace(/[%_\\]/g, "\\$&");
    query = query.contains("expertise", [safeE]);
  }

  const { data, count, error } = await query;
  let reviewers = (data ?? []) as unknown as Array<{ id: string; user_id: string; expertise: string[]; keywords: string[]; is_available: boolean; profiles: { display_name: string | null; first_name: string | null; last_name: string | null } | null }>;
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // If `q` was given and expertise-based search returned nothing, fall back to name search via anon profiles
  // (best-effort: re-query reviewer_profiles without expertise filter and filter by profile name in JS).
  if (q && reviewers.length === 0) {
    const { data: fallback } = await supabase
      .from("reviewer_profiles")
      .select("id, user_id, expertise, keywords, is_available, profiles!inner(display_name, first_name, last_name)")
      .range(from, to);
    const ql = q.toLowerCase();
    reviewers = ((fallback ?? []) as unknown as typeof reviewers).filter(
      (r) =>
        (r.profiles?.display_name ?? "").toLowerCase().includes(ql) ||
        (r.profiles?.first_name ?? "").toLowerCase().includes(ql) ||
        (r.profiles?.last_name ?? "").toLowerCase().includes(ql) ||
        (r.expertise ?? []).some((e: string) => e.toLowerCase().includes(ql)) ||
        (r.keywords ?? []).some((k: string) => k.toLowerCase().includes(ql)),
    );
  }

  function qs(next: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    if ((next.q ?? q)) p.set("q", next.q ?? q);
    if ((next.expertise ?? expertise)) p.set("expertise", next.expertise ?? expertise);
    if (next.page) p.set("page", next.page);
    return p.toString();
  }

  return (
    <div className="min-h-screen bg-[#f0f3f8]">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-5">
        <div className="flex flex-col gap-1">
          <p className={ETIS_LABEL}>Community · Reviewers</p>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#0f172a] flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-[#1e4ed8]" /> Reviewers
          </h1>
          <p className="text-[12px] leading-5 text-[#64748b]">Metademic reviewers — expertise, availability, and review history.</p>
        </div>

        <div className={`${ETIS_CARD} p-4`}>
          <form action="/reviewers" method="get" className="grid sm:grid-cols-[1.5fr_0.9fr_auto] gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
              <Input name="q" defaultValue={q} placeholder="Search name or expertise…" className="h-9 rounded-[8px] border-[#e2e8f0] bg-[#f8fafc] pl-8 text-[13px] placeholder:text-[#94a3b8] focus-visible:bg-white" />
            </div>
            <Input name="expertise" defaultValue={expertise} placeholder="Expertise tag" className="h-9 rounded-[8px] border-[#e2e8f0] bg-[#f8fafc] text-[12px] focus-visible:bg-white" />
            <Button type="submit" className="h-9 rounded-[8px] bg-[#1e4ed8] text-[13px] font-medium px-5 shadow-[0_1px_2px_rgba(30,78,216,0.18)] hover:bg-[#1e40af]">Search</Button>
          </form>
          {(q || expertise) && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {q && <span className="inline-flex rounded-full bg-[#eff6ff] border border-[#dbeafe] px-2.5 py-1 text-[11px] font-medium text-[#1e40af]">q: {q}</span>}
              {expertise && <span className="inline-flex rounded-full bg-[#f1f5f9] border border-[#e2e8f0] px-2.5 py-1 text-[11px] text-[#475569]">expertise: {expertise}</span>}
              <Button variant="ghost" size="xs" asChild className="h-6 rounded-full border border-[#e2e8f0] bg-white text-[11px]"><Link href="/reviewers">Clear filters</Link></Button>
            </div>
          )}
        </div>

        {error ? (
          <div className={`${ETIS_CARD} py-10 text-center text-[13px] text-[#b91c1c] bg-[#fef2f2] border-[#fecaca]`}>Failed to load reviewers: {error.message}</div>
        ) : reviewers.length === 0 ? (
          <div className={`${ETIS_CARD} py-12 text-center`}>
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f8fafc] border border-dashed border-[#e2e8f0]">
              <GraduationCap className="h-5 w-5 text-[#94a3b8]" />
            </div>
            <p className="text-[13px] font-semibold text-[#0f172a] mt-3">No reviewers found</p>
            <p className="text-[12px] text-[#64748b] mt-1">Reviewers appear after creating a reviewer profile.</p>
          </div>
        ) : (
          <div className={`${ETIS_CARD} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-semibold text-[#0f172a]">Reviewers</h2>
                <span className="rounded bg-white border border-[#e2e8f0] px-1.5 py-0.5 text-[10px] font-mono text-[#475569]">{total} results</span>
                <span className="hidden sm:inline text-[11px] text-[#94a3b8]">· page {page} of {totalPages}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="hidden sm:inline text-[11px] text-[#94a3b8] flex items-center gap-1"><Filter className="h-3 w-3" /> Sort: Newest</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                    <th className="h-8 w-7 px-2 text-center"><input type="checkbox" className="h-3 w-3 rounded border-[#cbd5e1] accent-[#1e4ed8]" /></th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Reviewer</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Expertise</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Keywords</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9] bg-white">
                  {reviewers.map((r, idx) => (
                    <tr key={r.id} className={idx % 2 === 0 ? "bg-white hover:bg-[#f8fafc]/70" : "bg-[#fcfdff] hover:bg-[#f8fafc]/70"}>
                      <td className="px-2 py-2.5 text-center"><input type="checkbox" className="h-3 w-3 rounded border-[#cbd5e1] accent-[#1e4ed8]" /></td>
                      <td className="px-3 py-2.5 max-w-[260px]">
                        <span className="text-[12px] font-medium leading-tight text-[#0f172a]">
                          {(r.profiles?.display_name ?? [r.profiles?.first_name, r.profiles?.last_name].filter(Boolean).join(" ")) || "—"}
                        </span>
                        <div className="text-[11px] text-[#64748b] mt-0.5" />
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-[#475569] max-w-[280px]">
                        <div className="flex flex-wrap gap-1">
                          {(r.expertise ?? []).length ? (r.expertise ?? []).map((e) => (<span key={e} className="inline-flex items-center gap-1 rounded-full bg-[#eff6ff] border border-[#dbeafe] px-2 py-0.5 text-[10px] font-medium text-[#1e40af]"><Tag className="h-2.5 w-2.5" /> {e}</span>)) : <span className="text-[#94a3b8]">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-[#475569] max-w-[280px]">
                        <div className="flex flex-wrap gap-1">
                          {(r.keywords ?? []).length ? (r.keywords ?? []).map((k) => (<span key={k} className="inline-flex rounded-full bg-[#f1f5f9] border border-[#e2e8f0] px-2 py-0.5 text-[10px] text-[#475569]">{k}</span>)) : <span className="text-[#94a3b8]">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {r.is_available ? (
                          <Badge variant="default" className="text-[11px]"><BadgeCheck className="h-3 w-3 mr-1" /> Available</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[11px]">Unavailable</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f1f5f9] bg-[#f8fafc]/60 px-4 py-2.5 text-[11px]">
              <span className="text-[#64748b]">Showing {from + 1}–{Math.min(to + 1, total)} of {total} · Select all {total}</span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="xs" disabled={page <= 1} asChild={page > 1} className="h-7 rounded-[6px] border-[#e2e8f0] bg-white">
                  {page > 1 ? <Link href={`/reviewers?${new URLSearchParams({ ...(q && { q }), ...(expertise && { expertise }), page: String(page - 1) })}`}>‹ Previous</Link> : <span>‹ Previous</span>}
                </Button>
                <span className="px-2 text-[#475569] font-medium">Page {page} of {totalPages}</span>
                <Button variant="outline" size="xs" disabled={page >= totalPages} asChild={page < totalPages} className="h-7 rounded-[6px] border-[#e2e8f0] bg-white">
                  {page < totalPages ? <Link href={`/reviewers?${new URLSearchParams({ ...(q && { q }), ...(expertise && { expertise }), page: String(page + 1) })}`}>Next ›</Link> : <span>Next ›</span>}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
