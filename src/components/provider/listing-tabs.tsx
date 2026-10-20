import Link from "next/link";
import { Badge } from "@/components/ui/feedback";
import type { Enums } from "@/lib/database.types";
import { EXPERIENCE_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";

export function ListingTabs({
  id,
  title,
  status,
  active,
}: {
  id: string;
  title: string;
  status: Enums<"experience_status">;
  active: "details" | "photos" | "availability";
}) {
  const tabs = [
    { key: "details", href: `/provider/listings/${id}`, label: "Details" },
    { key: "photos", href: `/provider/listings/${id}/photos`, label: "Photos" },
    { key: "availability", href: `/provider/listings/${id}/availability`, label: "Dates and capacity" },
  ] as const;
  const s = EXPERIENCE_STATUS[status];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl">{title}</h1>
        <Badge tone={s.tone}>{s.label}</Badge>
      </div>
      <nav aria-label="Listing sections" className="flex gap-1 overflow-x-auto border-b border-sand-deep">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === active ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[0.95rem]",
              t.key === active ? "border-forest font-medium text-forest" : "border-transparent text-stone hover:text-charcoal",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
