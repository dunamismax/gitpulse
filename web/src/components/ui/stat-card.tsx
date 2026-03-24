import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
}

export function StatCard({ label, value, detail, className }: StatCardProps) {
  return (
    <article
      className={cn(
        "rounded-panel border border-line bg-gradient-to-b from-panel to-panel-alt p-4 shadow-panel",
        className,
      )}
    >
      <span className="text-muted text-sm">{label}</span>
      <strong className="mt-3 block text-3xl">{value}</strong>
      {detail && <small className="text-muted">{detail}</small>}
    </article>
  );
}
