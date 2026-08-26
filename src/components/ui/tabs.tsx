import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/**
 * ETIS Tabs — underline blue active, gray inactive
 * List: border-b #e2e8f0, transparent bg
 * Trigger: 13px medium, gray #64748b inactive, blue #1e4ed8 active with bottom border 2px
 */

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 w-full items-center justify-start gap-0 border-b border-[#e2e8f0] bg-transparent p-0 rounded-none",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-[13px] font-medium text-[#64748b] ring-offset-white transition-colors hover:text-[#334155] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e4ed8]/20 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-[#1e4ed8] data-[state=active]:text-[#1e4ed8] data-[state=active]:font-semibold -mb-px",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e4ed8]/20 focus-visible:ring-offset-0",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
