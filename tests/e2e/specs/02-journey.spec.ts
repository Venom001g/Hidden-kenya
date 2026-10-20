import { execFileSync } from "node:child_process";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { db, GATEWAY, latestMailLink, noHorizontalOverflow, samplePdf, samplePhoto, signIn, signUpAndConfirm } from "./helpers";

/**
 * The core marketplace journey, end to end, on the local stack:
 * admin bootstrap → commission → host onboarding and verification → listing with photo and
 * dates → moderation → public discovery → guest booking → payment (Paystack test double,
 * signed and duplicated webhooks) → host fulfilment view → isolation checks → cancellation
 * and refund → password reset.
 */
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const PASSWORD = "Str0ng-passphrase";
const admin = { name: "Amina Admin", email: `admin-${run}@example.test`, password: PASSWORD };
const host = { name: "Otieno Host", email: `host-${run}@example.test`, password: PASSWORD, host: true };
const guest = { name: "Grace Wanjiku", email: `guest-${run}@example.test`, password: PASSWORD };
const intruder = { name: "Ivan Other", email: `other-${run}@example.test`, password: PASSWORD };
const business = `Kakamega Forest Walks ${run}`;
const title = `Dawn birding walk in Kakamega Forest ${run}`;

let browser: Browser;
const contexts: Record<string, { ctx: BrowserContext; page: Page }> = {};
async function as(name: string) {
  if (!contexts[name]) {
    const ctx = await browser.newContext();
    contexts[name] = { ctx, page: await ctx.newPage() };
  }
  return contexts[name].page;
}
let bookingId = "";

test.beforeAll(async ({ browser: b }) => {
  browser = b;
});
test.afterAll(async () => {
  for (const c of Object.values(contexts)) await c.ctx.close();
  await db.end();
});

async function confirmDialog(page: Page, button: string, reason?: string) {
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  if (reason) await dialog.getByRole("textbox").fill(reason);
  await dialog.getByRole("button", { name: button, exact: true }).click();
  await expect(dialog).toBeHidden();
}

test("admin account is created and bootstrapped with the server-side script", async () => {
  const page = await as("admin");
  await signUpAndConfirm(page, admin);
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/); // not an admin yet

  const env = { ...process.env, SUPABASE_URL: GATEWAY, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY };
  const out = execFileSync("npx", ["tsx", "scripts/bootstrap-admin.ts", admin.email], { env }).toString();
  expect(out).toContain("Granted administrator role");
  expect(() => execFileSync("npx", ["tsx", "scripts/bootstrap-admin.ts", intruder.email], { env, stdio: "pipe" })).toThrow();

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Bookings are closed")).toBeVisible();
  await expect(page.getByText(/Resend email: booking emails are recorded but not sent/)).toBeVisible();
});

test("admin sets the default commission", async () => {
  const page = await as("admin");
  await page.goto("/admin/settings");
  await page.locator("#percent").fill("12");
  await page.getByRole("button", { name: "Set rate" }).click();
  await expect(page.getByText("Commission set to 12% for new bookings.")).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByText("Bookings are closed")).toHaveCount(0);
});

test("host signs up, completes the profile, uploads a document and submits", async () => {
  const page = await as("host");
  await signUpAndConfirm(page, host);
  await page.getByLabel("Business or trading name").fill(business);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/provider\/profile/);

  await page.getByLabel("About your business").fill(
    "We are a family of local guides who have walked Kakamega Forest for twenty years, specialising in birds and primates of the forest.",
  );
  await page.getByLabel("Where you operate").fill("Kakamega Forest, Kakamega County");
  await page.getByLabel("Legal name").fill(`${business} Ltd`);
  await page.getByLabel("Booking contact phone").fill("+254 700 111 222");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();

  await page.getByLabel("Wildlife & safari").check();
  await page.getByRole("button", { name: "Save categories" }).click();
  await expect(page.getByText("Service categories saved.")).toBeVisible();

  await page.getByLabel("Document type").selectOption("tourism_licence");
  await page.getByLabel("File").setInputFiles({ name: "licence.pdf", mimeType: "application/pdf", buffer: samplePdf() });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("Document uploaded. Only our review team can see it.")).toBeVisible();

  // A disguised file is rejected by content sniffing.
  await page.getByLabel("Document type").selectOption("other");
  await page.getByLabel("File").setInputFiles({ name: "evil.pdf", mimeType: "application/pdf", buffer: Buffer.from("<script>alert(1)</script>") });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("Upload a PDF, JPG, PNG, WEBP file.")).toBeVisible();

  await page.getByRole("button", { name: "Submit for verification" }).click();
  await expect(page.getByText(/We will email you when the review is done/)).toBeVisible();
  await expect(page.getByText("In review").first()).toBeVisible();
});

