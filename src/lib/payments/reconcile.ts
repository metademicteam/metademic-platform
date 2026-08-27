import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function reconcileInvoiceWithStripe(invoiceId: string): Promise<{ reconciled: boolean; status?: string; error?: string }> {
  const admin = createAdminClient();
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return { reconciled: false, error: "no_stripe_key" };

  const { data: invoice } = await admin.from("invoices").select("id, status").eq("id", invoiceId).maybeSingle();
  if (!invoice) return { reconciled: false, error: "invoice_not_found" };
  if ((invoice as { status: string }).status === "paid") return { reconciled: false, status: "already_paid" };

  const { data: payment } = await admin.from("payments").select("provider_payment_id, status").eq("invoice_id", invoiceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const sid = (payment as { provider_payment_id: string | null } | null)?.provider_payment_id ?? null;
  if (!sid || !sid.startsWith("cs_")) return { reconciled: false, error: "no_session" };

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" as never });
    const session = await stripe.checkout.sessions.retrieve(sid);
    const isPaid = session.payment_status === "paid" || session.status === "complete";
    if (!isPaid) return { reconciled: false, status: session.payment_status };
    const { error } = await admin.rpc("payment_succeeded" as never, {
      p_invoice_id: invoiceId,
      p_provider: "stripe",
      p_provider_payment_id: session.id,
      p_provider_event_id: `reconcile_${session.id}`,
      p_amount: typeof session.amount_total === "number" ? session.amount_total / 100 : null,
      p_currency: (session.currency as string | undefined)?.toUpperCase() ?? null,
    } as never);
    if (error) return { reconciled: false, error: error.message };
    return { reconciled: true, status: "paid" };
  } catch (e) {
    return { reconciled: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function reconcileInvoicesForManuscripts(manuscriptIds: string[]): Promise<void> {
  if (!manuscriptIds.length) return;
  const admin = createAdminClient();
  const { data: rows } = await admin.from("apcs").select("id, manuscript_id, status, invoices!inner(id, status)").in("manuscript_id", manuscriptIds as never);
  const candidates = (rows as unknown as Array<{ manuscript_id: string; status: string; invoices: { id: string; status: string } | Array<{ id: string; status: string }> }> | null) ?? [];
  for (const r of candidates) {
    const inv = Array.isArray(r.invoices) ? r.invoices[0] : r.invoices;
    if (!inv || inv.status === "paid" || r.status === "paid") continue;
    await reconcileInvoiceWithStripe(inv.id);
  }
}
