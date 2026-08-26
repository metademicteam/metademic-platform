import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Mail, Shield, FileText, Users, Layers, Archive, Megaphone, DollarSign, Calendar, Hash, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ArticleCard } from "@/components/public/ArticleCard";
import { IssueCard } from "@/components/public/IssueCard";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("journals").select("name,short_name,description,issn_online,issn_print").eq("slug", slug).maybeSingle();
    if (!data) return { title: "Journal — Metademic" };
    const j = data as { name: string; short_name: string | null; description: string | null; issn_online: string | null };
    const title = `${j.name} — Metademic`;
    const desc = j.description ?? `Journal home for ${j.name} on Metademic.`;
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return {
      title,
      description: desc.slice(0, 160),
      openGraph: { title, description: desc.slice(0, 200), type: "website", url: `${base}/journals/${slug}` },
      twitter: { card: "summary_large_image", title, description: desc.slice(0, 160) },
      alternates: { canonical: `/journals/${slug}` },
    };
  } catch {
    return { title: "Journal — Metademic" };
  }
}

async function getJournalBySlug(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("journals")
    .select("id,name,slug,short_name,description,issn_print,issn_online,publisher_name,contact_email,website_url,status,license_name,license_url,copyright_holder,review_blind_type,reviewers_required,apc_enabled,default_apc,currency,settings,created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as null | {
    id: string; name: string; slug: string; short_name: string | null; description: string | null;
    issn_print: string | null; issn_online: string | null; publisher_name: string | null; contact_email: string | null;
    website_url: string | null; status: string; license_name: string | null; license_url: string | null; copyright_holder: string | null;
    review_blind_type: string; reviewers_required: number; apc_enabled: boolean; default_apc: number; currency: string;
    settings: Record<string, unknown> | null; created_at: string;
  };
}

