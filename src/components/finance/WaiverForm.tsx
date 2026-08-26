"use client";

import * as React from "react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export function WaiverForm({ apcId, manuscriptId, onSuccess }: { apcId: string; manuscriptId?: string; onSuccess?: () => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: "request" | "approve" | "reject") {
    setLoading(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/apc/waiver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apcId, manuscriptId, amount: amount ? Number(amount) : undefined, reason, action }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      setMsg(j.message ?? "Done");
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">APC Waiver</CardTitle>
        <CardDescription className="text-xs">Request a waiver or approve/reject (finance/editor). Waiver amount is capped to the APC total.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="waiver-amount">Requested amount</Label>
          <Input id="waiver-amount" type="number" min="0" step="0.01" placeholder="e.g. 500" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="waiver-reason">Reason</Label>
          <Textarea id="waiver-reason" placeholder="Explain the waiver reason (country, hardship, institutional membership)…" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </div>
        {msg && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">{msg}</p>}
        {error && <p className="text-sm text-destructive bg-destructive/10 border rounded p-2">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => submit("request")} disabled={loading} variant="outline">Request waiver</Button>
          <Button onClick={() => submit("approve")} disabled={loading} variant="default">Approve (finance)</Button>
          <Button onClick={() => submit("reject")} disabled={loading} variant="destructive">Reject</Button>
        </div>
        <p className="text-xs text-muted-foreground">APC ID: <span className="font-mono">{apcId.slice(0, 8)}…</span> <Badge variant="outline" className="ml-1">server validated</Badge></p>
      </CardContent>
    </Card>
  );
}
