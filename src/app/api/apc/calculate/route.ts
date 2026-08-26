import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { calculateApc, upsertApcForManuscript } from "@/lib/services/apc-service";

const schema = z.object({
  manuscriptId: z.string().uuid(),
  discountAmount: z.number().min(0).optional().default(0),
  waiverAmount: z.number().min(0).optional().default(0),
  taxRate: z.number().min(0).max(1).optional().default(0),
  currency: z.string().length(3).optional(),
  status: z.enum(["not_required","calculated","waiver_requested","waiver_approved","invoice_issued","payment_pending","paid","failed","refunded","cancelled"]).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message, details: parsed.error.flatten() }, { status: 400 });

  const { manuscriptId, discountAmount, waiverAmount, taxRate, currency, status } = parsed.data;

  // Fetch manuscript + journal to resolve base APC
  const { data: manuscript, error: mErr } = await supabase.from("manuscripts").select("id, journal_id, manuscripts:journal_id").eq("id", manuscriptId).maybeSingle();
  // Better: fetch journals separately
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  // Fetch journal row
  const { data: mRow } = await supabase.from("manuscripts").select("journal_id").eq("id", manuscriptId).single();
  if (!mRow) return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  const journalId = (mRow as { journal_id: string }).journal_id;

  const { data: journal, error: jErr } = await supabase.from("journals").select("default_apc, currency, apc_enabled, settings").eq("id", journalId).single();
  if (jErr || !journal) return NextResponse.json({ error: "Journal not found" }, { status: 404 });

  const j = journal as { default_apc: number; currency: string; apc_enabled: boolean; settings: Record<string, unknown> };
  const baseAmount = j.apc_enabled ? Number(j.default_apc ?? 0) : 0;

  // Resolve tax rate from settings if not explicitly provided (settings.tax_rate)
  const settingsTax = (j.settings as Record<string, unknown>)?.tax_rate as number | undefined;
  const effectiveTaxRate = taxRate ?? (typeof settingsTax === "number" ? settingsTax : 0);
  const effectiveCurrency = (currency ?? j.currency ?? "USD").toUpperCase();

  // Pure calculation via service
  const calc = calculateApc({ baseAmount, discountAmount, waiverAmount, taxRate: effectiveTaxRate, currency: effectiveCurrency });

  // Authorization: finance/editor/journal_admin/super_admin or author of manuscript? Allow finance/admin/editor to calculate
  const { data: memberships } = await supabase.from("journal_members").select("role, is_active").eq("user_id", user.id).eq("is_active", true);
  const roles = (memberships ?? []).map((mm: { role: string }) => mm.role);
  const allowed = roles.some((r: string) => ["finance_admin","journal_admin","journal_manager","super_admin","managing_editor","editor","editor_in_chief","section_editor"].includes(r));
  // Also allow author if they own manuscript
  const { data: own } = await supabase.from("manuscripts").select("submitted_by").eq("id", manuscriptId).single();
  const isOwner = (own as { submitted_by: string | null } | null)?.submitted_by === user.id;
  if (!allowed && !isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const apc = await upsertApcForManuscript(supabase as never, manuscriptId, {
      baseAmount: calc.baseAmount,
      discountAmount: calc.discountAmount,
      waiverAmount: calc.waiverAmount,
      taxRate: effectiveTaxRate,
      currency: effectiveCurrency,
      status: status as never,
    });
    return NextResponse.json({ data: apc, calculation: calc }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to calculate APC" }, { status: 500 });
  }
}
