import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "info" | "success" | "error";

const variants: Record<Variant, string> = {
  info: "border-accent/30 bg-accent/10",
  success: "border-success/40 bg-success/15 text-green-200",
  error: "border-danger/40 bg-danger/15 text-red-200",
};

export function Notice({
  variant = "info",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: Variant }) {
  return (
    <div
      className={cn("rounded-card border px-4 py-3.5", variants[variant], className)}
      {...props}
    />
  );
}
