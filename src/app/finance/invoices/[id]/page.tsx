export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileInvoicesForManuscripts, reconcileInvoiceWithStripe } from "@/lib/payments/reconcile";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { PaymentButton } from "@/components/finance/PaymentButton";
import { PaymentVerifyBanner } from "@/components/finance/PaymentVerifyBanner";
import { ApcCard } from "@/components/finance/ApcCard";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const admin = createAdminClient();
  const { data: invoice } = await admin.from("invoices").select("*").eq("id", id).single();
  if (!invoice) notFound();
  // Auto-heal: if Stripe session is paid but DB still shows pending, reconcile server-side before render
  let invoiceFinal: typeof invoice = invoice;
  try {
    const _invStatus = (invoice as { status: string }).status;
    if (_invStatus !== "paid" && process.env.STRIPE_SECRET_KEY) {
      const r = await reconcileInvoiceWithStripe((invoice as { id: string }).id);
      if (r.reconciled) {
        const { data: healed } = await admin.from("invoices").select("*").eq("id", id).single();
        if (healed) invoiceFinal = healed as typeof invoice;
      }
    }
  } catch {}
  const inv = invoiceFinal as { id: string; invoice_number: string; apc_id: string; amount: number; currency: string; status: string; billing_name: string | null; billing_email: string | null; billing_address: string | null; issued_at: string | null; due_at: string | null; paid_at: string | null };
  const { data: apc } = await admin.from("apcs").select("id, manuscript_id, base_amount, discount_amount, waiver_amount, tax_amount, total_amount, currency, status").eq("id", inv.apc_id).single();
  const { data: manuscript } = apc ? await admin.from("manuscripts").select("id, manuscript_number, title, status, journal_id").eq("id", (apc as { manuscript_id: string }).manuscript_id).single() : { data: null };
  const { data: payments } = await admin.from("payments").select("*").eq("invoice_id", id).order("created_at", { ascending: false });
  const { data: journal } = manuscript ? await admin.from("journals").select("name, slug").eq("id", (manuscript as { journal_id: string }).journal_id).single() : { data: null };

  const fmt = (n: number, c: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(Number(n));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-mono">{inv.invoice_number}</h1>
          <p className="text-sm text-muted-foreground mt-1">Invoice detail with billing info · Payments & APC below.</p>
        </div>
        <Link href="/finance/invoices" className="text-sm text-primary hover:underline">← All invoices</Link>
      </div>

      <PaymentVerifyBanner invoiceId={inv.id} initialStatus={inv.status} />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Billing Information</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Invoice</span><span className="font-mono font-medium">{inv.invoice_number}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant={inv.status==="paid"?"default":"secondary"}>{inv.status}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold">{fmt(inv.amount, inv.currency)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Issued</span><span>{inv.issued_at ? new Date(inv.issued_at).toLocaleString() : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Due</span><span>{inv.due_at ? new Date(inv.due_at).toLocaleString() : "—"}</span></div>
            {inv.paid_at && <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span>{new Date(inv.paid_at).toLocaleString()}</span></div>}
            <div className="border-t pt-3 space-y-1">
              <p className="font-medium text-sm">Bill to</p>
              <p className="text-sm">{inv.billing_name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{inv.billing_email ?? "—"}</p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{inv.billing_address ?? "—"}</p>
            </div>
            {manuscript && (
              <div className="border-t pt-3">
                <p className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">Manuscript</p>
                <p className="text-sm font-medium mt-1">{(manuscript as { title: string }).title}</p>
                <p className="text-xs font-mono">{(manuscript as { manuscript_number: string }).manuscript_number} · {(manuscript as { status: string }).status}</p>
                {journal && <p className="text-xs text-muted-foreground">{(journal as { name: string }).name}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {apc && (
            <ApcCard baseAmount={Number((apc as { base_amount: number }).base_amount)} discountAmount={Number((apc as { discount_amount: number }).discount_amount)} waiverAmount={Number((apc as { waiver_amount: number }).waiver_amount)} taxAmount={Number((apc as { tax_amount: number }).tax_amount)} totalAmount={Number((apc as { total_amount: number }).total_amount)} currency={(apc as { currency: string }).currency} status={(apc as { status: string }).status} manuscriptNumber={manuscript ? (manuscript as { manuscript_number: string }).manuscript_number : undefined} />
          )}
          {inv.status !== "paid" && inv.status !== "cancelled" && inv.status !== "refunded" && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Payment</CardTitle><CardDescription className="text-xs">Creates Stripe Checkout session server-side.</CardDescription></CardHeader>
              <CardContent><PaymentButton invoiceId={inv.id} amount={Number(inv.amount)} currency={inv.currency} /></CardContent>
            </Card>
          )}
          {inv.status === "paid" && (
            <Card className="border-emerald-200 bg-emerald-50"><CardContent className="py-6 text-center"><p className="text-emerald-700 font-medium">✓ Paid</p><p className="text-xs text-muted-foreground mt-1">This invoice is paid. Manuscript may advance to production.</p></CardContent></Card>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Payments</CardTitle></CardHeader>
        <CardContent className="p-0">
          {!payments || payments.length === 0 ? (
            <p className="text-sm text-muted-foreground p-8 text-center">No payments yet. Use the Pay button to create a checkout session.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Payment</TableHead><TableHead>Provider</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(payments as Array<{ id: string; provider: string | null; provider_payment_id: string | null; amount: number; currency: string; status: string; created_at: string }>).map(p => (
                    <TableRow key={p.id}><TableCell className="font-mono text-xs">{p.id.slice(0,10)}…</TableCell><TableCell className="text-xs">{p.provider ?? "—"} <span className="font-mono text-xs block truncate max-w-[140px]">{p.provider_payment_id ?? "—"}</span></TableCell><TableCell>{fmt(p.amount, p.currency)}</TableCell><TableCell><Badge variant={p.status==="succeeded"?"default":"secondary"}>{p.status}</Badge></TableCell><TableCell className="text-xs">{new Date(p.created_at).toLocaleString()}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

