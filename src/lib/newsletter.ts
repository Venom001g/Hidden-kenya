import "server-only";
import { keyedHash } from "@/lib/security";

export { NEWSLETTER_CONSENT_TEXT_CLIENT as NEWSLETTER_CONSENT_TEXT } from "@/components/newsletter-consent";

/** Stateless unsubscribe signature, so every mailing can carry a working unsubscribe link. */
export function unsubscribeSignature(subscriptionId: string) {
  return keyedHash(`newsletter-unsubscribe:${subscriptionId}`);
}

export function unsubscribeUrl(siteUrl: string, subscriptionId: string) {
  return `${siteUrl}/newsletter/unsubscribe?id=${subscriptionId}&sig=${unsubscribeSignature(subscriptionId)}`;
}
