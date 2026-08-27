"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

export function PaymentVerifyBanner({ invoiceId, initialStatus }: { invoiceId: string; initialStatus: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const payment = searchParams.get("payment");
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = React.useState(initialStatus);
  const [verifying, setVerifying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const autoRan = React.useRef(false);

  const verify = React.useCallback(async (sid: string | null) => {
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, sessionId: sid ?? undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Verification failed");
      if (j.status === "paid" || j.paid) {
        setStatus("paid");
        setDone(true);
        router.refresh();
      } else if (j.paid === false) {
        setError(`Stripe reports payment not yet complete (status: ${j.status ?? j.stripeStatus ?? "unknown"}). If you just paid, wait a moment and retry.`);
      } else if (j.alreadyPaid) {
        setStatus("paid");
        setDone(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }, [invoiceId, router]);

  React.useEffect(() => {
    if (autoRan.current) return;
    if (payment === "success" && status !== "paid") {
      autoRan.current = true;
      verify(sessionId);
    }
  }, [payment, sessionId, status, verify]);

  if (status === "paid") {
    return (
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="py-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-emerald-800">Payment verified — invoice is paid.</p>
            <p className="text-xs text-emerald-700/80">Your APC is marked paid and the manuscript will advance to production.</p>
          </div>
          <Badge className="bg-emerald-600">paid</Badge>
        </CardContent>
      </Card>
    );
  }

  if (payment === "success" && status !== "paid") {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-4 space-y-3">
          <div className="flex items-start gap-3">
            {verifying ? <Loader2 className="h-5 w-5 animate-spin text-amber-600 mt-0.5" /> : done ? <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" /> : <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />}
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">{verifying ? "Verifying payment with Stripe…" : done ? "Payment verified!" : "Returned from Stripe — verifying…"}</p>
              <p className="text-xs text-amber-800/80 mt-1">
                {verifying ? "Contacting Stripe to confirm your session. This fixes the case where the webhook has not yet fired." : error ? error : done ? "Invoice updated to paid. Refresh if the status has not changed." : "If this takes more than a few seconds, click Verify again."}
              </p>
              {error && <p className="text-xs text-destructive mt-2">{error}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => verify(sessionId)} disabled={verifying} className="h-8">
              {verifying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              {verifying ? "Verifying…" : "Verify payment now"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => router.refresh()} className="h-8">Refresh page</Button>
          </div>
          {sessionId && <p className="text-[11px] font-mono text-muted-foreground truncate">session {sessionId.slice(0, 24)}…</p>}
        </CardContent>
      </Card>
    );
  }

  if (payment === "cancelled") {
    return (
      <Card className="border-muted">
        <CardContent className="py-3 text-sm text-muted-foreground">Payment cancelled — you can try again when ready.</CardContent>
      </Card>
    );
  }

  if (status !== "paid" && status !== "cancelled" && status !== "refunded") {
    return (
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => verify(null)} disabled={verifying} className="h-8">
          {verifying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          {verifying ? "Checking…" : "Check payment status"}
        </Button>
        {error && <span className="text-xs text-destructive self-center">{error}</span>}
        {done && <span className="text-xs text-emerald-600 self-center">Verified — refreshing…</span>}
      </div>
    );
  }

  return null;
}
