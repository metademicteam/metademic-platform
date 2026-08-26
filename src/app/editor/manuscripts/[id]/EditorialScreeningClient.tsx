"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Action = "accept_for_review" | "desk_reject" | "request_correction" | "request_clarification";

const STATUS_MAP: Record<Action, string> = {
  accept_for_review: "reviewer_invitation",
  desk_reject: "rejected",
  request_correction: "returned_to_author",
  request_clarification: "returned_to_author",
};

export default function EditorialScreeningClient({ manuscriptId, currentStatus }: { manuscriptId: string; currentStatus: string }) {
  const [action, setAction] = React.useState<Action>("accept_for_review");
  const [reason, setReason] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function submit() {
    if ((action === "desk_reject" || action === "request_correction" || action === "request_clarification") && reason.trim().length < 10) {
      setErr("Please provide a reason (at least 10 characters).");
      return;
    }
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      // Reuse editorial-decision endpoint for desk reject, otherwise use technical-check-style transition via editorial-decision
      // For screening, we call a dedicated screening action via editorial-decision with appropriate status mapping
      // Simplest: call /api/manuscripts/[id]/editorial-decision for desk reject, otherwise call technical-check workaround
      // We'll implement a unified approach: POST to editorial-decision with decision mapping, or direct status transition via technical-check for corrections
      let res: Response;
      if (action === "desk_reject") {
        res = await fetch(`/api/manuscripts/${manuscriptId}/editorial-decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "desk_reject", editorReason: reason, overrideSystemRecommendation: false }),
        });
      } else if (action === "accept_for_review") {
        // Direct status transition: editorial_screening -> reviewer_invitation
        // Use a lightweight endpoint: we reuse technical-check with outcome PASS? Better to call editorial-decision with special handling
        // For now, attempt to transition via a dedicated route — fallback to editorial-decision with accept
        res = await fetch(`/api/manuscripts/${manuscriptId}/editorial-decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "accept", editorReason: reason || "Accepted for peer review" }),
        });
        // If that fails due to workflow, try direct technical-check style
        if (!res.ok) {
          const json = await res.json();
          // If workflow error, try to use a direct status update via assign-editor style — we surface error
          throw new Error(json.error || "Failed to accept for review");
        }
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed");
        setMsg("Manuscript accepted for peer review.");
        window.location.reload();
        return;
      } else {
        // request_correction / clarification -> returned_to_author
        // Use technical-check endpoint with RETURN_TO_AUTHOR
        res = await fetch(`/api/manuscripts/${manuscriptId}/technical-check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checklist: {}, outcome: "RETURN_TO_AUTHOR", reason }),
        });
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setMsg(`Screening action submitted: ${action}`);
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
        <Label>Action</Label>
        <Select value={action} onValueChange={(v: string) => setAction(v as Action)}>
          <SelectTrigger className="max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="accept_for_review">Accept for peer review</SelectItem>
            <SelectItem value="desk_reject">Desk reject</SelectItem>
            <SelectItem value="request_correction">Request technical correction</SelectItem>
            <SelectItem value="request_clarification">Request clarification</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="screen-reason">Reason / Instructions</Label>
        <Textarea id="screen-reason" placeholder="Provide reason..." value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
      </div>
      <Button onClick={submit} disabled={loading}>
        {loading ? "Submitting..." : "Submit Screening Decision"}
      </Button>
      {msg && <p className="text-sm text-green-600">{msg}</p>}
      {err && <p className="text-sm text-destructive">{err}</p>}
      <p className="text-xs text-muted-foreground">Current status: {currentStatus}</p>
    </div>
  );
}
