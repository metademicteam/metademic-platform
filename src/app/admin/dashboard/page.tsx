export const dynamic = "force-dynamic";

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { BookOpen, Users, FileText, Wallet, Cog, ScrollText, BarChart3, Shield, Activity, Download } from "lucide-react";

const ETIS_CARD = "rounded-[12px] border border-[#e2e8f0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]";
const ETIS_LABEL = "text-[10px] font-semibold tracking-[0.14em] uppercase text-[#94a3b8]";

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [{ data: journals, count: journalCount }, { data: manuscripts, count: manuscriptCount }, { data: payments }, { data: jobs }, { data: audits }, { data: members }] = await Promise.all([
    supabase.from("journals").select("id, name, slug, status, doi_prefix", { count: "exact" }).limit(10),
    supabase.from("manuscripts").select("id", { count: "exact", head: true }),
    supabase.from("payments").select("amount, status").limit(100),
    supabase.from("system_jobs").select("id, job_type, status, created_at").order("created_at", { ascending: false }).limit(10),
    supabase.from("audit_logs").select("id, action, created_at, actor_id").order("created_at", { ascending: false }).limit(10),
    supabase.from("journal_members").select("id, role, is_active"),
  ]);

  const { count: userCount } = await supabase.from("profiles").select("id", { count: "exact", head: true });
  const editorialCount = (members ?? []).filter((m: { is_active: boolean; role: string }) => m.is_active && ["editor","section_editor","editor_in_chief","managing_editor","journal_manager","journal_admin","super_admin","copyeditor","production_editor"].includes(m.role)).length;
  const paidRevenue = (payments ?? []).filter((p: { status: string }) => p.status === "succeeded" || p.status === "paid").reduce((s: number, p: { amount: number }) => s + Number(p.amount ?? 0), 0);

  const submissions = manuscriptCount ?? 0;
  const cards = [
    { label: "Journals", value: String(journalCount ?? 0), icon: BookOpen, href: "/admin/journals", sub: "active titles" },
    { label: "Users", value: String(userCount ?? 0), icon: Users, href: "/admin/users", sub: "registered" },
    { label: "Editorial Members", value: String(editorialCount), icon: ScrollText, href: "/admin/users", sub: "active roles" },
    { label: "Submissions", value: String(submissions), icon: FileText, href: "/editor/submissions", sub: "total mss" },
    { label: "Payments (revenue)", value: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(paidRevenue), icon: Wallet, href: "/finance/dashboard", sub: "succeeded" },
    { label: "System Jobs", value: String((jobs ?? []).length), icon: Cog, href: "/admin/audit", sub: "recent 10" },
    { label: "Audit Logs", value: String((audits ?? []).length), icon: BarChart3, href: "/admin/audit", sub: "recent 10" },
  ];

  return (
    <div className="min-h-screen bg-[#f0f3f8]">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className={ETIS_LABEL}>Administration</p>
            <h1 className="text-[22px] font-extrabold tracking-tight text-[#0f172a] leading-none mt-1 flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#1e4ed8]" /> Admin Overview
            </h1>
            <p className="text-[12px] leading-5 text-[#64748b] mt-1.5">Journals · Users · Editorial members · Submissions · Payments · System Jobs · Audit logs · Analytics — ETIS registry.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" className="h-8 rounded-[8px] border-[#e2e8f0] bg-white text-[12px] font-medium">
              <Link href="/admin/journals">Manage journals</Link>
            </Button>
            <Button asChild className="h-8 rounded-[8px] bg-[#1e4ed8] text-[12px] font-semibold shadow-[0_1px_2px_rgba(30,78,216,0.18)] hover:bg-[#1e40af]">
              <Link href="/admin/users">Users</Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {cards.map((c) => (
            <Link key={c.label} href={c.href} className={`${ETIS_CARD} p-3.5 flex flex-col min-h-[88px] hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)] transition-shadow`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#94a3b8] leading-tight pr-1">{c.label}</p>
                <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#f8fafc] border border-[#f1f5f9] shrink-0">
                  <c.icon className="h-3.5 w-3.5 text-[#94a3b8]" />
                </span>
              </div>
              <p className="text-[18px] font-bold leading-none tracking-tight text-[#0f172a] mt-2 truncate">{c.value}</p>
              <p className="text-[10px] font-medium text-[#94a3b8] mt-1">{c.sub}</p>
            </Link>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className={`${ETIS_CARD} overflow-hidden`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
              <h2 className="text-[13px] font-semibold text-[#0f172a]">Journals</h2>
              <span className="rounded bg-white border border-[#e2e8f0] px-1.5 py-0.5 text-[10px] font-mono text-[#475569]">{journalCount ?? 0} total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">Publication</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">Slug</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">Classification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9] bg-white">
                  {(journals ?? []).map((j: { id: string; name: string; slug: string; status: string }) => (
                    <tr key={j.id} className="hover:bg-[#f8fafc]/70">
                      <td className="px-3 py-2.5 text-[12px] font-medium text-[#0f172a]">{j.name}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-[#64748b]">{j.slug}</td>
                      <td className="px-3 py-2.5"><span className="inline-flex rounded-full border border-[#e2e8f0] bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-[#475569]">{j.status}</span></td>
                    </tr>
                  ))}
                  {(journals ?? []).length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-10 text-center text-[12px] text-[#64748b]">No journals. Create via Admin → Journals.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`${ETIS_CARD} overflow-hidden`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
              <h2 className="text-[13px] font-semibold text-[#0f172a]">System Jobs (recent)</h2>
              <span className="rounded bg-white border border-[#e2e8f0] px-1.5 py-0.5 text-[10px] font-mono text-[#475569]">{(jobs ?? []).length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">Job</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">Status</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9] bg-white">
                  {(jobs ?? []).map((j: { id: string; job_type: string; status: string; created_at: string }) => (
                    <tr key={j.id} className="hover:bg-[#f8fafc]/70">
                      <td className="px-3 py-2.5 font-mono text-[11px] text-[#334155]">{j.job_type}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] ${j.status === "completed" ? "bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]" : j.status === "failed" ? "bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]" : "bg-[#f1f5f9] text-[#475569] border-[#e2e8f0]"}`}>{j.status}</span>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-[#64748b]">{new Date(j.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {(jobs ?? []).length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-10 text-center text-[12px] text-[#64748b]">No system jobs yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className={`${ETIS_CARD} overflow-hidden`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
            <h2 className="text-[13px] font-semibold text-[#0f172a] flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-[#64748b]" /> Recent Audit Logs</h2>
            <Button variant="outline" size="xs" className="h-6 rounded-[6px] border-[#e2e8f0] bg-white text-[11px]"><Download className="h-3 w-3 mr-1" /> Export</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                  <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">Action</th>
                  <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">Actor</th>
                  <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">Year</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9] bg-white">
                {(audits ?? []).map((a: { id: string; action: string; actor_id: string | null; created_at: string }) => (
                  <tr key={a.id} className="hover:bg-[#f8fafc]/70">
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[#334155]">{a.action}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[#64748b]">{a.actor_id?.slice(0, 8) ?? "system"}</td>
                    <td className="px-3 py-2.5 text-[11px] text-[#64748b]">{new Date(a.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {(audits ?? []).length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-10 text-center text-[12px] text-[#64748b]">No audit logs.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`${ETIS_CARD} p-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-[#0f172a]">Analytics (overview)</h2>
            <span className="text-[11px] text-[#94a3b8]">ETIS-compatible · Crossref-ready</span>
          </div>
          <p className="text-[11px] text-[#64748b] mt-1">Counts + revenue — use SQL views/materialized views in production for performance.</p>
          <div className="grid sm:grid-cols-3 gap-3 mt-4">
            <div className="rounded-[10px] border border-[#e2e8f0] bg-[#f8fafc] p-4">
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#94a3b8]">Submissions</p>
              <p className="text-[20px] font-bold leading-none text-[#0f172a] mt-1">{submissions}</p>
              <p className="text-[11px] text-[#64748b] mt-1">Total manuscripts</p>
            </div>
            <div className="rounded-[10px] border border-[#e2e8f0] bg-[#f8fafc] p-4">
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#94a3b8]">Revenue</p>
              <p className="text-[20px] font-bold leading-none text-[#0f172a] mt-1">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(paidRevenue)}</p>
              <p className="text-[11px] text-[#64748b] mt-1">From succeeded payments</p>
            </div>
            <div className="rounded-[10px] border border-[#e2e8f0] bg-[#f8fafc] p-4">
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#94a3b8]">Editorial Capacity</p>
              <p className="text-[20px] font-bold leading-none text-[#0f172a] mt-1">{editorialCount}</p>
              <p className="text-[11px] text-[#64748b] mt-1">Active editorial roles</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
