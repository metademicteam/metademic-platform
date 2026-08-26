export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { JobsClient } from "./JobsClient";

export default async function AdminJobsPage({ searchParams }: { searchParams: Promise<{ status?: string; jobType?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = sp.status ?? "all";
  const jobType = sp.jobType ?? "all";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = 20;

  const supabase = await createClient();
  let query = supabase.from("system_jobs").select("*", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (status !== "all") query = query.eq("status", status as never);
  if (jobType !== "all") query = query.eq("job_type", jobType as never);
  const { data, count, error } = await query;

  const jobs = (data ?? []) as Array<{ id: string; job_type: string; entity_type: string | null; entity_id: string | null; status: string; attempts: number; max_attempts: number; scheduled_at: string; created_at: string; error_message: string | null; payload: Record<string, unknown> }>;
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">System Jobs</h1>
          <p className="text-sm text-muted-foreground mt-1">List system_jobs with status filter, retry. Workers poll pending jobs.</p>
        </div>
        <Badge variant="outline" className="font-mono text-xs">{total} jobs</Badge>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-wrap gap-3">
            <select name="status" defaultValue={status} className="border rounded-md px-3 py-2 text-sm bg-background">
              <option value="all">All statuses</option>
              <option value="pending">pending</option>
              <option value="processing">processing</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
              <option value="cancelled">cancelled</option>
            </select>
            <Input name="jobType" placeholder="job_type (e.g. send_email, doi_registration)" defaultValue={jobType !== "all" ? jobType : ""} className="max-w-[260px]" />
            <Button type="submit" variant="outline">Filter</Button>
            {(status !== "all" || jobType !== "all") && <Button asChild variant="ghost"><Link href="/admin/jobs">Clear</Link></Button>}
          </form>
        </CardContent>
      </Card>

      {error && <Card className="border-destructive"><CardContent className="p-4 text-sm text-destructive">{error.message}</CardContent></Card>}

      <Card>
        <CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="text-base">Jobs — page {page} of {totalPages}</CardTitle><CardDescription className="text-xs">{jobs.length} shown</CardDescription></div></CardHeader>
        <CardContent className="p-0">
          <JobsClient jobs={jobs} />
          <div className="flex items-center justify-between p-4 border-t text-sm">
            <span className="text-muted-foreground">{total} total · page {page}/{totalPages}</span>
            <div className="flex gap-2">
              {page > 1 && <Button asChild variant="outline" size="sm"><Link href={`/admin/jobs?status=${status}&jobType=${jobType}&page=${page - 1}`}>Prev</Link></Button>}
              {page < totalPages && <Button asChild variant="outline" size="sm"><Link href={`/admin/jobs?status=${status}&jobType=${jobType}&page=${page + 1}`}>Next</Link></Button>}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
