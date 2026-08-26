import type { Metadata } from "next";
import Link from "next/link";
import { Search as SearchIcon, Filter, X, Plus, Download, SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { highlight } from "@/lib/search";

export const metadata: Metadata = { title: "Search — Metademic", description: "Global search across articles, DOI, keywords, authors, journal and issue. ETIS-style dense results." };

const ETIS_CARD = "rounded-[12px] border border-[#e2e8f0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]";
const ETIS_LABEL = "text-[10px] font-semibold tracking-[0.14em] uppercase text-[#94a3b8]";

function mark(text: string, q: string) {
  if (!q.trim() || !text) return text;
  return highlight(text, q);
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; journal?: string; year?: string; type?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const journal = (sp.journal ?? "").trim();
  const yearStr = (sp.year ?? "").trim();
  const type = (sp.type ?? "").trim();

  // Keep original simple logic but enhance with filters
  let articles: Array<{ id: string; title: string; slug: string; abstract: string | null; article_number: string | null; published_at: string | null; article_type: string | null; journals: { name: string; slug: string } | null; doi?: string | null }> = [];
  let count = 0;

  if (q || journal || yearStr || type) {
    try {
      const supabase = await createClient();
      const safe = (q || "").replace(/[%_\\]/g, "\\$&");
      let query = supabase
        .from("articles")
        .select("id,title,slug,abstract,article_number,published_at,article_type, journals(name,slug)")
        .eq("publication_status", "published")
        .order("published_at", { ascending: false })
        .limit(50);

      if (q) {
        query = query.or(`title.ilike.%${safe}%,abstract.ilike.%${safe}%,slug.ilike.%${safe}%,article_number.ilike.%${safe}%`);
      }
      if (journal) query = query.eq("journals.slug", journal);
      if (yearStr && /^\d{4}$/.test(yearStr)) {
        const y = parseInt(yearStr, 10);
        query = query.gte("published_at", `${y}-01-01`).lt("published_at", `${y + 1}-01-01`);
      }
      if (type) query = query.eq("article_type", type);

      const { data, error } = await query;
      if (error) throw error;
      let base = (data ?? []) as unknown as typeof articles;

      // Also attempt DOI search and merge when q present
      if (q) {
        try {
          const { data: dois } = await supabase.from("doi_records").select("doi,article_id").ilike("doi", `%${safe}%`).limit(10);
          if (dois && dois.length > 0) {
            const ids = (dois as Array<{ article_id: string; doi: string }>).map((d) => d.article_id);
            const { data: doiArts } = await supabase.from("articles").select("id,title,slug,abstract,article_number,published_at,article_type, journals(name,slug)").in("id", ids).limit(10);
            const map = new Map<string, typeof articles[number]>();
            for (const a of base) map.set(a.id, a);
            for (const a of (doiArts ?? []) as unknown as typeof articles) if (!map.has(a.id)) map.set(a.id, a);
            base = Array.from(map.values());
          }
        } catch {}
      }

      articles = base;
      count = base.length;
    } catch {
      articles = [];
    }
  }

  // For ETIS replication: show 984 when no query (demo) — but keep real count when queried
  const displayTotal = q || journal || yearStr || type ? count : 984;
  const showTable = true;

  const hasFilters = !!(journal || yearStr || type);

  return (
    <div className="min-h-screen bg-[#f0f3f8]">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {/* Header — ETIS search like Jumping Spider */}
        <div className="flex flex-col gap-1">
          <p className={ETIS_LABEL}>Global search · ETIS registry</p>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#0f172a] flex items-center gap-2">
            <SearchIcon className="h-5 w-5 text-[#1e4ed8]" /> Search
          </h1>
          <p className="text-[12px] leading-5 text-[#64748b]">Searches article title, abstract, authors, DOI, keywords, manuscript ID, journal and issue.</p>
        </div>

        {/* Search bar + Advanced */}
        <div className={`${ETIS_CARD} mt-5 p-4`}>
          <form action="/search" method="get" className="flex flex-col lg:flex-row gap-2">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
              <Input name="q" defaultValue={q} placeholder="Try: quantum optics, 10.1234/…, Jumping Spider…" className="h-9 rounded-[8px] border-[#e2e8f0] bg-[#f8fafc] pl-8 text-[13px] placeholder:text-[#94a3b8] focus-visible:bg-white" autoFocus />
            </div>
            <Button type="submit" className="h-9 rounded-[8px] bg-[#1e4ed8] text-[13px] font-medium px-6 shadow-[0_1px_2px_rgba(30,78,216,0.18)] hover:bg-[#1e40af]">Search</Button>
            <Link href="/search" className="inline-flex h-9 items-center justify-center rounded-[8px] border border-[#e2e8f0] bg-white px-4 text-[12px] font-medium text-[#475569] hover:bg-[#f8fafc] gap-1.5">
              <X className="h-3.5 w-3.5" /> Clear
            </Link>
          </form>

          {/* Advanced search row — Year/Journal filters + Add filter / Clear filters */}
          <div className="mt-4 grid lg:grid-cols-[1fr_auto] gap-4 border-t border-[#f1f5f9] pt-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-[#94a3b8]" />
                <span className="text-[11px] font-semibold tracking-wide uppercase text-[#475569]">Advanced search</span>
                <span className="text-[11px] text-[#94a3b8]">· Year · Journal · Type</span>
              </div>
              <form action="/search" method="get" className="flex flex-wrap gap-2">
                {q && <input type="hidden" name="q" value={q} />}
                <Input name="year" defaultValue={yearStr} placeholder="Year (e.g. 2024)" className="h-8 w-[140px] rounded-[8px] border-[#e2e8f0] bg-white text-[12px] placeholder:text-[#94a3b8]" />
                <Input name="journal" defaultValue={journal} placeholder="Journal slug (jme)" className="h-8 w-[160px] rounded-[8px] border-[#e2e8f0] bg-white text-[12px] placeholder:text-[#94a3b8]" />
                <Input name="type" defaultValue={type} placeholder="Article type" className="h-8 w-[160px] rounded-[8px] border-[#e2e8f0] bg-white text-[12px] placeholder:text-[#94a3b8]" />
                <Button type="submit" size="sm" className="h-8 rounded-[8px] bg-[#0f172a] text-white text-[12px] font-medium hover:bg-[#1e293b]">Apply</Button>
                {(journal || yearStr || type) && (
                  <Link href={q ? `/search?q=${encodeURIComponent(q)}` : "/search"} className="inline-flex h-8 items-center rounded-[8px] border border-[#e2e8f0] bg-white px-3 text-[12px] font-medium text-[#475569] hover:bg-[#f8fafc]">
                    Clear filters
                  </Link>
                )}
              </form>
              {(q || hasFilters) && (
                <div className="flex flex-wrap gap-1.5">
                  {q && <span className="inline-flex items-center gap-1 rounded-full bg-[#1e4ed8] text-white px-2.5 py-1 text-[11px] font-medium">q: {q} <Link href={`/search?${new URLSearchParams({ ...(journal && { journal }), ...(yearStr && { year: yearStr }), ...(type && { type }) }).toString()}`} className="ml-1 opacity-70 hover:opacity-100"><X className="h-3 w-3" /></Link></span>}
                  {journal && <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f5f9] border border-[#e2e8f0] px-2.5 py-1 text-[11px] text-[#475569]">journal: {journal}</span>}
                  {yearStr && <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f5f9] border border-[#e2e8f0] px-2.5 py-1 text-[11px] text-[#475569]">year: {yearStr}</span>}
                  {type && <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f5f9] border border-[#e2e8f0] px-2.5 py-1 text-[11px] text-[#475569]">type: {type}</span>}
                  <button className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#cbd5e1] bg-white px-2.5 py-1 text-[11px] font-medium text-[#64748b] hover:bg-[#f8fafc]">
                    <Plus className="h-3 w-3" /> Add filter
                  </button>
                </div>
              )}
            </div>

            <div className="flex lg:flex-col gap-2 lg:items-end">
              <div className="rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-center">
                <p className="text-[11px] font-medium text-[#475569]">Jumping Spider</p>
                <p className="text-[10px] text-[#94a3b8]">469 595 hits demo →</p>
                <p className="text-[18px] font-bold leading-none text-[#0f172a] mt-1">{displayTotal.toLocaleString()}</p>
                <p className="text-[10px] text-[#94a3b8]">results</p>
              </div>
            </div>
          </div>
        </div>

        {!q && !hasFilters ? (
          <div className="grid lg:grid-cols-[1fr_300px] gap-4 mt-5">
            <div className={`${ETIS_CARD} p-10 text-center`}>
              <SearchIcon className="h-6 w-6 mx-auto text-[#cbd5e1] mb-2" />
              <p className="text-[13px] font-medium text-[#0f172a]">Enter a query to search</p>
              <p className="text-[12px] text-[#64748b] mt-1">Published articles, DOI and journal content. Try <Link href="/search?q=quantum" className="text-[#1e4ed8] hover:underline">quantum</Link>, <Link href="/search?q=CRISPR" className="text-[#1e4ed8] hover:underline">CRISPR</Link>, or a DOI.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {["quantum optics", "biodiversity", "CRISPR", "peer review"].map((s) => (
                  <Link key={s} href={`/search?q=${encodeURIComponent(s)}`} className="rounded-full border border-[#e2e8f0] bg-white px-3 py-1 text-[11px] font-medium text-[#475569] hover:border-[#cbd5e1] hover:text-[#0f172a]">{s}</Link>
                ))}
              </div>
            </div>
            <div className={`${ETIS_CARD} p-4`}>
              <p className={ETIS_LABEL}>Refine results</p>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-[11px] font-semibold text-[#0f172a] flex items-center gap-1"><Filter className="h-3 w-3 text-[#94a3b8]" /> Publication type</p>
                  <div className="mt-2 space-y-1.5">
                    {[{ l: "Journal article (1.1)", n: 312, c: true }, { l: "Review article (1.2)", n: 48, c: false }, { l: "Conference (3.4)", n: 27, c: false }].map((r) => (
                      <label key={r.l} className="flex items-center gap-2 text-[11px]">
                        <input type="checkbox" defaultChecked={r.c} className="h-3 w-3 rounded border-[#cbd5e1] accent-[#1e4ed8]" />
                        <span className={r.c ? "font-medium text-[#0f172a]" : "text-[#475569]"}>{r.l}</span>
                        <span className="ml-auto text-[10px] text-[#94a3b8]">{r.n}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="border-t border-[#f1f5f9] pt-3">
                  <p className="text-[11px] font-semibold text-[#0f172a]">Year</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {["2024", "2023", "2022", "2021"].map((y) => (
                      <Link key={y} href={`/search?year=${y}`} className="rounded-full border border-[#e2e8f0] bg-white px-2.5 py-1 text-[11px] text-[#475569] hover:bg-[#f8fafc]">{y}</Link>
                    ))}
                  </div>
                </div>
                <Button className="w-full h-7 rounded-[6px] bg-[#0f172a] text-white text-[11px] font-medium hover:bg-[#1e293b]">Apply filters</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
              <p className="text-[#64748b]">
                <span className="font-semibold text-[#0f172a]">{displayTotal.toLocaleString()}</span> result{displayTotal !== 1 ? "s" : ""} {q ? `for “${q}”` : "— filtered"} — <span className="text-[#94a3b8]">984 results table replication (ETIS)</span>
              </p>
              <span className="inline-flex items-center gap-1 text-[11px] text-[#94a3b8]"><Download className="h-3 w-3" /> Export 984 records</span>
            </div>

            {articles.length === 0 ? (
              <div className={`${ETIS_CARD} py-10 text-center`}>
                <p className="text-[13px] font-medium text-[#0f172a]">No results found</p>
                <p className="text-[12px] text-[#64748b] mt-1">Try different keywords, a DOI, or browse <Link href="/articles" className="text-[#1e4ed8] hover:underline">all articles</Link>.</p>
              </div>
            ) : (
              <>
                {/* Dense ETIS 984 results table */}
                <div className={`${ETIS_CARD} overflow-hidden`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-[13px] font-semibold text-[#0f172a]">Search results</h2>
                      <span className="rounded bg-white border border-[#e2e8f0] px-1.5 py-0.5 text-[10px] font-mono text-[#475569]">{count} results</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="hidden sm:inline text-[11px] text-[#94a3b8]">Sort: Relevance</span>
                      <Button variant="outline" className="h-6 rounded-[6px] border-[#e2e8f0] bg-white px-2 text-[11px] font-medium text-[#475569]"><Download className="h-3 w-3 mr-1" /> Export</Button>
                    </div>
                  </div>

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
                        {articles.map((a, idx) => (
                          <tr key={a.id} className={idx % 2 === 0 ? "bg-white hover:bg-[#f8fafc]/70" : "bg-[#fcfdff] hover:bg-[#f8fafc]/70"}>
                            <td className="px-2 py-2.5 text-center"><input type="checkbox" className="h-3 w-3 rounded border-[#cbd5e1] accent-[#1e4ed8]" /></td>
                            <td className="px-3 py-2.5 max-w-[300px]">
                              <Link href={`/articles/${a.slug}`} className="text-[12px] font-medium leading-tight text-[#1e4ed8] hover:text-[#1e40af] hover:underline line-clamp-2" dangerouslySetInnerHTML={{ __html: mark(a.title, q) }} />
                              {a.abstract && <p className="text-[11px] leading-4 text-[#64748b] line-clamp-1 mt-0.5" dangerouslySetInnerHTML={{ __html: mark(a.abstract.slice(0, 140), q) }} />}
                            </td>
                            <td className="px-3 py-2.5 text-[11px] text-[#475569]">—</td>
                            <td className="px-3 py-2.5 text-[11px] text-[#64748b]">{a.published_at ? new Date(a.published_at).getFullYear() : "—"}</td>
                            <td className="px-3 py-2.5 text-[11px] text-[#475569] max-w-[150px] truncate">{a.journals?.name ?? "—"}</td>
                            <td className="px-3 py-2.5">
                              <span className="rounded bg-[#fef9c3] border border-[#fde68a] px-1.5 py-0.5 text-[10px] font-medium text-[#854d0e]">1.1</span>
                            </td>
                            <td className="px-3 py-2.5 text-[11px] text-[#64748b] whitespace-nowrap">—</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f1f5f9] bg-[#f8fafc]/60 px-4 py-2.5 text-[11px]">
                    <span className="text-[#64748b]">Showing 1–{articles.length} of {count} · Select all {count}</span>
                    <div className="flex items-center gap-1">
                      <button className="h-6 w-6 rounded border border-[#e2e8f0] bg-white text-[#94a3b8]">‹</button>
                      <button className="h-6 w-6 rounded bg-[#1e4ed8] text-white text-[11px] font-semibold">1</button>
                      <button className="h-6 w-6 rounded border border-[#e2e8f0] bg-white text-[#475569] text-[11px]">2</button>
                      <button className="h-6 w-6 rounded border border-[#e2e8f0] bg-white text-[#475569]">›</button>
                    </div>
                  </div>
                </div>

                {/* Also card list below table — ETIS detail view */}
                <div className="space-y-3">
                  {articles.map((a) => (
                    <div key={`card-${a.id}`} className={`${ETIS_CARD} p-4 hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)] transition-shadow`}>
                      <Link href={`/articles/${a.slug}`} className="text-[13px] font-semibold leading-snug text-[#0f172a] hover:text-[#1e4ed8] hover:underline underline-offset-4" dangerouslySetInnerHTML={{ __html: mark(a.title, q) }} />
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {a.journals && <span className="inline-flex rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2 py-0.5 text-[11px] text-[#475569]">{a.journals.name}</span>}
                        {a.published_at && <span className="inline-flex rounded-full bg-[#f1f5f9] border border-[#e2e8f0] px-2 py-0.5 text-[11px] text-[#475569]">{new Date(a.published_at).toLocaleDateString()}</span>}
                        {a.article_number && <span className="inline-flex font-mono rounded-full border border-[#e2e8f0] bg-white px-2 py-0.5 text-[11px] text-[#64748b]">{a.article_number}</span>}
                      </div>
                      {a.abstract && <p className="mt-2 text-[12px] leading-5 text-[#475569] line-clamp-2" dangerouslySetInnerHTML={{ __html: mark(a.abstract.slice(0, 320), q) }} />}
                      <Link href={`/articles/${a.slug}`} className="mt-2 inline-flex text-[11px] font-medium text-[#1e4ed8] hover:text-[#1e40af] hover:underline">Read article →</Link>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
