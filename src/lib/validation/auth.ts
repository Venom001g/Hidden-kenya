import { z } from "zod";

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address.").max(254));

export const password = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Use 128 characters or fewer.")
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9\W_]/.test(v), "Mix letters with numbers or symbols.");

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(128),
  next: z.string().optional(),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(120),
  email,
  password,
  acceptTerms: z.literal(true, { error: "Accept the terms and privacy policy to create an account." }),
  intent: z.enum(["guest", "host"]).default("guest"),
});

export const resetRequestSchema = z.object({ email });

export const newPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match." });

/** Only same-site relative paths are allowed as post-login destinations (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/account"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  try {
    const url = new URL(next, "http://localhost");
    if (url.host !== "localhost") return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
