import { handlePaymentWebhook } from "@/lib/payments/service";

/**
 * Paystack webhook endpoint. Configure in Paystack Dashboard → Settings → API Keys & Webhooks:
 *   https://<your-domain>/api/webhooks/paystack
 * The raw body is read as text so the HMAC-SHA512 signature can be checked byte-for-byte.
 */
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 1_000_000) return new Response("Payload too large", { status: 413 });
  const raw = await request.text();
  const { status, outcome } = await handlePaymentWebhook(raw, request.headers);
  return Response.json({ outcome }, { status, headers: { "Cache-Control": "no-store" } });
}
