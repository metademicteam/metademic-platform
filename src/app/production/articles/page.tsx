export const dynamic = "force-dynamic";

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";

export default async function ProductionArticlesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const status = sp.status ?? "all";
  const q = sp.q ?? "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const admin = createAdminClient();

  let query = admin.from("production_records").select("id, article_id, status, created_at, updated_at, assigned_copyeditor_id, assigned_production_editor_id").order("updated_at", { ascending: false }).limit(100);
  if (status !== "all") query = query.eq("status", status as never);
  const { data } = await query;
  const recs = (data ?? []) as Array<{ id: string; article_id: string; status: string; created_at: string; updated_at: string; assigned_copyeditor_id: string | null; assigned_production_editor_id: string | null }>;

  // Enrich
  const enriched = await Promise.all(recs.map(async r => {
    const { data: a } = await admin.from("articles").select("id, title, article_number, journal_id, publication_status").eq("id", r.article_id).maybeSingle();
    if (!a) return { ...r, article: null as unknown };
    if (q && !(a as { title: string }).title.toLowerCase().includes(q.toLowerCase()) && !(a as { article_number: string }).article_number?.toLowerCase().includes(q.toLowerCase())) return null;
    return { ...r, article: a };
  }));
  const list = enriched.filter(Boolean) as Array<{ id: string; article_id: string; status: string; created_at: string; updated_at: string; article: { title: string; article_number: string } }>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Production Articles</h1>
        <Link href="/production/dashboard" className="text-sm text-primary hover:underline">← Dashboard</Link>
      </div>

      <form className="flex flex-wrap gap-3">
        <Input name="q" placeholder="Search title / article number…" defaultValue={q} className="max-w-[260px]" />
        <select name="status" defaultValue={status} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="all">All stages</option>
          <option value="not_started">Not Started</option>
          <option value="copyediting">Copyediting</option>
          <option value="typesetting">Typesetting</option>
          <option value="proof_ready">Proof Ready</option>
          <option value="author_review">Author Review</option>
          <option value="corrections_requested">Corrections Requested</option>
          <option value="final_approval">Final Approval</option>
          <option value="ready">Ready</option>
          <option value="published">Published</option>
        </select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>

      <Card>
        <CardContent className="p-0">
          {list.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No production records match the filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Article</TableHead><TableHead>Number</TableHead><TableHead>Status</TableHead><TableHead>Updated</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {list.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-[420px]"><Link href={`/production/articles/${r.article_id}`} className="font-medium hover:underline line-clamp-1">{r.article.title}</Link></TableCell>
                      <TableCell className="font-mono text-xs">{r.article.article_number}</TableCell>
                      <TableCell><Badge>{r.status}</Badge></TableCell>
                      <TableCell className="text-xs">{new Date(r.updated_at ?? r.created_at).toLocaleString()}</TableCell>
                      <TableCell><Button asChild variant="outline" size="sm"><Link href={`/production/articles/${r.article_id}`}>Open</Link></Button></TableCell>
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
