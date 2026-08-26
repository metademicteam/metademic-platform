import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * ETIS Card — Estonian Research Information System
 * White bg, border #e2e8f0, radius 12px (8-12), shadow 0 1px 3px rgba(16,24,40,0.06)
 * Hover: 0 4px 12px rgba(16,24,40,0.08). No gradients. Header label 12px uppercase gray-500, title 14px semibold slate-900
 */

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[12px] border border-[#e2e8f0] bg-white text-[#0f172a] shadow-[0_1px_3px_rgba(16,24,40,0.06)] transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)] overflow-hidden",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-5 pb-4", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-[14px] font-semibold leading-none tracking-tight text-[#0f172a]", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

/**
 * ETIS spec: header 12px uppercase gray-500 (used as CardDescription / kicker)
 */
const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-[12px] font-medium uppercase tracking-[0.05em] leading-none text-[#64748b]", className)}
      {...props}
    />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center p-5 pt-4 border-t border-[#f1f5f9] bg-[#fcfdff]/50", className)}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
