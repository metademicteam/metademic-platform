import type { Metadata } from "next";
import Link from "next/link";
import { Users, Search, Calendar, GraduationCap, Filter, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Authors — Metademic",
  description: "Published authors on Metademic — institutional affiliation, field, ORCID, and number of publications.",
};

const PAGE_SIZE = 15;
const ETIS_CARD = "rounded-[12px] border border-[#e2e8f0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]";
const ETIS_LABEL = "text-[10px] font-semibold tracking-[0.14em] uppercase text-[#94a3b8]";

export default async function AuthorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; field?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const field = (sp.field ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  // Distinct authors of published articles. Group-by author identity (name + orcid)
  // for counts, and fetch paginated rows from that same publication-scoped set.
  let query = supabase
    .from("article_authors")
    .select(
      "id, first_name, last_name, orcid, affiliation, author_order, article_id, articles!inner(publication_status, published_at, article_number, title, journal_id, journals(name, slug))",
      { count: "exact" },
    )
    .eq("articles.publication_status", "published")
    .order("published_at", { ascending: false, referencedTable: "articles" })
    .range(from, to);

  if (q) {
    const safe = q.replace(/[%_\\]/g, "\\$&");
    query = query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,affiliation.ilike.%${safe}%`);
  }
  if (field) {
    const safeF = field.replace(/[%_\\]/g, "\\$&");
    query = query.ilike("affiliation", `%${safeF}%`);
  }

  const { data, count, error } = await query;
  type Row = { id: string; first_name: string; last_name: string; orcid: string | null; affiliation: string | null; author_order: number; article_id: string; articles: { publication_status: string; published_at: string | null; article_number: string | null; title: string | null; journal_id: string; journals: { name: string; slug: string } | null } | null };
  const rows = (data ?? []) as unknown as Row[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function qs(next: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    if ((next.q ?? q)) p.set("q", next.q ?? q);
    if ((next.field ?? field)) p.set("field", next.field ?? field);
    if (next.page) p.set("page", next.page);
    return p.toString();
  }

  return (
    <div className="min-h-screen bg-[#f0f3f8]">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-5">
        <div className="flex flex-col gap-1">
          <p className={ETIS_LABEL}>Registry · Authors</p>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#0f172a] flex items-center gap-2">
            <Users className="h-5 w-5 text-[#1e4ed8]" /> Authors
          </h1>
          <p className="text-[12px] leading-5 text-[#64748b]">Authors of published articles — searchable, sortable, full bibliographic linkage.</p>
        </div>

        <div className={`${ETIS_CARD} p-4`}>
          <form action="/authors" method="get" className="grid sm:grid-cols-[1.5fr_0.9fr_auto] gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
              <Input name="q" defaultValue={q} placeholder="Search name, ORCID, institution…" className="h-9 rounded-[8px] border-[#e2e8f0] bg-[#f8fafc] pl-8 text-[13px] placeholder:text-[#94a3b8] focus-visible:bg-white" />
            </div>
            <Input name="field" defaultValue={field} placeholder="Affiliation filter" className="h-9 rounded-[8px] border-[#e2e8f0] bg-[#f8fafc] text-[12px] focus-visible:bg-white" />
            <Button type="submit" className="h-9 rounded-[8px] bg-[#1e4ed8] text-[13px] font-medium px-5 shadow-[0_1px_2px_rgba(30,78,216,0.18)] hover:bg-[#1e40af]">Search</Button>
          </form>
          {(q || field) && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {q && <span className="inline-flex rounded-full bg-[#eff6ff] border border-[#dbeafe] px-2.5 py-1 text-[11px] font-medium text-[#1e40af]">q: {q}</span>}
              {field && <span className="inline-flex rounded-full bg-[#f1f5f9] border border-[#e2e8f0] px-2.5 py-1 text-[11px] text-[#475569]">field: {field}</span>}
              <Button variant="ghost" size="xs" asChild className="h-6 rounded-full border border-[#e2e8f0] bg-white text-[11px]"><Link href="/authors">Clear filters</Link></Button>
            </div>
          )}
        </div>

        {error ? (
          <div className={`${ETIS_CARD} py-10 text-center text-[13px] text-[#b91c1c] bg-[#fef2f2] border-[#fecaca]`}>Failed to load authors: {error.message}</div>
        ) : rows.length === 0 ? (
          <div className={`${ETIS_CARD} py-12 text-center`}>
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f8fafc] border border-dashed border-[#e2e8f0]">
              <GraduationCap className="h-5 w-5 text-[#94a3b8]" />
            </div>
            <p className="text-[13px] font-semibold text-[#0f172a] mt-3">No authors found</p>
            <p className="text-[12px] text-[#64748b] mt-1">Published authors appear once an article is published.</p>
          </div>
        ) : (
          <div className={`${ETIS_CARD} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-semibold text-[#0f172a]">Authors</h2>
                <span className="rounded bg-white border border-[#e2e8f0] px-1.5 py-0.5 text-[10px] font-mono text-[#475569]">{total} results</span>
                <span className="hidden sm:inline text-[11px] text-[#94a3b8]">· page {page} of {totalPages}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="hidden sm:inline text-[11px] text-[#94a3b8] flex items-center gap-1"><Filter className="h-3 w-3" /> Sort: Newest publication</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                    <th className="h-8 w-7 px-2 text-center"><input type="checkbox" className="h-3 w-3 rounded border-[#cbd5e1] accent-[#1e4ed8]" /></th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Author</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Affiliation</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Publication</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Journal</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Year</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9] bg-white">
                  {rows.map((r, idx) => (
                    <tr key={r.id} className={idx % 2 === 0 ? "bg-white hover:bg-[#f8fafc]/70" : "bg-[#fcfdff] hover:bg-[#f8fafc]/70"}>
                      <td className="px-2 py-2.5 text-center"><input type="checkbox" className="h-3 w-3 rounded border-[#cbd5e1] accent-[#1e4ed8]" /></td>
                      <td className="px-3 py-2.5 max-w-[260px]">
                        <span className="text-[12px] font-medium leading-tight text-[#0f172a]">
                          {(r.first_name + " " + r.last_name).trim() || "—"}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          {r.orcid && <span className="text-[10px] font-mono text-[#16a34a] border border-[#bbf7d0] rounded px-1 py-0.5 bg-[#f0fdf4]">{r.orcid}</span>}
                          <span className="text-[10px] text-[#94a3b8]">#{r.author_order}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-[#475569] max-w-[220px] truncate" title={r.affiliation ?? ""}>{r.affiliation || "—"}</td>
                      <td className="px-3 py-2.5 max-w-[280px]">
                        {r.articles?.title ? (
                          <Link href={`/articles/${r.articles.title ? r.article_id : r.id}`} className="text-[12px] font-medium leading-tight text-[#1e4ed8] hover:text-[#1e40af] hover:underline line-clamp-2">
                            {r.articles.title}
                          </Link>
                        ) : (
                          <span className="text-[11px] text-[#94a3b8]">—</span>
                        )}
                        <span className="mt-1 inline-flex font-mono text-[10px] text-[#94a3b8] border border-[#e2e8f0] rounded px-1 py-0.5 bg-[#f8fafc]">{r.articles?.article_number ? String(r.articles.article_number).slice(0, 28) : r.article_id.slice(0, 12)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-[#475569] max-w-[160px] truncate">{r.articles?.journals?.name ?? "—"}</td>
                      <td className="px-3 py-2.5 text-[11px] text-[#64748b] flex items-center gap-1"><Calendar className="h-3 w-3 text-[#94a3b8]" /> {r.articles?.published_at ? new Date(r.articles.published_at).getFullYear() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f1f5f9] bg-[#f8fafc]/60 px-4 py-2.5 text-[11px]">
              <span className="text-[#64748b]">Showing {from + 1}–{Math.min(to + 1, total)} of {total} · Select all {total}</span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="xs" disabled={page <= 1} asChild={page > 1} className="h-7 rounded-[6px] border-[#e2e8f0] bg-white">
                  {page > 1 ? <Link href={`/authors?${new URLSearchParams({ ...(q && { q }), ...(field && { field }), page: String(page - 1) })}`}>‹ Previous</Link> : <span>‹ Previous</span>}
                </Button>
                <span className="px-2 text-[#475569] font-medium">Page {page} of {totalPages}</span>
                <Button variant="outline" size="xs" disabled={page >= totalPages} asChild={page < totalPages} className="h-7 rounded-[6px] border-[#e2e8f0] bg-white">
                  {page < totalPages ? <Link href={`/authors?${new URLSearchParams({ ...(q && { q }), ...(field && { field }), page: String(page + 1) })}`}>Next ›</Link> : <span>Next ›</span>}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
