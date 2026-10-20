import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Label, Select } from "@/components/ui/field";
import type { ExperienceSearch } from "@/lib/data/public";
import { nairobiDate } from "@/lib/format";
import { ACCESSIBILITY_FEATURES, DURATION_FILTERS, REGIONS } from "@/lib/site";

type Option = { value: string; label: string };

/**
 * Filters as a plain GET form: works without JavaScript, and the resulting URL is
 * shareable and bookmarkable. Every control maps to a real database filter.
 */
export function SearchFilters({
  search,
  categories,
  counties,
  destinations,
}: {
  search: ExperienceSearch;
  categories: Option[];
  counties: { code: number; name: string }[];
  destinations: Option[];
}) {
  const today = nairobiDate();
  return (
    <form method="get" action="/experiences" className="space-y-5" role="search" aria-label="Filter experiences">
      <div className="space-y-1.5">
        <Label htmlFor="f-q">Search</Label>
        <Input id="f-q" name="q" type="search" defaultValue={search.q ?? ""} placeholder="Birding, Lamu, cooking…" maxLength={100} />
      </div>

      <details className="group rounded-[var(--radius-card)] border border-sand-deep bg-paper lg:border-0 lg:bg-transparent" open>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium lg:hidden">
          <SlidersHorizontal className="size-4" aria-hidden /> More filters
        </summary>
        <div className="space-y-5 px-4 pb-4 lg:p-0">
          <div className="space-y-1.5">
            <Label htmlFor="f-category">Type of experience</Label>
            <Select id="f-category" name="category" defaultValue={search.category ?? ""}>
              <option value="">All types</option>
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div className="space-y-1.5">
              <Label htmlFor="f-region">Region</Label>
              <Select id="f-region" name="region" defaultValue={search.region ?? ""}>
                <option value="">Anywhere</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-county">County</Label>
              <Select id="f-county" name="county" defaultValue={search.county ? String(search.county) : ""}>
                <option value="">Any county</option>
                {counties.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {destinations.length ? (
            <div className="space-y-1.5">
              <Label htmlFor="f-destination">Destination</Label>
              <Select id="f-destination" name="destination" defaultValue={search.destination ?? ""}>
                <option value="">Any destination</option>
                {destinations.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="f-date">Date</Label>
              <Input id="f-date" name="date" type="date" min={today} defaultValue={search.date ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-guests">Guests</Label>
              <Input id="f-guests" name="guests" type="number" inputMode="numeric" min={1} max={50} defaultValue={search.guests ?? ""} />
            </div>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Price per booking unit</legend>
            <div className="grid grid-cols-[5.5rem_1fr_1fr] gap-2">
              <Select name="currency" aria-label="Currency" defaultValue={search.currency ?? "KES"}>
                <option value="KES">KES</option>
                <option value="USD">USD</option>
              </Select>
              <Input name="min" inputMode="decimal" aria-label="Minimum price" placeholder="Min" defaultValue={search.min ?? ""} />
              <Input name="max" inputMode="decimal" aria-label="Maximum price" placeholder="Max" defaultValue={search.max ?? ""} />
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="f-duration">Duration</Label>
            <Select id="f-duration" name="duration" defaultValue={search.duration ?? ""}>
              <option value="">Any length</option>
              {DURATION_FILTERS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Accessibility (as described by hosts)</legend>
            {ACCESSIBILITY_FEATURES.map((f) => (
              <label key={f.value} className="flex items-center gap-2.5 text-[0.95rem]">
                <Checkbox name="access" value={f.value} defaultChecked={search.access?.includes(f.value)} />
                {f.label}
              </label>
            ))}
          </fieldset>

          <label className="flex items-start gap-2.5 text-[0.95rem]">
            <Checkbox name="licensed" value="1" defaultChecked={search.licensed === "1"} className="mt-0.5" />
            <span>Tourism licence checked by our team</span>
          </label>

          <input type="hidden" name="sort" value={search.sort} />
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              Show results
            </Button>
            <Link href="/experiences" className="inline-flex h-11 items-center rounded-[var(--radius-control)] px-3 text-sm text-forest underline underline-offset-4">
              Clear all
            </Link>
          </div>
        </div>
      </details>
    </form>
  );
}
