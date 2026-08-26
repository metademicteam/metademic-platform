export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { getAnalytics } from "@/lib/analytics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}
function fmtDays(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(1)} days`;
}
function fmtCurrency(v: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ journalId?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const analytics = await getAnalytics(supabase as never, { journalId: sp.journalId ?? null });

  const { submissionsPerMonth, acceptanceRate, rejectionRate, avgFirstDecisionDays, avgReviewDays, avgPublicationDays, reviewerCompletionRate, reviewerOverdueRate, apcRevenue, waiverAmount, articlesPublished, countries, institutions, subjects, totalSubmissions, acceptedCount, rejectedCount, totalReviews, completedReviews, overdueReviews, invoiceCount, paidInvoiceCount } = analytics;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Journal Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Submissions/month, acceptance/rejection rate, avg first decision time, avg review time, reviewer completion/overdue, avg publication time, APC revenue, waiver amount, articles published, countries/institutions/subjects. Simple aggregates — not heavy per-request calc.
        </p>
        {sp.journalId && <Badge variant="outline" className="mt-2 font-mono text-xs">journal: {sp.journalId.slice(0, 8)}…</Badge>}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardHeader className="p-4 pb-1"><CardDescription className="text-[11px] uppercase tracking-widest font-semibold">Total Submissions</CardDescription><CardTitle className="text-xl">{totalSubmissions}</CardTitle></CardHeader><CardContent className="p-4 pt-0 text-xs text-muted-foreground">{submissionsPerMonth.length} months bucketed · last 12 shown</CardContent></Card>
        <Card><CardHeader className="p-4 pb-1"><CardDescription className="text-[11px] uppercase tracking-widest font-semibold">Acceptance Rate</CardDescription><CardTitle className="text-xl">{fmtPct(acceptanceRate)}</CardTitle></CardHeader><CardContent className="p-4 pt-0 text-xs text-muted-foreground">{acceptedCount} accepted · {rejectedCount} rejected</CardContent></Card>
        <Card><CardHeader className="p-4 pb-1"><CardDescription className="text-[11px] uppercase tracking-widest font-semibold">Rejection Rate</CardDescription><CardTitle className="text-xl">{fmtPct(rejectionRate)}</CardTitle></CardHeader><CardContent className="p-4 pt-0 text-xs text-muted-foreground">{rejectedCount} rejected of {totalSubmissions}</CardContent></Card>
        <Card><CardHeader className="p-4 pb-1"><CardDescription className="text-[11px] uppercase tracking-widest font-semibold">Articles Published</CardDescription><CardTitle className="text-xl">{articlesPublished}</CardTitle></CardHeader><CardContent className="p-4 pt-0 text-xs text-muted-foreground">publication_status = published</CardContent></Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardHeader className="p-4 pb-1"><CardDescription className="text-[11px] uppercase tracking-widest font-semibold">Avg First Decision</CardDescription><CardTitle className="text-lg">{fmtDays(avgFirstDecisionDays)}</CardTitle></CardHeader><CardContent className="p-4 pt-0 text-xs text-muted-foreground">submitted → first editorial decision</CardContent></Card>
        <Card><CardHeader className="p-4 pb-1"><CardDescription className="text-[11px] uppercase tracking-widest font-semibold">Avg Review Time</CardDescription><CardTitle className="text-lg">{fmtDays(avgReviewDays)}</CardTitle></CardHeader><CardContent className="p-4 pt-0 text-xs text-muted-foreground">assignment created → completed</CardContent></Card>
        <Card><CardHeader className="p-4 pb-1"><CardDescription className="text-[11px] uppercase tracking-widest font-semibold">Avg Publication Time</CardDescription><CardTitle className="text-lg">{fmtDays(avgPublicationDays)}</CardTitle></CardHeader><CardContent className="p-4 pt-0 text-xs text-muted-foreground">received → published</CardContent></Card>
        <Card><CardHeader className="p-4 pb-1"><CardDescription className="text-[11px] uppercase tracking-widest font-semibold">APC Revenue</CardDescription><CardTitle className="text-lg">{fmtCurrency(apcRevenue)}</CardTitle></CardHeader><CardContent className="p-4 pt-0 text-xs text-muted-foreground">from paid invoices · waivers {fmtCurrency(waiverAmount)}</CardContent></Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardHeader className="p-4 pb-1"><CardDescription className="text-[11px] uppercase tracking-widest font-semibold">Reviewer Completion</CardDescription><CardTitle className="text-lg">{fmtPct(reviewerCompletionRate)}</CardTitle></CardHeader><CardContent className="p-4 pt-0 text-xs text-muted-foreground">{completedReviews} / {totalReviews} completed</CardContent></Card>
        <Card><CardHeader className="p-4 pb-1"><CardDescription className="text-[11px] uppercase tracking-widest font-semibold">Reviewer Overdue</CardDescription><CardTitle className="text-lg">{fmtPct(reviewerOverdueRate)}</CardTitle></CardHeader><CardContent className="p-4 pt-0 text-xs text-muted-foreground">{overdueReviews} overdue of {totalReviews}</CardContent></Card>
        <Card><CardHeader className="p-4 pb-1"><CardDescription className="text-[11px] uppercase tracking-widest font-semibold">Invoices</CardDescription><CardTitle className="text-lg">{invoiceCount}</CardTitle></CardHeader><CardContent className="p-4 pt-0 text-xs text-muted-foreground">{paidInvoiceCount} paid</CardContent></Card>
        <Card><CardHeader className="p-4 pb-1"><CardDescription className="text-[11px] uppercase tracking-widest font-semibold">Waiver Amount</CardDescription><CardTitle className="text-lg">{fmtCurrency(waiverAmount)}</CardTitle></CardHeader><CardContent className="p-4 pt-0 text-xs text-muted-foreground">sum of apcs.waiver_amount</CardContent></Card>
      </div>

      {/* Submissions per month - simple bar with divs (no heavy Recharts required) */}
      <Card>
        <CardHeader><CardTitle className="text-base">Submissions / month (last 12)</CardTitle><CardDescription className="text-xs">Recharts placeholder — rendered as lightweight div bars to avoid heavy calc per request.</CardDescription></CardHeader>
        <CardContent>
          {submissionsPerMonth.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No submissions yet.</p> : (
            <div className="space-y-2">
              {(() => {
                const max = Math.max(...submissionsPerMonth.map((d) => d.count), 1);
                return submissionsPerMonth.map((d) => (
                  <div key={d.month} className="flex items-center gap-3">
                    <span className="text-xs font-mono w-[68px]">{d.month}</span>
                    <div className="flex-1 h-6 bg-muted rounded overflow-hidden relative">
                      <div className="h-full bg-primary transition-all" style={{ width: `${(d.count / max) * 100}%` }} />
                      <span className="absolute inset-0 flex items-center px-2 text-xs font-medium">{d.count}</span>
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Countries (top)</CardTitle><CardDescription className="text-xs">from profiles.country_code</CardDescription></CardHeader>
          <CardContent className="p-0">
            <Table><TableHeader><TableRow><TableHead>Country</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader><TableBody>
              {countries.map((c) => <TableRow key={c.name}><TableCell className="text-sm font-mono">{c.name || "—"}</TableCell><TableCell className="text-right text-sm">{c.count}</TableCell></TableRow>)}
              {countries.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-sm text-muted-foreground py-6">No data</TableCell></TableRow>}
            </TableBody></Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Institutions (top)</CardTitle><CardDescription className="text-xs">from manuscript_authors.institution</CardDescription></CardHeader>
          <CardContent className="p-0">
            <Table><TableHeader><TableRow><TableHead>Institution</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader><TableBody>
              {institutions.map((i) => <TableRow key={i.name}><TableCell className="text-sm truncate max-w-[220px]" title={i.name}>{i.name}</TableCell><TableCell className="text-right text-sm">{i.count}</TableCell></TableRow>)}
              {institutions.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-sm text-muted-foreground py-6">No data</TableCell></TableRow>}
            </TableBody></Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Subjects (top)</CardTitle><CardDescription className="text-xs">from manuscripts.subject_areas</CardDescription></CardHeader>
          <CardContent className="p-0">
            <Table><TableHeader><TableRow><TableHead>Subject</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader><TableBody>
              {subjects.map((s) => <TableRow key={s.name}><TableCell className="text-sm">{s.name}</TableCell><TableCell className="text-right text-sm">{s.count}</TableCell></TableRow>)}
              {subjects.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-sm text-muted-foreground py-6">No data</TableCell></TableRow>}
            </TableBody></Table>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/30">
        <CardContent className="p-4 text-xs text-muted-foreground">
          Notes: Analytics queries are limited to 2000 rows per source for responsiveness. For production, replace with SQL views / materialized views and cache. Filters via <code className="bg-background px-1 rounded">?journalId=uuid</code> per journal.
        </CardContent>
      </Card>
    </div>
  );
}
