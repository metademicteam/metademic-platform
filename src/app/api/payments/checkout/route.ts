import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({ invoiceId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  const { invoiceId } = parsed.data;

  const admin = createAdminClient();
  const { data: invoice, error: invErr } = await admin.from("invoices").select("id, amount, currency, status, apc_id, invoice_number").eq("id", invoiceId).single();
  if (invErr || !invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const inv = invoice as { id: string; amount: number; currency: string; status: string; apc_id: string; invoice_number: string };
  if (inv.status === "paid") return NextResponse.json({ error: "Invoice already paid" }, { status: 400 });
  if (inv.status === "cancelled" || inv.status === "refunded") return NextResponse.json({ error: `Invoice is ${inv.status}` }, { status: 400 });

  // Ensure pending payment row exists
  const amount = Number(inv.amount);
  const currency = (inv.currency ?? "USD").toLowerCase();

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")) ?? (() => {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
    return host ? `${proto}://${host}` : "http://localhost:3000";
  })();

  // Create or reuse pending payment
  let providerPaymentId: string | null = null;
  let checkoutUrl: string | null = null;
  let mock = false;

  if (!stripeKey) {
    // Mock checkout — no external call
    providerPaymentId = `mock_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    checkoutUrl = `${appUrl}/finance/invoices/${invoiceId}?mock_checkout=1`;
    mock = true;
  } else {
    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" as never });
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price_data: { currency, product_data: { name: `Invoice ${inv.invoice_number}`, description: `Metademic APC payment` }, unit_amount: Math.round(amount * 100) }, quantity: 1 }],
        metadata: { invoice_id: invoiceId, apc_id: inv.apc_id },
        success_url: `${appUrl}/finance/invoices/${invoiceId}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/finance/invoices/${invoiceId}?payment=cancelled`,
      });
      providerPaymentId = session.id;
      checkoutUrl = session.url ?? `${appUrl}/finance/invoices/${invoiceId}`;
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe error" }, { status: 500 });
    }
  }

  // Upsert payment
  const { data: existing } = await admin.from("payments").select("id").eq("invoice_id", invoiceId).eq("status", "pending").maybeSingle();
  let payment: unknown;
  if (existing) {
    const { data, error } = await admin.from("payments").update({ provider: mock ? "mock" : "stripe", provider_payment_id: providerPaymentId, amount, currency: currency.toUpperCase(), metadata: { checkout_url: checkoutUrl } as never }).eq("id", (existing as { id: string }).id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    payment = data;
  } else {
    const { data, error } = await admin.from("payments").insert({ invoice_id: invoiceId, provider: mock ? "mock" : "stripe", provider_payment_id: providerPaymentId, amount, currency: currency.toUpperCase(), status: "pending", metadata: { checkout_url: checkoutUrl } as never }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    payment = data;
  }

  await admin.from("invoices").update({ status: "pending" } as never).eq("id", invoiceId);
  await admin.from("apcs").update({ status: "payment_pending" } as never).eq("id", inv.apc_id);
  await admin.from("audit_logs").insert({ actor_id: user.id, action: "payment.checkout_created", entity_type: "payment", entity_id: (payment as { id: string }).id, new_data: { invoiceId, provider: mock ? "mock" : "stripe", providerPaymentId } } as never);

  // For mock, also mark completed immediately? No — require webhook simulation. But we provide helper endpoint.
  // Return checkout URL
  return NextResponse.json({ url: checkoutUrl, mock, providerPaymentId, payment, invoiceId });
}
