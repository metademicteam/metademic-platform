import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({ articleId: z.string().uuid(), issueId: z.string().uuid().nullable() });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const { articleId, issueId } = parsed.data;

  const { data: memberships } = await supabase.from("journal_members").select("role,is_active").eq("user_id", user.id).eq("is_active", true);
  const roles = (memberships ?? []).map((m: { role: string }) => m.role);
  const allowed = roles.some((r: string) => ["journal_admin","journal_manager","super_admin","managing_editor","editor_in_chief","production_editor"].includes(r));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("articles").update({ issue_id: issueId } as never).eq("id", articleId).select("id, issue_id, slug, article_number").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("audit_logs").insert({ actor_id: user.id, action: "article.assigned_to_issue", entity_type: "article", entity_id: articleId, new_data: { issueId } } as never);
  return NextResponse.json({ data });
}
