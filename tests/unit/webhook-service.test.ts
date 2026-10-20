import { beforeEach, describe, expect, it, vi } from "vitest";
import { computePaystackSignature, PaystackGateway } from "@/lib/payments/paystack";

/**
 * handlePaymentWebhook with a fake database client and a fake Paystack API.
 * Verifies the security properties of the webhook path:
 *  - bad signatures never reach the database
 *  - duplicates are acknowledged without reprocessing
 *  - payment state comes from the verify API, never from the webhook payload
 */

const SECRET = "sk_test_webhookUnitTest";
const REF = "HKP_" + "e".repeat(32);

const rpc = vi.fn();
const fromChain = () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "limit", "order", "update", "maybeSingle", "single"]) chain[m] = vi.fn(() => chain);
  (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { booking_id: "b1" } });
  (chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });
  return chain;
};

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc, from: vi.fn(fromChain) }) }));
vi.mock("@/lib/notifications", () => ({ notifyBooking: vi.fn() }));

let verifyBody: Record<string, unknown>;
vi.mock("@/lib/payments/index", async () => {
  const types = await vi.importActual<typeof import("@/lib/payments/types")>("@/lib/payments/types");
  return {
    ...types,
    PAYMENT_REFERENCE: /^HKP_[a-f0-9]{32}$/,
    getGateway: () =>
      new PaystackGateway(SECRET, ["KES"], (async () =>
        new Response(JSON.stringify({ status: true, message: "ok", data: verifyBody }), { status: 200 })) as unknown as typeof fetch),
  };
});

const { handlePaymentWebhook } = await import("@/lib/payments/service");

const signed = (payload: unknown) => {
  const raw = JSON.stringify(payload);
  return { raw, headers: new Headers({ "x-paystack-signature": computePaystackSignature(raw, SECRET) }) };
};

beforeEach(() => {
  rpc.mockReset();
  verifyBody = { reference: REF, status: "success", amount: 500000, currency: "KES", id: 1, channel: "mobile_money", fees: 100 };
});

describe("handlePaymentWebhook", () => {
  it("returns 401 for a bad signature and never touches the database", async () => {
    const r = await handlePaymentWebhook(JSON.stringify({ event: "charge.success", data: { reference: REF } }), new Headers({ "x-paystack-signature": "0".repeat(128) }));
    expect(r.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("acknowledges duplicates without processing them again", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null }); // record_payment_event → already processed
    const { raw, headers } = signed({ event: "charge.success", data: { id: 1, reference: REF, status: "success", amount: 500000 } });
    const r = await handlePaymentWebhook(raw, headers);
    expect(r).toEqual({ status: 200, outcome: "duplicate" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("applies the amount from the verify API, not from the webhook payload", async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "record_payment_event") return { data: true, error: null };
      if (fn === "apply_payment_result") return { data: "amount_mismatch", error: null };
      return { data: null, error: null };
    });
    verifyBody = { ...verifyBody, amount: 100 }; // what Paystack actually received
    // An attacker-controlled payload claiming the full amount (even if it were somehow signed):
    const { raw, headers } = signed({ event: "charge.success", data: { id: 2, reference: REF, status: "success", amount: 500000, currency: "KES" } });
    const r = await handlePaymentWebhook(raw, headers);
    expect(r.status).toBe(200);
    const apply = rpc.mock.calls.find((c) => c[0] === "apply_payment_result");
    expect(apply?.[1]).toMatchObject({ p_reference: REF, p_outcome: "succeeded", p_amount_minor: 100, p_currency: "KES" });
    expect(rpc.mock.calls.find((c) => c[0] === "finish_payment_event")?.[1]).toMatchObject({ p_outcome: "amount_mismatch" });
  });

  it("returns 500 so the gateway retries when processing fails", async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "record_payment_event") return { data: true, error: null };
      if (fn === "apply_payment_result") return { data: null, error: { message: "db down" } };
      return { data: null, error: null };
    });
    const { raw, headers } = signed({ event: "charge.success", data: { id: 3, reference: REF, status: "success" } });
    const r = await handlePaymentWebhook(raw, headers);
    expect(r.status).toBe(500);
    expect(rpc.mock.calls.find((c) => c[0] === "finish_payment_event")?.[1]).toMatchObject({ p_outcome: "error" });
  });

  it("rejects malformed JSON after the signature check", async () => {
    const raw = "{not json";
    const r = await handlePaymentWebhook(raw, new Headers({ "x-paystack-signature": computePaystackSignature(raw, SECRET) }));
    expect(r.status).toBe(400);
  });
});
