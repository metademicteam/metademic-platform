"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BookOpen, Loader2, AlertCircle, ShieldCheck, Fingerprint, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/browser";
import { useToast } from "@/components/ui/toast";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const next = searchParams.get("next") || "/author/dashboard";
  const urlError = searchParams.get("error");

  const [serverError, setServerError] = React.useState<string | null>(urlError);
  const [loading, setLoading] = React.useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    setServerError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error, data } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) {
        setServerError(error.message);
        return;
      }
      if (data.user) {
        toast({ title: "Welcome back", description: "You have been signed in.", variant: "success" });
        router.push(next);
        router.refresh();
      }
    } catch (e: unknown) {
      setServerError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f3f8] flex flex-col">
      {/* Top thin bar */}
      <div className="h-[3px] bg-[#facc15] w-full" />
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:py-12">
        <div className="w-full max-w-[920px] grid lg:grid-cols-[1.05fr_0.95fr] gap-6 items-start">
          {/* Left: ID-card login like ETIS */}
          <Card className="rounded-[12px] border border-[#e2e8f0] shadow-[0_2px_16px_rgba(16,24,40,0.06)] overflow-hidden">
            <div className="h-[3px] bg-[#1e4ed8]" />
            <CardHeader className="space-y-2 pt-6">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#1e4ed8] text-white">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#94a3b8] leading-none">Metademic</p>
                  <p className="text-[13px] font-semibold text-[#0f172a] leading-none">Research Information System</p>
                </div>
              </div>
              <CardTitle className="text-[18px] font-bold tracking-tight text-[#0f172a] pt-2">Sign in</CardTitle>
              <CardDescription className="text-[12px] normal-case tracking-normal text-[#64748b] font-normal leading-5">
                Use your Metademic account. New here? <Link href="/auth/register" className="font-medium text-[#1e4ed8] hover:text-[#1e40af] hover:underline">Create an account</Link>.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {serverError && (
                <div className="mb-4 flex gap-2 rounded-[8px] border border-[#fecaca] bg-[#fef2f2] px-3 py-2.5 text-[12px] text-[#b91c1c]" role="alert">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{serverError}</span>
                </div>
              )}

              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-[11px] font-semibold tracking-wide uppercase text-[#475569]">Email</Label>
                  <Input id="email" type="email" autoComplete="email" placeholder="you@university.edu" className="h-9 rounded-[8px] border-[#e2e8f0] bg-[#f8fafc] focus-visible:bg-white text-[13px]" {...form.register("email")} aria-invalid={!!form.formState.errors.email} />
                  {form.formState.errors.email && <p className="text-xs text-[#dc2626]">{form.formState.errors.email.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-[11px] font-semibold tracking-wide uppercase text-[#475569]">Password</Label>
                    <Link href="/auth/forgot-password" className="text-[11px] font-medium text-[#1e4ed8] hover:underline">Forgot password?</Link>
                  </div>
                  <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" className="h-9 rounded-[8px] border-[#e2e8f0] bg-[#f8fafc] focus-visible:bg-white text-[13px]" {...form.register("password")} aria-invalid={!!form.formState.errors.password} />
                  {form.formState.errors.password && <p className="text-xs text-[#dc2626]">{form.formState.errors.password.message}</p>}
                </div>

                <label className="flex items-center gap-2 text-[12px] text-[#475569] cursor-pointer">
                  <input id="remember" type="checkbox" className="h-3.5 w-3.5 rounded border-[#cbd5e1] text-[#1e4ed8] focus:ring-[#1e4ed8]/20" />
                  <span>Remember me on this device</span>
                </label>

                {/* Stacked blue buttons ETIS style */}
                <div className="space-y-2 pt-1">
                  <Button type="submit" className="w-full h-9 rounded-[8px] bg-[#1e4ed8] text-[13px] font-semibold shadow-[0_1px_2px_rgba(30,78,216,0.18)] hover:bg-[#1e40af] flex items-center justify-center gap-2" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Sign in
                  </Button>
                  <Button type="button" variant="outline" className="w-full h-9 rounded-[8px] border-[#e2e8f0] bg-white text-[12px] font-medium text-[#334155] hover:bg-[#f8fafc] gap-2" asChild>
                    <Link href="/auth/register"><Fingerprint className="h-4 w-4 text-[#64748b]" /> Create account</Link>
                  </Button>
                </div>

                <p className="text-center text-[11px] leading-4 text-[#94a3b8]">
                  By signing in you agree to our <Link href="/terms" className="underline decoration-[#cbd5e1] underline-offset-2 hover:text-[#475569]">Terms</Link> and{" "}
                  <Link href="/privacy" className="underline decoration-[#cbd5e1] underline-offset-2 hover:text-[#475569]">Privacy Policy</Link>.
                </p>
              </form>

              <div className="mt-6 rounded-[8px] border border-dashed border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#22c55e] animate-pulse" />
                <span className="text-[11px] font-medium text-[#475569]">ORCID · Institutional SSO · Email</span>
                <span className="ml-auto text-[10px] text-[#94a3b8]">ETIS-compatible</span>
              </div>
            </CardContent>
          </Card>

          {/* Right: feature panel */}
          <div className="hidden lg:flex flex-col gap-4">
            <div className="rounded-[12px] border border-[#e2e8f0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden">
              <div className="bg-[#0f172a] px-5 py-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-[8px] bg-[#1e4ed8] flex items-center justify-center text-white">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold tracking-widest uppercase text-white/60">Why Metademic</p>
                  <p className="text-[13px] font-semibold text-white leading-none">Trusted scholarly infrastructure</p>
                </div>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#1e4ed8] shrink-0" />
                  <p className="text-[12px] leading-5 text-[#334155]"><span className="font-semibold text-[#0f172a]">Rigorous peer review</span> — double-blind workflow with audit trail.</p>
                </div>
                <div className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#facc15] border border-[#eab308]/30 shrink-0" />
                  <p className="text-[12px] leading-5 text-[#334155]"><span className="font-semibold text-[#0f172a]">Transparent tracking</span> — editorial, production, DOI & indexing in one place.</p>
                </div>
                <div className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#64748b] shrink-0" />
                  <p className="text-[12px] leading-5 text-[#334155]"><span className="font-semibold text-[#0f172a]">Open & auditable</span> — Crossref, ORCID, funding sync ETIS-style.</p>
                </div>
              </div>
              <div className="border-t border-[#f1f5f9] bg-[#f8fafc] px-5 py-3 flex items-center justify-between">
                <span className="text-[11px] text-[#64748b]">© {new Date().getFullYear()} Metademic</span>
                <Link href="/about" className="text-[11px] font-medium text-[#1e4ed8] hover:underline">How it works →</Link>
              </div>
            </div>

            <div className="rounded-[12px] border border-[#e2e8f0] bg-[#fefce8] px-4 py-3 flex items-center gap-3">
              <span className="h-8 w-8 rounded-full bg-[#facc15] border border-[#eab308]/30 flex items-center justify-center text-[11px] font-bold text-[#422006]">ETIS</span>
              <div>
                <p className="text-[11px] font-semibold text-[#422006]">Estonian Research Information System inspired</p>
                <p className="text-[11px] text-[#854d0e]">Blue · Yellow · Gray · Academic · Data-dense · Precise</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-sm text-[#64748b]">Loading...</div>}>
      <LoginInner />
    </React.Suspense>
  );
}
