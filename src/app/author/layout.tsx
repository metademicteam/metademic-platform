"use client";

import * as React from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { usePathname } from "next/navigation";

function breadcrumbItems(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  // Build breadcrumbs for author section
  const items: { label: string; href?: string }[] = [];
  if (segments[0] === "author") {
    if (segments[1] === "dashboard") {
      items.push({ label: "Author", href: "/author/dashboard" }, { label: "Dashboard" });
    } else if (segments[1] === "submissions") {
      items.push({ label: "Author", href: "/author/dashboard" }, { label: "Submissions", href: "/author/submissions" });
      if (segments[2] === "new") items.push({ label: "New Submission" });
      else if (segments[2]) {
        if (segments[3] === "revision") items.push({ label: segments[2], href: `/author/submissions/${segments[2]}` }, { label: "Revision" });
        else items.push({ label: segments[2] });
      }
    } else {
      items.push({ label: "Author" });
    }
  }
  return items;
}

export default function AuthorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const crumbs = breadcrumbItems(pathname ?? "");

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-muted/20">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
        <div className="flex flex-1 flex-col min-w-0">
          <TopNav onMenuClick={() => setMobileOpen(true)} />
          <div className="border-b bg-background px-4 sm:px-6 lg:px-8 py-3">
            <Breadcrumbs items={crumbs} />
          </div>
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
