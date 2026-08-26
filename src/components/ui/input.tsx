import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * ETIS Input — white, border #e2e8f0, rounded 6px, 13px, focus ring #1e4ed8/20, placeholder #94a3b8
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-[6px] border border-[#e2e8f0] bg-white px-3 py-2 text-[13px] font-normal leading-none text-[#0f172a] placeholder:text-[#94a3b8] shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:border-[#1e4ed8]/30 focus-visible:ring-4 focus-visible:ring-[#1e4ed8]/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[#f8fafc] aria-[invalid=true]:border-[#fca5a5] aria-[invalid=true]:ring-[#ef4444]/10",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
