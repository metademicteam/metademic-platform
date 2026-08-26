import type { SupabaseClient } from "@supabase/supabase-js";
import type { Manuscript, ManuscriptStatus } from "@/types/database";

/**
 * Data-access layer for manuscripts.
 * Thin wrappers — no business logic, no workflow checks.
 * Callers should use services for validated operations.
 */

export type ManuscriptFilters = {
  journalId?: string;
  status?: ManuscriptStatus | ManuscriptStatus[];
  submittedBy?: string;
  assignedEditorId?: string;
  search?: string;
  articleType?: string;
  page?: number;
  pageSize?: number;
  orderBy?: "created_at" | "submitted_at" | "updated_at";
  orderDirection?: "asc" | "desc";
};

export type ManuscriptListResult = {
  data: Manuscript[];
  count: number;
  page: number;
  pageSize: number;
};

type ManuscriptQuery = ReturnType<ReturnType<ReturnType<SupabaseClient["from"]>["select"]>["order"]>;

function applyFilters(
  query: ManuscriptQuery,
  filters: ManuscriptFilters,
) {
  let q = query;
  // Cast to `any` for dynamic chaining — supabase types are overly strict for generic helpers.
  const anyQ = q as unknown as {
    eq: (col: string, val: string) => typeof anyQ;
    in: (col: string, vals: string[]) => typeof anyQ;
    ilike: (col: string, pattern: string) => typeof anyQ;
    or: (expr: string) => typeof anyQ;
  };

  if (filters.journalId) q = (anyQ.eq("journal_id", filters.journalId) as unknown as typeof q);
  if (filters.assignedEditorId)
    q = (anyQ.eq("assigned_editor_id", filters.assignedEditorId) as unknown as typeof q);
  if (filters.submittedBy)
    q = (anyQ.eq("submitted_by", filters.submittedBy) as unknown as typeof q);
  if (filters.articleType) q = (anyQ.eq("article_type", filters.articleType) as unknown as typeof q);
  if (filters.status) {
    if (Array.isArray(filters.status)) {
      q = (anyQ.in("status", filters.status) as unknown as typeof q);
    } else {
      q = (anyQ.eq("status", filters.status) as unknown as typeof q);
    }
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    // search in title + abstract + manuscript_number
    q = (anyQ.or(
      `title.ilike.${term},abstract.ilike.${term},manuscript_number.ilike.${term}`,
    ) as unknown as typeof q);
  }
  return q;
}

export async function listManuscripts(
  supabase: SupabaseClient,
  filters: ManuscriptFilters = {},
): Promise<ManuscriptListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const orderBy = filters.orderBy ?? "created_at";
  const ascending = (filters.orderDirection ?? "desc") === "asc";

  let query = supabase
    .from("manuscripts")
    .select("*", { count: "exact" })
    .order(orderBy, { ascending })
    .range(from, to);

  query = applyFilters(query, filters);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to list manuscripts: ${error.message}`);

  return {
    data: (data ?? []) as Manuscript[],
    count: count ?? 0,
    page,
    pageSize,
  };
}

export async function getManuscriptById(
  supabase: SupabaseClient,
  id: string,
): Promise<Manuscript | null> {
  const { data, error } = await supabase.from("manuscripts").select("*").eq("id", id).single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to fetch manuscript: ${error.message}`);
  }
  return data as Manuscript;
}

export async function getManuscriptByNumber(
  supabase: SupabaseClient,
  journalId: string,
  manuscriptNumber: string,
): Promise<Manuscript | null> {
  const { data, error } = await supabase
    .from("manuscripts")
    .select("*")
    .eq("journal_id", journalId)
    .eq("manuscript_number", manuscriptNumber)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to fetch manuscript: ${error.message}`);
  }
  return data as Manuscript;
}

export async function createManuscriptRow(
  supabase: SupabaseClient,
  payload: Partial<Manuscript> & { journal_id: string; title: string },
): Promise<Manuscript> {
  const { data, error } = await supabase
    .from("manuscripts")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`Failed to create manuscript: ${error.message}`);
  return data as Manuscript;
}

export async function updateManuscriptRow(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Manuscript>,
): Promise<Manuscript> {
  const { data, error } = await supabase
    .from("manuscripts")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`Failed to update manuscript: ${error.message}`);
  return data as Manuscript;
}

export async function countManuscriptsByStatus(
  supabase: SupabaseClient,
  journalId?: string,
): Promise<Record<string, number>> {
  let query = supabase.from("manuscripts").select("status", { count: "exact" });
  if (journalId) query = query.eq("journal_id", journalId);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to count manuscripts: ${error.message}`);

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Pick<Manuscript, "status">[]) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}
