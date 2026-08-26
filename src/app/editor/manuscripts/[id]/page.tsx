export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MANUSCRIPT_STATUS_LABELS, MANUSCRIPT_STATUS_COLORS, type ManuscriptStatus } from "@/lib/constants";
import { TechnicalCheckList } from "@/components/editor/TechnicalCheckList";
import { DecisionPanel } from "@/components/editor/DecisionPanel";
import { getRecommendationForRound } from "@/lib/services/review-service";

function StatusBadge({ status }: { status: string }) {
  const s = status as ManuscriptStatus;
  const variant = (MANUSCRIPT_STATUS_COLORS[s] as "default" | "secondary" | "destructive" | "outline") ?? "secondary";
  return <Badge variant={variant}>{MANUSCRIPT_STATUS_LABELS[s] ?? status}</Badge>;
}

export default async function EditorManuscriptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab ?? "overview";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Fetch manuscript with journal
  const { data: manuscript } = await supabase
    .from("manuscripts")
    .select("*, journals(id, name, slug, reviewers_required, review_blind_type), profiles!manuscripts_submitted_by_fkey(display_name, email)")
    .eq("id", id)
    .single();
  if (!manuscript) notFound();
  const m = manuscript as unknown as {
    id: string;
    journal_id: string;
    manuscript_number: string;
    title: string;
    subtitle: string | null;
    abstract: string | null;
    article_type: string;
    keywords: string[];
    status: string;
    current_version: number;
    current_review_round: number;
    assigned_editor_id: string | null;
    created_at: string;
    updated_at: string;
    submitted_at: string | null;
    technical_checked_at: string | null;
    editorial_screened_at: string | null;
    metadata: Record<string, unknown>;
    journals: { id: string; name: string; slug: string; reviewers_required: number; review_blind_type: string } | null;
    profiles: { display_name: string | null; email: string | null } | null;
  };

  // Check editor access
  const { data: membership } = await supabase.from("journal_members").select("role, is_active").eq("user_id", user.id).eq("journal_id", m.journal_id).eq("is_active", true);
  const hasAccess = (membership ?? []).some((r) => ["editor", "managing_editor", "editor_in_chief", "section_editor", "journal_manager", "journal_admin", "super_admin"].includes((r as { role: string }).role));
  if (!hasAccess) {
    const { data: superCheck } = await supabase.from("journal_members").select("role").eq("user_id", user.id).eq("role", "super_admin").eq("is_active", true);
    if (!superCheck || superCheck.length === 0) redirect("/auth/login?error=unauthorized");
  }

  // Fetch related data — use admin after editorial check to avoid empty due to missing RLS
  const admin = createAdminClient();
  const [{ data: authors }, { data: files }, { data: versions }, { data: timeline }, { data: assignments }, { data: reviewRounds }, { data: decisions }, { data: declarations }] = await Promise.all([
    admin.from("manuscript_authors").select("*").eq("manuscript_id", id).order("author_order"),
    admin.from("manuscript_files").select("*").eq("manuscript_id", id).order("created_at", { ascending: false }),
    admin.from("manuscript_versions").select("*").eq("manuscript_id", id).order("version_number"),
    admin.from("workflow_events").select("*").eq("manuscript_id", id).order("created_at", { ascending: false }).limit(30),
    admin.from("editorial_assignments").select("*, profiles!editorial_assignments_editor_id_fkey(display_name, email)").eq("manuscript_id", id).order("assigned_at", { ascending: false }),
    admin.from("review_rounds").select("*").eq("manuscript_id", id).order("round_number"),
    admin.from("editorial_decisions").select("*, profiles!editorial_decisions_editor_id_fkey(display_name, email)").eq("manuscript_id", id).order("created_at", { ascending: false }),
    admin.from("submission_declarations").select("*").eq("manuscript_id", id).maybeSingle(),
  ]);

  // Technical check state from metadata or workflow events
  const technicalCheckMeta = (m.metadata as { technical_check?: { checklist?: Record<string, boolean>; outcome?: string } })?.technical_check;

  // Editors for assignment dropdown — use admin to bypass RLS
  const { data: editors } = await admin.from("journal_members").select("user_id, role, profiles!inner(display_name, email)").eq("journal_id", m.journal_id).eq("is_active", true).in("role", ["editor", "section_editor", "editor_in_chief", "managing_editor", "journal_manager", "journal_admin", "super_admin"] as never);
  const editorOptions = (editors ?? []).map((e) => {
    const p = (e as unknown as { user_id: string; profiles: { display_name: string | null; email: string | null } }).profiles;
    return { id: (e as unknown as { user_id: string }).user_id, label: p.display_name ?? p.email ?? (e as unknown as { user_id: string }).user_id.slice(0, 8) };
  });

  // Reviews detail for current round
  const currentRound = (reviewRounds ?? []).find((r) => (r as { round_number: number }).round_number === m.current_review_round) as { id: string; round_number: number; required_reviewers: number } | undefined;
  let reviewAssignments: Array<Record<string, unknown>> = [];
  let recommendation: { recommendation: string; counts: { accept: number; minorRevision: number; majorRevision: number; reject: number } } | null = null;
  let roundCompleted = false;
  if (currentRound) {
    const { data: assigns } = await admin.from("review_assignments").select("*, reviewer_profiles!inner(user_id, profiles!inner(display_name, email)), review_reports(*)").eq("review_round_id", currentRound.id);
    reviewAssignments = (assigns ?? []) as Array<Record<string, unknown>>;
    try {
      const rec = await getRecommendationForRound(admin as unknown as never, currentRound.id);
      recommendation = { recommendation: rec.recommendation, counts: { accept: rec.counts.accept, minorRevision: rec.counts.minorRevision, majorRevision: rec.counts.majorRevision, reject: rec.counts.reject } };
      const { data: comp } = await admin.rpc("review_round_completed" as never, { p_review_round_id: currentRound.id } as never);
      roundCompleted = comp === true;
    } catch {}
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1280px] mx-auto w-full">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Link href="/editor/submissions" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to submissions
          </Link>
          <Badge variant="outline" className="font-mono text-xs">
            {m.manuscript_number}
          </Badge>
          <StatusBadge status={m.status} />
        </div>
        <h1 className="text-xl font-semibold">{m.title}</h1>
        <p className="text-sm text-muted-foreground">
          {m.journals?.name} • v{m.current_version} • Round {m.current_review_round} • {m.article_type}
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/editor/manuscripts/${m.id}/reviewers`}>Invite Reviewers</Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue={tab} className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="authors">Authors</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="technical">Technical Check</TabsTrigger>
          <TabsTrigger value="assignment">Assignment</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="decisions">Decisions</TabsTrigger>
          <TabsTrigger value="production">Production</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium">Abstract</p>
                  <p className="text-muted-foreground mt-1">{m.abstract ?? "No abstract"}</p>
                </div>
                <div className="space-y-2">
                  <p>
                    <span className="font-medium">Keywords:</span> {m.keywords?.join(", ") || "—"}
                  </p>
                  <p>
                    <span className="font-medium">Submitted:</span> {m.submitted_at ? new Date(m.submitted_at).toLocaleString() : "Not yet"}
                  </p>
                  <p>
                    <span className="font-medium">Journal:</span> {m.journals?.name}
                  </p>
                  <p>
                    <span className="font-medium">Blind type:</span> {m.journals?.review_blind_type}
                  </p>
                </div>
              </div>
              {/* Editorial screening actions */}
              <div className="rounded-lg border p-4 space-y-3">
                <p className="font-medium text-sm">Editorial Screening</p>
                <p className="text-xs text-muted-foreground">Accept for peer review / Desk reject / Request technical correction / Request clarification — with reason.</p>
                <EditorialScreening manuscriptId={m.id} currentStatus={m.status} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Files</CardTitle>
            </CardHeader>
            <CardContent>
              {(files ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No files.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filename</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(files as Array<{ id: string; original_filename: string; file_type: string; file_size: number | null; created_at: string }>)?.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="text-sm">{f.original_filename}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{f.file_type}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{f.file_size ? `${(f.file_size / 1024).toFixed(1)} KB` : "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(f.created_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="authors" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Authors</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Institution</TableHead>
                    <TableHead>Corresponding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(authors as Array<{ author_order: number; first_name: string; last_name: string; email: string | null; institution_name_snapshot: string | null; is_corresponding: boolean }>)?.map((a) => (
                    <TableRow key={a.author_order}>
                      <TableCell>{a.author_order}</TableCell>
                      <TableCell>
                        {a.first_name} {a.last_name}
                      </TableCell>
                      <TableCell className="text-sm">{a.email ?? "—"}</TableCell>
                      <TableCell className="text-sm">{a.institution_name_snapshot ?? "—"}</TableCell>
                      <TableCell>{a.is_corresponding ? <Badge>Corresponding</Badge> : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {declarations && (
                <div className="mt-4 rounded border p-3 text-xs space-y-1">
                  <p>
                    <span className="font-medium">Conflict:</span> {(declarations as { conflict_of_interest: string | null }).conflict_of_interest ?? "—"}
                  </p>
                  <p>
                    <span className="font-medium">Funding:</span> {(declarations as { funding_statement: string | null }).funding_statement ?? "—"}
                  </p>
                  <p>
                    <span className="font-medium">Ethics:</span> {(declarations as { ethics_statement: string | null }).ethics_statement ?? "—"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="versions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Versions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Revision Round</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(versions as Array<{ version_number: number; revision_round: number; version_label: string | null; submitted_at: string | null }>)?.map((v) => (
                    <TableRow key={v.version_number}>
                      <TableCell>v{v.version_number}</TableCell>
                      <TableCell>R{v.revision_round}</TableCell>
                      <TableCell>{v.version_label ?? "—"}</TableCell>
                      <TableCell className="text-xs">{v.submitted_at ? new Date(v.submitted_at).toLocaleString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {(timeline as Array<{ event_type: string; from_status: string | null; to_status: string | null; description: string | null; created_at: string }>)?.length === 0 ? (
                <p className="text-sm text-muted-foreground">No timeline events.</p>
              ) : (
                <ol className="space-y-3">
                  {(timeline as Array<{ event_type: string; from_status: string | null; to_status: string | null; description: string | null; created_at: string }>)?.map((e, idx) => (
                    <li key={idx} className="flex gap-3">
                      <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">
                          {e.event_type} {e.from_status ? `(${e.from_status} → ${e.to_status ?? "—"})` : ""}
                        </p>
                        {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
                        <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="technical" className="mt-4">
          <TechnicalCheckList
            manuscriptId={m.id}
            initialChecklist={technicalCheckMeta?.checklist}
            initialOutcome={technicalCheckMeta?.outcome as "PASS" | "RETURN_TO_AUTHOR" | "DESK_REJECT" | null}
          />
        </TabsContent>

        <TabsContent value="assignment" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Editor Assignment</CardTitle>
              <CardDescription>Assign or reassign handling editor.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Current: <span className="font-medium">{m.assigned_editor_id ? editorOptions.find((e) => e.id === m.assigned_editor_id)?.label ?? m.assigned_editor_id.slice(0, 8) : "Unassigned"}</span>
              </p>
              <EditorAssignment manuscriptId={m.id} options={editorOptions} currentEditorId={m.assigned_editor_id} />
              {(assignments as Array<{ editor_id: string; assigned_at: string; is_active: boolean; profiles: { display_name: string | null; email: string | null } | null }>)?.length > 0 && (
                <div>
                  <p className="text-sm font-medium">Assignment history</p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {(assignments as Array<{ editor_id: string; assigned_at: string; is_active: boolean; profiles: { display_name: string | null; email: string | null } | null }>).map((a) => (
                      <li key={a.editor_id + a.assigned_at} className="flex justify-between border-b py-1">
                        <span>
                          {a.profiles?.display_name ?? a.profiles?.email ?? a.editor_id.slice(0, 8)} {a.is_active ? "(active)" : "(previous)"}
                        </span>
                        <span className="text-muted-foreground">{new Date(a.assigned_at).toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Review Rounds</CardTitle>
              <CardDescription>
                Current round {m.current_review_round} • Required reviewers: {currentRound?.required_reviewers ?? m.journals?.reviewers_required ?? 3}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(reviewRounds as Array<{ round_number: number; required_reviewers: number; started_at: string; completed_at: string | null }>)?.map((r) => (
                <div key={r.round_number} className="rounded border p-3">
                  <p className="font-medium text-sm">
                    Round {r.round_number} — {r.required_reviewers} required {r.completed_at ? "(completed)" : "(in progress)"}
                  </p>
                  <p className="text-xs text-muted-foreground">Started {new Date(r.started_at).toLocaleDateString()}</p>
                </div>
              ))}
              {currentRound && (
                <>
                  <div className="rounded border p-3 space-y-2">
                    <p className="font-medium text-sm">Assignments (round {currentRound.round_number})</p>
                    {reviewAssignments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No reviewers assigned yet.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Reviewer</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Deadline</TableHead>
                            <TableHead>Recommendation</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reviewAssignments.map((a) => {
                            const ra = a as { id: string; status: string; deadline_at: string | null; reviewer_profiles: { profiles: { display_name: string | null; email: string | null } }; review_reports: Array<{ recommendation: string }> | { recommendation: string } | null };
                            const report = Array.isArray(ra.review_reports) ? ra.review_reports[0] : (ra.review_reports as { recommendation: string } | null);
                            return (
                              <TableRow key={ra.id}>
                                <TableCell className="text-sm">{ra.reviewer_profiles?.profiles?.display_name ?? ra.reviewer_profiles?.profiles?.email ?? "Anonymous reviewer"}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{ra.status}</Badge>
                                </TableCell>
                                <TableCell className="text-xs">{ra.deadline_at ? new Date(ra.deadline_at).toLocaleDateString() : "—"}</TableCell>
                                <TableCell className="text-xs">{report?.recommendation ?? "—"}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                  {recommendation && (
                    <DecisionPanel
                      manuscriptId={m.id}
                      reviewRoundId={currentRound.id}
                      systemRecommendation={recommendation.recommendation}
                      counts={recommendation.counts}
                      completed={roundCompleted}
                    />
                  )}
                </>
              )}
              <Button asChild variant="outline" size="sm">
                <Link href={`/editor/manuscripts/${m.id}/reviewers`}>Manage reviewers →</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="decisions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Decisions</CardTitle>
            </CardHeader>
            <CardContent>
              {(decisions as Array<{ decision: string; system_recommendation: string | null; override_system_recommendation: boolean; editor_reason: string | null; created_at: string; profiles: { display_name: string | null } | null }>)?.length === 0 ? (
                <p className="text-sm text-muted-foreground">No decisions yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Decision</TableHead>
                      <TableHead>System Rec.</TableHead>
                      <TableHead>Override</TableHead>
                      <TableHead>Editor</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(decisions as Array<{ decision: string; system_recommendation: string | null; override_system_recommendation: boolean; editor_reason: string | null; created_at: string; profiles: { display_name: string | null } | null }>)?.map((d, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Badge>{d.decision}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{d.system_recommendation ?? "—"}</TableCell>
                        <TableCell>{d.override_system_recommendation ? <Badge variant="destructive">Yes</Badge> : "No"}</TableCell>
                        <TableCell className="text-sm">{d.profiles?.display_name ?? "—"}</TableCell>
                        <TableCell className="text-xs">{new Date(d.created_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="production" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Production</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Production workflow after acceptance. Managed in Production dashboard.</p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href="/production/dashboard">Go to production</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EditorialScreening({ manuscriptId, currentStatus }: { manuscriptId: string; currentStatus: string }) {
  return <EditorialScreeningClient manuscriptId={manuscriptId} currentStatus={currentStatus} />;
}

function EditorAssignment({ manuscriptId, options, currentEditorId }: { manuscriptId: string; options: Array<{ id: string; label: string }>; currentEditorId: string | null }) {
  return <EditorAssignmentClient manuscriptId={manuscriptId} options={options} currentEditorId={currentEditorId} />;
}

// Client components inline to avoid separate files for these small forms
import EditorialScreeningClient from "./EditorialScreeningClient";
import EditorAssignmentClient from "./EditorAssignmentClient";
