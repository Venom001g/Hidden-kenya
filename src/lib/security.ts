import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/** Keyed hash so identifiers (IPs, emails) are never stored in raw form. */
export function keyedHash(value: string): string {
  return createHmac("sha256", serverEnv.hashSalt()).update(value).digest("hex").slice(0, 40);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return (forwarded?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
}

export const LIMITS = {
  signIn: { limit: 10, windowSeconds: 600 },
  signUp: { limit: 5, windowSeconds: 3600 },
  passwordReset: { limit: 5, windowSeconds: 3600 },
  newsletter: { limit: 5, windowSeconds: 3600 },
  booking: { limit: 20, windowSeconds: 3600 },
  payment: { limit: 20, windowSeconds: 3600 },
  review: { limit: 10, windowSeconds: 86400 },
  report: { limit: 20, windowSeconds: 86400 },
  upload: { limit: 60, windowSeconds: 3600 },
  support: { limit: 20, windowSeconds: 3600 },
} as const;

/**
 * Fixed-window rate limit stored in Postgres (works across serverless instances).
 * Fails closed: if the limiter cannot be reached, the action is refused.
 */
export async function rateLimit(bucket: keyof typeof LIMITS, identifier: string): Promise<boolean> {
  const { limit, windowSeconds } = LIMITS[bucket];
  try {
    const { data, error } = await createAdminClient().rpc("check_rate_limit", {
      p_key: `${bucket}:${keyedHash(identifier)}`,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data === true;
  } catch (error) {
    console.error("[hidden-kenya] rate limiter unavailable:", (error as Error).message);
    return false;
  }
}

/** Limits by both client IP and (when known) the user id. */
export async function rateLimitRequest(bucket: keyof typeof LIMITS, userId?: string): Promise<boolean> {
  const ipOk = await rateLimit(bucket, `ip:${await clientIp()}`);
  if (!ipOk) return false;
  return userId ? rateLimit(bucket, `user:${userId}`) : true;
}

export const RATE_LIMITED = "Too many attempts. Please wait a few minutes and try again.";

/** Records a sensitive action performed by trusted server code. Metadata must not contain secrets. */
export async function auditEvent(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await createAdminClient().rpc("record_audit_event", {
    p_actor_id: actorId as string,
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId as string,
    p_metadata: metadata as never,
  });
  if (error) console.error("[hidden-kenya] audit write failed:", error.message);
}

/* ------------------------------------------------------------------------------------------
 * Upload validation: size, declared type and file signature ("magic bytes") must agree.
 * ---------------------------------------------------------------------------------------- */

export type AllowedUpload = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

const EXTENSIONS: Record<AllowedUpload, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function sniffType(bytes: Uint8Array): AllowedUpload | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

export async function validateUpload(
  file: File | null,
  allowed: AllowedUpload[],
  maxBytes: number,
): Promise<{ ok: true; type: AllowedUpload; ext: string; bytes: Uint8Array } | { ok: false; error: string }> {
  if (!file || typeof file === "string" || file.size === 0) return { ok: false, error: "Choose a file to upload." };
  if (file.size > maxBytes) return { ok: false, error: `Files must be ${Math.round(maxBytes / 1048576)} MB or smaller.` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffType(bytes);
  if (!sniffed || !allowed.includes(sniffed)) {
    return { ok: false, error: `Upload a ${allowed.map((t) => EXTENSIONS[t].toUpperCase()).join(", ")} file.` };
  }
  return { ok: true, type: sniffed, ext: EXTENSIONS[sniffed], bytes };
}

/** Image dimensions from the header bytes (JPEG, PNG, WebP). */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      const len = view.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  }
  if (bytes[0] === 0x52 && bytes[8] === 0x57) {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === "VP8X") return { width: 1 + (view.getUint32(24, true) & 0xffffff), height: 1 + (view.getUint32(27, true) & 0xffffff) };
    if (chunk === "VP8 ") return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (chunk === "VP8L") {
      const b = view.getUint32(21, true);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}
