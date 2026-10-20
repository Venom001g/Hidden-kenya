/**
 * Current time for server-rendered request logic (holds, review windows, upcoming lists).
 * Server Components render once per request, so reading the clock there is intentional;
 * routing it through one helper keeps that explicit and easy to fake in tests.
 */
export function requestNow(): number {
  return Date.now();
}

export function isFuture(iso: string | null | undefined, now = requestNow()): boolean {
  return Boolean(iso && Date.parse(iso) > now);
}
