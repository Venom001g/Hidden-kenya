import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computePaystackSignature,
  mapPaystackStatus,
  normaliseKenyanMsisdn,
  paystackApiBase,
  PaystackGateway,
  verifyPaystackSignature,
} from "@/lib/payments/paystack";
import { GatewayError, GatewayNotConfiguredError } from "@/lib/payments/types";

const SECRET = "sk_test_unitTestSecretNotReal";

const fakeFetch = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("webhook signatures", () => {
  const body = JSON.stringify({ event: "charge.success", data: { reference: "HKP_" + "a".repeat(32), amount: 500000 } });

  it("accepts a correct HMAC-SHA512 of the raw body", () => {
    expect(verifyPaystackSignature(body, computePaystackSignature(body, SECRET), SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = computePaystackSignature(body, SECRET);
    expect(verifyPaystackSignature(body.replace("500000", "1"), sig, SECRET)).toBe(false);
  });

  it("rejects a signature made with another key", () => {
    expect(verifyPaystackSignature(body, computePaystackSignature(body, "sk_test_other"), SECRET)).toBe(false);
  });

  it("rejects missing or malformed signatures", () => {
    expect(verifyPaystackSignature(body, null, SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, "abc", SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, "z".repeat(128), SECRET)).toBe(false);
  });

  it("is never valid when the gateway is not configured", () => {
    const g = new PaystackGateway(undefined, ["KES"]);
    const h = new Headers({ "x-paystack-signature": computePaystackSignature(body, SECRET) });
    expect(g.verifyWebhookSignature(body, h)).toBe(false);
  });
});

describe("status mapping", () => {
  it("only treats 'success' as paid", () => {
    expect(mapPaystackStatus("success")).toBe("succeeded");
    expect(mapPaystackStatus("failed")).toBe("failed");
    expect(mapPaystackStatus("reversed")).toBe("failed");
    for (const s of ["abandoned", "ongoing", "pending", "processing", "queued", undefined]) expect(mapPaystackStatus(s)).toBe("pending");
  });
});

describe("parseWebhook", () => {
  const g = new PaystackGateway(SECRET, ["KES"]);

  it("strips customer and card data and builds a stable dedupe key", () => {
    const raw = JSON.stringify({
      event: "charge.success",
      data: {
        id: 123,
        reference: "HKP_" + "b".repeat(32),
        status: "success",
        amount: 250000,
        currency: "KES",
        channel: "mobile_money",
        customer: { email: "guest@example.com", phone: "+254700000000" },
        authorization: { last4: "4081", bin: "408408", signature: "SIG" },
      },
    });
    const e = g.parseWebhook(raw);
    expect(e.kind).toBe("charge");
    expect(e.reference).toBe("HKP_" + "b".repeat(32));
    expect(e.dedupeKey).toBe("paystack:charge.success:123:success");
    const stored = JSON.stringify(e.sanitized);
    expect(stored).not.toContain("guest@example.com");
    expect(stored).not.toContain("4081");
    expect(stored).not.toContain("+254700000000");
    expect(g.parseWebhook(raw).dedupeKey).toBe(e.dedupeKey);
  });

  it("reads the transaction reference for refunds and transfer codes for transfers", () => {
    const refund = g.parseWebhook(JSON.stringify({ event: "refund.processed", data: { id: 9, transaction_reference: "HKP_x", status: "processed", amount: 100 } }));
    expect(refund).toMatchObject({ kind: "refund", reference: "HKP_x", gatewayObjectId: "9", status: "processed" });
    const transfer = g.parseWebhook(JSON.stringify({ event: "transfer.success", data: { reference: "HKT_abc", transfer_code: "TRF_1", status: "success" } }));
    expect(transfer).toMatchObject({ kind: "transfer", reference: "HKT_abc", gatewayObjectId: "TRF_1" });
  });
});

describe("API calls", () => {
  it("refuses to run without a secret key", async () => {
    const g = new PaystackGateway(undefined, ["KES"]);
    expect(g.isConfigured()).toBe(false);
    await expect(g.verify("HKP_x")).rejects.toBeInstanceOf(GatewayNotConfiguredError);
  });

  it("sends the server amount and enables M-Pesa for KES", async () => {
    const reference = "HKP_" + "c".repeat(32);
    const f = fakeFetch({ status: true, message: "ok", data: { authorization_url: "https://checkout.paystack.com/abc", reference } });
    const g = new PaystackGateway(SECRET, ["KES"], f as unknown as typeof fetch);
    const r = await g.initialize({ reference, amountMinor: 1234500, currency: "KES", email: "g@example.com", callbackUrl: "https://x/cb", metadata: {} });
    expect(r.redirectUrl).toBe("https://checkout.paystack.com/abc");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.paystack.co/transaction/initialize");
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({ amount: 1234500, currency: "KES", reference, channels: ["mobile_money", "card"] });
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
  });

  it("refuses currencies that are not enabled", async () => {
    const g = new PaystackGateway(SECRET, ["KES"], fakeFetch({}) as unknown as typeof fetch);
    await expect(g.initialize({ reference: "HKP_x", amountMinor: 100, currency: "USD", email: "a@b.co", callbackUrl: "https://x", metadata: {} })).rejects.toBeInstanceOf(GatewayError);
  });

  it("rejects an initialize response for a different reference", async () => {
    const f = fakeFetch({ status: true, message: "ok", data: { authorization_url: "https://checkout.paystack.com/x", reference: "OTHER" } });
    const g = new PaystackGateway(SECRET, ["KES"], f as unknown as typeof fetch);
    await expect(g.initialize({ reference: "HKP_mine", amountMinor: 100, currency: "KES", email: "a@b.co", callbackUrl: "https://x", metadata: {} })).rejects.toThrow("Unexpected");
  });

  it("returns verified amounts from the verify endpoint and rejects reference mismatches", async () => {
    const reference = "HKP_" + "d".repeat(32);
    const ok = new PaystackGateway(
      SECRET,
      ["KES"],
      fakeFetch({ status: true, message: "ok", data: { reference, status: "success", amount: 500000, currency: "kes", id: 77, channel: "card", fees: 7500, paid_at: "2026-10-19T10:00:00Z" } }) as unknown as typeof fetch,
    );
    expect(await ok.verify(reference)).toMatchObject({ outcome: "succeeded", amountMinor: 500000, currency: "KES", feesMinor: 7500, gatewayTransactionId: "77" });
    const bad = new PaystackGateway(SECRET, ["KES"], fakeFetch({ status: true, message: "ok", data: { reference: "HKP_other", status: "success" } }) as unknown as typeof fetch);
    await expect(bad.verify(reference)).rejects.toThrow("Reference mismatch");
  });

  it("turns HTTP errors into GatewayError without leaking the key", async () => {
    const g = new PaystackGateway(SECRET, ["KES"], fakeFetch({ status: false, message: "Invalid key" }, 401) as unknown as typeof fetch);
    const err = await g.verify("HKP_x").catch((e) => e);
    expect(err).toBeInstanceOf(GatewayError);
    expect(String(err.message)).not.toContain(SECRET);
  });
});

describe("M-Pesa numbers", () => {
  it.each([
    ["0712 345 678", "254712345678"],
    ["+254712345678", "254712345678"],
    ["254112345678", "254112345678"],
    ["0112345678", "254112345678"],
  ])("normalises %s", (input, out) => expect(normaliseKenyanMsisdn(input)).toBe(out));
  it.each(["12345", "0812345678", "+44 7700 900123", ""])("rejects %s", (input) => expect(normaliseKenyanMsisdn(input)).toBeNull());
});

describe("paystackApiBase (test-gateway override guard)", () => {
  const set = (vars: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) vi.stubEnv(k, "");
      else vi.stubEnv(k, v);
    }
  };
  afterEach(() => vi.unstubAllEnvs());

  it("uses api.paystack.co by default", () => {
    set({ PAYSTACK_API_BASE_URL: undefined, HK_ALLOW_TEST_GATEWAY: undefined });
    expect(paystackApiBase("sk_test_x")).toBe("https://api.paystack.co");
  });
  it("ignores the override without the explicit test flag", () => {
    set({ PAYSTACK_API_BASE_URL: "http://localhost:4010", HK_ALLOW_TEST_GATEWAY: undefined });
    expect(paystackApiBase("sk_test_x")).toBe("https://api.paystack.co");
  });
  it("never redirects a live key, even with the flag", () => {
    set({ PAYSTACK_API_BASE_URL: "http://localhost:4010", HK_ALLOW_TEST_GATEWAY: "1" });
    expect(paystackApiBase("sk_live_x")).toBe("https://api.paystack.co");
    expect(paystackApiBase(undefined)).toBe("https://api.paystack.co");
  });
  it("redirects only a test key with the flag set", () => {
    set({ PAYSTACK_API_BASE_URL: "http://localhost:4010/", HK_ALLOW_TEST_GATEWAY: "1" });
    expect(paystackApiBase("sk_test_x")).toBe("http://localhost:4010");
  });
});
