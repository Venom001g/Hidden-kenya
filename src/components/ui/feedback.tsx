import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  info: { box: "border-sand-deep bg-paper", icon: Info, color: "text-forest" },
  success: { box: "border-forest/25 bg-forest-soft", icon: CheckCircle2, color: "text-forest" },
  warning: { box: "border-terracotta/30 bg-terracotta-soft", icon: AlertTriangle, color: "text-terracotta" },
  error: { box: "border-danger/30 bg-danger-soft", icon: AlertTriangle, color: "text-danger" },
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  className,
  live,
}: {
  tone?: keyof typeof tones;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Announce to screen readers when it appears. */
  live?: boolean;
}) {
  const t = tones[tone];
  const Icon = t.icon;
  return (
    <div
      className={cn("flex gap-3 rounded-[var(--radius-card)] border p-4 text-[0.95rem]", t.box, className)}
      role={live ? (tone === "error" ? "alert" : "status") : undefined}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", t.color)} aria-hidden />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-charcoal/90 [&_a]:underline">{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border border-dashed border-sand-deep px-6 py-12 text-center", className)}>
      <svg viewBox="0 0 120 28" className="mx-auto mb-5 h-6 w-28 text-sand-deep" aria-hidden>
        <path d="M0 26 L22 14 L34 19 L54 6 L70 15 L84 10 L102 20 L120 16" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <h2 className="text-xl">{title}</h2>
      {children ? <div className="mx-auto mt-2 max-w-md text-stone">{children}</div> : null}
      {action ? <div className="mt-6 flex justify-center gap-3">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-sand/70", className)} aria-hidden />;
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "forest" | "terracotta" | "danger" | "outline";
  className?: string;
}) {
  const styles = {
    neutral: "bg-sand text-charcoal",
    forest: "bg-forest-soft text-forest",
    terracotta: "bg-terracotta-soft text-terracotta",
    danger: "bg-danger-soft text-danger",
    outline: "border border-sand-deep text-stone",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.8rem] font-medium", styles, className)}>
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-3xl sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-stone">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
