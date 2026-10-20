import type { ReactNode } from "react";
import { Suspense } from "react";
import { DashboardNav, type NavItem } from "./dashboard-nav";

export function DashboardShell({ title, nav, children }: { title: string; nav: NavItem[]; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:grid lg:grid-cols-[13.5rem_1fr] lg:gap-10 lg:px-8 lg:py-12">
      <aside className="mb-6 lg:mb-0">
        <p className="mb-3 hidden text-sm font-semibold text-stone lg:block">{title}</p>
        <Suspense fallback={<div className="h-10" />}>
          <DashboardNav items={nav} label={title} />
        </Suspense>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="h-9 w-64 animate-pulse rounded bg-sand/70" />
      <div className="h-4 w-96 max-w-full animate-pulse rounded bg-sand/60" />
      <div className="mt-6 h-64 animate-pulse rounded-[var(--radius-card)] bg-sand/50" />
    </div>
  );
}

export function Section({ title, description, children, actions }: { title: string; description?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-sand-deep bg-paper p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl">{title}</h2>
          {description ? <p className="mt-1 text-sm text-stone">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-sand-deep bg-paper p-4">
      <p className="text-sm text-stone">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-stone">{hint}</p> : null}
    </div>
  );
}

export function DataTable({ head, children, empty }: { head: string[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[40rem] border-collapse text-left text-[0.95rem]">
        <thead>
          <tr className="border-b border-sand-deep text-sm text-stone">
            {head.map((h) => (
              <th key={h} scope="col" className="px-5 py-2 font-medium sm:px-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-deep/70">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export const td = "px-5 py-3 align-top sm:px-3";
