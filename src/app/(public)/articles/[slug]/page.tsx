import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Download, Eye, Calendar, Hash, Link2, Quote, BarChart3, Image as ImageIcon, Table as TableIcon, BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CitationTools } from "@/components/public/CitationTools";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("articles").select("title,abstract,slug,published_at,journals(name)").eq("slug", slug).maybeSingle();
    if (!data) return { title: "Article — Metademic" };
    const a = data as unknown as { title: string; abstract: string | null; slug: string; journals: { name: string } | null };
    const title = `${a.title} — Metademic`;
    const desc = (a.abstract ?? "").slice(0, 160) || `Article ${a.title}`;
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return {
      title,
      description: desc,
      openGraph: { title, description: desc.slice(0, 200), type: "article", url: `${base}/articles/${slug}` },
      twitter: { card: "summary_large_image", title, description: desc.slice(0, 160) },
      alternates: { canonical: `/articles/${slug}` },
    };
  } catch {
    return { title: "Article — Metademic" };
  }
}

type ArticleRow = {
  id: string; manuscript_id: string; journal_id: string; issue_id: string | null;
  title: string; abstract: string | null; article_type: string; slug: string; article_number: string;
  publication_status: string; received_at: string | null; revised_at: string | null; accepted_at: string | null; published_at: string | null;
  license_name: string | null; license_url: string | null; copyright_holder: string | null;
  metadata: Record<string, unknown> | null;
  journals: { id: string; name: string; slug: string; issn_online: string | null } | null;
  issues: { id: string; issue_number: number | null; title: string | null; volumes: { volume_number: number | null } | null } | null;
};

