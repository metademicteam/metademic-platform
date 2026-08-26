import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * ETIS Badge — pill, 10px uppercase tracking
 * Tokens:
 *  - blue:   bg #eff6ff text #1e40af (default)
 *  - yellow: bg #fef9c3 text #a16207 (classifications like 1.1)
 *  - gray:   bg #f1f5f9 text #475569 (neutral)
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] leading-none transition-colors focus:outline-none focus:ring-2 focus:ring-[#1e4ed8]/20 focus:ring-offset-0 whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[#eff6ff] text-[#1e40af] hover:bg-[#dbeafe]",
        primary: "border-transparent bg-[#eff6ff] text-[#1e40af] hover:bg-[#dbeafe]",
        blue: "border-transparent bg-[#eff6ff] text-[#1e40af] hover:bg-[#dbeafe]",
        secondary: "border-transparent bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]",
        neutral: "border-transparent bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]",
        gray: "border-transparent bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]",
        success: "border-transparent bg-[#f0fdf4] text-[#15803d] hover:bg-[#dcfce7]",
        green: "border-transparent bg-[#f0fdf4] text-[#15803d] hover:bg-[#dcfce7]",
        warning: "border-transparent bg-[#fef9c3] text-[#a16207] hover:bg-[#fef08a]",
        yellow: "border-transparent bg-[#fef9c3] text-[#a16207] hover:bg-[#fef08a]",
        classification: "border-[#fde68a] bg-[#fef9c3] text-[#a16207] hover:bg-[#fef08a]",
        destructive: "border-transparent bg-[#fef2f2] text-[#b91c1c] hover:bg-[#fee2e2]",
        red: "border-transparent bg-[#fef2f2] text-[#b91c1c] hover:bg-[#fee2e2]",
        outline: "border-[#e2e8f0] bg-white text-[#64748b] hover:bg-[#f8fafc] hover:text-[#334155]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
