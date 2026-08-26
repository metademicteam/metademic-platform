import { cn } from "@/lib/utils";

/**
 * ETIS Skeleton — subtle etis bg, rounded 6-8px
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-[6px] bg-[#f1f5f9]", className)}
      {...props}
    />
  );
}

export { Skeleton };
