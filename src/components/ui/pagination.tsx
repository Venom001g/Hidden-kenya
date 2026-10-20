import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Link-based pagination that preserves the current query string. */
export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: Record<string, string | string[] | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "page" || v === undefined) continue;
      for (const item of Array.isArray(v) ? v : [v]) if (item) sp.append(k, item);
    }
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const windowed = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1);
  const link = "inline-flex h-10 min-w-10 items-center justify-center rounded-md px-3 text-sm";
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1">
      {page > 1 ? (
        <Link href={href(page - 1)} className={cn(link, "hover:bg-sand")} rel="prev">
          <ChevronLeft className="size-4" aria-hidden /> Previous
        </Link>
      ) : null}
      {windowed.map((p, i) => (
        <span key={p} className="contents">
          {i > 0 && p - windowed[i - 1] > 1 ? <span className="px-1 text-stone">…</span> : null}
          <Link
            href={href(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(link, p === page ? "bg-forest text-paper" : "hover:bg-sand")}
          >
            {p}
          </Link>
        </span>
      ))}
      {page < pages ? (
        <Link href={href(page + 1)} className={cn(link, "hover:bg-sand")} rel="next">
          Next <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </nav>
  );
}
