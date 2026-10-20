import "server-only";
import { serverEnv } from "@/lib/env";
import { PaystackGateway } from "./paystack";
import type { PaymentGateway } from "./types";

export * from "./types";

let gateway: PaymentGateway | null = null;

/** The configured payment gateway (PAYMENT_PROVIDER, default "paystack"). */
export function getGateway(): PaymentGateway {
  if (gateway) return gateway;
  switch (serverEnv.paymentProvider()) {
    case "paystack":
    default:
      gateway = new PaystackGateway(serverEnv.paystackSecretKey(), serverEnv.paymentCurrencies());
  }
  return gateway;
}

/** Payment reference format: "HKP_" + 32 lowercase hex characters (enforced by the database). */
export const PAYMENT_REFERENCE = /^HKP_[a-f0-9]{32}$/;
/** Payout transfer reference: "HKT_" + payout id without dashes. */
export const payoutReference = (payoutId: string) => `HKT_${payoutId.replace(/-/g, "")}`;
