import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApcStatus } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApcCalculationInput {
  baseAmount: number;
  discountAmount?: number;
  waiverAmount?: number;
  taxRate?: number; // e.g. 0.2 for 20% VAT
  currency?: string;
}

export interface ApcCalculationResult {
  baseAmount: number;
  discountAmount: number;
  waiverAmount: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
}

// ---------------------------------------------------------------------------
// Pure calculation — easy to unit test
// ---------------------------------------------------------------------------

/**
 * Calculate APC total.
 * subtotal = max(0, base - discount - waiver)
 * tax = subtotal * taxRate
 * total = subtotal + tax
 */
export function calculateApc(input: ApcCalculationInput): ApcCalculationResult {
  const baseAmount = Math.max(0, roundCurrency(input.baseAmount));
  const discountAmount = Math.max(0, Math.min(baseAmount, roundCurrency(input.discountAmount ?? 0)));
  const waiverAmount = Math.max(
    0,
    Math.min(baseAmount - discountAmount, roundCurrency(input.waiverAmount ?? 0)),
  );
  const subtotal = roundCurrency(baseAmount - discountAmount - waiverAmount);
  const taxRate = Math.max(0, input.taxRate ?? 0);
  const taxAmount = roundCurrency(subtotal * taxRate);
  const totalAmount = roundCurrency(subtotal + taxAmount);

  return {
    baseAmount,
    discountAmount,
    waiverAmount,
    subtotal,
    taxAmount,
    totalAmount,
    currency: input.currency ?? "USD",
  };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/**
 * Create or recalculate the APC record for a manuscript.
 * Returns the upserted apc row.
 */
export async function upsertApcForManuscript(
  supabase: SupabaseClient,
  manuscriptId: string,
  input: ApcCalculationInput & { status?: ApcStatus },
) {
  const calc = calculateApc(input);

  // Check if APC already exists for this manuscript
  const { data: existing } = await supabase
    .from("apcs")
    .select("id")
    .eq("manuscript_id", manuscriptId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("apcs")
      .update({
        base_amount: calc.baseAmount,
        discount_amount: calc.discountAmount,
        waiver_amount: calc.waiverAmount,
        tax_amount: calc.taxAmount,
        total_amount: calc.totalAmount,
        currency: calc.currency,
        status: input.status ?? (existing as { status?: ApcStatus }).status ?? "calculated",
        calculated_at: new Date().toISOString(),
      } as never)
      .eq("id", (existing as { id: string }).id)
      .select("*")
      .single();

    if (error) throw new Error(`Failed to update APC: ${error.message}`);
    return data;
  }

  const { data, error } = await supabase
    .from("apcs")
    .insert({
      manuscript_id: manuscriptId,
      base_amount: calc.baseAmount,
      discount_amount: calc.discountAmount,
      waiver_amount: calc.waiverAmount,
      tax_amount: calc.taxAmount,
      total_amount: calc.totalAmount,
      currency: calc.currency,
      status: input.status ?? "calculated",
      calculated_at: new Date().toISOString(),
    } as never)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create APC: ${error.message}`);
  return data;
}

/**
 * Issue an invoice for an APC (creates invoices row).
 */
export async function issueInvoice(
  supabase: SupabaseClient,
  apcId: string,
  params: {
    currency?: string;
    billingName?: string;
    billingEmail?: string;
    billingAddress?: string;
    dueInDays?: number;
  } = {},
) {
  // Fetch APC to get amount
  const { data: apc, error: apcError } = await supabase
    .from("apcs")
    .select("total_amount, currency")
    .eq("id", apcId)
    .single();

  if (apcError || !apc) throw new Error(`APC not found: ${apcId}`);

  const { total_amount, currency } = apc as { total_amount: number; currency: string };

  const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const now = new Date();
  const dueAt = new Date(now);
  dueAt.setDate(dueAt.getDate() + (params.dueInDays ?? 30));

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      apc_id: apcId,
      invoice_number: invoiceNumber,
      amount: total_amount,
      currency: params.currency ?? currency,
      status: "issued",
      issued_at: now.toISOString(),
      due_at: dueAt.toISOString(),
      billing_name: params.billingName ?? null,
      billing_email: params.billingEmail ?? null,
      billing_address: params.billingAddress ?? null,
    } as never)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to issue invoice: ${error.message}`);

  // Update APC status
  await supabase.from("apcs").update({ status: "invoice_issued" } as never).eq("id", apcId);

  return invoice;
}

/**
 * Determine the APC amount for a journal + article type.
 * Falls back to journal.default_apc.
 */
export function resolveBaseApc(
  journal: { default_apc: number; apc_enabled: boolean },
  _articleType?: string,
): number {
  if (!journal.apc_enabled) return 0;
  return journal.default_apc ?? 0;
}
