import { Search } from "lucide-react";
import { Input, Label, Select } from "@/components/ui/field";
import { getCategories } from "@/lib/data/public";

function Escarpment() {
  return (
    <svg viewBox="0 0 1440 360" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-0 h-40 w-full sm:h-56 lg:h-64" aria-hidden>
      <circle cx="1010" cy="190" r="96" fill="#E7B98F" className="animate-horizon" style={{ animationDelay: "150ms" }} />
      <path
        className="animate-horizon"
        d="M0 210 L120 168 L210 196 L330 132 L440 176 L560 120 L690 170 L800 140 L930 186 L1050 128 L1170 172 L1290 150 L1440 190 V360 H0 Z"
        fill="#2B5E47"
      />
      <path
        className="animate-horizon"
        style={{ animationDelay: "120ms" }}
        d="M0 262 L150 228 L280 252 L420 210 L560 246 L700 214 L840 250 L980 222 L1120 256 L1260 230 L1440 252 V360 H0 Z"
        fill="#1D4A37"
      />
      <path
        className="animate-horizon"
        style={{ animationDelay: "240ms" }}
        d="M0 312 L180 290 L360 306 L540 284 L720 304 L900 286 L1080 308 L1260 292 L1440 306 V360 H0 Z"
        fill="#133326"
      />
      <path
        d="M0 262 L150 228 L280 252 L420 210 L560 246 L700 214 L840 250 L980 222 L1120 256 L1260 230 L1440 252"
        fill="none"
        stroke="#A3462A"
        strokeWidth="2"
        opacity="0.7"
      />
    </svg>
  );
}

export async function Hero() {
  const categories = await getCategories();
  return (
    <section className="relative overflow-hidden bg-sand/60">
      <Escarpment />
      <div className="relative mx-auto max-w-7xl px-4 pb-44 pt-12 sm:px-6 sm:pb-60 sm:pt-20 lg:px-8 lg:pb-72">
        <h1 className="max-w-3xl text-[2.6rem] leading-[1.05] sm:text-6xl lg:text-[4.25rem]">
          Book experiences with Kenyan guides, cooks, rangers and craftspeople.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-charcoal/80">
          Every host is checked by our team before they can take bookings. Prices are set by hosts, paid securely by M-Pesa or card.
        </p>

        <form
          method="get"
          action="/experiences"
          role="search"
          aria-label="Find an experience"
          className="mt-8 grid max-w-4xl gap-3 rounded-[var(--radius-card)] bg-paper p-3 shadow-raised sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_0.9fr_0.8fr_auto] lg:items-end"
        >
          <div className="space-y-1">
            <Label htmlFor="h-q" className="px-1 text-xs text-stone">
              Where or what
            </Label>
            <Input id="h-q" name="q" type="search" placeholder="Lamu, birding, coffee farm…" maxLength={100} className="border-transparent bg-ivory" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="h-category" className="px-1 text-xs text-stone">
              Type
            </Label>
            <Select id="h-category" name="category" defaultValue="" className="border-transparent bg-ivory">
              <option value="">All types</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="h-date" className="px-1 text-xs text-stone">
              Date
            </Label>
            <Input id="h-date" name="date" type="date" className="border-transparent bg-ivory" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="h-max" className="px-1 text-xs text-stone">
              Budget (KES)
            </Label>
            <Input id="h-max" name="max" inputMode="numeric" placeholder="Up to" className="border-transparent bg-ivory" />
            <input type="hidden" name="currency" value="KES" />
          </div>
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-forest px-5 font-medium text-paper hover:bg-forest-deep sm:col-span-2 lg:col-span-1"
          >
            <Search className="size-4" aria-hidden /> Search
          </button>
        </form>
      </div>
    </section>
  );
}
