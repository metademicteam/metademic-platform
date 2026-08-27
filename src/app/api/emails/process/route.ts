import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processPendingEmails } from "@/lib/email/send";

/**
 * Worker endpoint that drains pending `send_email` jobs via Resend.
 * Triggered by cron (pg_net) or automation. Gated with a shared secret so the
 * endpoint cannot be abused to send arbitrary emails.
 */
export async function GET() {
  const admin = createAdminClient();
  const { data } = await admin.from("system_jobs").select("id, job_type, status, payload, error_message, created_at").eq("job_type", "send_email").order("created_at", { ascending: false }).limit(20);
  const { data: logs } = await admin.from("email_logs").select("recipient_email, template_name, status, error_message, created_at").order("created_at", { ascending: false }).limit(20);
  return NextResponse.json({ jobs: data ?? [], logs: logs ?? [] });
}

export async function POST(req: NextRequest) {
  const secret = process.env.SYSTEM_JOBS_SECRET;
  const auth = req.headers.get("authorization");
  const provided = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!secret || !provided || provided !== secret) {
    if (secret) return NextResponse.json({ error: "Unauthorized — missing or invalid system secret" }, { status: 401 });
    // No SYSTEM_JOBS_SECRET configured — allow authenticated journal admin
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: mem } = await supabase.from("journal_members").select("role").eq("user_id", user.id).eq("is_active", true).limit(1);
    const isAdmin = (mem ?? []).some((r: { role: string }) => ["super_admin","journal_admin","journal_manager"].includes(r.role));
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const admin = createAdminClient();
    const result = await processPendingEmails(admin);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to process emails" }, { status: 500 });
  }
}
