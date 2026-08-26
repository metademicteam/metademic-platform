"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface ApcCardProps {
  manuscriptNumber?: string;
  baseAmount: number;
  discountAmount: number;
  waiverAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  status?: string;
}

export function ApcCard({ manuscriptNumber, baseAmount, discountAmount, waiverAmount, taxAmount, totalAmount, currency, status }: ApcCardProps) {
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Article Processing Charge</CardTitle>
          {status && <Badge variant="secondary">{status}</Badge>}
        </div>
        {manuscriptNumber && <CardDescription className="font-mono text-xs">{manuscriptNumber}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Base APC</span><span className="font-medium">{fmt(baseAmount)}</span></div>
        {discountAmount > 0 && <div className="flex justify-between text-emerald-700"><span>Discount</span><span>-{fmt(discountAmount)}</span></div>}
        {waiverAmount > 0 && <div className="flex justify-between text-emerald-700"><span>Waiver</span><span>-{fmt(waiverAmount)}</span></div>}
        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(baseAmount - discountAmount - waiverAmount)}</span></div>
        {taxAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{fmt(taxAmount)}</span></div>}
        <div className="flex justify-between border-t pt-2 font-semibold text-base"><span>Total</span><span>{fmt(totalAmount)}</span></div>
        <p className="text-xs text-muted-foreground">Currency: {currency} · Calculated via journal default APC, discount/waiver and tax rules.</p>
      </CardContent>
    </Card>
  );
}
