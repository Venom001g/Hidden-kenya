// Prints `export KEY=value` lines for the Next.js app in the e2e stack (test-only values).
import { ANON_KEY, APP_URL, GATEWAY_URL, PAYSTACK_TEST_SECRET, PORTS, SERVICE_KEY } from "./keys.mjs";

const env = {
  HK_E2E: "1",
  NEXT_PUBLIC_SITE_URL: APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: GATEWAY_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ANON_KEY,
  SUPABASE_SECRET_KEY: SERVICE_KEY,
  HASH_SALT: "e2e-only-hash-salt-e2e-only-hash-salt",
  CRON_SECRET: "e2e-only-cron-secret-0123456789",
  PAYSTACK_SECRET_KEY: PAYSTACK_TEST_SECRET,
  PAYSTACK_API_BASE_URL: `http://localhost:${PORTS.paystack}`,
  HK_ALLOW_TEST_GATEWAY: "1",
  PAYMENT_SUPPORTED_CURRENCIES: "KES",
};
for (const [k, v] of Object.entries(env)) console.log(`export ${k}='${v}'`);
