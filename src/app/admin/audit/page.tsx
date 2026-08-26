export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; action?: string }> }) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const action = sp.action ?? "";
  const supabase = await createClient();
  let query = supabase.from("audit_logs").select("id, action, actor_id, journal_id, manuscript_id, entity_type, entity_id, created_at").order("created_at", { ascending: false }).limit(100);
  if (q) query = query.ilike("action", `%${q}%`);
  if (action) query = query.eq("action", action as never);
  const { data } = await query;
  const list = (data ?? []) as Array<{ id: string; action: string; actor_id: string | null; journal_id: string | null; manuscript_id: string | null; entity_type: string | null; entity_id: string | null; created_at: string }>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">Immutable audit trail. Every important action is logged and never editable by normal users.</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-wrap gap-3">
            <Input name="q" placeholder="Search action (e.g. doi.queued, payment.succeeded, article.published)…" defaultValue={q} className="max-w-[360px]" />
            <Input name="action" placeholder="Exact action (optional)" defaultValue={action} className="max-w-[240px]" />
            <Button type="submit" variant="outline">Search</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="text-base">Recent entries</CardTitle><CardDescription className="text-xs">{list.length} shown (most recent first)</CardDescription></div></CardHeader>
        <CardContent className="p-0">
          {list.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">No audit logs found.</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Actor</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
                <TableBody>
                  {list.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs"><Badge variant="outline">{a.action}</Badge></TableCell>
                      <TableCell className="text-xs"><span className="font-mono">{a.entity_type ?? "—"}</span> {a.entity_id ? <span className="font-mono text-xs text-muted-foreground"> {a.entity_id.slice(0,8)}…</span> : ""} {a.manuscript_id && <span className="block text-xs text-muted-foreground">ms: {a.manuscript_id.slice(0,8)}…</span>}</TableCell>
                      <TableCell className="font-mono text-xs">{a.actor_id?.slice(0,8) ?? "system"}</TableCell>
                      <TableCell className="text-xs">{new Date(a.created_at).toLocaleString()}</TableCell>
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
