import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { calculateApc } from "@/lib/services/apc-service";

const schema = z.object({
  apcId: z.string().uuid(),
  manuscriptId: z.string().uuid().optional(),
  amount: z.number().min(0).optional(),
  reason: z.string().max(2000).optional(),
  action: z.enum(["request","approve","reject","cancel"]).default("request"),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message, details: parsed.error.flatten() }, { status: 400 });

  const { apcId, amount, reason, action } = parsed.data;

  const { data: apc, error: apcErr } = await supabase.from("apcs").select("id, manuscript_id, base_amount, discount_amount, waiver_amount, tax_amount, total_amount, currency, status").eq("id", apcId).single();
  if (apcErr || !apc) return NextResponse.json({ error: "APC not found" }, { status: 404 });
  const a = apc as { id: string; manuscript_id: string; base_amount: number; discount_amount: number; waiver_amount: number; tax_amount: number; total_amount: number; currency: string; status: string };

  // Authorization
  const { data: manuscript } = await supabase.from("manuscripts").select("journal_id, submitted_by").eq("id", a.manuscript_id).single();
  const journalId = (manuscript as { journal_id: string } | null)?.journal_id;
  const { data: memberships } = await supabase.from("journal_members").select("role, is_active, journal_id").eq("user_id", user.id).eq("is_active", true);
  const roles = (memberships ?? []).map((m: { role: string }) => m.role);
  const isFinance = roles.some((r: string) => ["finance_admin","journal_admin","super_admin","journal_manager"].includes(r));
  const isOwner = (manuscript as { submitted_by: string | null } | null)?.submitted_by === user.id;
  const isEditor = roles.some((r: string) => ["editor","section_editor","editor_in_chief","managing_editor"].includes(r));

  if (action === "request") {
    if (!isOwner && !isFinance && !isEditor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const requestedAmount = amount ?? Number(a.total_amount);
    const admin = createAdminClient();
    // Insert waiver request
    const { data: waiver, error: wErr } = await admin.from("apc_waivers").insert({
      apc_id: apcId,
      requested_by: user.id,
      requested_amount: requestedAmount,
      reason: reason ?? null,
      status: "requested",
    } as never).select("*").single();
    if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });
    await admin.from("apcs").update({ status: "waiver_requested" } as never).eq("id", apcId);
    // notifications + audit
    try {
      const { data: jMembers } = await admin.from("journal_members").select("user_id").in("role", ["finance_admin","journal_admin" as never]).eq("journal_id", journalId as never).eq("is_active", true).limit(10);
      for (const jm of (jMembers ?? []) as { user_id: string }[]) {
        await admin.from("notifications").insert({ user_id: jm.user_id, journal_id: journalId, manuscript_id: a.manuscript_id, type: "waiver_requested", title: "Waiver requested", message: `Waiver for ${amount ?? requestedAmount} ${a.currency} requested. Reason: ${reason ?? "—"}`, action_url: `/finance/invoices` } as never);
      }
      await admin.from("audit_logs").insert({ actor_id: user.id, journal_id: journalId, manuscript_id: a.manuscript_id, action: "apc.waiver_requested", entity_type: "apc_waiver", entity_id: (waiver as { id: string }).id, new_data: { apcId, amount: requestedAmount, reason } } as never);
    } catch {}
    return NextResponse.json({ data: waiver, message: "Waiver requested. Awaiting finance approval." });
  }

  // approve / reject require finance
  if (!isFinance) return NextResponse.json({ error: "Finance permission required" }, { status: 403 });

  const admin = createAdminClient();
  const { data: existingRequests } = await admin.from("apc_waivers").select("id, requested_amount, status").eq("apc_id", apcId).eq("status", "requested").order("requested_at", { ascending: false }).limit(1);
  const waiverRow = (existingRequests?.[0] ?? null) as { id: string; requested_amount: number | null; status: string } | null;
  if (!waiverRow) return NextResponse.json({ error: "No pending waiver request found" }, { status: 404 });

  if (action === "approve") {
    const approvedAmount = amount ?? waiverRow.requested_amount ?? 0;
    // Recalculate APC with waiver
    const base = Number(a.base_amount);
    const discount = Number(a.discount_amount);
    // fetch journal tax maybe
    const { data: journal } = await admin.from("journals").select("settings").eq("id", journalId as never).single();
    const taxRate = (journal as { settings: Record<string, unknown> } | null)?.settings?.tax_rate as number | undefined ?? 0;
    const calc = calculateApc({ baseAmount: base, discountAmount: discount, waiverAmount: approvedAmount, taxRate, currency: a.currency });
    await admin.from("apcs").update({ waiver_amount: calc.waiverAmount, tax_amount: calc.taxAmount, total_amount: calc.totalAmount, status: "waiver_approved", calculated_at: new Date().toISOString() } as never).eq("id", apcId);
    await admin.from("apc_waivers").update({ status: "approved", approved_amount: approvedAmount, approved_by: user.id, resolved_at: new Date().toISOString() } as never).eq("id", waiverRow.id);
    await admin.from("audit_logs").insert({ actor_id: user.id, journal_id: journalId, manuscript_id: a.manuscript_id, action: "apc.waiver_approved", entity_type: "apc_waiver", entity_id: waiverRow.id, new_data: { approvedAmount } } as never);
    // notify author
    const m2 = manuscript as { submitted_by: string | null } | null;
    if (m2?.submitted_by) await admin.from("notifications").insert({ user_id: m2.submitted_by, journal_id: journalId, manuscript_id: a.manuscript_id, type: "waiver_approved", title: "Waiver approved", message: `Your waiver for ${approvedAmount} ${a.currency} has been approved.`, action_url: `/author/submissions/${a.manuscript_id}` } as never);
    return NextResponse.json({ message: `Waiver approved for ${approvedAmount} ${a.currency}`, calculation: calc });
  }

  if (action === "reject") {
    await admin.from("apc_waivers").update({ status: "rejected", approved_by: user.id, resolved_at: new Date().toISOString(), reason: reason ?? null } as never).eq("id", waiverRow.id);
    await admin.from("apcs").update({ status: "calculated" } as never).eq("id", apcId);
    await admin.from("audit_logs").insert({ actor_id: user.id, journal_id: journalId, manuscript_id: a.manuscript_id, action: "apc.waiver_rejected", entity_type: "apc_waiver", entity_id: waiverRow.id, new_data: { reason } } as never);
    return NextResponse.json({ message: "Waiver rejected" });
  }

  if (action === "cancel") {
    await admin.from("apc_waivers").update({ status: "cancelled", resolved_at: new Date().toISOString() } as never).eq("id", waiverRow.id);
    return NextResponse.json({ message: "Waiver cancelled" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const apcId = new URL(req.url).searchParams.get("apcId");
  if (!apcId) return NextResponse.json({ error: "apcId required" }, { status: 400 });
  const { data, error } = await supabase.from("apc_waivers").select("*").eq("apc_id", apcId).order("requested_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
