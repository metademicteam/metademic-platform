export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RoleLayout } from "@/components/layout/RoleLayout";
import type { UserRole } from "@/lib/rbac";
import { EDITOR_ROLES } from "@/lib/rbac";

export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Check journal_members for any active editor-like role
  const { data: memberships } = await supabase.from("journal_members").select("role, is_active, journal_id").eq("user_id", user.id).eq("is_active", true);

  const roles = (memberships ?? []).map((m) => (m as { role: string }).role) as UserRole[];
  const hasEditorRole = roles.some((r) => (EDITOR_ROLES as readonly string[]).includes(r));

  if (!hasEditorRole) {
    // Allow if no membership rows but user is super_admin via other means — fallback check already includes super_admin
    redirect("/auth/login?error=unauthorized_editor");
  }

  return (
    <RoleLayout
      roles={roles}
      breadcrumbs={[{ label: "Editor", href: "/editor/dashboard" }, { label: "Dashboard" }]}
    >
      {children}
    </RoleLayout>
  );
}
