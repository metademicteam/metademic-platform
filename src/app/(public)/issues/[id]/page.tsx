import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookMarked, Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArticleCard } from "@/components/public/ArticleCard";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Issue ${id} — Metademic` };
}

export default async function IssueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  let issue: { id: string; volume: number | null; issue_number: number | null; title: string | null; published_at: string | null; journal_id: string; journals: { name: string; slug: string } | null } | null = null;
  try {
    const { data, error } = await supabase.from("issues").select("id,volume,issue_number,title,published_at,journal_id, journals(name,slug)").eq("id", id).maybeSingle();
    if (error) throw error;
    issue = (data as unknown as { id: string; volume: number | null; issue_number: number | null; title: string | null; published_at: string | null; journal_id: string; journals: { name: string; slug: string } | null } | null);
  } catch {}
  if (!issue) notFound();

  let articles: Array<{ id: string; title: string; slug: string; abstract: string | null; article_type: string | null; published_at: string | null; article_number: string | null }> = [];
  try {
    const { data } = await supabase.from("articles").select("id,title,slug,abstract,article_type,published_at,article_number").eq("issue_id", id).eq("publication_status", "published").order("published_at", { ascending: false });
    articles = (data ?? []) as unknown as typeof articles;
  } catch {}

  const label = issue.title ?? `Volume ${issue.volume ?? "?"} — Issue ${issue.issue_number ?? "?"}`;

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-8">
      <nav className="text-xs text-muted-foreground mb-4">
        <Link href="/" className="hover:text-foreground">Home</Link> <span className="mx-1">/</span>
        <Link href="/issues" className="hover:text-foreground">Issues</Link> <span className="mx-1">/</span>
        <span className="text-foreground font-medium">{label}</span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><BookMarked className="h-6 w-6" /> {label}</h1>
          {issue.journals && <p className="text-sm text-muted-foreground mt-1"><Link href={`/journals/${issue.journals.slug}`} className="hover:text-primary hover:underline">{issue.journals.name}</Link></p>}
          <div className="flex flex-wrap gap-2 mt-3">
            {issue.volume != null && <Badge variant="secondary">Volume {issue.volume}</Badge>}
            {issue.issue_number != null && <Badge variant="outline">Issue {issue.issue_number}</Badge>}
            {issue.published_at && <Badge variant="outline"><Calendar className="h-3 w-3 mr-1" />{new Date(issue.published_at).toLocaleDateString()}</Badge>}
            <Badge variant="outline">{articles.length} article{articles.length !== 1 ? "s" : ""}</Badge>
          </div>
        </div>
      </div>

      <div className="mt-8">
        {articles.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No articles in this issue yet.</CardContent></Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {articles.map((a) => (
              <ArticleCard key={a.id} article={{ id: a.id, slug: a.slug, title: a.title, abstract: a.abstract, article_type: a.article_type, published_at: a.published_at, article_number: a.article_number, journal: issue!.journals ?? undefined }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
