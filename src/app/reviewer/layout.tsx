export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RoleLayout } from "@/components/layout/RoleLayout";
import type { UserRole } from "@/lib/rbac";

export default async function ReviewerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Reviewer access — check journal_members or reviewer_profiles existence
  // Be permissive: if reviewer_profiles row exists, grant access
  const [{ data: memberships }, { data: reviewerProfile }] = await Promise.all([
    supabase.from("journal_members").select("role, is_active").eq("user_id", user.id).eq("is_active", true),
    supabase.from("reviewer_profiles").select("id").eq("user_id", user.id).maybeSingle(),
  ]);

  const roles = (memberships ?? []).map((m) => (m as { role: string }).role) as UserRole[];
  const isReviewer = roles.includes("reviewer") || !!reviewerProfile || roles.some((r) => ["editor", "section_editor", "editor_in_chief", "managing_editor", "journal_manager", "journal_admin", "super_admin"].includes(r));

  if (!isReviewer) {
    redirect("/auth/login?error=unauthorized_reviewer");
  }

  const sidebarRoles: UserRole[] = roles.length ? roles : ["reviewer"];

  return (
    <RoleLayout
      roles={sidebarRoles}
      breadcrumbs={[{ label: "Reviewer", href: "/reviewer/dashboard" }, { label: "Dashboard" }]}
    >
      {children}
    </RoleLayout>
  );
}
