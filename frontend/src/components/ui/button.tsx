import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-gradient-to-br from-accent to-accent-strong text-[#06111a] font-bold",
  secondary: "bg-white/10 text-slate-50",
  danger: "bg-danger/20 text-red-200",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "cursor-pointer rounded-card border-none px-4 py-3 font-sans",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
