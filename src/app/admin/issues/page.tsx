"use client";

import * as React from "react";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";

interface Volume { id: string; volume_number: number; year: number; title: string | null; journal_id: string; journals: { name: string; slug: string } | null; }
interface Issue { id: string; issue_number: number; title: string | null; volume_id: string | null; journal_id: string; is_special_issue: boolean; publication_date: string | null; journals: { name: string; slug: string } | null; article_count: number; }
interface Journal { id: string; name: string; slug: string; }

export default function AdminIssuesPage() {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [journalId, setJournalId] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [volForm, setVolForm] = useState({ volumeNumber: 1, year: new Date().getFullYear(), title: "", description: "" });
  const [issForm, setIssForm] = useState({ volumeId: "", issueNumber: 1, title: "", description: "", isSpecialIssue: false, publicationDate: "" });

  const fetchData = useCallback(async () => {
    const jRes = await fetch("/api/journals?limit=50");
    const jJson = await jRes.json();
    const js = (jJson.data ?? []) as Journal[];
    setJournals(js);
    if (!journalId && js[0]) setJournalId(js[0].id);
  }, [journalId]);

  const fetchVolumes = useCallback(async (jid: string) => {
    if (!jid) return;
    const r = await fetch(`/api/volumes?journalId=${jid}`);
    const j = await r.json();
    setVolumes(j.data ?? []);
  }, []);

  const fetchIssues = useCallback(async (jid: string) => {
    if (!jid) return;
    const r = await fetch(`/api/issues?journalId=${jid}`);
    const j = await r.json();
    setIssues(j.data ?? []);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (journalId) { fetchVolumes(journalId); fetchIssues(journalId); } }, [journalId, fetchVolumes, fetchIssues]);

  async function createVolume(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null); setLoading(true);
    try {
      const res = await fetch("/api/volumes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ journalId, volumeNumber: Number(volForm.volumeNumber), year: Number(volForm.year), title: volForm.title || null, description: volForm.description || null }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setMsg(`Volume ${volForm.volumeNumber} created.`);
      fetchVolumes(journalId);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    setLoading(false);
  }

  async function createIssue(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null); setLoading(true);
    try {
      const res = await fetch("/api/issues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ journalId, volumeId: issForm.volumeId || null, issueNumber: Number(issForm.issueNumber), title: issForm.title || null, description: issForm.description || null, isSpecialIssue: issForm.isSpecialIssue, publicationDate: issForm.publicationDate || null }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setMsg(`Issue ${issForm.issueNumber} created.`);
      fetchIssues(journalId);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    setLoading(false);
  }

  const [assign, setAssign] = useState({ articleId: "", issueId: "" });
  async function assignArticle() {
    if (!assign.articleId || !assign.issueId) { setErr("articleId and issueId required"); return; }
    setErr(null); setMsg(null);
    // Assign via supabase admin update: articles.issue_id
    const res = await fetch("/api/issues/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId: assign.articleId, issueId: assign.issueId }) });
    if (res.status === 404) {
      // Fallback: direct PATCH via articles publish helper — we create minimal endpoint via issues/assign may not exist, try direct supabase-style
      setErr("Assign endpoint not available — use Supabase dashboard to set articles.issue_id. Fallback: linking via article publish with issueId.");
      return;
    }
    const j = await res.json();
    if (!res.ok) { setErr(j.error ?? "Failed"); return; }
    setMsg(`Article ${assign.articleId.slice(0,8)} → issue ${assign.issueId.slice(0,8)}`);
    fetchIssues(journalId);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Volume / Issue Management</h1>
        <p className="text-sm text-muted-foreground mt-1">Create volumes/issues/special issues, associate published articles, browse archive.</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Journal</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-center">
          <select value={journalId} onChange={e => setJournalId(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[220px]">
            {journals.map(j => <option key={j.id} value={j.id}>{j.name} ({j.slug})</option>)}
          </select>
          <Badge variant="outline">{volumes.length} volumes</Badge>
          <Badge variant="outline">{issues.length} issues</Badge>
        </CardContent>
      </Card>

      {err && <p className="text-sm text-destructive bg-destructive/10 border rounded p-2">{err}</p>}
      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">{msg}</p>}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Create Volume</CardTitle><CardDescription className="text-xs">Volume 1, Year 2026, etc.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={createVolume} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2"><Label>Volume number *</Label><Input type="number" min="1" required value={volForm.volumeNumber} onChange={e => setVolForm(f => ({ ...f, volumeNumber: Number(e.target.value) }))} /></div>
                <div className="grid gap-2"><Label>Year *</Label><Input type="number" min="1900" max="2100" required value={volForm.year} onChange={e => setVolForm(f => ({ ...f, year: Number(e.target.value) }))} /></div>
              </div>
              <div className="grid gap-2"><Label>Title</Label><Input value={volForm.title} onChange={e => setVolForm(f => ({ ...f, title: e.target.value }))} placeholder="Volume title (optional)" /></div>
              <div className="grid gap-2"><Label>Description</Label><Textarea value={volForm.description} onChange={e => setVolForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
              <Button type="submit" disabled={loading} className="w-full">{loading ? "Creating…" : "Create volume"}</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Create Issue / Special Issue</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={createIssue} className="space-y-4">
              <div className="grid gap-2"><Label>Volume (optional — links issue to volume)</Label>
                <select value={issForm.volumeId} onChange={e => setIssForm(f => ({ ...f, volumeId: e.target.value }))} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">— No volume (standalone issue) —</option>
                  {volumes.map(v => <option key={v.id} value={v.id}>Volume {v.volume_number} ({v.year}) {v.title ? `- ${v.title}` : ""}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2"><Label>Issue number *</Label><Input type="number" min="1" required value={issForm.issueNumber} onChange={e => setIssForm(f => ({ ...f, issueNumber: Number(e.target.value) }))} /></div>
                <div className="grid gap-2"><Label>Publication date</Label><Input type="date" value={issForm.publicationDate} onChange={e => setIssForm(f => ({ ...f, publicationDate: e.target.value }))} /></div>
              </div>
              <div className="grid gap-2"><Label>Title</Label><Input value={issForm.title} onChange={e => setIssForm(f => ({ ...f, title: e.target.value }))} placeholder="Special Issue on … (if special)" /></div>
              <div className="grid gap-2"><Label>Description</Label><Textarea value={issForm.description} onChange={e => setIssForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={issForm.isSpecialIssue} onChange={e => setIssForm(f => ({ ...f, isSpecialIssue: e.target.checked }))} /> Special Issue</label>
              <Button type="submit" disabled={loading} className="w-full">{loading ? "Creating…" : "Create issue"}</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Volumes</CardTitle></CardHeader>
        <CardContent className="p-0">
          {volumes.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No volumes yet.</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Volume</TableHead><TableHead>Year</TableHead><TableHead>Title</TableHead></TableRow></TableHeader>
                <TableBody>
                  {volumes.map(v => <TableRow key={v.id}><TableCell className="font-mono text-sm">Volume {v.volume_number}</TableCell><TableCell>{v.year}</TableCell><TableCell className="text-sm">{v.title ?? "—"}</TableCell></TableRow>)}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Issues</CardTitle><CardDescription className="text-xs">Archive view — each issue shows article_count.</CardDescription></CardHeader>
        <CardContent className="p-0">
          {issues.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No issues yet.</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Journal</TableHead><TableHead>Volume</TableHead><TableHead>Issue</TableHead><TableHead>Title</TableHead><TableHead>Special</TableHead><TableHead>Articles</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                <TableBody>
                  {issues.map(iss => (
                    <TableRow key={iss.id}><TableCell className="text-sm">{iss.journals?.name ?? "—"}</TableCell><TableCell className="text-xs">{iss.volume_id ? volumes.find(v => v.id === iss.volume_id)?.volume_number ?? iss.volume_id.slice(0,6) : "—"}</TableCell><TableCell className="font-mono text-sm">Issue {iss.issue_number}</TableCell><TableCell className="text-sm">{iss.title ?? "—"}</TableCell><TableCell>{iss.is_special_issue ? <Badge>Special</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell><TableCell className="text-sm">{iss.article_count ?? 0}</TableCell><TableCell className="text-xs">{iss.publication_date ? new Date(iss.publication_date).toLocaleDateString() : "—"}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Associate articles with issue</CardTitle><CardDescription className="text-xs">Link a published article to an issue (also possible during publish via issueId, or by updating articles.issue_id).</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="grid gap-2"><Label>Article ID (UUID)</Label><Input value={assign.articleId} onChange={e => setAssign(s => ({ ...s, articleId: e.target.value }))} placeholder="article uuid" /></div>
            <div className="grid gap-2"><Label>Issue ID (UUID)</Label><Input value={assign.issueId} onChange={e => setAssign(s => ({ ...s, issueId: e.target.value }))} placeholder="issue uuid" /></div>
          </div>
          <Button onClick={assignArticle} variant="outline">Associate</Button>
          <p className="text-xs text-muted-foreground">Tip: Copy IDs from Volumes/Issues table (extend UI to show copy buttons), or use the Publish API with issueId to assign at publication time.</p>
        </CardContent>
      </Card>
    </div>
  );
}
