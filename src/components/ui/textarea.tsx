import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * ETIS Textarea — matches Input tokens
 * white, border #e2e8f0, rounded 6px, 13px, focus ring #1e4ed8/20
 */
export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-[6px] border border-[#e2e8f0] bg-white px-3 py-2.5 text-[13px] font-normal leading-5 text-[#0f172a] placeholder:text-[#94a3b8] shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors focus-visible:outline-none focus-visible:border-[#1e4ed8]/30 focus-visible:ring-4 focus-visible:ring-[#1e4ed8]/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[#f8fafc] aria-[invalid=true]:border-[#fca5a5]",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
