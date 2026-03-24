import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  key: string;
  label: string;
}

const navItems: NavItem[] = [
  { to: "/", key: "dashboard", label: "Dashboard" },
  { to: "/repositories", key: "repositories", label: "Repositories" },
  { to: "/sessions", key: "sessions", label: "Sessions" },
  { to: "/achievements", key: "achievements", label: "Achievements" },
  { to: "/settings", key: "settings", label: "Settings" },
];

interface AppLayoutProps {
  eyebrow: string;
  heading: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AppLayout({ eyebrow, heading, description, actions, children }: AppLayoutProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  function isActive(item: NavItem) {
    if (item.to === "/") return pathname === "/";
    return pathname.startsWith(item.to);
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_1fr]">
      <aside className="border-b border-line bg-bg/70 backdrop-blur-lg lg:border-b-0 lg:border-r lg:border-line">
        <div className="p-5 lg:p-7">
          <div className="mb-7 flex items-center gap-3.5">
            <div className="grid h-11 w-11 place-items-center rounded-card bg-gradient-to-br from-accent to-accent-strong text-sm font-bold text-[#08111a]">
              GP
            </div>
            <div>
              <h1 className="m-0 text-base font-semibold">GitPulse</h1>
              <p className="m-0 mt-1 text-xs text-muted">Local-first git analytics</p>
            </div>
          </div>
          <nav className="grid gap-2">
            {navItems.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                className={cn(
                  "rounded-xl px-3.5 py-3 text-sm text-muted no-underline transition-colors",
                  isActive(item) && "bg-accent/10 text-slate-50",
                  !isActive(item) && "hover:bg-accent/10 hover:text-slate-50",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </aside>
      <main className="p-5 lg:p-7">
        <section className={cn("mb-5 flex gap-4", actions ? "items-end justify-between" : "")}>
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
            <h2 className="m-0 text-xl font-semibold">{heading}</h2>
            <p className="mt-1 text-sm text-muted">{description}</p>
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </section>
        <div className="grid gap-4">{children}</div>
      </main>
    </div>
  );
}
