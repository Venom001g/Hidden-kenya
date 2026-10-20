// TEST-ONLY credentials for the local end-to-end stack. Never used outside it.
import { createHmac } from "node:crypto";

export const JWT_SECRET = "e2e-only-jwt-secret-e2e-only-jwt-secret-0001";
export const PAYSTACK_TEST_SECRET = "sk_test_e2eOnlyNotARealKey";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export function signJwt(payload, secret = JWT_SECRET) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

// Long-lived API keys, same shape as Supabase's legacy anon / service_role keys.
const iat = 1760000000;
export const ANON_KEY = signJwt({ iss: "supabase", role: "anon", iat, exp: iat + 10 * 365 * 86400 });
export const SERVICE_KEY = signJwt({ iss: "supabase", role: "service_role", iat, exp: iat + 10 * 365 * 86400 });

export const PORTS = { gateway: 54321, auth: 9999, rest: 3001, smtp: 2525, paystack: 4010, app: 3100 };
export const GATEWAY_URL = `http://localhost:${PORTS.gateway}`;
export const APP_URL = `http://localhost:${PORTS.app}`;
