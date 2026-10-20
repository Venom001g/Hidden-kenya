/**
 * Turns database and integration errors into messages that are safe to show users.
 * Database functions raise "HK_<CODE>: message"; anything else becomes a generic message
 * (the detail is logged server-side, never shown).
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const FRIENDLY: Record<string, string> = {
  HK_AUTH_REQUIRED: "Sign in to continue.",
  HK_FORBIDDEN: "You do not have access to do that.",
  HK_NOT_FOUND: "We could not find that record.",
  HK_SOLD_OUT: "", // keep the database message: it includes places left
  HK_BOOKINGS_NOT_OPEN: "Bookings are not open yet. Please check back soon.",
};

export function errorCode(message: string | undefined | null): string | null {
  const m = /\b(HK_[A-Z_]+)\b/.exec(message ?? "");
  return m ? m[1] : null;
}

export function friendlyError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "";
  const code = errorCode(message);
  if (!code) {
    if (message && typeof window === "undefined") {
      // Server log without user data; message is a database/system error string.
      console.error("[hidden-kenya] unexpected error:", message.slice(0, 500));
    }
    return fallback;
  }
  const mapped = FRIENDLY[code];
  if (mapped) return mapped;
  // Messages after the code are written for end users in the database functions.
  return message.replace(/^.*?HK_[A-Z_]+:\s*/, "").trim() || fallback;
}

export function fail(error: unknown, fallback?: string): { ok: false; error: string } {
  return { ok: false, error: friendlyError(error, fallback) };
}
