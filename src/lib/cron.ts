import "server-only";
import { serverEnv } from "@/lib/env";
import { safeEqual } from "@/lib/security";

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Anything else is rejected. */
export function isAuthorizedCron(request: Request): boolean {
  let secret: string;
  try {
    secret = serverEnv.cronSecret();
  } catch {
    return false;
  }
  if (secret.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  return safeEqual(header, `Bearer ${secret}`);
}
