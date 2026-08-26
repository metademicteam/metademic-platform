import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cloudinary, createSignedUploadParams } from "@/lib/cloudinary";

/**
 * POST /api/upload/signature
 * Generates Cloudinary signed upload params server-side.
 * Never exposes CLOUDINARY_API_SECRET to the browser.
 *
 * Body: { folder: string, filename?: string, fileType?: string, publicId?: string }
 * Returns: { cloudName, apiKey, folder, timestamp, signature, ... }
 */
export async function POST(req: NextRequest) {
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

  const folder = (body.folder as string)?.trim();
  if (!folder) return NextResponse.json({ error: "folder is required" }, { status: 400 });

  // Basic folder allowlist: must start with journals/ or users/ or temp/
  // For manuscript uploads: journals/{journalId}/manuscripts/{manuscriptId}/v{n}[/supplementary]
  const allowedPrefix = /^(journals\/[a-z0-9\-]+\/manuscripts\/[a-z0-9\-]+\/v\d+(\/supplementary)?|journals\/[a-z0-9\-]+\/branding|users\/[a-z0-9\-]+|temp\/[a-z0-9\-]+)$/;
  if (!allowedPrefix.test(folder)) {
    // Fallback: allow generic journals/* folder but sanitize
    if (!folder.startsWith("journals/") && !folder.startsWith("users/") && !folder.startsWith("temp/")) {
      return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
    }
  }

  const publicId = body.publicId as string | undefined;
  const tags: string[] = [];
  if (body.fileType) tags.push(String(body.fileType));
  // Add a short audit tag
  tags.push(`user:${user.id}`);

  try {
    const params = createSignedUploadParams({
      folder,
      publicId,
      tags: tags.length ? tags : undefined,
    });
    return NextResponse.json(params);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create signature";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Optional GET for health check (doesn't leak secrets)
export async function GET() {
  return NextResponse.json({ ok: true, service: "cloudinary-signature" });
}
