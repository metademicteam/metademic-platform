"use client";

import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, ArrowRight, Save } from "lucide-react";

export function WizardNav({
  currentStep,
  totalSteps,
  onPrev,
  onNext,
  onSaveDraft,
  isSaving,
  isNextDisabled,
  nextLabel,
}: {
  currentStep: number;
  totalSteps: number;
  onPrev: () => void;
  onNext: () => void;
  onSaveDraft?: () => void;
  isSaving?: boolean;
  isNextDisabled?: boolean;
  nextLabel?: string;
}) {
  const isFirst = currentStep === 1;
  const isLast = currentStep === totalSteps;

  return (
    <div className="flex items-center justify-between gap-3 border-t bg-card px-4 py-4 sm:px-6 mt-6">
      <Button type="button" variant="outline" onClick={onPrev} disabled={isFirst || isSaving}>
        <ArrowLeft className="h-4 w-4" />
        Previous
      </Button>

      <div className="flex items-center gap-2">
        {onSaveDraft && (
          <Button type="button" variant="ghost" onClick={onSaveDraft} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save draft
          </Button>
        )}
        <Button type="button" onClick={onNext} disabled={isNextDisabled || isSaving}>
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          {nextLabel ?? (isLast ? "Submit manuscript" : "Continue")}
          {!isLast && <ArrowRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
