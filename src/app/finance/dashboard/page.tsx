export const dynamic = "force-dynamic";

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Wallet, Clock, CheckCircle, Tag, TrendingUp, FileText } from "lucide-react";

export default async function FinanceDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Use admin after finance role check (layout already checks), to bypass missing RLS
  const admin = createAdminClient();
  const [{ data: invoices }, { data: apcs }, { data: payments }, { data: waivers }] = await Promise.all([
    admin.from("invoices").select("id, invoice_number, amount, currency, status, issued_at, due_at, paid_at, apc_id").order("created_at", { ascending: false }).limit(100),
    admin.from("apcs").select("id, manuscript_id, total_amount, currency, status").limit(100),
    admin.from("payments").select("id, amount, currency, status, created_at, invoice_id").order("created_at", { ascending: false }).limit(100),
    admin.from("apc_waivers").select("id, status, requested_amount, approved_amount, reason, requested_at").order("requested_at", { ascending: false }).limit(50),
  ]);

  const invList = (invoices ?? []) as Array<{ id: string; invoice_number: string; amount: number; currency: string; status: string; issued_at: string | null; apc_id: string }>;
  const payList = (payments ?? []) as Array<{ id: string; amount: number; currency: string; status: string; created_at: string }>;
  const apcList = (apcs ?? []) as Array<{ id: string; status: string; total_amount: number; currency: string }>;
  const waiverList = (waivers ?? []) as Array<{ id: string; status: string; requested_amount: number | null; approved_amount: number | null; requested_at: string | null }>;

  const totalInvoices = invList.length;
  const pendingPayments = invList.filter(i => ["issued","pending","payment_pending"].includes(i.status)).length;
  const paid = invList.filter(i => i.status === "paid").length;
  const waiversCount = waiverList.length;
  const revenue = invList.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0);
  const revenueCurrency = invList.find(i => i.status === "paid")?.currency ?? "USD";

  // Mock aggregation: revenue by month (from paid invoices)
  const revenueByMonth: Record<string, number> = {};
  for (const inv of invList.filter(i => i.status === "paid")) {
    const d = inv.issued_at ? new Date(inv.issued_at) : new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    revenueByMonth[key] = (revenueByMonth[key] ?? 0) + Number(inv.amount);
  }
  const months = Object.entries(revenueByMonth).sort(([a],[b]) => a.localeCompare(b)).slice(-6);
  const maxRevenue = Math.max(...months.map(([,v]) => v), 1);

  const stats = [
    { label: "Invoices", value: totalInvoices, icon: FileText, color: "text-primary" },
    { label: "Pending Payments", value: pendingPayments, icon: Clock, color: "text-amber-600" },
    { label: "Paid", value: paid, icon: CheckCircle, color: "text-emerald-600" },
    { label: "Waivers", value: waiversCount, icon: Tag, color: "text-violet-600" },
    { label: "Revenue", value: new Intl.NumberFormat("en-US", { style: "currency", currency: revenueCurrency }).format(revenue), icon: Wallet, color: "text-green-700" },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1280px] mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Finance Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">APC aggregates from apcs / invoices / payments + waivers. DataTables below.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href="/finance/invoices">All invoices</Link></Button>
          <Button asChild><Link href="/api/invoices">API: /api/invoices</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {stats.map(s => (
          <Card key={s.label}>
            <CardHeader className="pb-2 p-4">
              <div className="flex items-center justify-between">
                <CardDescription className="text-[11px] uppercase tracking-widest font-semibold">{s.label}</CardDescription>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <CardTitle className="text-xl mt-1 line-clamp-1">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Revenue (last 6 months — paid invoices)</CardTitle>
            <CardDescription className="text-xs">Mock aggregation from apcs/invoices/payments — replace with materialized view later.</CardDescription>
          </CardHeader>
          <CardContent>
            {months.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No revenue yet. Paid invoices will appear here.</p>
            ) : (
              <div className="space-y-3">
                {months.map(([m, v]) => (
                  <div key={m} className="flex items-center gap-3">
                    <span className="text-xs font-mono w-16">{m}</span>
                    <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${(v / maxRevenue) * 100}%` }} />
                    </div>
                    <span className="text-xs font-medium w-20 text-right">{new Intl.NumberFormat("en-US", { style: "currency", currency: revenueCurrency }).format(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">APC Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {Object.entries(apcList.reduce((acc: Record<string, number>, a) => { acc[a.status] = (acc[a.status] ?? 0) + 1; return acc; }, {})).map(([status, count]) => (
              <div key={status} className="flex justify-between items-center border-b py-2 last:border-0">
                <Badge variant="secondary" className="capitalize">{status.replaceAll("_"," ")}</Badge>
                <span className="font-medium">{count}</span>
              </div>
            ))}
            {apcList.length === 0 && <p className="text-muted-foreground text-sm py-4 text-center">No APC records yet.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Invoices</CardTitle>
          <Link href="/finance/invoices" className="text-xs font-medium text-primary hover:underline">View all →</Link>
        </CardHeader>
        <CardContent className="p-0">
          {invList.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No invoices yet. Create via APC calculation → invoice.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Invoice</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Issued</TableHead><TableHead>Action</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {invList.slice(0, 10).map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                      <TableCell className="text-sm font-medium">{new Intl.NumberFormat("en-US", { style: "currency", currency: inv.currency }).format(Number(inv.amount))}</TableCell>
                      <TableCell><Badge variant={inv.status === "paid" ? "default" : inv.status === "pending" || inv.status === "issued" ? "secondary" : "outline"}>{inv.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{inv.issued_at ? new Date(inv.issued_at).toLocaleDateString() : "—"}</TableCell>
                      <TableCell><Button asChild variant="outline" size="sm"><Link href={`/finance/invoices/${inv.id}`}>View</Link></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Pending Payments</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Payment</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                <TableBody>
                  {payList.filter(p => p.status === "pending" || p.status === "processing").slice(0, 6).map(p => (
                    <TableRow key={p.id}><TableCell className="font-mono text-xs">{p.id.slice(0,8)}…</TableCell><TableCell>{new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency }).format(Number(p.amount))}</TableCell><TableCell><Badge variant="secondary">{p.status}</Badge></TableCell><TableCell className="text-xs">{new Date(p.created_at).toLocaleDateString()}</TableCell></TableRow>
                  ))}
                  {payList.filter(p => ["pending","processing"].includes(p.status)).length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">No pending payments.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Waivers</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Requested</TableHead><TableHead>Approved</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                <TableBody>
                  {waiverList.slice(0,6).map(w => (
                    <TableRow key={w.id}><TableCell><Badge variant={w.status==="approved"?"default": w.status==="rejected"?"destructive":"secondary"}>{w.status}</Badge></TableCell><TableCell className="text-sm">{w.requested_amount ?? "—"}</TableCell><TableCell className="text-sm">{w.approved_amount ?? "—"}</TableCell><TableCell className="text-xs">{w.requested_at ? new Date(w.requested_at).toLocaleDateString() : "—"}</TableCell></TableRow>
                  ))}
                  {waiverList.length===0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">No waivers yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
