export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MANUSCRIPT_STATUS_LABELS, type ManuscriptStatus } from "@/lib/constants";
import { FileText, Download } from "lucide-react";

const ETIS_CARD = "rounded-[12px] border border-[#e2e8f0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]";

function StatusBadge({ status }: { status: string }) {
  const label = MANUSCRIPT_STATUS_LABELS[status as ManuscriptStatus] ?? status;
  const map: Record<string, string> = {
    technical_check: "bg-[#f1f5f9] text-[#475569] border-[#e2e8f0]",
    editorial_screening: "bg-[#eff6ff] text-[#1e40af] border-[#dbeafe]",
    reviewer_invitation: "bg-[#fef9c3] text-[#854d0e] border-[#fde68a]",
    under_review: "bg-[#eff6ff] text-[#1e40af] border-[#dbeafe]",
    reviews_complete: "bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]",
    decision_pending: "bg-[#fef9c3] text-[#a16207] border-[#fde68a]",
    minor_revision: "bg-[#fef9c3] text-[#a16207] border-[#fde68a]",
    major_revision: "bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]",
    accepted: "bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]",
  };
  const cls = map[status] ?? "bg-[#f1f5f9] text-[#475569] border-[#e2e8f0]";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] ${cls}`}>{label}</span>;
}

export default async function EditorDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: memberships } = await supabase.from("journal_members").select("journal_id, role, is_active").eq("user_id", user.id).eq("is_active", true);
  const editorJournalIds = (memberships ?? [])
    .filter((m) => ["editor", "managing_editor", "editor_in_chief", "section_editor", "journal_manager", "journal_admin", "super_admin"].includes((m as { role: string }).role))
    .map((m) => (m as { journal_id: string }).journal_id);

  let journalIds = editorJournalIds;
  if (journalIds.length === 0) {
    const isSuper = (memberships ?? []).some((m) => (m as { role: string }).role === "super_admin");
    if (isSuper) {
      const { data: journals } = await supabase.from("journals").select("id");
      journalIds = (journals ?? []).map((j) => (j as { id: string }).id);
    }
  }

  if (journalIds.length === 0) {
    return (
      <div className="min-h-screen bg-[#f0f3f8]">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#0f172a]">Editor Dashboard</h1>
          <div className={`${ETIS_CARD} mt-6 p-10 text-center`}>
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f8fafc] border border-dashed border-[#e2e8f0]">
              <FileText className="h-5 w-5 text-[#94a3b8]" />
            </div>
            <p className="text-[13px] font-medium text-[#0f172a] mt-3">No journal assignment</p>
            <p className="text-[12px] text-[#64748b] mt-1">You are not assigned as editor to any journal yet. Contact a journal administrator.</p>
          </div>
        </div>
      </div>
    );
  }

  const { data: manuscripts } = await supabase
    .from("manuscripts")
    .select("id, manuscript_number, title, status, assigned_editor_id, journal_id, created_at, updated_at, journals!inner(name, slug)")
    .in("journal_id", journalIds)
    .order("updated_at", { ascending: false })
    .limit(100);

  const list = (manuscripts ?? []) as unknown as Array<{
    id: string;
    manuscript_number: string;
    title: string;
    status: string;
    assigned_editor_id: string | null;
    journal_id: string;
    updated_at: string;
    journals: { name: string; slug: string } | null;
  }>;

  const stats = {
    unassigned: list.filter((m) => !m.assigned_editor_id).length,
    screening: list.filter((m) => ["technical_check", "editorial_screening"].includes(m.status)).length,
    reviewerInvitations: list.filter((m) => m.status === "reviewer_invitation").length,
    underReview: list.filter((m) => ["under_review", "re_review"].includes(m.status)).length,
    decisionPending: list.filter((m) => ["reviews_complete", "decision_pending"].includes(m.status)).length,
    revisions: list.filter((m) => ["minor_revision", "major_revision", "revision_submitted"].includes(m.status)).length,
    accepted: list.filter((m) => m.status === "accepted").length,
  };

  const cards = [
    { label: "Unassigned", value: stats.unassigned, href: "/editor/submissions?filter=unassigned", sub: "needs editor" },
    { label: "Screening", value: stats.screening, href: "/editor/submissions?status=editorial_screening", sub: "editorial check" },
    { label: "Reviewer Invitations", value: stats.reviewerInvitations, href: "/editor/submissions?status=reviewer_invitation", sub: "awaiting response" },
    { label: "Under Review", value: stats.underReview, href: "/editor/submissions?status=under_review", sub: "peer review" },
    { label: "Decision Pending", value: stats.decisionPending, href: "/editor/submissions?status=decision_pending", sub: "reviews in" },
    { label: "Revisions", value: stats.revisions, href: "/editor/submissions?status=minor_revision", sub: "author revision" },
    { label: "Accepted", value: stats.accepted, href: "/editor/submissions?status=accepted", sub: "ready for prod." },
  ];

  return (
    <div className="min-h-screen bg-[#f0f3f8]">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-extrabold tracking-tight text-[#0f172a] leading-none">Editor Dashboard</h1>
            <p className="text-[12px] leading-5 text-[#64748b] mt-1.5">Manuscript pipeline across your assigned journals.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" className="h-8 rounded-[8px] border-[#e2e8f0] bg-white text-[12px] font-medium">
              <Link href="/editor/submissions">All manuscripts</Link>
            </Button>
            <Button asChild className="h-8 rounded-[8px] bg-[#1e4ed8] text-[12px] font-semibold shadow-[0_1px_2px_rgba(30,78,216,0.18)] hover:bg-[#1e40af]">
              <Link href="/editor/reviewers">Reviewer database</Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {cards.map((c) => (
            <Link key={c.label} href={c.href} className={`${ETIS_CARD} p-3.5 flex flex-col min-h-[92px] hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)] transition-shadow group`}>
              <p className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-[#64748b] leading-tight pr-1">{c.label}</p>
              <p className="text-[24px] font-bold leading-none tracking-tight text-[#0f172a] mt-auto pt-2">{c.value}</p>
              <p className="text-[10.5px] font-medium text-[#94a3b8] mt-1 group-hover:text-[#1e4ed8]">{c.sub}</p>
            </Link>
          ))}
        </div>

        {/* Table — ETIS Publication/Autor/Year etc. header */}
        <div className={`${ETIS_CARD} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-[#0f172a]">Manuscripts for your journals</h2>
              <span className="rounded bg-white border border-[#e2e8f0] px-1.5 py-0.5 text-[10px] font-mono text-[#475569]">{list.length} results</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="xs" className="h-6 rounded-[6px] border-[#e2e8f0] bg-white text-[11px]"><Download className="h-3 w-3 mr-1" /> Export</Button>
            </div>
          </div>

          {list.length === 0 ? (
            <div className="p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f8fafc] border border-dashed border-[#e2e8f0]">
                <FileText className="h-6 w-6 text-[#94a3b8]" />
              </div>
              <p className="font-semibold text-[13px] text-[#0f172a] mt-3">No manuscripts</p>
              <p className="text-[12px] text-[#64748b] mt-1">Submissions assigned to your journals will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]"><input type="checkbox" className="h-3 w-3 rounded border-[#cbd5e1] accent-[#1e4ed8]" /></th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Publication</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Author</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Year</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Edition title</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Classification</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Institution</th>
                    <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b] whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9] bg-white">
                  {list.map((m) => (
                    <tr key={m.id} className="hover:bg-[#f8fafc]/70">
                      <td className="px-3 py-2.5"><input type="checkbox" className="h-3 w-3 rounded border-[#cbd5e1] accent-[#1e4ed8]" /></td>
                      <td className="px-3 py-2.5 max-w-[260px]">
                        <Link href={`/editor/manuscripts/${m.id}`} className="text-[12px] font-medium leading-tight text-[#1e4ed8] hover:text-[#1e40af] hover:underline line-clamp-2">
                          {m.title}
                        </Link>
                        <p className="text-[11px] font-mono text-[#94a3b8] mt-0.5">{m.manuscript_number}</p>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-[#475569] whitespace-nowrap">—</td>
                      <td className="px-3 py-2.5 text-[11px] text-[#64748b]">{new Date(m.updated_at).getFullYear()}</td>
                      <td className="px-3 py-2.5 text-[11px] text-[#475569] max-w-[160px] truncate">{m.journals?.name ?? "—"}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={m.status} /></td>
                      <td className="px-3 py-2.5 text-[11px] text-[#64748b] whitespace-nowrap">—</td>
                      <td className="px-3 py-2.5">
                        <Button asChild variant="outline" size="xs" className="h-6 rounded-[6px] border-[#e2e8f0] bg-white text-[11px]">
                          <Link href={`/editor/manuscripts/${m.id}`}>View</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f1f5f9] bg-[#f8fafc]/60 px-4 py-2.5 text-[11px]">
            <span className="text-[#64748b]">Showing {Math.min(list.length, 100)} of {list.length} · Select all</span>
            <div className="flex items-center gap-1">
              <button className="h-6 w-6 rounded border border-[#e2e8f0] bg-white text-[#94a3b8]">‹</button>
              <button className="h-6 w-6 rounded bg-[#1e4ed8] text-white text-[11px] font-semibold">1</button>
              <button className="h-6 w-6 rounded border border-[#e2e8f0] bg-white text-[#475569] text-[11px]">2</button>
              <button className="h-6 w-6 rounded border border-[#e2e8f0] bg-white text-[#475569]">›</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
