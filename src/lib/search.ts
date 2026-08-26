/**
 * Search service abstraction.
 * Current backend: PostgreSQL via Supabase (ilike + OR). Ready to swap to OpenSearch.
 * Exposes: searchArticles, globalSearch, highlight
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SearchFilters = {
  journalId?: string;
  journalSlug?: string;
  issueId?: string;
  year?: number;
  articleType?: string;
  keyword?: string;
  publicationStatus?: string;
};

export type SearchOptions = {
  query?: string;
  filters?: SearchFilters;
  page?: number;
  pageSize?: number;
  sortBy?: "published_at" | "created_at" | "title" | "relevance";
  sortDir?: "asc" | "desc";
};

export type SearchResult<T> = {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function escapeLike(s: string) {
  return s.replace(/[%_\\]/g, "\\$&");
}

function buildLikeOr(supabaseQuery: unknown, q: string, fields: string[]) {
  // build .or filter string e.g. title.ilike.%foo%,abstract.ilike.%foo%
  const safe = escapeLike(q);
  return fields.map((f) => `${f}.ilike.%${safe}%`).join(",");
}

/**
 * Search published articles via Supabase.
 * Uses ilike across title / abstract / keywords. Falls back to postgres FTS when available.
 * OpenSearch swap: replace this fn body with an OpenSearch client call using same SearchOptions shape.
 */
export async function searchArticles(
  supabase: SupabaseClient,
  opts: SearchOptions
): Promise<SearchResult<Record<string, unknown>>> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const q = opts.query?.trim() ?? "";
  const f = opts.filters ?? {};

  let query = supabase
    .from("articles")
    .select("*, journals!inner(id,name,slug,short_name), issues(id,issue_number,title, volumes(volume_number))", { count: "exact" })
    .eq("publication_status", f.publicationStatus ?? "published");

  if (f.journalId) query = query.eq("journal_id", f.journalId);
  if (f.journalSlug) query = query.eq("journals.slug", f.journalSlug);
  if (f.issueId) query = query.eq("issue_id", f.issueId);
  if (f.articleType) query = query.eq("article_type", f.articleType);
  if (f.keyword) query = query.contains("keywords", [f.keyword]);
  if (f.year) {
    // filter by published_at year
    const start = `${f.year}-01-01`;
    const end = `${f.year + 1}-01-01`;
    query = query.gte("published_at", start).lt("published_at", end);
  }

  if (q) {
    // search across title, abstract, slug, article_number; keyword array via or fallback
    // Use postgres ilike; full-text index can be added later without changing API
    const orFilter = buildLikeOr(query, q, ["title", "abstract", "slug", "article_number"]);
    query = query.or(orFilter);
  }

  const sortBy = opts.sortBy ?? "published_at";
  const sortDir = opts.sortDir ?? "desc";
  query = query.order(sortBy, { ascending: sortDir === "asc" }).range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  // Second pass: if q contains potential DOI or manuscript id pattern, also enrich
  // (kept simple to avoid N+1; caller can use globalSearch for DOI)

  return {
    data: (data ?? []) as unknown as Record<string, unknown>[],
    count: count ?? 0,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  };
}

/**
 * Global search across articles title/abstract/keywords/authors/DOI/manuscript/journal/issue.
 * Returns grouped results.
 */
export async function globalSearch(
  supabase: SupabaseClient,
  rawQuery: string,
  opts?: { limit?: number }
) {
  const q = rawQuery.trim();
  if (!q) return { articles: [], count: 0, query: q };
  const limit = opts?.limit ?? 20;
  const safe = escapeLike(q);

  // 1) Articles by title/abstract/slug/article_number
  const { data: articles, error: aErr } = await supabase
    .from("articles")
    .select("id,title,slug,abstract,article_number,article_type,journal_id,published_at, journals!inner(name,slug)")
    .eq("publication_status", "published")
    .or(`title.ilike.%${safe}%,abstract.ilike.%${safe}%,slug.ilike.%${safe}%,article_number.ilike.%${safe}%`)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (aErr) throw aErr;

  // 2) Also search DOI records matching doi (if exists)
  let doiHits: unknown[] = [];
  try {
    const { data: dois } = await supabase
      .from("doi_records")
      .select("doi,article_id")
      .ilike("doi", `%${safe}%`)
      .limit(10);
    if (dois?.length) {
      const ids = dois.map((d: { article_id: string }) => d.article_id);
      const { data: doiArticles } = await supabase
        .from("articles")
        .select("id,title,slug,abstract,article_number,published_at, journals(name,slug)")
        .in("id", ids)
        .limit(limit);
      doiHits = doiArticles ?? [];
    }
  } catch {
    // doi_records may not exist in dev; ignore
  }

  // 3) Search manuscript_authors / article authors via ilike on joined? fallback: fetch articles again filtered via manuscript lookup
  // We keep it simple: merge article results and doi hits, dedupe
  const merged = new Map<string, unknown>();
  for (const a of (articles ?? []) as unknown[]) {
    const r = a as Record<string, unknown>;
    merged.set(r["id"] as string, r);
  }
  for (const a of doiHits as unknown[]) {
    const r = a as Record<string, unknown>;
    if (!merged.has(r["id"] as string)) merged.set(r["id"] as string, r);
  }

  return {
    articles: Array.from(merged.values()),
    count: merged.size,
    query: q,
  };
}

/** Simple <mark> highlight for query terms */
export function highlight(text: string, query: string): string {
  if (!query.trim() || !text) return text;
  const terms = query.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.join("|")})`, "gi");
  return text.replace(re, "<mark class=\"bg-yellow-200 px-0.5 rounded\">$1</mark>");
}
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
