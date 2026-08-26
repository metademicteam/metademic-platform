import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { manuscriptFileSchema } from "@/lib/validations/manuscript";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: manuscriptId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = manuscriptFileSchema.safeParse({
    fileType: body.fileType,
    originalFilename: body.originalFilename,
    storagePath: body.storagePath,
    mimeType: body.mimeType ?? "",
    fileSize: body.fileSize ?? body.bytes ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Validation failed" }, { status: 400 });
  }

  const { data: manuscript } = await supabase.from("manuscripts").select("id, journal_id, current_version, submitted_by").eq("id", manuscriptId).single();
  if (!manuscript) return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  const m = manuscript as { journal_id: string; current_version: number; submitted_by: string | null };
  if (m.submitted_by !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Resolve version_id: use provided versionId or fetch current version record, or create one
  let versionId = body.versionId as string | null | undefined;
  if (!versionId) {
    const { data: ver } = await supabase
      .from("manuscript_versions")
      .select("id")
      .eq("manuscript_id", manuscriptId)
      .eq("version_number", m.current_version)
      .maybeSingle();
    if (ver) versionId = (ver as { id: string }).id;
    else {
      const { data: created } = await supabase
        .from("manuscript_versions")
        .insert({
          manuscript_id: manuscriptId,
          version_number: m.current_version,
          revision_round: 0,
          version_label: `v${m.current_version}`,
          submitted_by: user.id,
        } as never)
        .select("id")
        .single();
      versionId = (created as { id: string } | null)?.id ?? null;
    }
  }

  const meta = (body.metadata as Record<string, unknown>) ?? {};
  // enrich with cloudinary fields if present
  if (body.secureUrl) (meta as Record<string, unknown>).secure_url = body.secureUrl;
  if (body.publicId) (meta as Record<string, unknown>).public_id = body.publicId;
  if (body.resourceType) (meta as Record<string, unknown>).resource_type = body.resourceType;
  if (body.format) (meta as Record<string, unknown>).format = body.format;

  const { data: fileRow, error } = await supabase
    .from("manuscript_files")
    .insert({
      manuscript_id: manuscriptId,
      version_id: versionId,
      uploaded_by: user.id,
      file_type: parsed.data.fileType as never,
      original_filename: parsed.data.originalFilename,
      storage_bucket: (body.storageBucket as string) ?? "cloudinary",
      storage_path: parsed.data.storagePath,
      mime_type: parsed.data.mimeType ?? null,
      file_size: parsed.data.fileSize ?? (body.bytes as number) ?? null,
      checksum: (body.checksum as string) ?? null,
      is_public: false,
      metadata: meta as never,
    } as never)
    .select("*")
    .single();

  if (error || !fileRow) return NextResponse.json({ error: error?.message ?? "Failed to save file" }, { status: 500 });

  return NextResponse.json({ data: fileRow }, { status: 201 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: manuscriptId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: files, error } = await supabase.from("manuscript_files").select("*").eq("manuscript_id", manuscriptId).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: files ?? [] });
}
