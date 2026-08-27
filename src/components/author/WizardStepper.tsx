"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export const WIZARD_STEPS = [
  { id: 1, label: "Journal", short: "Journal" },
  { id: 2, label: "Article Type", short: "Type" },
  { id: 3, label: "Title & Abstract", short: "Title" },
  { id: 4, label: "Authors & Affiliations", short: "Authors" },
  { id: 5, label: "Keywords", short: "Keywords" },
  { id: 6, label: "Declarations", short: "Declarations" },
  { id: 7, label: "Suggested Reviewers", short: "Suggested" },
  { id: 8, label: "Excluded Reviewers", short: "Excluded" },
  { id: 9, label: "Upload Files", short: "Files" },
  { id: 10, label: "Review", short: "Review" },
  { id: 11, label: "Submit", short: "Submit" },
] as const;

export const TOTAL_STEPS = WIZARD_STEPS.length;

export function WizardStepper({
  currentStep,
  completedSteps,
  onStepClick,
}: {
  currentStep: number;
  completedSteps: Set<number>;
  onStepClick?: (step: number) => void;
}) {
  return (
    <div className="w-full">
      {/* Desktop: horizontal stepper */}
      <div className="hidden lg:flex items-center gap-1 overflow-x-auto pb-2">
        {WIZARD_STEPS.map((step, idx) => {
          const isActive = step.id === currentStep;
          const isCompleted = completedSteps.has(step.id);
          const isPast = step.id < currentStep || isCompleted;
          const clickable = isPast || step.id === currentStep || completedSteps.has(step.id - 1);
          return (
            <div key={step.id} className="flex items-center gap-1 flex-1 min-w-0">
              <button
                type="button"
                disabled={!onStepClick || !clickable}
                onClick={() => onStepClick?.(step.id)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap border",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : isCompleted
                      ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/15"
                      : isPast
                        ? "bg-muted text-muted-foreground border-transparent"
                        : "bg-card text-muted-foreground border-border",
                  clickable && onStepClick ? "cursor-pointer" : "cursor-default"
                )}
                aria-current={isActive ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold shrink-0",
                    isActive
                      ? "bg-primary-foreground text-primary"
                      : isCompleted
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted-foreground/15 text-muted-foreground"
                  )}
                >
                  {isCompleted ? <Check className="h-3 w-3" /> : step.id}
                </span>
                <span className="hidden xl:inline">{step.label}</span>
                <span className="xl:hidden">{step.short}</span>
              </button>
              {idx < WIZARD_STEPS.length - 1 && (
                <div className={cn("h-px flex-1 min-w-[8px] mx-1", isPast || isCompleted ? "bg-primary/30" : "bg-border")} />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: progress bar + step indicator */}
      <div className="lg:hidden space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            Step {currentStep} of {WIZARD_STEPS.length}: {WIZARD_STEPS[currentStep - 1]?.label}
          </span>
          <span className="text-muted-foreground">{Math.round((currentStep / WIZARD_STEPS.length) * 100)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(currentStep / WIZARD_STEPS.length) * 100}%` }}
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {WIZARD_STEPS.map((s) => (
            <button
              key={s.id}
              onClick={() => onStepClick?.(s.id)}
              className={cn(
                "h-1.5 flex-1 rounded-full min-w-[8px] transition-colors",
                s.id === currentStep ? "bg-primary" : s.id < currentStep || completedSteps.has(s.id) ? "bg-primary/40" : "bg-muted"
              )}
              aria-label={`Go to step ${s.id}: ${s.label}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
