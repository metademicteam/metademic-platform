import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IssueCard } from "@/components/public/IssueCard";
import { Badge } from "@/components/ui/badge";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Archive — ${slug} — Metademic`, description: `Archive of volumes and issues for ${slug}` };
}

export default async function JournalArchivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: journal } = await supabase.from("journals").select("id,name,slug").eq("slug", slug).maybeSingle();
  if (!journal) notFound();
  const j = journal as { id: string; name: string; slug: string };

  let issues: Array<{ id: string; volume: number | null; issue_number: number | null; title: string | null; published_at: string | null; slug: string | null }> = [];
  try {
    const { data } = await supabase
      .from("issues")
      .select("id,volume,issue_number,title,published_at,slug")
      .eq("journal_id", j.id)
      .order("volume", { ascending: false })
      .order("issue_number", { ascending: false });
    issues = (data ?? []) as typeof issues;
  } catch {
    issues = [];
  }

  // Group by volume
  const byVolume = new Map<string, typeof issues>();
  for (const iss of issues) {
    const key = iss.volume != null ? `Volume ${iss.volume}` : "No volume";
    if (!byVolume.has(key)) byVolume.set(key, []);
    byVolume.get(key)!.push(iss);
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-8">
      <nav className="text-xs text-muted-foreground mb-4">
        <Link href="/" className="hover:text-foreground">Home</Link> <span className="mx-1">/</span>
        <Link href="/journals" className="hover:text-foreground">Journals</Link> <span className="mx-1">/</span>
        <Link href={`/journals/${j.slug}`} className="hover:text-foreground">{j.name}</Link> <span className="mx-1">/</span>
        <span className="text-foreground font-medium">Archive</span>
      </nav>
      <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
        <Archive className="h-6 w-6" /> Archive — {j.name}
      </h1>
      <p className="text-sm text-muted-foreground mt-1">Browse all volumes and issues.</p>

      {issues.length === 0 ? (
        <Card className="mt-6"><CardContent className="py-12 text-center text-sm text-muted-foreground">No issues archived yet for this journal.</CardContent></Card>
      ) : (
        <div className="mt-8 space-y-8">
          {Array.from(byVolume.entries()).map(([vol, list]) => (
            <div key={vol}>
              <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Calendar className="h-4 w-4" /> {vol} <Badge variant="secondary" className="ml-1">{list.length} issue{list.length !== 1 ? "s" : ""}</Badge>
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {list.map((iss) => (
                  <IssueCard key={iss.id} issue={{ id: iss.id, volume: iss.volume, issue_number: iss.issue_number, title: iss.title, slug: iss.slug, published_at: iss.published_at, journal_slug: j.slug, journal_name: j.name }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
