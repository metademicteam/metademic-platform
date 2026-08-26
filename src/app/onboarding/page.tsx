"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, AlertCircle, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { onboardingSchema, type OnboardingInput } from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/browser";
import { useToast } from "@/components/ui/toast";

const COUNTRIES = [
  "US","GB","CA","AU","DE","FR","IN","CN","JP","BR","ZA","NG","EG","SA","AE","TR","IT","ES","NL","SE","NO","DK","PL","CH","AT","BE","IE","NZ","SG","MY","ID","TH","VN","PH","PK","BD","MX","AR","CL","CO","PE","KE","GH","ET","MA","DZ","GR","PT","CZ","HU","RO","UA","IL","KR"
];

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [checking, setChecking] = React.useState(true);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [interestInput, setInterestInput] = React.useState("");

  const form = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
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
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    },
  });

  const interests = form.watch("researchInterests") ?? [];

  React.useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/auth/login?next=/onboarding");
        return;
      }
      setUserId(data.user.id);
      // Prefill from existing profile if any
      const { data: profile } = await supabase.from("profiles").select("first_name,last_name,middle_name,display_name,country_code,orcid,bio,timezone").eq("id", data.user.id).single();
      if (profile) {
        form.reset({
          firstName: (profile.first_name as string) ?? "",
          middleName: (profile.middle_name as string) ?? "",
          lastName: (profile.last_name as string) ?? "",
          displayName: (profile.display_name as string) ?? "",
          countryCode: (profile.country_code as string) ?? "",
          orcid: (profile.orcid as string) ?? "",
          institutionName: "",
          department: "",
          position: "",
          researchInterests: [],
          bio: (profile.bio as string) ?? "",
          timezone: (profile.timezone as string) ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
        });
        // Load author/reviewer extra if exists
        const [{ data: author }, { data: reviewer }] = await Promise.all([
          supabase.from("author_profiles").select("department,research_interests").eq("user_id", data.user.id).single(),
          supabase.from("reviewer_profiles").select("expertise").eq("user_id", data.user.id).single(),
        ]);
        if (author) {
          form.setValue("department", (author.department as string) ?? "");
          const ri = author.research_interests as string[] | null;
          if (ri && ri.length) form.setValue("researchInterests", ri);
        } else if (reviewer) {
          const ex = reviewer.expertise as string[] | null;
          if (ex && ex.length) form.setValue("researchInterests", ex);
        }
      }
      setChecking(false);
    });
  }, [form, router]);

  function addInterest() {
    const v = interestInput.trim();
    if (!v) return;
    if (interests.includes(v)) return;
    if (interests.length >= 20) return;
    form.setValue("researchInterests", [...interests, v], { shouldValidate: true });
    setInterestInput("");
  }

  function removeInterest(idx: number) {
    form.setValue("researchInterests", interests.filter((_, i) => i !== idx), { shouldValidate: true });
  }

  async function onSubmit(values: OnboardingInput) {
    if (!userId) return;
    setServerError(null);
    setLoading(true);
    try {
      const supabase = createClient();

      // Upsert institution if provided
      let institutionId: string | null = null;
      if (values.institutionName?.trim()) {
        const { data: existing } = await supabase.from("institutions").select("id").ilike("name", values.institutionName.trim()).limit(1).maybeSingle();
        if (existing) {
          institutionId = (existing as { id: string }).id;
        } else {
          const { data: created, error: instErr } = await supabase.from("institutions").insert({ name: values.institutionName.trim(), country_code: values.countryCode?.toUpperCase() || null } as never).select("id").single();
          if (instErr) {
            // Non-fatal — continue without institution
            console.warn("[onboarding] institution create failed", instErr.message);
          } else if (created) {
            institutionId = (created as { id: string }).id;
          }
        }
      }

      // Update profiles
      const { error: profileErr } = await supabase.from("profiles").upsert({
        id: userId,
        first_name: values.firstName.trim(),
        middle_name: values.middleName?.trim() || null,
        last_name: values.lastName.trim(),
        display_name: values.displayName?.trim() || `${values.firstName.trim()} ${values.lastName.trim()}`.trim(),
        country_code: values.countryCode?.toUpperCase() || null,
        orcid: values.orcid?.trim() || null,
        bio: values.bio?.trim() || null,
        timezone: values.timezone?.trim() || "UTC",
      } as never, { onConflict: "id" });

      if (profileErr) throw new Error(profileErr.message);

      // Upsert author_profiles
      const { error: authorErr } = await supabase.from("author_profiles").upsert({
        user_id: userId,
        institution_id: institutionId,
        department: values.department?.trim() || null,
        position: values.position?.trim() || null,
        research_interests: values.researchInterests ?? [],
      } as never, { onConflict: "user_id" });

      if (authorErr) console.warn("[onboarding] author_profiles upsert:", authorErr.message);

      // Upsert reviewer_profiles — mirror interests as expertise for discoverability
      const { error: reviewerErr } = await supabase.from("reviewer_profiles").upsert({
        user_id: userId,
        institution_id: institutionId,
        expertise: values.researchInterests ?? [],
        keywords: values.researchInterests ?? [],
      } as never, { onConflict: "user_id" });

      if (reviewerErr) console.warn("[onboarding] reviewer_profiles upsert:", reviewerErr.message);

      toast({ title: "Profile complete", description: "Your academic profile has been saved.", variant: "success" });
      router.push("/author/dashboard");
      router.refresh();
    } catch (e: unknown) {
      setServerError(e instanceof Error ? e.message : "Failed to save profile.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/20">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading your profile…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-[960px] flex h-14 items-center gap-2 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><BookOpen className="h-4 w-4" /></div>
          <span className="font-semibold text-sm">Metademic</span>
          <span className="text-xs text-muted-foreground">— Complete your profile</span>
        </div>
      </header>

      <main className="mx-auto max-w-[960px] px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome — let&apos;s set up your academic profile</h1>
          <p className="text-sm text-muted-foreground mt-2">This information helps editors match manuscripts to the right expertise and ensures your publications are correctly attributed. You can update it anytime in Account → Profile.</p>
          <div className="mt-4 flex gap-2 text-xs">
            <span className="inline-flex items-center rounded-full border px-2.5 py-1 bg-card">Step 1 of 1 — onboarding</span>
            <span className="inline-flex items-center rounded-full bg-primary text-primary-foreground px-2.5 py-1">Takes ~2 minutes</span>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          {serverError && (
            <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Personal information</CardTitle><CardDescription>Your name as it should appear on publications.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name *</Label>
                <Input id="firstName" {...form.register("firstName")} />
                {form.formState.errors.firstName && <p className="text-xs text-destructive">{form.formState.errors.firstName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="middleName">Middle name</Label>
                <Input id="middleName" {...form.register("middleName")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name *</Label>
                <Input id="lastName" {...form.register("lastName")} />
                {form.formState.errors.lastName && <p className="text-xs text-destructive">{form.formState.errors.lastName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Display name</Label>
                <Input id="displayName" placeholder="e.g. A. B. Researcher" {...form.register("displayName")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="countryCode">Country</Label>
                <select id="countryCode" className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" {...form.register("countryCode")}>
                  <option value="">Select country</option>
                  {COUNTRIES.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
                {form.formState.errors.countryCode && <p className="text-xs text-destructive">{form.formState.errors.countryCode.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input id="timezone" placeholder="UTC" {...form.register("timezone")} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="orcid">ORCID</Label>
                <Input id="orcid" placeholder="0000-0000-0000-0000" {...form.register("orcid")} />
                {form.formState.errors.orcid && <p className="text-xs text-destructive">{form.formState.errors.orcid.message}</p>}
                <p className="text-xs text-muted-foreground">Your persistent digital identifier. <a href="https://orcid.org" target="_blank" rel="noreferrer" className="underline">Get an ORCID</a></p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Academic affiliation</CardTitle><CardDescription>Helps with conflict-of-interest detection and reviewer matching.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="institutionName">Institution</Label>
                <Input id="institutionName" placeholder="University / Research Institute" {...form.register("institutionName")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input id="department" placeholder="e.g. Department of Biology" {...form.register("department")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="position">Position / Title</Label>
                <Input id="position" placeholder="e.g. Associate Professor" {...form.register("position")} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea id="bio" rows={4} placeholder="Brief academic biography…" {...form.register("bio")} />
                {form.formState.errors.bio && <p className="text-xs text-destructive">{form.formState.errors.bio.message}</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Research interests</CardTitle><CardDescription>Add keywords that describe your expertise. These are used to suggest you as a reviewer.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={interestInput} onChange={(e) => setInterestInput(e.target.value)} placeholder="Add an interest and press Enter" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addInterest(); } }} />
                <Button type="button" variant="outline" onClick={addInterest}>Add</Button>
              </div>
              {form.formState.errors.researchInterests && <p className="text-xs text-destructive">{(form.formState.errors.researchInterests as { message?: string }).message}</p>}
              {interests.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {interests.map((interest, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-xs">
                      {interest}
                      <button type="button" onClick={() => removeInterest(idx)} className="ml-1 text-muted-foreground hover:text-foreground" aria-label={`Remove ${interest}`}>×</button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No interests added yet. Examples: machine learning, genomics, climate modelling</p>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button type="submit" disabled={loading} className="min-w-[160px]">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Save and continue
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push("/author/dashboard")}>Skip for now</Button>
          </div>
          <p className="text-xs text-muted-foreground">By continuing you confirm the information is accurate. You can edit it later in your account settings.</p>
        </form>
      </main>
    </div>
  );
}
