// supabase/functions/api/index.ts — Metademic REST API (Deno)
// Full REST API for journals, manuscripts, reviews, decisions, APC, production
// Deploy: supabase functions deploy api --no-verify-jwt
// Invoke: https://<project>.supabase.co/functions/v1/api/<resource>

import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getServiceClient, getUserFromRequest, getUserClient } from "../_shared/supabase.ts";

// Workflow state machine (mirrors src/lib/workflow.ts)
const TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted"],
  submitted: ["technical_check"],
  technical_check: ["editor_assignment", "returned_to_author", "rejected"],
  returned_to_author: ["submitted", "withdrawn"],
  editor_assignment: ["editorial_screening", "rejected"],
  editorial_screening: ["reviewer_invitation", "rejected"],
  reviewer_invitation: ["under_review", "rejected"],
  under_review: ["reviews_complete", "rejected"],
  reviews_complete: ["decision_pending"],
  decision_pending: ["accepted", "minor_revision", "major_revision", "rejected", "withdrawn"],
  minor_revision: ["revision_submitted", "withdrawn"],
  major_revision: ["revision_submitted", "withdrawn"],
  revision_submitted: ["re_review", "withdrawn"],
  re_review: ["reviews_complete", "decision_pending"],
  accepted: ["apc_pending", "copyediting"],
  apc_pending: ["copyediting"],
  copyediting: ["typesetting"],
  typesetting: ["author_proof"],
  author_proof: ["production_approval"],
  production_approval: ["ready_to_publish"],
  ready_to_publish: ["published"],
  published: ["retracted"],
  rejected: [],
  withdrawn: [],
  retracted: [],
};

