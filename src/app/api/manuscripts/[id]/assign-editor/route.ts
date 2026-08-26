import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const schema = z.object({
  editorId: z.string().uuid(),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Validation failed" }, { status: 400 });
  const { editorId, notes } = parsed.data;

  // Fetch manuscript
  const { data: manuscript } = await supabase.from("manuscripts").select("id, journal_id, status, title, manuscript_number, assigned_editor_id").eq("id", id).single();
  if (!manuscript) return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  const m = manuscript as { id: string; journal_id: string; status: string; title: string; manuscript_number: string; assigned_editor_id: string | null };

  // Check assigner has permission
  const { data: assignerMembership } = await supabase.from("journal_members").select("role, is_active").eq("user_id", user.id).eq("journal_id", m.journal_id).eq("is_active", true);
  const canAssign = (assignerMembership ?? []).some((r) => ["editor_in_chief", "managing_editor", "journal_manager", "journal_admin", "super_admin"].includes((r as { role: string }).role));
  if (!canAssign) {
    // Also allow super_admin globally
    const { data: superMember } = await supabase.from("journal_members").select("role").eq("user_id", user.id).eq("role", "super_admin").eq("is_active", true);
    if (!superMember || superMember.length === 0) return NextResponse.json({ error: "Forbidden: insufficient permission to assign editor" }, { status: 403 });
  }

  // Verify target editor is member of journal with editor role
  const { data: targetMembership } = await supabase.from("journal_members").select("role, is_active").eq("user_id", editorId).eq("journal_id", m.journal_id).eq("is_active", true);
  const isEditor = (targetMembership ?? []).some((r) => ["editor", "section_editor", "editor_in_chief", "managing_editor", "journal_manager", "journal_admin", "super_admin"].includes((r as { role: string }).role));
  if (!isEditor) return NextResponse.json({ error: "Target user is not an editor for this journal" }, { status: 400 });

  // Create editorial_assignments — deactivate previous active assignments
  await supabase.from("editorial_assignments").update({ is_active: false, unassigned_at: new Date().toISOString() } as never).eq("manuscript_id", id).eq("is_active", true);

  const { error: insertErr } = await supabase.from("editorial_assignments").insert({
    manuscript_id: id,
    editor_id: editorId,
    assigned_by: user.id,
    assigned_at: new Date().toISOString(),
    is_active: true,
    notes: notes ?? null,
  } as never);
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Update manuscripts.assigned_editor_id and potentially advance status if in editor_assignment
  const updates: Record<string, unknown> = { assigned_editor_id: editorId };
  if (m.status === "editor_assignment") {
    updates.status = "editorial_screening";
    updates.editorial_screened_at = null;
  } else if (m.status === "technical_check") {
    // If still in technical_check, move to editor_assignment then screening
    updates.status = "editorial_screening";
  }

  const { error: updateErr } = await supabase.from("manuscripts").update(updates as never).eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Audit
  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    journal_id: m.journal_id,
    manuscript_id: id,
    action: "editor_assigned",
    entity_type: "editorial_assignment",
    entity_id: id,
    new_data: { editor_id: editorId, previous_editor_id: m.assigned_editor_id } as never,
  } as never);

  if (m.status !== updates.status) {
    await supabase.from("workflow_events").insert({
      manuscript_id: id,
      actor_id: user.id,
      from_status: m.status as never,
      to_status: (updates.status as string) as never,
      event_type: "editor_assigned",
      description: `Editor assigned: ${editorId}`,
    } as never);
  }

  // Notification to assigned editor
  await supabase.from("notifications").insert({
    user_id: editorId,
    journal_id: m.journal_id,
    manuscript_id: id,
    type: "editor_assigned",
    title: "You have been assigned as editor",
    message: `You are now handling editor for "${m.title}" (${m.manuscript_number}).`,
    action_url: `/editor/manuscripts/${id}`,
  } as never);

  return NextResponse.json({ data: { manuscriptId: id, assignedEditorId: editorId } });
}
