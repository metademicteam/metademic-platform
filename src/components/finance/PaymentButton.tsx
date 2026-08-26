"use client";

import * as React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2, ExternalLink } from "lucide-react";

export function PaymentButton({ invoiceId, amount, currency }: { invoiceId: string; amount?: number; currency?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Checkout failed");
      if (j.url) {
        window.location.href = j.url;
      } else if (j.mock) {
        // mock mode — webhook will not fire; show message
        alert("Mock checkout created. In mock mode no real payment occurs. Invoice: " + j.invoiceId);
        window.location.reload();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleCheckout} disabled={loading} className="w-full">
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
        {loading ? "Redirecting…" : `Pay ${amount !== undefined && currency ? new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount) : "invoice"}`}
        {!loading && <ExternalLink className="h-3 w-3 ml-1 opacity-60" />}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">Secure Stripe Checkout · Server-side session · Webhook verified. Never rely on frontend success flag.</p>
    </div>
  );
}
