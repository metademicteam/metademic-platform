export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { DECISION_LABELS } from "@/lib/constants";

export default async function EditorDecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: memberships } = await supabase.from("journal_members").select("journal_id, role, is_active").eq("user_id", user.id).eq("is_active", true);
  const journalIds = (memberships ?? [])
    .filter((m) => ["editor", "managing_editor", "editor_in_chief", "section_editor", "journal_manager", "journal_admin", "super_admin"].includes((m as { role: string }).role))
    .map((m) => (m as { journal_id: string }).journal_id);

  if (journalIds.length === 0) redirect("/auth/login?error=editor_required");

  // Fetch decisions for manuscripts in these journals
  const { data: manuscripts } = await supabase.from("manuscripts").select("id").in("journal_id", journalIds);
  const manuscriptIds = (manuscripts ?? []).map((m) => (m as { id: string }).id);

  if (manuscriptIds.length === 0) {
    return (
      <div className="p-6 max-w-[1280px] mx-auto">
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">No manuscripts, hence no decisions.</CardContent>
        </Card>
      </div>
    );
  }

  const { data: decisions, count } = await supabase
    .from("editorial_decisions")
    .select("id, manuscript_id, decision, system_recommendation, override_system_recommendation, editor_reason, created_at, manuscripts!inner(manuscript_number, title, journal_id)", { count: "exact" })
    .in("manuscript_id", manuscriptIds)
    .order("created_at", { ascending: false })
    .range(from, to);

  const rows = (decisions ?? []) as unknown as Array<{
    id: string;
    manuscript_id: string;
    decision: string;
    system_recommendation: string | null;
    override_system_recommendation: boolean;
    editor_reason: string | null;
    created_at: string;
    manuscripts: { manuscript_number: string; title: string; journal_id: string } | null;
  }>;

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1280px] mx-auto w-full">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Decisions</h1>
        <p className="text-sm text-muted-foreground mt-1">All editorial decisions for your journals.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Decisions</CardTitle>
          <CardDescription>
            {totalCount} decisions • Page {page} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No decisions yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Manuscript</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead>System Rec.</TableHead>
                    <TableHead>Override</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="max-w-[340px]">
                        <p className="font-mono text-xs">{d.manuscripts?.manuscript_number}</p>
                        <Link href={`/editor/manuscripts/${d.manuscript_id}`} className="text-sm font-medium hover:underline line-clamp-1">
                          {d.manuscripts?.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={d.decision === "accept" ? "default" : d.decision === "reject" || d.decision === "desk_reject" ? "destructive" : "secondary"}>
                          {DECISION_LABELS[d.decision as keyof typeof DECISION_LABELS] ?? d.decision}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{d.system_recommendation ?? "—"}</TableCell>
                      <TableCell>{d.override_system_recommendation ? <Badge variant="destructive">Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(d.created_at).toLocaleString()}</TableCell>
                      <TableCell>
                        <Link href={`/editor/manuscripts/${d.manuscript_id}`} className="text-xs text-primary hover:underline">
                          View
                        </Link>
                      </TableCell>
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
