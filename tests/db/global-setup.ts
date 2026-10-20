import { execFileSync } from "node:child_process";
import path from "node:path";

export default function setup() {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error("Set TEST_DATABASE_URL to a local PostgreSQL database (see docs/testing.md).");
  }
  execFileSync(path.resolve(__dirname, "../../scripts/db-test-reset.sh"), { stdio: "inherit", env: process.env });
}
