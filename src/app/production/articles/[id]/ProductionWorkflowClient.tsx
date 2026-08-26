"use client";

import * as React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const ORDER = ["not_started","copyediting","typesetting","proof_ready","author_review","corrections_requested","final_approval","ready","published"] as const;

export function ProductionWorkflowClient({ articleId, currentStatus, assignedCopyeditor, assignedProductionEditor, notes: initialNotes }: { articleId: string; currentStatus: string; assignedCopyeditor: string | null; assignedProductionEditor: string | null; notes: string | null }) {
  const [status, setStatus] = useState(currentStatus);
  const [copyeditor, setCopyeditor] = useState(assignedCopyeditor ?? "");
  const [prodEditor, setProdEditor] = useState(assignedProductionEditor ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [proofUrl, setProofUrl] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch(`/api/production/${articleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, assignedCopyeditorId: copyeditor || null, assignedProductionEditorId: prodEditor || null, notes, proofUrl: proofUrl || undefined, publishedUrl: publishedUrl || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      setMsg(j.message ?? "Updated");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label>Target status</Label>
        <select value={status} onChange={e => setStatus(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          {ORDER.map(o => <option key={o} value={o}>{o.replaceAll("_"," ")}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">Server validates allowed transition: {ORDER.join(" → ")}. Invalid transition returns 400.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="copyeditor">Assign copyeditor (user UUID)</Label>
          <Input id="copyeditor" value={copyeditor} onChange={e => setCopyeditor(e.target.value)} placeholder="uuid of copyeditor" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="prodEditor">Assign production editor (user UUID)</Label>
          <Input id="prodEditor" value={prodEditor} onChange={e => setProdEditor(e.target.value)} placeholder="uuid of production editor" />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Production notes…" />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="proof">Proof asset URL (Cloudinary secure_url) — stored in article_metadata.pdf_path / metadata</Label>
        <Input id="proof" value={proofUrl} onChange={e => setProofUrl(e.target.value)} placeholder="https://res.cloudinary.com/.../proof.pdf" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pub">Published asset URL (PDF)</Label>
        <Input id="pub" value={publishedUrl} onChange={e => setPublishedUrl(e.target.value)} placeholder="https://res.cloudinary.com/.../published.pdf" />
      </div>

      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">{msg}</p>}
      {err && <p className="text-sm text-destructive bg-destructive/10 border rounded p-2">{err}</p>}

      <Button onClick={submit} disabled={loading}>{loading ? "Updating…" : "Update production record"}</Button>
      <p className="text-xs text-muted-foreground">Current: <Badge variant="outline">{currentStatus}</Badge> → next: <Badge>{status}</Badge></p>
    </div>
  );
}
