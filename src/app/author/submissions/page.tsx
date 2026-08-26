export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { MANUSCRIPT_STATUS_LABELS, MANUSCRIPT_STATUS_COLORS, type ManuscriptStatus } from "@/lib/constants";
import { FileText, Plus, Search, Filter } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const s = status as ManuscriptStatus;
  const variant = (MANUSCRIPT_STATUS_COLORS[s] as "default" | "secondary" | "destructive" | "outline") ?? "secondary";
  return <Badge variant={variant}>{MANUSCRIPT_STATUS_LABELS[s] ?? status}</Badge>;
}

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string; sortBy?: string; sortDir?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = 20;
  const search = sp.search ?? "";
  const statusFilter = sp.status ?? "all";
  const sortBy = (sp.sortBy as "created_at" | "updated_at" | "submitted_at") ?? "updated_at";
  const sortDir = (sp.sortDir as "asc" | "desc") ?? "desc";

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("manuscripts")
    .select("id, manuscript_number, title, status, current_version, current_review_round, submitted_at, updated_at, created_at, journal_id, journals(name, slug)", { count: "exact" })
    .eq("submitted_by", user.id)
    .order(sortBy, { ascending: sortDir === "asc" })
    .range(from, to);

  if (statusFilter !== "all") query = query.eq("status", statusFilter as never);
  if (search) {
    const term = `%${search}%`;
    query = query.or(`title.ilike.${term},manuscript_number.ilike.${term},abstract.ilike.${term}`);
  }

  const { data: rows, count, error } = await query;
  const manuscripts = (rows ?? []) as unknown as Array<{
    id: string;
    manuscript_number: string;
    title: string;
    status: string;
    current_version: number;
    current_review_round: number;
    submitted_at: string | null;
    updated_at: string;
    created_at: string;
    journal_id: string;
    journals: { name: string } | null;
  }>;
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const buildQuery = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if ((overrides.search ?? search) !== "") params.set("search", overrides.search ?? search);
    if ((overrides.status ?? statusFilter) !== "all") params.set("status", overrides.status ?? statusFilter);
    if (overrides.sortBy ?? sortBy) params.set("sortBy", overrides.sortBy ?? sortBy);
    if (overrides.sortDir ?? sortDir) params.set("sortDir", overrides.sortDir ?? sortDir);
    if (overrides.page) params.set("page", overrides.page);
    else if (page !== 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1280px] mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Submissions</h1>
          <p className="text-sm text-muted-foreground mt-1">All manuscripts you have submitted ({totalCount}).</p>
        </div>
        <Button asChild>
          <Link href="/author/submissions/new">
            <Plus className="h-4 w-4" /> New Submission
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col lg:flex-row gap-3">
          <form method="GET" className="flex flex-1 gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input name="search" defaultValue={search} placeholder="Search title, manuscript ID…" className="pl-9" />
              {statusFilter !== "all" && <input type="hidden" name="status" value={statusFilter} />}
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
            {(search || statusFilter !== "all") && (
              <Button variant="ghost" asChild>
                <Link href="/author/submissions">Clear</Link>
              </Button>
            )}
          </form>
          <div className="flex gap-2 items-center overflow-x-auto">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex gap-1.5">
              {["all", "draft", "submitted", "under_review", "minor_revision", "major_revision", "accepted", "rejected", "published"].map((st) => (
                <Link
                  key={st}
                  href={`/author/submissions${buildQuery({ status: st === "all" ? undefined : st, page: undefined })}`}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${statusFilter === st ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent border-border"}`}
                >
                  {st === "all" ? "All" : MANUSCRIPT_STATUS_LABELS[st as ManuscriptStatus] ?? st}
                </Link>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Data Table</CardTitle>
            <CardDescription>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount} • Sorted by {sortBy} ({sortDir})
            </CardDescription>
          </div>
          <div className="flex gap-2 text-xs">
            <Link className="underline" href={`/author/submissions${buildQuery({ sortBy: "updated_at", sortDir: "desc" })}`}>
              Newest
            </Link>
            <Link className="underline" href={`/author/submissions${buildQuery({ sortBy: "created_at", sortDir: "asc" })}`}>
              Oldest
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <p className="p-6 text-sm text-destructive">{error.message}</p>
          ) : manuscripts.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">No submissions yet</p>
              <p className="text-sm text-muted-foreground">Start your first manuscript →</p>
              <Button asChild>
                <Link href="/author/submissions/new">Submit a manuscript</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Manuscript ID</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Journal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Version</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manuscripts.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-mono text-xs">{m.manuscript_number ?? m.id.slice(0, 8)}</TableCell>
                        <TableCell className="max-w-[360px]">
                          <Link href={`/author/submissions/${m.id}`} className="font-medium hover:underline line-clamp-2">
                            {m.title || "Untitled"}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">{m.journals?.name ?? "—"}</TableCell>
                        <TableCell>
                          <StatusBadge status={m.status} />
                        </TableCell>
                        <TableCell className="text-center text-sm">v{m.current_version}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{m.submitted_at ? new Date(m.submitted_at).toLocaleDateString() : "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(m.updated_at).toLocaleDateString()}</TableCell>
                        <TableCell className="flex gap-1">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/author/submissions/${m.id}`}>View</Link>
                          </Button>
                          {m.status === "draft" && (
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/author/submissions/new?draft=${m.id}`}>Edit</Link>
                            </Button>
                          )}
                          {(m.status === "minor_revision" || m.status === "major_revision") && (
                            <Button asChild variant="default" size="sm">
                              <Link href={`/author/submissions/${m.id}/revision`}>Revise</Link>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="md:hidden divide-y">
                {manuscripts.map((m) => (
                  <div key={m.id} className="p-4 space-y-2">
                    <div className="flex justify-between gap-2">
                      <Link href={`/author/submissions/${m.id}`} className="font-medium text-sm line-clamp-2 hover:underline">
                        {m.title || "Untitled"}
                      </Link>
                      <StatusBadge status={m.status} />
                    </div>
                    <p className="text-xs font-mono text-muted-foreground">{m.manuscript_number} • v{m.current_version} • {m.journals?.name}</p>
                    <div className="flex gap-2">
                      <Button asChild variant="outline" size="sm" className="flex-1">
                        <Link href={`/author/submissions/${m.id}`}>View</Link>
                      </Button>
                      {(m.status === "minor_revision" || m.status === "major_revision") && (
                        <Button asChild size="sm" className="flex-1">
                          <Link href={`/author/submissions/${m.id}/revision`}>Revise</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-xs text-muted-foreground">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} asChild={page > 1}>
                      {page > 1 ? <Link href={`/author/submissions${buildQuery({ page: String(page - 1) })}`}>Previous</Link> : <span>Previous</span>}
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} asChild={page < totalPages}>
                      {page < totalPages ? <Link href={`/author/submissions${buildQuery({ page: String(page + 1) })}`}>Next</Link> : <span>Next</span>}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