test("admin reviews the document and verifies the host", async () => {
  const page = await as("admin");
  await page.goto("/admin/providers?status=pending_review");
  await page.getByRole("link", { name: business }).click();
  await page.getByRole("button", { name: "Open" }).first().waitFor();
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Document accepted.")).toBeVisible();
  await page.getByRole("button", { name: "Verify host" }).click();
  await confirmDialog(page, "Verify");
  await expect(page.getByText("Provider verified.")).toBeVisible();
});

test("host creates a listing with a photo and dates, and submits it", async () => {
  const page = await as("host");
  await page.goto("/provider/listings/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Summary", { exact: true }).fill("A guided dawn walk through Kenya's last tropical rainforest, looking for turacos and colobus monkeys.");
  await page.getByLabel("Full description", { exact: true }).fill(
    "We meet at the forest station before sunrise and walk the main trail slowly, stopping to look and listen.\n\nYour guide carries binoculars and a field guide, and knows the calls of the forest's birds. We return by mid-morning.",
  );
  await page.getByLabel("Type", { exact: true }).selectOption({ label: "Wildlife & safari" });
  await page.getByLabel("County", { exact: true }).selectOption({ label: "Kakamega" });
  await page.getByLabel("Price", { exact: true }).fill("3500");
  await page.getByLabel("Included", { exact: true }).fill("Guide\nBinoculars\nForest entry fee");
  await page.getByLabel("Name of the place", { exact: true }).fill("Isecheno Forest Station");
  await page.getByLabel("How to find you", { exact: true }).fill("Meet at the forest station gate. Look for the guide in a green Hidden Kenya cap.");
  await page.getByRole("button", { name: "Save draft and add photos" }).click();
  await page.waitForURL(/\/photos$/);

  await page.getByLabel("Photo", { exact: true }).setInputFiles({ name: "forest.jpg", mimeType: "image/jpeg", buffer: await samplePhoto() });
  await page.getByLabel("Description of the photo", { exact: true }).fill("Morning light on the forest canopy at Isecheno");
  await page.getByLabel(/I took this photo/).check();
  await page.getByRole("button", { name: "Upload photo" }).click();
  await expect(page.getByText("Photo added.")).toBeVisible();
  await expect(page.getByAltText("Morning light on the forest canopy at Isecheno")).toBeVisible();

  await page.getByRole("link", { name: "Dates and capacity" }).click();
  for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) await page.getByLabel(d, { exact: true }).check();
  await page.locator("#w-start").fill("06:30");
  await page.locator("#w-cap").fill("6");
  await page.getByRole("button", { name: "Add schedule" }).click();
  await expect(page.getByText("Schedule added.")).toBeVisible();
  await expect(page.getByText(/6\/6 left/).first()).toBeVisible();

  await page.getByRole("link", { name: "Details" }).click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Submitted for review. We will email you with the outcome.")).toBeVisible();
});

test("admin approves the listing", async () => {
  const page = await as("admin");
  await page.goto("/admin/listings?status=pending_review");
  await page.getByRole("link", { name: title }).click();
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await confirmDialog(page, "Publish");
  await expect(page.getByText("Listing approved.")).toBeVisible();
});

