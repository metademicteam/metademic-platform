"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function EditorAssignmentClient({
  manuscriptId,
  options,
  currentEditorId,
}: {
  manuscriptId: string;
  options: Array<{ id: string; label: string }>;
  currentEditorId: string | null;
}) {
  const [selected, setSelected] = React.useState<string>(currentEditorId ?? "");
  const [notes, setNotes] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function assign() {
    if (!selected) {
      setErr("Select an editor.");
      return;
    }
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/manuscripts/${manuscriptId}/assign-editor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editorId: selected, notes: notes.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to assign editor");
      setMsg("Editor assigned successfully.");
      window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Select Editor</Label>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="max-w-sm">
            <SelectValue placeholder="Choose editor..." />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="assign-notes">Notes (optional)</Label>
        <Textarea id="assign-notes" placeholder="Assignment notes..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>
      <Button onClick={assign} disabled={loading || !selected}>
        {loading ? "Assigning..." : "Assign Editor"}
      </Button>
      {msg && <p className="text-sm text-green-600">{msg}</p>}
      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}
