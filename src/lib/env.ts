import { z } from "zod";

/**
 * Environment configuration.
 *
 * Public values (NEXT_PUBLIC_*) are inlined into the browser bundle. Everything else is
 * read on the server only. Each integration validates its own variables when it is used,
 * so a missing email key disables email (with an admin warning) instead of crashing the
 * whole site, while missing core Supabase settings fail fast with an actionable message.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_MAPBOX_TOKEN: z
    .string()
    .regex(/^pk\./, "Mapbox public tokens start with pk.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cachedPublic: PublicEnv | null = null;

export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    // The legacy "anon" key works too; prefer the newer publishable key.
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Missing or invalid public configuration: ${fields}. Copy .env.example to .env.local and fill in the Supabase project URL and publishable key (Supabase dashboard → Project Settings → API).`,
    );
  }
  cachedPublic = parsed.data;
  return cachedPublic;
}

/** True when the core Supabase connection is configured. Used to render a setup screen instead of crashing. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

function required(name: string, value: string | undefined, hint: string): string {
  if (!value) {
    throw new ConfigurationError(`${name} is not set. ${hint}`);
  }
  return value;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

/** Server-only secret readers. Never import these from client components. */
export const serverEnv = {
  supabaseSecretKey: () =>
    required(
      "SUPABASE_SECRET_KEY",
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Add the Supabase secret (service role) key to the server environment. Never expose it to the browser.",
    ),
  cronSecret: () =>
    required("CRON_SECRET", process.env.CRON_SECRET, "Generate a random value (32+ characters) and set it in Vercel."),
  paymentProvider: () => (process.env.PAYMENT_PROVIDER || "paystack") as "paystack",
  paystackSecretKey: () => process.env.PAYSTACK_SECRET_KEY || undefined,
  paymentCurrencies: () =>
    (process.env.PAYMENT_SUPPORTED_CURRENCIES || "KES")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
  resendApiKey: () => process.env.RESEND_API_KEY || undefined,
  emailFrom: () => process.env.EMAIL_FROM_ADDRESS || undefined,
  emailReplyTo: () => process.env.EMAIL_REPLY_TO || undefined,
  hashSalt: () =>
    required(
      "HASH_SALT",
      process.env.HASH_SALT,
      "Generate a random value (32+ characters). It keys hashes used for rate limiting so raw IPs are never stored.",
    ),
};

/** Integration status for the admin configuration page (never exposes values). */
export function integrationStatus() {
  return {
    supabase: isSupabaseConfigured(),
    supabaseSecret: Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
    payments: Boolean(process.env.PAYSTACK_SECRET_KEY),
    paymentsLive: (process.env.PAYSTACK_SECRET_KEY || "").startsWith("sk_live_"),
    email: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM_ADDRESS),
    maps: Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN),
    cron: Boolean(process.env.CRON_SECRET),
    hashSalt: Boolean(process.env.HASH_SALT),
  };
}