export default async function JournalHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const journal = await getJournalBySlug(slug);
  if (!journal || journal.status !== "active") notFound();

  const supabase = await createClient();

  // fetch stats + current issue + recent articles + issues + accepted manuscripts
  let currentIssue: unknown = null;
  let recentArticles: unknown[] = [];
  let issues: unknown[] = [];
  let acceptedManuscripts: unknown[] = [];
  const announcements: unknown[] = [];
  try {
    const [{ data: iss }, { data: arts }, { data: issList }, { data: accepted }] = await Promise.all([
      supabase.from("issues").select("id,volume,issue_number,title,published_at,slug").eq("journal_id", journal.id).order("published_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("articles").select("id,title,slug,abstract,article_type,published_at,article_number,journal_id, journals(name,slug)").eq("journal_id", journal.id).eq("publication_status", "published").order("published_at", { ascending: false }).limit(6),
      supabase.from("issues").select("id,volume,issue_number,title,published_at,slug").eq("journal_id", journal.id).order("published_at", { ascending: false }).limit(8),
      supabase.from("manuscripts").select("id,title,abstract,article_type,manuscript_number,keywords,accepted_at,status").eq("journal_id", journal.id).in("status", ["accepted", "ready_to_publish"]).order("accepted_at", { ascending: false }).limit(12),
    ]);
    currentIssue = iss ?? null;
    recentArticles = (arts ?? []) as unknown[];
    issues = (issList ?? []) as unknown[];
    acceptedManuscripts = (accepted ?? []) as unknown[];
  } catch {
    // issues table may be empty/missing in dev
  }

  const settings = (journal.settings ?? {}) as Record<string, unknown>;
  const about = (settings["about"] as string) ?? null;
  const aims = (settings["aims_scope"] as string) ?? null;
  const authorGuidelines = (settings["author_guidelines"] as string) ?? null;
  const reviewerGuidelines = (settings["reviewer_guidelines"] as string) ?? null;
  const ethics = (settings["publication_ethics"] as string) ?? null;
  const apcText = (settings["apc_text"] as string) ?? null;

  const coverUrl = (settings["cover_url"] as string) ?? (settings["cover_image_url"] as string) ?? null;
  const logoUrl = (settings["logo_url"] as string) ?? null;

  const issn = journal.issn_online ?? journal.issn_print ?? null;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const canonical = `${baseUrl}/journals/${journal.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Periodical",
    name: journal.name,
    alternateName: journal.short_name ?? undefined,
    issn: issn ?? undefined,
    publisher: journal.publisher_name ? { "@type": "Organization", name: journal.publisher_name } : undefined,
    url: canonical,
    description: journal.description ?? undefined,
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
      { "@type": "ListItem", position: 2, name: "Journals", item: `${baseUrl}/journals` },
      { "@type": "ListItem", position: 3, name: journal.name, item: canonical },
    ],
  };

  const stats = [
    { label: "ISSN", value: issn ?? "—", icon: Hash },
    { label: "Review model", value: journal.review_blind_type.replace(/_/g, " "), icon: Shield },
    { label: "Reviewers", value: String(journal.reviewers_required), icon: Users },
    { label: "APC", value: journal.apc_enabled ? `${journal.currency} ${journal.default_apc}` : "No APC", icon: DollarSign },
  ];

  return (
    <div className="flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      {/* Hero */}
      <section className="border-b bg-gradient-to-br from-muted/60 to-background">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-8">
          <nav className="text-xs text-muted-foreground mb-4">
            <Link href="/" className="hover:text-foreground">Home</Link> <span className="mx-1">/</span>
            <Link href="/journals" className="hover:text-foreground">Journals</Link> <span className="mx-1">/</span>
            <span className="text-foreground font-medium">{journal.name}</span>
          </nav>
          <div className="grid lg:grid-cols-[1fr_340px] gap-6">
            <div className="flex gap-4">
              <div className="h-20 w-20 rounded-xl bg-card border shadow-sm flex items-center justify-center overflow-hidden shrink-0">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt={`${journal.name} logo`} className="h-full w-full object-cover" />
                ) : coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt={`${journal.name} cover`} className="h-full w-full object-cover" />
                ) : (
                  <BookOpen className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight leading-tight">{journal.name}</h1>
                {journal.short_name && <p className="text-sm text-muted-foreground">{journal.short_name}</p>}
                {journal.description && <p className="text-sm leading-6 text-muted-foreground mt-2 max-w-[70ch] line-clamp-3">{journal.description}</p>}
                <div className="flex flex-wrap gap-2 mt-3">
                  {issn && <Badge variant="secondary" className="font-mono text-xs">ISSN {issn}</Badge>}
                  <Badge variant="outline" className="capitalize text-xs">{journal.review_blind_type.replace(/_/g, " ")}</Badge>
                  {journal.publisher_name && <Badge variant="outline" className="text-xs">{journal.publisher_name}</Badge>}
                </div>
              </div>
            </div>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Journal at a glance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  {stats.map((s) => (
                    <div key={s.label} className="rounded-lg bg-muted/50 p-2.5">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1"><s.icon className="h-3 w-3" />{s.label}</p>
                      <p className="text-sm font-medium mt-1 capitalize">{s.value}</p>
                    </div>
                  ))}
                </div>
                <hr className="border-border" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" asChild><Link href={`/journals/${journal.slug}/archive`}><Archive className="h-4 w-4" /> Archive</Link></Button>
                  <Button size="sm" variant="outline" asChild><Link href={`/articles?journal=${journal.slug}`}><FileText className="h-4 w-4" /> Articles</Link></Button>
                  <Button size="sm" variant="outline" asChild><Link href={`/search?journal=${journal.slug}`}><Layers className="h-4 w-4" /> Search</Link></Button>
                </div>
                {journal.contact_email && (
                  <a href={`mailto:${journal.contact_email}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Mail className="h-3 w-3" /> {journal.contact_email}
                  </a>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Tabs sections per TASK §8 */}
      <div className="mx-auto max-w-[1440px] w-full px-4 sm:px-6 lg:px-8 py-6">
        <Tabs defaultValue="about" className="w-full">
          <div className="overflow-x-auto -mx-4 px-4">
            <TabsList className="inline-flex h-auto flex-wrap gap-1 p-1">
              <TabsTrigger value="about">About</TabsTrigger>
              <TabsTrigger value="aims">Aims & Scope</TabsTrigger>
              <TabsTrigger value="board">Editorial Board</TabsTrigger>
              <TabsTrigger value="author">Author Guidelines</TabsTrigger>
              <TabsTrigger value="reviewer">Reviewer Guidelines</TabsTrigger>
              <TabsTrigger value="ethics">Publication Ethics</TabsTrigger>
              <TabsTrigger value="apc">APC</TabsTrigger>
              <TabsTrigger value="announcements">Announcements</TabsTrigger>
              <TabsTrigger value="archive">Archive</TabsTrigger>
              <TabsTrigger value="current">Current Issue</TabsTrigger>
              <TabsTrigger value="articles">Articles</TabsTrigger>
              <TabsTrigger value="accepted">Accepted</TabsTrigger>
              <TabsTrigger value="contact">Contact</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="about" className="mt-6"><SectionCard title="About the Journal" icon={BookOpen} body={about ?? journal.description ?? "Information about this journal will appear here. Editors can update the About section from the journal settings."} /></TabsContent>
          <TabsContent value="aims" className="mt-6"><SectionCard title="Aims & Scope" icon={Layers} body={aims ?? "Aims and scope will be provided by the journal editorial office. This section describes topics, disciplines, and article types welcomed by the journal."} /></TabsContent>
          <TabsContent value="board" className="mt-6"><EditorialBoard journalId={journal.id} /></TabsContent>
          <TabsContent value="author" className="mt-6"><SectionCard title="Author Guidelines" icon={FileText} body={authorGuidelines ?? "Author guidelines: submission preparation, formatting, file requirements, declarations, ethics, and data availability. Contact the editorial office for template files."} /></TabsContent>
          <TabsContent value="reviewer" className="mt-6"><SectionCard title="Reviewer Guidelines" icon={Shield} body={reviewerGuidelines ?? "Reviewer guidelines: evaluation criteria (originality, methodology, literature, results, discussion, writing, significance), confidentiality, and peer review model details."} /></TabsContent>
          <TabsContent value="ethics" className="mt-6"><SectionCard title="Publication Ethics" icon={Shield} body={ethics ?? "Publication ethics follows COPE principles: originality, authorship, conflicts, research ethics, retractions and corrections, and publisher responsibilities."} /></TabsContent>
          <TabsContent value="apc" className="mt-6"><ApcSection journal={journal} text={apcText} /></TabsContent>
          <TabsContent value="announcements" className="mt-6"><AnnouncementsSection journalId={journal.id} /></TabsContent>
          <TabsContent value="archive" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2"><Archive className="h-4 w-4" /> Archive</h3>
                <Button variant="outline" size="sm" asChild><Link href={`/journals/${journal.slug}/archive`}>Full archive →</Link></Button>
              </div>
              {issues.length === 0 ? <Empty text="No issues published yet." /> : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {(issues as Array<{ id: string; volume: number | null; issue_number: number | null; title: string | null; published_at: string | null; slug: string | null }>).map((iss) => (
                    <IssueCard key={iss.id} issue={{ id: iss.id, volume: iss.volume, issue_number: iss.issue_number, title: iss.title, slug: iss.slug, published_at: iss.published_at, journal_slug: journal.slug, journal_name: journal.name }} />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="current" className="mt-6">
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2"><Calendar className="h-4 w-4" /> Current Issue</h3>
              {!currentIssue ? <Empty text="No current issue. The next issue will appear here when published." /> : (() => {
                const ci = currentIssue as { id: string; volume: number | null; issue_number: number | null; title: string | null; published_at: string | null; slug: string | null };
                return (
                  <IssueCard issue={{ id: ci.id, volume: ci.volume, issue_number: ci.issue_number, title: ci.title, slug: ci.slug, published_at: ci.published_at, journal_slug: journal.slug, journal_name: journal.name }} />
                );
              })()}
              {recentArticles.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-semibold mb-3">In this issue — recent articles</h4>
                  <div className="grid md:grid-cols-2 gap-4">
                    {(recentArticles as Array<{ id: string; title: string; slug: string; abstract: string | null; article_type: string | null; published_at: string | null; article_number: string | null; journals: { name: string; slug: string } | null }>).slice(0, 4).map((a) => (
                      <ArticleCard key={a.id} article={{ id: a.id, slug: a.slug, title: a.title, abstract: a.abstract, article_type: a.article_type, published_at: a.published_at, article_number: a.article_number, journal: a.journals ?? undefined }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="articles" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Articles</h3>
                <Button variant="outline" size="sm" asChild><Link href={`/articles?journal=${journal.slug}`}>All articles →</Link></Button>
              </div>
              {recentArticles.length === 0 ? <Empty text="No published articles yet for this journal." /> : (
                <div className="grid md:grid-cols-2 gap-4">
                  {(recentArticles as Array<{ id: string; title: string; slug: string; abstract: string | null; article_type: string | null; published_at: string | null; article_number: string | null; journals: { name: string; slug: string } | null }>).map((a) => (
                    <ArticleCard key={a.id} article={{ id: a.id, slug: a.slug, title: a.title, abstract: a.abstract, article_type: a.article_type, published_at: a.published_at, article_number: a.article_number, journal: a.journals ?? undefined }} />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="accepted" className="mt-6">
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Accepted Articles</h3>
              {acceptedManuscripts.length === 0 ? <Empty text="No accepted articles yet. Accepted papers will appear here once an editor accepts them." /> : (
                <div className="grid md:grid-cols-2 gap-4">
                  {(acceptedManuscripts as Array<{ id: string; title: string; abstract: string | null; article_type: string | null; manuscript_number: string; keywords: string[] | null; accepted_at: string | null; status: string }>).map((m) => (
                    <Card key={m.id} className="hover:shadow-sm transition-shadow">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary" className="capitalize text-xs">{m.article_type?.replace(/_/g, " ") ?? "Article"}</Badge>
                          <Badge variant="outline" className="text-xs">Accepted</Badge>
                          {m.accepted_at && <Badge variant="outline" className="text-xs"><Calendar className="h-3 w-3 mr-1" />{new Date(m.accepted_at).toLocaleDateString()}</Badge>}
                        </div>
                        <h4 className="text-sm font-semibold leading-snug">{m.title}</h4>
                        {m.abstract && <p className="text-sm text-muted-foreground leading-6 line-clamp-3">{m.abstract}</p>}
                        <p className="text-[11px] text-muted-foreground font-mono">{m.manuscript_number}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="contact" className="mt-6">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Mail className="h-4 w-4" /> Contact</CardTitle></CardHeader>
              <CardContent className="text-sm leading-6 space-y-2">
                <p><span className="text-muted-foreground">Journal:</span> {journal.name}</p>
                {journal.contact_email && <p><span className="text-muted-foreground">Email:</span> <a href={`mailto:${journal.contact_email}`} className="text-primary hover:underline">{journal.contact_email}</a></p>}
                {journal.website_url && <p><span className="text-muted-foreground">Website:</span> <a href={journal.website_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{journal.website_url}</a></p>}
                {journal.publisher_name && <p><span className="text-muted-foreground">Publisher:</span> {journal.publisher_name}</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SectionCard({ title, icon: Icon, body }: { title: string; icon: React.ElementType; body: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Icon className="h-4 w-4" />{title}</CardTitle></CardHeader>
      <CardContent><p className="text-sm leading-7 text-muted-foreground whitespace-pre-wrap">{body}</p></CardContent>
    </Card>
  );
}
function Empty({ text }: { text: string }) {
  return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">{text}</CardContent></Card>;
}
async function EditorialBoard({ journalId }: { journalId: string }) {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("journal_members").select("id,role,profiles:profiles!inner(display_name,first_name,last_name)").eq("journal_id", journalId).eq("is_active", true).limit(30);
    if (!data || data.length === 0) return <Empty text="Editorial board will be listed here." />;
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Editorial Board</CardTitle><CardDescription>Journal editorial members</CardDescription></CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(data as unknown as Array<{ id: string; role: string; profiles: { display_name: string | null; first_name: string | null; last_name: string | null } }>).map((m) => {
              const p = m.profiles;
              const name = p?.display_name ?? [p?.first_name, p?.last_name].filter(Boolean).join(" ") ?? "Member";
              return <div key={m.id} className="rounded-lg border p-3"><p className="text-sm font-medium">{name}</p><p className="text-xs text-muted-foreground capitalize">{m.role.replace(/_/g, " ")}</p></div>;
            })}
          </div>
        </CardContent>
      </Card>
    );
  } catch {
    return <Empty text="Editorial board will be listed here." />;
  }
}
function ApcSection({ journal, text }: { journal: { apc_enabled: boolean; default_apc: number; currency: string; license_name: string | null }; text: string | null }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4" /> Article Processing Charge (APC)</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm leading-6">
        {journal.apc_enabled ? (
          <>
            <p><span className="font-medium">APC:</span> {journal.currency} {journal.default_apc.toLocaleString()} {journal.license_name ? `— License: ${journal.license_name}` : ""}</p>
            <p className="text-muted-foreground whitespace-pre-wrap">{text ?? "APC covers peer review management, production, DOI registration, and open access hosting. Waivers and discounts are available per journal policy — contact the editorial office."}</p>
          </>
        ) : (
          <p className="text-muted-foreground">No APC is charged for this journal. {text ?? ""}</p>
        )}
      </CardContent>
    </Card>
  );
}
async function AnnouncementsSection({ journalId }: { journalId: string }) {
  try {
    const supabase = await createClient();
    // announcements table may not exist in dev; tolerate
    const { data } = await supabase.from("announcements" as never).select("id,title,body,published_at" as never).eq("journal_id" as never, journalId).order("published_at" as never, { ascending: false }).limit(5) as unknown as { data: Array<{ id: string; title: string; body: string; published_at: string | null }> | null };
    if (!data || data.length === 0) return <Empty text="No announcements yet." />;
    return (
      <div className="space-y-3">
        {data.map((a) => (
          <Card key={a.id}><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Megaphone className="h-4 w-4" />{a.title}</CardTitle>{a.published_at && <CardDescription>{new Date(a.published_at).toLocaleDateString()}</CardDescription>}</CardHeader><CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.body}</p></CardContent></Card>
        ))}
      </div>
    );
  } catch {
    return <Empty text="No announcements yet." />;
  }
}

