/**
 * Transactional email templates. Every interpolated value is HTML-escaped.
 * Emails carry only what the recipient needs: no payment credentials, no full
 * contact details of other parties beyond what fulfilment requires.
 */

export type EmailContent = { subject: string; html: string; text: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Block = { heading: string; paragraphs: string[]; details?: [string, string][]; cta?: { label: string; url: string } };

function layout(block: Block, siteUrl: string): Omit<EmailContent, "subject"> {
  const p = block.paragraphs.map((t) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(t)}</p>`).join("");
  const details = block.details?.length
    ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin:8px 0 18px">${block.details
        .map(
          ([k, v]) =>
            `<tr><td style="padding:6px 0;color:#5b5a52;width:40%;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 0;color:#24231f">${escapeHtml(v)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const cta = block.cta
    ? `<p style="margin:22px 0"><a href="${escapeHtml(block.cta.url)}" style="background:#1d4a37;color:#fbf8f1;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">${escapeHtml(block.cta.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f3ede1;font-family:Helvetica,Arial,sans-serif;color:#24231f">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<p style="font-family:Georgia,serif;font-size:20px;color:#1d4a37;margin:0 0 20px">Hidden Kenya</p>
<div style="background:#fbf8f1;border-radius:12px;padding:26px 24px">
<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;margin:0 0 16px">${escapeHtml(block.heading)}</h1>
${p}${details}${cta}
</div>
<p style="font-size:12px;color:#5b5a52;margin:18px 4px;line-height:1.5">You are receiving this because of activity on your Hidden Kenya account. <a href="${escapeHtml(siteUrl)}/account/settings" style="color:#5b5a52">Manage email preferences</a>.</p>
</div></body></html>`;
  const text = [
    block.heading,
    "",
    ...block.paragraphs,
    "",
    ...(block.details ?? []).map(([k, v]) => `${k}: ${v}`),
    block.cta ? `\n${block.cta.label}: ${block.cta.url}` : "",
  ].join("\n");
  return { html, text };
}

type BookingSummary = {
  reference: string;
  experienceTitle: string;
  when: string;
  partySize: number;
  total: string;
  meetingPoint?: string;
};

const bookingDetails = (b: BookingSummary): [string, string][] => [
  ["Booking", b.reference],
  ["Experience", b.experienceTitle],
  ["Date and time", b.when],
  ["Guests", String(b.partySize)],
  ["Total", b.total],
  ...(b.meetingPoint ? ([["Meeting point", b.meetingPoint]] as [string, string][]) : []),
];

export const templates = {
  bookingConfirmedGuest: (s: string, b: BookingSummary & { url: string }): EmailContent => ({
    subject: `Booking confirmed: ${b.experienceTitle}`,
    ...layout(
      {
        heading: "Your booking is confirmed",
        paragraphs: ["Your payment was received and your place is reserved. Meeting instructions are on your booking page."],
        details: bookingDetails(b),
        cta: { label: "View booking", url: b.url },
      },
      s,
    ),
  }),
  bookingConfirmedProvider: (s: string, b: BookingSummary & { url: string }): EmailContent => ({
    subject: `New confirmed booking ${b.reference}`,
    ...layout(
      {
        heading: "You have a new confirmed booking",
        paragraphs: ["The guest has paid. Guest contact details are on the booking page."],
        details: bookingDetails(b),
        cta: { label: "Open booking", url: b.url },
      },
      s,
    ),
  }),
  bookingRequestProvider: (s: string, b: BookingSummary & { url: string; respondBy: string }): EmailContent => ({
    subject: `Booking request ${b.reference} needs your answer`,
    ...layout(
      {
        heading: "New booking request",
        paragraphs: [`Please accept or decline by ${b.respondBy}. The request expires automatically after that.`],
        details: bookingDetails(b),
        cta: { label: "Respond to request", url: b.url },
      },
      s,
    ),
  }),
  bookingRequestReceivedGuest: (s: string, b: BookingSummary & { url: string; respondBy: string }): EmailContent => ({
    subject: `Request sent: ${b.experienceTitle}`,
    ...layout(
      {
        heading: "Your request has been sent",
        paragraphs: [
          `The host will reply by ${b.respondBy}. You will not be charged unless they accept and you complete payment.`,
        ],
        details: bookingDetails(b),
        cta: { label: "View request", url: b.url },
      },
      s,
    ),
  }),
  bookingAcceptedGuest: (s: string, b: BookingSummary & { url: string; payBy: string }): EmailContent => ({
    subject: `Accepted: complete payment for ${b.experienceTitle}`,
    ...layout(
      {
        heading: "Your request was accepted",
        paragraphs: [`Complete payment by ${b.payBy} to confirm your place.`],
        details: bookingDetails(b),
        cta: { label: "Pay now", url: b.url },
      },
      s,
    ),
  }),
  bookingCancelled: (s: string, b: BookingSummary & { url: string; reason: string; refund: string | null }): EmailContent => ({
    subject: `Booking ${b.reference} cancelled`,
    ...layout(
      {
        heading: "Booking cancelled",
        paragraphs: [
          b.reason ? `Reason: ${b.reason}` : "This booking has been cancelled.",
          b.refund ? `A refund of ${b.refund} is being processed to your original payment method.` : "No payment is due back on this booking.",
        ],
        details: bookingDetails(b),
        cta: { label: "View booking", url: b.url },
      },
      s,
    ),
  }),
  refundProcessed: (s: string, b: { reference: string; amount: string; url: string }): EmailContent => ({
    subject: `Refund processed for ${b.reference}`,
    ...layout(
      {
        heading: "Your refund has been processed",
        paragraphs: [
          `${b.amount} has been returned to your original payment method. Card refunds can take several working days to appear; M-Pesa refunds are usually faster.`,
        ],
        cta: { label: "View booking", url: b.url },
      },
      s,
    ),
  }),
  bookingReminder: (s: string, b: BookingSummary & { url: string; instructions: string }): EmailContent => ({
    subject: `Reminder: ${b.experienceTitle} on ${b.when}`,
    ...layout(
      {
        heading: "Your experience is coming up",
        paragraphs: [b.instructions || "Meeting instructions are on your booking page."],
        details: bookingDetails(b),
        cta: { label: "View booking", url: b.url },
      },
      s,
    ),
  }),
  listingDecision: (s: string, b: { title: string; decision: string; notes: string; url: string }): EmailContent => ({
    subject: `Listing update: ${b.title}`,
    ...layout(
      {
        heading: `Your listing was ${b.decision}`,
        paragraphs: [b.notes ? `Notes from our team: ${b.notes}` : "No further action is needed."],
        cta: { label: "Open listing", url: b.url },
      },
      s,
    ),
  }),
  providerDecision: (s: string, b: { decision: string; notes: string; url: string }): EmailContent => ({
    subject: "Update on your provider verification",
    ...layout(
      {
        heading: `Verification: ${b.decision}`,
        paragraphs: [b.notes ? `Notes from our team: ${b.notes}` : "Your profile is now verified."],
        cta: { label: "Open provider dashboard", url: b.url },
      },
      s,
    ),
  }),
  supportReply: (s: string, b: { subject: string; url: string }): EmailContent => ({
    subject: `Reply to your request: ${b.subject}`,
    ...layout(
      {
        heading: "We replied to your support request",
        paragraphs: ["Read the reply and continue the conversation from your account."],
        cta: { label: "View reply", url: b.url },
      },
      s,
    ),
  }),
  newsletterConfirm: (s: string, b: { url: string }): EmailContent => ({
    subject: "Confirm your Hidden Kenya newsletter subscription",
    ...layout(
      {
        heading: "Confirm your subscription",
        paragraphs: [
          "Someone (hopefully you) asked to receive the Hidden Kenya newsletter at this address. Confirm to start receiving it. If this was not you, ignore this email and nothing will happen.",
        ],
        cta: { label: "Confirm subscription", url: b.url },
      },
      s,
    ),
  }),
};
