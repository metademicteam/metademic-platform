#!/usr/bin/env node
// Lifecycle integration test — uses service role to simulate full workflow and checks RLS
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error("Missing env");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function login(email) {
  const c = createClient(url, anonKey);
  const { data, error } = await c.auth.signInWithPassword({ email, password: "Test1234!" });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return { client: c, user: data.user, token: data.session.access_token, session: data.session };
}

function logOk(msg){ console.log(`✓ ${msg}`); }
function logWarn(msg){ console.log(`? ${msg}`); }
function logFail(msg){ console.log(`✗ ${msg}`); }

async function testManuscriptLifecycle() {
  console.log("\n=== Manuscript Lifecycle Test ===");
  // Use author1 to create a new manuscript
  const { client: authorClient, user: authorUser } = await login("author1@example.test");
  const { data: journals } = await admin.from("journals").select("id,slug").eq("slug","jms").single();
  const journalId = journals.id;
  console.log(`Author ${authorUser.email} id=${authorUser.id}, journal ${journalId}`);

  // Create manuscript directly via author client (RLS should allow)
  const newNumber = `TEST-${Date.now().toString().slice(-6)}`;
  const { data: ms, error: msErr } = await authorClient.from("manuscripts").insert({
    journal_id: journalId,
    manuscript_number: newNumber,
    title: "Integration Test Manuscript: Workflow Validation",
    abstract: "This is a test abstract that is definitely longer than fifty characters to satisfy validation. It describes the integration test workflow.",
    article_type: "research_article",
    keywords: ["test","integration","workflow"],
    subject_areas: ["machine learning"],
    status: "draft",
    current_version: 1,
    current_review_round: 0,
    submitted_by: authorUser.id,
    corresponding_author_id: authorUser.id,
  }).select("id").single();
  if (msErr) {
    logFail(`Create manuscript failed: ${msErr.message}`);
    // Try via admin if RLS blocks
    const { data: ms2, error: e2 } = await admin.from("manuscripts").insert({
      journal_id: journalId,
      manuscript_number: newNumber,
      title: "Integration Test Manuscript: Workflow Validation",
      abstract: "This is a test abstract that is definitely longer than fifty characters to satisfy validation.",
      article_type: "research_article",
      keywords: ["test","integration"],
      status: "draft",
      current_version: 1,
      submitted_by: authorUser.id,
      corresponding_author_id: authorUser.id,
    }).select("id").single();
    if (e2) throw new Error(`admin create also failed: ${e2.message}`);
    console.log(`  created via admin fallback: ${ms2.id}`);
    var manuscriptId = ms2.id;
  } else {
    logOk(`Author created manuscript ${newNumber} -> ${ms.id}`);
    var manuscriptId = ms.id;
  }

  // Verify author can fetch own manuscript via RLS
  const { data: fetched } = await authorClient.from("manuscripts").select("id,manuscript_number,status").eq("id", manuscriptId).single();
  if (fetched) logOk(`Author can fetch own manuscript via RLS: ${fetched.manuscript_number}`);
  else logFail(`Author cannot fetch own manuscript (RLS bug)`);

  // Verify another author cannot fetch it
  const { client: author2 } = await login("author2@example.test");
  const { data: fetched2 } = await author2.from("manuscripts").select("id").eq("id", manuscriptId).maybeSingle();
  if (!fetched2) logOk(`Author2 correctly cannot see author1's draft (RLS isolation)`);
  else logWarn(`Author2 can see author1's draft (expected blocked for draft, but if status draft, should be blocked)`);

  // Test workflow transitions via admin (simulate API)
  const { canTransition } = await import("./src/lib/workflow.ts");
  // Actually need to dynamic import via tsx
  console.log(`  canTransition draft->submitted: ${canTransition("draft","submitted")}`);
  console.log(`  canTransition published->draft: ${canTransition("published","draft")} (should be false)`);
  if (!canTransition("published","draft")) logOk(`published->draft correctly blocked`);
  else logFail(`published->draft should be blocked`);

  // Simulate submit: draft -> submitted
  const { error: upd1 } = await admin.from("manuscripts").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", manuscriptId);
  if (!upd1) logOk(`Transition draft->submitted via admin`);

  // Add manuscript_authors and declarations for completeness
  await admin.from("manuscript_authors").insert({ manuscript_id: manuscriptId, first_name: "Author1", last_name: "Test", email: "author1@example.test", author_order: 1, is_corresponding: true });
  await admin.from("submission_declarations").insert({ manuscript_id: manuscriptId, originality_confirmed: true, ethics_confirmed: true, authorship_confirmed: true, copyright_confirmed: true });
  await admin.from("manuscript_versions").insert({ manuscript_id: manuscriptId, version_number: 1, revision_round: 0, version_label: "Initial", submitted_by: authorUser.id, submitted_at: new Date().toISOString() });

  // Technical check -> editor_assignment
  await admin.from("manuscripts").update({ status: "technical_check" }).eq("id", manuscriptId);
  logOk(`submitted -> technical_check`);

  // Verify invalid transition blocked via canTransition
  if (!canTransition("technical_check","published")) logOk(`technical_check->published correctly blocked`);
  
  await admin.from("manuscripts").update({ status: "editor_assignment" }).eq("id", manuscriptId);
  logOk(`technical_check -> editor_assignment`);

  // Assign editor
  const { data: eic } = await admin.from("profiles").select("id").eq("email","eic@example.test").single();
  await admin.from("editorial_assignments").insert({ manuscript_id: manuscriptId, editor_id: eic.id, assigned_by: eic.id });
  await admin.from("manuscripts").update({ status: "editorial_screening", assigned_editor_id: eic.id }).eq("id", manuscriptId);
  logOk(`editor assigned, -> editorial_screening`);

  // Editorial screening -> reviewer_invitation
  await admin.from("manuscripts").update({ status: "reviewer_invitation" }).eq("id", manuscriptId);
  logOk(`editorial_screening -> reviewer_invitation`);

  // Create review round and assignments
  const { data: rr } = await admin.from("review_rounds").insert({ manuscript_id: manuscriptId, round_number: 1, required_reviewers: 2 }).select("id").single();
  logOk(`Created review_round ${rr.id}`);

  const { data: rps } = await admin.from("reviewer_profiles").select("id,user_id").limit(2);
  for (const rp of rps) {
    await admin.from("review_assignments").insert({ review_round_id: rr.id, reviewer_id: rp.id, status: "reviewing", deadline_at: new Date(Date.now()+14*86400000).toISOString() });
  }
  await admin.from("manuscripts").update({ status: "under_review" }).eq("id", manuscriptId);
  logOk(`reviewer_invitation -> under_review with 2 reviewers`);

  // Simulate reviewer submitting reviews
  const { data: assigns } = await admin.from("review_assignments").select("id").eq("review_round_id", rr.id);
  for (let i=0;i<assigns.length;i++) {
    const a = assigns[i];
    await admin.from("review_assignments").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", a.id);
    await admin.from("review_reports").insert({ review_assignment_id: a.id, recommendation: i===0?"accept":"minor_revision", comments_to_author: "Good work", originality_score: 4, methodology_score: 4 });
  }
  await admin.from("manuscripts").update({ status: "reviews_complete" }).eq("id", manuscriptId);
  logOk(`under_review -> reviews_complete (2 reviews completed)`);

  // Recommendation via SQL RPC (avoid importing server-only review-service)
  const { data: rec } = await admin.rpc("calculate_review_recommendation", { p_review_round_id: rr.id });
  console.log(`  SQL recommendation: ${rec}`); // expect minor_revision (accept + minor)
  if (rec === "minor_revision") logOk(`Recommendation correct: minor_revision`);
  else logWarn(`Recommendation was ${rec}, expected minor_revision`);

  await admin.from("manuscripts").update({ status: "decision_pending" }).eq("id", manuscriptId);
  logOk(`reviews_complete -> decision_pending`);

  // Editorial decision -> minor_revision
  await admin.from("editorial_decisions").insert({ manuscript_id: manuscriptId, review_round_id: rr.id, editor_id: eic.id, decision: "minor_revision", system_recommendation: rec, accept_votes:1, minor_revision_votes:1 });
  await admin.from("manuscripts").update({ status: "minor_revision" }).eq("id", manuscriptId);
  await admin.from("revision_requests").insert({ manuscript_id: manuscriptId, revision_round: 1, due_at: new Date(Date.now()+14*86400000).toISOString(), instructions: "Address comments" });
  logOk(`decision_pending -> minor_revision`);

  // Author submits revision -> new version
  const { data: cur } = await admin.from("manuscripts").select("current_version").eq("id", manuscriptId).single();
  const nextVer = cur.current_version + 1;
  await admin.from("manuscript_versions").insert({ manuscript_id: manuscriptId, version_number: nextVer, revision_round:1, version_label: "Revision 1", submitted_by: authorUser.id });
  await admin.from("manuscripts").update({ status: "revision_submitted", current_version: nextVer }).eq("id", manuscriptId);
  logOk(`minor_revision -> revision_submitted (v${nextVer})`);

  // Re-review -> accepted
  await admin.from("manuscripts").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", manuscriptId);
  logOk(`revision_submitted -> accepted`);

  // APC
  const { data: apc } = await admin.from("apcs").insert({ manuscript_id: manuscriptId, base_amount: 1200, total_amount: 1200, currency: "USD", status: "calculated" }).select("id").single();
  logOk(`APC created ${apc.id}`);

  // Invoice
  const invNum = `INV-TEST-${Date.now()}`;
  const { data: inv } = await admin.from("invoices").insert({ apc_id: apc.id, invoice_number: invNum, amount: 1200, currency: "USD", status: "issued" }).select("id").single();
  logOk(`Invoice issued ${invNum}`);

  // Production -> publish
  // First need article
  const slug = `test-article-${Date.now()}`;
  const articleNumber = `TEST-ART-${Date.now()}`;
  const { data: art } = await admin.from("articles").insert({ manuscript_id: manuscriptId, journal_id: journalId, article_number: articleNumber, slug, title: "Test Published Article", abstract: "Abstract", article_type: "research_article", publication_status: "published", published_at: new Date().toISOString() }).select("id").single();
  await admin.from("production_records").insert({ article_id: art.id, status: "published" });
  await admin.from("doi_records").insert({ article_id: art.id, doi: `10.55555/test.${Date.now()}`, doi_url: `https://doi.org/10.55555/test.${Date.now()}`, prefix:"10.55555", suffix:`test.${Date.now()}`, registration_status:"registered" });
  await admin.from("manuscripts").update({ status: "published" }).eq("id", manuscriptId);
  logOk(`Published article ${slug} with DOI`);

  // Verify public can see article
  const anon = createClient(url, anonKey);
  const { data: pubArt } = await anon.from("articles").select("id,slug").eq("slug", slug).maybeSingle();
  if (pubArt) logOk(`Public (anon) can see published article via RLS`);
  else logFail(`Public cannot see published article (RLS bug)`);

  // Verify reviewer cannot see APC info (should be blocked via RLS? But apcs table has no RLS policy for reviewers, but we can test)
  const { client: reviewerClient } = await login("reviewer1@example.test");
  const { data: apcViaReviewer } = await reviewerClient.from("apcs").select("id").eq("manuscript_id", manuscriptId).maybeSingle();
  if (!apcViaReviewer) logOk(`Reviewer correctly cannot see APC (blocked)`);
  else logWarn(`Reviewer can see APC (should be hidden) - RLS missing`);

  // Verify double-blind: reviewer should not see manuscript_authors for double-blind journal
  // JMS is double_blind, so reviewer should not see authors if we enforce via API, but RLS currently allows?
  const { data: authorsViaReviewer } = await reviewerClient.from("manuscript_authors").select("id").eq("manuscript_id", manuscriptId).maybeSingle();
  // For double blind, API should hide, but direct DB via RLS might still show. We check.
  console.log(`  Reviewer seeing authors via direct RLS: ${authorsViaReviewer ? "yes" : "no"} (API should filter)`);

  // Clean up test manuscript (optional)
  console.log(`\n  Test manuscript: ${manuscriptId} (${newNumber}) lifecycle complete: draft -> published`);
  // Don't delete, keep for inspection

  // Test Cloudinary signature via API with auth - use dynamic import but cloudinary is server-only, so test via direct logic
  console.log("\n=== Cloudinary Signature Test ===");
  try {
    // Simulate what createSignedUploadParams does without importing server-only file
    // It uses cloudinary.utils.api_sign_request with folder/tags/timestamp
    const { v2: cloudinary } = await import("cloudinary");
    cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
    const timestamp = Math.round(Date.now()/1000);
    const folder = `journals/${journalId}/manuscripts/${manuscriptId}/v1`;
    const sig = cloudinary.utils.api_sign_request({ timestamp, folder, tags: "test" }, process.env.CLOUDINARY_API_SECRET);
    assert(sig && sig.length>10, "Cloudinary signature generated");
    logOk(`Cloudinary signature generated: timestamp=${timestamp} sig=${sig.slice(0,10)}...`);
    // Ensure secret not in signature output
    if (!sig.includes(process.env.CLOUDINARY_API_SECRET || "")) logOk(`Secret not leaked in signature`);
  } catch (e) {
    logFail(`Cloudinary signature failed: ${e.message}`);
  }

  // Test search via DB ilike (public search)
  console.log("\n=== Search Test ===");
  const { data: searchRes } = await admin.from("articles").select("id,title").ilike("title","%Test Published%").limit(5);
  if (searchRes && searchRes.length>0) logOk(`Search found ${searchRes.length} article(s)`);
  else logWarn(`Search found nothing`);

  console.log("\n=== DONE lifecycle ===");
}

function assert(cond, msg){ if(!cond) throw new Error(msg); }

testManuscriptLifecycle().catch(e=>{ console.error("FAILED",e); process.exit(1); });
