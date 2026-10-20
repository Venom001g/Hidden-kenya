import { expect, type Page } from "@playwright/test";
import pg from "pg";

export const db = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL, max: 3 });
export const GATEWAY = "http://localhost:54321";

export async function latestMailLink(to: string, contains = "/verify"): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${GATEWAY}/__test/mail?to=${encodeURIComponent(to)}`);
    const mail = (await res.json()) as { links: string[] } | null;
    const link = mail?.links.find((l) => l.includes(contains));
    if (link) return link;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No email with a ${contains} link for ${to}`);
}

/** Signs up through the UI and confirms the email via the link Supabase Auth sent. */
export async function signUpAndConfirm(page: Page, opts: { name: string; email: string; password: string; host?: boolean }) {
  await page.goto(opts.host ? "/signup?intent=host" : "/signup");
  await page.getByLabel("Full name").fill(opts.name);
  await page.getByLabel("Email", { exact: true }).fill(opts.email);
  await page.getByLabel("Password", { exact: true }).fill(opts.password);
  await page.getByRole("main").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Confirm your email")).toBeVisible();
  const link = await latestMailLink(opts.email);
  await page.goto(link);
  await page.waitForURL(opts.host ? /\/provider\/onboarding/ : /\/account/);
}

export async function signIn(page: Page, email: string, password: string, next?: string) {
  await page.context().clearCookies();
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

export async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page should not scroll horizontally").toBeLessThanOrEqual(1);
}

/** A small, valid JPEG photo generated with sharp. */
export async function samplePhoto(): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 29, g: 74, b: 55 } } })
    .composite([{ input: Buffer.from('<svg width="1200" height="800"><circle cx="760" cy="400" r="180" fill="#E7B98F"/></svg>'), top: 0, left: 0 }])
    .jpeg()
    .toBuffer();
}

export const samplePdf = () =>
  Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
