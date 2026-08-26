"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Mail, Check, X } from "lucide-react";

export interface ReviewerCandidate {
  id: string; // reviewer_profiles.id
  userId: string;
  displayName: string;
  email: string | null;
  institution: string | null;
  expertise: string[];
  keywords: string[];
  isAvailable: boolean;
  activeReviews: number;
  maxActiveReviews: number;
  completedReviews: number;
  overdueReviews: number;
  conflicts: Array<{ type: string; message: string; severity: string; details?: string }>;
}

export function ReviewerSelector({
  manuscriptId,
  reviewersRequired,
  candidates,
  onInvite,
}: {
  manuscriptId: string;
  reviewersRequired: number;
  candidates: ReviewerCandidate[];
  onInvite?: (reviewerProfileId: string) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [filterAvailable, setFilterAvailable] = React.useState(false);
  const [inviting, setInviting] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [expertiseFilter, setExpertiseFilter] = React.useState("");

  const filtered = candidates.filter((c) => {
    if (search) {
      const term = search.toLowerCase();
      const hay = `${c.displayName} ${c.email ?? ""} ${c.institution ?? ""} ${c.expertise.join(" ")}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    if (expertiseFilter) {
      const term = expertiseFilter.toLowerCase();
      if (!c.expertise.some((e) => e.toLowerCase().includes(term)) && !c.keywords.some((k) => k.toLowerCase().includes(term))) return false;
    }
    if (filterAvailable && !c.isAvailable) return false;
    return true;
  });

  async function handleInvite(candidate: ReviewerCandidate) {
    setInviting(candidate.id);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/manuscripts/${manuscriptId}/reviewers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewerProfileId: candidate.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to invite reviewer");
      setMsg(`Invited ${candidate.displayName}`);
      onInvite?.(candidate.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setInviting(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reviewer Selection</CardTitle>
        <CardDescription>
          Required reviewers: <span className="font-semibold">{reviewersRequired}</span> (from journal configuration, not hardcoded) • Showing {filtered.length} of {candidates.length}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Label htmlFor="rv-search">Search</Label>
            <Input id="rv-search" placeholder="Name, email, institution, expertise..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex-1">
            <Label htmlFor="rv-expertise">Expertise / Keywords</Label>
            <Input id="rv-expertise" placeholder="e.g. machine learning" value={expertiseFilter} onChange={(e) => setExpertiseFilter(e.target.value)} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={filterAvailable} onChange={(e) => setFilterAvailable(e.target.checked)} className="h-4 w-4" />
              Available only
            </label>
          </div>
        </div>

        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No reviewers match filters.</p>
          ) : (
            filtered.map((c) => (
              <div key={c.id} className="rounded-lg border p-4 space-y-3 bg-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium text-sm">{c.displayName}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {c.email ?? "—"} • {c.institution ?? "No institution"}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.expertise.slice(0, 6).map((e) => (
                        <Badge key={e} variant="secondary" className="text-[11px]">
                          {e}
                        </Badge>
                      ))}
                      {c.expertise.length > 6 && <span className="text-xs text-muted-foreground">+{c.expertise.length - 6}</span>}
                    </div>
                  </div>
                  <div className="text-right space-y-1 shrink-0">
                    <div className="flex items-center gap-1 justify-end">
                      {c.isAvailable ? <Badge variant="default" className="text-[11px]">Available</Badge> : <Badge variant="destructive" className="text-[11px]">Unavailable</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Active: {c.activeReviews}/{c.maxActiveReviews} • Completed: {c.completedReviews} • Overdue: {c.overdueReviews}
                    </p>
                    {c.activeReviews >= c.maxActiveReviews && <p className="text-xs text-amber-600">At capacity</p>}
                  </div>
                </div>

                {c.conflicts.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2 space-y-1">
                    <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Potential Conflict of Interest
                    </p>
                    {c.conflicts.map((cf, idx) => (
                      <p key={idx} className={`text-xs ${cf.severity === "high" ? "text-red-700" : cf.severity === "medium" ? "text-amber-700" : "text-muted-foreground"}`}>
                        <span className="font-medium">{cf.type}:</span> {cf.message} {cf.details ? `— ${cf.details}` : ""}
                      </p>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleInvite(c)} disabled={!!inviting || !c.isAvailable} className="flex-1 sm:flex-none">
                    {inviting === c.id ? "Inviting..." : <><Check className="h-3 w-3" /> Invite</>}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => (window.location.href = `/editor/reviewers?search=${encodeURIComponent(c.email ?? c.displayName)}`)}>
                    View profile
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {msg && <p className="text-sm text-green-600">{msg}</p>}
        {err && <p className="text-sm text-destructive">{err}</p>}
      </CardContent>
    </Card>
  );
}
