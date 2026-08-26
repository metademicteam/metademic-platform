"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BookOpen, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [checkingSession, setCheckingSession] = React.useState(true);

  React.useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      // If no session and no hash fragment, user landed here without a recovery link
      // Still allow them to try — Supabase will error if not authorized
      setCheckingSession(false);
    });
  }, []);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function onSubmit(values: ResetPasswordInput) {
    setServerError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) {
        setServerError(error.message);
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        router.push("/auth/login");
      }, 1500);
    } catch (e: unknown) {
      setServerError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Verifying reset link…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <Card className="w-full max-w-[440px] shadow-sm">
        <CardHeader>
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><BookOpen className="h-4 w-4" /></div>
            <span className="font-semibold">Metademic</span>
          </Link>
          <CardTitle className="text-xl">Set a new password</CardTitle>
          <CardDescription>Choose a strong password you haven&apos;t used elsewhere.</CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="flex gap-3 rounded-md border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Password updated</p>
                <p>Redirecting you to sign in…</p>
              </div>
            </div>
          ) : (
            <>
              {serverError && (
                <div className="mb-4 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{serverError}</span>
                </div>
              )}
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
                  {form.formState.errors.password && <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input id="confirmPassword" type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
                  {form.formState.errors.confirmPassword && <p className="text-xs text-destructive">{form.formState.errors.confirmPassword.message}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Update password
                </Button>
                <div className="text-center text-sm">
                  <Link href="/auth/login" className="text-primary hover:underline">Back to sign in</Link>
                </div>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
