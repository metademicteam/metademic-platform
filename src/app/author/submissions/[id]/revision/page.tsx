"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { ManuscriptUpload, type UploadedFile } from "@/components/author/ManuscriptUpload";
import { ArrowLeft, Loader2, Send, FileText, MessageSquare, AlertCircle, CheckCircle2 } from "lucide-react";

export default function RevisionPage() {
  const params = useParams<{ id: string }>();
  const manuscriptId = params.id;
  const router = useRouter();
  const { toast } = useToast();

  const [manuscript, setManuscript] = React.useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [changeSummary, setChangeSummary] = React.useState("");
  const [responseToReviewers, setResponseToReviewers] = React.useState("");
  const [cleanFiles, setCleanFiles] = React.useState<UploadedFile[]>([]);
  const [trackedFiles, setTrackedFiles] = React.useState<UploadedFile[]>([]);
  const [additionalFiles, setAdditionalFiles] = React.useState<UploadedFile[]>([]);
  const [nextVersion, setNextVersion] = React.useState(2);

  React.useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: ms } = await supabase.from("manuscripts").select("*, journals(name)").eq("id", manuscriptId).maybeSingle();
      if (ms) {
        setManuscript(ms as Record<string, unknown>);
        const m = ms as { current_version: number };
        setNextVersion((m.current_version ?? 1) + 1);
      }
      setLoading(false);
    })();
  }, [manuscriptId]);

  async function handleSubmitRevision() {
    if (!changeSummary.trim()) {
      toast({ title: "Please provide a change summary", variant: "error" });
      return;
    }
    if (cleanFiles.length === 0) {
      toast({ title: "Please upload the clean manuscript file", variant: "error" });
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const m = manuscript as { journal_id: string; current_version: number; current_review_round: number } | null;
      if (!m) throw new Error("Manuscript not loaded");

      // Create new immutable version — never overwrite
      const { data: version, error: verErr } = await supabase
        .from("manuscript_versions")
        .insert({
          manuscript_id: manuscriptId,
          version_number: nextVersion,
          revision_round: (m.current_review_round ?? 0) + 1,
          version_label: `Revision ${nextVersion - 1}`,
          change_summary: changeSummary,
          submitted_by: user.id,
          submitted_at: new Date().toISOString(),
        } as never)
        .select("id")
        .single();
      if (verErr || !version) throw new Error(verErr?.message ?? "Failed to create version");
      const versionId = (version as { id: string }).id;

      // Files have already been uploaded to Cloudinary and persisted to manuscript_files with version association
      // For clean/tracked files, we need to ensure they are linked to the new version.
      // The ManuscriptUpload component already POSTed to /api/manuscripts/[id]/files with current_version before;
      // but now we need to re-link: update version_id to new version for these files.
      // Instead, we will insert additional file records linking to new version if not yet linked.
      // For simplicity, if files were uploaded after draft, they may already have old versionId; we update them.
      const allNewFiles = [...cleanFiles, ...trackedFiles, ...additionalFiles];
      for (const f of allNewFiles) {
        if (f.id) {
          await supabase.from("manuscript_files").update({ version_id: versionId } as never).eq("id", f.id);
        } else {
          // Fallback: create record
          await supabase.from("manuscript_files").insert({
            manuscript_id: manuscriptId,
            version_id: versionId,
            uploaded_by: user.id,
            file_type: f.fileType as never,
            original_filename: f.originalFilename,
            storage_bucket: f.storageBucket,
            storage_path: f.storagePath,
            mime_type: f.mimeType ?? null,
            file_size: f.fileSize ?? null,
            checksum: f.checksum ?? null,
            metadata: { ...((f.metadata as Record<string, unknown>) ?? {}), responseToReviewers: responseToReviewers || undefined, revision: true },
          } as never);
        }
      }

      // Also store response to reviewers as a file-type note: create a revision request response if needed
      // And update manuscript's current_version and status to revision_submitted
      await supabase
        .from("manuscripts")
        .update({
          current_version: nextVersion,
          current_review_round: (m.current_review_round ?? 0) + 1,
          status: "revision_submitted",
        } as never)
        .eq("id", manuscriptId);

      // Workflow event
      await supabase.from("workflow_events").insert({
        manuscript_id: manuscriptId,
        actor_id: user.id,
        from_status: (manuscript as { status: string })?.status as never,
        to_status: "revision_submitted" as never,
        event_type: "manuscript.revision_submitted",
        description: changeSummary.slice(0, 500),
        metadata: { version: nextVersion, cleanFiles: cleanFiles.length, trackedFiles: trackedFiles.length } as never,
      } as never);

      // Audit log best-effort
      await supabase.from("audit_logs").insert({
        actor_id: user.id,
        manuscript_id: manuscriptId,
        action: "manuscript.revision_submitted",
        entity_type: "manuscript_version",
        entity_id: versionId,
        new_data: { version: nextVersion, changeSummary } as never,
      } as never);

      toast({ title: `Revision v${nextVersion} submitted — immutable version created`, variant: "success" });
      router.push(`/author/submissions/${manuscriptId}`);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed to submit revision", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-[960px] mx-auto space-y-4">
        <div className="h-6 w-40 bg-muted animate-pulse rounded" />
        <div className="h-64 w-full bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (!manuscript) {
    return <div className="p-8 text-sm text-destructive">Manuscript not found.</div>;
  }

  const m = manuscript as { manuscript_number: string; title: string; status: string; journal_id: string; current_version: number };
  const canRevise = ["minor_revision", "major_revision", "revision_submitted"].includes(m.status);
  if (!canRevise) {
    return (
      <div className="p-6 max-w-[960px] mx-auto space-y-4">
        <Link href={`/author/submissions/${manuscriptId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to manuscript
        </Link>
        <Card>
          <CardContent className="p-6 flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-medium">Revision not available</p>
              <p className="text-sm text-muted-foreground">This manuscript is in status “{m.status}” and does not require a revision. If you believe this is an error, contact the editorial office.</p>
              <Button asChild className="mt-3" variant="outline">
                <Link href={`/author/submissions/${manuscriptId}`}>View manuscript</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[960px] mx-auto w-full space-y-6">
      <Link href={`/author/submissions/${manuscriptId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to manuscript
      </Link>

      <div>
        <h1 className="text-xl font-semibold">Submit Revision</h1>
        <p className="text-sm text-muted-foreground">
          {m.manuscript_number} • {m.title} • v{m.current_version} → v{nextVersion} (immutable versioning — never overwrites v{m.current_version})
        </p>
        <div className="flex gap-2 mt-2">
          <Badge variant="outline">Current: v{m.current_version}</Badge>
          <Badge variant="default">New: v{nextVersion}</Badge>
          <Badge variant="secondary">{m.status}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revision Details</CardTitle>
          <CardDescription>Provide a summary of changes; this will be stored with the new version.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Change Summary *</Label>
            <Textarea rows={4} value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} placeholder="Summarize what was changed in this revision…" />
            <p className="text-xs text-muted-foreground">{changeSummary.length} characters</p>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Response to Reviewers
            </Label>
            <Textarea rows={8} value={responseToReviewers} onChange={(e) => setResponseToReviewers(e.target.value)} placeholder="Point-by-point response to reviewer comments. You can also upload a response document below." />
            <p className="text-xs text-muted-foreground">Supports structured responses — status like Addressed / Partially Addressed can be noted per comment.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Clean Manuscript * (v{nextVersion})
          </CardTitle>
          <CardDescription>Upload the revised manuscript without tracked changes.</CardDescription>
        </CardHeader>
        <CardContent>
          <ManuscriptUpload
            journalId={m.journal_id}
            manuscriptId={manuscriptId}
            version={nextVersion}
            files={cleanFiles}
            onFilesChange={setCleanFiles}
            maxFiles={5}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tracked Changes (optional but recommended)</CardTitle>
          <CardDescription>Upload manuscript with tracked changes / highlighted revisions.</CardDescription>
        </CardHeader>
        <CardContent>
          <ManuscriptUpload
            journalId={m.journal_id}
            manuscriptId={manuscriptId}
            version={nextVersion}
            files={trackedFiles}
            onFilesChange={setTrackedFiles}
            maxFiles={5}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Response to Reviewers & Additional Files</CardTitle>
          <CardDescription>Upload response letter, supplementary files, or figures for this revision.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ManuscriptUpload
            journalId={m.journal_id}
            manuscriptId={manuscriptId}
            version={nextVersion}
            files={additionalFiles}
            onFilesChange={setAdditionalFiles}
            maxFiles={10}
          />
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4 text-sm text-amber-900 space-y-2">
          <p className="font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Immutable versioning
          </p>
          <p>
            Submitting this revision will create <strong>Version {nextVersion}</strong> and keep Version {m.current_version} untouched. Files are stored in Cloudinary under <code className="bg-white px-1 rounded">journals/{m.journal_id}/manuscripts/{manuscriptId}/v{nextVersion}/</code> and linked to the new version only.
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={handleSubmitRevision} disabled={submitting} className="flex-1">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Submit revision v{nextVersion}
        </Button>
        <Button variant="outline" onClick={() => router.push(`/author/submissions/${manuscriptId}`)} disabled={submitting}>
          Cancel
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">By submitting, you confirm the revision addresses reviewer comments and is ready for re-review.</p>
    </div>
  );
}
