"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BookOpen, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/browser";

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    setServerError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
        redirectTo: `${appUrl}/auth/reset-password`,
      });
      if (error) {
        setServerError(error.message);
        return;
      }
      setSuccess(true);
    } catch (e: unknown) {
      setServerError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <Card className="w-full max-w-[440px] shadow-sm">
        <CardHeader className="space-y-2">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><BookOpen className="h-4 w-4" /></div>
            <span className="font-semibold">Metademic</span>
          </Link>
          <CardTitle className="text-xl">Forgot your password?</CardTitle>
          <CardDescription>Enter your email and we&apos;ll send you a reset link.</CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <div className="flex gap-3 rounded-md border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">Email sent</p>
                  <p className="text-green-700">If an account exists for that email, you&apos;ll receive a password reset link shortly.</p>
                </div>
              </div>
              <Button variant="outline" asChild className="w-full"><Link href="/auth/login">Back to sign in</Link></Button>
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
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" placeholder="you@university.edu" {...form.register("email")} />
                  {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send reset link
                </Button>
                <div className="text-center text-sm">
                  <Link href="/auth/login" className="text-primary hover:underline">Back to sign in</Link>
                  <span className="mx-2 text-muted-foreground">·</span>
                  <Link href="/auth/register" className="text-primary hover:underline">Create account</Link>
                </div>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
