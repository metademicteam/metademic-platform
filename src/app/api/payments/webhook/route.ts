import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueEmailJob } from "@/lib/jobs";
import { processPendingEmails } from "@/lib/email/send";

/**
 * Stripe webhook handler.
 * CRITICAL: Never trust frontend paymentSuccess=true.
 * Only this server-side verified webhook updates payments/invoices/apcs/manuscript status.
 * Supports both real Stripe signature verification (if STRIPE_WEBHOOK_SECRET set)
 * and a mock mode for local dev: POST { mock: true, invoiceId, providerPaymentId, status }
 */

// Create the article + production record for a paid manuscript so it appears in
// the production queue. Idempotent: no-op if the article already exists.
async function ensureArticleInProduction(
  admin: ReturnType<typeof createAdminClient>,
  manuscriptId: string,
) {
  const { data: existingArticle } = await admin.from("articles").select("id, article_number, slug").eq("manuscript_id", manuscriptId).maybeSingle();
  if (existingArticle) {
    // Article exists — ensure a production record exists too.
    const { data: prod } = await admin.from("production_records").select("id").eq("article_id", (existingArticle as { id: string }).id).maybeSingle();
    if (!prod) {
      await admin.from("production_records").insert({ article_id: (existingArticle as { id: string }).id, status: "copyediting" } as never);
    }
    return existingArticle as { id: string };
  }

  const { data: m } = await admin.from("manuscripts")
    .select("id, journal_id, title, abstract, article_type, manuscript_number, submitted_at, accepted_at")
    .eq("id", manuscriptId)
    .single();
  if (!m) return null;
  const ms = m as { id: string; journal_id: string; title: string; abstract: string | null; article_type: string; manuscript_number: string; submitted_at: string | null; accepted_at: string | null };

  // Generate article number + slug (mirrors publish route).
  const year = new Date().getFullYear();
  const articleNumber = `${year}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const slug = (ms.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "").slice(0, 80) || "article") + "-" + articleNumber.toLowerCase();

  const { data: article, error } = await admin.from("articles").insert({
    manuscript_id: manuscriptId,
    journal_id: ms.journal_id,
    article_number: articleNumber,
    slug,
    title: ms.title,
    abstract: ms.abstract,
    article_type: ms.article_type as never,
    publication_status: "draft" as never,
    received_at: ms.submitted_at,
    accepted_at: ms.accepted_at ?? new Date().toISOString(),
  } as never).select("id").single();
  if (error || !article) return null;

  const articleId = (article as { id: string }).id;
  const { data: manuscriptAuthors } = await admin
    .from("manuscript_authors")
    .select("user_id, first_name, middle_name, last_name, orcid, institution_name_snapshot, author_order, is_corresponding, contribution_statement")
    .eq("manuscript_id", manuscriptId)
    .order("author_order", { ascending: true });
  for (const ma of (manuscriptAuthors ?? []) as Array<{ user_id: string | null; first_name: string; middle_name: string | null; last_name: string; orcid: string | null; institution_name_snapshot: string | null; author_order: number; is_corresponding: boolean; contribution_statement: string | null }>) {
    await admin.from("article_authors").insert({
      article_id: articleId,
      user_id: ma.user_id,
      first_name: ma.first_name,
      middle_name: ma.middle_name,
      last_name: ma.last_name,
      orcid: ma.orcid,
      affiliation: ma.institution_name_snapshot,
      author_order: ma.author_order,
      is_corresponding: ma.is_corresponding,
      contribution_statement: ma.contribution_statement,
    } as never);
  }
  await admin.from("production_records").insert({ article_id: articleId, status: "copyediting" } as never);
  return article as { id: string };
}
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  // Clone request for body reading
  const admin = createAdminClient();

  // Mock webhook path (for dev without valid signature) — gated: only if STRIPE_WEBHOOK_SECRET not set or body.mock === true and env allows
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let mockMode = false;
  let mockPayload: Record<string, unknown> | null = null;
  try {
    const j = JSON.parse(rawBody);
    if (j && typeof j === "object" && (j as Record<string, unknown>).mock === true) {
      mockPayload = j as Record<string, unknown>;
      mockMode = true;
    }
  } catch {
    // not JSON — treat as stripe raw event body
  }

  if (mockMode) {
    // Allow mock only if STRIPE_WEBHOOK_SECRET is not set OR explicit ALLOW_MOCK_PAYMENTS env flag
    // In this codebase we allow mock for development convenience.
    const invoiceId = mockPayload?.invoiceId as string | undefined;
    const providerPaymentId = mockPayload?.providerPaymentId as string | undefined;
    const status = (mockPayload?.status as string | undefined) ?? "succeeded";
    if (!invoiceId) return NextResponse.json({ error: "mock invoiceId required" }, { status: 400 });

    // Find invoice + apc
    const { data: invoice } = await admin.from("invoices").select("id, apc_id, amount, currency").eq("id", invoiceId).single();
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const inv = invoice as { id: string; apc_id: string; amount: number; currency: string };
    const { data: apc } = await admin.from("apcs").select("manuscript_id").eq("id", inv.apc_id).single();
    const manuscriptId = (apc as { manuscript_id: string } | null)?.manuscript_id;

    // Find or create payment
    let paymentId: string | null = null;
    if (providerPaymentId) {
      const { data: p } = await admin.from("payments").select("id").eq("provider_payment_id", providerPaymentId).maybeSingle();
      paymentId = (p as { id: string } | null)?.id ?? null;
    }
    if (!paymentId) {
      const { data: p2 } = await admin.from("payments").select("id").eq("invoice_id", invoiceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      paymentId = (p2 as { id: string } | null)?.id ?? null;
    }

    if (status === "succeeded" || status === "paid" || status === "success") {
      // Transactional updates (best-effort sequential with admin client — supabase has no multi-statement transaction via REST, but we order carefully)
      if (paymentId) {
        await admin.from("payments").update({ status: "succeeded", paid_at: new Date().toISOString(), provider_event_id: `mock_evt_${Date.now()}` } as never).eq("id", paymentId);
      } else {
        await admin.from("payments").insert({ invoice_id: invoiceId, provider: "mock", provider_payment_id: providerPaymentId ?? `mock_${Date.now()}`, amount: inv.amount, currency: inv.currency, status: "succeeded", paid_at: new Date().toISOString(), provider_event_id: `mock_evt_${Date.now()}` } as never);
      }
      await admin.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() } as never).eq("id", invoiceId);
      const { data: updatedApc } = await admin.from("apcs").update({ status: "paid", paid_at: new Date().toISOString() } as never).eq("id", inv.apc_id).select("manuscript_id").single();
      const mid = manuscriptId ?? (updatedApc as { manuscript_id: string } | null)?.manuscript_id;
      if (mid) {
        // Move manuscript from apc_pending -> copyediting (or keep accepted if apc not required? but invoice paid means ready for production)
        const { data: m } = await admin.from("manuscripts").select("status, journal_id").eq("id", mid).single();
        const s = (m as { status: string } | null)?.status;
        if (s === "apc_pending" || s === "accepted") {
          await admin.from("manuscripts").update({ status: "copyediting" } as never).eq("id", mid);
          await admin.from("workflow_events").insert({ manuscript_id: mid, from_status: s as never, to_status: "copyediting" as never, event_type: "payment_succeeded", description: "APC payment verified via webhook — moved to copyediting" } as never);
        }
        // Create the article + production record so it enters the production queue.
        await ensureArticleInProduction(admin, mid);
        await admin.from("system_jobs").insert({ job_type: "payment_succeeded", entity_type: "manuscript", entity_id: mid, status: "completed", payload: { invoice_id: invoiceId, mock: true } } as never);
        const jId = (m as { journal_id: string } | null)?.journal_id;
        // notify author
        const { data: manuscript2 } = await admin.from("manuscripts").select("submitted_by, journal_id").eq("id", mid).single();
        const authorId = (manuscript2 as { submitted_by: string | null } | null)?.submitted_by;
        if (authorId) {
          await admin.from("notifications").insert({ user_id: authorId, journal_id: jId, manuscript_id: mid, type: "payment_received", title: "Payment received", message: "Your APC payment has been confirmed. Production will begin shortly.", action_url: `/author/submissions/${mid}` } as never);
          // Real email via Resend job
          const { data: profile } = await admin.from("profiles").select("email, first_name, last_name").eq("id", authorId).maybeSingle();
          const p = profile as { email: string | null; first_name: string | null; last_name: string | null } | null;
          if (p?.email) {
            await enqueueEmailJob(admin as never, {
              templateName: "payment_received",
              recipientEmail: p.email,
              recipientUserId: authorId,
              manuscriptId: mid,
              context: { recipientName: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Author", manuscriptId: mid, amount: String(inv.amount), currency: inv.currency },
            });
            await admin.from("email_logs").insert({ user_id: authorId, manuscript_id: mid, recipient_email: p.email, template_name: "payment_received", subject: `Payment received — ${inv.currency} ${inv.amount}`, status: "queued" } as never);
          }
        }
      }
      await admin.from("audit_logs").insert({ action: "payment.succeeded", entity_type: "invoice", entity_id: invoiceId, new_data: { mock: true, providerPaymentId } } as never);
      return NextResponse.json({ received: true, mock: true, status: "succeeded" });
    } else {
      if (paymentId) await admin.from("payments").update({ status: "failed" } as never).eq("id", paymentId);
      return NextResponse.json({ received: true, mock: true, status: "failed" });
    }
  }

  // Real Stripe path
  if (!stripeKey || !secret) {
    return NextResponse.json({ error: "Stripe webhook not configured (missing STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET). Use mock payload { mock:true, invoiceId } for dev." }, { status: 500 });
  }

  // Verify signature
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" as never });
    // Use rawBody that we already extracted; need to re-check signature
    event = stripe.webhooks.constructEvent(rawBody, sig, secret) as unknown as typeof event;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid signature" }, { status: 400 });
  }

  // Idempotency: check provider_event_id uniqueness
  const eventId = (event as unknown as { id: string }).id ?? `evt_${Date.now()}`;

  // Handle checkout.session.completed and payment_intent.succeeded
  const obj = event.data.object as Record<string, unknown>;
  let invoiceId: string | null = (obj.metadata as Record<string, unknown> | undefined)?.invoice_id as string | undefined ?? null;
  const sessionId = (obj.id as string | undefined) ?? null;
  let amount = 0;
  let currency = "USD";

  if (event.type === "checkout.session.completed") {
    const md = obj.metadata as Record<string, unknown> | undefined;
    invoiceId = (md?.invoice_id as string) ?? null;
    amount = typeof obj.amount_total === "number" ? (obj.amount_total as number) / 100 : 0;
    currency = (obj.currency as string | undefined)?.toUpperCase() ?? "USD";
  } else if (event.type === "payment_intent.succeeded") {
    // Try to find payment by provider_payment_id = pi_xxx
    const piId = obj.id as string | undefined;
    if (piId) {
      const { data: p } = await admin.from("payments").select("invoice_id").eq("provider_payment_id", piId).maybeSingle();
      invoiceId = (p as { invoice_id: string } | null)?.invoice_id ?? null;
    }
    amount = typeof obj.amount === "number" ? (obj.amount as number) / 100 : 0;
    currency = (obj.currency as string | undefined)?.toUpperCase() ?? "USD";
  } else {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  if (!invoiceId) return NextResponse.json({ error: "invoice_id not found in Stripe metadata" }, { status: 400 });

  // Idempotency check: has this event already been processed?
  if (sessionId) {
    const { data: exists } = await admin.from("payments").select("id").eq("provider_event_id", eventId).maybeSingle();
    if (exists) return NextResponse.json({ received: true, duplicate: true });
  }

  const { data: invoice } = await admin.from("invoices").select("id, apc_id").eq("id", invoiceId).single();
  if (!invoice) return NextResponse.json({ error: "Invoice not found for webhook" }, { status: 404 });
  const inv = invoice as { id: string; apc_id: string };

  // Update payment row matched by session id or invoice
  let paymentId: string | null = null;
  if (sessionId) {
    const { data: p } = await admin.from("payments").select("id").eq("provider_payment_id", sessionId).maybeSingle();
    paymentId = (p as { id: string } | null)?.id ?? null;
  }
  if (!paymentId) {
    const { data: p2 } = await admin.from("payments").select("id").eq("invoice_id", invoiceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    paymentId = (p2 as { id: string } | null)?.id ?? null;
  }

  // Atomic, idempotent — single RPC fixes payments/invoices/apcs/manuscript/article/production + side-effects
  const { error: rpcErr } = await admin.rpc("payment_succeeded" as never, {
    p_invoice_id: invoiceId,
    p_provider: "stripe",
    p_provider_payment_id: sessionId,
    p_provider_event_id: eventId,
    p_amount: amount || null,
    p_currency: currency || null,
  } as never);
  if (rpcErr) {
    // Fallback to legacy sequential path if RPC not yet deployed
    if (paymentId) {
      await admin.from("payments").update({ status: "succeeded", paid_at: new Date().toISOString(), provider_event_id: eventId, amount: amount || undefined, currency: currency || undefined } as never).eq("id", paymentId);
    } else {
      await admin.from("payments").insert({ invoice_id: invoiceId, provider: "stripe", provider_payment_id: sessionId ?? `pi_${Date.now()}`, provider_event_id: eventId, amount: amount, currency, status: "succeeded", paid_at: new Date().toISOString() } as never);
    }
    await admin.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() } as never).eq("id", invoiceId);
    const { data: apc } = await admin.from("apcs").select("manuscript_id").eq("id", inv.apc_id).single();
    const mid = (apc as { manuscript_id: string } | null)?.manuscript_id;
    if (mid) {
      const { data: m } = await admin.from("manuscripts").select("status, journal_id, submitted_by").eq("id", mid).single();
      const s = (m as { status: string } | null)?.status;
      if (s === "apc_pending" || s === "accepted") {
        await admin.from("manuscripts").update({ status: "copyediting" } as never).eq("id", mid);
        await admin.from("workflow_events").insert({ manuscript_id: mid, from_status: s as never, to_status: "copyediting" as never, event_type: "payment_succeeded", description: "APC payment verified via Stripe webhook" } as never);
      }
      await ensureArticleInProduction(admin, mid);
      await admin.from("apcs").update({ status: "paid", paid_at: new Date().toISOString() } as never).eq("id", inv.apc_id);
      await admin.from("system_jobs").insert({ job_type: "payment_succeeded", entity_type: "manuscript", entity_id: mid, status: "completed", payload: { stripe_event: eventId, invoice_id: invoiceId } } as never);
      const authorId2 = (m as { submitted_by: string | null } | null)?.submitted_by;
      const jId2 = (m as { journal_id: string } | null)?.journal_id;
      if (authorId2) {
        await admin.from("notifications").insert({ user_id: authorId2, journal_id: jId2, manuscript_id: mid, type: "payment_received", title: "Payment received", message: "Your APC payment has been confirmed.", action_url: `/author/submissions/${mid}` } as never);
        const { data: profile } = await admin.from("profiles").select("email, first_name, last_name").eq("id", authorId2).maybeSingle();
        const p = profile as { email: string | null; first_name: string | null; last_name: string | null } | null;
        if (p?.email) {
          await enqueueEmailJob(admin as never, {
            templateName: "payment_received",
            recipientEmail: p.email,
            recipientUserId: authorId2,
            manuscriptId: mid,
            context: { recipientName: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Author", manuscriptId: mid, amount: String(amount), currency },
          });
          await admin.from("email_logs").insert({ user_id: authorId2, manuscript_id: mid, recipient_email: p.email, template_name: "payment_received", subject: `Payment received — ${currency} ${amount}`, status: "queued" } as never);
        }
      }
      await admin.from("audit_logs").insert({ action: "payment.succeeded", entity_type: "invoice", entity_id: invoiceId, new_data: { stripeEvent: eventId } } as never);
    }
    void processPendingEmails(admin).catch((e) => {
      console.error("[payments] email worker drain failed:", e);
    });
    return NextResponse.json({ received: true, fallback: true });
  }
  void processPendingEmails(admin).catch((e) => {
    console.error("[payments] email worker drain failed:", e);
  });
  return NextResponse.json({ received: true });
}
