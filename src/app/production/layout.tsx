export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RoleLayout } from "@/components/layout/RoleLayout";
import type { UserRole } from "@/lib/rbac";
import { PRODUCTION_ROLES } from "@/lib/rbac";

export default async function ProductionLayout({ children }: { children: React.ReactNode }) {
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
  const hasProd = roles.some((r) => (PRODUCTION_ROLES as readonly string[]).includes(r));

  if (!hasProd) {
    redirect("/auth/login?error=unauthorized_production");
  }

  return (
    <RoleLayout
      roles={roles}
      breadcrumbs={[{ label: "Production", href: "/production/dashboard" }, { label: "Dashboard" }]}
    >
      {children}
    </RoleLayout>
  );
}
