export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";

export default async function AdminUsersPage() {
  const supabase = await createClient();

  const { data: profiles } = await supabase.from("profiles").select("id, email, first_name, last_name, display_name, status, created_at").order("created_at", { ascending: false }).limit(100);
  const { data: members } = await supabase.from("journal_members").select("user_id, journal_id, role, is_active, journals!inner(name, slug)").limit(200);
  const { data: journals } = await supabase.from("journals").select("id, name, slug");

  const list = (profiles ?? []) as Array<{ id: string; email: string | null; first_name: string | null; last_name: string | null; display_name: string | null; status: string; created_at: string }>;
  const memberMap: Record<string, Array<{ role: string; is_active: boolean; journal: string }>> = {};
  for (const m of (members ?? []) as unknown as Array<{ user_id: string; role: string; is_active: boolean; journals: { name: string } | null }>) {
    memberMap[m.user_id] = memberMap[m.user_id] ?? [];
    memberMap[m.user_id].push({ role: m.role, is_active: m.is_active, journal: m.journals?.name ?? m.journals?.name ?? "—" });
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">User list with roles (journal_members). Use journal admin to assign roles.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardHeader className="p-4 pb-2"><CardDescription className="text-xs uppercase tracking-widest">Total users</CardDescription><CardTitle className="text-xl mt-1">{list.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="p-4 pb-2"><CardDescription className="text-xs uppercase tracking-widest">Journals</CardDescription><CardTitle className="text-xl mt-1">{(journals ?? []).length}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="p-4 pb-2"><CardDescription className="text-xs uppercase tracking-widest">Active memberships</CardDescription><CardTitle className="text-xl mt-1">{(members ?? []).filter((m: { is_active: boolean }) => m.is_active).length}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">All users</CardTitle><CardDescription className="text-xs">{list.length} profiles · roles from journal_members</CardDescription></CardHeader>
        <CardContent className="p-0">
          {list.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No users yet.</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Email</TableHead><TableHead>Status</TableHead><TableHead>Roles (journal)</TableHead></TableRow></TableHeader>
                <TableBody>
                  {list.map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="text-sm font-medium">{[u.first_name, u.last_name].filter(Boolean).join(" ") || u.display_name || u.id.slice(0,8)}<div className="text-xs text-muted-foreground font-mono">{u.id.slice(0,8)}…</div></TableCell>
                      <TableCell className="text-xs">{u.email ?? "—"}</TableCell>
                      <TableCell><Badge variant={u.status === "active" ? "secondary" : "outline"}>{u.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[420px]">
                          {(memberMap[u.id] ?? []).map((mm, i) => (
                            <Badge key={i} variant={mm.is_active ? "default" : "outline"} className="text-xs">{mm.role} {mm.is_active ? "" : "(inactive)"}</Badge>
                          ))}
                          {(!memberMap[u.id] || memberMap[u.id].length === 0) && <span className="text-xs text-muted-foreground">No roles (author)</span>}
                        </div>
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
