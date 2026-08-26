"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Send,
  Star,
  Users,
  ClipboardList,
  Hammer,
  Wallet,
  Settings,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  Layers,
  Shield,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/browser";
import { getPrimaryDashboard, type UserRole } from "@/lib/rbac";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles?: UserRole[];
  badge?: string;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Work",
    items: [
      { label: "Dashboard", href: "/author/dashboard", icon: LayoutDashboard, roles: ["author"] },
      { label: "My Submissions", href: "/author/submissions", icon: FileText, roles: ["author"] },
      { label: "Submit Manuscript", href: "/author/submissions/new", icon: Send, roles: ["author"] },
    ],
  },
  {
    title: "Review",
    items: [
      { label: "Reviewer Dashboard", href: "/reviewer/dashboard", icon: Star, roles: ["reviewer"] },
      { label: "Invitations", href: "/reviewer/invitations", icon: FileCheck, roles: ["reviewer"] },
      { label: "My Reviews", href: "/reviewer/reviews", icon: ClipboardList, roles: ["reviewer"] },
    ],
  },
  {
    title: "Editorial",
    items: [
      { label: "Editor Dashboard", href: "/editor/dashboard", icon: LayoutDashboard, roles: ["editor", "section_editor", "editor_in_chief", "managing_editor", "journal_manager", "journal_admin", "super_admin"] },
      { label: "Manuscripts", href: "/editor/submissions", icon: Layers, roles: ["editor", "section_editor", "editor_in_chief", "managing_editor", "journal_manager", "journal_admin", "super_admin"] },
      { label: "Reviewers", href: "/editor/reviewers", icon: Users, roles: ["editor", "section_editor", "editor_in_chief", "managing_editor", "journal_manager", "journal_admin", "super_admin"] },
      { label: "Decisions", href: "/editor/decisions", icon: FileCheck, roles: ["editor", "section_editor", "editor_in_chief", "managing_editor", "journal_manager", "journal_admin", "super_admin"] },
    ],
  },
  {
    title: "Production",
    items: [
      { label: "Production Queue", href: "/production/dashboard", icon: Hammer, roles: ["copyeditor", "production_editor", "managing_editor", "journal_manager", "journal_admin", "super_admin"] },
      { label: "Articles", href: "/production/articles", icon: BookOpen, roles: ["copyeditor", "production_editor", "managing_editor", "journal_manager", "journal_admin", "super_admin"] },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Finance", href: "/finance/dashboard", icon: Wallet, roles: ["finance_admin", "journal_manager", "journal_admin", "super_admin"] },
      { label: "Invoices", href: "/finance/invoices", icon: FileText, roles: ["finance_admin", "journal_manager", "journal_admin", "super_admin"] },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Admin", href: "/admin/dashboard", icon: Shield, roles: ["journal_admin", "journal_manager", "super_admin"] },
      { label: "Journals", href: "/admin/journals", icon: BookOpen, roles: ["journal_admin", "journal_manager", "super_admin"] },
      { label: "Users", href: "/admin/users", icon: Users, roles: ["journal_admin", "journal_manager", "super_admin"] },
      { label: "Audit Log", href: "/admin/audit", icon: Search, roles: ["journal_admin", "super_admin"] },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Profile", href: "/account/profile", icon: Settings },
      { label: "Security", href: "/account/security", icon: Shield },
    ],
  },
];