async function getArticle(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("articles")
    .select("id,manuscript_id,journal_id,issue_id,title,abstract,article_type,slug,article_number,publication_status,received_at,revised_at,accepted_at,published_at,license_name,license_url,copyright_holder,metadata, journals(id,name,slug,issn_online), issues(id,issue_number,title, volumes(volume_number))")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data as unknown as ArticleRow;
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article || article.publication_status !== "published") notFound();

  const supabase = await createClient();

  // authors: try article_authors then manuscript_authors fallback
  let authors: Array<{ first_name: string; last_name: string; orcid: string | null; affiliation: string | null; is_corresponding: boolean; author_order: number }> = [];
  try {
    const { data: aa } = await supabase.from("article_authors" as never).select("*" as never).eq("article_id" as never, article.id).order("author_order" as never) as unknown as { data: unknown[] | null };
    if (aa && aa.length > 0) {
      authors = (aa as unknown as Array<Record<string, unknown>>).map((r) => ({
        first_name: String(r["first_name"] ?? r["given_name"] ?? ""),
        last_name: String(r["last_name"] ?? r["family_name"] ?? ""),
        orcid: (r["orcid"] as string | null) ?? null,
        affiliation: (r["affiliation"] as string | null) ?? (r["institution_name_snapshot"] as string | null) ?? null,
        is_corresponding: Boolean(r["is_corresponding"]),
        author_order: Number(r["author_order"] ?? 0),
      }));
    } else {
      const { data: ma } = await supabase.from("manuscript_authors").select("first_name,last_name,orcid,institution_name_snapshot,is_corresponding,author_order").eq("manuscript_id", article.manuscript_id).order("author_order");
      authors = ((ma ?? []) as Array<{ first_name: string; last_name: string; orcid: string | null; institution_name_snapshot: string | null; is_corresponding: boolean; author_order: number }>).map((r) => ({
        first_name: r.first_name, last_name: r.last_name, orcid: r.orcid, affiliation: r.institution_name_snapshot, is_corresponding: r.is_corresponding, author_order: r.author_order,
      }));
    }
  } catch {
    authors = [];
  }

  // doi
  let doi: { doi: string; doi_url: string; registration_status: string } | null = null;
  try {
    const { data } = await supabase.from("doi_records").select("doi,doi_url,registration_status").eq("article_id", article.id).maybeSingle();
    if (data) doi = data as unknown as { doi: string; doi_url: string; registration_status: string };
  } catch {}

  // references: from article metadata or manuscript files? placeholder
  const references: string[] = Array.isArray((article.metadata as Record<string, unknown> | null)?.["references"])
    ? ((article.metadata as Record<string, unknown>)["references"] as string[])
    : [];
  const keywords: string[] = Array.isArray((article.metadata as Record<string, unknown> | null)?.["keywords"])
    ? ((article.metadata as Record<string, unknown>)["keywords"] as string[])
    : [];

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const canonical = `${baseUrl}/articles/${article.slug}`;
  const pdfUrl = (article.metadata?.["pdf_url"] as string) ?? (article.metadata?.["published_pdf_url"] as string) ?? null;
  const htmlUrl = (article.metadata?.["html_url"] as string) ?? null;

  const year = article.published_at ? new Date(article.published_at).getFullYear() : null;
  const volume = article.issues?.volumes?.volume_number ?? null;
  const issueNo = article.issues?.issue_number ?? null;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ScholarlyArticle",
    headline: article.title,
    abstract: article.abstract ?? undefined,
    datePublished: article.published_at ?? undefined,
    dateCreated: article.received_at ?? undefined,
    author: authors.map((a) => ({ "@type": "Person", name: `${a.first_name} ${a.last_name}`.trim(), identifier: a.orcid ?? undefined, affiliation: a.affiliation ?? undefined })),
    isPartOf: article.journals ? { "@type": "Periodical", name: article.journals.name, issn: article.journals.issn_online ?? undefined } : undefined,
    identifier: doi?.doi ?? undefined,
    url: canonical,
    license: article.license_url ?? undefined,
    publisher: { "@type": "Organization", name: article.journals?.name ?? "Metademic" },
    keywords: keywords.length ? keywords.join(", ") : undefined,
  };

  return (
    <div className="mx-auto max-w-[1100px] px-4 sm:px-6 lg:px-8 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <link rel="canonical" href={canonical} />

      <nav className="text-xs text-muted-foreground mb-4">
        <Link href="/" className="hover:text-foreground">Home</Link> <span className="mx-1">/</span>
        <Link href="/articles" className="hover:text-foreground">Articles</Link> <span className="mx-1">/</span>
        <span className="text-foreground font-medium line-clamp-1">{article.title}</span>
      </nav>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Main */}
        <div className="min-w-0 space-y-6">
          <div>
            <div className="flex flex-wrap gap-2 mb-3">
              <Badge variant="secondary" className="capitalize">{article.article_type.replace(/_/g, " ")}</Badge>
              {article.journals && (
                <Badge variant="outline">
                  <Link href={`/journals/${article.journals.slug}`} className="hover:text-primary">{article.journals.name}</Link>
                </Badge>
              )}
              {article.issues && <Badge variant="outline">Vol {article.issues.volumes?.volume_number ?? "?"} No {article.issues.issue_number ?? "?"}</Badge>}
              {doi && <Badge variant="outline" className="font-mono text-[11px]">{doi.doi}</Badge>}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight leading-snug">{article.title}</h1>

            {/* Authors */}
            <div className="mt-4">
              {authors.length === 0 ? (
                <p className="text-sm text-muted-foreground">Authors will be listed here.</p>
              ) : (
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {authors.map((a, i) => (
                    <span key={i} className="text-sm">
                      <span className="font-medium">{a.first_name} {a.last_name}</span>
                      {a.is_corresponding && <sup className="text-primary ml-0.5" title="Corresponding author">*</sup>}
                      {a.orcid && (
                        <a href={`https://orcid.org/${a.orcid}`} target="_blank" rel="noreferrer" className="ml-1 text-xs text-primary hover:underline" title="ORCID">
                          ORCID
                        </a>
                      )}
                      {a.affiliation && <span className="text-xs text-muted-foreground block">{a.affiliation}</span>}
                    </span>
                  ))}
                </div>
              )}
              {authors.some((a) => a.is_corresponding) && <p className="text-xs text-muted-foreground mt-2">* Corresponding author</p>}
            </div>

            {/* History */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {[
                { label: "Received", value: article.received_at },
                { label: "Revised", value: article.revised_at },
                { label: "Accepted", value: article.accepted_at },
                { label: "Published", value: article.published_at },
              ].map((r) => (
                <div key={r.label} className="rounded-lg bg-muted/50 p-2.5">
                  <p className="text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />{r.label}</p>
                  <p className="font-medium mt-1">{r.value ? new Date(r.value).toLocaleDateString() : "—"}</p>
                </div>
              ))}
            </div>
          </div>

          {/* DOI + license row */}
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-3 text-sm">
              {doi ? (
                <a href={doi.doi_url ?? `https://doi.org/${doi.doi}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline font-mono text-xs">
                  <Link2 className="h-4 w-4" /> {doi.doi} <span className="text-muted-foreground">({doi.registration_status})</span>
                </a>
              ) : (
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Hash className="h-3 w-3" /> No DOI registered yet</span>
              )}
              <span className="hidden sm:block h-4 w-px bg-border" />
              <span className="text-xs flex items-center gap-1">
                <BookOpen className="h-3 w-3" /> {article.license_name ?? "CC BY 4.0"}
                {article.license_url && <a href={article.license_url} target="_blank" rel="noreferrer" className="text-primary hover:underline ml-1">(license)</a>}
              </span>
              <div className="ml-auto flex gap-2">
                {pdfUrl ? (
                  <Button size="sm" asChild><a href={pdfUrl} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /> Download PDF</a></Button>
                ) : (
                  <Button size="sm" disabled><Download className="h-4 w-4" /> PDF — pending</Button>
                )}
                {htmlUrl ? (
                  <Button size="sm" variant="outline" asChild><a href={htmlUrl} target="_blank" rel="noreferrer"><Eye className="h-4 w-4" /> View HTML</a></Button>
                ) : (
                  <Button size="sm" variant="outline" disabled><Eye className="h-4 w-4" /> HTML</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Abstract */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Abstract</CardTitle></CardHeader>
            <CardContent>
              {article.abstract ? <p className="text-sm leading-7 whitespace-pre-wrap">{article.abstract}</p> : <p className="text-sm text-muted-foreground">No abstract available.</p>}
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {keywords.map((k) => <Badge key={k} variant="secondary" className="text-xs">{k}</Badge>)}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Figures / Tables placeholders */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ImageIcon className="h-4 w-4" /> Figures</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">Figures will be displayed here when provided during production. Cloudinary-hosted figure assets are rendered per article.</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TableIcon className="h-4 w-4" /> Tables</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">Tables will be displayed here when provided during production.</CardContent>
            </Card>
          </div>

          {/* References */}
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Quote className="h-4 w-4" /> References</CardTitle><CardDescription>{references.length ? `${references.length} references` : "References placeholder"}</CardDescription></CardHeader>
            <CardContent>
              {references.length === 0 ? (
                <p className="text-sm text-muted-foreground">References will be listed here. Structured reference metadata is stored per article and exported via JATS.</p>
              ) : (
                <ol className="list-decimal pl-5 space-y-1 text-sm leading-6">
                  {references.map((r, i) => <li key={i}>{r}</li>)}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <CitationTools
            article={{
              title: article.title,
              slug: article.slug,
              authors: authors.map((a) => ({ first_name: a.first_name, last_name: a.last_name, orcid: a.orcid })),
              journalName: article.journals?.name ?? "Metademic",
              volume: volume != null ? String(volume) : null,
              issue: issueNo != null ? String(issueNo) : null,
              year: year,
              pages: null,
              doi: doi?.doi ?? null,
              url: canonical,
              published_at: article.published_at,
            }}
          />

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Metrics</CardTitle></CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted p-2"><p className="font-semibold text-foreground">—</p><p>Views</p></div>
                <div className="rounded-lg bg-muted p-2"><p className="font-semibold text-foreground">—</p><p>Downloads</p></div>
                <div className="rounded-lg bg-muted p-2"><p className="font-semibold text-foreground">—</p><p>Citations</p></div>
              </div>
              <p>Metrics placeholders — integrate Altmetric / Crossref / Dimensions when available.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Article info</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-1">
              <p><span className="text-muted-foreground">Article number:</span> {article.article_number}</p>
              <p><span className="text-muted-foreground">Type:</span> <span className="capitalize">{article.article_type.replace(/_/g, " ")}</span></p>
              <p><span className="text-muted-foreground">Journal:</span> {article.journals ? <Link href={`/journals/${article.journals.slug}`} className="text-primary hover:underline">{article.journals.name}</Link> : "—"}</p>
              {article.copyright_holder && <p><span className="text-muted-foreground">Copyright:</span> {article.copyright_holder}</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
