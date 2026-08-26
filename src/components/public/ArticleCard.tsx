"use client";
import Link from "next/link";
import { Calendar, BookOpen, Tag, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ArticleCardProps = {
  article: {
    id: string;
    slug: string;
    title: string;
    abstract?: string | null;
    article_type?: string | null;
    published_at?: string | null;
    article_number?: string | null;
    issue_label?: string | null;
    journal?: { name?: string; slug?: string } | null;
    journal_name?: string | null;
    journal_slug?: string | null;
    authors?: Array<{ name: string } | string> | null;
    doi?: string | null;
  };
  className?: string;
};

function fmtDate(s?: string | null) {
  if (!s) return null;
  try {
    return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return s;
  }
}

export function ArticleCard({ article, className }: ArticleCardProps) {
  const jName = article.journal?.name ?? article.journal_name ?? null;
  const jSlug = article.journal?.slug ?? article.journal_slug ?? null;
  const authors = (article.authors ?? []) as Array<string | { name: string }>;
  const authorLabel =
    authors.length === 0
      ? null
      : authors
          .slice(0, 3)
          .map((a) => (typeof a === "string" ? a : a.name))
          .join(", ") + (authors.length > 3 ? " et al." : "");

  return (
    <Card className={cn("h-full flex flex-col hover:shadow-md transition-shadow", className)}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {article.article_type && (
            <Badge variant="secondary" className="capitalize text-[11px]">
              <Tag className="h-3 w-3 mr-1" /> {article.article_type.replace(/_/g, " ")}
            </Badge>
          )}
          {jName && jSlug && (
            <Link href={`/journals/${jSlug}`} className="text-muted-foreground hover:text-primary hover:underline">
              <span className="inline-flex items-center gap-1">
                <BookOpen className="h-3 w-3" /> {jName}
              </span>
            </Link>
          )}
          {article.published_at && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3 w-3" /> {fmtDate(article.published_at)}
            </span>
          )}
        </div>
        <CardTitle className="text-[15px] leading-snug line-clamp-3 mt-2">
          <Link href={`/articles/${article.slug}`} className="hover:text-primary hover:underline underline-offset-4">
            {article.title}
          </Link>
        </CardTitle>
        {authorLabel && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 line-clamp-1">
            <Users className="h-3 w-3 shrink-0" /> {authorLabel}
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0 flex-1 flex flex-col">
        {article.abstract && (
          <p className="text-[13px] leading-relaxed text-muted-foreground line-clamp-3">{article.abstract}</p>
        )}
        <div className="flex items-center justify-between mt-3">
          <Link
            href={`/articles/${article.slug}`}
            className="text-xs font-medium text-primary hover:underline"
          >
            Read article →
          </Link>
          {article.doi && <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[150px]">{article.doi}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
