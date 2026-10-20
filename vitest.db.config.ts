import { defineConfig } from "vitest/config";

// Database integration tests: run serially against the local test database,
// which globalSetup recreates from the migrations before every run.
export default defineConfig({
  test: {
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["tests/db/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
