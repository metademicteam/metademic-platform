"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

// ---------------------------------------------------------------------------
// Simple toast system (sonner-like API surface without external dependency)
// ---------------------------------------------------------------------------

export type ToastVariant = "default" | "destructive" | "success" | "error";

export interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastContextValue {
  toasts: ToastItem[];
  toast: (item: Omit<ToastItem, "id">) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <Toaster />");
  return ctx;
}

// Provider / viewport
export function Toaster({ children }: { children?: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback((item: Omit<ToastItem, "id">) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { ...item, id }]);
    // Auto dismiss after 4s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
    return id;
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = React.useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto rounded-lg border bg-background p-4 shadow-lg flex items-start gap-3",
              t.variant === "destructive" && "border-destructive bg-destructive text-destructive-foreground",
              t.variant === "success" && "border-green-500 bg-green-50 text-green-900",
            )}
          >
            <div className="flex-1">
              {t.title && <div className="text-sm font-semibold">{t.title}</div>}
              {t.description && <div className="text-sm opacity-90">{t.description}</div>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Convenience imperative helper — works only when called inside React tree via useToast.
// For non-hook contexts, import { toast as sonnerToast } from "sonner" if you add the dep.
export function toast(item: Omit<ToastItem, "id">): void {
  // This is a no-op placeholder for code that expects a `toast()` import outside React.
  // Prefer `const { toast } = useToast()` inside components.
  if (typeof window !== "undefined") {
    console.warn("[toast] Use `const { toast } = useToast()` inside a component under <Toaster />. Payload:", item);
  }
}
