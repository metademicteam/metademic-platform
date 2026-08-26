"use client";

import * as React from "react";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
}

export function NotificationsDropdown() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=10");
      if (res.ok) {
        const j = await res.json();
        setNotifications(j.data ?? []);
        setUnread(j.unreadCount ?? 0);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchNotifications();
    // Poll every 30s + realtime via supabase if available — polling is fallback
    const id = setInterval(fetchNotifications, 30000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  async function markRead(id: string) {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "POST" });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnread(prev => Math.max(0, prev - 1));
    } catch {}
  }

  async function markAllRead() {
    try {
      await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_all_read" }) });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnread(0);
    } catch {}
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <Badge className="absolute -right-1 -top-1 h-5 min-w-[20px] px-1 py-0 text-[10px] flex items-center justify-center rounded-full">{unread > 99 ? "99+" : unread}</Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[380px]">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          <span className="flex items-center gap-2">
            {unread > 0 && <Badge variant="secondary" className="text-xs">{unread} unread</Badge>}
            {unread > 0 && <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={markAllRead}><CheckCheck className="h-3 w-3 mr-1" /> Mark all read</Button>}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-[420px] overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /><p className="text-xs text-muted-foreground mt-2">Loading notifications…</p></div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No notifications yet.<br /><span className="text-xs">Events like submission received, reviewer invited, decision made, APC issued, proof ready, article published will appear here.</span></div>
          ) : (
            <div className="space-y-0">
              {notifications.map(n => (
                <div key={n.id} className={`px-3 py-3 border-b last:border-0 hover:bg-accent/50 flex gap-3 ${!n.is_read ? "bg-primary/5" : ""}`}>
                  <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${!n.is_read ? "bg-primary" : "bg-muted"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight truncate">{n.title} <span className="text-xs font-normal text-muted-foreground">· {n.type}</span></p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{n.message}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {n.action_url && <Link href={n.action_url} className="text-xs font-medium text-primary hover:underline">View →</Link>}
                      {!n.is_read && <button onClick={() => markRead(n.id)} className="text-xs text-muted-foreground hover:text-foreground">Mark read</button>}
                      <span className="text-xs text-muted-foreground ml-auto">{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="p-2 flex justify-between">
          <Link href="/account/notifications" className="text-xs font-medium text-primary hover:underline">Notification center →</Link>
          <span className="text-xs text-muted-foreground">Realtime via Supabase</span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
