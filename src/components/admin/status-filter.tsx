import Link from "next/link";
import { cn } from "@/lib/utils";

export function StatusFilter({ base, current, options, param = "status" }: { base: string; current?: string; options: { value: string; label: string }[]; param?: string }) {
  return (
    <nav aria-label="Filter" className="flex flex-wrap gap-2">
      {[{ value: "", label: "All" }, ...options].map((o) => {
        const active = (current ?? "") === o.value;
        return (
          <Link
            key={o.value || "all"}
            href={o.value ? `${base}?${param}=${o.value}` : base}
            aria-current={active ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1.5 text-sm", active ? "border-forest bg-forest text-paper" : "border-sand-deep hover:bg-sand")}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
