export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { InvitationCard } from "@/components/reviewer/InvitationCard";

export default async function ReviewerInvitationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const admin = createAdminClient();
  const { data: profile } = await admin.from("reviewer_profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile) {
    return (
      <div className="p-6 max-w-[960px] mx-auto">
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">No reviewer profile.</CardContent>
        </Card>
      </div>
    );
  }
  const reviewerId = (profile as { id: string }).id;

  const { data: invitations } = await admin
    .from("reviewer_invitations")
    .select("id, status, invited_at, expires_at, review_rounds!inner(manuscript_id, manuscripts!inner(id, title, abstract, keywords, journal_id, journals(name)))")
    .eq("reviewer_id", reviewerId)
    .order("invited_at", { ascending: false });

  // Also fetch deadlines from assignments
  const assignmentMap: Record<string, string | null> = {};
  if (invitations && invitations.length) {
    const invIds = invitations.map((i) => (i as { id: string }).id);
    const { data: assignments } = await admin.from("review_assignments").select("invitation_id, deadline_at").in("invitation_id", invIds);
    for (const a of (assignments ?? []) as Array<{ invitation_id: string | null; deadline_at: string | null }>) {
      if (a.invitation_id) assignmentMap[a.invitation_id] = a.deadline_at;
    }
  }

  const list = (invitations ?? []) as unknown as Array<{
    id: string;
    status: string;
    invited_at: string;
    expires_at: string | null;
    review_rounds: { manuscript_id: string; manuscripts: { id: string; title: string; abstract: string | null; keywords: string[]; journal_id: string; journals: { name: string } | null } };
  }>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[960px] mx-auto w-full">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invitations</h1>
        <p className="text-sm text-muted-foreground mt-1">Accept or decline review invitations. Confirmation of COI and confidentiality is required.</p>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="font-medium">No invitations</p>
            <p className="text-sm text-muted-foreground mt-1">You will be notified when invited to review.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {list.map((inv) => (
            <InvitationCard
              key={inv.id}
              invitation={{
                id: inv.id,
                manuscriptTitle: inv.review_rounds.manuscripts.title,
                manuscriptAbstract: inv.review_rounds.manuscripts.abstract,
                keywords: inv.review_rounds.manuscripts.keywords ?? [],
                deadlineAt: assignmentMap[inv.id] ?? inv.expires_at,
                invitedAt: inv.invited_at,
                status: inv.status,
                journalName: inv.review_rounds.manuscripts.journals?.name ?? null,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
