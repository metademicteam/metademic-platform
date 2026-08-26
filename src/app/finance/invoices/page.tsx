export const dynamic = "force-dynamic";

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const status = sp.status ?? "all";
  // auth check via anon, data via admin to bypass RLS
  const supabase = await createClient();
  const { data: { user: invUser } } = await supabase.auth.getUser();
  if (!invUser) redirect("/auth/login");
  const admin = createAdminClient();
  let query = admin.from("invoices").select("id, invoice_number, amount, currency, status, issued_at, due_at, paid_at, apc_id, billing_name").order("created_at", { ascending: false }).limit(100);
  if (status !== "all") query = query.eq("status", status as never);
  if (q) query = query.ilike("invoice_number", `%${q}%`);
  const { data } = await query;
  const list = (data ?? []) as Array<{ id: string; invoice_number: string; amount: number; currency: string; status: string; issued_at: string | null; due_at: string | null; billing_name: string | null }>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <Link href="/finance/dashboard" className="text-sm text-primary hover:underline">← Finance dashboard</Link>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap gap-3">
            <Input name="q" placeholder="Search invoice number…" defaultValue={q} className="max-w-[260px]" />
            <select name="status" defaultValue={status} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="all">All statuses</option>
              <option value="issued">Issued</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
              <option value="draft">Draft</option>
            </select>
            <Button type="submit" variant="outline">Filter</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {list.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No invoices found. Create via APC → invoice.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Invoice</TableHead><TableHead>Billing</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Due</TableHead><TableHead>Action</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {list.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                      <TableCell className="text-sm">{inv.billing_name ?? "—"}</TableCell>
                      <TableCell className="font-medium">{new Intl.NumberFormat("en-US", { style: "currency", currency: inv.currency }).format(Number(inv.amount))}</TableCell>
                      <TableCell><Badge variant={inv.status === "paid" ? "default" : "secondary"}>{inv.status}</Badge></TableCell>
                      <TableCell className="text-xs">{inv.due_at ? new Date(inv.due_at).toLocaleDateString() : "—"}</TableCell>
                      <TableCell><Button asChild variant="outline" size="sm"><Link href={`/finance/invoices/${inv.id}`}>View</Link></Button></TableCell>
                    </TableRow>
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
