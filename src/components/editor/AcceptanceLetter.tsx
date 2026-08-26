"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FileCheck, Printer, Mail } from "lucide-react";

export interface AcceptanceLetterProps {
  journalName: string;
  journalSlug?: string | null;
  manuscriptNumber: string;
  articleTitle: string;
  authors: string[];
  acceptanceDate: string; // ISO
  editorName?: string | null;
  nextSteps?: string | null;
  manuscriptId?: string;
  actionUrl?: string;
}

export function AcceptanceLetter({
  journalName,
  manuscriptNumber,
  articleTitle,
  authors,
  acceptanceDate,
  editorName,
  nextSteps,
  actionUrl,
}: AcceptanceLetterProps) {
  const dateStr = new Date(acceptanceDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Card className="border-2 overflow-hidden">
      <CardHeader className="bg-muted/30 border-b">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Acceptance Letter</CardTitle>
              <Badge variant="default">Accepted</Badge>
            </div>
            <CardDescription className="mt-1">
              {journalName} · {manuscriptNumber}
            </CardDescription>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            {actionUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={actionUrl}>
                  <Mail className="h-4 w-4" /> View manuscript
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 sm:p-8 space-y-6 print:p-8">
        <div className="text-center space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">
            {journalName}
          </p>
          <h2 className="text-xl font-semibold tracking-tight">Letter of Acceptance</h2>
          <p className="text-xs text-muted-foreground">{dateStr}</p>
        </div>

        <Separator />

        <div className="space-y-4 text-sm leading-relaxed">
          <p>Dear Author,</p>
          <p>
            On behalf of the editorial board of <em className="font-medium not-italic">{journalName}</em>, we are
            pleased to inform you that the following manuscript has been <strong>accepted</strong> for publication:
          </p>

          <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="font-mono bg-background border px-2 py-1 rounded">{manuscriptNumber}</span>
              <span className="text-muted-foreground">Accepted {dateStr}</span>
              {editorName && <span className="text-muted-foreground">· Editor: {editorName}</span>}
            </div>
            <p className="font-semibold text-base leading-tight">{articleTitle}</p>
            <p className="text-xs text-muted-foreground">
              Authors: {authors.length ? authors.join(", ") : "—"}
            </p>
          </div>

          <p>
            This letter confirms acceptance for publication. The manuscript will now proceed to the next stages:
            APC processing (where applicable), copyediting, typesetting, proof review, and DOI assignment.
          </p>

          {nextSteps ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <p className="text-xs font-semibold uppercase tracking-widest">Next steps</p>
              <p className="text-sm mt-1 whitespace-pre-wrap">{nextSteps}</p>
            </div>
          ) : (
            <div className="rounded-lg border p-3 text-muted-foreground">
              <p className="text-xs font-semibold uppercase tracking-widest text-foreground">Next steps</p>
              <ul className="list-disc pl-4 mt-1 space-y-1 text-sm">
                <li>APC and waiver processing (finance will contact the corresponding author if applicable).</li>
                <li>Copyediting and typesetting by the production team.</li>
                <li>Author proof review — you will be notified when the proof is ready.</li>
                <li>DOI registration and online publication.</li>
              </ul>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Please retain this letter for institutional or funder requirements. For queries, contact the editorial
            office and quote the manuscript number <span className="font-mono">{manuscriptNumber}</span>.
          </p>
        </div>

        <Separator />

        <div className="flex flex-col sm:flex-row justify-between gap-4 text-sm">
          <div>
            <p className="font-medium">{editorName ?? "Editorial Office"}</p>
            <p className="text-muted-foreground text-xs">{journalName}</p>
            <p className="text-xs text-muted-foreground">Metademic Publishing Platform</p>
          </div>
          <div className="text-xs text-muted-foreground sm:text-right">
            <p>Journal: {journalName}</p>
            <p>Manuscript: {manuscriptNumber}</p>
            <p>Date: {dateStr}</p>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground pt-2 border-t">
          This is a system-generated acceptance letter from Metademic. Verify via manuscript portal.
        </p>
      </CardContent>
    </Card>
  );
}

export default AcceptanceLetter;
