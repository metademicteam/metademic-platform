export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MANUSCRIPT_STATUS_LABELS, MANUSCRIPT_STATUS_COLORS, type ManuscriptStatus } from "@/lib/constants";
import { Search } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const s = status as ManuscriptStatus;
  const variant = (MANUSCRIPT_STATUS_COLORS[s] as "default" | "secondary" | "destructive" | "outline") ?? "secondary";
  return <Badge variant={variant}>{MANUSCRIPT_STATUS_LABELS[s] ?? status}</Badge>;
}

export default async function EditorSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; filter?: string; page?: string; journal?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: memberships } = await supabase.from("journal_members").select("journal_id, role, is_active").eq("user_id", user.id).eq("is_active", true);
  const editorJournalIds = (memberships ?? [])
    .filter((m) => ["editor", "managing_editor", "editor_in_chief", "section_editor", "journal_manager", "journal_admin", "super_admin"].includes((m as { role: string }).role))
    .map((m) => (m as { journal_id: string }).journal_id);

  let journalIds = editorJournalIds;
  const isSuper = (memberships ?? []).some((m) => (m as { role: string }).role === "super_admin");
  if (journalIds.length === 0 && isSuper) {
    const { data: journals } = await supabase.from("journals").select("id");
    journalIds = (journals ?? []).map((j) => (j as { id: string }).id);
  }

  if (journalIds.length === 0) {
    return (
      <div className="p-6 max-w-[1280px] mx-auto">
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">No editor journals assigned.</CardContent>
        </Card>
      </div>
    );
  }

  const statusFilter = sp.status ?? "all";
  const search = sp.search ?? "";
  const filter = sp.filter ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("manuscripts")
    .select("id, manuscript_number, title, status, assigned_editor_id, journal_id, submitted_at, updated_at, journals!inner(name, slug), current_version", { count: "exact" })
    .in("journal_id", journalIds)
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (statusFilter !== "all") query = query.eq("status", statusFilter as never);
  if (search) {
    const term = `%${search}%`;
    query = query.or(`title.ilike.${term},manuscript_number.ilike.${term}`);
  }
  if (filter === "unassigned") query = query.is("assigned_editor_id", null);

  const { data: rows, count, error } = await query;
  const manuscripts = (rows ?? []) as unknown as Array<{
    id: string;
    manuscript_number: string;
    title: string;
    status: string;
    assigned_editor_id: string | null;
    journal_id: string;
    submitted_at: string | null;
    updated_at: string;
    journals: { name: string; slug: string } | null;
    current_version: number;
  }>;

  // Fetch editor profiles for assigned editors to show workload indicators
  const editorIds = [...new Set(manuscripts.map((m) => m.assigned_editor_id).filter(Boolean) as string[])];
  const editorMap: Record<string, { display_name: string | null; email: string | null }> = {};
  if (editorIds.length) {
    const { data: editors } = await supabase.from("profiles").select("id, display_name, email").in("id", editorIds);
    for (const e of (editors ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>) {
      editorMap[e.id] = e;
    }
  }

  // Workload: count manuscripts per editor
  const workload: Record<string, number> = {};
  for (const m of manuscripts) {
    if (m.assigned_editor_id) workload[m.assigned_editor_id] = (workload[m.assigned_editor_id] ?? 0) + 1;
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Fetch journals for filter dropdown
  const { data: journals } = await supabase.from("journals").select("id, name, slug").in("id", journalIds);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1280px] mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Submissions</h1>
          <p className="text-sm text-muted-foreground mt-1">All manuscripts for your journals. Filter, assign editors, monitor workload.</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col lg:flex-row gap-3">
          <form method="GET" className="flex flex-1 gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input name="search" defaultValue={search} placeholder="Search title, ID..." className="pl-9" />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
            {(search || statusFilter !== "all" || filter) && (
              <Button variant="ghost" asChild>
                <Link href="/editor/submissions">Clear</Link>
              </Button>
            )}
            {statusFilter !== "all" && <input type="hidden" name="status" value={statusFilter} />}
            {filter && <input type="hidden" name="filter" value={filter} />}
          </form>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground">Status:</span>
            <div className="flex gap-1 flex-wrap">
              {["all", "submitted", "technical_check", "editor_assignment", "editorial_screening", "reviewer_invitation", "under_review", "decision_pending", "accepted", "rejected"].map((st) => (
                <Link
                  key={st}
                  href={`/editor/submissions?status=${st}${search ? `&search=${encodeURIComponent(search)}` : ""}${filter ? `&filter=${filter}` : ""}`}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusFilter === st ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent border-border"}`}
                >
                  {st === "all" ? "All" : MANUSCRIPT_STATUS_LABELS[st as ManuscriptStatus] ?? st}
                </Link>
              ))}
            </div>
            <Link href={`/editor/submissions?filter=${filter === "unassigned" ? "" : "unassigned"}`} className={`px-2.5 py-1 rounded-full text-xs font-medium border ${filter === "unassigned" ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent border-border"}`}>
              Unassigned only
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Manuscripts</CardTitle>
            <CardDescription>
              {totalCount} manuscripts • Page {page} of {totalPages}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 text-sm text-destructive">Failed to load: {error.message}</div>
          ) : manuscripts.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No manuscripts match filters.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Manuscript ID</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Journal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Editor</TableHead>
                      <TableHead>Workload</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manuscripts.map((m) => {
                      const editor = m.assigned_editor_id ? editorMap[m.assigned_editor_id] : null;
                      const load = m.assigned_editor_id ? workload[m.assigned_editor_id] ?? 0 : 0;
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="font-mono text-xs whitespace-nowrap">{m.manuscript_number}</TableCell>
                          <TableCell className="max-w-[340px]">
                            <Link href={`/editor/manuscripts/${m.id}`} className="font-medium hover:underline line-clamp-2">
                              {m.title}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{m.journals?.name ?? "—"}</TableCell>
                          <TableCell>
                            <StatusBadge status={m.status} />
                          </TableCell>
                          <TableCell className="text-xs">
                            {editor ? (
                              <span>
                                {editor.display_name ?? editor.email ?? m.assigned_editor_id?.slice(0, 8)}
                              </span>
                            ) : (
                              <Badge variant="outline">Unassigned</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {m.assigned_editor_id ? (
                              <span className={load > 5 ? "text-amber-600 font-medium" : load > 8 ? "text-red-600 font-medium" : "text-muted-foreground"}>
                                {load} assigned
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(m.updated_at).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/editor/manuscripts/${m.id}`}>View</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-xs text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} asChild={page > 1}>
                      {page > 1 ? <Link href={`/editor/submissions?status=${statusFilter}&search=${encodeURIComponent(search)}&filter=${filter}&page=${page - 1}`}>Previous</Link> : <span>Previous</span>}
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} asChild={page < totalPages}>
                      {page < totalPages ? <Link href={`/editor/submissions?status=${statusFilter}&search=${encodeURIComponent(search)}&filter=${filter}&page=${page + 1}`}>Next</Link> : <span>Next</span>}
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
