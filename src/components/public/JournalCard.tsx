import Link from "next/link";
import { BookOpen, Hash, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type JournalCardProps = {
  journal: {
    id: string;
    name: string;
    slug: string;
    short_name?: string | null;
    description?: string | null;
    issn_print?: string | null;
    issn_online?: string | null;
    publisher_name?: string | null;
    status?: string;
    logo_url?: string | null;
    cover_url?: string | null;
    settings?: Record<string, unknown> | null;
  };
  articleCount?: number;
};

export function JournalCard({ journal, articleCount }: { journal: JournalCardProps["journal"]; articleCount?: number }) {
  const logo =
    (journal.settings as unknown as { logo_url?: string; cover_url?: string } | undefined)?.logo_url ??
    journal.logo_url ??
    null;
  return (
    <Link href={`/journals/${journal.slug}`} className="group">
      <Card className="h-full overflow-hidden transition-all hover:shadow-lg hover:border-primary/20 flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex gap-3">
            <div className="h-12 w-12 shrink-0 rounded-lg bg-primary text-primary-foreground flex items-center justify-center overflow-hidden border">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={`${journal.name} logo`} className="h-full w-full object-cover" />
              ) : (
                <BookOpen className="h-6 w-6" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-[15px] leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                {journal.name}
              </CardTitle>
              {journal.short_name && (
                <p className="text-xs text-muted-foreground mt-0.5">{journal.short_name}</p>
              )}
            </div>
          </div>
          {journal.description && (
            <CardDescription className="line-clamp-3 text-[13px] leading-relaxed mt-2">
              {journal.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="pt-0 mt-auto space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {journal.issn_online && (
              <Badge variant="secondary" className="text-[11px] font-mono">
                <Hash className="h-3 w-3 mr-1" /> e-ISSN {journal.issn_online}
              </Badge>
            )}
            {journal.issn_print && !journal.issn_online && (
              <Badge variant="secondary" className="text-[11px] font-mono">
                ISSN {journal.issn_print}
              </Badge>
            )}
            {journal.publisher_name && (
              <Badge variant="outline" className="text-[11px]">
                <Globe className="h-3 w-3 mr-1" /> {journal.publisher_name}
              </Badge>
            )}
            {typeof articleCount === "number" && (
              <Badge variant="outline" className="text-[11px]">{articleCount} articles</Badge>
            )}
          </div>
          <span className="inline-flex items-center text-xs font-medium text-primary group-hover:underline">
            Visit journal →
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
