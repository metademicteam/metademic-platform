"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, X, AlertTriangle } from "lucide-react";

export const TECHNICAL_CHECK_ITEMS = [
  { key: "correct_article_type", label: "Correct article type" },
  { key: "journal_scope", label: "Journal scope" },
  { key: "required_files", label: "Required files" },
  { key: "author_information", label: "Author information" },
  { key: "figures", label: "Figures" },
  { key: "tables", label: "Tables" },
  { key: "references", label: "References" },
  { key: "conflict_declaration", label: "Conflict declaration" },
  { key: "funding", label: "Funding" },
  { key: "ethics_statement", label: "Ethics statement" },
  { key: "data_availability", label: "Data availability" },
  { key: "originality", label: "Originality" },
] as const;

export type TechnicalCheckKey = (typeof TECHNICAL_CHECK_ITEMS)[number]["key"];
export type ChecklistState = Record<TechnicalCheckKey, boolean>;
export type TechnicalOutcome = "PASS" | "RETURN_TO_AUTHOR" | "DESK_REJECT";

export function TechnicalCheckList({
  manuscriptId,
  initialChecklist,
  initialOutcome,
  readOnly,
  onSubmitted,
}: {
  manuscriptId: string;
  initialChecklist?: Partial<ChecklistState>;
  initialOutcome?: TechnicalOutcome | null;
  readOnly?: boolean;
  onSubmitted?: () => void;
}) {
  const [checklist, setChecklist] = React.useState<ChecklistState>(() => {
    const base = {} as ChecklistState;
    for (const item of TECHNICAL_CHECK_ITEMS) {
      base[item.key] = initialChecklist?.[item.key] ?? false;
    }
    return base;
  });
  const [outcome, setOutcome] = React.useState<TechnicalOutcome | null>(initialOutcome ?? null);
  const [reason, setReason] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const allChecked = TECHNICAL_CHECK_ITEMS.every((i) => checklist[i.key]);
  const checkedCount = TECHNICAL_CHECK_ITEMS.filter((i) => checklist[i.key]).length;

  async function submit(selectedOutcome: TechnicalOutcome) {
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/manuscripts/${manuscriptId}/technical-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklist,
          outcome: selectedOutcome,
          reason: reason.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to submit technical check");
      setOutcome(selectedOutcome);
      setMsg(`Technical check submitted: ${selectedOutcome}`);
      onSubmitted?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Technical Check</CardTitle>
            <CardDescription>
              {checkedCount}/{TECHNICAL_CHECK_ITEMS.length} items checked {allChecked ? "— ready for decision" : ""}
            </CardDescription>
          </div>
          {outcome && <Badge variant={outcome === "PASS" ? "default" : outcome === "RETURN_TO_AUTHOR" ? "secondary" : "destructive"}>{outcome}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          {TECHNICAL_CHECK_ITEMS.map((item) => (
            <label key={item.key} className="flex items-center gap-3 rounded-md border px-3 py-2 hover:bg-accent/50 cursor-pointer">
              <input
                type="checkbox"
                checked={checklist[item.key]}
                disabled={readOnly || !!outcome}
                onChange={(e) => setChecklist((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="text-sm flex-1">{item.label}</span>
              {checklist[item.key] ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-muted-foreground" />}
            </label>
          ))}
        </div>

        {!readOnly && !outcome && (
          <>
            <div className="space-y-2">
              <Label htmlFor="tc-reason">Reason / Notes (required for RETURN_TO_AUTHOR / DESK_REJECT)</Label>
              <Textarea id="tc-reason" placeholder="Explain issues or next steps..." value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => submit("PASS")}
                disabled={loading || !allChecked}
                title={!allChecked ? "Check all items before passing" : undefined}
              >
                <Check className="h-4 w-4" /> PASS
              </Button>
              <Button variant="secondary" onClick={() => submit("RETURN_TO_AUTHOR")} disabled={loading}>
                <AlertTriangle className="h-4 w-4" /> Return to Author
              </Button>
              <Button variant="destructive" onClick={() => submit("DESK_REJECT")} disabled={loading}>
                <X className="h-4 w-4" /> Desk Reject
              </Button>
            </div>
            {!allChecked && <p className="text-xs text-muted-foreground">All checklist items must be checked to PASS. You may still Return to Author or Desk Reject without completing all items.</p>}
          </>
        )}

        {msg && <p className="text-sm text-green-600">{msg}</p>}
        {err && <p className="text-sm text-destructive">{err}</p>}
        {outcome && <p className="text-sm text-muted-foreground">Technical check already submitted with outcome: {outcome}</p>}
      </CardContent>
    </Card>
  );
}
