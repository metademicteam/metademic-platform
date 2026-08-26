export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Search } from "lucide-react";

export default async function EditorReviewersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; expertise?: string; available?: string; institution?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const search = sp.search ?? "";
  const expertise = sp.expertise ?? "";
  const available = sp.available ?? "";
  const institution = sp.institution ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Check editor access
  const { data: memberships } = await supabase.from("journal_members").select("role, is_active").eq("user_id", user.id).eq("is_active", true);
  const hasEditor = (memberships ?? []).some((m) => ["editor", "managing_editor", "editor_in_chief", "section_editor", "journal_manager", "journal_admin", "super_admin"].includes((m as { role: string }).role));
  if (!hasEditor) redirect("/auth/login?error=editor_required");

  let query = supabase.from("reviewer_profiles").select("*, profiles!inner(id, display_name, email, first_name, last_name), institutions(name)", { count: "exact" }).order("completed_reviews", { ascending: false }).range(from, to);

  if (available === "true") query = query.eq("is_available", true);
  if (available === "false") query = query.eq("is_available", false);
  if (expertise) query = query.contains("expertise", [expertise]);
  if (search) {
    // Search via profile display_name/email — fallback to client filter if RLS limited
    // We'll fetch then filter client-side for name/email is not directly filterable via reviewer_profiles
  }

  const { data: rows, count, error } = await query;
  let reviewers = (rows ?? []) as unknown as Array<{
    id: string;
    user_id: string;
    expertise: string[];
    keywords: string[];
    is_available: boolean;
    max_active_reviews: number;
    completed_reviews: number;
    overdue_reviews: number;
    average_review_days: number | null;
    profiles: { display_name: string | null; email: string | null; first_name: string | null; last_name: string | null } | null;
    institutions: { name: string } | null;
  }>;

  // Client-side search filter for name/email/institution
  if (search) {
    const term = search.toLowerCase();
    reviewers = reviewers.filter((r) => {
      const hay = `${r.profiles?.display_name ?? ""} ${r.profiles?.email ?? ""} ${r.institutions?.name ?? ""} ${r.expertise.join(" ")} ${r.keywords.join(" ")}`.toLowerCase();
      return hay.includes(term);
    });
  }
  if (institution) {
    const term = institution.toLowerCase();
    reviewers = reviewers.filter((r) => (r.institutions?.name ?? "").toLowerCase().includes(term));
  }

  // Fetch active review counts
  const reviewerIds = reviewers.map((r) => r.id);
  const activeCounts: Record<string, number> = {};
  if (reviewerIds.length) {
    const { data: assignments } = await supabase.from("review_assignments").select("reviewer_id, status").in("reviewer_id", reviewerIds).in("status", ["invited", "accepted", "reviewing"] as never);
    for (const a of (assignments ?? []) as Array<{ reviewer_id: string }>) {
      activeCounts[a.reviewer_id] = (activeCounts[a.reviewer_id] ?? 0) + 1;
    }
  }

  const totalCount = count ?? reviewers.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1280px] mx-auto w-full">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reviewer Database</h1>
        <p className="text-sm text-muted-foreground mt-1">Search by expertise, keywords, institution, availability.</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <form method="GET" className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input name="search" defaultValue={search} placeholder="Search name, email, expertise..." className="pl-9" />
            </div>
            <Input name="expertise" defaultValue={expertise} placeholder="Expertise keyword" className="lg:w-48" />
            <Input name="institution" defaultValue={institution} placeholder="Institution" className="lg:w-48" />
            <select name="available" defaultValue={available} className="h-9 rounded-md border bg-background px-3 text-sm">
              <option value="">Any availability</option>
              <option value="true">Available</option>
              <option value="false">Unavailable</option>
            </select>
            <Button type="submit" variant="secondary">
              Filter
            </Button>
            {(search || expertise || available || institution) && (
              <Button variant="ghost" asChild>
                <Link href="/editor/reviewers">Clear</Link>
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Reviewers</CardTitle>
          <CardDescription>
            {totalCount} reviewers • Page {page} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 text-sm text-destructive">Failed to load: {error.message}</div>
          ) : reviewers.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No reviewers match criteria.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reviewer</TableHead>
                    <TableHead>Institution</TableHead>
                    <TableHead>Expertise / Keywords</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Overdue</TableHead>
                    <TableHead>Availability</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewers.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="space-y-0.5">
                           <p className="font-medium text-sm">{r.profiles?.display_name ?? (`${r.profiles?.first_name ?? ""} ${r.profiles?.last_name ?? ""}`.trim() || r.profiles?.email || r.id.slice(0, 8))}</p>
                          <p className="text-xs text-muted-foreground">{r.profiles?.email ?? "—"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{r.institutions?.name ?? "—"}</TableCell>
                      <TableCell className="max-w-[300px]">
                        <div className="flex flex-wrap gap-1">
                          {[...r.expertise.slice(0, 3), ...r.keywords.slice(0, 2)].map((k) => (
                            <Badge key={k} variant="secondary" className="text-[11px]">
                              {k}
                            </Badge>
                          ))}
                          {r.expertise.length + r.keywords.length > 5 && <span className="text-xs text-muted-foreground">+{r.expertise.length + r.keywords.length - 5}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-center">
                        <span className={(activeCounts[r.id] ?? 0) >= r.max_active_reviews ? "text-amber-600 font-medium" : ""}>{activeCounts[r.id] ?? 0} / {r.max_active_reviews}</span>
                      </TableCell>
                      <TableCell className="text-sm text-center">{r.completed_reviews}</TableCell>
                      <TableCell className={`text-sm text-center ${r.overdue_reviews > 0 ? "text-red-600 font-medium" : ""}`}>{r.overdue_reviews}</TableCell>
                      <TableCell>
                        <Badge variant={r.is_available ? "default" : "destructive"}>{r.is_available ? "Available" : "Unavailable"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
