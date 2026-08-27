"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type Recommendation = "accept" | "minor_revision" | "major_revision" | "reject";

const SCORE_FIELDS = [
  { key: "originality_score", label: "Originality" },
  { key: "methodology_score", label: "Methodology" },
  { key: "literature_score", label: "Literature" },
  { key: "results_score", label: "Results" },
  { key: "discussion_score", label: "Discussion" },
  { key: "writing_score", label: "Writing" },
  { key: "significance_score", label: "Significance" },
] as const;

export function ReviewForm({
  assignmentId,
  manuscriptTitle,
  manuscriptAbstract,
  manuscriptContent,
  manuscriptPdfUrl,
  blindType,
  alreadySubmitted,
  initialData,
}: {
  assignmentId: string;
  manuscriptTitle: string;
  manuscriptAbstract?: string | null;
  manuscriptContent?: string | null;
  manuscriptPdfUrl?: string | null;
  blindType?: string;
  alreadySubmitted?: boolean;
  initialData?: Partial<Record<(typeof SCORE_FIELDS)[number]["key"] | "comments_to_author" | "confidential_comments_to_editor" | "recommendation", unknown>>;
}) {
  const [scores, setScores] = React.useState<Record<string, number | null>>(() => {
    const base: Record<string, number | null> = {};
    for (const f of SCORE_FIELDS) base[f.key] = (initialData?.[f.key] as number | null) ?? null;
    return base;
  });
  const [commentsToAuthor, setCommentsToAuthor] = React.useState((initialData?.comments_to_author as string) ?? "");
  const [confidential, setConfidential] = React.useState((initialData?.confidential_comments_to_editor as string) ?? "");
  const [recommendation, setRecommendation] = React.useState<Recommendation>((initialData?.recommendation as Recommendation) ?? "minor_revision");
  const [annotatedFile, setAnnotatedFile] = React.useState<File | null>(null);
  const [annotations, setAnnotations] = React.useState<Array<{ selectedText: string; comment: string }>>([]);
  const [pendingSelection, setPendingSelection] = React.useState<string>("");
  const [pendingComment, setPendingComment] = React.useState("");
  const [view, setView] = React.useState<"pdf" | "text">(manuscriptPdfUrl ? "pdf" : "text");
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  function handleTextSelect() {
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length > 2) setPendingSelection(sel);
  }

  function addAnnotation() {
    if (!pendingSelection || !pendingComment.trim()) return;
    setAnnotations((prev) => [...prev, { selectedText: pendingSelection, comment: pendingComment.trim() }]);
    setPendingSelection("");
    setPendingComment("");
  }

  async function submit() {
    if (alreadySubmitted) return;
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      // Upload annotated file placeholder — real impl would upload to Cloudinary then pass URL; here we just send metadata
      const body: Record<string, unknown> = {
        ...scores,
        comments_to_author: commentsToAuthor,
        confidential_comments_to_editor: confidential,
        recommendation,
        annotations: annotations.map((a) => ({
          selected_text: a.selectedText,
          comment: a.comment,
          visibility: "author_reviewer_editor",
        })),
      };
      // If annotated file present, we would upload first — simplified
      if (annotatedFile) body.annotated_file_name = annotatedFile.name;

      const res = await fetch(`/api/review-assignments/${assignmentId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to submit review");
      setMsg("Review submitted successfully.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Manuscript viewer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manuscript</CardTitle>
          <CardDescription>
            {blindType === "double_blind" ? "Author identities hidden (double-blind)" : blindType === "single_blind" ? "Single-blind" : "Open review"} • Select text to annotate
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold text-sm">{manuscriptTitle}</h3>
            {manuscriptAbstract && <p className="text-sm text-muted-foreground mt-2">{manuscriptAbstract}</p>}
          </div>

          {/* View toggle: PDF viewer vs text (select-to-annotate) */}
          {manuscriptPdfUrl && (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={view === "pdf" ? "default" : "outline"} onClick={() => setView("pdf")}>
                PDF
              </Button>
              <Button type="button" size="sm" variant={view === "text" ? "default" : "outline"} onClick={() => setView("text")}>
                Text (annotate)
              </Button>
              <Button type="button" size="sm" variant="outline" asChild>
                <a href={manuscriptPdfUrl} target="_blank" rel="noopener noreferrer">
                  Open PDF
                </a>
              </Button>
            </div>
          )}

          {view === "pdf" && manuscriptPdfUrl ? (
            <iframe
              src={manuscriptPdfUrl}
              title="Manuscript PDF"
              className="w-full rounded-md border bg-white"
              style={{ height: "70vh", minHeight: 480 }}
            />
          ) : (
            <div onMouseUp={handleTextSelect} className="rounded-md border bg-muted/20 p-4 text-sm leading-relaxed min-h-[140px] select-text">
              {manuscriptContent ? <p>{manuscriptContent}</p> : <p className="text-muted-foreground italic">Select any text from the PDF (or use the Text view) to create an inline annotation.</p>}
            </div>
          )}

          {/* Inline annotation capture */}
          <div className="rounded-md border p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Inline Annotations</p>
            {pendingSelection && (
              <div className="rounded border bg-amber-50 p-2 space-y-2">
                <p className="text-xs">
                  Selected: <span className="font-medium">“{pendingSelection.slice(0, 200)}”</span>
                </p>
                <Input placeholder="Comment on selection..." value={pendingComment} onChange={(e) => setPendingComment(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={addAnnotation}>
                    Add annotation
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPendingSelection("")}>
                    Clear
                  </Button>
                </div>
              </div>
            )}
            {annotations.length > 0 ? (
              <ul className="space-y-2">
                {annotations.map((a, i) => (
                  <li key={i} className="rounded border p-2 text-sm">
                    <span className="font-medium">“{a.selectedText.slice(0, 120)}”</span>
                    <p className="text-muted-foreground mt-1">{a.comment}</p>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setAnnotations((prev) => prev.filter((_, idx) => idx !== i))}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No inline annotations yet.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="annotated-file">Upload annotated file (optional)</Label>
            <Input id="annotated-file" type="file" accept=".pdf,.docx,.doc" onChange={(e) => setAnnotatedFile(e.target.files?.[0] ?? null)} disabled={!!alreadySubmitted} />
            {annotatedFile && <p className="text-xs text-muted-foreground">Selected: {annotatedFile.name}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Review form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review Scores (1–5)</CardTitle>
          <CardDescription>Rate each dimension. 1 = Poor, 5 = Excellent.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            {SCORE_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label>{f.label}</Label>
                <Select
                  value={scores[f.key]?.toString() ?? ""}
                  onValueChange={(v: string) => setScores((prev) => ({ ...prev, [f.key]: v ? parseInt(v, 10) : null }))}
                  disabled={!!alreadySubmitted}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select 1–5" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cta">Comments to Authors</Label>
            <Textarea id="cta" placeholder="Constructive feedback visible to authors..." value={commentsToAuthor} onChange={(e) => setCommentsToAuthor(e.target.value)} rows={5} disabled={!!alreadySubmitted} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cte">Confidential Comments to Editor</Label>
            <Textarea id="cte" placeholder="Confidential notes for editor only — not visible to authors..." value={confidential} onChange={(e) => setConfidential(e.target.value)} rows={4} disabled={!!alreadySubmitted} />
          </div>

          <div className="space-y-2">
            <Label>Recommendation</Label>
            <Select value={recommendation} onValueChange={(v: string) => setRecommendation(v as Recommendation)} disabled={!!alreadySubmitted}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="accept">Accept</SelectItem>
                <SelectItem value="minor_revision">Minor Revision</SelectItem>
                <SelectItem value="major_revision">Major Revision</SelectItem>
                <SelectItem value="reject">Reject</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={submit} disabled={loading || !!alreadySubmitted} className="w-full sm:w-auto">
            {alreadySubmitted ? "Review Already Submitted" : loading ? "Submitting..." : "Submit Review"}
          </Button>
          {msg && <p className="text-sm text-green-600">{msg}</p>}
          {err && <p className="text-sm text-destructive">{err}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
