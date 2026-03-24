import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Chip({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1.5 text-xs text-accent",
        className,
      )}
      {...props}
    />
  );
}
