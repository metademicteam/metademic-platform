"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, AlertCircle, Save, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { updateProfileSchema, type UpdateProfileInput } from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/browser";
import { useToast } from "@/components/ui/toast";

export default function ProfilePage() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [fetching, setFetching] = React.useState(true);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState<string>("");
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      firstName: "",
      middleName: "",
      lastName: "",
      displayName: "",
      countryCode: "",
      orcid: "",
      institutionName: "",
      department: "",
      position: "",
      researchInterests: [],
      bio: "",
      timezone: "",
      avatarUrl: "",
      phone: "",
    },
  });

  React.useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setFetching(false); return; }
      setEmail(user.email ?? "");
      const { data: profile } = await supabase.from("profiles").select("first_name,last_name,middle_name,display_name,country_code,orcid,bio,timezone,avatar_url,phone").eq("id", user.id).single();
      const { data: author } = await supabase.from("author_profiles").select("department,position,research_interests,institution_id").eq("user_id", user.id).maybeSingle();
      let institutionName = "";
      if (author && (author as Record<string, unknown>).institution_id) {
        const instId = (author as Record<string, unknown>).institution_id as string;
        const { data: inst } = await supabase.from("institutions").select("name").eq("id", instId).single();
        institutionName = (inst as { name?: string } | null)?.name ?? "";
      }
      form.reset({
        firstName: (profile as Record<string, string> | null)?.first_name ?? "",
        middleName: (profile as Record<string, string> | null)?.middle_name ?? "",
        lastName: (profile as Record<string, string> | null)?.last_name ?? "",
        displayName: (profile as Record<string, string> | null)?.display_name ?? "",
        countryCode: (profile as Record<string, string> | null)?.country_code ?? "",
        orcid: (profile as Record<string, string> | null)?.orcid ?? "",
        bio: (profile as Record<string, string> | null)?.bio ?? "",
        timezone: (profile as Record<string, string> | null)?.timezone ?? "",
        avatarUrl: (profile as Record<string, string> | null)?.avatar_url ?? "",
        phone: (profile as Record<string, string> | null)?.phone ?? "",
        institutionName,
        department: (author as Record<string, string> | null)?.department ?? "",
        position: (author as Record<string, string> | null)?.position ?? "",
        researchInterests: ((author as Record<string, string[]> | null)?.research_interests ?? []) as string[],
      });
      setFetching(false);
    })();
  }, [form]);

  async function onSubmit(values: UpdateProfileInput) {
    setServerError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated.");

      let institutionId: string | null = null;
      if (values.institutionName?.trim()) {
        const { data: existing } = await supabase.from("institutions").select("id").ilike("name", values.institutionName.trim()).limit(1).maybeSingle();
        if (existing) institutionId = (existing as { id: string }).id;
        else {
          const { data: created } = await supabase.from("institutions").insert({ name: values.institutionName.trim() } as never).select("id").single();
          if (created) institutionId = (created as { id: string }).id;
        }
      }

      const { error: pErr } = await supabase.from("profiles").upsert({
        id: user.id,
        email,
        first_name: values.firstName?.trim() || null,
        middle_name: values.middleName?.trim() || null,
        last_name: values.lastName?.trim() || null,
        display_name: values.displayName?.trim() || null,
        country_code: values.countryCode?.trim().toUpperCase() || null,
        orcid: values.orcid?.trim() || null,
        bio: values.bio?.trim() || null,
        timezone: values.timezone?.trim() || null,
        avatar_url: values.avatarUrl?.trim() || null,
        phone: values.phone?.trim() || null,
      } as never, { onConflict: "id" });
      if (pErr) throw new Error(pErr.message);

      await supabase.from("author_profiles").upsert({
        user_id: user.id,
        institution_id: institutionId,
        department: values.department?.trim() || null,
        position: values.position?.trim() || null,
        research_interests: values.researchInterests ?? [],
      } as never, { onConflict: "user_id" });

      await supabase.from("reviewer_profiles").upsert({
        user_id: user.id,
        institution_id: institutionId,
        expertise: values.researchInterests ?? [],
        keywords: values.researchInterests ?? [],
      } as never, { onConflict: "user_id" });

      toast({ title: "Profile updated", variant: "success" });
    } catch (e: unknown) {
      setServerError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return (
      <div className="flex min-h-screen">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
        <div className="flex-1 flex flex-col">
          <TopNav onMenuClick={() => setMobileOpen(true)} />
          <div className="p-6 space-y-4 max-w-[960px] w-full mx-auto">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-muted/20">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopNav onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="max-w-[960px] mx-auto space-y-6">
            <Breadcrumbs items={[{ label: "Account", href: "/account/profile" }, { label: "Profile" }]} />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground"><User className="h-5 w-5" /></div>
              <div>
                <h1 className="text-xl font-semibold">Profile</h1>
                <p className="text-sm text-muted-foreground">Manage your personal and academic information. Connected to {email}</p>
              </div>
            </div>

            {serverError && (
              <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
              <Card>
                <CardHeader><CardTitle className="text-base">Personal</CardTitle><CardDescription>As it appears on publications.</CardDescription></CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>First name</Label><Input {...form.register("firstName")} /></div>
                  <div className="space-y-2"><Label>Middle name</Label><Input {...form.register("middleName")} /></div>
                  <div className="space-y-2"><Label>Last name</Label><Input {...form.register("lastName")} /></div>
                  <div className="space-y-2"><Label>Display name</Label><Input {...form.register("displayName")} /></div>
                  <div className="space-y-2"><Label>Country code</Label><Input placeholder="US" {...form.register("countryCode")} /></div>
                  <div className="space-y-2"><Label>ORCID</Label><Input placeholder="0000-0000-0000-0000" {...form.register("orcid")} />{form.formState.errors.orcid && <p className="text-xs text-destructive">{form.formState.errors.orcid.message}</p>}</div>
                  <div className="space-y-2"><Label>Phone</Label><Input {...form.register("phone")} /></div>
                  <div className="space-y-2"><Label>Timezone</Label><Input {...form.register("timezone")} /></div>
                  <div className="space-y-2 sm:col-span-2"><Label>Avatar URL</Label><Input placeholder="https://..." {...form.register("avatarUrl")} />{form.formState.errors.avatarUrl && <p className="text-xs text-destructive">{form.formState.errors.avatarUrl.message}</p>}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Academic</CardTitle></CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2"><Label>Institution</Label><Input {...form.register("institutionName")} /></div>
                  <div className="space-y-2"><Label>Department</Label><Input {...form.register("department")} /></div>
                  <div className="space-y-2"><Label>Position</Label><Input {...form.register("position")} /></div>
                  <div className="space-y-2 sm:col-span-2"><Label>Bio</Label><Textarea rows={4} {...form.register("bio")} /></div>
                </CardContent>
              </Card>

              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save changes
              </Button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
