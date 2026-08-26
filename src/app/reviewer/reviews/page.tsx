export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";

export default async function ReviewerReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const statusFilter = sp.status ?? "all";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const admin = createAdminClient();
  const { data: profile } = await admin.from("reviewer_profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile) {
    return (
      <div className="p-6 max-w-[1280px] mx-auto">
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">No reviewer profile.</CardContent>
        </Card>
      </div>
    );
  }
  const reviewerId = (profile as { id: string }).id;

  let query = admin
    .from("review_assignments")
    .select("id, status, deadline_at, completed_at, invited_at, review_rounds!inner(manuscript_id, round_number, manuscripts!inner(title, manuscript_number, journal_id, journals!inner(name, review_blind_type)))", { count: "exact" })
    .eq("reviewer_id", reviewerId)
    .order("deadline_at", { ascending: true })
    .range(from, to);

  if (statusFilter !== "all") query = query.eq("status", statusFilter as never);

  const { data: rows, count } = await query;
  const assignments = (rows ?? []) as unknown as Array<{
    id: string;
    status: string;
    deadline_at: string | null;
    completed_at: string | null;
    invited_at: string;
    review_rounds: { manuscript_id: string; round_number: number; manuscripts: { title: string; manuscript_number: string; journal_id: string; journals: { name: string; review_blind_type: string } } };
  }>;

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1280px] mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Reviews</h1>
          <p className="text-sm text-muted-foreground mt-1">All your review assignments and history.</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["all", "invited", "accepted", "reviewing", "completed", "declined", "overdue"].map((st) => (
          <Link
            key={st}
            href={`/reviewer/reviews?status=${st}`}
            className={`px-3 py-1 rounded-full text-xs font-medium border ${statusFilter === st ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent border-border"}`}
          >
            {st}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Reviews</CardTitle>
          <CardDescription>
            {totalCount} assignments • Page {page} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {assignments.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No reviews match filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Manuscript</TableHead>
                    <TableHead>Journal</TableHead>
                    <TableHead>Round</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a) => {
                    const isOverdue = a.deadline_at && new Date(a.deadline_at) < new Date() && a.status !== "completed";
                    return (
                      <TableRow key={a.id}>
                        <TableCell>
                          <p className="font-medium text-sm line-clamp-1">{a.review_rounds.manuscripts.title}</p>
                          <p className="text-xs font-mono text-muted-foreground">{a.review_rounds.manuscripts.manuscript_number}</p>
                        </TableCell>
                        <TableCell className="text-sm">{a.review_rounds.manuscripts.journals.name}</TableCell>
                        <TableCell className="text-sm">{a.review_rounds.round_number}</TableCell>
                        <TableCell>
                          <Badge variant={a.status === "completed" ? "default" : isOverdue ? "destructive" : "secondary"}>{a.status}</Badge>
                        </TableCell>
                        <TableCell className={`text-xs whitespace-nowrap ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                          {a.deadline_at ? new Date(a.deadline_at).toLocaleDateString() : "—"}
                          {isOverdue && " • Overdue"}
                        </TableCell>
                        <TableCell>
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/reviewer/reviews/${a.id}`}>Open</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
