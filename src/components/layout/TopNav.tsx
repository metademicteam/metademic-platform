"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, LogOut, User, Settings, Menu, ChevronRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/browser";

function Breadcrumbs({ path }: { path: string }) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return <span className="text-[11px] font-medium text-[#94a3b8]">Dashboard</span>;
  return (
    <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1 text-[11px]">
      <Link href="/" className="text-[#94a3b8] hover:text-[#475569] inline-flex items-center gap-1">
        <Home className="h-3 w-3" /> Home
      </Link>
      {parts.slice(0, 3).map((seg, i) => {
        const href = "/" + parts.slice(0, i + 1).join("/");
        const label = seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const last = i === parts.length - 1 || i === 2;
        return (
          <span key={href} className="inline-flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-[#cbd5e1]" />
            {last ? (
              <span className="font-medium text-[#0f172a] truncate max-w-[140px]">{label}</span>
            ) : (
              <Link href={href} className="text-[#64748b] hover:text-[#1e4ed8] hover:underline underline-offset-2">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export function TopNav({ onMenuClick, unreadCount = 0 }: { onMenuClick?: () => void; unreadCount?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = React.useState<string | null>(null);
  const [displayName, setDisplayName] = React.useState<string | null>(null);

  React.useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      setEmail(user?.email ?? null);
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("display_name, first_name, last_name").eq("id", user.id).single();
        if (profile) setDisplayName((profile.display_name as string) || `${(profile.first_name as string) ?? ""} ${(profile.last_name as string) ?? ""}`.trim() || null);
      }
    });
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-[56px] items-center justify-between gap-4 border-b border-[#e2e8f0] bg-white px-3 sm:px-4">
      <div className="flex items-center gap-3 min-w-0">
        {onMenuClick && (
          <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8 text-[#475569]" onClick={onMenuClick} aria-label="Open sidebar">
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <Breadcrumbs path={pathname ?? ""} />
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" asChild className="relative h-8 w-8 text-[#475569] hover:bg-[#f8fafc]" aria-label="Notifications">
          <Link href="/account/notifications">
            <Bell className="h-[18px] w-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#1e4ed8] px-1 text-[11px] font-semibold text-white shadow">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        </Button>

        <div className="h-6 w-px bg-[#e2e8f0] mx-1 hidden sm:block" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 h-8 px-2 hover:bg-[#f8fafc] border border-transparent hover:border-[#e2e8f0]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#eff6ff] border border-[#dbeafe] text-[#1e4ed8] text-xs font-bold">
                {(displayName?.[0] ?? email?.[0] ?? "U").toUpperCase()}
              </span>
              <span className="hidden md:inline text-[12px] font-medium text-[#0f172a] truncate max-w-[160px]">{displayName || email || "Account"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-[12px] border-[#e2e8f0] bg-white text-[#0f172a] shadow-[0_8px_24px_rgba(16,24,40,0.12)]">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[#0f172a]">{displayName || "User"}</span>
                <span className="text-xs font-normal text-[#64748b] truncate">{email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#e2e8f0]" />
            <DropdownMenuItem asChild>
              <Link href="/account/profile"><User className="mr-2 h-4 w-4" /> Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/account/security"><Settings className="mr-2 h-4 w-4" /> Security</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/account/notifications"><Bell className="mr-2 h-4 w-4" /> Notifications</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[#e2e8f0]" />
            <DropdownMenuItem onClick={handleSignOut} className="text-[#dc2626] focus:text-[#dc2626]">
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
