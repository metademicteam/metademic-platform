"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Skeleton } from "@/components/ui/skeleton";

export function AuthGuard({
  children,
  redirectTo = "/auth/login",
  allowUnauthenticated = false,
}: {
  children: React.ReactNode;
  redirectTo?: string;
  allowUnauthenticated?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState<"loading" | "authed" | "unauthed">("loading");

  React.useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setStatus("authed");
      else setStatus("unauthed");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setStatus(session?.user ? "authed" : "unauthed");
    });
    return () => subscription.unsubscribe();
  }, []);

  React.useEffect(() => {
    if (status === "unauthed" && !allowUnauthenticated) {
      const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
      router.replace(`${redirectTo}?next=${encodeURIComponent(next)}`);
    }
  }, [status, allowUnauthenticated, redirectTo, router]);

  if (status === "loading") {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (status === "unauthed" && !allowUnauthenticated) return null;

  return <>{children}</>;
}
