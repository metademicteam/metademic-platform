"use client";
import * as React from "react";
import { Copy, Check, Download, FileText, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Props = {
  article: {
    title: string;
    slug: string;
    authors?: Array<{ first_name?: string; last_name: string; orcid?: string | null }>;
    authorString?: string;
    journalName?: string;
    volume?: string | number | null;
    issue?: string | number | null;
    year?: string | number | null;
    pages?: string | null;
    doi?: string | null;
    url?: string;
    published_at?: string | null;
  };
};

function buildBibtex(a: Props["article"]) {
  const key = (a.authors?.[0]?.last_name ?? "metademic").toLowerCase() + (a.year ?? new Date().getFullYear());
  const authors = (a.authors ?? []).map((x) => `${x.last_name}, ${x.first_name ?? ""}`.trim()).join(" and ") || a.authorString || "Unknown";
  return `@article{${key},
  title={${a.title}},
  author={${authors}},
  journal={${a.journalName ?? "Metademic"}},
  year={${a.year ?? new Date().getFullYear()}},
  volume={${a.volume ?? ""}},
  number={${a.issue ?? ""}},
  pages={${a.pages ?? ""}},
  doi={${a.doi ?? ""}},
  url={${a.url ?? ""}}
}`;
}
function buildRis(a: Props["article"]) {
  const year = String(a.year ?? (a.published_at ? new Date(a.published_at).getFullYear() : new Date().getFullYear()));
  const lines = [
    "TY  - JOUR",
    `TI  - ${a.title}`,
    ...((a.authors ?? []).map((x) => `AU  - ${x.last_name}, ${x.first_name ?? ""}`.trim())),
    `JO  - ${a.journalName ?? "Metademic"}`,
    `PY  - ${year}`,
    a.volume ? `VL  - ${a.volume}` : null,
    a.issue ? `IS  - ${a.issue}` : null,
    a.pages ? `SP  - ${a.pages}` : null,
    a.doi ? `DO  - ${a.doi}` : null,
    a.url ? `UR  - ${a.url}` : null,
    "ER  -",
  ].filter(Boolean);
  return lines.join("\n");
}
function buildEndNote(a: Props["article"]) {
  // EndNote tagged
  return `%0 Journal Article
%T ${a.title}
${(a.authors ?? []).map((x) => `%A ${x.last_name}, ${x.first_name ?? ""}`).join("\n")}
%J ${a.journalName ?? "Metademic"}
%D ${a.year ?? new Date().getFullYear()}
${a.volume ? `%V ${a.volume}` : ""}
${a.issue ? `%N ${a.issue}` : ""}
${a.pages ? `%P ${a.pages}` : ""}
${a.doi ? `%R ${a.doi}` : ""}
%U ${a.url ?? ""}
`;
}

export function CitationTools({ article }: Props) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const bibtex = React.useMemo(() => buildBibtex(article), [article]);
  const ris = React.useMemo(() => buildRis(article), [article]);
  const endnote = React.useMemo(() => buildEndNote(article), [article]);

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }
  function download(text: string, filename: string) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const baseUrl = article.url ?? (typeof window !== "undefined" ? window.location.href : "");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Quote className="h-4 w-4" /> Cite this article
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="bibtex">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="bibtex">BibTeX</TabsTrigger>
            <TabsTrigger value="ris">RIS</TabsTrigger>
            <TabsTrigger value="endnote">EndNote</TabsTrigger>
          </TabsList>
          {[
            { id: "bibtex", val: bibtex, file: `${article.slug}.bib` },
            { id: "ris", val: ris, file: `${article.slug}.ris` },
            { id: "endnote", val: endnote, file: `${article.slug}.enw` },
          ].map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="space-y-2">
              <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-[220px] whitespace-pre-wrap break-words font-mono">
                {tab.val}
              </pre>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => copy(tab.val, tab.id)}>
                  {copied === tab.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied === tab.id ? "Copied" : "Copy"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => download(tab.val, tab.file)}>
                  <Download className="h-4 w-4" /> Download .{tab.file.split(".").pop()}
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
        {baseUrl && (
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            <FileText className="h-3 w-3" /> Canonical: <span className="font-mono break-all">{baseUrl}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
