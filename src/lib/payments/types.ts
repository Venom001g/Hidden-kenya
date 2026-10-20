/**
 * Payment gateway adapter contract. The booking engine depends only on this interface;
 * a different gateway can be added by implementing it and registering it in ./index.ts.
 *
 * Rules every adapter must follow:
 *  - Amounts are integer minor units in the booking currency.
 *  - A redirect back from the gateway proves nothing; payment state is only established
 *    by verify() (server-to-server) after an authenticated webhook or explicit check.
 *  - Secrets never leave the server; no card data is ever handled or stored.
 */

export type GatewayId = "paystack";

export type VerifiedTransaction = {
  reference: string;
  outcome: "succeeded" | "failed" | "pending";
  amountMinor: number | null;
  currency: string | null;
  gatewayTransactionId: string | null;
  channel: string | null;
  feesMinor: number | null;
  paidAt: string | null;
  failureReason: string | null;
};

export type WebhookEvent = {
  /** Stable identifier used to drop duplicate deliveries. */
  dedupeKey: string;
  kind: "charge" | "refund" | "transfer" | "other";
  eventType: string;
  /** Our reference: payment reference (charge), transaction reference (refund), payout reference (transfer). */
  reference: string | null;
  gatewayObjectId: string | null;
  status: string | null;
  amountMinor: number | null;
  currency: string | null;
  /** Payload with personal and card data removed, safe to store. */
  sanitized: Record<string, unknown>;
};

export type RefundResult = {
  gatewayRefundId: string | null;
  status: "pending" | "processing" | "processed" | "failed";
};

export interface PaymentGateway {
  readonly id: GatewayId;
  readonly label: string;
  isConfigured(): boolean;
  isLive(): boolean;
  supportedCurrencies(): string[];
  initialize(input: {
    reference: string;
    amountMinor: number;
    currency: string;
    email: string;
    callbackUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ redirectUrl: string }>;
  verify(reference: string): Promise<VerifiedTransaction>;
  verifyWebhookSignature(rawBody: string, headers: Headers): boolean;
  parseWebhook(rawBody: string): WebhookEvent;
  refund(input: { transactionReference: string; amountMinor: number; currency: string; note: string }): Promise<RefundResult>;
  createMobileMoneyRecipient(input: { name: string; phone: string; currency: string }): Promise<{ recipientCode: string; label: string }>;
  transfer(input: {
    amountMinor: number;
    currency: string;
    recipientCode: string;
    reference: string;
    reason: string;
  }): Promise<{ status: string; transferCode: string | null }>;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly userMessage = "The payment service could not complete the request. Please try again.",
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export class GatewayNotConfiguredError extends GatewayError {
  constructor(gateway: string) {
    super(`${gateway} is not configured`, "Online payment is not available yet. No money has been taken.");
    this.name = "GatewayNotConfiguredError";
  }
}
