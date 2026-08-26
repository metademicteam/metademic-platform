import Link from "next/link";
import { Calendar, BookMarked, Hash } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type IssueCardProps = {
  issue: {
    id: string;
    volume?: number | string | null;
    issue_number?: number | string | null;
    title?: string | null;
    slug?: string | null;
    cover_url?: string | null;
    published_at?: string | null;
    year?: number | null;
    journal_slug?: string | null;
    journal_name?: string | null;
    article_count?: number;
    is_special?: boolean;
  };
};

export function IssueCard({ issue }: IssueCardProps) {
  const label =
    issue.title ??
    `Volume ${issue.volume ?? "?"} — Issue ${issue.issue_number ?? "?"}`;
  const href = issue.id ? `/issues/${issue.id}` : "#";
  return (
    <Link href={href} className="group">
      <Card className="h-full hover:shadow-md transition-shadow overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-md bg-secondary flex items-center justify-center shrink-0">
              <BookMarked className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-sm leading-tight line-clamp-2 group-hover:text-primary">{label}</CardTitle>
              {issue.journal_name && <CardDescription className="text-xs">{issue.journal_name}</CardDescription>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {issue.volume != null && (
              <Badge variant="secondary" className="text-[11px]">
                <Hash className="h-3 w-3 mr-1" /> Vol {String(issue.volume)}
              </Badge>
            )}
            {issue.issue_number != null && <Badge variant="outline" className="text-[11px]">No {String(issue.issue_number)}</Badge>}
            {issue.is_special && <Badge className="text-[11px]">Special Issue</Badge>}
            {issue.published_at && (
              <Badge variant="outline" className="text-[11px]">
                <Calendar className="h-3 w-3 mr-1" />
                {new Date(issue.published_at).getFullYear()}
              </Badge>
            )}
            {typeof issue.article_count === "number" && (
              <Badge variant="outline" className="text-[11px]">{issue.article_count} articles</Badge>
            )}
          </div>
          <span className="text-xs font-medium text-primary group-hover:underline inline-flex">Browse issue →</span>
        </CardContent>
      </Card>
    </Link>
  );
}
