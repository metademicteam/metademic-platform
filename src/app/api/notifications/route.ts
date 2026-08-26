import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
  const unreadOnly = url.searchParams.get("unread") === "true";

  let query = supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(limit);
  if (unreadOnly) query = query.eq("is_read", false);
  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Unread count
  const { count: unreadCount } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false);

  return NextResponse.json({ data: data ?? [], unreadCount: unreadCount ?? 0, limit });
}

export async function POST(req: NextRequest) {
  // Mark all read
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const b = body as Record<string, unknown>;
  if (b.action === "mark_all_read") {
    const admin = createAdminClient();
    const { error } = await admin.from("notifications").update({ is_read: true, read_at: new Date().toISOString() } as never).eq("user_id", user.id).eq("is_read", false);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// Helper also supports PATCH for mark all read via query param
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { error } = await admin.from("notifications").update({ is_read: true, read_at: new Date().toISOString() } as never).eq("user_id", user.id).eq("is_read", false);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