export function Sidebar({
  roles,
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
  roles?: UserRole[];
  collapsed?: boolean;
  onToggle?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();
  const [fetchedRoles, setFetchedRoles] = React.useState<UserRole[] | null>(null);

  // When the caller doesn't pass roles, load the user's active memberships
  // so every role sees exactly its own sections.
  React.useEffect(() => {
    if (roles && roles.length > 0) return;
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(async ({ data: { user } }) => {
        if (!user) return;
        const { data: memberships } = await supabase
          .from("journal_members")
          .select("role")
          .eq("user_id", user.id)
          .eq("is_active", true);
        const list = ((memberships ?? []) as { role: string }[]).map((m) => m.role) as UserRole[];
        // Any authenticated user is at least an author.
        setFetchedRoles(list.length ? list : ["author"]);
      })
      .catch(() => setFetchedRoles(["author"]));
  }, [roles]);

  const resolvedRoles = roles && roles.length > 0 ? roles : fetchedRoles;

  function isVisible(item: NavItem) {
    if (!item.roles) return true;
    if (!resolvedRoles || resolvedRoles.length === 0) return false;
    return item.roles.some((r) => resolvedRoles.includes(r));
  }

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(href + "/");
  }

  // Brand links to the user's primary dashboard — the logged-in homepage.
  const brandHref =
    resolvedRoles && resolvedRoles.length > 0
      ? getPrimaryDashboard(
          resolvedRoles.map((role) => ({ journalId: "brand", role, isActive: true }))
        )
      : "/author/dashboard";

  const content = (
    <div className={cn("flex h-full flex-col bg-white border-r border-[#e2e8f0]", collapsed ? "w-[64px]" : "w-[252px]")}>
      {/* Brand — links to the role dashboard (homepage for the logged-in area) */}
      <div className="flex h-[56px] items-center gap-2 border-b border-[#e2e8f0] bg-white px-3">
        <Link
          href={brandHref}
          onClick={onMobileClose}
          aria-label="Metademic — go to dashboard"
          title="Metademic — go to dashboard"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-[8px] px-1 -mx-1 py-1 transition-colors hover:bg-[#f8fafc]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#1e4ed8] text-white shadow-[0_1px_2px_rgba(30,78,216,0.18)] shrink-0">
            <BookOpen className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-none">
              <span className="block text-[13px] font-semibold tracking-tight text-[#0f172a]">Metademic</span>
              <span className="mt-[3px] block text-[9.5px] font-medium uppercase tracking-[0.12em] text-[#94a3b8]">Research system</span>
            </div>
          )}
        </Link>
        {onToggle && (
          <Button variant="ghost" size="icon" className="ml-auto h-7 w-7 shrink-0 text-[#64748b] hover:text-[#0f172a] hover:bg-[#f8fafc]" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-5">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(isVisible);
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.title}>
              {!collapsed && (
                <div className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-[#94a3b8]">{group.title}</div>
              )}
              <ul className="space-y-0.5">
                {visibleItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href + item.label}>
                      <Link
                        href={item.href}
                        onClick={onMobileClose}
                        className={cn(
                          "flex items-center gap-3 rounded-[8px] px-2.5 py-[7px] text-[12.5px] font-medium transition-colors border",
                          active
                            ? "bg-[#eff6ff] text-[#1e4ed8] border-[#dbeafe] shadow-[0_1px_2px_rgba(30,78,216,0.06)]"
                            : "bg-transparent text-[#475569] border-transparent hover:bg-[#f8fafc] hover:text-[#0f172a] hover:border-[#f1f5f9]",
                          collapsed && "justify-center px-2"
                        )}
                        title={collapsed ? item.label : undefined}
                      >
                        <item.icon className={cn("h-[15px] w-[15px] shrink-0", active ? "text-[#1e4ed8]" : "text-[#94a3b8]")} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="border-t border-[#e2e8f0] p-3">
          <div className="rounded-[12px] border border-[#e2e8f0] bg-[#f8fafc] p-3">
            <p className="text-[11px] font-semibold text-[#0f172a]">Need help?</p>
            <p className="text-[11px] leading-4 text-[#64748b] mt-0.5">Visit the help center or contact support for editorial assistance.</p>
            <Link href="/help" className="mt-2 inline-flex text-[11px] font-medium text-[#1e4ed8] hover:text-[#1e40af] hover:underline underline-offset-2">
              Help center →
            </Link>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:flex shrink-0">{content}</aside>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-[#0f172a]/35 backdrop-blur-[2px]" onClick={onMobileClose} />
          <div className="absolute left-0 top-0 h-full shadow-2xl">{content}</div>
        </div>
      )}
    </>
  );
}
