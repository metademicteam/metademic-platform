export const dynamic = "force-dynamic";

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";

const STAGES = [
  { key: "copyediting", label: "Copyediting", color: "bg-amber-500" },
  { key: "typesetting", label: "Typesetting", color: "bg-violet-500" },
  { key: "proof_ready", label: "Proof", color: "bg-blue-500" },
  { key: "author_review", label: "Author Review", color: "bg-cyan-600" },
  { key: "corrections_requested", label: "Corrections", color: "bg-orange-500" },
  { key: "final_approval", label: "Final Approval", color: "bg-indigo-500" },
  { key: "ready", label: "Ready", color: "bg-emerald-600" },
  { key: "published", label: "Published", color: "bg-green-700" },
] as const;

export default async function ProductionDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const admin = createAdminClient();
  // Production records with joined article/manuscript/journal info — use admin after auth
  const { data: records } = await admin.from("production_records").select("id, article_id, status, assigned_copyeditor_id, assigned_production_editor_id, updated_at, created_at").order("updated_at", { ascending: false }).limit(100);

  const recs = (records ?? []) as Array<{ id: string; article_id: string; status: string; assigned_copyeditor_id: string | null; assigned_production_editor_id: string | null; updated_at: string }>;

  // Enrich with article titles — use admin
  const enriched = await Promise.all(recs.map(async r => {
    try {
      const { data: a } = await admin.from("articles").select("id, title, article_number, manuscript_id, journal_id").eq("id", r.article_id).single();
      let manuscript: { manuscript_number: string; title: string } | null = null;
      if (a) {
        const { data: m } = await admin.from("manuscripts").select("manuscript_number, title").eq("id", (a as { manuscript_id: string }).manuscript_id).single();
        manuscript = (m as unknown as { manuscript_number: string; title: string } | null);
      }
      return { ...r, article: a, manuscript };
    } catch { return { ...r, article: null, manuscript: null }; }
  }));

  const counts: Record<string, number> = {};
  for (const r of recs) counts[r.status] = (counts[r.status] ?? 0) + 1;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Production Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Stages: Copyediting → Typesetting → Proof → Corrections → Ready (kanban / table).</p>
        </div>
        <Button asChild><Link href="/production/articles">All production articles</Link></Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {STAGES.map(s => (
          <Link key={s.key} href={`/production/articles?status=${s.key}`}>
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="p-3 pb-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${s.color}`} />
                  <CardDescription className="text-[10px] uppercase tracking-widest font-semibold truncate">{s.label}</CardDescription>
                </div>
                <CardTitle className="text-xl mt-1">{counts[s.key] ?? 0}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      {/* Kanban */}
      <div className="grid lg:grid-cols-4 gap-4 overflow-x-auto">
        {STAGES.slice(0,4).map(stage => {
          const items = enriched.filter(r => r.status === stage.key);
          return (
            <Card key={stage.key} className="min-w-[250px]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${stage.color}`} />{stage.label} <Badge variant="secondary" className="ml-auto">{items.length}</Badge></CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Empty</p>
                ) : (
                  items.slice(0, 8).map(r => (
                    <Link key={r.id} href={`/production/articles/${r.article_id}`} className="block border rounded-lg p-3 hover:bg-accent/50 transition-colors">
                      <p className="text-sm font-medium line-clamp-2">{r.article ? (r.article as { title: string }).title : r.article_id.slice(0,10)}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-1">{r.manuscript ? r.manuscript.manuscript_number : r.article_id.slice(0,8)}</p>
                      <p className="text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleDateString()}</p>
                    </Link>
                  ))
                )}
                {items.length > 8 && <Link href={`/production/articles?status=${stage.key}`} className="text-xs text-primary hover:underline block text-center">+ {items.length - 8} more</Link>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Production queue (table)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {enriched.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No production records yet. Publish via APC → production → article creation creates production_records with status not_started/copyediting.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Article</TableHead><TableHead>Manuscript</TableHead><TableHead>Status</TableHead><TableHead>Updated</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {enriched.slice(0, 30).map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-[360px]"><Link href={`/production/articles/${r.article_id}`} className="font-medium hover:underline line-clamp-1">{r.article ? (r.article as { title: string }).title : r.article_id}</Link></TableCell>
                      <TableCell className="font-mono text-xs">{r.manuscript ? r.manuscript.manuscript_number : "—"}</TableCell>
                      <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
                      <TableCell className="text-xs">{new Date(r.updated_at).toLocaleDateString()}</TableCell>
                      <TableCell><Button asChild variant="outline" size="sm"><Link href={`/production/articles/${r.article_id}`}>Manage</Link></Button></TableCell>
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