test("the listing appears in public discovery with honest verification labels", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: title }).first()).toBeVisible();
  await page.goto("/experiences?category=wildlife-safari&county=37");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await page.goto("/experiences?category=beaches-coast");
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
  await page.goto(`/experiences?q=${encodeURIComponent("turacos colobus")}`);
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText("Tourism licence document checked").first()).toBeVisible();
  await expect(page.getByText("Profile written by the host.")).toBeVisible();
  await expect(page.getByText("No reviews yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in to book" })).toBeVisible();

  // Real content at phone width: nothing may widen the page (e.g. the date picker row).
  for (const path of [page.url(), "/", "/experiences"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await noHorizontalOverflow(page);
  }
  await page.setViewportSize({ width: 1280, height: 860 });
});

test("guest books, pays through the gateway and is confirmed by verified webhooks", async () => {
  const page = await as("guest");
  await signUpAndConfirm(page, guest);
  await page.goto("/experiences");
  await page.getByRole("link", { name: title }).click();
  await page.getByRole("radiogroup", { name: "Available dates" }).getByRole("radio").nth(7).click();
  await page.getByRole("button", { name: "More guests" }).click();
  await page.getByLabel("Phone").fill("+254 712 345 678");
  await expect(page.getByText("KES 7,000").first()).toBeVisible();
  await page.getByRole("button", { name: "Reserve and pay" }).click();
  await page.waitForURL(/\/checkout\/[0-9a-f-]{36}$/);
  bookingId = page.url().split("/").pop()!;

  await page.getByRole("button", { name: "Pay KES 7,000" }).click();
  await page.waitForURL(/localhost:4010\/checkout\//);
  await expect(page.locator("#amount")).toHaveText("700000"); // amount sent by the server, in cents
  await page.getByRole("button", { name: "Pay with test M-Pesa" }).click();
  await page.waitForURL(/\/return/);
  await expect(page.getByText("Payment received. You are booked.")).toBeVisible();

  const { rows: b } = await db.query("select status, total_minor, commission_rate_bps from public.bookings where id = $1", [bookingId]);
  expect(b[0]).toMatchObject({ status: "confirmed", total_minor: "700000", commission_rate_bps: 1200 });
  const { rows: pays } = await db.query("select status, fees_minor, channel from public.payments where booking_id = $1", [bookingId]);
  expect(pays).toHaveLength(1);
  expect(pays[0]).toMatchObject({ status: "succeeded", channel: "mobile_money" });
  // The webhook was delivered twice; it was recorded and applied once.
  const { rows: events } = await db.query(
    "select count(*)::int n from public.payment_events e join public.payments p on p.reference = e.reference where p.booking_id = $1",
    [bookingId],
  );
  expect(events[0].n).toBe(1);
  // Emails are not configured in this stack: they are recorded honestly as not sent.
  const { rows: notes } = await db.query("select status from public.notifications where data->>'booking_id' = $1 and channel = 'email'", [bookingId]);
  expect(notes.length).toBeGreaterThan(0);
  expect(notes.every((n) => n.status === "skipped_unconfigured")).toBe(true);

  await page.getByRole("link", { name: "View your booking" }).click();
  await expect(page.getByText("Confirmed").first()).toBeVisible();
  await expect(page.getByText("Look for the guide in a green Hidden Kenya cap.")).toBeVisible();
  await expect(page.getByRole("link", { name: "+254 700 111 222" })).toBeVisible();
});

test("the host sees the booking with the guest's contact details", async () => {
  const page = await as("host");
  await page.goto("/provider/bookings");
  await page.getByRole("link", { name: /^HK-/ }).first().click();
  await expect(page.getByText(guest.name).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "+254 712 345 678" })).toBeVisible();
  await expect(page.getByText("12% (fixed when booked)")).toBeVisible();
});

