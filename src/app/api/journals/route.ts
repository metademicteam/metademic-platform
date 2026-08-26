import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  short_name: z.string().max(100).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(["draft","active","archived","suspended"]).optional().default("active"),
  default_apc: z.number().min(0).optional().default(0),
  currency: z.string().length(3).optional().default("USD"),
  doi_prefix: z.string().regex(/^10\.\d{4,9}(\.\d+)*$/).nullable().optional(),
  publisher_name: z.string().max(200).optional().nullable(),
  issn_print: z.string().max(20).optional().nullable(),
  issn_online: z.string().max(20).optional().nullable(),
  website_url: z.string().url().optional().nullable(),
  contact_email: z.string().email().optional().nullable(),
  apc_enabled: z.boolean().optional(),
  doi_enabled: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
  const q = url.searchParams.get("q");
  const status = url.searchParams.get("status");
  let query = supabase.from("journals").select("id, name, slug, short_name, status, default_apc, currency, doi_prefix, apc_enabled, doi_enabled, issn_print, issn_online, publisher_name, description, created_at, updated_at").order("created_at", { ascending: false }).limit(limit);
  if (q) query = query.ilike("name", `%${q}%`);
  if (status) query = query.eq("status", status as never);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message, details: parsed.error.flatten() }, { status: 400 });

  const { name, slug, short_name, description, status, default_apc, currency, doi_prefix, publisher_name, issn_print, issn_online, website_url, contact_email, apc_enabled, doi_enabled } = parsed.data;

  // Permission
  const { data: memberships } = await supabase.from("journal_members").select("role,is_active").eq("user_id", user.id).eq("is_active", true);
  const roles = (memberships ?? []).map((m: { role: string }) => m.role);
  const allowed = roles.includes("super_admin") || roles.some((r: string) => ["journal_admin","journal_manager"].includes(r));
  // Allow creation if user is super_admin or no journals yet (bootstrap)
  const { count } = await supabase.from("journals").select("id", { count: "exact", head: true });
  const isBootstrap = (count ?? 0) === 0;
  if (!allowed && !isBootstrap) return NextResponse.json({ error: "Forbidden — journal_admin/super_admin required" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("journals").insert({
    name,
    slug: slug.toLowerCase(),
    short_name: short_name ?? null,
    description: description ?? null,
    status: status ?? "active",
    default_apc: default_apc ?? 0,
    currency: (currency ?? "USD").toUpperCase(),
    doi_prefix: doi_prefix ?? null,
    publisher_name: publisher_name ?? null,
    issn_print: issn_print ?? null,
    issn_online: issn_online ?? null,
    website_url: website_url ?? null,
    contact_email: contact_email ?? null,
    apc_enabled: apc_enabled ?? (Number(default_apc) > 0),
    doi_enabled: doi_enabled ?? true,
  } as never).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("audit_logs").insert({ actor_id: user.id, action: "journal.created", entity_type: "journal", entity_id: (data as { id: string }).id, new_data: { name, slug } } as never);
  // Ensure creator is journal_admin for this journal
  try {
    await admin.from("journal_members").insert({ journal_id: (data as { id: string }).id, user_id: user.id, role: "journal_admin" } as never);
  } catch {}

  return NextResponse.json({ data }, { status: 201 });
}
