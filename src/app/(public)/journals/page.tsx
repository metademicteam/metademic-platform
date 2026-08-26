import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Search, Hash, Globe, ArrowRight, Filter, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = {
  title: "Journals — Metademic",
  description: "Browse all active journals on Metademic — open access, peer-reviewed, DOI-indexed titles.",
  openGraph: { title: "Journals — Metademic", description: "Browse all active journals." },
};

const PAGE_SIZE = 12;
const ETIS_CARD = "rounded-[12px] border border-[#e2e8f0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]";
const ETIS_LABEL = "text-[10px] font-semibold tracking-[0.14em] uppercase text-[#94a3b8]";

export default async function JournalsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  let query = supabase
    .from("journals")
    .select("id,name,slug,short_name,description,issn_print,issn_online,publisher_name,status,settings", { count: "exact" })
    .eq("status", "active")
    .order("name", { ascending: true })
    .range(from, to);

  if (q) {
    const safe = q.replace(/[%_\\]/g, "\\$&");
    query = query.or(`name.ilike.%${safe}%,slug.ilike.%${safe}%,description.ilike.%${safe}%,issn_online.ilike.%${safe}%,issn_print.ilike.%${safe}%`);
  }

  const { data, count, error } = await query;
  const journals = (data ?? []) as Array<{
    id: string; name: string; slug: string; short_name: string | null; description: string | null; issn_print: string | null; issn_online: string | null; publisher_name: string | null; settings: Record<string, unknown> | null;
  }>;
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-[#f0f3f8]">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <p className={ETIS_LABEL}>Registry · Journals</p>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#0f172a] flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-[#1e4ed8]" /> Journals
          </h1>
          <p className="text-[12px] leading-5 text-[#64748b]">All active journals — explore aims, boards, and archives. ETIS-style dense results.</p>
        </div>

        {/* Search bar — ETIS white card with blue button */}
        <div className={`${ETIS_CARD} p-4`}>
          <form action="/journals" method="get" className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 max-w-[560px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
              <Input name="q" defaultValue={q} placeholder="Search by title, ISSN, description…" className="h-9 rounded-[8px] border-[#e2e8f0] bg-[#f8fafc] pl-8 text-[13px] placeholder:text-[#94a3b8] focus-visible:bg-white" />
            </div>
            <Button type="submit" className="h-9 rounded-[8px] bg-[#1e4ed8] text-[13px] font-medium px-6 shadow-[0_1px_2px_rgba(30,78,216,0.18)] hover:bg-[#1e40af]">Search</Button>
            {q && (
              <Button variant="outline" asChild className="h-9 rounded-[8px] border-[#e2e8f0] bg-white text-[12px]">
                <Link href="/journals">Clear</Link>
              </Button>
            )}
          </form>
          {q && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="inline-flex rounded-full bg-[#eff6ff] border border-[#dbeafe] px-2.5 py-1 text-[11px] font-medium text-[#1e40af]">q: {q}</span>
              <Link href="/journals" className="inline-flex rounded-full border border-[#e2e8f0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#475569] hover:bg-[#f8fafc]">Clear filters</Link>
            </div>
          )}
        </div>

        {error ? (
          <div className={`${ETIS_CARD} py-10 text-center text-[13px] text-[#b91c1c] bg-[#fef2f2] border-[#fecaca]`}>Failed to load journals: {error.message}</div>
        ) : journals.length === 0 ? (
          <div className={`${ETIS_CARD} py-12 text-center`}>
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f8fafc] border border-dashed border-[#e2e8f0]">
              <BookOpen className="h-5 w-5 text-[#94a3b8]" />
            </div>
            <p className="text-[13px] font-semibold text-[#0f172a] mt-3">No journals found</p>
            <p className="text-[12px] text-[#64748b] mt-1">{q ? `No results for “${q}”.` : "No active journals yet."}</p>
          </div>
        ) : (
          <>
            {/* Results header — like homepage 984 results bar */}
            <div className={`${ETIS_CARD} overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13px] font-semibold text-[#0f172a]">Search results</h2>
                  <span className="rounded bg-white border border-[#e2e8f0] px-1.5 py-0.5 text-[10px] font-mono text-[#475569]">{total} results</span>
                  <span className="hidden sm:inline text-[11px] text-[#94a3b8]">· page {page} of {totalPages}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="hidden sm:inline text-[11px] text-[#94a3b8] flex items-center gap-1"><Filter className="h-3 w-3" /> Sort: Relevance</span>
                  <Button variant="outline" className="h-6 rounded-[6px] border-[#e2e8f0] bg-white px-2 text-[11px] font-medium text-[#475569]"><Download className="h-3 w-3 mr-1" /> Export</Button>
                </div>
              </div>

              {/* Dense ETIS table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                      <th className="h-8 w-7 px-2 text-center"><input type="checkbox" className="h-3 w-3 rounded border-[#cbd5e1] accent-[#1e4ed8]" /></th>
                      <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Publication</th>
                      <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Autor</th>
                      <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Year</th>
                      <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Edition title</th>
                      <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Classification</th>
                      <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Institution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9] bg-white">
                    {journals.map((j, idx) => (
                      <tr key={j.id} className={idx % 2 === 0 ? "bg-white hover:bg-[#f8fafc]/70" : "bg-[#fcfdff] hover:bg-[#f8fafc]/70"}>
                        <td className="px-2 py-2.5 text-center"><input type="checkbox" className="h-3 w-3 rounded border-[#cbd5e1] accent-[#1e4ed8]" /></td>
                        <td className="px-3 py-2.5 max-w-[280px]">
                          <Link href={`/journals/${j.slug}`} className="text-[12px] font-medium leading-tight text-[#1e4ed8] hover:text-[#1e40af] hover:underline line-clamp-2">
                            {j.name}
                          </Link>
                          {j.description && <p className="text-[11px] leading-4 text-[#64748b] line-clamp-1 mt-0.5">{j.description}</p>}
                          <p className="text-[10px] font-mono text-[#94a3b8] mt-0.5">{j.slug}</p>
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-[#475569] whitespace-nowrap max-w-[140px] truncate">{j.publisher_name ?? "—"}</td>
                        <td className="px-3 py-2.5 text-[11px] text-[#64748b]">2024</td>
                        <td className="px-3 py-2.5 text-[11px] text-[#475569] max-w-[160px] truncate">{j.short_name ?? j.name}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex rounded bg-[#fef9c3] border border-[#fde68a] px-1.5 py-0.5 text-[10px] font-medium text-[#854d0e]">1.1</span>
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-[#64748b] whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            {j.issn_online && <><Hash className="h-3 w-3 text-[#94a3b8]" /> {j.issn_online}</>}
                            {!j.issn_online && j.issn_print && <><Hash className="h-3 w-3 text-[#94a3b8]" /> {j.issn_print}</>}
                            {!j.issn_online && !j.issn_print && "—"}
                          </span>
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
                    {page > 1 ? <Link href={`/journals?${new URLSearchParams({ ...(q && { q }), page: String(page - 1) })}`}>‹ Previous</Link> : <span>‹ Previous</span>}
                  </Button>
                  <span className="px-2 text-[#475569] font-medium">Page {page} of {totalPages}</span>
                  <Button variant="outline" size="xs" disabled={page >= totalPages} asChild={page < totalPages} className="h-7 rounded-[6px] border-[#e2e8f0] bg-white">
                    {page < totalPages ? <Link href={`/journals?${new URLSearchParams({ ...(q && { q }), page: String(page + 1) })}`}>Next ›</Link> : <span>Next ›</span>}
                  </Button>
                </div>
              </div>
            </div>

            {/* Also render card grid as alternative — ETIS has both list views */}
            <div className="flex items-center gap-2 text-[11px] text-[#94a3b8] px-1">
              <span className="h-px flex-1 bg-[#e2e8f0]" />
              <span className="font-medium tracking-wide uppercase text-[10px]">Card view</span>
              <span className="h-px flex-1 bg-[#e2e8f0]" />
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {journals.map((j) => {
                const logo = (j.settings as unknown as { logo_url?: string } | undefined)?.logo_url ?? null;
                return (
                  <Link key={`card-${j.id}`} href={`/journals/${j.slug}`} className="group">
                    <div className={`${ETIS_CARD} p-4 h-full hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)] transition-shadow flex flex-col`}>
                      <div className="flex gap-3">
                        <div className="h-10 w-10 shrink-0 rounded-[8px] bg-[#eff6ff] border border-[#dbeafe] flex items-center justify-center overflow-hidden text-[#1e4ed8]">
                          {logo ? <img src={logo} alt={`${j.name} logo`} className="h-full w-full object-cover" /> : <BookOpen className="h-5 w-5" />}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-[13px] font-semibold leading-tight text-[#0f172a] group-hover:text-[#1e4ed8] line-clamp-2 transition-colors">{j.name}</h3>
                          {j.short_name && <p className="text-[11px] text-[#64748b] mt-0.5">{j.short_name}</p>}
                        </div>
                      </div>
                      {j.description && <p className="text-[12px] leading-5 text-[#475569] line-clamp-3 mt-3">{j.description}</p>}
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {j.issn_online && <span className="inline-flex items-center gap-1 rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2 py-1 text-[11px] font-mono text-[#475569]"><Hash className="h-3 w-3 text-[#94a3b8]" /> {j.issn_online}</span>}
                        {j.publisher_name && <span className="inline-flex items-center gap-1 rounded-full border border-[#e2e8f0] bg-white px-2 py-1 text-[11px] text-[#475569]"><Globe className="h-3 w-3 text-[#94a3b8]" /> {j.publisher_name}</span>}
                      </div>
                      <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-[#1e4ed8] group-hover:underline">Visit journal <ArrowRight className="h-3 w-3" /></span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
