"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";

interface JournalRow { id: string; name: string; slug: string; short_name: string | null; description: string | null; status: string; default_apc: number; currency: string; doi_prefix: string | null; apc_enabled: boolean; doi_enabled: boolean; issn_print: string | null; issn_online: string | null; publisher_name: string | null; created_at: string; }

export default function AdminJournalsPage() {
  const [journals, setJournals] = useState<JournalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", slug: "", short_name: "", description: "", status: "active", default_apc: 0, currency: "USD", doi_prefix: "", publisher_name: "", issn_print: "", issn_online: "" });

  const fetchJournals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/journals?limit=50");
      const j = await res.json();
      setJournals(j.data ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchJournals(); }, [fetchJournals]);

  async function createJournal(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/journals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, slug: form.slug || form.name.toLowerCase().replaceAll(/[^a-z0-9]+/g,"-"), default_apc: Number(form.default_apc), doi_prefix: form.doi_prefix || null, apc_enabled: Number(form.default_apc) > 0 }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      setMsg(`Journal "${form.name}" created.`);
      setForm({ name: "", slug: "", short_name: "", description: "", status: "active", default_apc: 0, currency: "USD", doi_prefix: "", publisher_name: "", issn_print: "", issn_online: "" });
      fetchJournals();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
  }

  async function deleteJournal(id: string) {
    if (!confirm("Delete this journal? This cannot be undone if no dependent records exist.")) return;
    const res = await fetch(`/api/journals/${id}`, { method: "DELETE" });
    const j = await res.json();
    if (!res.ok) { alert(j.error ?? "Failed"); return; }
    fetchJournals();
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Journals — CRUD</h1>
      <p className="text-sm text-muted-foreground">Create volumes/issues/special issues, associate articles via admin/issues. Journals table mirrored from schema.sql.</p>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-base">All journals</CardTitle><CardDescription className="text-xs">{journals.length} journals</CardDescription></CardHeader>
          <CardContent className="p-0">
            {loading ? <p className="p-8 text-center text-sm text-muted-foreground">Loading…</p> : journals.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No journals yet. Use the form to create your first journal.</p> : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Slug</TableHead><TableHead>APC</TableHead><TableHead>DOI</TableHead><TableHead>Status</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {journals.map(j => (
                      <TableRow key={j.id}>
                        <TableCell className="font-medium text-sm">{j.name}<div className="text-xs text-muted-foreground">{j.publisher_name ?? ""}</div></TableCell>
                        <TableCell className="font-mono text-xs">{j.slug}</TableCell>
                        <TableCell className="text-xs">{j.apc_enabled ? `${j.default_apc} ${j.currency}` : "—"}</TableCell>
                        <TableCell className="text-xs font-mono">{j.doi_prefix ?? "—"}</TableCell>
                        <TableCell><Badge variant="secondary">{j.status}</Badge></TableCell>
                        <TableCell><Button variant="destructive" size="sm" onClick={() => deleteJournal(j.id)}>Delete</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Create journal</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={createJournal} className="space-y-4">
              <div className="grid gap-2"><Label htmlFor="name">Name *</Label><Input id="name" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Journal of Metascience" /></div>
              <div className="grid gap-2"><Label htmlFor="slug">Slug</Label><Input id="slug" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="jms" /></div>
              <div className="grid gap-2"><Label htmlFor="short">Short name</Label><Input id="short" value={form.short_name} onChange={e => setForm(f => ({ ...f, short_name: e.target.value }))} /></div>
              <div className="grid gap-2"><Label htmlFor="desc">Description</Label><Textarea id="desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2"><Label>Default APC</Label><Input type="number" min="0" step="0.01" value={form.default_apc} onChange={e => setForm(f => ({ ...f, default_apc: e.target.value as unknown as number }))} /></div>
                <div className="grid gap-2"><Label>Currency</Label><Input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))} placeholder="USD" /></div>
              </div>
              <div className="grid gap-2"><Label>DOI Prefix (e.g. 10.12345)</Label><Input value={form.doi_prefix} onChange={e => setForm(f => ({ ...f, doi_prefix: e.target.value }))} placeholder="10.12345" /></div>
              <div className="grid gap-2"><Label>Publisher</Label><Input value={form.publisher_name} onChange={e => setForm(f => ({ ...f, publisher_name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2"><Label>ISSN Print</Label><Input value={form.issn_print} onChange={e => setForm(f => ({ ...f, issn_print: e.target.value }))} /></div>
                <div className="grid gap-2"><Label>ISSN Online</Label><Input value={form.issn_online} onChange={e => setForm(f => ({ ...f, issn_online: e.target.value }))} /></div>
              </div>
              {msg && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">{msg}</p>}
              {err && <p className="text-xs text-destructive bg-destructive/10 border rounded p-2">{err}</p>}
              <Button type="submit" className="w-full">Create journal</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
