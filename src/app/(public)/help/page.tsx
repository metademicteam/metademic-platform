import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Help — Metademic" };

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-[900px] px-4 py-10 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Help center</h1>
      <p className="text-sm text-muted-foreground">Guides for authors, reviewers, and editors. If your APC payment shows paid in Stripe but still pending here, see Payments below — it now auto-heals on next page load.</p>
      <div className="grid md:grid-cols-2 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">For authors</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground space-y-2"><p>Submit via /author/submissions/new, track status on /author/dashboard, pay APC on the manuscript page.</p><Button asChild variant="outline" size="sm"><Link href="/author/dashboard">Go to dashboard</Link></Button></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Payments & APC</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground space-y-2"><p>After Stripe success you return to /finance/invoices/[id]. If webhook was missed, the page now auto-verifies with Stripe and marks paid → manuscript moves to copyediting. No manual SQL needed.</p><Button asChild variant="outline" size="sm"><Link href="/finance/dashboard">Finance</Link></Button></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">For reviewers</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground"><p>Invitations on /reviewer/invitations, reviews on /reviewer/reviews.</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Contact</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground"><p>Editorial office: see journal page contact email.</p></CardContent></Card>
      </div>
    </div>
  );
}
