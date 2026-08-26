import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["draft","issued","pending","paid","overdue","cancelled","refunded"]).optional(),
  billingName: z.string().max(200).optional().nullable(),
  billingEmail: z.string().email().optional().nullable(),
  billingAddress: z.string().max(500).optional().nullable(),
  dueAt: z.string().optional().nullable(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.from("invoices").select("*, apcs!inner(manuscript_id, total_amount, currency, status, manuscripts!inner(manuscript_number, title, journal_id))").eq("id", id).single();
  // Fallback without join if RLS restricted
  if (error) {
    const { data: inv, error: e2 } = await supabase.from("invoices").select("*").eq("id", id).single();
    if (e2 || !inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    // enrich
    const { data: apc } = await supabase.from("apcs").select("manuscript_id, currency, total_amount").eq("id", (inv as { apc_id: string }).apc_id).single();
    let manuscript: unknown = null;
    if (apc) {
      const { data: m } = await supabase.from("manuscripts").select("manuscript_number, title, journal_id, status").eq("id", (apc as { manuscript_id: string }).manuscript_id).single();
      manuscript = m;
    }
    const { data: payments } = await supabase.from("payments").select("*").eq("invoice_id", id).order("created_at", { ascending: false });
    return NextResponse.json({ data: { ...inv, apc, manuscript, payments: payments ?? [] } });
  }
  const { data: payments } = await supabase.from("payments").select("*").eq("invoice_id", id).order("created_at", { ascending: false });
  return NextResponse.json({ data: { ...(data as object), payments: payments ?? [] } });
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

  const { status, billingName, billingEmail, billingAddress, dueAt } = parsed.data;

  // Finance guard
  const { data: memberships } = await supabase.from("journal_members").select("role,is_active").eq("user_id", user.id).eq("is_active", true);
  const roles = (memberships ?? []).map((m: { role: string }) => m.role);
  const allowed = roles.some((r: string) => ["finance_admin","journal_admin","super_admin","journal_manager","managing_editor"].includes(r));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const updates: Record<string, unknown> = {};
  if (status) updates.status = status;
  if (billingName !== undefined) updates.billing_name = billingName;
  if (billingEmail !== undefined) updates.billing_email = billingEmail;
  if (billingAddress !== undefined) updates.billing_address = billingAddress;
  if (dueAt !== undefined) updates.due_at = dueAt;
  if (status === "paid" && !updates.paid_at) updates.paid_at = new Date().toISOString();
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const { data, error } = await admin.from("invoices").update(updates as never).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("audit_logs").insert({ actor_id: user.id, action: "invoice.updated", entity_type: "invoice", entity_id: id, new_data: updates } as never);

  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: memberships } = await supabase.from("journal_members").select("role,is_active").eq("user_id", user.id).eq("is_active", true);
  const roles = (memberships ?? []).map((m: { role: string }) => m.role);
  const allowed = roles.some((r: string) => ["finance_admin","journal_admin","super_admin"].includes(r));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  // Only allow delete if unpaid/draft
  const { data: inv } = await admin.from("invoices").select("status").eq("id", id).single();
  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if ((inv as { status: string }).status === "paid") return NextResponse.json({ error: "Cannot delete a paid invoice" }, { status: 400 });

  const { error } = await admin.from("invoices").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("audit_logs").insert({ actor_id: user.id, action: "invoice.deleted", entity_type: "invoice", entity_id: id } as never);
  return NextResponse.json({ success: true });
}
