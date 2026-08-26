"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar, Clock, BookOpen } from "lucide-react";

export interface InvitationData {
  id: string;
  manuscriptTitle: string;
  manuscriptAbstract: string | null;
  keywords: string[];
  deadlineAt: string | null;
  invitedAt: string;
  status: string;
  journalName?: string | null;
}

export function InvitationCard({
  invitation,
  onRespond,
}: {
  invitation: InvitationData;
  onRespond?: (id: string, action: "accept" | "decline") => void;
}) {
  const [openAccept, setOpenAccept] = React.useState(false);
  const [openDecline, setOpenDecline] = React.useState(false);
  const [coiConfirmed, setCoiConfirmed] = React.useState(false);
  const [confConfirmed, setConfConfirmed] = React.useState(false);
  const [respConfirmed, setRespConfirmed] = React.useState(false);
  const [declineReason, setDeclineReason] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function doRespond(action: "accept" | "decline") {
    if (action === "accept" && (!coiConfirmed || !confConfirmed || !respConfirmed)) {
      setErr("You must confirm all three declarations before accepting.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/review-invitations/${invitation.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          coiConfirmed: action === "accept" ? coiConfirmed : undefined,
          confidentialityConfirmed: action === "accept" ? confConfirmed : undefined,
          responsibilityConfirmed: action === "accept" ? respConfirmed : undefined,
          declineReason: action === "decline" ? declineReason : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to respond");
      setOpenAccept(false);
      setOpenDecline(false);
      onRespond?.(invitation.id, action);
      window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base leading-tight">{invitation.manuscriptTitle}</CardTitle>
              {invitation.journalName && <CardDescription>{invitation.journalName}</CardDescription>}
            </div>
            <Badge variant={invitation.status === "invited" ? "secondary" : invitation.status === "accepted" ? "default" : "outline"}>{invitation.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {invitation.manuscriptAbstract && <p className="text-sm text-muted-foreground line-clamp-3">{invitation.manuscriptAbstract}</p>}
          {invitation.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {invitation.keywords.map((k) => (
                <Badge key={k} variant="outline" className="text-[11px]">
                  {k}
                </Badge>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Invited {new Date(invitation.invitedAt).toLocaleDateString()}
            </span>
            {invitation.deadlineAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> Deadline {new Date(invitation.deadlineAt).toLocaleDateString()}
              </span>
            )}
          </div>

          {invitation.status === "invited" && (
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={() => setOpenAccept(true)}>
                Accept Review
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOpenDecline(true)}>
                Decline Review
              </Button>
            </div>
          )}
          {err && <p className="text-xs text-destructive">{err}</p>}
        </CardContent>
      </Card>

      {/* Accept modal */}
      <Dialog open={openAccept} onOpenChange={setOpenAccept}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept Review Invitation</DialogTitle>
            <DialogDescription>Confirm the following before accepting. This is required by the journal policy.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={coiConfirmed} onChange={(e) => setCoiConfirmed(e.target.checked)} className="mt-1 h-4 w-4" />
              <span>
                <span className="font-medium">Conflict of Interest declaration:</span> I have no competing interests that would prevent an impartial review, and I will disclose any potential conflicts.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={confConfirmed} onChange={(e) => setConfConfirmed(e.target.checked)} className="mt-1 h-4 w-4" />
              <span>
                <span className="font-medium">Confidentiality agreement:</span> I will keep the manuscript and review details confidential and not share or use the content.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={respConfirmed} onChange={(e) => setRespConfirmed(e.target.checked)} className="mt-1 h-4 w-4" />
              <span>
                <span className="font-medium">Reviewer responsibility acknowledgement:</span> I will provide a thorough, constructive, and timely review by the deadline.
              </span>
            </label>
            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenAccept(false)}>
              Cancel
            </Button>
            <Button onClick={() => doRespond("accept")} disabled={loading || !coiConfirmed || !confConfirmed || !respConfirmed}>
              {loading ? "Submitting..." : "Confirm Accept"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline modal */}
      <Dialog open={openDecline} onOpenChange={setOpenDecline}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Review Invitation</DialogTitle>
            <DialogDescription>Optionally provide a reason for declining. This helps the editor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="decline-reason">Reason (optional)</Label>
              <Textarea id="decline-reason" placeholder="Conflict, lack of expertise, unavailable..." value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} rows={3} />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDecline(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => doRespond("decline")} disabled={loading}>
              {loading ? "Submitting..." : "Confirm Decline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
