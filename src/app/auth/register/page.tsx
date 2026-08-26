"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BookOpen, Loader2, AlertCircle, CheckCircle2, Mail, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/browser";

function RegisterInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/onboarding";
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [successEmail, setSuccessEmail] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", confirmPassword: "", acceptTerms: undefined as unknown as true },
  });

  async function onSubmit(values: RegisterInput) {
    setServerError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const { error, data } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          emailRedirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });

      if (error) {
        setServerError(error.message);
        return;
      }

      if (data.user) {
        const email = data.user.email ?? values.email;
        if (data.session) {
          await supabase.from("profiles").upsert({
            id: data.user.id,
            email,
          } as never, { onConflict: "id" });
          router.push(next);
          router.refresh();
          return;
        }
      }

      setSuccessEmail(values.email);
    } catch (e: unknown) {
      setServerError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (successEmail) {
    return (
      <div className="min-h-screen bg-[#f0f3f8] flex flex-col">
        <div className="h-[3px] bg-[#facc15]" />
        <div className="flex flex-1 items-center justify-center p-6 sm:p-8">
          <Card className="w-full max-w-[480px] text-center rounded-[12px] border-[#e2e8f0] shadow-[0_2px_16px_rgba(16,24,40,0.06)]">
            <div className="h-[3px] bg-[#1e4ed8] rounded-t-[12px]" />
            <CardHeader>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f0fdf4] border border-[#bbf7d0] text-[#15803d]">
                <Mail className="h-6 w-6" />
              </div>
              <CardTitle className="text-[16px] font-bold text-[#0f172a]">Check your email</CardTitle>
              <CardDescription className="text-[12px] normal-case tracking-normal font-normal text-[#64748b]">We&apos;ve sent a verification link to <span className="font-semibold text-[#0f172a]">{successEmail}</span>.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-[12px] leading-5 text-[#64748b]">Click the link in the email to verify your account, then continue to onboarding. If you don&apos;t see the email, check your spam folder.</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" asChild className="rounded-[8px] border-[#e2e8f0]"><Link href="/auth/login">Back to sign in</Link></Button>
                <Button onClick={() => setSuccessEmail(null)} variant="ghost" className="rounded-[8px]">Use another email</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f3f8] flex flex-col">
      <div className="h-[3px] bg-[#facc15]" />
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:py-12">
        <div className="w-full max-w-[920px] grid lg:grid-cols-[1.05fr_0.95fr] gap-6 items-start">
          <Card className="rounded-[12px] border border-[#e2e8f0] shadow-[0_2px_16px_rgba(16,24,40,0.06)] overflow-hidden">
            <div className="h-[3px] bg-[#1e4ed8]" />
            <CardHeader className="pt-6">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#1e4ed8] text-white">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#94a3b8] leading-none">Metademic</p>
                  <p className="text-[13px] font-semibold text-[#0f172a] leading-none">Research Information System</p>
                </div>
              </div>
              <CardTitle className="text-[18px] font-bold tracking-tight text-[#0f172a] pt-2">Create your account</CardTitle>
              <CardDescription className="text-[12px] normal-case tracking-normal font-normal text-[#64748b]">Already have an account? <Link href="/auth/login" className="font-medium text-[#1e4ed8] hover:underline">Sign in</Link>.</CardDescription>
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
                  <Label htmlFor="email" className="text-[11px] font-semibold tracking-wide uppercase text-[#475569]">Email *</Label>
                  <Input id="email" type="email" autoComplete="email" placeholder="you@university.edu" className="h-9 rounded-[8px] border-[#e2e8f0] bg-[#f8fafc] focus-visible:bg-white text-[13px]" {...form.register("email")} />
                  {form.formState.errors.email && <p className="text-xs text-[#dc2626]">{form.formState.errors.email.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-[11px] font-semibold tracking-wide uppercase text-[#475569]">Password *</Label>
                  <Input id="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" className="h-9 rounded-[8px] border-[#e2e8f0] bg-[#f8fafc] focus-visible:bg-white text-[13px]" {...form.register("password")} />
                  {form.formState.errors.password && <p className="text-xs text-[#dc2626]">{form.formState.errors.password.message}</p>}
                  <p className="text-[11px] text-[#94a3b8]">Must include uppercase, lowercase, and a number.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-[11px] font-semibold tracking-wide uppercase text-[#475569]">Confirm password *</Label>
                  <Input id="confirmPassword" type="password" autoComplete="new-password" placeholder="Repeat password" className="h-9 rounded-[8px] border-[#e2e8f0] bg-[#f8fafc] focus-visible:bg-white text-[13px]" {...form.register("confirmPassword")} />
                  {form.formState.errors.confirmPassword && <p className="text-xs text-[#dc2626]">{form.formState.errors.confirmPassword.message}</p>}
                </div>

                <label className="flex items-start gap-2 text-[12px] leading-4 text-[#475569] cursor-pointer">
                  <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 rounded border-[#cbd5e1] text-[#1e4ed8] focus:ring-[#1e4ed8]/20" {...form.register("acceptTerms")} />
                  <span>I agree to the <Link href="/terms" className="underline decoration-[#cbd5e1] underline-offset-2">Terms of Service</Link> and <Link href="/privacy" className="underline decoration-[#cbd5e1] underline-offset-2">Privacy Policy</Link>.</span>
                </label>
                {form.formState.errors.acceptTerms && <p className="text-xs text-[#dc2626]">{form.formState.errors.acceptTerms.message as string}</p>}

                <div className="space-y-2 pt-1">
                  <Button type="submit" className="w-full h-9 rounded-[8px] bg-[#1e4ed8] text-[13px] font-semibold shadow-[0_1px_2px_rgba(30,78,216,0.18)] hover:bg-[#1e40af] gap-2" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Create account
                  </Button>
                  <Button type="button" variant="outline" asChild className="w-full h-9 rounded-[8px] border-[#e2e8f0] bg-white text-[12px] font-medium text-[#334155] hover:bg-[#f8fafc]">
                    <Link href="/auth/login">Already have an account? Sign in</Link>
                  </Button>
                </div>

                <p className="text-center text-[11px] text-[#94a3b8]">You&apos;ll verify your email, then complete your academic profile.</p>
              </form>
            </CardContent>
          </Card>

          <div className="hidden lg:flex flex-col gap-4">
            <div className="rounded-[12px] border border-[#e2e8f0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden">
              <div className="bg-[#0f172a] px-5 py-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-[8px] bg-[#facc15] border border-[#eab308]/30 flex items-center justify-center text-[#422006]">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold tracking-widest uppercase text-white/60">Join Metademic</p>
                  <p className="text-[13px] font-semibold text-white leading-none">One account · All roles</p>
                </div>
              </div>
              <div className="p-5">
                <ul className="space-y-2.5">
                  <li className="flex gap-2 text-[12px] leading-5 text-[#334155]"><CheckCircle2 className="h-4 w-4 mt-0.5 text-[#1e4ed8] shrink-0" /> Trusted by editors and authors worldwide</li>
                  <li className="flex gap-2 text-[12px] leading-5 text-[#334155]"><CheckCircle2 className="h-4 w-4 mt-0.5 text-[#1e4ed8] shrink-0" /> Secure, privacy-respecting platform</li>
                  <li className="flex gap-2 text-[12px] leading-5 text-[#334155]"><CheckCircle2 className="h-4 w-4 mt-0.5 text-[#1e4ed8] shrink-0" /> Author, reviewer, and editorial roles in one place</li>
                </ul>
                <div className="mt-4 rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
                  <span className="text-[11px] font-medium text-[#475569]">ORCID · Institutional SSO · Email</span>
                </div>
              </div>
              <div className="border-t border-[#f1f5f9] bg-[#f8fafc] px-5 py-3 flex items-center justify-between">
                <span className="text-[11px] text-[#64748b]">© {new Date().getFullYear()} Metademic</span>
                <Link href="/about" className="text-[11px] font-medium text-[#1e4ed8] hover:underline">About →</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-sm text-[#64748b]">Loading...</div>}>
      <RegisterInner />
    </React.Suspense>
  );
}
