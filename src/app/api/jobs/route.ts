import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { listJobs, enqueueJob, retryJob } from "@/lib/jobs";
import { writeAuditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Require admin / managing_editor etc
  const { data: memberships } = await supabase.from("journal_members").select("role, is_active").eq("user_id", user.id).eq("is_active", true);
  const roles = (memberships ?? []).map((m: { role: string }) => m.role);
  const isPrivileged = roles.some((r) => ["super_admin", "journal_admin", "journal_manager", "managing_editor", "production_editor"].includes(r));
  if (!isPrivileged) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const jobType = url.searchParams.get("jobType") ?? url.searchParams.get("job_type") ?? undefined;
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(url.searchParams.get("pageSize") ?? "20", 10);

  try {
    const result = await listJobs(supabase as never, { status, jobType, page, pageSize });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to list jobs" }, { status: 500 });
  }
}

const postSchema = z.object({
  jobType: z.string().min(1).max(80),
  entityType: z.string().max(80).optional().nullable(),
  entityId: z.string().uuid().optional().nullable(),
  payload: z.record(z.unknown()).optional(),
  scheduledAt: z.string().optional().nullable(),
  maxAttempts: z.number().int().min(1).max(20).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Validation failed" }, { status: 400 });

  try {
    const job = await enqueueJob(supabase as never, {
      jobType: parsed.data.jobType,
      entityType: parsed.data.entityType ?? null,
      entityId: parsed.data.entityId ?? null,
      payload: parsed.data.payload as Record<string, unknown> | undefined,
      scheduledAt: parsed.data.scheduledAt ?? null,
      maxAttempts: parsed.data.maxAttempts,
    });
    await writeAuditLog(supabase as never, { actorId: user.id, action: "system_job.created", entityType: "system_job", entityId: (job as { id: string }).id, newData: job as Record<string, unknown> });
    return NextResponse.json({ data: job }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to enqueue job" }, { status: 500 });
  }
}

const patchSchema = z.object({ jobId: z.string().uuid() });

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Validation failed" }, { status: 400 });

  try {
    const job = await retryJob(supabase as never, parsed.data.jobId);
    await writeAuditLog(supabase as never, { actorId: user.id, action: "system_job.retried", entityType: "system_job", entityId: parsed.data.jobId });
    return NextResponse.json({ data: job });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to retry job" }, { status: 409 });
  }
}
