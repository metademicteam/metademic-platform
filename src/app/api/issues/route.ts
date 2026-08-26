import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const createSchema = z.object({
  journalId: z.string().uuid(),
  volumeId: z.string().uuid().nullable().optional(),
  issueNumber: z.number().int().min(1),
  title: z.string().max(300).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  publicationDate: z.string().optional().nullable(),
  isSpecialIssue: z.boolean().optional().default(false),
  coverImageUrl: z.string().url().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Public can read issues; if unauthenticated, still allow if journalId provided? For now require auth for admin listing
  const url = new URL(req.url);
  const journalId = url.searchParams.get("journalId");
  const volumeId = url.searchParams.get("volumeId");
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));

  // Use anon if not auth else authenticated
  const client = supabase;
  let query = client.from("issues").select("*, volumes!left(volume_number, year, title), journals!inner(name, slug)").order("created_at", { ascending: false }).limit(limit);
  if (journalId) query = query.eq("journal_id", journalId);
  if (volumeId) query = query.eq("volume_id", volumeId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also fetch article counts per issue
  const enriched = await Promise.all((data ?? []).map(async (iss: Record<string, unknown>) => {
    const { count } = await client.from("articles").select("id", { count: "exact", head: true }).eq("issue_id", iss["id"] as string);
    return { ...iss, article_count: count ?? 0 };
  }));

  return NextResponse.json({ data: enriched });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const { journalId, volumeId, issueNumber, title, description, publicationDate, isSpecialIssue, coverImageUrl } = parsed.data;

  // Auth: admin/journal_manager
  const { data: memberships } = await supabase.from("journal_members").select("role,is_active").eq("user_id", user.id).eq("is_active", true);
  const roles = (memberships ?? []).map((m: { role: string }) => m.role);
  const allowed = roles.some((r: string) => ["journal_admin","journal_manager","super_admin","managing_editor","editor_in_chief"].includes(r));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("issues").insert({
    journal_id: journalId,
    volume_id: volumeId ?? null,
    issue_number: issueNumber,
    title: title ?? null,
    description: description ?? null,
    publication_date: publicationDate ?? null,
    is_special_issue: isSpecialIssue ?? false,
    cover_image_url: coverImageUrl ?? null,
  } as never).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("audit_logs").insert({ actor_id: user.id, journal_id: journalId, action: "issue.created", entity_type: "issue", entity_id: (data as { id: string }).id, new_data: { issueNumber, title } } as never);
  return NextResponse.json({ data }, { status: 201 });
}
