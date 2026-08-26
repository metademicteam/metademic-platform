import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const createSchema = z.object({
  journalId: z.string().uuid(),
  volumeNumber: z.number().int().min(1),
  year: z.number().int().min(1900).max(2100),
  title: z.string().max(300).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const journalId = url.searchParams.get("journalId");
  const supabase = await createClient();
  let query = supabase.from("volumes").select("*, journals!inner(name, slug)").order("volume_number", { ascending: false }).limit(50);
  if (journalId) query = query.eq("journal_id", journalId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enriched = await Promise.all((data ?? []).map(async (vol: Record<string, unknown>) => {
    const { count } = await supabase.from("issues").select("id", { count: "exact", head: true }).eq("volume_id", vol["id"] as string);
    const { count: articleCount } = await supabase.from("articles").select("id", { count: "exact", head: true }).eq("issue_id", vol["id"] as string); // may not be via volume; approximate via issues
    return { ...vol, issue_count: count ?? 0, article_count: articleCount ?? 0 };
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

  const { journalId, volumeNumber, year, title, description } = parsed.data;

  const { data: memberships } = await supabase.from("journal_members").select("role,is_active").eq("user_id", user.id).eq("is_active", true);
  const roles = (memberships ?? []).map((m: { role: string }) => m.role);
  const allowed = roles.some((r: string) => ["journal_admin","journal_manager","super_admin","managing_editor","editor_in_chief"].includes(r));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("volumes").insert({
    journal_id: journalId,
    volume_number: volumeNumber,
    year,
    title: title ?? null,
    description: description ?? null,
  } as never).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("audit_logs").insert({ actor_id: user.id, journal_id: journalId, action: "volume.created", entity_type: "volume", entity_id: (data as { id: string }).id, new_data: { volumeNumber, year } } as never);
  return NextResponse.json({ data }, { status: 201 });
}
