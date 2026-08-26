"use client";

import * as React from "react";
import { Bell, CheckCheck, Loader2, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { createClient } from "@/lib/supabase/browser";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";

interface NotificationRow {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  action_url: string | null;
  created_at: string;
}

const PREFS_KEY = "metademic.notificationPrefs";

const DEFAULT_PREFS = {
  submissionUpdates: true,
  reviewInvitations: true,
  editorialDecisions: true,
  apcAndPayments: true,
  productionProofs: true,
  marketing: false,
};

export default function NotificationsPage() {
  const { toast } = useToast();
  const [notifications, setNotifications] = React.useState<NotificationRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [prefs, setPrefs] = React.useState(DEFAULT_PREFS);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<"all" | "unread">("all");

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
    } catch {}
  }, []);

  function togglePref(key: keyof typeof DEFAULT_PREFS) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    toast({ title: "Preferences saved", variant: "success" });
  }

  async function fetchNotifications() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data, error } = await supabase.from("notifications").select("id,title,message,type,is_read,action_url,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      setNotifications((data as NotificationRow[]) ?? []);
    } catch {
      // leave empty — show empty state
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { fetchNotifications(); }, []);

  async function markAllRead() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true } as never).eq("user_id", user.id).eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    toast({ title: "All notifications marked as read", variant: "success" });
  }

  async function markOneRead(id: string) {
    const supabase = createClient();
    await supabase.from("notifications").update({ is_read: true } as never).eq("id", id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  }

  const visible = filter === "unread" ? notifications.filter((n) => !n.is_read) : notifications;
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="flex min-h-screen bg-muted/20">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopNav onMenuClick={() => setMobileOpen(true)} unreadCount={unreadCount} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="max-w-[960px] mx-auto space-y-6">
            <Breadcrumbs items={[{ label: "Account", href: "/account/profile" }, { label: "Notifications" }]} />
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground"><Bell className="h-5 w-5" /></div>
                <div>
                  <h1 className="text-xl font-semibold">Notifications</h1>
                  <p className="text-sm text-muted-foreground">{unreadCount} unread · {notifications.length} total</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setFilter(filter === "all" ? "unread" : "all")}>{filter === "all" ? "Show unread" : "Show all"}</Button>
                <Button variant="outline" size="sm" onClick={markAllRead} disabled={unreadCount === 0}><CheckCheck className="h-4 w-4" /> Mark all read</Button>
              </div>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Preferences</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {[
                  ["submissionUpdates", "Submission updates"],
                  ["reviewInvitations", "Review invitations & deadlines"],
                  ["editorialDecisions", "Editorial decisions"],
                  ["apcAndPayments", "APC & payments"],
                  ["productionProofs", "Production & proofs"],
                  ["marketing", "Product announcements"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between gap-4 rounded-md border p-3">
                    <span className="text-sm font-medium">{label}</span>
                    <input type="checkbox" checked={prefs[key as keyof typeof prefs]} onChange={() => togglePref(key as keyof typeof prefs)} className="h-4 w-4" />
                  </label>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Recent notifications</CardTitle>
                <Button variant="ghost" size="sm" onClick={fetchNotifications}><Loader2 className="h-4 w-4" /> Refresh</Button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : visible.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Inbox className="h-6 w-6 text-muted-foreground" /></div>
                    <p className="mt-3 text-sm font-medium">No notifications</p>
                    <p className="text-sm text-muted-foreground">You&apos;re all caught up. We&apos;ll notify you when something needs your attention.</p>
                  </div>
                ) : (
                  <ul className="divide-y">
                    {visible.map((n) => (
                      <li key={n.id} className={`flex gap-3 py-3 ${!n.is_read ? "bg-muted/40 -mx-3 px-3 rounded-md" : ""}`}>
                        <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${!n.is_read ? "bg-primary" : "bg-transparent"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-5">{n.title}</p>
                          <p className="text-sm text-muted-foreground line-clamp-2">{n.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()} · {n.type}</p>
                          {n.action_url && <a href={n.action_url} className="text-xs text-primary hover:underline">View →</a>}
                        </div>
                        {!n.is_read && <Button variant="ghost" size="sm" onClick={() => markOneRead(n.id)}>Mark read</Button>}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
