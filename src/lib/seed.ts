/**
 * Realistic seed for Metademic — 2 journals, roles, 20 manuscripts with varied lifecycles.
 * Idempotent: upserts by unique keys, safe to re-run.
 * NEVER runs in production — checks NODE_ENV and SUPABASE env.
 *
 * Usage: npm run seed   (tsx src/lib/seed.ts)
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in env.
 */

import { createClient } from "@supabase/supabase-js";

// Guard: never in production
if (process.env.NODE_ENV === "production") {
  console.error("Seed is disabled in production (NODE_ENV=production). Aborting.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PASSWORD = "Test1234!";

async function ensureUser(email: string, meta: { first_name: string; last_name: string; display_name?: string; country_code?: string; orcid?: string; bio?: string }): Promise<string> {
  // Try to find existing profile by email
  const { data: existing } = await supabase.from("profiles").select("id").eq("email", email as never).maybeSingle();
  if (existing) {
    console.log(`[seed] user exists: ${email} -> ${(existing as { id: string }).id}`);
    return (existing as { id: string }).id;
  }

  // Create auth user via admin API
  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: meta.first_name, last_name: meta.last_name, display_name: meta.display_name ?? `${meta.first_name} ${meta.last_name}` },
  });
  if (error || !created.user) {
    // If user already exists in auth but not profile, try to list users
    if (error?.message?.includes("already exists") || error?.message?.includes("duplicate")) {
      const { data: list } = await supabase.auth.admin.listUsers();
      const found = (list?.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (found) {
        // Ensure profile row exists
        const { data: prof } = await supabase.from("profiles").select("id").eq("id", found.id).maybeSingle();
        if (!prof) {
          await supabase.from("profiles").insert({ id: found.id, email, first_name: meta.first_name, last_name: meta.last_name, display_name: meta.display_name ?? `${meta.first_name} ${meta.last_name}`, country_code: meta.country_code ?? null, orcid: meta.orcid ?? null, bio: meta.bio ?? null } as never);
        }
        return found.id;
      }
    }
    throw new Error(`Failed to create user ${email}: ${error?.message}`);
  }
  const userId = created.user.id;
  // Upsert profile
  const { error: pErr } = await supabase.from("profiles").upsert({ id: userId, email, first_name: meta.first_name, last_name: meta.last_name, display_name: meta.display_name ?? `${meta.first_name} ${meta.last_name}`, country_code: meta.country_code ?? "US", orcid: meta.orcid ?? null, bio: meta.bio ?? null } as never, { onConflict: "id" });
  if (pErr) console.warn(`[seed] profile upsert warn for ${email}:`, pErr.message);
  console.log(`[seed] created user: ${email} -> ${userId}`);
  return userId;
}

async function ensureJournal(slug: string, data: Record<string, unknown>) {
  const { data: existing } = await supabase.from("journals").select("id").eq("slug", slug as never).maybeSingle();
  if (existing) {
    console.log(`[seed] journal exists: ${slug} -> ${(existing as { id: string }).id}`);
    // Update with latest data
    const { data: updated } = await supabase.from("journals").update(data as never).eq("id", (existing as { id: string }).id).select("id").single();
    return (updated as { id: string } | null)?.id ?? (existing as { id: string }).id;
  }
  const { data: created, error } = await supabase.from("journals").insert({ slug, ...data } as never).select("id").single();
  if (error) throw new Error(`Failed to create journal ${slug}: ${error.message}`);
  console.log(`[seed] created journal: ${slug} -> ${(created as { id: string }).id}`);
  return (created as { id: string }).id;
}

async function ensureInstitution(name: string, country: string) {
  const { data: existing } = await supabase.from("institutions").select("id").eq("name", name as never).maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const { data: created } = await supabase.from("institutions").insert({ name, short_name: name.slice(0, 10), country_code: country } as never).select("id").single();
  return (created as { id: string }).id;
}

async function ensureMembership(journalId: string, userId: string, role: string) {
  const { data: existing } = await supabase.from("journal_members").select("id").eq("journal_id", journalId as never).eq("user_id", userId as never).eq("role", role as never).maybeSingle();
  if (existing) return;
  const { error } = await supabase.from("journal_members").insert({ journal_id: journalId, user_id: userId, role: role as never, is_active: true } as never);
  if (error) console.warn(`[seed] membership warn ${userId} ${role}:`, error.message);
}

