import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Shield, Users, Scale, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "About — Metademic", description: "About Metademic — open scholarly publishing platform." };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">About Metademic</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-[70ch] leading-6">Metademic is a modern multi-journal publishing platform delivering the full scholarly workflow — submission, technical check, editorial screening, peer review, decision, revision, APC, production, DOI registration and open dissemination — with journal-scoped roles, auditability, and SEO-ready public article pages.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4" /> Mission</CardTitle></CardHeader><CardContent className="text-sm leading-6 text-muted-foreground">Accelerate open research dissemination with rigorous peer review, transparent governance, and production quality — without paywalls.</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" /> Peer Review</CardTitle></CardHeader><CardContent className="text-sm leading-6 text-muted-foreground">Single-blind, double-blind and open review per journal policy. Structured reports, reviewer anonymity protections, and versioned review rounds.</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Scale className="h-4 w-4" /> Publication Ethics</CardTitle></CardHeader><CardContent className="text-sm leading-6 text-muted-foreground">COPE-aligned ethics: originality, authorship, conflicts, research ethics, data availability, and corrections/retractions with full audit logs.</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Governance</CardTitle></CardHeader><CardContent className="text-sm leading-6 text-muted-foreground">Journal-scoped RBAC (Author, Reviewer, Editor, Section Editor, EIC, Managing Editor, Production, Finance, Journal Admin, Super Admin) enforced via Supabase RLS.</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Explore</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link href="/journals">Browse journals</Link></Button>
          <Button variant="outline" asChild><Link href="/articles">Browse articles</Link></Button>
          <Button asChild><Link href="/auth/register">Submit manuscript</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
