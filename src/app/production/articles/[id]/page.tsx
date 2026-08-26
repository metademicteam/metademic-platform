export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductionWorkflowClient } from "./ProductionWorkflowClient";

const allowed = ["not_started","copyediting","typesetting","proof_ready","author_review","corrections_requested","final_approval","ready","published"] as const;

export default async function ProductionArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const admin = createAdminClient();

  // id is article_id — use admin after auth
  const { data: article } = await admin.from("articles").select("id, title, article_number, slug, manuscript_id, journal_id, publication_status, published_at, created_at").eq("id", id).single();
  if (!article) notFound();

  const { data: prod } = await admin.from("production_records").select("*").eq("article_id", id).maybeSingle();
  const { data: manuscript } = await admin.from("manuscripts").select("manuscript_number, title, status").eq("id", (article as { manuscript_id: string }).manuscript_id).single();
  const { data: journal } = await admin.from("journals").select("name, slug").eq("id", (article as { journal_id: string }).journal_id).single();
  const { data: doi } = await admin.from("doi_records").select("doi, registration_status").eq("article_id", id).maybeSingle();
  const { data: meta } = await admin.from("article_metadata").select("pdf_path, html_path, jats_xml_path, keywords, subjects").eq("article_id", id).maybeSingle();

  const prodStatus = (prod as { status: string } | null)?.status ?? "not_started";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{(article as { title: string }).title}</h1>
        <p className="text-sm text-muted-foreground mt-1 font-mono">{(article as { article_number: string }).article_number} · {(journal as { name: string } | null)?.name ?? ""} · manuscript {(manuscript as { manuscript_number: string } | null)?.manuscript_number ?? ""}</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-base">Workflow</CardTitle><CardDescription className="text-xs">not_started → copyediting → typesetting → proof_ready → author_review → corrections_requested → final_approval → ready → published. Validation enforced server-side.</CardDescription></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-4">
              {allowed.map(s => (
                <Badge key={s} variant={prodStatus === s ? "default" : "outline"} className="capitalize">{s.replaceAll("_"," ")}</Badge>
              ))}
            </div>
            <ProductionWorkflowClient articleId={id} currentStatus={prodStatus} assignedCopyeditor={(prod as { assigned_copyeditor_id: string | null } | null)?.assigned_copyeditor_id ?? null} assignedProductionEditor={(prod as { assigned_production_editor_id: string | null } | null)?.assigned_production_editor_id ?? null} notes={(prod as { notes: string | null } | null)?.notes ?? null} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Production Record</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge>{prodStatus}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">DOI</span><span className="font-mono text-xs">{(doi as { doi: string } | null)?.doi ?? "—"} <Badge variant="outline" className="ml-1">{(doi as { registration_status: string } | null)?.registration_status ?? "—"}</Badge></span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Published</span><span className="text-xs">{(article as { published_at: string | null }).published_at ? new Date((article as { published_at: string }).published_at!).toLocaleString() : "—"}</span></div>
              {prod && <div className="text-xs text-muted-foreground border-t pt-2"><p>Notes: {(prod as { notes: string | null }).notes ?? "—"}</p><p className="mt-1">Meta: PDF {(meta as { pdf_path: string | null } | null)?.pdf_path ?? "—"}</p></div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Cloudinary Assets</CardTitle><CardDescription className="text-xs">Proof / published PDF / XML stored via Cloudinary (metadata URLs).</CardDescription></CardHeader>
            <CardContent className="text-xs space-y-1">
              <p><span className="text-muted-foreground">PDF:</span> {(meta as { pdf_path: string | null } | null)?.pdf_path ?? "—"}</p>
              <p><span className="text-muted-foreground">HTML:</span> {(meta as { html_path: string | null } | null)?.html_path ?? "—"}</p>
              <p><span className="text-muted-foreground">JATS:</span> {(meta as { jats_xml_path: string | null } | null)?.jats_xml_path ?? "—"}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
