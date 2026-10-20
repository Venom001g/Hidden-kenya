import { createHmac, timingSafeEqual } from "node:crypto";
import {
  GatewayError,
  GatewayNotConfiguredError,
  type PaymentGateway,
  type RefundResult,
  type VerifiedTransaction,
  type WebhookEvent,
} from "./types";

/**
 * Paystack adapter (https://paystack.com/docs).
 *
 * Kenya: Paystack supports KES card and M-Pesa ("mobile_money" channel) collection for
 * merchants that complete Paystack's Kenyan onboarding (business registration, KRA PIN,
 * KYC). Amounts are sent in the currency subunit (KES cents). Webhooks are authenticated
 * with an HMAC-SHA512 of the raw body keyed by the secret key (x-paystack-signature).
 */

const PAYSTACK_API = "https://api.paystack.co";

/**
 * The API base can be redirected ONLY for automated tests: it requires
 * HK_ALLOW_TEST_GATEWAY=1 and a test-mode key (sk_test_…), so a live key can never be sent
 * anywhere except api.paystack.co.
 */
export function paystackApiBase(secretKey: string | undefined): string {
  const override = process.env.PAYSTACK_API_BASE_URL;
  if (override && process.env.HK_ALLOW_TEST_GATEWAY === "1" && secretKey?.startsWith("sk_test_")) return override.replace(/\/$/, "");
  return PAYSTACK_API;
}

type PaystackEnvelope<T> = { status: boolean; message: string; data: T };

export function computePaystackSignature(rawBody: string, secret: string): string {
  return createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");
}