test("other accounts cannot see or act on the booking", async () => {
  const page = await as("intruder");
  await signUpAndConfirm(page, intruder);
  await page.goto(`/account/bookings/${bookingId}`);
  await expect(page.getByText("We could not find that page")).toBeVisible();
  await page.goto(`/checkout/${bookingId}`);
  await expect(page.getByText("We could not find that page")).toBeVisible();
  await page.goto(`/provider/bookings/${bookingId}`);
  await expect(page).toHaveURL(/\/provider\/onboarding/);
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/);

  // Direct API attempts with the intruder's own access token: RLS and privileges hold.
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const tokenRes = await fetch(`${GATEWAY}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey, "content-type": "application/json" },
    body: JSON.stringify({ email: intruder.email, password: intruder.password }),
  });
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const headers = { apikey, authorization: `Bearer ${access_token}`, "content-type": "application/json" };
  const read = await fetch(`${GATEWAY}/rest/v1/bookings?id=eq.${bookingId}&select=id,contact_phone`, { headers });
  expect(await read.json()).toEqual([]);
  const tamper = await fetch(`${GATEWAY}/rest/v1/bookings?id=eq.${bookingId}`, { method: "PATCH", headers, body: JSON.stringify({ status: "cancelled" }) });
  expect(tamper.status).toBeGreaterThanOrEqual(400);
  const escalate = await fetch(`${GATEWAY}/rest/v1/user_roles`, { method: "POST", headers, body: JSON.stringify({ user_id: "00000000-0000-0000-0000-000000000000", role: "admin" }) });
  expect(escalate.status).toBeGreaterThanOrEqual(400);
  const pay = await fetch(`${GATEWAY}/rest/v1/rpc/apply_payment_result`, { method: "POST", headers, body: JSON.stringify({ p_reference: "HKP_x", p_outcome: "succeeded", p_amount_minor: 1, p_currency: "KES" }) });
  expect(pay.status).toBeGreaterThanOrEqual(400);
  const cancel = await fetch(`${GATEWAY}/rest/v1/rpc/cancel_booking`, { method: "POST", headers, body: JSON.stringify({ p_booking_id: bookingId, p_reason: "x" }) });
  expect(await cancel.text()).toContain("HK_NOT_FOUND");
});

test("guest cancels within the free window and is refunded through the gateway", async () => {
  const page = await as("guest");
  await page.goto(`/account/bookings/${bookingId}`);
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("You will be refunded KES 7,000 (100%)");
  await confirmDialog(page, "Cancel booking");
  await expect(page.getByText(/Booking cancelled\. Your refund is being processed\./)).toBeVisible();

  await expect
    .poll(async () => (await db.query("select status from public.bookings where id = $1", [bookingId])).rows[0].status, { timeout: 15_000 })
    .toBe("refunded");
  await page.reload();
  await expect(page.getByText("Refunded").first()).toBeVisible();

  // The seats were released.
  const { rows } = await db.query(
    "select count(*)::int n from public.bookings where id = $1 and status in ('confirmed','pending_payment')",
    [bookingId],
  );
  expect(rows[0].n).toBe(0);
});

test("admin sees the payment, refund and webhook log", async () => {
  const page = await as("admin");
  await page.goto("/admin/payments");
  await expect(page.getByText("Paid").first()).toBeVisible();
  await page.getByRole("link", { name: "Refunds", exact: true }).click();
  await expect(page.getByText("Refunded").first()).toBeVisible();
  await page.getByRole("link", { name: "Webhook log", exact: true }).click();
  await expect(page.getByText("charge.success").first()).toBeVisible();
  await expect(page.getByText("refund.processed").first()).toBeVisible();
  await page.goto("/admin/audit?action=provider.");
  await expect(page.getByText("provider.verify").first()).toBeVisible();
});

test("guest resets their password with the emailed link", async () => {
  const page = await as("guest");
  await page.context().clearCookies();
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(guest.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If an account uses that address/)).toBeVisible();
  const link = await latestMailLink(guest.email, "type=recovery");
  await page.goto(link);
  await page.waitForURL(/\/reset-password/);
  await page.getByLabel("New password", { exact: true }).fill("An0ther-passphrase");
  await page.getByLabel("Repeat new password", { exact: true }).fill("An0ther-passphrase");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText(/Your password has been updated/)).toBeVisible();

  await signIn(page, guest.email, "An0ther-passphrase", "/account/bookings");
  await expect(page).toHaveURL(/\/account\/bookings/);
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(guest.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That email and password do not match an account.")).toBeVisible();
});
