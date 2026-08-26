import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DoiGenerationInput {
  prefix: string; // e.g. "10.12345"
  suffixPattern?: string | null; // optional template, e.g. "journal.{year}.{sequence}"
  journalSlug?: string;
  manuscriptNumber?: string;
}

export interface CrossrefMetadata {
  doi_batch_id: string;
  timestamp: string;
  depositor: { name: string; email: string };
  registrant: string;
  journal: {
    journal_title: string;
    abbrev_title?: string;
    issn_print?: string | null;
    issn_online?: string | null;
  };
  article: {
    title: string;
    contributors: { given_name: string; surname: string; orcid?: string; affiliation?: string }[];
    abstract?: string | null;
    publication_date: { year: number; month?: number; day?: number };
    doi: string;
    resource: string; // public URL
    license_url?: string | null;
  };
}

// ---------------------------------------------------------------------------
// DOI helpers
// ---------------------------------------------------------------------------

/**
 * Normalise and validate a DOI prefix (must be 10.xxxx).
 */
export function validateDoiPrefix(prefix: string): void {
  if (!/^10\.\d{4,9}(\.\d+)*$/.test(prefix.trim())) {
    throw new Error(`Invalid DOI prefix "${prefix}". Expected format "10.xxxx" (e.g. 10.12345).`);
  }
}

/**
 * Generate a DOI suffix.
 * If a pattern is provided, perform simple token replacement.
 * Tokens: {year}, {journal}, {manuscript}, {sequence}
 * Otherwise delegate to DB sequence via RPC.
 */
export async function generateDoi(
  supabase: SupabaseClient,
  input: DoiGenerationInput,
): Promise<{ doi: string; prefix: string; suffix: string }> {
  const prefix = input.prefix.trim();
  validateDoiPrefix(prefix);

  let suffix: string;

  if (input.suffixPattern) {
    // Try DB sequence for {sequence} token
    let sequence = "";
    if (input.suffixPattern.includes("{sequence}")) {
      const { data, error } = await supabase.rpc("generate_doi_suffix" as never);
      if (error) throw new Error(`Failed to generate DOI suffix: ${error.message}`);
      sequence = String(data);
    }
    suffix = input.suffixPattern
      .replaceAll("{year}", String(new Date().getFullYear()))
      .replaceAll("{journal}", (input.journalSlug ?? "journal").toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"))
      .replaceAll("{manuscript}", (input.manuscriptNumber ?? "000000").toLowerCase())
      .replaceAll("{sequence}", sequence);
  } else {
    const { data, error } = await supabase.rpc("generate_doi_suffix" as never);
    if (error) throw new Error(`Failed to generate DOI suffix: ${error.message}`);
    suffix = String(data);
  }

  // Ensure suffix is URL-safe and lowercased
  suffix = suffix.trim();

  const doi = `${prefix}/${suffix}`;
  return { doi, prefix, suffix };
}

/**
 * Build Crossref-compatible deposit metadata.
 * This does not perform the HTTP deposit — it prepares the payload so a worker/Edge Function can submit it.
 */
export function buildCrossrefMetadata(params: {
  journal: {
    name: string;
    shortName?: string | null;
    issnPrint?: string | null;
    issnOnline?: string | null;
    publisherName?: string | null;
  };
  article: {
    title: string;
    abstract?: string | null;
    doi: string;
    publicUrl: string;
    licenseUrl?: string | null;
    publicationDate?: Date;
    authors: { firstName: string; lastName: string; orcid?: string | null; affiliation?: string | null }[];
  };
  depositor: { name: string; email: string };
  registrant?: string;
}): CrossrefMetadata {
  const pubDate = params.article.publicationDate ?? new Date();
  return {
    doi_batch_id: `metademic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: String(Date.now()),
    depositor: params.depositor,
    registrant: params.registrant ?? params.journal.publisherName ?? params.journal.name,
    journal: {
      journal_title: params.journal.name,
      abbrev_title: params.journal.shortName ?? undefined,
      issn_print: params.journal.issnPrint ?? null,
      issn_online: params.journal.issnOnline ?? null,
    },
    article: {
      title: params.article.title,
      contributors: params.article.authors.map((a) => ({
        given_name: a.firstName,
        surname: a.lastName,
        orcid: a.orcid ?? undefined,
        affiliation: a.affiliation ?? undefined,
      })),
      abstract: params.article.abstract ?? null,
      publication_date: {
        year: pubDate.getFullYear(),
        month: pubDate.getMonth() + 1,
        day: pubDate.getDate(),
      },
      doi: params.article.doi,
      resource: params.article.publicUrl,
      license_url: params.article.licenseUrl ?? null,
    },
  };
}

/**
 * Persist a DOI record for an article. Upserts on article_id.
 */
export async function upsertDoiRecord(
  supabase: SupabaseClient,
  params: {
    articleId: string;
    doi: string;
    prefix: string;
    suffix: string;
    status?: "pending" | "queued" | "registered" | "failed" | "updated";
    metadata?: Record<string, unknown>;
  },
) {
  const doiUrl = `https://doi.org/${params.doi}`;

  // Check existing
  const { data: existing } = await supabase
    .from("doi_records")
    .select("id")
    .eq("article_id", params.articleId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("doi_records")
      .update({
        doi: params.doi,
        doi_url: doiUrl,
        prefix: params.prefix,
        suffix: params.suffix,
        registration_status: params.status ?? "pending",
        metadata: (params.metadata ?? {}) as never,
      } as never)
      .eq("id", (existing as { id: string }).id)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to update DOI record: ${error.message}`);
    return data;
  }

  const { data, error } = await supabase
    .from("doi_records")
    .insert({
      article_id: params.articleId,
      doi: params.doi,
      doi_url: doiUrl,
      prefix: params.prefix,
      suffix: params.suffix,
      registration_status: params.status ?? "pending",
      metadata: (params.metadata ?? {}) as never,
    } as never)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create DOI record: ${error.message}`);
  return data;
}

/**
 * Queue a background job for DOI registration (via system_jobs).
 * The actual Crossref HTTP call should be performed by a worker that picks up this job.
 */
export async function queueDoiRegistration(
  supabase: SupabaseClient,
  params: { articleId: string; doi: string; metadata: CrossrefMetadata },
) {
  const { data, error } = await supabase
    .from("system_jobs")
    .insert({
      job_type: "doi_registration",
      entity_type: "article",
      entity_id: params.articleId,
      status: "pending",
      payload: {
        doi: params.doi,
        crossref: params.metadata,
      } as never,
    } as never)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to queue DOI registration job: ${error.message}`);
  return data;
}
