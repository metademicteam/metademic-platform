"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { RotateCcw, Loader2 } from "lucide-react";

export function JobsClient({
  jobs,
}: {
  jobs: Array<{ id: string; job_type: string; entity_type: string | null; entity_id: string | null; status: string; attempts: number; max_attempts: number; scheduled_at: string; created_at: string; error_message: string | null; payload: Record<string, unknown> }>;
}) {
  const { toast } = useToast();
  const [retrying, setRetrying] = React.useState<string | null>(null);

  async function retryJob(jobId: string) {
    setRetrying(jobId);
    try {
      const res = await fetch(`/api/jobs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Retry failed");
      toast({ title: "Job retried — now pending", variant: "success" });
      // Reload to see update
      window.location.reload();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Retry failed", variant: "error" });
    } finally {
      setRetrying(null);
    }
  }

  if (jobs.length === 0) {
    return <p className="p-10 text-center text-sm text-muted-foreground">No system jobs found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow><TableHead>Job Type</TableHead><TableHead>Entity</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead><TableHead>Scheduled</TableHead><TableHead>Error</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
        <TableBody>
          {jobs.map((j) => (
            <TableRow key={j.id}>
              <TableCell className="font-mono text-xs">{j.job_type}</TableCell>
              <TableCell className="text-xs font-mono">{j.entity_type ?? "—"}{j.entity_id ? ` · ${j.entity_id.slice(0, 8)}…` : ""}</TableCell>
              <TableCell><Badge variant={j.status === "completed" ? "default" : j.status === "failed" ? "destructive" : j.status === "pending" ? "secondary" : "outline"} className="text-xs">{j.status}</Badge></TableCell>
              <TableCell className="text-xs">{j.attempts}/{j.max_attempts}</TableCell>
              <TableCell className="text-xs">{new Date(j.scheduled_at).toLocaleString()}<br /><span className="text-muted-foreground">{new Date(j.created_at).toLocaleString()}</span></TableCell>
              <TableCell className="text-xs max-w-[200px] truncate" title={j.error_message ?? ""}>{j.error_message ?? "—"}</TableCell>
              <TableCell className="text-right">
                {(j.status === "failed" || j.status === "cancelled") && (
                  <Button variant="outline" size="sm" onClick={() => retryJob(j.id)} disabled={!!retrying}>
                    {retrying === j.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Retry
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
