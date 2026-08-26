export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Mail, CheckCircle, AlertTriangle, FileText, Inbox, Timer } from "lucide-react";

const ETIS_CARD = "rounded-[12px] border border-[#e2e8f0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]";
const ETIS_LABEL = "text-[10px] font-semibold tracking-[0.14em] uppercase text-[#94a3b8]";

export default async function ReviewerDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const admin = createAdminClient();
  const { data: profile } = await admin.from("reviewer_profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile) {
    return (
      <div className="min-h-screen bg-[#f0f3f8]">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-8">
          <div className={`${ETIS_CARD} p-10 text-center`}>
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f8fafc] border border-dashed border-[#e2e8f0]">
              <Inbox className="h-5 w-5 text-[#94a3b8]" />
            </div>
            <p className="text-[13px] font-semibold text-[#0f172a] mt-3">No reviewer profile</p>
            <p className="text-[12px] text-[#64748b] mt-1">No reviewer profile found. Contact an editor to be invited.</p>
          </div>
        </div>
      </div>
    );
  }
  const reviewerId = (profile as { id: string }).id;

  const { data: invitations } = await admin
    .from("reviewer_invitations")
    .select("id, status, invited_at, expires_at, review_rounds!inner(manuscript_id, manuscripts!inner(title, manuscript_number))")
    .eq("reviewer_id", reviewerId)
    .order("invited_at", { ascending: false });

  const { data: assignments } = await admin
    .from("review_assignments")
    .select("id, status, deadline_at, invited_at, completed_at, review_rounds!inner(manuscript_id, manuscripts!inner(title, manuscript_number, status))")
    .eq("reviewer_id", reviewerId)
    .order("deadline_at", { ascending: true });

  const invList = (invitations ?? []) as unknown as Array<{
    id: string;
    status: string;
    invited_at: string;
    expires_at: string | null;
    review_rounds: { manuscript_id: string; manuscripts: { title: string; manuscript_number: string } };
  }>;
  const assignList = (assignments ?? []) as unknown as Array<{
    id: string;
    status: string;
    deadline_at: string | null;
    completed_at: string | null;
    review_rounds: { manuscript_id: string; manuscripts: { title: string; manuscript_number: string; status: string } };
  }>;

  const pendingInvitations = invList.filter((i) => i.status === "invited");
  const activeReviews = assignList.filter((a) => ["accepted", "reviewing", "invited"].includes(a.status));
  const completed = assignList.filter((a) => a.status === "completed");
  const overdue = assignList.filter((a) => {
    if (a.status === "completed" || !a.deadline_at) return false;
    return new Date(a.deadline_at) < new Date();
  });

  const stats = [
    { label: "Pending Invitations", value: pendingInvitations.length, icon: Mail, sub: "awaiting response", href: "/reviewer/invitations" },
    { label: "Active Reviews", value: activeReviews.length, icon: Clock, sub: "in progress", href: "/reviewer/reviews" },
    { label: "Completed", value: completed.length, icon: CheckCircle, sub: "submitted", href: "/reviewer/reviews" },
    { label: "Overdue", value: overdue.length, icon: AlertTriangle, sub: "past deadline", href: "/reviewer/reviews" },
  ];

  return (
    <div className="min-h-screen bg-[#f0f3f8]">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className={ETIS_LABEL}>Reviewer workspace</p>
            <h1 className="text-[22px] font-extrabold tracking-tight text-[#0f172a] leading-none mt-1">Reviewer Dashboard</h1>
            <p className="text-[12px] leading-5 text-[#64748b] mt-1.5">Invitations, active reviews, deadlines, and history — ETIS registry.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" className="h-8 rounded-[8px] border-[#e2e8f0] bg-white text-[12px] font-medium">
              <Link href="/reviewer/invitations">Invitations</Link>
            </Button>
            <Button asChild className="h-8 rounded-[8px] bg-[#1e4ed8] text-[12px] font-semibold shadow-[0_1px_2px_rgba(30,78,216,0.18)] hover:bg-[#1e40af]">
              <Link href="/reviewer/reviews">My Reviews</Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className={`${ETIS_CARD} p-3.5 flex flex-col min-h-[92px] hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)] transition-shadow`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#94a3b8] leading-tight pr-1">{s.label}</p>
                <span className={`flex h-6 w-6 items-center justify-center rounded-[6px] border shrink-0 ${s.label === "Overdue" && s.value > 0 ? "bg-[#fef2f2] border-[#fecaca]" : "bg-[#f8fafc] border-[#f1f5f9]"}`}>
                  <s.icon className={`h-3.5 w-3.5 ${s.label === "Overdue" && s.value > 0 ? "text-[#dc2626]" : "text-[#94a3b8]"}`} />
                </span>
              </div>
              <p className={`text-[22px] font-bold leading-none tracking-tight mt-2 ${s.label === "Overdue" && s.value > 0 ? "text-[#dc2626]" : "text-[#0f172a]"}`}>{s.value}</p>
              <p className="text-[10px] font-medium text-[#94a3b8] mt-1">{s.sub}</p>
            </Link>
          ))}
        </div>

        {overdue.length > 0 && (
          <div className="rounded-[12px] border border-[#fde68a] bg-[#fefce8] px-4 py-3 flex items-start gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#facc15] border border-[#eab308]/30 shrink-0">
              <AlertTriangle className="h-3.5 w-3.5 text-[#422006]" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-[#422006]">Deadline warnings — {overdue.length} overdue</p>
              <ul className="mt-1 space-y-1">
                {overdue.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2 text-[11px]">
                    <span className="text-[#854d0e] truncate">{a.review_rounds.manuscripts.title}</span>
                    <span className="text-[#b91c1c] font-medium whitespace-nowrap">Due {a.deadline_at ? new Date(a.deadline_at).toLocaleDateString() : "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-4">
          <div className={`${ETIS_CARD} p-0 overflow-hidden flex flex-col`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-[#64748b]" />
                <h2 className="text-[13px] font-semibold text-[#0f172a]">Pending Invitations</h2>
              </div>
              <span className="rounded bg-white border border-[#e2e8f0] px-1.5 py-0.5 text-[10px] font-medium text-[#475569]">{pendingInvitations.length} awaiting</span>
            </div>
            <div className="p-3 flex-1">
              {pendingInvitations.length === 0 ? (
                <div className="rounded-[8px] border border-dashed border-[#e2e8f0] bg-[#f8fafc] py-8 text-center">
                  <Inbox className="h-5 w-5 mx-auto text-[#94a3b8] mb-1.5" />
                  <p className="text-[12px] text-[#64748b]">No pending invitations.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {pendingInvitations.slice(0, 5).map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-[#e2e8f0] bg-white px-3 py-2.5 hover:border-[#cbd5e1] transition-colors">
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium leading-tight text-[#0f172a] line-clamp-1">{i.review_rounds.manuscripts.title}</p>
                        <p className="text-[11px] text-[#94a3b8] font-mono">{i.review_rounds.manuscripts.manuscript_number} · Invited {new Date(i.invited_at).toLocaleDateString()}</p>
                      </div>
                      <Button asChild size="xs" className="h-7 rounded-[6px] bg-[#1e4ed8] text-[11px] font-medium shrink-0">
                        <Link href="/reviewer/invitations">Respond</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-[#f1f5f9] bg-[#f8fafc]/60 px-4 py-2.5 flex justify-between items-center">
              <span className="text-[11px] text-[#94a3b8]">ETIS · reviewer invitations</span>
              <Link href="/reviewer/invitations" className="text-[11px] font-medium text-[#1e4ed8] hover:underline">View all →</Link>
            </div>
          </div>

          <div className={`${ETIS_CARD} p-0 overflow-hidden flex flex-col`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
              <div className="flex items-center gap-2">
                <Timer className="h-3.5 w-3.5 text-[#64748b]" />
                <h2 className="text-[13px] font-semibold text-[#0f172a]">Active Reviews</h2>
              </div>
              <span className="rounded bg-white border border-[#e2e8f0] px-1.5 py-0.5 text-[10px] font-medium text-[#475569]">{activeReviews.length} in progress</span>
            </div>
            <div className="p-3 flex-1">
              {activeReviews.length === 0 ? (
                <div className="rounded-[8px] border border-dashed border-[#e2e8f0] bg-[#f8fafc] py-8 text-center">
                  <Clock className="h-5 w-5 mx-auto text-[#94a3b8] mb-1.5" />
                  <p className="text-[12px] text-[#64748b]">No active reviews.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeReviews.slice(0, 5).map((a) => {
                    const isOverdue = a.deadline_at ? new Date(a.deadline_at) < new Date() : false;
                    return (
                      <div key={a.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-[#e2e8f0] bg-white px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium leading-tight text-[#0f172a] line-clamp-1">{a.review_rounds.manuscripts.title}</p>
                          <p className="text-[11px] text-[#94a3b8]">
                            {a.review_rounds.manuscripts.manuscript_number} · Due {a.deadline_at ? new Date(a.deadline_at).toLocaleDateString() : "No deadline"}{" "}
                            {isOverdue && <span className="text-[#dc2626] font-semibold">— Overdue</span>}
                          </p>
                        </div>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] shrink-0 ${a.status === "accepted" ? "bg-[#eff6ff] text-[#1e40af] border-[#dbeafe]" : "bg-[#f1f5f9] text-[#475569] border-[#e2e8f0]"}`}>{a.status}</span>
                      </div>
                    );
                  })}
                  <Button asChild variant="outline" size="sm" className="w-full rounded-[8px] border-[#e2e8f0] bg-white text-[12px] font-medium">
                    <Link href="/reviewer/reviews">View all</Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`${ETIS_CARD} overflow-hidden`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
            <h2 className="text-[13px] font-semibold text-[#0f172a]">Recent Activity</h2>
            <span className="text-[11px] text-[#94a3b8]">{assignList.length} total assignments</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                  <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">Publication</th>
                  <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">Classification</th>
                  <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">Year</th>
                  <th className="h-8 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9] bg-white">
                {assignList.slice(0, 10).map((a) => (
                  <tr key={a.id} className="hover:bg-[#f8fafc]/70">
                    <td className="px-3 py-2.5 max-w-[360px]">
                      <p className="text-[12px] font-medium leading-tight text-[#0f172a] line-clamp-1">{a.review_rounds.manuscripts.title}</p>
                      <p className="text-[11px] font-mono text-[#94a3b8]">{a.review_rounds.manuscripts.manuscript_number}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] ${a.status === "completed" ? "bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]" : a.status === "overdue" ? "bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]" : "bg-[#f1f5f9] text-[#475569] border-[#e2e8f0]"}`}>{a.status}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-[#64748b]">{a.deadline_at ? new Date(a.deadline_at).toLocaleDateString() : "—"}</td>
                    <td className="px-3 py-2.5">
                      <Button asChild variant="outline" size="xs" className="h-6 rounded-[6px] border-[#e2e8f0] bg-white text-[11px]">
                        <Link href={`/reviewer/reviews/${a.id}`}>Open</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
                {assignList.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center">
                      <FileText className="h-5 w-5 mx-auto text-[#94a3b8] mb-2" />
                      <p className="text-[12px] text-[#64748b]">No reviews yet.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
