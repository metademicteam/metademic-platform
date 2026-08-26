import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * ETIS Button — Estonian Research Information System
 * Tokens: primary #1e4ed8 (hover #1e40af), border #e2e8f0, radius 6px,
 * shadow 0 1px 2px rgba(30,78,216,0.15), text 12-13px medium
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[6px] text-[13px] font-medium leading-none tracking-[-0.01em] transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1e4ed8]/10 focus-visible:border-[#1e4ed8]/20 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-[#1e4ed8] text-white border border-transparent shadow-[0_1px_2px_rgba(30,78,216,0.15)] hover:bg-[#1e40af] hover:shadow-[0_2px_6px_rgba(30,78,216,0.2)] active:bg-[#1e3a8a]",
        primary:
          "bg-[#1e4ed8] text-white border border-transparent shadow-[0_1px_2px_rgba(30,78,216,0.15)] hover:bg-[#1e40af] hover:shadow-[0_2px_6px_rgba(30,78,216,0.2)] active:bg-[#1e3a8a]",
        destructive:
          "bg-[#dc2626] text-white border border-transparent shadow-[0_1px_2px_rgba(220,38,38,0.15)] hover:bg-[#b91c1c] hover:shadow-[0_2px_6px_rgba(220,38,38,0.18)] active:bg-[#991b1b]",
        outline:
          "bg-white text-[#0f172a] border border-[#e2e8f0] shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:bg-[#f8fafc] hover:border-[#cbd5e1] hover:text-[#0f172a] active:bg-[#f1f5f9]",
        secondary:
          "bg-[#f1f5f9] text-[#334155] border border-transparent hover:bg-[#e2e8f0] hover:text-[#0f172a] active:bg-[#e2e8f0]",
        ghost:
          "bg-transparent text-[#475569] border border-transparent hover:bg-[#f1f5f9] hover:text-[#0f172a] active:bg-[#e2e8f0] shadow-none",
        link: "bg-transparent text-[#1e4ed8] underline-offset-4 hover:underline hover:text-[#1e40af] border-transparent shadow-none h-auto p-0 font-medium",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-[12px] rounded-[6px]",
        lg: "h-10 px-6 text-[13px] rounded-[6px]",
        icon: "h-9 w-9 p-0",
        xs: "h-7 px-2.5 text-[12px] rounded-[6px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
