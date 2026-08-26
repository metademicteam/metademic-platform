import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  short_name: z.string().max(100).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(["draft","active","archived","suspended"]).optional(),
  default_apc: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  doi_prefix: z.string().regex(/^10\.\d{4,9}(\.\d+)*$/).nullable().optional(),
  publisher_name: z.string().max(200).nullable().optional(),
  issn_print: z.string().max(20).nullable().optional(),
  issn_online: z.string().max(20).nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
  website_url: z.string().url().nullable().optional(),
  apc_enabled: z.boolean().optional(),
  doi_enabled: z.boolean().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.from("journals").select("*").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Journal not found" }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const { data: memberships } = await supabase.from("journal_members").select("role,is_active").eq("user_id", user.id).eq("is_active", true);
  const roles = (memberships ?? []).map((m: { role: string }) => m.role);
  const allowed = roles.includes("super_admin") || roles.some((r: string) => ["journal_admin","journal_manager"].includes(r));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const updates = parsed.data as Record<string, unknown>;
  if (updates.slug) updates.slug = (updates.slug as string).toLowerCase();
  if (updates.currency) updates.currency = (updates.currency as string).toUpperCase();
  const { data, error } = await admin.from("journals").update(updates as never).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("audit_logs").insert({ actor_id: user.id, action: "journal.updated", entity_type: "journal", entity_id: id, new_data: updates } as never);
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: memberships } = await supabase.from("journal_members").select("role,is_active").eq("user_id", user.id).eq("is_active", true);
  const roles = (memberships ?? []).map((m: { role: string }) => m.role);
  if (!roles.includes("super_admin")) return NextResponse.json({ error: "Forbidden — super_admin required to delete journal" }, { status: 403 });

  const admin = createAdminClient();
  const { error } = await admin.from("journals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("audit_logs").insert({ actor_id: user.id, action: "journal.deleted", entity_type: "journal", entity_id: id } as never);
  return NextResponse.json({ success: true });
}
