import { BadgeCheck, Clock, MapPin, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ExperienceCardData } from "@/lib/data/public";
import { formatDuration, formatMoney } from "@/lib/format";
import { publicImageUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

export function Rating({ average, count, className }: { average: number | null; count: number; className?: string }) {
  if (!count || average === null) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm", className)}>
      <Star className="size-4 fill-terracotta text-terracotta" aria-hidden />
      <span className="font-medium">{Number(average).toFixed(1)}</span>
      <span className="text-stone">
        ({count} review{count === 1 ? "" : "s"})
      </span>
      <span className="sr-only">
        Rated {Number(average).toFixed(1)} out of 5 from {count} verified booking review{count === 1 ? "" : "s"}
      </span>
    </span>
  );
}

export function ExperienceCard({
  item,
  label,
  preload,
}: {
  item: ExperienceCardData;
  label?: string;
  preload?: boolean;
}) {
  return (
    <article className="group relative flex flex-col">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-card)] bg-sand">
        {item.cover_path ? (
          <Image
            src={publicImageUrl("experience-media", item.cover_path)}
            alt={item.cover_alt ?? ""}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            preload={preload}
          />
        ) : null}
        {label ? (
          <span className="absolute left-3 top-3 rounded-full bg-paper/95 px-2.5 py-1 text-xs font-medium text-charcoal">{label}</span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-1 flex-col">
        <p className="flex items-center gap-1 text-sm text-stone">
          <MapPin className="size-3.5" aria-hidden />
          {item.destination_name ? `${item.destination_name}, ` : ""}
          {item.county_name}
        </p>
        <h3 className="mt-1 font-sans text-[1.05rem] font-semibold leading-snug">
          <Link href={`/experiences/${item.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {item.title}
          </Link>
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden />
            {formatDuration(item.duration_minutes)}
          </span>
          <span className="inline-flex items-center gap-1">
            <BadgeCheck className="size-3.5 text-forest" aria-hidden />
            {item.provider_name}
          </span>
        </p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <p>
            <span className="font-semibold">{formatMoney(item.price_minor, item.currency)}</span>{" "}
            <span className="text-sm text-stone">{item.pricing_model === "per_person" ? "per person" : "per group"}</span>
          </p>
          <Rating average={item.average_rating} count={item.review_count} />
        </div>
      </div>
    </article>
  );
}

export function ExperienceGrid({ items, labelFor }: { items: ExperienceCardData[]; labelFor?: (i: ExperienceCardData) => string | undefined }) {
  return (
    <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, i) => (
        <ExperienceCard key={item.id} item={item} label={labelFor?.(item)} preload={i < 2} />
      ))}
    </div>
  );
}

export function ExperienceGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="aspect-[4/3] animate-pulse rounded-[var(--radius-card)] bg-sand/70" />
          <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-sand/70" />
          <div className="mt-2 h-5 w-4/5 animate-pulse rounded bg-sand/70" />
          <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-sand/70" />
        </div>
      ))}
    </div>
  );
}
