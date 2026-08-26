export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RoleLayout } from "@/components/layout/RoleLayout";
import type { UserRole } from "@/lib/rbac";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: memberships } = await supabase
    .from("journal_members")
    .select("role, is_active, journal_id")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const roles = (memberships ?? []).map((m) => (m as { role: string }).role) as UserRole[];
  const isAdmin = roles.some((r) => ["super_admin", "journal_admin", "journal_manager"].includes(r));

  if (!isAdmin) {
    redirect("/auth/login?error=unauthorized_admin");
  }

  return (
    <RoleLayout
      roles={roles}
      breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Dashboard" }]}
    >
      {children}
    </RoleLayout>
  );
}
