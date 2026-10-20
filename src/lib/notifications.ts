import "server-only";
import { sendEmail, siteUrl, templates } from "@/lib/email";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export type BookingEvent = "requested" | "accepted" | "confirmed" | "cancelled" | "refunded" | "reminder";

async function loadBooking(bookingId: string) {
  const db = createAdminClient();
  const { data: b } = await db
    .from("bookings")
    .select(
      "id, reference, customer_id, contact_email, starts_at, party_size, total_minor, currency, refund_minor, status, hold_expires_at, cancellation_reason, provider_id, experiences(title, meeting_point_name, meeting_point_instructions)",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!b || !b.experiences) return null;
  const { data: provider } = await db
    .from("provider_private_details")
    .select("contact_email")
    .eq("provider_id", b.provider_id)
    .maybeSingle();
  return { b, exp: b.experiences, providerEmail: provider?.contact_email || null };
}

/** Sends the emails for a booking event. Safe to call repeatedly (deduplicated). Never throws. */
export async function notifyBooking(bookingId: string, event: BookingEvent): Promise<void> {
  try {
    const loaded = await loadBooking(bookingId);
    if (!loaded) return;
    const { b, exp, providerEmail } = loaded;
    const s = siteUrl();
    const summary = {
      reference: b.reference,
      experienceTitle: exp.title,
      when: formatDateTime(b.starts_at),
      partySize: b.party_size,
      total: formatMoney(b.total_minor, b.currency),
      meetingPoint: exp.meeting_point_name || undefined,
    };
    const guestUrl = `${s}/account/bookings/${b.id}`;
    const providerUrl = `${s}/provider/bookings/${b.id}`;
    const guest = (template: string, content: ReturnType<(typeof templates)[keyof typeof templates]>) =>
      sendEmail({
        to: b.contact_email,
        userId: b.customer_id,
        template,
        content,
        dedupeKey: `booking:${b.id}:${template}`,
        data: { booking_id: b.id, reference: b.reference, href: `/account/bookings/${b.id}` },
        inApp: true,
      });
    const host = (template: string, content: ReturnType<(typeof templates)[keyof typeof templates]>) =>
      providerEmail
        ? sendEmail({
            to: providerEmail,
            template,
            content,
            dedupeKey: `booking:${b.id}:${template}`,
            data: { booking_id: b.id, reference: b.reference },
          })
        : Promise.resolve("skipped_unconfigured" as const);

    switch (event) {
      case "requested": {
        const respondBy = b.hold_expires_at ? formatDateTime(b.hold_expires_at) : "soon";
        await host("booking_request_provider", templates.bookingRequestProvider(s, { ...summary, url: providerUrl, respondBy }));
        await guest("booking_request_guest", templates.bookingRequestReceivedGuest(s, { ...summary, url: guestUrl, respondBy }));
        break;
      }
      case "accepted":
        await guest(
          "booking_accepted_guest",
          templates.bookingAcceptedGuest(s, {
            ...summary,
            url: `${s}/checkout/${b.id}`,
            payBy: b.hold_expires_at ? formatDateTime(b.hold_expires_at) : "soon",
          }),
        );
        break;
      case "confirmed":
        await guest("booking_confirmed_guest", templates.bookingConfirmedGuest(s, { ...summary, url: guestUrl }));
        await host("booking_confirmed_provider", templates.bookingConfirmedProvider(s, { ...summary, url: providerUrl }));
        break;
      case "cancelled": {
        const refund = b.refund_minor > 0 ? formatMoney(b.refund_minor, b.currency) : null;
        const content = (url: string) => templates.bookingCancelled(s, { ...summary, url, reason: b.cancellation_reason, refund });
        await guest("booking_cancelled_guest", content(guestUrl));
        await host("booking_cancelled_provider", content(providerUrl));
        break;
      }
      case "refunded":
        await guest(
          "refund_processed_guest",
          templates.refundProcessed(s, { reference: b.reference, amount: formatMoney(b.refund_minor, b.currency), url: guestUrl }),
        );
        break;
      case "reminder": {
        if (b.customer_id) {
          const { data: prefs } = await createAdminClient()
            .from("profiles")
            .select("email_booking_reminders")
            .eq("id", b.customer_id)
            .maybeSingle();
          if (prefs && !prefs.email_booking_reminders) return;
        }
        await guest(
          "booking_reminder_guest",
          templates.bookingReminder(s, { ...summary, url: guestUrl, instructions: exp.meeting_point_instructions }),
        );
        break;
      }
    }
  } catch (error) {
    console.error("[hidden-kenya] booking notification failed:", event, (error as Error).message);
  }
}
