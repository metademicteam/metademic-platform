import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Mock Crossref deposit callback.
 * Crossref would POST deposit result; here we simulate:
 * POST { doi, status: "registered"|"failed", error?: string, articleId? }
 *
 * Optionally verifies a shared secret via X-Crossref-Secret header if CROSSREF_WEBHOOK_SECRET is set.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CROSSREF_WEBHOOK_SECRET;
  if (secret) {
    const header = req.headers.get("x-crossref-secret") ?? req.headers.get("x-webhook-secret");
    if (header !== secret) return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const b = body as Record<string, unknown>;
  const doi = b.doi as string | undefined;
  const articleId = b.articleId as string | undefined;
  const status = (b.status as string | undefined) ?? "registered";
  const errorMsg = b.error as string | undefined;

  if (!doi && !articleId) return NextResponse.json({ error: "doi or articleId required" }, { status: 400 });

  const admin = createAdminClient();

  // Find doi_records by doi or articleId
  let record: { id: string; article_id: string; doi: string } | null = null;
  if (doi) {
    const { data } = await admin.from("doi_records").select("id, article_id, doi").eq("doi", doi).maybeSingle();
    record = (data as unknown as { id: string; article_id: string; doi: string } | null);
  }
  if (!record && articleId) {
    const { data } = await admin.from("doi_records").select("id, article_id, doi").eq("article_id", articleId).maybeSingle();
    record = (data as unknown as { id: string; article_id: string; doi: string } | null);
  }
  if (!record) return NextResponse.json({ error: "DOI record not found" }, { status: 404 });

  if (status === "registered") {
    await admin.from("doi_records").update({ registration_status: "registered", registered_at: new Date().toISOString(), last_deposit_at: new Date().toISOString(), last_error: null, metadata: { ...((b.metadata as Record<string, unknown>) ?? {}), webhook_status: status } } as never).eq("id", record.id);
    await admin.from("system_jobs").insert({ job_type: "doi_registration", entity_type: "article", entity_id: record.article_id, status: "completed", payload: { doi: record.doi, status: "registered", webhook: true } } as never);
  } else if (status === "failed") {
    await admin.from("doi_records").update({ registration_status: "failed", last_error: errorMsg ?? "Crossref deposit failed (mock webhook)", last_deposit_at: new Date().toISOString() } as never).eq("id", record.id);
    await admin.from("system_jobs").insert({ job_type: "doi_registration", entity_type: "article", entity_id: record.article_id, status: "failed", error_message: errorMsg ?? "mock failure", payload: { doi: record.doi, status: "failed" } } as never);
  } else {
    await admin.from("doi_records").update({ registration_status: status as never, last_deposit_at: new Date().toISOString() } as never).eq("id", record.id);
  }

  await admin.from("audit_logs").insert({ action: "doi.webhook", entity_type: "doi_record", entity_id: record.id, new_data: { doi: record.doi, status } } as never);

  return NextResponse.json({ received: true, doi: record.doi, status });
}

// Health / list recent DOI jobs
export async function GET(req: NextRequest) {
  const secret = process.env.CROSSREF_WEBHOOK_SECRET;
  // No auth required for GET unless secret configured — but allow for admin
  const doi = new URL(req.url).searchParams.get("doi");
  const admin = createAdminClient();
  if (doi) {
    const { data } = await admin.from("doi_records").select("*").eq("doi", doi).maybeSingle();
    return NextResponse.json({ data: data ?? null });
  }
  const { data } = await admin.from("doi_records").select("id, doi, doi_url, registration_status, created_at").order("created_at", { ascending: false }).limit(20);
  return NextResponse.json({ data: data ?? [] });
}
