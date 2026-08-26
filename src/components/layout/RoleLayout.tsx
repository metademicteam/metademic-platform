"use client";

import * as React from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import type { UserRole } from "@/lib/rbac";

export function RoleLayout({
  roles,
  breadcrumbs,
  children,
}: {
  roles?: UserRole[];
  breadcrumbs?: { label: string; href?: string }[];
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen bg-muted/20">
      <Sidebar
        roles={roles}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex flex-1 flex-col min-w-0">
        <TopNav onMenuClick={() => setMobileOpen(true)} />
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="border-b bg-background px-4 sm:px-6 lg:px-8 py-3">
            <Breadcrumbs items={breadcrumbs} />
          </div>
        )}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
