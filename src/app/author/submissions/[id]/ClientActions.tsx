"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Loader2, Undo2, Send, Pencil } from "lucide-react";
import Link from "next/link";

export function ClientActions({
  manuscriptId,
  status,
  canWithdraw,
  canRevise,
  canSubmit,
}: {
  manuscriptId: string;
  status: string;
  canWithdraw: boolean;
  canRevise: boolean;
  canSubmit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState<string | null>(null);

  async function handleWithdraw() {
    if (!confirm("Withdraw this manuscript? This cannot be undone.")) return;
    setLoading("withdraw");
    try {
      const res = await fetch(`/api/manuscripts/${manuscriptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "withdrawn" }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to withdraw");
      toast({ title: "Manuscript withdrawn", variant: "success" });
      router.refresh();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed", variant: "error" });
    } finally {
      setLoading(null);
    }
  }

  async function handleSubmit() {
    setLoading("submit");
    try {
      const res = await fetch(`/api/manuscripts/${manuscriptId}/submit`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Submission failed");
      toast({ title: "Manuscript submitted!", variant: "success" });
      router.refresh();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed", variant: "error" });
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      {canSubmit && (
        <Button size="sm" onClick={handleSubmit} disabled={!!loading}>
          {loading === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Submit
        </Button>
      )}
      {canRevise && (
        <Button asChild size="sm" variant="default">
          <Link href={`/author/submissions/${manuscriptId}/revision`}>
            <Pencil className="h-4 w-4" /> Revise
          </Link>
        </Button>
      )}
      {canWithdraw && (
        <Button variant="outline" size="sm" onClick={handleWithdraw} disabled={!!loading}>
          {loading === "withdraw" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
          Withdraw
        </Button>
      )}
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/author/submissions/${manuscriptId}`}>Refresh</Link>
      </Button>
    </>
  );
}