export function verifyPaystackSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = Buffer.from(computePaystackSignature(rawBody, secret), "hex");
  const given = Buffer.from(signature, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Maps a Paystack transaction status to our outcome. Anything not final is pending. */
export function mapPaystackStatus(status: string | undefined): VerifiedTransaction["outcome"] {
  if (status === "success") return "succeeded";
  if (status === "failed" || status === "reversed") return "failed";
  return "pending";
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : typeof v === "number" ? String(v) : null);

/** Kenyan mobile number to the international digits format (2547XXXXXXXX / 2541XXXXXXXX). */
export function normaliseKenyanMsisdn(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  const m = /^(?:254|0)?([17]\d{8})$/.exec(digits);
  return m ? `254${m[1]}` : null;
}

export class PaystackGateway implements PaymentGateway {
  readonly id = "paystack" as const;
  readonly label = "Paystack (M-Pesa and cards)";

  constructor(
    private readonly secretKey: string | undefined,
    private readonly currencies: string[],
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  isConfigured() {
    return Boolean(this.secretKey && /^sk_(test|live)_/.test(this.secretKey));
  }

  isLive() {
    return Boolean(this.secretKey?.startsWith("sk_live_"));
  }

  supportedCurrencies() {
    return this.currencies;
  }

  private key(): string {
    if (!this.isConfigured()) throw new GatewayNotConfiguredError("Paystack");
    return this.secretKey!;
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${paystackApiBase(this.secretKey)}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key()}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      throw new GatewayError(`Paystack request failed: ${(error as Error).name}`);
    }
    let json: PaystackEnvelope<T> | null = null;
    try {
      json = (await res.json()) as PaystackEnvelope<T>;
    } catch {
      /* non-JSON body */
    }
    if (!res.ok || !json?.status) {
      throw new GatewayError(`Paystack ${method} ${path.split("?")[0]} -> ${res.status}: ${json?.message ?? "no body"}`);
    }
    return json.data;
  }

  async initialize(input: Parameters<PaymentGateway["initialize"]>[0]) {
    if (!this.currencies.includes(input.currency)) {
      throw new GatewayError(
        `Currency ${input.currency} not enabled`,
        `Payments in ${input.currency} are not available. No money has been taken.`,
      );
    }
    const data = await this.call<{ authorization_url: string; reference: string }>("POST", "/transaction/initialize", {
      email: input.email,
      amount: input.amountMinor,
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      channels: input.currency === "KES" ? ["mobile_money", "card"] : ["card"],
      metadata: input.metadata,
    });
    const allowedUrl = paystackApiBase(this.secretKey) === PAYSTACK_API ? /^https:\/\// : /^https?:\/\//;
    if (data.reference !== input.reference || !allowedUrl.test(data.authorization_url)) {
      throw new GatewayError("Unexpected initialize response");
    }
    return { redirectUrl: data.authorization_url };
  }

  async verify(reference: string): Promise<VerifiedTransaction> {
    const d = await this.call<Record<string, unknown>>("GET", `/transaction/verify/${encodeURIComponent(reference)}`);
    if (d.reference !== reference) throw new GatewayError("Reference mismatch on verify");
    const outcome = mapPaystackStatus(str(d.status) ?? undefined);
    return {
      reference,
      outcome,
      amountMinor: num(d.amount),
      currency: str(d.currency)?.toUpperCase() ?? null,
      gatewayTransactionId: str(d.id),
      channel: str(d.channel),
      feesMinor: num(d.fees),
      paidAt: str(d.paid_at) ?? str(d.paidAt),
      failureReason: outcome === "failed" ? (str(d.gateway_response) ?? "Payment failed") : null,
    };
  }

  verifyWebhookSignature(rawBody: string, headers: Headers): boolean {
    if (!this.isConfigured()) return false;
    return verifyPaystackSignature(rawBody, headers.get("x-paystack-signature"), this.secretKey!);
  }

  parseWebhook(rawBody: string): WebhookEvent {
    const body = JSON.parse(rawBody) as { event?: string; data?: Record<string, unknown> };
    const eventType = String(body.event ?? "unknown");
    const d = body.data ?? {};
    const kind: WebhookEvent["kind"] = eventType.startsWith("charge.")
      ? "charge"
      : eventType.startsWith("refund.")
        ? "refund"
        : eventType.startsWith("transfer.")
          ? "transfer"
          : "other";

    const transaction = (d.transaction ?? {}) as Record<string, unknown>;
    const reference =
      kind === "refund"
        ? (str(d.transaction_reference) ?? str(transaction.reference))
        : str(d.reference);
    const gatewayObjectId = kind === "transfer" ? str(d.transfer_code) : str(d.id);
    const status = str(d.status);

    // Keep only operational fields: never customer, authorization (card) or other personal data.
    const sanitized = {
      event: eventType,
      id: gatewayObjectId,
      reference,
      status,
      amount: num(d.amount),
      currency: str(d.currency),
      channel: str(d.channel),
      gateway_response: str(d.gateway_response),
      paid_at: str(d.paid_at),
    };

    return {
      dedupeKey: `paystack:${eventType}:${gatewayObjectId ?? reference ?? "none"}:${status ?? ""}`,
      kind,
      eventType,
      reference,
      gatewayObjectId,
      status,
      amountMinor: num(d.amount),
      currency: str(d.currency)?.toUpperCase() ?? null,
      sanitized,
    };
  }

  async refund(input: { transactionReference: string; amountMinor: number; currency: string; note: string }): Promise<RefundResult> {
    const d = await this.call<Record<string, unknown>>("POST", "/refund", {
      transaction: input.transactionReference,
      amount: input.amountMinor,
      currency: input.currency,
      merchant_note: input.note.slice(0, 200),
    });
    const s = str(d.status);
    return {
      gatewayRefundId: str(d.id),
      status: s === "processed" ? "processed" : s === "failed" ? "failed" : s === "processing" ? "processing" : "pending",
    };
  }

  async createMobileMoneyRecipient(input: { name: string; phone: string; currency: string }) {
    const msisdn = normaliseKenyanMsisdn(input.phone);
    if (!msisdn) throw new GatewayError("Invalid MSISDN", "Enter a valid Safaricom M-Pesa number, e.g. 0712 345 678.");
    const d = await this.call<{ recipient_code: string }>("POST", "/transferrecipient", {
      type: "mobile_money",
      bank_code: "MPESA",
      account_number: `0${msisdn.slice(3)}`,
      name: input.name.slice(0, 100),
      currency: input.currency,
    });
    return { recipientCode: d.recipient_code, label: `M-Pesa •••${msisdn.slice(-3)}` };
  }

  async transfer(input: { amountMinor: number; currency: string; recipientCode: string; reference: string; reason: string }) {
    const d = await this.call<{ status: string; transfer_code?: string }>("POST", "/transfer", {
      source: "balance",
      amount: input.amountMinor,
      currency: input.currency,
      recipient: input.recipientCode,
      reference: input.reference,
      reason: input.reason.slice(0, 100),
    });
    return { status: d.status, transferCode: d.transfer_code ?? null };
  }
}