async function main() {
  console.log("[seed] starting…");

  // Journals
  const jA = await ensureJournal("jms", {
    name: "Journal of Metademic Science",
    short_name: "JMS",
    description: "Interdisciplinary research in methodology, systems, and science studies.",
    issn_print: "1234-5678",
    issn_online: "1234-5679",
    publisher_name: "Metademic Press",
    contact_email: "editor@jms.metademic.test",
    status: "active",
    apc_enabled: true,
    default_apc: 1200,
    currency: "USD",
    doi_prefix: "10.55555",
    doi_enabled: true,
    review_blind_type: "double_blind",
    reviewers_required: 3,
    review_deadline_days: 14,
    settings: { tax_rate: 0 },
  });

  const jB = await ensureJournal("ai-review", {
    name: "AI Review Letters",
    short_name: "AIRL",
    description: "Rapid communications on AI, ML, and open science.",
    issn_print: "9876-5432",
    issn_online: "9876-5433",
    publisher_name: "Metademic Press",
    contact_email: "editor@airl.metademic.test",
    status: "active",
    apc_enabled: true,
    default_apc: 900,
    currency: "USD",
    doi_prefix: "10.55556",
    doi_enabled: true,
    review_blind_type: "single_blind",
    reviewers_required: 2,
    review_deadline_days: 10,
    settings: { tax_rate: 0.05 },
  });

  // Users
  const superAdminId = await ensureUser("superadmin@example.test", { first_name: "Super", last_name: "Admin", country_code: "US", orcid: "0000-0001-0000-0001" });
  const journalAdminId = await ensureUser("journaladmin@example.test", { first_name: "Journal", last_name: "Admin", country_code: "GB" });
  const eicId = await ensureUser("eic@example.test", { first_name: "Elena", last_name: "Ito", country_code: "JP", orcid: "0000-0002-0000-0002" });
  const se1 = await ensureUser("section1@example.test", { first_name: "Section", last_name: "Editor A", country_code: "DE" });
  const se2 = await ensureUser("section2@example.test", { first_name: "Section", last_name: "Editor B", country_code: "FR" });
  const me1 = await ensureUser("managing1@example.test", { first_name: "Managing", last_name: "Editor A", country_code: "US" });
  const me2 = await ensureUser("managing2@example.test", { first_name: "Managing", last_name: "Editor B", country_code: "CA" });
  const pe1 = await ensureUser("production1@example.test", { first_name: "Prod", last_name: "Editor A", country_code: "US" });
  const pe2 = await ensureUser("production2@example.test", { first_name: "Prod", last_name: "Editor B", country_code: "AU" });
  const pe3 = await ensureUser("production3@example.test", { first_name: "Prod", last_name: "Editor C", country_code: "NL" });
  const fin1 = await ensureUser("finance1@example.test", { first_name: "Finance", last_name: "Admin A", country_code: "US" });
  const fin2 = await ensureUser("finance2@example.test", { first_name: "Finance", last_name: "Admin B", country_code: "GB" });

  const authorIds: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const id = await ensureUser(`author${i}@example.test`, { first_name: `Author${i}`, last_name: `Test`, country_code: ["US", "GB", "DE", "JP", "CN", "IN", "BR", "AU", "CA", "FR"][i - 1], orcid: `0000-0001-0000-00${String(i).padStart(2, "0")}` });
    authorIds.push(id);
    // also create author_profiles stub
    const { data: existingAp } = await supabase.from("author_profiles").select("id").eq("user_id", id as never).maybeSingle();
    if (!existingAp) {
      const instId = await ensureInstitution(`University ${i}`, ["US", "GB", "DE", "JP", "CN"][i % 5]);
      await supabase.from("author_profiles").insert({ user_id: id, institution_id: instId, department: `Dept ${i}`, research_interests: [`topic${i}`, `field${i % 3}`] } as never);
    }
  }

  const reviewerIds: string[] = [];
  const reviewerProfileIds: string[] = [];
  for (let i = 1; i <= 15; i++) {
    const id = await ensureUser(`reviewer${i}@example.test`, { first_name: `Reviewer${i}`, last_name: `Test`, country_code: ["US", "GB", "DE", "JP", "CN"][i % 5] });
    reviewerIds.push(id);
    const { data: rpExisting } = await supabase.from("reviewer_profiles").select("id").eq("user_id", id as never).maybeSingle();
    let rpId: string;
    if (rpExisting) {
      rpId = (rpExisting as { id: string }).id;
    } else {
      const instId = await ensureInstitution(`Reviewer Inst ${i}`, "US");
      const { data: created } = await supabase.from("reviewer_profiles").insert({ user_id: id, institution_id: instId, expertise: [`expertise${i % 4}`, `keyword${i % 6}`], keywords: [`kw${i}`, `ml`], is_available: true, max_active_reviews: 5 } as never).select("id").single();
      rpId = (created as { id: string }).id;
    }
    reviewerProfileIds.push(rpId);
  }

  // Memberships
  for (const j of [jA, jB]) {
    await ensureMembership(j, superAdminId, "super_admin");
    await ensureMembership(j, journalAdminId, "journal_admin");
    await ensureMembership(j, eicId, "editor_in_chief");
    await ensureMembership(j, se1, "section_editor");
    await ensureMembership(j, se2, "section_editor");
    await ensureMembership(j, me1, "managing_editor");
    await ensureMembership(j, me2, "managing_editor");
    await ensureMembership(j, pe1, "production_editor");
    await ensureMembership(j, pe2, "production_editor");
    await ensureMembership(j, pe3, "copyeditor");
    await ensureMembership(j, fin1, "finance_admin");
    await ensureMembership(j, fin2, "finance_admin");
    // authors as authors
    for (const a of authorIds) await ensureMembership(j, a, "author");
    // reviewers
    for (const r of reviewerIds) await ensureMembership(j, r, "reviewer");
    // also editors pool
    await ensureMembership(j, se1, "editor");
    await ensureMembership(j, se2, "editor");
  }

  // Institutions for articles
  const instAlpha = await ensureInstitution("Metademic University", "US");
  const instBeta = await ensureInstitution("Global Institute of Technology", "GB");

  // Volumes & Issues
  async function ensureVolume(journalId: string, volNum: number, year: number) {
    const { data: existing } = await supabase.from("volumes").select("id").eq("journal_id", journalId as never).eq("volume_number", volNum as never).maybeSingle();
    if (existing) return (existing as { id: string }).id;
    const { data } = await supabase.from("volumes").insert({ journal_id: journalId, volume_number: volNum, year, title: `Volume ${volNum} (${year})` } as never).select("id").single();
    return (data as { id: string }).id;
  }
  async function ensureIssue(journalId: string, volumeId: string | null, issueNum: number) {
    const { data: existing } = await supabase.from("issues").select("id").eq("journal_id", journalId as never).eq("issue_number", issueNum as never).maybeSingle();
    if (existing) return (existing as { id: string }).id;
    const { data } = await supabase.from("issues").insert({ journal_id: journalId, volume_id: volumeId, issue_number: issueNum, title: `Issue ${issueNum}` } as never).select("id").single();
    return (data as { id: string }).id;
  }

  const v1A = await ensureVolume(jA, 1, 2026);
  const i1A = await ensureIssue(jA, v1A, 1);
  const i2A = await ensureIssue(jA, v1A, 2);
  const v1B = await ensureVolume(jB, 1, 2026);
  const i1B = await ensureIssue(jB, v1B, 1);

  // Manuscripts — create 20 with varied statuses
  const subjectsPool = ["machine learning", "open science", "peer review", "data sharing", "bibliometrics", "reproducibility"];
  const statuses: Array<{ status: string; journalId: string }> = [
    { status: "draft", journalId: jA },
    { status: "submitted", journalId: jA },
    { status: "technical_check", journalId: jA },
    { status: "editor_assignment", journalId: jA },
    { status: "editorial_screening", journalId: jA },
    { status: "reviewer_invitation", journalId: jB },
    { status: "under_review", journalId: jA },
    { status: "reviews_complete", journalId: jA },
    { status: "decision_pending", journalId: jB },
    { status: "minor_revision", journalId: jA },
    { status: "major_revision", journalId: jB },
    { status: "revision_submitted", journalId: jA },
    { status: "re_review", journalId: jA },
    { status: "accepted", journalId: jA },
    { status: "accepted", journalId: jB },
    { status: "rejected", journalId: jA },
    { status: "rejected", journalId: jB },
    { status: "apc_pending", journalId: jA },
    { status: "copyediting", journalId: jA },
    { status: "published", journalId: jA },
  ];

  for (let idx = 0; idx < statuses.length; idx++) {
    const s = statuses[idx];
    const authorId = authorIds[idx % authorIds.length];
    const manuscriptNumber = `SEED-${String(idx + 1).padStart(4, "0")}`;

    // Check existing by manuscript_number
    const { data: exists } = await supabase.from("manuscripts").select("id").eq("manuscript_number", manuscriptNumber as never).maybeSingle();
    let manuscriptId: string;
    if (exists) {
      manuscriptId = (exists as { id: string }).id;
      console.log(`[seed] manuscript exists: ${manuscriptNumber} -> ${manuscriptId}`);
    } else {
      const now = new Date(Date.now() - (20 - idx) * 86400000).toISOString();
      const title = `Seed manuscript ${idx + 1}: A study on ${subjectsPool[idx % subjectsPool.length]} and scholarly workflows`;
      const { data: ms, error: msErr } = await supabase
        .from("manuscripts")
        .insert({
          journal_id: s.journalId,
          manuscript_number: manuscriptNumber,
          title,
          abstract: `This is a seeded abstract for manuscript ${manuscriptNumber}. It explores ${subjectsPool[idx % subjectsPool.length]}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. This abstract is at least fifty characters long to pass validation.`,
          article_type: "research_article",
          keywords: [subjectsPool[idx % subjectsPool.length], "metademic", "seed"],
          subject_areas: [subjectsPool[idx % subjectsPool.length]],
          status: s.status as never,
          current_version: 1,
          current_review_round: s.status === "draft" ? 0 : 1,
          submitted_by: authorId,
          corresponding_author_id: authorId,
          submitted_at: s.status === "draft" ? null : now,
          accepted_at: ["accepted", "apc_pending", "copyediting", "published"].includes(s.status) ? now : null,
          rejected_at: s.status === "rejected" ? now : null,
        } as never)
        .select("id")
        .single();
      if (msErr) {
        console.warn(`[seed] manuscript insert failed ${manuscriptNumber}:`, msErr.message);
        continue;
      }
      manuscriptId = (ms as { id: string }).id;
      console.log(`[seed] created manuscript: ${manuscriptNumber} (${s.status}) -> ${manuscriptId}`);

      // Authors
      await supabase.from("manuscript_authors").insert({
        manuscript_id: manuscriptId,
        first_name: `Author${(idx % 10) + 1}`,
        last_name: `Test`,
        email: `author${(idx % 10) + 1}@example.test`,
        author_order: 1,
        is_corresponding: true,
        institution_name_snapshot: idx % 2 === 0 ? "Metademic University" : "Global Institute of Technology",
      } as never);

      // Versions
      await supabase.from("manuscript_versions").insert({
        manuscript_id: manuscriptId,
        version_number: 1,
        revision_round: 0,
        version_label: "Initial submission",
        submitted_by: authorId,
        submitted_at: now,
      } as never);

      // Add workflow event
      await supabase.from("workflow_events").insert({
        manuscript_id: manuscriptId,
        actor_id: authorId,
        from_status: null,
        to_status: s.status as never,
        event_type: "seed.created",
        description: `Seed manuscript ${manuscriptNumber} in ${s.status}`,
      } as never);
    }

    // For manuscripts that need review rounds etc., create review_round + assignments for accepted/rejected/published etc.
    if (["under_review", "reviews_complete", "decision_pending", "accepted", "rejected", "apc_pending", "copyediting", "published", "major_revision", "minor_revision", "revision_submitted", "re_review"].includes(s.status)) {
      // Ensure review_round 1
      const { data: existingRound } = await supabase.from("review_rounds").select("id").eq("manuscript_id", manuscriptId as never).eq("round_number", 1 as never).maybeSingle();
      let roundId: string;
      if (existingRound) roundId = (existingRound as { id: string }).id;
      else {
        const { data: rr } = await supabase.from("review_rounds").insert({ manuscript_id: manuscriptId, round_number: 1, required_reviewers: 3 } as never).select("id").single();
        roundId = (rr as { id: string }).id;
      }

      // Create up to 3 review assignments
      const reviewerPool = reviewerProfileIds.slice(0, 3);
      for (let rIdx = 0; rIdx < reviewerPool.length; rIdx++) {
        const rpId = reviewerPool[rIdx];
        const { data: existingAssign } = await supabase.from("review_assignments").select("id").eq("review_round_id", roundId as never).eq("reviewer_id", rpId as never).maybeSingle();
        let assignId: string;
        if (existingAssign) assignId = (existingAssign as { id: string }).id;
        else {
          const statusForSeed = s.status === "under_review" ? "reviewing" : "completed";
          const deadline = new Date(Date.now() + 14 * 86400000).toISOString();
          const { data: assign } = await supabase.from("review_assignments").insert({ review_round_id: roundId, reviewer_id: rpId, status: statusForSeed as never, deadline_at: deadline } as never).select("id").single();
          assignId = (assign as { id: string }).id;
        }

        // If completed, add review_reports
        const { data: existingReport } = await supabase.from("review_reports").select("id").eq("review_assignment_id", assignId as never).maybeSingle();
        if (!existingReport && ["reviews_complete", "decision_pending", "accepted", "rejected", "published", "apc_pending", "copyediting", "major_revision", "minor_revision"].includes(s.status)) {
          const recs: Array<"accept" | "minor_revision" | "major_revision" | "reject"> = ["accept", "accept", "minor_revision"];
          const rec = s.status === "rejected" ? (rIdx < 2 ? "reject" : "major_revision") : (recs[rIdx] as never);
          const { data: report } = await supabase.from("review_reports").insert({ review_assignment_id: assignId, recommendation: rec as never, comments_to_author: `Seed review ${rIdx + 1} for ${manuscriptNumber}: This is a seeded review comment.`, confidential_comments_to_editor: "Confidential notes", originality_score: 4, methodology_score: 4, writing_score: 4 } as never).select("id").single();
          const reportId = (report as { id: string }).id;
          // review_comments
          for (let c = 1; c <= 2; c++) {
            const { data: existingComment } = await supabase.from("review_comments").select("id").eq("review_report_id", reportId as never).eq("comment_number", c as never).maybeSingle();
            if (!existingComment) {
              await supabase.from("review_comments").insert({ review_report_id: reportId, comment_number: c, comment_text: `Comment ${c}: Please clarify methodology in section ${c}.` } as never);
            }
          }
        }
      }

      // Editorial decision for accepted/rejected
      if (["accepted", "rejected", "published", "apc_pending", "copyediting"].includes(s.status)) {
        const { data: existingDec } = await supabase.from("editorial_decisions").select("id").eq("manuscript_id", manuscriptId as never).maybeSingle();
        if (!existingDec) {
          await supabase.from("editorial_decisions").insert({ manuscript_id: manuscriptId, review_round_id: roundId, editor_id: eicId, decision: s.status === "rejected" ? "reject" as never : "accept" as never, system_recommendation: s.status === "rejected" ? "reject" as never : "accept" as never, accept_votes: s.status === "rejected" ? 0 : 2, reject_votes: s.status === "rejected" ? 2 : 0 } as never);
        }
      }

      // Author responses for revision cases
      if (["revision_submitted", "re_review"].includes(s.status)) {
        const { data: existingRR } = await supabase.from("revision_requests").select("id").eq("manuscript_id", manuscriptId as never).maybeSingle();
        let rrId: string;
        if (existingRR) rrId = (existingRR as { id: string }).id;
        else {
          const { data: rr } = await supabase.from("revision_requests").insert({ manuscript_id: manuscriptId, revision_round: 1, due_at: new Date(Date.now() + 14 * 86400000).toISOString(), instructions: "Please address reviewer comments." } as never).select("id").single();
          rrId = (rr as { id: string }).id;
        }
        // Create an author_response if none
        const { data: existingResp } = await supabase.from("author_responses").select("id").eq("revision_request_id", rrId as never).maybeSingle();
        if (!existingResp) {
          const { data: commentRow } = await supabase.from("review_comments").select("id").limit(1).maybeSingle();
          if (commentRow) {
            await supabase.from("author_responses").insert({ revision_request_id: rrId, review_comment_id: (commentRow as { id: string }).id, response_text: "We have addressed this comment. See revised section.", response_status: "addressed" } as never);
          }
        }
      }
    }

    // APC + invoices for accepted/published etc.
    if (["accepted", "apc_pending", "copyediting", "published"].includes(s.status)) {
      const { data: existingApc } = await supabase.from("apcs").select("id").eq("manuscript_id", manuscriptId as never).maybeSingle();
      let apcId: string;
      if (existingApc) apcId = (existingApc as { id: string }).id;
      else {
        const base = s.journalId === jA ? 1200 : 900;
        const { data: apc } = await supabase.from("apcs").insert({ manuscript_id: manuscriptId, base_amount: base, total_amount: base, currency: "USD", status: s.status === "accepted" ? "calculated" as never : "invoice_issued" as never, calculated_at: new Date().toISOString() } as never).select("id").single();
        apcId = (apc as { id: string }).id;
      }

      if (["apc_pending", "copyediting", "published"].includes(s.status)) {
        const { data: existingInv } = await supabase.from("invoices").select("id").eq("apc_id", apcId as never).maybeSingle();
        if (!existingInv) {
          const invNum = `INV-SEED-${String(idx + 1).padStart(4, "0")}`;
          await supabase.from("invoices").insert({ apc_id: apcId, invoice_number: invNum, amount: s.journalId === jA ? 1200 : 900, currency: "USD", status: s.status === "published" ? "paid" as never : "issued" as never, issued_at: new Date().toISOString(), due_at: new Date(Date.now() + 30 * 86400000).toISOString(), paid_at: s.status === "published" ? new Date().toISOString() : null } as never);
        }
        // Payment for published
        if (s.status === "published") {
          const { data: inv } = await supabase.from("invoices").select("id").eq("apc_id", apcId as never).maybeSingle();
          if (inv) {
            const { data: existingPay } = await supabase.from("payments").select("id").eq("invoice_id", (inv as { id: string }).id as never).maybeSingle();
            if (!existingPay) {
              await supabase.from("payments").insert({ invoice_id: (inv as { id: string }).id, amount: 1200, currency: "USD", status: "succeeded" as never, paid_at: new Date().toISOString() } as never);
            }
          }
        }
      }
    }

    // Articles for published
    if (s.status === "published") {
      const { data: existingArt } = await supabase.from("articles").select("id").eq("manuscript_id", manuscriptId as never).maybeSingle();
      let articleId: string;
      if (existingArt) articleId = (existingArt as { id: string }).id;
      else {
        const slug = `seed-article-${idx + 1}`;
        const articleNumber = `SEED-ART-${String(idx + 1).padStart(4, "0")}`;
        const { data: art } = await supabase.from("articles").insert({ manuscript_id: manuscriptId, journal_id: s.journalId, issue_id: s.journalId === jA ? i1A : i1B, article_number: articleNumber, slug, title: `Seed Published Article ${idx + 1}`, abstract: "Seeded published article abstract.", article_type: "research_article", publication_status: "published", published_at: new Date().toISOString(), received_at: new Date(Date.now() - 60 * 86400000).toISOString(), accepted_at: new Date(Date.now() - 7 * 86400000).toISOString() } as never).select("id").single();
        articleId = (art as { id: string }).id;
        await supabase.from("article_authors").insert({ article_id: articleId, first_name: `Author${(idx % 10) + 1}`, last_name: "Test", author_order: 1, is_corresponding: true, affiliation: "Metademic University" } as never);
        await supabase.from("doi_records").insert({ article_id: articleId, doi: `10.55555/seed.${String(idx + 1).padStart(4, "0")}`, doi_url: `https://doi.org/10.55555/seed.${String(idx + 1).padStart(4, "0")}`, prefix: "10.55555", suffix: `seed.${String(idx + 1).padStart(4, "0")}`, registration_status: "registered" } as never);
        await supabase.from("production_records").insert({ article_id: articleId, status: "published" } as never);
        await supabase.from("audit_logs").insert({ actor_id: eicId, journal_id: s.journalId, manuscript_id: manuscriptId, action: "article.published", entity_type: "article", entity_id: articleId } as never);
      }
    }

    // System jobs seed
    if (idx % 5 === 0) {
      await supabase.from("system_jobs").insert({ job_type: "send_email", entity_type: "manuscript", entity_id: manuscriptId, status: "pending", payload: { seed: true } } as never);
    }
  }

  // Extra audit logs
  for (let i = 0; i < 5; i++) {
    await supabase.from("audit_logs").insert({ actor_id: eicId, journal_id: jA, action: `seed.audit_${i}`, entity_type: "journal", entity_id: jA, metadata: { seed: true } } as never);
  }

  console.log("[seed] done. Demo accounts password:", PASSWORD);
  console.log("[seed] Journals:", jA, jB);
}

main()
  .then(() => {
    console.log("[seed] completed successfully");
    process.exit(0);
  })
  .catch((e) => {
    console.error("[seed] failed:", e);
    process.exit(1);
  });
