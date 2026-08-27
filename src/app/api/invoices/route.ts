import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { enqueueEmailJob } from "@/lib/jobs";

const createSchema = z.object({
  apcId: z.string().uuid(),
  billingName: z.string().min(1).max(200).optional(),
  billingEmail: z.string().email().optional(),
  billingAddress: z.string().max(500).optional(),
  dueInDays: z.number().int().min(1).max(365).optional(),
  currency: z.string().length(3).optional(),
});

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "20", 10)));
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("invoices").select("*, apcs!inner(manuscript_id, manuscript_id)", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  if (status && status !== "all") query = query.eq("status", status as never);
  if (search) query = query.ilike("invoice_number", `%${search}%`);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with manuscript numbers best-effort
  const enriched = await Promise.all(
    (data ?? []).map(async (inv: Record<string, unknown>) => {
      try {
        const apcId = inv["apc_id"] as string;
        const { data: apc } = await supabase.from("apcs").select("manuscript_id").eq("id", apcId).single();
        const manuscriptId = (apc as { manuscript_id: string } | null)?.manuscript_id;
        let manuscript: Record<string, unknown> | null = null;
        if (manuscriptId) {
          const { data: m } = await supabase.from("manuscripts").select("manuscript_number, title, status, journal_id").eq("id", manuscriptId).single();
          manuscript = m as Record<string, unknown>;
        }
        return { ...inv, manuscript };
      } catch { return inv; }
    })
  );

  return NextResponse.json({ data: enriched, count: count ?? 0, page, pageSize });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const { apcId, billingName, billingEmail, billingAddress, dueInDays, currency } = parsed.data;

  // Check permissions: finance roles
  const { data: memberships } = await supabase.from("journal_members").select("role,is_active").eq("user_id", user.id).eq("is_active", true);
  const roles = (memberships ?? []).map((m: { role: string }) => m.role);
  const allowed = roles.some((r: string) => ["finance_admin","journal_admin","super_admin","journal_manager","managing_editor"].includes(r));
  if (!allowed) return NextResponse.json({ error: "Forbidden — finance permission required" }, { status: 403 });

  const { data: apc, error: apcErr } = await supabase.from("apcs").select("total_amount, currency, manuscript_id").eq("id", apcId).single();
  if (apcErr || !apc) return NextResponse.json({ error: "APC not found" }, { status: 404 });

  const a = apc as { total_amount: number; currency: string; manuscript_id: string };
  if (Number(a.total_amount) <= 0.01) {
    return NextResponse.json({ error: "APC total is zero — no invoice required (waiver/full discount)" }, { status: 400 });
  }

  const invoiceNumber = `INV-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
  const now = new Date();
  const dueAt = new Date(now);
  dueAt.setDate(dueAt.getDate() + (dueInDays ?? 30));

  const admin = createAdminClient();
  const { data: invoice, error } = await admin.from("invoices").insert({
    apc_id: apcId,
    invoice_number: invoiceNumber,
    amount: a.total_amount,
    currency: (currency ?? a.currency ?? "USD").toUpperCase(),
    status: "issued",
    issued_at: now.toISOString(),
    due_at: dueAt.toISOString(),
    billing_name: billingName ?? null,
    billing_email: billingEmail ?? null,
    billing_address: billingAddress ?? null,
  } as never).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("apcs").update({ status: "invoice_issued" } as never).eq("id", apcId);
  // manuscript -> apc_pending if not already
  await admin.from("manuscripts").update({ status: "apc_pending" } as never).eq("id", a.manuscript_id).in("status", ["accepted" as never]);
  // audit + notification
  const { data: manuscript } = await admin.from("manuscripts").select("journal_id, submitted_by, title").eq("id", a.manuscript_id).single();
  if (manuscript) {
    const m = manuscript as { journal_id: string; submitted_by: string | null; title: string };
    await admin.from("audit_logs").insert({ actor_id: user.id, journal_id: m.journal_id, manuscript_id: a.manuscript_id, action: "invoice.issued", entity_type: "invoice", entity_id: (invoice as { id: string }).id, new_data: { invoiceNumber, amount: a.total_amount } } as never);
    if (m.submitted_by) {
      await admin.from("notifications").insert({ user_id: m.submitted_by, journal_id: m.journal_id, manuscript_id: a.manuscript_id, type: "invoice_issued", title: "Invoice issued", message: `Invoice ${invoiceNumber} for "${m.title}" has been issued.`, action_url: `/author/submissions/${a.manuscript_id}` } as never);
      // Real email via Resend job — resolve the author's actual email
      const { data: profile } = await admin.from("profiles").select("email, first_name, last_name").eq("id", m.submitted_by).maybeSingle();
      const p = profile as { email: string | null; first_name: string | null; last_name: string | null } | null;
      const recipientEmail = p?.email ?? billingEmail;
      if (recipientEmail) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
        await enqueueEmailJob(admin as never, {
          templateName: "invoice_issued",
          recipientEmail,
          recipientUserId: m.submitted_by,
          manuscriptId: a.manuscript_id,
          context: { recipientName: [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Author", journalName: (m as { journal_name?: string }).journal_name ?? "", manuscriptTitle: m.title, manuscriptNumber: (m as { manuscript_number?: string }).manuscript_number ?? "", amount: String(a.total_amount), currency: a.currency, invoiceNumber, actionUrl: `${appUrl}/finance/invoices/${(invoice as { id: string }).id}` },
        });
        await admin.from("email_logs").insert({ user_id: m.submitted_by, manuscript_id: a.manuscript_id, recipient_email: recipientEmail, template_name: "invoice_issued", subject: `Invoice ${invoiceNumber} — Metademic`, status: "queued", metadata: { invoice_id: (invoice as { id: string }).id } } as never);
      }
    }
    await admin.from("system_jobs").insert({ job_type: "invoice_issued", entity_type: "invoice", entity_id: (invoice as { id: string }).id, status: "completed", payload: { invoice_number: invoiceNumber } } as never);
  }

  return NextResponse.json({ data: invoice }, { status: 201 });
}
