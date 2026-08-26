"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type DecisionOption = "accept" | "minor_revision" | "major_revision" | "reject" | "desk_reject" | "withdrawn";

export function DecisionPanel({
  manuscriptId,
  reviewRoundId,
  systemRecommendation,
  counts,
  completed,
  onDecided,
}: {
  manuscriptId: string;
  reviewRoundId?: string | null;
  systemRecommendation?: string | null;
  counts?: { accept: number; minorRevision: number; majorRevision: number; reject: number };
  completed?: boolean;
  onDecided?: () => void;
}) {
  const [decision, setDecision] = React.useState<DecisionOption>("accept");
  const [reason, setReason] = React.useState("");
  const [override, setOverride] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  const needsOverrideReason = systemRecommendation && decision !== systemRecommendation && systemRecommendation !== "no_recommendation";
  const canSubmit = decision && (!needsOverrideReason || reason.trim().length >= 10);

  async function submit() {
    if (needsOverrideReason && reason.trim().length < 10) {
      setErr("Override requires a reason (at least 10 characters).");
      return;
    }
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/manuscripts/${manuscriptId}/editorial-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          reviewRoundId: reviewRoundId ?? undefined,
          editorReason: reason.trim() || undefined,
          overrideSystemRecommendation: !!needsOverrideReason,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to submit decision");
      setMsg(`Decision submitted: ${decision}`);
      onDecided?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function requestAdditionalReviewer() {
    setErr(null);
    setMsg(null);
    // This is a placeholder — actual implementation would create a new invitation slot
    // For now we just notify editor that they should invite via the Reviewers tab
    setMsg("To add a reviewer, go to Reviews → Invite additional reviewer.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Editorial Decision</CardTitle>
        <CardDescription>Confirm system recommendation or override with reason.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* System recommendation display */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">System Recommendation:</span>
            <Badge variant={systemRecommendation === "accept" ? "default" : systemRecommendation === "reject" ? "destructive" : "secondary"}>
              {systemRecommendation ? systemRecommendation.replace("_", " ").toUpperCase() : "NO RECOMMENDATION"}
            </Badge>
            {completed === false && <span className="text-xs text-muted-foreground">(awaiting required reviews)</span>}
          </div>
          {counts && (
            <div className="flex gap-3 text-xs">
              <span>Accept: {counts.accept}</span>
              <span>Minor: {counts.minorRevision}</span>
              <span>Major: {counts.majorRevision}</span>
              <span>Reject: {counts.reject}</span>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (systemRecommendation && systemRecommendation !== "no_recommendation") setDecision(systemRecommendation as DecisionOption);
              }}
              disabled={!systemRecommendation || systemRecommendation === "no_recommendation"}
            >
              Confirm
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setOverride(true)}>
              Override
            </Button>
            <Button size="sm" variant="outline" onClick={requestAdditionalReviewer}>
              Request Additional Reviewer
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Final Decision</Label>
          <Select value={decision} onValueChange={(v: string) => setDecision(v as DecisionOption)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="accept">Accept</SelectItem>
              <SelectItem value="minor_revision">Minor Revision</SelectItem>
              <SelectItem value="major_revision">Major Revision</SelectItem>
              <SelectItem value="reject">Reject</SelectItem>
              <SelectItem value="desk_reject">Desk Reject</SelectItem>
              <SelectItem value="withdrawn">Withdrawn</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="decision-reason">
            Reason {needsOverrideReason && <span className="text-destructive">* required for override</span>}
          </Label>
          <Textarea id="decision-reason" placeholder="Provide reason for decision..." value={reason} onChange={(e) => setReason(e.target.value)} rows={4} />
        </div>

        {needsOverrideReason && <p className="text-xs text-amber-600">You are overriding the system recommendation — a reason is required.</p>}

        <Button onClick={submit} disabled={loading || !canSubmit} className="w-full sm:w-auto">
          {loading ? "Submitting..." : "Submit Decision"}
        </Button>

        {msg && <p className="text-sm text-green-600">{msg}</p>}
        {err && <p className="text-sm text-destructive">{err}</p>}
      </CardContent>
    </Card>
  );
}
