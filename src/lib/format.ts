/**
 * Money, time and text formatting.
 *
 * Money is always handled as integer minor units with an explicit currency.
 * Supported currencies and their minor-unit exponent:
 *   KES — Kenyan shilling, 2 decimal places (1 KES = 100 cents)
 *   USD — US dollar, 2 decimal places
 * Times are stored in UTC and shown in Africa/Nairobi (EAT, UTC+3, no daylight saving),
 * the local time at every experience on the platform.
 */

export const CURRENCIES = {
  KES: { exponent: 2, label: "Kenyan shilling" },
  USD: { exponent: 2, label: "US dollar" },
} as const;

export type Currency = keyof typeof CURRENCIES;
export const TIMEZONE = "Africa/Nairobi";

export function isCurrency(value: string): value is Currency {
  return value in CURRENCIES;
}

export function formatMoney(minor: number, currency: string, opts: { compact?: boolean } = {}): string {
  const exponent = isCurrency(currency) ? CURRENCIES[currency].exponent : 2;
  const major = minor / 10 ** exponent;
  const whole = Number.isInteger(major);
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: opts.compact || whole ? 0 : exponent,
    maximumFractionDigits: opts.compact ? 0 : exponent,
  })
    .format(major)
    .replace(/ /g, " ");
}

/** Parses a user-entered major-unit amount ("1,250.50") into minor units. Returns null if invalid. */
export function toMinorUnits(input: string | number, currency: string): number | null {
  const exponent = isCurrency(currency) ? CURRENCIES[currency].exponent : 2;
  const text = String(input).replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const minor = Number(whole) * 10 ** exponent + Number(frac.padEnd(exponent, "0").slice(0, exponent));
  return Number.isSafeInteger(minor) ? minor : null;
}

export function fromMinorUnits(minor: number, currency: string): string {
  const exponent = isCurrency(currency) ? CURRENCIES[currency].exponent : 2;
  const major = minor / 10 ** exponent;
  return Number.isInteger(major) ? String(major) : major.toFixed(exponent);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${m} min` : `${h} hour${h === 1 ? "" : "s"}`;
  }
  const days = Math.round((minutes / 1440) * 2) / 2;
  return `${days} day${days === 1 ? "" : "s"}`;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit" });
const shortDateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, day: "numeric", month: "short", year: "numeric" });

export const formatDate = (iso: string | Date) => dateFmt.format(new Date(iso));
export const formatShortDate = (iso: string | Date) => shortDateFmt.format(new Date(iso));
export const formatTime = (iso: string | Date) => timeFmt.format(new Date(iso));
export const formatDateTime = (iso: string | Date) => `${formatDate(iso)}, ${formatTime(iso)} EAT`;

/** YYYY-MM-DD in Nairobi for a given instant. */
export function nairobiDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function pluralize(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
