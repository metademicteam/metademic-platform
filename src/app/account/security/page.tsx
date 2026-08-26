"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle, Shield, CheckCircle2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Required"),
  newPassword: z.string().min(8, "At least 8 characters").max(128).regex(/[A-Z]/, "Uppercase required").regex(/[a-z]/, "Lowercase required").regex(/[0-9]/, "Number required"),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

type PasswordInput = z.infer<typeof passwordSchema>;

export default function SecurityPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [email, setEmail] = React.useState<string>("");
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const form = useForm<PasswordInput>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  React.useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function onSubmit(values: PasswordInput) {
    setServerError(null);
    setSuccess(false);
    setLoading(true);
    try {
      const supabase = createClient();
      // Verify current password by re-authenticating
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: values.currentPassword });
      if (signInError) {
        setServerError("Current password is incorrect.");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: values.newPassword });
      if (error) throw new Error(error.message);
      setSuccess(true);
      form.reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({ title: "Password updated", variant: "success" });
    } catch (e: unknown) {
      setServerError(e instanceof Error ? e.message : "Failed to update password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOutAll() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <div className="flex min-h-screen bg-muted/20">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopNav onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="max-w-[720px] mx-auto space-y-6">
            <Breadcrumbs items={[{ label: "Account", href: "/account/profile" }, { label: "Security" }]} />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground"><Shield className="h-5 w-5" /></div>
              <div>
                <h1 className="text-xl font-semibold">Security</h1>
                <p className="text-sm text-muted-foreground">Manage your password and sessions — {email}</p>
              </div>
            </div>

            {success && (
              <div className="flex gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                <CheckCircle2 className="h-4 w-4 mt-0.5" /> Password changed successfully.
              </div>
            )}
            {serverError && (
              <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            <Card>
              <CardHeader><CardTitle className="text-base">Change password</CardTitle><CardDescription>Use a strong, unique password.</CardDescription></CardHeader>
              <CardContent>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current password</Label>
                    <Input id="currentPassword" type="password" autoComplete="current-password" {...form.register("currentPassword")} />
                    {form.formState.errors.currentPassword && <p className="text-xs text-destructive">{form.formState.errors.currentPassword.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New password</Label>
                    <Input id="newPassword" type="password" autoComplete="new-password" {...form.register("newPassword")} />
                    {form.formState.errors.newPassword && <p className="text-xs text-destructive">{form.formState.errors.newPassword.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm new password</Label>
                    <Input id="confirmPassword" type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
                    {form.formState.errors.confirmPassword && <p className="text-xs text-destructive">{form.formState.errors.confirmPassword.message}</p>}
                  </div>
                  <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Update password
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Sessions</CardTitle><CardDescription>Sign out from all devices.</CardDescription></CardHeader>
              <CardContent>
                <Button variant="outline" onClick={handleSignOutAll}><LogOut className="h-4 w-4" /> Sign out everywhere</Button>
                <p className="text-xs text-muted-foreground mt-2">You&apos;ll need to sign in again on all devices.</p>
              </CardContent>
            </Card>

            <Card className="border-destructive/30">
              <CardHeader><CardTitle className="text-base text-destructive">Danger zone</CardTitle><CardDescription>Deactivating your account will hide your profile and prevent new submissions.</CardDescription></CardHeader>
              <CardContent>
                <Button variant="destructive" onClick={() => toast({ title: "Contact support", description: "Please contact support to deactivate your account.", variant: "destructive" })}>Request deactivation</Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
