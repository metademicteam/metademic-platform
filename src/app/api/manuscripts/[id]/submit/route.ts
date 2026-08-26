import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { submitManuscript, ManuscriptServiceError } from "@/lib/services/manuscript-service";
import { manuscriptWizardSchema } from "@/lib/validations/manuscript";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Optional: validate that required wizard data is complete before allowing submit
  const { data: manuscript } = await supabase.from("manuscripts").select("*, journals(id, name)").eq("id", id).single();
  if (!manuscript) return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  const m = manuscript as {
    id: string;
    title: string;
    abstract: string | null;
    status: string;
    submitted_by: string | null;
    journal_id: string;
  };
  if (m.submitted_by !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Validate that manuscript has authors, files, declarations
  const [{ data: authors }, { data: files }, { data: decl }] = await Promise.all([
    supabase.from("manuscript_authors").select("id").eq("manuscript_id", id),
    supabase.from("manuscript_files").select("id").eq("manuscript_id", id),
    supabase.from("submission_declarations").select("originality_confirmed").eq("manuscript_id", id).maybeSingle(),
  ]);
  if (!authors || authors.length === 0) return NextResponse.json({ error: "At least one author is required" }, { status: 400 });
  if (!files || files.length === 0) return NextResponse.json({ error: "At least one manuscript file is required" }, { status: 400 });
  if (!m.title || m.title.trim().length < 10) return NextResponse.json({ error: "Title is incomplete" }, { status: 400 });
  if (!m.abstract || m.abstract.trim().length < 50) return NextResponse.json({ error: "Abstract is incomplete" }, { status: 400 });

  try {
    const updated = await submitManuscript(supabase as unknown as never, id, user.id);
    // Also mark version as submitted
    await supabase
      .from("manuscript_versions")
      .update({ submitted_at: new Date().toISOString(), submitted_by: user.id } as never)
      .eq("manuscript_id", id)
      .eq("version_number", 1);

    // Clear wizard local draft? Client will handle. Server just returns.
    return NextResponse.json({ data: updated });
  } catch (e) {
    if (e instanceof ManuscriptServiceError) {
      const status = e.code === "VALIDATION_ERROR" ? 400 : e.code === "AUTHORIZATION_ERROR" ? 403 : e.code === "NOT_FOUND" ? 404 : e.code === "WORKFLOW_ERROR" ? 400 : 500;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    const msg = e instanceof Error ? e.message : "Failed to submit";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
