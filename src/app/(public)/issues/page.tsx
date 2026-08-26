import type { Metadata } from "next";
import { BookMarked, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { IssueCard } from "@/components/public/IssueCard";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata: Metadata = { title: "Issues — Metademic", description: "Browse volumes and issues across all journals." };

const PAGE_SIZE = 12;

export default async function IssuesPage({ searchParams }: { searchParams: Promise<{ q?: string; journal?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const journal = (sp.journal ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  // Try to fetch with journal join; fallback to simple
  let data: unknown[] = [];
  let count = 0;
  try {
    let query = supabase.from("issues").select("id,volume,issue_number,title,published_at,slug,journal_id, journals(name,slug)", { count: "exact" }).order("published_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
    if (q) {
      const safe = q.replace(/[%_\\]/g, "\\$&");
      query = query.or(`title.ilike.%${safe}%,slug.ilike.%${safe}%`);
    }
    if (journal) query = query.eq("journals.slug", journal);
    const res = await query;
    if (res.error) throw res.error;
    data = (res.data ?? []) as unknown[];
    count = res.count ?? 0;
  } catch {
    data = [];
  }
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><BookMarked className="h-6 w-6" /> Issues</h1>
      <p className="text-sm text-muted-foreground mt-1">Browse volumes and issues — filter by journal.</p>

      <form action="/issues" method="get" className="mt-6 flex gap-2 max-w-[560px]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search issue title…" className="pl-9" />
        </div>
        <Input name="journal" defaultValue={journal} placeholder="Journal slug" className="max-w-[200px]" />
        <Button type="submit">Search</Button>
      </form>

      {data.length === 0 ? (
        <Card className="mt-6"><CardContent className="py-12 text-center text-sm text-muted-foreground">No issues found.</CardContent></Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mt-4">{count} issue{count !== 1 ? "s" : ""} — page {page} of {totalPages}</p>
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(data as Array<{ id: string; volume: number | null; issue_number: number | null; title: string | null; published_at: string | null; slug: string | null; journals: { name: string; slug: string } | null }>).map((iss) => (
              <IssueCard key={iss.id} issue={{ id: iss.id, volume: iss.volume, issue_number: iss.issue_number, title: iss.title, slug: iss.slug, published_at: iss.published_at, journal_slug: iss.journals?.slug, journal_name: iss.journals?.name }} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-6">
              <Button variant="outline" size="sm" disabled={page <= 1} asChild={page > 1}><Link href={`/issues?${new URLSearchParams({ ...(q && { q }), ...(journal && { journal }), page: String(page - 1) })}`}>Previous</Link></Button>
              <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} asChild={page < totalPages}><Link href={`/issues?${new URLSearchParams({ ...(q && { q }), ...(journal && { journal }), page: String(page + 1) })}`}>Next</Link></Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
