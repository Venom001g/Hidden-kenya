import { defineConfig, devices } from "@playwright/test";

// Run through tests/e2e/run.sh, which starts the local stack and the production build.
const chromium = process.env.CHROMIUM_PATH;

export default defineConfig({
  testDir: "tests/e2e/specs",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: chromium
      ? { executablePath: chromium, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] }
      : undefined,
  },
  // Mobile runs the empty-marketplace checks first; desktop then runs them again followed by
  // the full journey, which creates data.
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" }, testMatch: /01-public\.spec\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } }, dependencies: ["mobile"] },
  ],
});
