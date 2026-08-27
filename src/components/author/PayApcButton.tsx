"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2, AlertCircle } from "lucide-react";

export function PayApcButton({ manuscriptId, amount, currency }: { manuscriptId: string; amount?: number; currency?: string }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handlePay() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/apc/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manuscriptId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not start payment");
      if (j.url) {
        window.location.href = j.url;
      } else {
        setError("No checkout URL returned.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  const label = amount !== undefined && currency
    ? `Pay APC — ${new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount)}`
    : "Pay APC";

  return (
    <div className="space-y-2">
      <Button onClick={handlePay} disabled={loading} className="w-full" size="sm">
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
        {loading ? "Opening secure checkout…" : label}
      </Button>
      {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {error}</p>}
      <p className="text-xs text-muted-foreground">Secure payment via Stripe · invoice created automatically · webhook verified.</p>
    </div>
  );
}
