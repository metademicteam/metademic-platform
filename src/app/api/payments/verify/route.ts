import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueEmailJob } from "@/lib/jobs";
import { processPendingEmails } from "@/lib/email/send";
import { z } from "zod";

const schema = z.object({
  invoiceId: z.string().uuid(),
  sessionId: z.string().optional(),
});

async function ensureArticleInProduction(
  admin: ReturnType<typeof createAdminClient>,
  manuscriptId: string,
) {
  const { data: existingArticle } = await admin.from("articles").select("id").eq("manuscript_id", manuscriptId).maybeSingle();
  if (existingArticle) {
    const { data: prod } = await admin.from("production_records").select("id").eq("article_id", (existingArticle as { id: string }).id).maybeSingle();
    if (!prod) await admin.from("production_records").insert({ article_id: (existingArticle as { id: string }).id, status: "copyediting" } as never);
    return existingArticle as { id: string };
  }
  const { data: m } = await admin.from("manuscripts").select("id, journal_id, title, abstract, article_type, manuscript_number, submitted_at, accepted_at").eq("id", manuscriptId).single();
  if (!m) return null;
  const ms = m as { id: string; journal_id: string; title: string; abstract: string | null; article_type: string; manuscript_number: string; submitted_at: string | null; accepted_at: string | null };
  const year = new Date().getFullYear();
  const articleNumber = `${year}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const slug = (ms.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "").slice(0, 80) || "article") + "-" + articleNumber.toLowerCase();
  const { data: article, error } = await admin.from("articles").insert({
    manuscript_id: manuscriptId, journal_id: ms.journal_id, article_number: articleNumber, slug,
    title: ms.title, abstract: ms.abstract, article_type: ms.article_type as never,
    publication_status: "draft" as never, received_at: ms.submitted_at, accepted_at: ms.accepted_at ?? new Date().toISOString(),
  } as never).select("id").single();
  if (error || !article) return null;
  const articleId = (article as { id: string }).id;
  const { data: manuscriptAuthors } = await admin.from("manuscript_authors").select("user_id, first_name, middle_name, last_name, orcid, institution_name_snapshot, author_order, is_corresponding, contribution_statement").eq("manuscript_id", manuscriptId).order("author_order", { ascending: true });
  for (const ma of (manuscriptAuthors ?? []) as Array<{ user_id: string | null; first_name: string; middle_name: string | null; last_name: string; orcid: string | null; institution_name_snapshot: string | null; author_order: number; is_corresponding: boolean; contribution_statement: string | null }>) {
    await admin.from("article_authors").insert({
      article_id: articleId, user_id: ma.user_id, first_name: ma.first_name, middle_name: ma.middle_name, last_name: ma.last_name,
      orcid: ma.orcid, affiliation: ma.institution_name_snapshot, author_order: ma.author_order, is_corresponding: ma.is_corresponding, contribution_statement: ma.contribution_statement,
    } as never);
  }
  await admin.from("production_records").insert({ article_id: articleId, status: "copyediting" } as never);
  return article as { id: string };
}

async function fulfillPaidInvoice(admin: ReturnType<typeof createAdminClient>, invoiceId: string, opts: { amount?: number; currency?: string; providerEventId?: string; providerPaymentId?: string | null }) {
  const { error, data } = await admin.rpc("payment_succeeded" as never, {
    p_invoice_id: invoiceId,
    p_provider: "stripe",
    p_provider_payment_id: opts.providerPaymentId ?? null,
    p_provider_event_id: opts.providerEventId ?? `verify_${Date.now()}`,
    p_amount: opts.amount ?? null,
    p_currency: opts.currency ?? null,
  } as never);
  if (!error) return { ok: true as const, rpc: data as string };
  // Fallback to legacy if RPC not yet deployed
  const { data: invoice } = await admin.from("invoices").select("id, apc_id, amount, currency, status").eq("id", invoiceId).single();
  if (!invoice) return { error: "Invoice not found" };
  const inv = invoice as { id: string; apc_id: string; amount: number; currency: string; status: string };
  if (inv.status === "paid") return { alreadyPaid: true as const };
  let paymentId: string | null = null;
  if (opts.providerPaymentId) {
    const { data: p } = await admin.from("payments").select("id").eq("provider_payment_id", opts.providerPaymentId).maybeSingle();
    paymentId = (p as { id: string } | null)?.id ?? null;
  }
  if (!paymentId) {
    const { data: p2 } = await admin.from("payments").select("id").eq("invoice_id", invoiceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    paymentId = (p2 as { id: string } | null)?.id ?? null;
  }
  const providerEventId = opts.providerEventId ?? `verify_${Date.now()}`;
  if (paymentId) {
    await admin.from("payments").update({ status: "succeeded", paid_at: new Date().toISOString(), provider_event_id: providerEventId, amount: opts.amount, currency: opts.currency } as never).eq("id", paymentId);
  } else {
    await admin.from("payments").insert({
      invoice_id: invoiceId, provider: "stripe", provider_payment_id: opts.providerPaymentId ?? `verify_${Date.now()}`,
      provider_event_id: providerEventId, amount: opts.amount ?? inv.amount, currency: opts.currency ?? inv.currency, status: "succeeded", paid_at: new Date().toISOString(),
    } as never);
  }
  await admin.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() } as never).eq("id", invoiceId);
  const { data: apc } = await admin.from("apcs").select("manuscript_id").eq("id", inv.apc_id).single();
  const mid = (apc as { manuscript_id: string } | null)?.manuscript_id;
  if (mid) {
    const { data: m } = await admin.from("manuscripts").select("status, journal_id, submitted_by").eq("id", mid).single();
    const s = (m as { status: string } | null)?.status;
    if (s === "apc_pending" || s === "accepted") {
      await admin.from("manuscripts").update({ status: "copyediting" } as never).eq("id", mid);
      await admin.from("workflow_events").insert({ manuscript_id: mid, from_status: s as never, to_status: "copyediting" as never, event_type: "payment_succeeded", description: "APC payment verified (redirect/verify fallback)" } as never);
    }
    await ensureArticleInProduction(admin, mid);
    await admin.from("apcs").update({ status: "paid", paid_at: new Date().toISOString() } as never).eq("id", inv.apc_id);
    await admin.from("system_jobs").insert({ job_type: "payment_succeeded", entity_type: "manuscript", entity_id: mid, status: "completed", payload: { invoice_id: invoiceId, verify: true } } as never);
    const authorId = (m as { submitted_by: string | null } | null)?.submitted_by;
    const jId = (m as { journal_id: string } | null)?.journal_id;
    if (authorId) {
      await admin.from("notifications").insert({ user_id: authorId, journal_id: jId, manuscript_id: mid, type: "payment_received", title: "Payment received", message: "Your APC payment has been confirmed.", action_url: `/author/submissions/${mid}` } as never);
      const { data: profile } = await admin.from("profiles").select("email, first_name, last_name").eq("id", authorId).maybeSingle();
      const p = profile as { email: string | null; first_name: string | null; last_name: string | null } | null;
      if (p?.email) {
        await enqueueEmailJob(admin as never, { templateName: "payment_received", recipientEmail: p.email, recipientUserId: authorId, manuscriptId: mid, context: { recipientName: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Author", manuscriptId: mid, amount: String(opts.amount ?? inv.amount), currency: opts.currency ?? inv.currency } });
        await admin.from("email_logs").insert({ user_id: authorId, manuscript_id: mid, recipient_email: p.email, template_name: "payment_received", subject: `Payment received — ${opts.currency ?? inv.currency} ${opts.amount ?? inv.amount}`, status: "queued" } as never);
      }
    }
    await admin.from("audit_logs").insert({ action: "payment.succeeded", entity_type: "invoice", entity_id: invoiceId, new_data: { verify: true, providerPaymentId: opts.providerPaymentId } } as never);
  }
  void processPendingEmails(admin).catch((e) => console.error("[payments/verify] email drain failed:", e));
  return { ok: true as const };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  const { invoiceId, sessionId } = parsed.data;

  const admin = createAdminClient();
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  const { data: invoice } = await admin.from("invoices").select("id, apc_id, status, amount, currency").eq("id", invoiceId).maybeSingle();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const inv = invoice as { id: string; apc_id: string; status: string; amount: number; currency: string };
  if (inv.status === "paid") return NextResponse.json({ status: "paid", alreadyPaid: true });

  // No Stripe key — mock/local dev fallback: if a payment row exists we can still fulfill
  if (!stripeKey) {
    const { data: payment } = await admin.from("payments").select("id, status").eq("invoice_id", invoiceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if ((payment as { status: string } | null)?.status === "succeeded") {
      const res = await fulfillPaidInvoice(admin, invoiceId, {});
      return NextResponse.json({ status: "paid", mock: true, ...res });
    }
    return NextResponse.json({ error: "Stripe not configured and no succeeded payment found (use webhook mock {\"mock\":true,\"invoiceId\":\"...\"})" }, { status: 400 });
  }

  let sid: string | null = sessionId ?? null;
  if (!sid) {
    const { data: p } = await admin.from("payments").select("provider_payment_id").eq("invoice_id", invoiceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    sid = (p as { provider_payment_id: string | null } | null)?.provider_payment_id ?? null;
  }
  if (!sid) return NextResponse.json({ error: "No checkout session found for this invoice. Open Stripe Checkout again or provide sessionId." }, { status: 400 });
  if (!sid.startsWith("cs_")) {
    // Could be a payment_intent id — try to find session via provider_payment_id fallback
    // but Stripe verify works with checkout session id only. Try retrieve as payment intent check.
    return NextResponse.json({ error: "sessionId must be a Checkout Session id (cs_...). Received: " + sid.slice(0, 12) }, { status: 400 });
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" as never });
    const session = await stripe.checkout.sessions.retrieve(sid);

    const mdInvoiceId = (session.metadata as Record<string, string> | null)?.invoice_id;
    if (mdInvoiceId && mdInvoiceId !== invoiceId) {
      return NextResponse.json({ error: "Session does not belong to this invoice" }, { status: 400 });
    }
    const isPaid = session.payment_status === "paid" || session.status === "complete";
    if (!isPaid) {
      return NextResponse.json({ status: session.payment_status, paid: false, stripeStatus: session.status }, { status: 200 });
    }
    const amount = typeof session.amount_total === "number" ? session.amount_total / 100 : Number(inv.amount);
    const currency = (session.currency as string | undefined)?.toUpperCase() ?? inv.currency;
    const piId = (session.payment_intent as string | null) ?? null;
    const eventId = `verify_${session.id}`;
    const { data: dup } = await admin.from("payments").select("id").eq("provider_event_id", eventId).maybeSingle();
    if (dup) return NextResponse.json({ status: "paid", duplicate: true });

    const result = await fulfillPaidInvoice(admin, invoiceId, { amount, currency, providerEventId: eventId, providerPaymentId: session.id });
    if ((result as { error?: string }).error) return NextResponse.json({ error: (result as { error: string }).error }, { status: 500 });
    // Optionally also record PI id
    if (piId) {
      await admin.from("payments").update({ provider_payment_id: session.id } as never).eq("invoice_id", invoiceId).eq("status", "succeeded" as never);
    }
    return NextResponse.json({ status: "paid", paid: true, amount, currency });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe verify failed" }, { status: 500 });
  }
}
