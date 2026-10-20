import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { noHorizontalOverflow } from "./helpers";

// These run against a database with no listings: the site must be honest about being empty.

test.describe("public site with an empty marketplace", () => {
  test("home page shows an honest empty state and no invented content", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Book experiences with Kenyan guides");
    await expect(page.getByText("The first experiences are being reviewed")).toBeVisible();
    await expect(page.getByText(/review/i).first()).toBeVisible();
    await expect(page.locator("text=★")).toHaveCount(0);
    await noHorizontalOverflow(page);
  });

  test("experience directory and destinations explain that nothing is listed yet", async ({ page }) => {
    await page.goto("/experiences");
    await expect(page.getByText("No experiences are bookable yet")).toBeVisible();
    await page.goto("/experiences?category=wildlife-safari&max=100");
    await expect(page.getByText("No experiences match these filters")).toBeVisible();
    await page.getByRole("link", { name: "Clear all filters" }).click();
    await expect(page).toHaveURL(/\/experiences$/);
    await page.goto("/destinations");
    await expect(page.getByText("Destination guides are being written")).toBeVisible();
    await noHorizontalOverflow(page);
  });

  test("legal pages are marked as drafts needing legal review", async ({ page }) => {
    await page.goto("/legal/privacy");
    await expect(page.getByText("Draft for legal review")).toBeVisible();
    await expect(page.getByText(/Data Protection Act, 2019/).first()).toBeVisible();
  });

  test("unknown pages show not-found and are excluded from search engines", async ({ page, request }) => {
    // Static routes return a real 404.
    expect((await request.get("/no-such-page")).status()).toBe(404);
    // Dynamic routes stream, so Next.js sends 200 with a noindex directive (documented behaviour).
    await page.goto("/experiences/does-not-exist");
    await expect(page.getByText("We could not find that page")).toBeVisible();
    await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
    await expect(page.getByRole("link", { name: "Browse experiences" })).toBeVisible();
  });

  test("protected areas redirect signed-out visitors to sign in", async ({ page }) => {
    for (const path of ["/account", "/provider", "/admin", "/checkout/00000000-0000-0000-0000-000000000000"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });

  test("security headers are set", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("webhook and cron endpoints reject unauthenticated calls", async ({ request }) => {
    const hook = await request.post("/api/webhooks/paystack", { data: { event: "charge.success", data: { reference: "HKP_x" } } });
    expect(hook.status()).toBe(401);
    const cron = await request.get("/api/cron/maintenance");
    expect(cron.status()).toBe(401);
    const cronOk = await request.get("/api/cron/maintenance", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(cronOk.status()).toBe(200);
  });

  test("skip link moves keyboard focus to the main content", async ({ page }) => {
    await page.goto("/how-it-works");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  for (const path of ["/", "/experiences", "/how-it-works", "/for-providers", "/login", "/signup", "/legal/terms", "/faq"]) {
    test(`no serious accessibility violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("load");
      await expect(page.locator("main h1")).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
      await noHorizontalOverflow(page);
    });
  }
});
