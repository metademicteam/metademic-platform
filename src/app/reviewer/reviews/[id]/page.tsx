export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReviewForm } from "@/components/reviewer/ReviewForm";

export default async function ReviewPortalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: assignmentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const admin = createAdminClient();
  // Fetch assignment with round + manuscript + journal blind type — use admin after auth
  const { data: assignment } = await admin
    .from("review_assignments")
    .select("id, status, reviewer_id, review_round_id, deadline_at, is_anonymous, review_rounds!inner(manuscript_id, round_number, manuscripts!inner(id, title, abstract, journal_id, journals!inner(review_blind_type, name)))")
    .eq("id", assignmentId)
    .single();
  if (!assignment) notFound();
  const ass = assignment as unknown as {
    id: string;
    status: string;
    reviewer_id: string;
    review_round_id: string;
    deadline_at: string | null;
    is_anonymous: boolean;
    review_rounds: { manuscript_id: string; round_number: number; manuscripts: { id: string; title: string; abstract: string | null; journal_id: string; journals: { review_blind_type: string; name: string } } };
  };

  // Verify ownership
  const { data: profile } = await admin.from("reviewer_profiles").select("user_id").eq("id", ass.reviewer_id).single();
  if (!profile || (profile as { user_id: string }).user_id !== user.id) return redirect("/auth/login?error=forbidden");

  const manuscriptId = ass.review_rounds.manuscript_id;
  const blindType = ass.review_rounds.manuscripts.journals.review_blind_type;

  // Fetch existing report
  const { data: report } = await admin.from("review_reports").select("*").eq("review_assignment_id", assignmentId).maybeSingle();

  // Fetch manuscript details respecting blind type
  const manuscriptTitle = ass.review_rounds.manuscripts.title;
  const manuscriptAbstract = ass.review_rounds.manuscripts.abstract;
  const authorsVisible = blindType !== "double_blind";
  let authorData: Array<{ first_name: string; last_name: string }> | null = null;
  let files: Array<{ id: string; original_filename: string; file_type: string; secure_url: string | null; storage_path: string | null }> | null = null;

  if (authorsVisible) {
    const { data: authors } = await admin.from("manuscript_authors").select("first_name, last_name").eq("manuscript_id", manuscriptId).order("author_order");
    authorData = (authors ?? []) as Array<{ first_name: string; last_name: string }>;
  }

  // Files: respect blind — reviewer can download but filenames should not leak author names if double_blind? For simplicity, allow file download but don't expose author metadata
  // NOTE: `secure_url` is NOT a real column — it lives inside the `metadata` jsonb. Selecting it causes
  // PostgREST to error the whole query and return 0 rows. Only select real columns + metadata.
  const { data: fileRows } = await admin.from("manuscript_files").select("id, original_filename, file_type, storage_path, metadata").eq("manuscript_id", manuscriptId).eq("file_type", "manuscript").order("created_at", { ascending: false }).limit(5);
  files = (fileRows ?? []).map((f) => {
    const r = f as Record<string, unknown>;
    const meta = (r.metadata ?? {}) as { secure_url?: string; cloudinary?: { secure_url?: string } };
    return {
      id: r.id as string,
      original_filename: r.original_filename as string,
      file_type: r.file_type as string,
      // secure_url lives in metadata (Cloudinary), not as a top-level column.
      secure_url: meta.secure_url ?? meta.cloudinary?.secure_url ?? null,
      storage_path: r.storage_path as string | null,
    };
  });

  // Fetch manuscript versions for content placeholder
  const { data: versions } = await admin.from("manuscript_versions").select("version_number").eq("manuscript_id", manuscriptId).order("version_number", { ascending: false }).limit(1);
  const isCompleted = ass.status === "completed";

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1100px] mx-auto w-full">
      <div className="flex items-center gap-3">
        <Link href="/reviewer/reviews" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to reviews
        </Link>
        <Badge variant={isCompleted ? "default" : "secondary"}>{ass.status}</Badge>
        {ass.deadline_at && <span className={`text-xs ${new Date(ass.deadline_at) < new Date() && !isCompleted ? "text-red-600 font-medium" : "text-muted-foreground"}`}>Deadline {new Date(ass.deadline_at).toLocaleDateString()}</span>}
      </div>

      <div>
        <h1 className="text-xl font-semibold">{manuscriptTitle}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Journal: {ass.review_rounds.manuscripts.journals.name} • Round {ass.review_rounds.round_number} • Blind: {blindType}
        </p>
        {authorsVisible && authorData && (
          <p className="text-xs text-muted-foreground mt-1">Authors: {authorData.map((a) => `${a.first_name} ${a.last_name}`).join(", ")}</p>
        )}
        {!authorsVisible && <p className="text-xs text-muted-foreground mt-1">Author identities hidden (double-blind review).</p>}
      </div>

      {files && files.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Manuscript Files</CardTitle>
            <CardDescription>Download manuscript for review.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {files.map((f) => (
                <li key={f.id} className="flex items-center justify-between rounded border p-2">
                  <span>{f.original_filename}</span>
                  <Button variant="outline" size="sm" asChild>
                    <a href={f.secure_url ?? undefined} download={f.original_filename} target="_blank" rel="noopener noreferrer">
                      Download
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-2">The manuscript is rendered in the PDF viewer below.</p>
          </CardContent>
        </Card>
      )}

      <ReviewForm
        assignmentId={assignmentId}
        manuscriptTitle={manuscriptTitle}
        manuscriptAbstract={manuscriptAbstract}
        manuscriptPdfUrl={files?.[0]?.secure_url ?? null}
        blindType={blindType}
        alreadySubmitted={isCompleted}
        initialData={
          report
            ? {
                originality_score: (report as { originality_score: number | null }).originality_score,
                methodology_score: (report as { methodology_score: number | null }).methodology_score,
                literature_score: (report as { literature_score: number | null }).literature_score,
                results_score: (report as { results_score: number | null }).results_score,
                discussion_score: (report as { discussion_score: number | null }).discussion_score,
                writing_score: (report as { writing_score: number | null }).writing_score,
                significance_score: (report as { significance_score: number | null }).significance_score,
                comments_to_author: (report as { comments_to_author: string | null }).comments_to_author,
                confidential_comments_to_editor: (report as { confidential_comments_to_editor: string | null }).confidential_comments_to_editor,
                recommendation: (report as { recommendation: string }).recommendation,
              }
            : undefined
        }
      />

      {isCompleted && <p className="text-sm text-muted-foreground">This review has been submitted and cannot be edited.</p>}
    </div>
  );
}
