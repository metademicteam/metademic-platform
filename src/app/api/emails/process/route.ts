import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processPendingEmails } from "@/lib/email/send";

/**
 * Worker endpoint that drains pending `send_email` jobs via Resend.
 * Triggered by cron (pg_net) or automation. Gated with a shared secret so the
 * endpoint cannot be abused to send arbitrary emails.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SYSTEM_JOBS_SECRET;
  const auth = req.headers.get("authorization");
  const provided = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!secret || !provided || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized — missing or invalid system secret" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const result = await processPendingEmails(admin);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to process emails" }, { status: 500 });
  }
}
