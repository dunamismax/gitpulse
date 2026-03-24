import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  className,
  tight,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tight?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-panel border border-line bg-gradient-to-b from-panel to-panel-alt shadow-panel",
        tight ? "px-5 py-4" : "p-5",
        className,
      )}
      {...props}
    />
  );
}

export function PanelHead({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <header className={cn("mb-4 flex items-center justify-between gap-3", className)} {...props} />
  );
}
