import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({ manuscriptId: z.string().uuid() });

/**
 * Author-facing APC checkout.
 * Resolves (or creates) the invoice for the manuscript's APC, then returns a
 * Stripe Checkout URL. For an author's own accepted manuscript only.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  const { manuscriptId } = parsed.data;

  const admin = createAdminClient();

  // Validate ownership — only the submitting author (or a corresponding author).
  const { data: manuscript } = await admin.from("manuscripts")
    .select("id, manuscript_number, title, status, submitted_by, journal_id")
    .eq("id", manuscriptId)
    .maybeSingle();
  if (!manuscript) return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  const m = manuscript as { id: string; manuscript_number: string; title: string; status: string; submitted_by: string | null; journal_id: string };
  if (m.submitted_by !== user.id) return NextResponse.json({ error: "Forbidden — only the submitting author may pay" }, { status: 403 });

  // The manuscript must be in an APC-eligible state.
  if (!["accepted", "apc_pending", "copyediting"].includes(m.status)) {
    return NextResponse.json({ error: `Manuscript is not payable (status: ${m.status})` }, { status: 400 });
  }

  // Resolve APC (must have a positive amount).
  const { data: apc } = await admin.from("apcs").select("id, total_amount, currency, status").eq("manuscript_id", manuscriptId).maybeSingle();
  if (!apc) return NextResponse.json({ error: "No APC record for this manuscript" }, { status: 400 });
  const a = apc as { id: string; total_amount: number; currency: string; status: string };
  if (Number(a.total_amount) <= 0.01) return NextResponse.json({ error: "APC total is zero — no payment required" }, { status: 400 });
  if (a.status === "paid") return NextResponse.json({ error: "APC already paid" }, { status: 400 });

  // Resolve or create invoice.
  const invoiceRes = await admin.from("invoices").select("id, invoice_number, amount, currency, status, apc_id").eq("apc_id", a.id).maybeSingle();
  let inv = invoiceRes.data as { id: string; invoice_number: string; amount: number; currency: string; status: string; apc_id: string } | null;
  if (!inv) {
    const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const now = new Date().toISOString();
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + 30);
    const { data: created } = await admin.from("invoices").insert({
      apc_id: a.id,
      invoice_number: invoiceNumber,
      amount: a.total_amount,
      currency: (a.currency ?? "USD").toUpperCase(),
      status: "issued",
      issued_at: now,
      due_at: dueAt.toISOString(),
    } as never).select("id, invoice_number, amount, currency, status, apc_id").single();
    inv = created as { id: string; invoice_number: string; amount: number; currency: string; status: string; apc_id: string } | null;
    // Keep APC/moving to payment_pending happens on checkout.
    if (a.status === "calculated") {
      await admin.from("apcs").update({ status: "invoice_issued" } as never).eq("id", a.id);
    }
    await admin.from("manuscripts").update({ status: "apc_pending" } as never).eq("id", manuscriptId).in("status", ["accepted" as never]);
  }
  if (!inv) return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });

  const amount = Number(inv.amount);
  const currency = (inv.currency ?? "USD").toLowerCase();
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!stripeKey) {
    // No key configured — return a mock checkout URL pointing at the invoice page.
    return NextResponse.json({ url: `${appUrl}/finance/invoices/${inv.id}?mock_checkout=1`, mock: true, invoiceId: inv.id }, { status: 200 });
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" as never });
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price_data: { currency, product_data: { name: `Invoice ${inv.invoice_number}`, description: `Metademic APC payment — ${m.manuscript_number}` }, unit_amount: Math.round(amount * 100) }, quantity: 1 }],
      metadata: { invoice_id: inv.id, apc_id: a.id, manuscript_id: manuscriptId },
      success_url: `${appUrl}/finance/invoices/${inv.id}?payment=success`,
      cancel_url: `${appUrl}/finance/invoices/${inv.id}?payment=cancelled`,
    });
    // Record a pending payment row.
    await admin.from("payments").insert({
      invoice_id: inv.id,
      provider: "stripe",
      provider_payment_id: session.id,
      amount,
      currency: currency.toUpperCase(),
      status: "pending",
      metadata: { checkout_url: session.url, manuscript_id: manuscriptId } as never,
    } as never);
    await admin.from("invoices").update({ status: "pending" } as never).eq("id", inv.id);
    await admin.from("apcs").update({ status: "payment_pending" } as never).eq("id", a.id);
    return NextResponse.json({ url: session.url, invoiceId: inv.id }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe error" }, { status: 500 });
  }
}