function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const url = new URL(req.url);
  // Path after /functions/v1/api is in url.pathname, e.g. /api/manuscripts or /manuscripts depending on gateway
  // Normalize: strip leading /api if present
  let path = url.pathname.replace(/^\/functions\/v1\/api/, "") || "/";
  if (path === "") path = "/";
  // Also handle direct /api prefix
  path = path.replace(/^\/api/, "") || "/";
  const method = req.method.toUpperCase();
  const service = getServiceClient();

  // Health
  if (path === "/" || path === "/health") {
    return jsonResponse({ ok: true, service: "metademic-api", time: new Date().toISOString() });
  }

  // Public: list journals (no auth)
  if (path === "/journals" && method === "GET") {
    const limit = Math.min(100, parseInt(url.searchParams.get("limit") || "50", 10));
    const q = url.searchParams.get("q");
    const status = url.searchParams.get("status") || "active";
    let query = service.from("journals").select("id,name,slug,short_name,status,default_apc,currency,doi_prefix,apc_enabled,issn_print,publisher_name,description").eq("status", status as never).limit(limit).order("created_at", { ascending: false });
    if (q) query = query.ilike("name", `%${q}%`);
    const { data, error } = await query;
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ data });
  }

  if (path.startsWith("/journals/") && method === "GET") {
    const slug = path.split("/")[2];
    const { data, error } = await service.from("journals").select("*").eq("slug", slug).maybeSingle();
    if (error) return errorResponse(error.message, 500);
    if (!data) return errorResponse("Journal not found", 404);
    return jsonResponse({ data });
  }

  // Public: articles
  if (path === "/articles" && method === "GET") {
    const limit = Math.min(50, parseInt(url.searchParams.get("limit") || "20", 10));
    const q = url.searchParams.get("q");
    let query = service.from("articles").select("id,slug,title,abstract,article_type,publication_status,published_at,journal_id,doi_records(doi)").in("publication_status", ["published", "early_access"] as never).limit(limit).order("published_at", { ascending: false });
    if (q) query = query.ilike("title", `%${q}%`);
    const { data, error } = await query;
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ data });
  }

  if (path.startsWith("/articles/") && method === "GET") {
    const slug = path.split("/")[2];
    const { data, error } = await service.from("articles").select("*, article_authors(*), doi_records(*), issues(*), journals(name,slug)").eq("slug", slug).maybeSingle();
    if (error) return errorResponse(error.message, 500);
    if (!data) return errorResponse("Article not found", 404);
    return jsonResponse({ data });
  }

  // Search (public)
  if (path === "/search" && method === "GET") {
    const q = url.searchParams.get("q");
    if (!q) return errorResponse("q is required", 400);
    const term = `%${q}%`;
    const { data: arts } = await service.from("articles").select("id,slug,title,abstract").ilike("title", term).in("publication_status", ["published", "early_access"] as never).limit(10);
    const { data: mans } = await service.from("manuscripts").select("id,manuscript_number,title,abstract").ilike("title", term).limit(10);
    return jsonResponse({ data: { articles: arts ?? [], manuscripts: mans ?? [] } });
  }

  // From here, require auth for most routes
  const user = await getUserFromRequest(req);
  const needsAuth = !(
    (path === "/journals" && method === "GET") ||
    path.startsWith("/articles") ||
    path === "/search"
  );
  // For manuscript creation/listing etc, require auth
  const authRequiredPaths = ["/manuscripts", "/reviews", "/decisions", "/notifications", "/upload/signature"];
  const isAuthRequired = authRequiredPaths.some((p) => path.startsWith(p));
  if (isAuthRequired && !user) return errorResponse("Unauthorized", 401);

  // Manuscripts
  if (path === "/manuscripts" && method === "GET") {
    if (!user) return errorResponse("Unauthorized", 401);
    const userClient = getUserClient(req.headers.get("Authorization"));
    // Use service for reliable, but filter by ownership or journal membership
    const { data, error } = await service.from("manuscripts").select("id,manuscript_number,title,status,current_version,journal_id,submitted_by,created_at, journals(name,slug)").or(`submitted_by.eq.${user.id},assigned_editor_id.eq.${user.id}`).limit(50).order("updated_at", { ascending: false });
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ data });
  }

  if (path === "/manuscripts" && method === "POST") {
    if (!user) return errorResponse("Unauthorized", 401);
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return errorResponse("Invalid JSON", 400); }
    const journal_id = body.journal_id as string;
    const title = body.title as string;
    if (!journal_id || !title || title.length < 10) return errorResponse("journal_id and title (min 10) required", 400);
    // Generate manuscript number via RPC
    const { data: num, error: numErr } = await service.rpc("generate_manuscript_number", { p_journal_id: journal_id });
    if (numErr) return errorResponse(`Number gen failed: ${numErr.message}`, 500);
    const { data, error } = await service.from("manuscripts").insert({
      journal_id,
      manuscript_number: num as unknown as string,
      title,
      abstract: (body.abstract as string) || null,
      article_type: (body.article_type as string) || "research_article",
      keywords: (body.keywords as string[]) || [],
      status: "draft",
      current_version: 1,
      submitted_by: user.id,
      corresponding_author_id: user.id,
    } as never).select("*").single();
    if (error) return errorResponse(error.message, 500);
    // Create version, audit, workflow
    await service.from("manuscript_versions").insert({ manuscript_id: (data as { id: string }).id, version_number: 1, revision_round: 0, version_label: "Initial" } as never);
    await service.from("workflow_events").insert({ manuscript_id: (data as { id: string }).id, actor_id: user.id, to_status: "draft", event_type: "manuscript.created" } as never);
    await service.from("audit_logs").insert({ actor_id: user.id, journal_id, manuscript_id: (data as { id: string }).id, action: "manuscript.created" } as never);
    return jsonResponse({ data }, 201);
  }

  // Manuscript by id
  const manuscriptMatch = path.match(/^\/manuscripts\/([^/]+)$/);
  if (manuscriptMatch && method === "GET") {
    const id = manuscriptMatch[1];
    const { data, error } = await service.from("manuscripts").select("*, journals(name,slug), manuscript_authors(*), manuscript_versions(*), manuscript_files(*)").eq("id", id).maybeSingle();
    if (error) return errorResponse(error.message, 500);
    if (!data) return errorResponse("Not found", 404);
    // Basic authz: must be owner or journal member
    const m = data as { submitted_by: string | null; journal_id: string };
    if (m.submitted_by !== user?.id) {
      const { data: mem } = await service.from("journal_members").select("role").eq("journal_id", m.journal_id).eq("user_id", user!.id).eq("is_active", true).limit(1);
      if (!mem?.length) return errorResponse("Forbidden", 403);
    }
    return jsonResponse({ data });
  }

  // Transition manuscript status (workflow)
  const transitionMatch = path.match(/^\/manuscripts\/([^/]+)\/transition$/);
  if (transitionMatch && method === "POST") {
    if (!user) return errorResponse("Unauthorized", 401);
    const id = transitionMatch[1];
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return errorResponse("Invalid JSON", 400); }
    const to_status = body.to_status as string;
    if (!to_status) return errorResponse("to_status required", 400);
    const { data: ms, error: msErr } = await service.from("manuscripts").select("id,status,journal_id").eq("id", id).maybeSingle();
    if (msErr || !ms) return errorResponse("Manuscript not found", 404);
    const from = (ms as { status: string }).status;
    if (!canTransition(from, to_status)) return errorResponse(`Invalid transition ${from} → ${to_status}`, 400);
    const { error: updErr } = await service.from("manuscripts").update({ status: to_status as never, updated_at: new Date().toISOString() } as never).eq("id", id);
    if (updErr) return errorResponse(updErr.message, 500);
    await service.from("workflow_events").insert({ manuscript_id: id, actor_id: user.id, from_status: from as never, to_status: to_status as never, event_type: `manuscript.transition:${from}->${to_status}` } as never);
    await service.from("audit_logs").insert({ actor_id: user.id, journal_id: (ms as { journal_id: string }).journal_id, manuscript_id: id, action: `manuscript.status.${to_status}`, old_data: { from_status: from }, new_data: { to_status } } as never);
    // Notify relevant parties
    await service.from("notifications").insert({
      user_id: (ms as unknown as { submitted_by: string }).submitted_by || user.id,
      journal_id: (ms as { journal_id: string }).journal_id,
      manuscript_id: id,
      type: "manuscript_status",
      title: `Manuscript ${to_status}`,
      message: `Manuscript transitioned from ${from} to ${to_status}`,
    } as never);
    return jsonResponse({ data: { from, to: to_status } });
  }

  // Reviews
  if (path === "/reviews" && method === "GET") {
    if (!user) return errorResponse("Unauthorized", 401);
    const { data, error } = await service.from("review_assignments").select("*, review_reports(*), manuscripts(title,manuscript_number)").limit(20);
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ data });
  }

  // Notifications for current user
  if (path === "/notifications" && method === "GET") {
    if (!user) return errorResponse("Unauthorized", 401);
    const { data, error } = await service.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ data });
  }

  // Fallback
  return errorResponse(`Not found: ${method} ${path}`, 404);
});
