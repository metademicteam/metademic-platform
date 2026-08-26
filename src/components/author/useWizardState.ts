"use client";

import * as React from "react";
import { z } from "zod";
import type { ManuscriptWizardInput } from "@/lib/validations/manuscript";

const STORAGE_KEY = "metademic:wizard:draft";
const AUTOSAVE_DEBOUNCE_MS = 1500;

export type WizardData = Partial<ManuscriptWizardInput> & {
  // Wizard-local fields not in final schema
  affiliations?: { id: string; institution: string; department?: string; country?: string; rorId?: string }[];
  draftId?: string; // manuscript id for server autosave
  _lastSavedAt?: string;
};

const defaultData: WizardData = {
  languageCode: "en",
  keywords: [],
  subjectAreas: [],
  authors: [],
  suggestedReviewers: [],
  excludedReviewers: [],
  affiliations: [],
  files: [],
};

// Load from localStorage (client only)
function loadFromStorage(): WizardData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WizardData;
  } catch {
    return null;
  }
}

export function useWizardState() {
  const [currentStep, setCurrentStep] = React.useState(1);
  const [data, setData] = React.useState<WizardData>(defaultData);
  const [completedSteps, setCompletedSteps] = React.useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<string | null>(null);
  const [autosaveError, setAutosaveError] = React.useState<string | null>(null);
  const [initialized, setInitialized] = React.useState(false);

  // Hydrate from localStorage on mount
  React.useEffect(() => {
    const stored = loadFromStorage();
    if (stored) {
      setData((prev) => ({ ...prev, ...stored }));
      if (stored.draftId) {
        // keep draftId
      }
    }
    // Try to restore currentStep
    try {
      const stepRaw = window.localStorage.getItem("metademic:wizard:step");
      if (stepRaw) {
        const n = parseInt(stepRaw, 10);
        if (n >= 1 && n <= 12) setCurrentStep(n);
      }
    } catch {}
    setInitialized(true);
  }, []);

  // Persist to localStorage on every change (never lose data)
  React.useEffect(() => {
    if (!initialized) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }, [data, initialized]);

  React.useEffect(() => {
    if (!initialized) return;
    try {
      window.localStorage.setItem("metademic:wizard:step", String(currentStep));
    } catch {}
  }, [currentStep, initialized]);

  // Autosave to server (draft manuscripts table) — debounced
  const autosaveRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const autosave = React.useCallback(
    async (nextData: WizardData) => {
      // Only autosave if we have at least journal + title
      if (!nextData.journalId || !nextData.title) return;
      // Avoid autosaving empty abstract yet
      try {
        setIsSaving(true);
        const payload: Record<string, unknown> = {
          journalId: nextData.journalId,
          title: nextData.title,
          subtitle: nextData.subtitle ?? null,
          abstract: nextData.abstract ?? null,
          articleType: nextData.articleType ?? "research_article",
          keywords: nextData.keywords ?? [],
          subjectAreas: nextData.subjectAreas ?? [],
          languageCode: nextData.languageCode ?? "en",
          // also persist authors/declarations etc in metadata so draft is resumable
          metadata: {
            wizard: {
              authors: nextData.authors ?? [],
              affiliations: nextData.affiliations ?? [],
              declarations: nextData.declarations ?? null,
              suggestedReviewers: nextData.suggestedReviewers ?? [],
              excludedReviewers: nextData.excludedReviewers ?? [],
              files: nextData.files ?? [],
            },
          },
        };

        // If we already have a draftId, PATCH it; otherwise POST create
        if (nextData.draftId) {
          await fetch(`/api/manuscripts/${nextData.draftId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } else {
          const res = await fetch("/api/manuscripts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const json = (await res.json().catch(() => ({}))) as { data?: { id: string }; error?: string };
          if (!res.ok) {
            throw new Error(json.error || `Failed to create draft (${res.status})`);
          }
          if (json.data?.id) {
            setData((prev) => ({ ...prev, draftId: json.data!.id }));
          }
        }
        const now = new Date().toISOString();
        setLastSavedAt(now);
        setAutosaveError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Autosave failed";
        setAutosaveError(msg);
        console.error("[wizard autosave]", e);
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  // Debounce autosave whenever data changes
  React.useEffect(() => {
    if (!initialized) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      void autosave(data);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
    };
  }, [data, initialized, autosave]);

  const updateData = React.useCallback((patch: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  const markStepCompleted = React.useCallback((step: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.add(step);
      return next;
    });
  }, []);

  const goToStep = React.useCallback(
    (step: number) => {
      if (step < 1 || step > 12) return;
      setCurrentStep(step);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    },
    []
  );

  const nextStep = React.useCallback(() => {
    setCurrentStep((s) => Math.min(12, s + 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const prevStep = React.useCallback(() => {
    setCurrentStep((s) => Math.max(1, s - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const saveDraftNow = React.useCallback(async () => {
    await autosave(data);
  }, [autosave, data]);

  const clearDraft = React.useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem("metademic:wizard:step");
    } catch {}
    setData(defaultData);
    setCurrentStep(1);
    setCompletedSteps(new Set());
    setLastSavedAt(null);
  }, []);

  return {
    currentStep,
    data,
    setData,
    updateData,
    completedSteps,
    markStepCompleted,
    goToStep,
    nextStep,
    prevStep,
    isSaving,
    lastSavedAt,
    autosaveError,
    initialized,
    saveDraftNow,
    clearDraft,
  };
}

// Step validation helpers (client-side)
export const stepSchemas: Record<number, z.ZodTypeAny | null> = {
  1: z.object({ journalId: z.string().uuid() }),
  2: z.object({
    articleType: z.string().min(1),
    subjectAreas: z.array(z.string()).min(1),
  }),
  3: z.object({
    title: z.string().trim().min(10).max(500),
    abstract: z.string().trim().min(50).max(5000),
  }),
  4: z.object({
    authors: z.array(z.any()).min(1),
  }),
  5: null, // affiliations optional
  6: z.object({
    keywords: z.array(z.string()).min(1).max(10),
  }),
  7: z.object({
    declarations: z.object({
      originalityConfirmed: z.literal(true),
      ethicsConfirmed: z.literal(true),
      authorshipConfirmed: z.literal(true),
      copyrightConfirmed: z.literal(true),
    }),
  }),
  8: null,
  9: null,
  10: z.object({
    files: z.array(z.any()).min(1, "At least one manuscript file is required."),
  }),
  11: null,
  12: null,
};

export function validateStep(step: number, data: WizardData): { ok: boolean; errors?: string[] } {
  const schema = stepSchemas[step];
  if (!schema) return { ok: true };
  const result = schema.safeParse(data);
  if (result.success) return { ok: true };
  return {
    ok: false,
    errors: result.error.errors.map((e) => e.message),
  };
}
