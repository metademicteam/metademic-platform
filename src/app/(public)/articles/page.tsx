import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Search, Filter, Download, Calendar, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Articles — Metademic",
  description: "All published articles — search by journal, issue, year, keywords, title and abstract.",
};

const PAGE_SIZE = 12;
const ETIS_CARD = "rounded-[12px] border border-[#e2e8f0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]";
const ETIS_LABEL = "text-[10px] font-semibold tracking-[0.14em] uppercase text-[#94a3b8]";

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; journal?: string; year?: string; type?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const journal = (sp.journal ?? "").trim();
  const yearStr = (sp.year ?? "").trim();
  const type = (sp.type ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  let query = supabase
    .from("articles")
    .select("id,title,slug,abstract,article_type,published_at,article_number,journal_id, journals(name,slug)", { count: "exact" })
    .eq("publication_status", "published")
    .order("published_at", { ascending: false })
    .range(from, to);

  if (q) {
    const safe = q.replace(/[%_\\]/g, "\\$&");
    query = query.or(`title.ilike.%${safe}%,abstract.ilike.%${safe}%,slug.ilike.%${safe}%,article_number.ilike.%${safe}%`);
  }
  if (journal) {
    query = query.eq("journals.slug", journal);
  }
  if (yearStr && /^\d{4}$/.test(yearStr)) {
    const y = parseInt(yearStr, 10);
    query = query.gte("published_at", `${y}-01-01`).lt("published_at", `${y + 1}-01-01`);
  }
  if (type) query = query.eq("article_type", type);

  const { data, count, error } = await query;
  const articles = (data ?? []) as unknown as Array<{
    id: string; title: string; slug: string; abstract: string | null; article_type: string | null; published_at: string | null; article_number: string | null; journals: { name: string; slug: string } | null;
  }>;
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function qs(next: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    if ((next.q ?? q)) p.set("q", next.q ?? q);
    if ((next.journal ?? journal)) p.set("journal", next.journal ?? journal);
    if ((next.year ?? yearStr)) p.set("year", next.year ?? yearStr);
    if ((next.type ?? type)) p.set("type", next.type ?? type);
    if (next.page) p.set("page", next.page);
    return p.toString();
  }

  return (
    <div className="min-h-screen bg-[#f0f3f8]">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-5">
        <div className="flex flex-col gap-1">
          <p className={ETIS_LABEL}>Registry · Articles</p>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#0f172a] flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#1e4ed8]" /> Articles
          </h1>
          <p className="text-[12px] leading-5 text-[#64748b]">Published articles — dense ETIS table (984 results style) · open access, DOI-indexed.</p>
        </div>

        <div className={`${ETIS_CARD} p-4`}>
          <form action="/articles" method="get" className="grid sm:grid-cols-[1.4fr_0.7fr_0.5fr_0.6fr_auto] gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
              <Input name="q" defaultValue={q} placeholder="Search title, abstract, DOI…" className="h-9 rounded-[8px] border-[#e2e8f0] bg-[#f8fafc] pl-8 text-[13px] placeholder:text-[#94a3b8] focus-visible:bg-white" />
            </div>
            <Input name="journal" defaultValue={journal} placeholder="Journal slug" className="h-9 rounded-[8px] border-[#e2e8f0] bg-[#f8fafc] text-[12px] focus-visible:bg-white" />
            <Input name="year" defaultValue={yearStr} placeholder="Year" inputMode="numeric" className="h-9 rounded-[8px] border-[#e2e8f0] bg-[#f8fafc] text-[12px] focus-visible:bg-white" />
            <Input name="type" defaultValue={type} placeholder="Type" className="h-9 rounded-[8px] border-[#e2e8f0] bg-[#f8fafc] text-[12px] focus-visible:bg-white" />
            <Button type="submit" className="h-9 rounded-[8px] bg-[#1e4ed8] text-[13px] font-medium px-5 shadow-[0_1px_2px_rgba(30,78,216,0.18)] hover:bg-[#1e40af]">Filter</Button>
          </form>
          {(q || journal || yearStr || type) && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {q && <span className="inline-flex rounded-full bg-[#eff6ff] border border-[#dbeafe] px-2.5 py-1 text-[11px] font-medium text-[#1e40af]">q: {q}</span>}
              {journal && <span className="inline-flex rounded-full bg-[#f1f5f9] border border-[#e2e8f0] px-2.5 py-1 text-[11px] text-[#475569]">journal: {journal}</span>}
              {yearStr && <span className="inline-flex rounded-full bg-[#f1f5f9] border border-[#e2e8f0] px-2.5 py-1 text-[11px] text-[#475569]">year: {yearStr}</span>}
              {type && <span className="inline-flex rounded-full bg-[#f1f5f9] border border-[#e2e8f0] px-2.5 py-1 text-[11px] text-[#475569]">type: {type}</span>}
              <Button variant="ghost" size="xs" asChild className="h-6 rounded-full border border-[#e2e8f0] bg-white text-[11px]"><Link href="/articles">Clear filters</Link></Button>
            </div>
          )}
        </div>

        {error ? (
          <div className={`${ETIS_CARD} py-10 text-center text-[13px] text-[#b91c1c] bg-[#fef2f2] border-[#fecaca]`}>Failed to load articles: {error.message}</div>
        ) : articles.length === 0 ? (
          <div className={`${ETIS_CARD} py-12 text-center`}>
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f8fafc] border border-dashed border-[#e2e8f0]">
              <FileText className="h-5 w-5 text-[#94a3b8]" />
            </div>
            <p className="text-[13px] font-semibold text-[#0f172a] mt-3">No articles found</p>
            <p className="text-[12px] text-[#64748b] mt-1">Try different filters or browse all journals.</p>
          </div>
        ) : (
          <div className={`${ETIS_CARD} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-semibold text-[#0f172a]">Search results</h2>
                <span className="rounded bg-white border border-[#e2e8f0] px-1.5 py-0.5 text-[10px] font-mono text-[#475569]">{total} results</span>
                <span className="hidden sm:inline text-[11px] text-[#94a3b8]">· page {page} of {totalPages}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="hidden sm:inline text-[11px] text-[#94a3b8] flex items-center gap-1"><Filter className="h-3 w-3" /> Sort: Newest</span>
                <Button variant="outline" className="h-6 rounded-[6px] border-[#e2e8f0] bg-white px-2 text-[11px] font-medium text-[#475569]"><Download className="h-3 w-3 mr-1" /> Export</Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                    <th className="h-8 w-7 px-2 text-center"><input type="checkbox" className="h-3 w-3 rounded border-[#cbd5e1] accent-[#1e4ed8]" /></th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">Publication</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">Autor</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">Year</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">Edition title</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">Classification</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">Institution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9] bg-white">
                  {articles.map((a, idx) => (
                    <tr key={a.id} className={idx % 2 === 0 ? "bg-white hover:bg-[#f8fafc]/70" : "bg-[#fcfdff] hover:bg-[#f8fafc]/70"}>
                      <td className="px-2 py-2.5 text-center"><input type="checkbox" className="h-3 w-3 rounded border-[#cbd5e1] accent-[#1e4ed8]" /></td>
                      <td className="px-3 py-2.5 max-w-[320px]">
                        <Link href={`/articles/${a.slug}`} className="text-[12px] font-medium leading-tight text-[#1e4ed8] hover:text-[#1e40af] hover:underline line-clamp-2">
                          {a.title}
                        </Link>
                        {a.abstract && <p className="text-[11px] leading-4 text-[#64748b] line-clamp-1 mt-0.5">{a.abstract.slice(0, 120)}</p>}
                        {a.article_number && <span className="mt-1 inline-flex font-mono text-[10px] text-[#94a3b8] border border-[#e2e8f0] rounded px-1 py-0.5 bg-[#f8fafc]">{a.article_number}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-[#475569]">—</td>
                      <td className="px-3 py-2.5 text-[11px] text-[#64748b]">{a.published_at ? new Date(a.published_at).getFullYear() : "—"}</td>
                      <td className="px-3 py-2.5 text-[11px] text-[#475569] max-w-[150px] truncate">{a.journals?.name ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        {a.article_type ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f5f9] border border-[#e2e8f0] px-2 py-0.5 text-[10px] font-medium text-[#475569]"><Tag className="h-2.5 w-2.5 text-[#94a3b8]" /> {a.article_type.replace(/_/g, " ")}</span>
                        ) : (
                          <span className="inline-flex rounded bg-[#fef9c3] border border-[#fde68a] px-1.5 py-0.5 text-[10px] font-medium text-[#854d0e]">1.1</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-[#64748b] whitespace-nowrap flex items-center gap-1"><Calendar className="h-3 w-3 text-[#94a3b8]" /> {a.published_at ? new Date(a.published_at).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f1f5f9] bg-[#f8fafc]/60 px-4 py-2.5 text-[11px]">
              <span className="text-[#64748b]">Showing {from + 1}–{Math.min(to + 1, total)} of {total} · Select all {total}</span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="xs" disabled={page <= 1} asChild={page > 1} className="h-7 rounded-[6px] border-[#e2e8f0] bg-white">
                  <Link href={`/articles?${qs({ page: String(page - 1) })}`}>‹ Previous</Link>
                </Button>
                <span className="px-2 text-[#475569] font-medium">Page {page} of {totalPages}</span>
                <Button variant="outline" size="xs" disabled={page >= totalPages} asChild={page < totalPages} className="h-7 rounded-[6px] border-[#e2e8f0] bg-white">
                  <Link href={`/articles?${qs({ page: String(page + 1) })}`}>Next ›</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
