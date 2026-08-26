"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { WizardStepper } from "@/components/author/WizardStepper";
import { WizardNav } from "@/components/author/WizardNav";
import { useWizardState, validateStep } from "@/components/author/useWizardState";
import { ManuscriptUpload, type UploadedFile } from "@/components/author/ManuscriptUpload";
import { ARTICLE_TYPES, ARTICLE_TYPE_LABELS } from "@/lib/constants";
import {
  Plus,
  Trash2,
  GripVertical,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Save,
  X,
  Star,
  Ban,
  FileText,
  Users,
  Building2,
  Tag,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SectionHeader({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description?: string }) {
  return (
    <div className="flex gap-3 mb-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

export default function NewSubmissionWizardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { currentStep, data, updateData, completedSteps, markStepCompleted, goToStep, nextStep, prevStep, isSaving, lastSavedAt, autosaveError, saveDraftNow, clearDraft } = useWizardState();

  const [journals, setJournals] = React.useState<{ id: string; name: string; slug: string; description: string | null; status: string }[]>([]);
  const [loadingJournals, setLoadingJournals] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [stepError, setStepError] = React.useState<string | null>(null);

  // Load draft from server if ?draft=<id> provided
  React.useEffect(() => {
    const draftId = searchParams.get("draft");
    if (!draftId) return;
    const supabase = createClient();
    (async () => {
      const { data: ms } = await supabase.from("manuscripts").select("*").eq("id", draftId).maybeSingle();
      if (ms) {
        const m = ms as Record<string, unknown>;
        updateData({
          draftId: draftId,
          journalId: m.journal_id as string,
          title: m.title as string,
          subtitle: (m.subtitle as string) || "",
          abstract: (m.abstract as string) || "",
          articleType: (m.article_type as string) || "research_article",
          keywords: (m.keywords as string[]) || [],
          subjectAreas: (m.subject_areas as string[]) || [],
          languageCode: (m.language_code as string) || "en",
        });
        // Also load authors/declarations if in metadata or separate tables
        const [{ data: authors }, { data: decl }, { data: suggested }, { data: excluded }, { data: files }] = await Promise.all([
          supabase.from("manuscript_authors").select("*").eq("manuscript_id", draftId).order("author_order"),
          supabase.from("submission_declarations").select("*").eq("manuscript_id", draftId).maybeSingle(),
          supabase.from("manuscript_reviewer_suggestions").select("*").eq("manuscript_id", draftId),
          supabase.from("manuscript_excluded_reviewers").select("*").eq("manuscript_id", draftId),
          supabase.from("manuscript_files").select("*").eq("manuscript_id", draftId),
        ]);
        if (authors) {
          updateData({
            authors: (authors as Record<string, unknown>[]).map((a) => ({
              firstName: (a as { first_name: string }).first_name,
              middleName: (a as { middle_name: string | null }).middle_name || "",
              lastName: (a as { last_name: string }).last_name,
              email: (a as { email: string | null }).email || "",
              orcid: (a as { orcid: string | null }).orcid || "",
              institutionName: (a as { institution_name_snapshot: string | null }).institution_name_snapshot || "",
              department: (a as { department_snapshot: string | null }).department_snapshot || "",
              isCorresponding: (a as { is_corresponding: boolean }).is_corresponding,
              authorOrder: (a as { author_order: number }).author_order,
            })) as never,
          });
        }
        if (decl) {
          const d = decl as Record<string, unknown>;
          updateData({
            declarations: {
              conflictOfInterest: (d.conflict_of_interest as string) || "",
              fundingStatement: (d.funding_statement as string) || "",
              ethicsStatement: (d.ethics_statement as string) || "",
              dataAvailabilityStatement: (d.data_availability_statement as string) || "",
              authorContributions: (d.author_contributions as string) || "",
              acknowledgements: (d.acknowledgements as string) || "",
              originalityConfirmed: d.originality_confirmed as true,
              ethicsConfirmed: d.ethics_confirmed as true,
              authorshipConfirmed: d.authorship_confirmed as true,
              copyrightConfirmed: d.copyright_confirmed as true,
            } as never,
          });
        }
        if (suggested) {
          updateData({
            suggestedReviewers: (suggested as Record<string, unknown>[]).map((s) => ({
              reviewerName: (s as { reviewer_name: string }).reviewer_name,
              reviewerEmail: (s as { reviewer_email: string | null }).reviewer_email || "",
              institution: (s as { institution: string | null }).institution || "",
              expertise: (s as { expertise: string[] }).expertise || [],
              reason: (s as { reason: string | null }).reason || "",
            })) as never,
          });
        }
        if (excluded) {
          updateData({
            excludedReviewers: (excluded as Record<string, unknown>[]).map((e) => ({
              reviewerName: (e as { reviewer_name: string | null }).reviewer_name || "",
              reviewerEmail: (e as { reviewer_email: string | null }).reviewer_email || "",
              reason: (e as { reason: string | null }).reason || "",
            })) as never,
          });
        }
        if (files) {
          updateData({
            files: (files as Record<string, unknown>[]).map((f) => ({
              id: f.id,
              fileType: f.file_type,
              originalFilename: f.original_filename,
              storageBucket: f.storage_bucket,
              storagePath: f.storage_path,
              mimeType: f.mime_type,
              fileSize: f.file_size,
              metadata: f.metadata,
            })) as never,
          });
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.from("journals").select("id, name, slug, description, status").eq("status", "active").order("name");
      setJournals((data as typeof journals) ?? []);
      setLoadingJournals(false);
    })();
  }, []);

  function handleNext() {
    setStepError(null);
    const validation = validateStep(currentStep, data);
    if (!validation.ok) {
      setStepError(validation.errors?.join(" • ") ?? "Please complete required fields.");
      toast({ title: validation.errors?.[0] ?? "Please complete required fields.", variant: "destructive" });
      return;
    }
    markStepCompleted(currentStep);
    if (currentStep === 12) {
      void handleSubmit();
    } else {
      nextStep();
    }
  }

  async function handleSubmit() {
    // Final validation: ensure all required steps
    const requiredSteps = [1, 2, 3, 4, 6, 7, 10];
    for (const s of requiredSteps) {
      const v = validateStep(s, data);
      if (!v.ok) {
        setStepError(`Step ${s} incomplete: ${v.errors?.join(", ")}`);
        goToStep(s);
        return;
      }
    }
    if (!data.draftId) {
      // Create draft first if not yet created (autosave may not have fired)
      await saveDraftNow();
      // After autosave, draftId should be set; but we can also POST directly
    }
    setSubmitting(true);
    try {
      // Ensure draft exists; if not, create via POST /api/manuscripts with full wizard data
      let manuscriptId = data.draftId;
      if (!manuscriptId) {
        const res = await fetch("/api/manuscripts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            journalId: data.journalId,
            title: data.title,
            subtitle: data.subtitle,
            abstract: data.abstract,
            articleType: data.articleType,
            keywords: data.keywords,
            subjectAreas: data.subjectAreas,
            languageCode: data.languageCode,
            metadata: {
              wizard: {
                authors: data.authors,
                affiliations: data.affiliations,
                declarations: data.declarations,
                suggestedReviewers: data.suggestedReviewers,
                excludedReviewers: data.excludedReviewers,
                files: data.files,
              },
            },
          }),
        });
        const json = (await res.json()) as { data?: { id: string }; error?: string };
        if (!res.ok) throw new Error(json.error || "Failed to create manuscript");
        manuscriptId = json.data!.id;
        updateData({ draftId: manuscriptId });
      } else {
        // PATCH to ensure latest data persisted
        await fetch(`/api/manuscripts/${manuscriptId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            journalId: data.journalId,
            title: data.title,
            subtitle: data.subtitle,
            abstract: data.abstract,
            articleType: data.articleType,
            keywords: data.keywords,
            subjectAreas: data.subjectAreas,
            languageCode: data.languageCode,
            metadata: {
              wizard: {
                authors: data.authors,
                affiliations: data.affiliations,
                declarations: data.declarations,
                suggestedReviewers: data.suggestedReviewers,
                excludedReviewers: data.excludedReviewers,
                files: data.files,
              },
            },
          }),
        });
        // Also update authors/declarations via PATCH handler (already does)
      }

      // Submit
      const subRes = await fetch(`/api/manuscripts/${manuscriptId}/submit`, { method: "POST" });
      const subJson = (await subRes.json()) as { error?: string };
      if (!subRes.ok) throw new Error(subJson.error || "Submission failed");

      toast({ title: "Manuscript submitted successfully!", variant: "success" });
      clearDraft();
      router.push(`/author/submissions/${manuscriptId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Submission failed";
      setStepError(msg);
      toast({ title: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Step renderers
  // ---------------------------------------------------------------------------

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <SectionHeader icon={FileText} title="Select Journal" description="Choose the journal for your submission. Only active journals are shown." />
            {loadingJournals ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : journals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active journals available. Please contact support.</p>
            ) : (
              <div className="grid gap-3">
                {journals.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => updateData({ journalId: j.id })}
                    className={cn(
                      "text-left rounded-xl border p-4 transition-colors",
                      data.journalId === j.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{j.name}</h3>
                      {data.journalId === j.id && <CheckCircle2 className="h-5 w-5 text-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">{j.slug}</p>
                    {j.description && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{j.description}</p>}
                  </button>
                ))}
              </div>
            )}
            {!data.journalId && <p className="text-xs text-amber-600 flex gap-1 items-center"><AlertCircle className="h-3 w-3" /> Please select a journal to continue.</p>}
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <SectionHeader icon={FileText} title="Article Type" description="Select the type of article and relevant subject areas." />
            <div className="space-y-2">
              <Label>Article Type *</Label>
              <select
                value={data.articleType ?? "research_article"}
                onChange={(e) => updateData({ articleType: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {ARTICLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ARTICLE_TYPE_LABELS[t as keyof typeof ARTICLE_TYPE_LABELS]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Subject Areas * (comma-separated, 1–10)</Label>
              <Input
                placeholder="e.g. Machine Learning, Bioinformatics"
                value={(data.subjectAreas ?? []).join(", ")}
                onChange={(e) => {
                  const arr = e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  updateData({ subjectAreas: arr });
                }}
              />
              <p className="text-xs text-muted-foreground">{(data.subjectAreas ?? []).length} subject area(s)</p>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <SectionHeader icon={FileText} title="Title & Abstract" description="Provide a clear title and comprehensive abstract." />
            <div className="space-y-2">
              <Label>Title * (10–500 characters)</Label>
              <Input value={data.title ?? ""} onChange={(e) => updateData({ title: e.target.value })} placeholder="Enter manuscript title" />
              <p className="text-xs text-muted-foreground">{(data.title ?? "").length} / 500</p>
            </div>
            <div className="space-y-2">
              <Label>Subtitle</Label>
              <Input value={data.subtitle ?? ""} onChange={(e) => updateData({ subtitle: e.target.value })} placeholder="Optional subtitle" />
            </div>
            <div className="space-y-2">
              <Label>Abstract * (50–5000 characters)</Label>
              <Textarea rows={8} value={data.abstract ?? ""} onChange={(e) => updateData({ abstract: e.target.value })} placeholder="Enter abstract…" />
              <p className="text-xs text-muted-foreground">{(data.abstract ?? "").length} / 5000</p>
            </div>
            <div className="space-y-2">
              <Label>Language Code</Label>
              <Input value={data.languageCode ?? "en"} onChange={(e) => updateData({ languageCode: e.target.value })} className="max-w-[120px]" placeholder="en" />
            </div>
          </div>
        );
      case 4:
        return <AuthorsStep data={data} updateData={updateData} />;
      case 5:
        return <AffiliationsStep data={data} updateData={updateData} />;
      case 6:
        return <KeywordsStep data={data} updateData={updateData} />;
      case 7:
        return <DeclarationsStep data={data} updateData={updateData} />;
      case 8:
        return <SuggestedReviewersStep data={data} updateData={updateData} />;
      case 9:
        return <ExcludedReviewersStep data={data} updateData={updateData} />;
      case 10:
        return (
          <div className="space-y-4">
            <SectionHeader icon={FileText} title="Upload Files" description="Upload your manuscript and supplementary files. Stored in Cloudinary with versioned folders." />
            {!data.journalId ? (
              <p className="text-sm text-amber-600 flex gap-2 items-center"><AlertCircle className="h-4 w-4" /> Please select a journal in Step 1 first.</p>
            ) : !data.draftId ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Saving draft… Files will be enabled once the draft is created. Ensure Title (Step 3) is filled and wait for autosave, or click “Save draft” below.
                <Button variant="outline" size="sm" className="ml-2" onClick={() => void saveDraftNow()}>
                  Save draft now
                </Button>
              </div>
            ) : (
              <ManuscriptUpload
                journalId={data.journalId}
                manuscriptId={data.draftId}
                version={1}
                files={(data.files as unknown as UploadedFile[]) ?? []}
                onFilesChange={(files) => updateData({ files: files as never })}
              />
            )}
            {/* If no draftId but we want to allow upload without manuscriptId, we could use temp folder — for now require draft */}
            {!data.draftId && data.journalId && (
              <div className="text-xs text-muted-foreground">Tip: files are uploaded directly to Cloudinary and linked to manuscript version 1 immutably.</div>
            )}
          </div>
        );
      case 11:
        return <ReviewStep data={data} journals={journals} />;
      case 12:
        return (
          <div className="space-y-4">
            <SectionHeader icon={ShieldCheck} title="Submit Manuscript" description="Review the summary and confirm submission. This will transition draft → submitted." />
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <p className="text-sm">
                By submitting, you confirm that the manuscript is original, all authors have approved it, and you agree to the journal’s policies.
              </p>
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                <li>Journal: {journals.find((j) => j.id === data.journalId)?.name ?? data.journalId ?? "—"}</li>
                <li>Title: {data.title ?? "—"}</li>
                <li>Authors: {(data.authors ?? []).length}</li>
                <li>Files: {(data.files ?? []).length}</li>
              </ul>
              {data.draftId && <p className="text-xs font-mono text-muted-foreground">Draft ID: {data.draftId} • Manuscript will be assigned a number like JME-2026-000001 on submit.</p>}
            </div>
            {stepError && (
              <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{stepError}</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={() => void handleSubmit()} disabled={submitting || isSaving} className="flex-1">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirm & Submit
              </Button>
              <Button variant="outline" onClick={() => goToStep(11)}>
                Back to Review
              </Button>
            </div>
          </div>
        );
      default:
        return null;
    }
  }

  const isNextDisabled = (() => {
    if (currentStep === 1 && !data.journalId) return true;
    if (currentStep === 10 && (!data.files || (data.files as unknown[]).length === 0)) return false; // allow warning but not block
    return false;
  })();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[960px] mx-auto w-full space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Submit a Manuscript</h1>
          <p className="text-sm text-muted-foreground">12-step wizard • Autosaves to draft (localStorage + server) • Never lose data</p>
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            {autosaveError ? (
              <span className="flex items-center gap-1 text-red-600">
                <AlertCircle className="h-3 w-3" /> {autosaveError}
              </span>
            ) : isSaving ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving draft…
              </span>
            ) : lastSavedAt ? (
              <span className="flex items-center gap-1">
                <Save className="h-3 w-3" /> Last saved {new Date(lastSavedAt).toLocaleTimeString()} {data.draftId ? `• ${data.draftId.slice(0, 8)}` : "• local only"}
              </span>
            ) : (
              <span>Draft saves automatically</span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void saveDraftNow()} disabled={isSaving}>
          <Save className="h-4 w-4" /> Save draft
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <WizardStepper currentStep={currentStep} completedSteps={completedSteps} onStepClick={goToStep} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          {stepError && (
            <div className="mb-4 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{stepError}</span>
              <button onClick={() => setStepError(null)} className="ml-auto">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {renderStep()}
        </CardContent>
        <WizardNav
          currentStep={currentStep}
          totalSteps={12}
          onPrev={prevStep}
          onNext={handleNext}
          onSaveDraft={() => void saveDraftNow()}
          isSaving={isSaving || submitting}
          isNextDisabled={isNextDisabled || submitting}
          nextLabel={currentStep === 12 ? (submitting ? "Submitting…" : "Submit manuscript") : undefined}
        />
      </Card>

      <div className="flex justify-between text-xs text-muted-foreground">
        <Link href="/author/dashboard" className="hover:underline">
          ← Back to dashboard
        </Link>
        <button onClick={() => { if (confirm("Clear all draft data? This cannot be undone.")) clearDraft(); }} className="hover:underline">
          Clear draft
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Authors step
// ---------------------------------------------------------------------------

function AuthorsStep({ data, updateData }: { data: Record<string, unknown>; updateData: (p: Record<string, unknown>) => void }) {
  const authors = ((data.authors as Record<string, unknown>[]) ?? []) as Array<{
    firstName: string;
    middleName?: string;
    lastName: string;
    email?: string;
    orcid?: string;
    institutionName?: string;
    department?: string;
    isCorresponding?: boolean;
    authorOrder: number;
    contributionStatement?: string;
  }>;

  function addAuthor() {
    const nextOrder = authors.length + 1;
    updateData({
      authors: [
        ...authors,
        { firstName: "", lastName: "", email: "", orcid: "", institutionName: "", department: "", isCorresponding: authors.length === 0, authorOrder: nextOrder },
      ],
    });
  }
  function removeAuthor(idx: number) {
    const next = authors.filter((_, i) => i !== idx).map((a, i) => ({ ...a, authorOrder: i + 1 }));
    updateData({ authors: next });
  }
  function updateAuthor(idx: number, patch: Record<string, unknown>) {
    const next = authors.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    updateData({ authors: next });
  }
  function moveAuthor(from: number, to: number) {
    if (to < 0 || to >= authors.length) return;
    const next = [...authors];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    next.forEach((a, i) => (a.authorOrder = i + 1));
    updateData({ authors: next });
  }

  return (
    <div className="space-y-4">
      <SectionHeader icon={Users} title="Authors" description="Add all authors in order. Mark corresponding author(s), add ORCID and institution." />
      {authors.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No authors yet.</p>
          <Button onClick={addAuthor} size="sm" className="mt-3">
            <Plus className="h-4 w-4" /> Add first author
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {authors.map((a, idx) => (
            <Card key={idx} className={cn("relative", a.isCorresponding && "ring-1 ring-primary")}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Author {a.authorOrder}</span>
                  {a.isCorresponding && <Badge variant="default" className="text-[11px]">Corresponding</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0} onClick={() => moveAuthor(idx, idx - 1)}>
                    ↑
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === authors.length - 1} onClick={() => moveAuthor(idx, idx + 1)}>
                    ↓
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeAuthor(idx)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>First name *</Label>
                  <Input value={a.firstName} onChange={(e) => updateAuthor(idx, { firstName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Middle name</Label>
                  <Input value={a.middleName ?? ""} onChange={(e) => updateAuthor(idx, { middleName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Last name *</Label>
                  <Input value={a.lastName} onChange={(e) => updateAuthor(idx, { lastName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={a.email ?? ""} onChange={(e) => updateAuthor(idx, { email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>ORCID (0000-0000-0000-0000)</Label>
                  <Input value={a.orcid ?? ""} onChange={(e) => updateAuthor(idx, { orcid: e.target.value })} placeholder="0000-0000-0000-0000" />
                </div>
                <div className="space-y-2">
                  <Label>Institution</Label>
                  <Input value={a.institutionName ?? ""} onChange={(e) => updateAuthor(idx, { institutionName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input value={a.department ?? ""} onChange={(e) => updateAuthor(idx, { department: e.target.value })} />
                </div>
                <div className="space-y-2 flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    checked={!!a.isCorresponding}
                    onChange={(e) => updateAuthor(idx, { isCorresponding: e.target.checked })}
                    className="rounded border-input"
                    id={`corr-${idx}`}
                  />
                  <Label htmlFor={`corr-${idx}`} className="font-normal">
                    Corresponding author
                  </Label>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Contribution</Label>
                  <Input value={a.contributionStatement ?? ""} onChange={(e) => updateAuthor(idx, { contributionStatement: e.target.value })} placeholder="e.g. Conceptualization, Writing" />
                </div>
              </CardContent>
            </Card>
          ))}
          <Button onClick={addAuthor} variant="outline" className="w-full">
            <Plus className="h-4 w-4" /> Add author
          </Button>
        </div>
      )}
    </div>
  );
}

function AffiliationsStep({ data, updateData }: { data: Record<string, unknown>; updateData: (p: Record<string, unknown>) => void }) {
  const affiliations = ((data.affiliations as Record<string, unknown>[]) ?? []) as Array<{ id: string; institution: string; department?: string; country?: string; rorId?: string }>;
  function add() {
    updateData({ affiliations: [...affiliations, { id: Math.random().toString(36).slice(2, 8), institution: "", department: "", country: "", rorId: "" }] });
  }
  function upd(idx: number, patch: Record<string, unknown>) {
    const next = affiliations.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    updateData({ affiliations: next });
  }
  function remove(idx: number) {
    updateData({ affiliations: affiliations.filter((_, i) => i !== idx) });
  }
  return (
    <div className="space-y-4">
      <SectionHeader icon={Building2} title="Affiliations" description="Add institutional affiliations referenced by authors." />
      {affiliations.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No affiliations added. Authors can also set institution directly in the Authors step.</div>
      ) : (
        <div className="space-y-3">
          {affiliations.map((aff, idx) => (
            <Card key={aff.id}>
              <CardContent className="p-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2 flex justify-between items-center">
                  <Label className="font-medium">Affiliation {idx + 1}</Label>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(idx)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Institution *</Label>
                  <Input value={aff.institution} onChange={(e) => upd(idx, { institution: e.target.value })} placeholder="University / Institute" />
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input value={aff.department ?? ""} onChange={(e) => upd(idx, { department: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Input value={aff.country ?? ""} onChange={(e) => upd(idx, { country: e.target.value })} placeholder="US" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>ROR ID</Label>
                  <Input value={aff.rorId ?? ""} onChange={(e) => upd(idx, { rorId: e.target.value })} placeholder="https://ror.org/..." />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Button onClick={add} variant="outline" className="w-full">
        <Plus className="h-4 w-4" /> Add affiliation
      </Button>
      <p className="text-xs text-muted-foreground">These affiliations are informational; authors’ snapshots are stored from the Authors step.</p>
    </div>
  );
}

function KeywordsStep({ data, updateData }: { data: Record<string, unknown>; updateData: (p: Record<string, unknown>) => void }) {
  const keywords = (data.keywords as string[]) ?? [];
  const [input, setInput] = React.useState("");
  function addKeyword(v: string) {
    const val = v.trim();
    if (!val || keywords.includes(val)) return;
    if (keywords.length >= 10) return;
    updateData({ keywords: [...keywords, val] });
    setInput("");
  }
  function removeKeyword(idx: number) {
    updateData({ keywords: keywords.filter((_, i) => i !== idx) });
  }
  return (
    <div className="space-y-4">
      <SectionHeader icon={Tag} title="Keywords" description="Add 1–10 keywords (press Enter to add). Duplicates not allowed." />
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addKeyword(input);
            }
          }}
          placeholder="Type keyword and press Enter"
        />
        <Button onClick={() => addKeyword(input)} variant="secondary">
          Add
        </Button>
      </div>
      {keywords.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {keywords.map((k, idx) => (
            <Badge key={k + idx} variant="secondary" className="gap-1 pr-1">
              {k}
              <button onClick={() => removeKeyword(idx)} className="ml-1 rounded-full hover:bg-muted p-0.5">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No keywords yet.</p>
      )}
      <p className="text-xs text-muted-foreground">{keywords.length} / 10 keywords</p>
    </div>
  );
}

function DeclarationsStep({ data, updateData }: { data: Record<string, unknown>; updateData: (p: Record<string, unknown>) => void }) {
  const decl = (data.declarations as Record<string, unknown>) ?? {};
  function upd(patch: Record<string, unknown>) {
    updateData({ declarations: { ...decl, ...patch } });
  }
  return (
    <div className="space-y-4">
      <SectionHeader icon={ShieldCheck} title="Declarations" description="Complete all required declarations and confirmations." />
      <div className="grid gap-4">
        {[
          { key: "conflictOfInterest", label: "Conflict of Interest (COI)", placeholder: "Disclose any conflicts…" },
          { key: "fundingStatement", label: "Funding Statement", placeholder: "Grant numbers, funders…" },
          { key: "ethicsStatement", label: "Ethics Statement", placeholder: "Ethical approval, consent…" },
          { key: "dataAvailabilityStatement", label: "Data Availability", placeholder: "Where data can be accessed…" },
          { key: "authorContributions", label: "Author Contributions (CRediT)", placeholder: "Who did what…" },
          { key: "acknowledgements", label: "Acknowledgements", placeholder: "Thank collaborators, funders…" },
        ].map((f) => (
          <div key={f.key} className="space-y-2">
            <Label>{f.label}</Label>
            <Textarea value={(decl[f.key] as string) ?? ""} onChange={(e) => upd({ [f.key]: e.target.value })} rows={3} placeholder={f.placeholder} />
          </div>
        ))}
        <div className="space-y-3 pt-2 border-t">
          <p className="text-sm font-medium">Confirmations *</p>
          {[
            { key: "originalityConfirmed", label: "I confirm this work is original and not under consideration elsewhere." },
            { key: "ethicsConfirmed", label: "I confirm ethical compliance and necessary approvals were obtained." },
            { key: "authorshipConfirmed", label: "I confirm all authors have approved the manuscript and authorship is correct." },
            { key: "copyrightConfirmed", label: "I confirm copyright / license agreement and that I have authority to publish." },
          ].map((c) => (
            <label key={c.key} className="flex gap-3 items-start rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
              <input type="checkbox" checked={!!decl[c.key]} onChange={(e) => upd({ [c.key]: e.target.checked })} className="mt-1 rounded border-input" />
              <span className="text-sm">{c.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function SuggestedReviewersStep({ data, updateData }: { data: Record<string, unknown>; updateData: (p: Record<string, unknown>) => void }) {
  const list = ((data.suggestedReviewers as Record<string, unknown>[]) ?? []) as Array<{ reviewerName: string; reviewerEmail?: string; institution?: string; expertise?: string[]; reason?: string }>;
  function add() {
    updateData({ suggestedReviewers: [...list, { reviewerName: "", reviewerEmail: "", institution: "", expertise: [], reason: "" }] });
  }
  function upd(idx: number, patch: Record<string, unknown>) {
    const next = list.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    updateData({ suggestedReviewers: next });
  }
  function remove(idx: number) {
    updateData({ suggestedReviewers: list.filter((_, i) => i !== idx) });
  }
  return (
    <div className="space-y-4">
      <SectionHeader icon={Star} title="Suggested Reviewers" description="Optionally suggest up to 10 reviewers (journal may use these)." />
      {list.length === 0 && <p className="text-sm text-muted-foreground">No suggested reviewers. Click Add to suggest.</p>}
      <div className="space-y-3">
        {list.map((r, idx) => (
          <Card key={idx}>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <Label className="font-medium">Reviewer {idx + 1}</Label>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(idx)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input value={r.reviewerName} onChange={(e) => upd(idx, { reviewerName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={r.reviewerEmail ?? ""} onChange={(e) => upd(idx, { reviewerEmail: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Institution</Label>
                  <Input value={r.institution ?? ""} onChange={(e) => upd(idx, { institution: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Expertise (comma-separated)</Label>
                  <Input
                    value={(r.expertise ?? []).join(", ")}
                    onChange={(e) => upd(idx, { expertise: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Reason</Label>
                  <Input value={r.reason ?? ""} onChange={(e) => upd(idx, { reason: e.target.value })} placeholder="Why this reviewer is suitable" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Button onClick={add} variant="outline" className="w-full" disabled={list.length >= 10}>
        <Plus className="h-4 w-4" /> Add suggested reviewer
      </Button>
    </div>
  );
}

function ExcludedReviewersStep({ data, updateData }: { data: Record<string, unknown>; updateData: (p: Record<string, unknown>) => void }) {
  const list = ((data.excludedReviewers as Record<string, unknown>[]) ?? []) as Array<{ reviewerName?: string; reviewerEmail?: string; reason: string }>;
  function add() {
    updateData({ excludedReviewers: [...list, { reviewerName: "", reviewerEmail: "", reason: "" }] });
  }
  function upd(idx: number, patch: Record<string, unknown>) {
    const next = list.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    updateData({ excludedReviewers: next });
  }
  function remove(idx: number) {
    updateData({ excludedReviewers: list.filter((_, i) => i !== idx) });
  }
  return (
    <div className="space-y-4">
      <SectionHeader icon={Ban} title="Excluded Reviewers" description="List reviewers you wish to exclude (with reason). Up to 10." />
      {list.length === 0 && <p className="text-sm text-muted-foreground">No excluded reviewers.</p>}
      <div className="space-y-3">
        {list.map((r, idx) => (
          <Card key={idx}>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <Label className="font-medium">Excluded {idx + 1}</Label>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(idx)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={r.reviewerName ?? ""} onChange={(e) => upd(idx, { reviewerName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={r.reviewerEmail ?? ""} onChange={(e) => upd(idx, { reviewerEmail: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Reason *</Label>
                  <Input value={r.reason} onChange={(e) => upd(idx, { reason: e.target.value })} placeholder="Conflict, competition, etc." />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Button onClick={add} variant="outline" className="w-full" disabled={list.length >= 10}>
        <Plus className="h-4 w-4" /> Add excluded reviewer
      </Button>
    </div>
  );
}

function ReviewStep({ data, journals }: { data: Record<string, unknown>; journals: { id: string; name: string }[] }) {
  const journalName = journals.find((j) => j.id === data.journalId)?.name ?? (data.journalId as string) ?? "—";
  const decl = (data.declarations as Record<string, unknown>) ?? {};
  return (
    <div className="space-y-4">
      <SectionHeader icon={FileText} title="Review Submission" description="Check the summary before submitting. You can go back to edit any step." />
      <div className="grid gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-widest">Journal</p>
                <p className="font-medium">{journalName}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-widest">Article Type</p>
                <p className="font-medium">{(data.articleType as string) ?? "—"}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-muted-foreground text-xs uppercase tracking-widest">Title</p>
                <p className="font-medium">{(data.title as string) ?? "—"}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-muted-foreground text-xs uppercase tracking-widest">Abstract</p>
                <p className="text-muted-foreground line-clamp-4">{(data.abstract as string) ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-widest">Keywords</p>
                <p>{((data.keywords as string[]) ?? []).join(", ") || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-widest">Subject Areas</p>
                <p>{((data.subjectAreas as string[]) ?? []).join(", ") || "—"}</p>
              </div>
            </div>
            <div className="border-t pt-3 grid sm:grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-widest">Authors ({((data.authors as unknown[]) ?? []).length})</p>
                <ul className="list-disc pl-5">
                  {((data.authors as Array<{ firstName: string; lastName: string; isCorresponding?: boolean }>) ?? []).map((a, i) => (
                    <li key={i}>
                      {a.firstName} {a.lastName} {a.isCorresponding ? " (corresponding)" : ""}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-widest">Files ({((data.files as unknown[]) ?? []).length})</p>
                <ul className="list-disc pl-5">
                  {((data.files as Array<{ originalFilename: string; fileType: string }>) ?? []).map((f, i) => (
                    <li key={i}>
                      {f.originalFilename} — {f.fileType}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-muted-foreground text-xs uppercase tracking-widest">Declarations confirmed</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {["originalityConfirmed", "ethicsConfirmed", "authorshipConfirmed", "copyrightConfirmed"].map((k) => (
                  <Badge key={k} variant={decl[k] ? "default" : "destructive"} className="text-[11px]">
                    {k.replace("Confirmed", "")}: {decl[k] ? "✓" : "✗"}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground">
              <span>Suggested reviewers: {((data.suggestedReviewers as unknown[]) ?? []).length}</span>
              <span>•</span>
              <span>Excluded: {((data.excludedReviewers as unknown[]) ?? []).length}</span>
              <span>•</span>
              <span>Affiliations: {((data.affiliations as unknown[]) ?? []).length}</span>
            </div>
          </CardContent>
        </Card>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Ensure all information is correct. After submission, the manuscript will enter technical check and cannot be edited until returned.
        </div>
      </div>
    </div>
  );
}

