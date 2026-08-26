"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, ChevronDown, Globe, LogOut, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/browser";

// ETIS-mapped nav for Metademic — same visual rhythm as ETIS original
const NAV_LINKS = [
  { href: "/journals", label: "Journals" },
  { href: "/articles", label: "Articles" },
  { href: "/issues", label: "Issues" },
  { href: "/authors", label: "Authors" },
  { href: "/reviewers", label: "Reviewers" },
  { href: "/about", label: "About" },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [userEmail, setUserEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Close mobile on route change
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#e2e8f0] bg-white">
      {/* 56px bar — ETIS exact height */}
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left: logo + ETIS-style nav */}
        <div className="flex items-center gap-6 lg:gap-8">
          {/* Logo: metademic */}
          <Link href="/" className="flex shrink-0 items-center gap-0" aria-label="Metademic — home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://res.cloudinary.com/uwwehxni/image/upload/v1787689745/metademic_logo.png"
              alt="Metademic"
              className="h-8 w-auto"
            />
          </Link>

          {/* Desktop nav — 12px gray, separators, hover blue — ETIS style */}
          <nav className="hidden items-center lg:flex" aria-label="Primary">
            {NAV_LINKS.map((link, idx) => (
              <React.Fragment key={link.href}>
                {idx !== 0 && (
                  <span
                    aria-hidden
                    className="mx-1 h-3 w-px shrink-0 bg-[#e2e8f0]"
                  />
                )}
                <Link
                  href={link.href}
                  className={cn(
                    "px-2.5 py-1.5 text-[12px] font-medium leading-none tracking-wide transition-colors",
                    isActive(link.href)
                      ? "text-[#1e4ed8]"
                      : "text-[#64748b] hover:text-[#1e4ed8]"
                  )}
                >
                  {link.label}
                </Link>
              </React.Fragment>
            ))}
          </nav>
        </div>

        {/* Right: language + auth — ETIS right cluster */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Language selector — ETIS EST pill style */}
          <button
            type="button"
            aria-label="Change language"
            className="hidden items-center gap-1.5 rounded-md border border-[#e2e8f0] bg-white px-2.5 py-1.5 text-[12px] font-medium leading-none text-[#475569] transition-colors hover:border-[#cbd5e1] hover:text-slate-900 sm:inline-flex"
          >
            <Globe className="h-3.5 w-3.5 text-[#94a3b8]" />
            ENG
            <ChevronDown className="h-3 w-3 text-[#94a3b8]" />
          </button>

          {/* Auth — ETIS: Log in white+border 12px, Create account blue primary */}
          <div className="hidden items-center gap-2 lg:flex">
            {userEmail ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="h-7 rounded-[6px] px-3 text-[12px] font-medium text-[#475569] hover:bg-[#f1f5f9] hover:text-slate-900"
                >
                  <Link href="/author/dashboard">
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    Dashboard
                  </Link>
                </Button>
                <span className="hidden max-w-[160px] truncate text-[12px] text-[#64748b] xl:inline">
                  {userEmail}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  className="h-7 rounded-[6px] border-[#e2e8f0] bg-white px-3 text-[12px] font-medium text-[#475569] hover:bg-[#f8fafc] hover:text-slate-900"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="h-7 rounded-[6px] border-[#e2e8f0] bg-white px-3.5 text-[12px] font-medium text-[#334155] hover:bg-[#f8fafc] hover:text-slate-900"
                >
                  <Link href="/auth/login">Log in</Link>
                </Button>
                <Button
                  size="sm"
                  asChild
                  className="h-7 rounded-[6px] bg-[#1e4ed8] px-3.5 text-[12px] font-medium text-white hover:bg-[#1e40af] shadow-[0_1px_2px_rgba(30,78,216,0.2)]"
                >
                  <Link href="/auth/register">Create account</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile hamburger — ETIS minimal outline */}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#e2e8f0] bg-white text-[#475569] transition-colors hover:bg-[#f8fafc] hover:text-slate-900 lg:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile panel — full-bleed white, border-t, ETIS card shadow */}
      {mobileOpen && (
        <div className="border-t border-[#e2e8f0] bg-white lg:hidden">
          <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6">
            {/* Mobile nav — 13px, separators as subtle dividers */}
            <nav className="flex flex-col" aria-label="Mobile primary">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center justify-between border-b border-[#f1f5f9] py-3 text-[13px] font-medium tracking-wide transition-colors last:border-0",
                    isActive(link.href)
                      ? "text-[#1e4ed8]"
                      : "text-[#475569] hover:text-[#1e4ed8]"
                  )}
                >
                  {link.label}
                  {isActive(link.href) && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[#1e4ed8]" aria-hidden />
                  )}
                </Link>
              ))}
            </nav>

            {/* Mobile language + auth */}
            <div className="mt-4 flex flex-col gap-3 border-t border-[#e2e8f0] pt-4">
              <button
                type="button"
                className="inline-flex w-fit items-center gap-1.5 rounded-md border border-[#e2e8f0] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#475569]"
              >
                <Globe className="h-3.5 w-3.5 text-[#94a3b8]" />
                ENG
                <ChevronDown className="h-3 w-3 text-[#94a3b8]" />
              </button>

              {userEmail ? (
                <>
                  <p className="truncate text-[12px] text-[#64748b]">{userEmail}</p>
                  <Button
                    variant="outline"
                    asChild
                    className="h-9 w-full justify-center rounded-[6px] border-[#e2e8f0] text-[13px]"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Link href="/author/dashboard">
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleSignOut}
                    className="h-9 w-full justify-center rounded-[6px] text-[13px] text-[#475569] hover:bg-[#f1f5f9]"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    asChild
                    className="h-9 w-full justify-center rounded-[6px] bg-[#1e4ed8] text-[13px] font-medium text-white hover:bg-[#1e40af]"
                  >
                    <Link href="/auth/register" onClick={() => setMobileOpen(false)}>
                      Create account
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    asChild
                    className="h-9 w-full justify-center rounded-[6px] border-[#e2e8f0] bg-white text-[13px] font-medium text-[#334155] hover:bg-[#f8fafc]"
                  >
                    <Link href="/auth/login" onClick={() => setMobileOpen(false)}>
                      Log in
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
