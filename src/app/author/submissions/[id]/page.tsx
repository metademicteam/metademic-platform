export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MANUSCRIPT_STATUS_LABELS, MANUSCRIPT_STATUS_COLORS, type ManuscriptStatus } from "@/lib/constants";
import { FileText, Clock, User, Building2, Tag, ShieldCheck, Star, Ban, Download, History, AlertCircle, ArrowLeft, Send, Undo2, Pencil } from "lucide-react";
import { ClientActions } from "./ClientActions";
import { PayApcButton } from "@/components/author/PayApcButton";
import { PaymentVerifyBanner } from "@/components/finance/PaymentVerifyBanner";

function StatusBadge({ status }: { status: string }) {
  const s = status as ManuscriptStatus;
  const v = (MANUSCRIPT_STATUS_COLORS[s] as "default" | "secondary" | "destructive" | "outline") ?? "secondary";
  return <Badge variant={v}>{MANUSCRIPT_STATUS_LABELS[s] ?? status}</Badge>;
}

export default async function ManuscriptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: manuscript, error } = await supabase.from("manuscripts").select("*, journals(id, name, slug)").eq("id", id).single();
  if (error || !manuscript) notFound();
  const m = manuscript as {
    id: string;
    manuscript_number: string;
    title: string;
    subtitle: string | null;
    abstract: string | null;
    article_type: string;
    keywords: string[];
    subject_areas: string[];
    status: string;
    current_version: number;
    current_review_round: number;
    submitted_by: string | null;
    submitted_at: string | null;
    created_at: string;
    updated_at: string;
    journal_id: string;
    journals: { name: string; slug: string } | null;
  };

  if (m.submitted_by !== user.id) {
    const { data: memberships } = await supabase.from("journal_members").select("role").eq("user_id", user.id).eq("journal_id", m.journal_id).eq("is_active", true);
    const isEditor = (memberships ?? []).some((r: { role: string }) => ["editor", "editor_in_chief", "managing_editor", "journal_admin", "super_admin"].includes(r.role));
    if (!isEditor) return <div className="p-8 text-sm text-destructive">Forbidden — you do not own this manuscript.</div>;
  }

  // Use admin client for related tables after ownership check — these tables had missing RLS policies
  // and would return empty via anon client. Manuscript itself stays via RLS.
  const admin = createAdminClient();

  const [{ data: authors }, { data: versions }, { data: files }, { data: declarations }, { data: suggested }, { data: excluded }, { data: timeline }, { data: apc }] = await Promise.all([
    admin.from("manuscript_authors").select("*").eq("manuscript_id", id).order("author_order"),
    admin.from("manuscript_versions").select("*").eq("manuscript_id", id).order("version_number"),
    admin.from("manuscript_files").select("*").eq("manuscript_id", id).order("created_at"),
    admin.from("submission_declarations").select("*").eq("manuscript_id", id).maybeSingle(),
    admin.from("manuscript_reviewer_suggestions").select("*").eq("manuscript_id", id),
    admin.from("manuscript_excluded_reviewers").select("*").eq("manuscript_id", id),
    admin.from("workflow_events").select("*").eq("manuscript_id", id).order("created_at", { ascending: false }).limit(30),
    admin.from("apcs").select("*").eq("manuscript_id", id).maybeSingle(),
  ]);

  // Look up the invoice for this manuscript's APC (for reference display).
  let invoice: { id: string; invoice_number: string; status: string; amount: number; total_amount: number } | null = null;
  if (apc) {
    const invoiceId = (apc as { id: string }).id;
    const { data } = await admin.from("invoices").select("id, invoice_number, status, amount, total_amount").eq("apc_id", invoiceId).limit(1).maybeSingle();
    invoice = (data as { id: string; invoice_number: string; status: string; amount: number; total_amount: number } | null) ?? null;
  }

  const canSubmit = m.status === "draft";
  const canWithdraw = ["draft", "submitted", "technical_check", "editor_assignment", "editorial_screening"].includes(m.status);
  const canRevise = ["minor_revision", "major_revision"].includes(m.status);
  const isPublished = m.status === "published";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1120px] mx-auto w-full space-y-6">
      <Link href="/author/submissions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to submissions
      </Link>

      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm bg-muted px-2 py-1 rounded">{m.manuscript_number}</span>
            <StatusBadge status={m.status} />
            <span className="text-xs text-muted-foreground">v{m.current_version} • Round {m.current_review_round}</span>
          </div>
          <h1 className="text-xl font-semibold leading-tight">{m.title || "Untitled manuscript"}</h1>
          {m.subtitle && <p className="text-sm text-muted-foreground">{m.subtitle}</p>}
          <p className="text-sm text-muted-foreground">
            Journal: {m.journals?.name ?? m.journal_id} • Type: {m.article_type} • Submitted {m.submitted_at ? new Date(m.submitted_at).toLocaleString() : "not yet"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {canSubmit && (
            <form action={`/api/manuscripts/${m.id}/submit`} method="POST">
              <Button type="submit" size="sm">
                <Send className="h-4 w-4" /> Submit now
              </Button>
            </form>
          )}
          <ManuscriptActions manuscriptId={m.id} status={m.status} canWithdraw={canWithdraw} canRevise={canRevise} canSubmit={canSubmit} />
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Abstract</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.abstract || "No abstract provided."}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(m.keywords ?? []).map((k) => (
                  <Badge key={k} variant="secondary" className="text-xs">
                    {k}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">Subject areas: {(m.subject_areas ?? []).join(", ") || "—"} • Keywords: {(m.keywords ?? []).length}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" /> Authors ({(authors ?? []).length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(authors ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No authors recorded.</p>
              ) : (
                (authors as Array<{ first_name: string; last_name: string; email: string | null; orcid: string | null; institution_name_snapshot: string | null; is_corresponding: boolean; author_order: number }>).map((a) => (
                  <div key={a.author_order} className="flex justify-between gap-3 border-b last:border-0 pb-3 last:pb-0">
                    <div>
                      <p className="text-sm font-medium">
                        {a.author_order}. {a.first_name} {a.last_name} {a.is_corresponding && <Badge variant="default" className="ml-1 text-[11px]">Corresponding</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">{a.email ?? ""} {a.orcid ? `• ORCID: ${a.orcid}` : ""}</p>
                      <p className="text-xs text-muted-foreground">{a.institution_name_snapshot ?? "—"}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Files & Version History
              </CardTitle>
              <CardDescription>Immutable versions — files linked to version never overwritten. Current version: v{m.current_version}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Versions */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Versions</p>
                {(versions ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No versions yet.</p>
                ) : (
                  <div className="space-y-2">
                    {(versions as Array<{ version_number: number; revision_round: number; version_label: string | null; created_at: string; submitted_at: string | null }>).map((v) => (
                      <div key={v.version_number} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-medium">Version {v.version_number} — {v.version_label ?? `v${v.version_number}`} • Round {v.revision_round}</p>
                          <p className="text-xs text-muted-foreground">Created {new Date(v.created_at).toLocaleString()} {v.submitted_at ? `• Submitted ${new Date(v.submitted_at).toLocaleString()}` : ""}</p>
                        </div>
                        <Badge variant="outline">v{v.version_number}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Files */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Files ({(files ?? []).length})</p>
                {(files ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No files uploaded.</p>
                ) : (
                  <div className="space-y-2">
                    {(files as Array<{ id: string; original_filename: string; file_type: string; storage_path: string; mime_type: string | null; file_size: number | null; version_id: string | null; metadata: Record<string, unknown> | null }>).map((f) => {
                      const meta = f.metadata as Record<string, unknown> | null;
                      const secureUrl = (meta?.secure_url as string) || (meta?.secureUrl as string) || null;
                      return (
                        <div key={f.id} className="flex items-center gap-3 rounded-lg border p-3">
                          <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{f.original_filename}</p>
                            <p className="text-xs text-muted-foreground">
                              {f.file_type} • {f.file_size ? `${(f.file_size / 1024 / 1024).toFixed(1)} MB` : "—"} • {f.mime_type ?? ""}
                            </p>
                            <p className="text-[11px] font-mono text-muted-foreground truncate">{f.storage_path}</p>
                          </div>
                          {secureUrl ? (
                            <Button asChild variant="outline" size="sm">
                              <a href={secureUrl} target="_blank" rel="noopener noreferrer">
                                <Download className="h-4 w-4" /> View
                              </a>
                            </Button>
                          ) : (
                            <Badge variant="secondary" className="text-[11px]">
                              v{(versions as Array<{ id: string; version_number: number }> | undefined)?.find((v) => v.id === f.version_id)?.version_number ?? "?"}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Declarations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Declarations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(declarations as Record<string, unknown> | null) ? (
                <>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Conflict of Interest</p>
                    <p>{(declarations as { conflict_of_interest: string | null }).conflict_of_interest || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Funding</p>
                    <p>{(declarations as { funding_statement: string | null }).funding_statement || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Ethics</p>
                    <p>{(declarations as { ethics_statement: string | null }).ethics_statement || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Data availability</p>
                    <p>{(declarations as { data_availability_statement: string | null }).data_availability_statement || "—"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {(["originality_confirmed", "ethics_confirmed", "authorship_confirmed", "copyright_confirmed"] as const).map((k) => (
                      <Badge key={k} variant={(declarations as Record<string, unknown>)[k] ? "default" : "destructive"}>
                        {k.replace("_confirmed", "")}: {(declarations as Record<string, unknown>)[k] ? "✓" : "✗"}
                      </Badge>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">No declarations recorded.</p>
              )}
            </CardContent>
          </Card>

          {/* Reviewers */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Star className="h-4 w-4" /> Suggested Reviewers ({(suggested ?? []).length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(suggested ?? []).length === 0 ? (
                  <p className="text-muted-foreground">None.</p>
                ) : (
                  (suggested as Array<{ reviewer_name: string; reviewer_email: string | null; institution: string | null }>).map((s, i) => (
                    <p key={i} className="border-b last:border-0 pb-2">
                      {s.reviewer_name} {s.reviewer_email ? `• ${s.reviewer_email}` : ""} {s.institution ? `• ${s.institution}` : ""}
                    </p>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Ban className="h-4 w-4" /> Excluded Reviewers ({(excluded ?? []).length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(excluded ?? []).length === 0 ? (
                  <p className="text-muted-foreground">None.</p>
                ) : (
                  (excluded as Array<{ reviewer_name: string | null; reviewer_email: string | null; reason: string | null }>).map((e, i) => (
                    <p key={i} className="border-b last:border-0 pb-2">
                      {e.reviewer_name || e.reviewer_email || "—"} {e.reason ? `— ${e.reason}` : ""}
                    </p>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right rail: timeline + actions */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" /> Timeline
              </CardTitle>
              <CardDescription>Workflow events and status history</CardDescription>
            </CardHeader>
            <CardContent>
              {(timeline ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No events yet.</p>
              ) : (
                <div className="relative pl-4 border-l space-y-4">
                  {(timeline as Array<{ id: string; event_type: string; description: string | null; from_status: string | null; to_status: string | null; created_at: string }>).map((ev) => (
                    <div key={ev.id} className="relative">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background" />
                      <p className="text-sm font-medium">{ev.event_type}</p>
                      {ev.from_status || ev.to_status ? (
                        <p className="text-xs text-muted-foreground">
                          {ev.from_status ?? "—"} → {ev.to_status ?? "—"}
                        </p>
                      ) : null}
                      {ev.description && <p className="text-xs text-muted-foreground">{ev.description}</p>}
                      <p className="text-xs text-muted-foreground">{new Date(ev.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {invoice && (
            <PaymentVerifyBanner invoiceId={invoice.id} initialStatus={invoice.status} />
          )}
          <Card id="apc">
            <CardHeader>
              <CardTitle className="text-sm">APC</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(apc as Record<string, unknown> | null) ? (
                <>
                  <p>Status: <Badge variant={(apc as { status: string }).status === "paid" ? "default" : "secondary"} className="text-[11px]">{(apc as { status: string }).status}</Badge></p>
                  <p>Total: {(apc as { total_amount: number }).total_amount} {(apc as { currency: string }).currency}</p>
                  {invoice && <p className="text-xs text-muted-foreground font-mono">Invoice: {(invoice as { invoice_number: string }).invoice_number}</p>}
                  {(apc as { status: string }).status !== "paid" && (
                    <PayApcButton manuscriptId={m.id} amount={Number((apc as { total_amount: number }).total_amount)} currency={(apc as { currency: string }).currency} />
                  )}
                  {(apc as { status: string }).status === "paid" && (
                    <p className="text-emerald-600 text-xs">✓ APC paid</p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">No APC record (not yet accepted).</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4" /> Need help?
              </p>
              <p className="text-xs text-muted-foreground">Contact editorial office or visit help center.</p>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/help">Help</Link>
                </Button>
                {canRevise && (
                  <Button asChild size="sm">
                    <Link href={`/author/submissions/${m.id}/revision`}>Submit revision</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ManuscriptActions({ manuscriptId, status, canWithdraw, canRevise, canSubmit }: { manuscriptId: string; status: string; canWithdraw: boolean; canRevise: boolean; canSubmit: boolean }) {
  return (
    <ClientActions manuscriptId={manuscriptId} status={status} canWithdraw={canWithdraw} canRevise={canRevise} canSubmit={canSubmit} />
  );
}
