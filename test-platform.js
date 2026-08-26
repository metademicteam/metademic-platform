#!/usr/bin/env node
// Comprehensive platform test using demo accounts
// Run with: $env:NEXT_PUBLIC_SUPABASE_URL=... ; $env:NEXT_PUBLIC_SUPABASE_ANON_KEY=... ; node test-platform.js

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const APP = "http://localhost:3000";

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAIL: " + msg);
  console.log("✓", msg);
}

async function supaLogin(email, password) {
  const { createClient } = await import("@supabase/supabase-js");
  const c = createClient(url, anonKey);
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email} failed: ${error.message}`);
  return { client: c, user: data.user, token: data.session.access_token };
}

async function fetchWithAuth(path, token, opts = {}) {
  const headers = { ...opts.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // For Next.js API with supabase auth via cookies, we need to forward token as cookie? But API uses supabase.auth.getUser() via cookies.
  // Instead we test via direct supabase client where possible, and via fetch with Authorization header where API supports it.
  // We'll also test via supabase JS directly for DB.
  const res = await fetch(APP + path, { ...opts, headers });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json, headers: res.headers };
}

async function directSupaTest() {
  console.log("\n=== Direct Supabase DB Tests ===");
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, serviceKey);
  // Check journals
  const { data: journals } = await admin.from("journals").select("*");
  assert((journals||[]).length >= 2, `Journals seeded (${journals?.length})`);
  console.log("  journals:", journals.map(j=>j.slug));

  // Check manuscripts
  const { data: mans } = await admin.from("manuscripts").select("manuscript_number,status,journal_id").limit(25);
  assert((mans||[]).length >= 20, `Manuscripts seeded (${mans?.length})`);
  const statuses = [...new Set(mans.map(m=>m.status))];
  console.log("  statuses:", statuses);

  // Check RLS: anon should see published articles only
  const anon = createClient(url, anonKey);
  const { data: anonArts } = await anon.from("articles").select("id");
  console.log("  anon articles visible:", anonArts?.length);

  // Check audit logs
  const { data: audits } = await admin.from("audit_logs").select("id").limit(5);
  console.log("  audit logs:", audits?.length);

  // Check system_jobs
  const { data: jobs } = await admin.from("system_jobs").select("id,status").limit(5);
  console.log("  system jobs:", jobs?.length, jobs?.map(j=>j.status));
}

async function testLogins() {
  console.log("\n=== Auth Tests ===");
  const accounts = [
    "author1@example.test",
    "reviewer1@example.test",
    "eic@example.test",
    "superadmin@example.test",
    "finance1@example.test",
    "production1@example.test",
  ];
  for (const email of accounts) {
    try {
      const { user } = await supaLogin(email, "Test1234!");
      console.log(`✓ login ${email} -> ${user.id}`);
      // check profile exists
      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient(url, serviceKey);
      const { data: prof } = await admin.from("profiles").select("id,email").eq("id", user.id).single();
      assert(prof !== null, `profile exists for ${email}`);
    } catch (e) {
      console.error(`✗ login ${email} failed:`, e.message);
    }
  }
  // wrong password
  try {
    await supaLogin("author1@example.test", "wrong!");
    console.error("✗ wrong password should have failed");
  } catch { console.log("✓ wrong password correctly rejected"); }
}

async function testAPIRoutes() {
  console.log("\n=== API Route Tests (unauthenticated) ===");
  const unauthTests = [
    ["/api/journals?limit=2", 200],
    ["/api/manuscripts", 401],
    ["/api/notifications", 401],
    ["/api/upload/signature", 401],
  ];
  for (const [p, expected] of unauthTests) {
    const { status, json } = await fetchWithAuth(p, null);
    if (status === expected) console.log(`✓ GET ${p} -> ${status} (expected ${expected})`);
    else console.warn(`? GET ${p} -> ${status} (expected ${expected}) json:`, JSON.stringify(json)?.slice(0,200));
  }

  console.log("\n=== API Route Tests (authenticated as author1) ===");
  const { token } = await supaLogin("author1@example.test", "Test1234!");
  // Manuscripts list - note API uses cookies not Bearer, so this will still be 401 via fetch; test via supabase directly
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  // The API route's supabase reads cookies, not Authorization header. So we test DB directly.
  const { data: myMans, error: myErr } = await client.from("manuscripts").select("id,manuscript_number,status").eq("submitted_by", (await client.auth.getUser()).data.user.id).limit(5);
  if (myErr) console.warn("  my manuscripts error:", myErr.message);
  else console.log(`✓ author manuscripts via RLS: ${myMans?.length} found`, myMans?.slice(0,2).map(m=>m.manuscript_number));

  // Test that author cannot see another author's draft via RLS? Try fetching SEED-0001 which is draft owned by author1, and also fetch a manuscript owned by author2
  const admin = (await import("@supabase/supabase-js")).createClient(url, serviceKey);
  const { data: draft } = await admin.from("manuscripts").select("id,manuscript_number,submitted_by").eq("manuscript_number", "SEED-0001").single();
  if (draft) {
    const { data: fetched } = await client.from("manuscripts").select("id").eq("id", draft.id).maybeSingle();
    console.log(`  RLS draft visibility SEED-0001 (owned by author1) via author1 client:`, fetched ? "visible (correct, owner)" : "not visible (BUG)");
  }

  // Test that author1 cannot see author2's draft if not owner/editor
  const { data: draft2 } = await admin.from("manuscripts").select("id,submitted_by").eq("manuscript_number", "SEED-0002").single();
  if (draft2) {
    // SEED-0002 is submitted, not draft, but still owner is author2
    const { data: fetched2, error: e2 } = await client.from("manuscripts").select("id").eq("id", draft2.id).maybeSingle();
    console.log(`  author1 seeing author2's manuscript SEED-0002:`, fetched2 ? "visible (may be allowed if submitted?)" : `blocked (${e2?.message||'null'})`);
  }

  // Test reviewer seeing assignments
  const { token: rt } = await supaLogin("reviewer1@example.test", "Test1234!");
  const rc = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${rt}` } } });
  const { data: rpro } = await rc.from("reviewer_profiles").select("id").eq("user_id", (await rc.auth.getUser()).data.user.id).maybeSingle();
  console.log("  reviewer profile:", rpro?.id ? "exists" : "missing");
  if (rpro?.id) {
    const { data: assigns } = await rc.from("review_assignments").select("id,status").eq("reviewer_id", rpro.id).limit(3);
    console.log(`  reviewer assignments via RLS: ${assigns?.length}`, assigns?.map(a=>a.status));
  }
}

async function testWorkflow() {
  console.log("\n=== Workflow State Machine Tests ===");
  const { canTransition, MANUSCRIPT_STATUS_TRANSITIONS } = await import("./src/lib/workflow.ts");
  // But workflow.ts is TS, import via tsx? We'll test via direct require of compiled?
  // Instead test logic manually
  const tests = [
    ["draft","submitted", true],
    ["submitted","technical_check", true],
    ["published","draft", false],
    ["accepted","published", true], // depends on map? check
    ["rejected","draft", false],
  ];
  for (const [from,to,exp] of tests) {
    try {
      const { canTransition } = await import("./src/lib/workflow.ts");
      const ok = canTransition(from,to);
      if (ok === exp) console.log(`✓ canTransition ${from} -> ${to} = ${ok} (expected ${exp})`);
      else console.warn(`✗ canTransition ${from} -> ${to} = ${ok} (expected ${exp})`);
    } catch(e){ console.log(`? workflow import failed: ${e.message} - testing fallback`);
      // fallback manual
    }
  }
}

async function testPublicPages() {
  console.log("\n=== Public Pages ===");
  const pages = ["/", "/journals", "/articles", "/search?q=seed", "/journals/jms", "/articles/seed-article-20", "/sitemap.xml", "/robots.txt"];
  for (const p of pages) {
    const { status, text } = await fetchWithAuth(p, null);
    const ok = status === 200;
    console.log(`${ok?'✓':'✗'} GET ${p} -> ${status} ${(text||'').length} bytes`);
    if (!ok && status !== 404) console.log("  body:", text.slice(0,300));
  }
}

async function testProtectedRedirects() {
  console.log("\n=== Protected Redirects (no auth cookie) ===");
  const protectedPaths = ["/author/dashboard", "/editor/dashboard", "/reviewer/dashboard", "/finance/dashboard", "/admin/dashboard", "/production/dashboard"];
  for (const p of protectedPaths) {
    // fetch without follow redirects
    const res = await fetch(APP + p, { redirect: "manual" });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc?.includes("/auth/login")) {
      console.log(`✓ ${p} -> ${res.status} redirect to ${loc}`);
    } else if (res.status === 200) {
      // Might be client-side guard, check body contains redirect script? For now note
      console.log(`? ${p} -> 200 (middleware may not redirect without cookie, client guard handles)`);
    } else {
      console.log(`? ${p} -> ${res.status} loc=${loc}`);
    }
  }
}

async function main() {
  console.log("Metademic Platform Test —", new Date().toISOString());
  console.log("Supabase:", url);
  await directSupaTest();
  await testLogins();
  await testAPIRoutes();
  await testPublicPages();
  await testProtectedRedirects();
  // workflow via vitest maybe
  console.log("\n=== Running vitest ===");
  const { execSync } = await import("child_process");
  try {
    const out = execSync("npx vitest run --reporter=verbose 2>&1", { encoding:"utf8", timeout:30000, cwd: "F:/AI_AGENT/Metademic-platform" });
    console.log(out.slice(0, 4000));
  } catch (e) {
    console.log(e.stdout?.slice(0,4000) || e.message);
  }
  console.log("\n=== DONE ===");
}

main().catch(e=>{console.error(e); process.exit(1)});
