import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/journals`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/articles`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/issues`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/search`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  try {
    const supabase = await createClient();
    const [journals, articles, issues] = await Promise.all([
      supabase.from("journals").select("slug,updated_at").eq("status", "active").limit(500),
      supabase.from("articles").select("slug,updated_at,published_at").eq("publication_status", "published").order("published_at", { ascending: false }).limit(1000),
      supabase.from("issues").select("id,updated_at,published_at").order("published_at", { ascending: false }).limit(500),
    ]);

    const journalRoutes: MetadataRoute.Sitemap = ((journals.data ?? []) as Array<{ slug: string; updated_at: string | null }>).map((j) => ({
      url: `${base}/journals/${j.slug}`,
      lastModified: j.updated_at ? new Date(j.updated_at) : now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
    const journalArchiveRoutes: MetadataRoute.Sitemap = ((journals.data ?? []) as Array<{ slug: string }>).map((j) => ({
      url: `${base}/journals/${j.slug}/archive`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
    const articleRoutes: MetadataRoute.Sitemap = ((articles.data ?? []) as Array<{ slug: string; updated_at: string | null; published_at: string | null }>).map((a) => ({
      url: `${base}/articles/${a.slug}`,
      lastModified: a.updated_at ? new Date(a.updated_at) : a.published_at ? new Date(a.published_at) : now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
    let issueRoutes: MetadataRoute.Sitemap = [];
    try {
      issueRoutes = ((issues.data ?? []) as Array<{ id: string; updated_at: string | null; published_at: string | null }>).map((iss) => ({
        url: `${base}/issues/${iss.id}`,
        lastModified: iss.updated_at ? new Date(iss.updated_at) : iss.published_at ? new Date(iss.published_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));
    } catch {}

    return [...staticRoutes, ...journalRoutes, ...journalArchiveRoutes, ...articleRoutes, ...issueRoutes];
  } catch {
    return staticRoutes;
  }
}
