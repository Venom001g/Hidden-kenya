import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anon,
  book,
  createPublishedExperience,
  createUser,
  createVerifiedProvider,
  departure,
  ensureDefaultCommission,
  getAdmin,
  payInFull,
  pool,
  q,
  rejects,
  service,
  setup,
  user,
} from "./helpers";

afterAll(() => pool.end());
beforeAll(() => ensureDefaultCommission(1000));

const status = async (bookingId: string) =>
  (await setup<{ status: string }>("select status from public.bookings where id = $1", [bookingId]))[0].status;

describe("availability", () => {
  it("lists departures with remaining places for public listings", async () => {
    const p = await createVerifiedProvider("Availability");
    const { experienceId } = await createPublishedExperience(p, { capacity: 5 });
    const rows = await q<{ starts_at: Date; capacity: number; seats_available: number }>(
      anon,
      "select * from public.get_experience_availability($1, null, null)",
      [experienceId],
    );
    expect(rows.length).toBeGreaterThan(20);
    expect(rows.every((r) => r.capacity === 5 && r.seats_available === 5)).toBe(true);
  });

  it("applies closures and capacity overrides", async () => {
    const p = await createVerifiedProvider("Exceptions");
    const { experienceId } = await createPublishedExperience(p, { capacity: 5 });
    const day = await departure(5);
    const dateStr = (
      await setup<{ d: string }>("select to_char(($1::timestamptz at time zone 'Africa/Nairobi')::date, 'YYYY-MM-DD') d", [day])
    )[0].d;
    const day2 = await departure(6);
    const date2 = (
      await setup<{ d: string }>("select to_char(($1::timestamptz at time zone 'Africa/Nairobi')::date, 'YYYY-MM-DD') d", [day2])
    )[0].d;
    await q(
      user(p.ownerId),
      "insert into public.availability_exceptions (experience_id, exception_date, kind, reason) values ($1, $2, 'closed', 'Public holiday')",
      [experienceId, dateStr],
    );
    await q(
      user(p.ownerId),
      "insert into public.availability_exceptions (experience_id, exception_date, kind, capacity_override) values ($1, $2, 'capacity_override', 2)",
      [experienceId, date2],
    );
    const rows = await q<{ starts_at: Date; capacity: number }>(
      anon,
      "select * from public.get_experience_availability($1, $2::date - 1, $2::date + 2)",
      [experienceId, dateStr],
    );
    const times = rows.map((r) => r.starts_at.getTime());
    expect(times).not.toContain(day.getTime());
    expect(rows.find((r) => r.starts_at.getTime() === day2.getTime())?.capacity).toBe(2);
    const guest = await createUser();
    await rejects(book(guest.id, experienceId, day), "HK_NO_DEPARTURE");
    await rejects(book(guest.id, experienceId, day2, 3), "HK_SOLD_OUT");
  });

  it("refuses availability for unpublished listings to the public", async () => {
    const p = await createVerifiedProvider("Unpublished availability");
    const { experienceId } = await createPublishedExperience(p);
    await q(user(p.ownerId), "select public.set_experience_state($1, 'pause')", [experienceId]);
    await rejects(q(anon, "select * from public.get_experience_availability($1, null, null)", [experienceId]), "HK_NOT_FOUND");
    expect((await q(user(p.ownerId), "select * from public.get_experience_availability($1, null, null)", [experienceId])).length).toBeGreaterThan(0);
  });
});

describe("create_booking", () => {
  it("creates a held booking with a server-calculated price", async () => {
    const p = await createVerifiedProvider("Pricing");
    const { experienceId } = await createPublishedExperience(p, { priceMinor: 350000 });
    const guest = await createUser();
    const id = await book(guest.id, experienceId, await departure(8), 3);
    const [b] = await setup<{
      status: string;
      total_minor: string;
      commission_rate_bps: number;
      hold_expires_at: Date;
      reference: string;
    }>("select * from public.bookings where id = $1", [id]);
    expect(b.status).toBe("pending_payment");
    expect(Number(b.total_minor)).toBe(1050000);
    expect(b.commission_rate_bps).toBe(1000);
    expect(b.reference).toMatch(/^HK-[A-Z0-9]{8}$/);
    const minutes = (b.hold_expires_at.getTime() - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(25);
    expect(minutes).toBeLessThanOrEqual(30.5);
  });

  it("charges per-group listings once", async () => {
    const p = await createVerifiedProvider("Group pricing");
    const { experienceId } = await createPublishedExperience(p, { priceMinor: 2000000, pricingModel: "per_group" });
    const guest = await createUser();
    const id = await book(guest.id, experienceId, await departure(8), 4);
    const [b] = await setup<{ total_minor: string }>("select total_minor from public.bookings where id = $1", [id]);
    expect(Number(b.total_minor)).toBe(2000000);
  });

  it("validates party size, lead time, departure and ownership", async () => {
    const p = await createVerifiedProvider("Validation");
    const { experienceId } = await createPublishedExperience(p, { minParticipants: 2, maxParticipants: 4, leadTimeHours: 72 });
    const guest = await createUser();
    await rejects(book(guest.id, experienceId, await departure(10), 1), "HK_PARTY_SIZE");
    await rejects(book(guest.id, experienceId, await departure(10), 5), "HK_PARTY_SIZE");
    await rejects(book(guest.id, experienceId, await departure(1), 2), "HK_TOO_SOON");
    await rejects(book(guest.id, experienceId, await departure(400), 2), "HK_TOO_FAR");
    const offSchedule = new Date((await departure(10)).getTime() + 30 * 60000);
    await rejects(book(guest.id, experienceId, offSchedule, 2), "HK_NO_DEPARTURE");
    await rejects(book(p.ownerId, experienceId, await departure(10), 2), "HK_OWN_LISTING");
  });

  it("requires sign-in and a published listing", async () => {
    const p = await createVerifiedProvider("Unavailable");
    const { experienceId } = await createPublishedExperience(p);
    await rejects(
      q(anon, "select public.create_booking($1, now() + interval '5 days', 1, 'anon-key-123', 'A B', 'a@b.co', '+254700000000')", [
        experienceId,
      ]),
      "permission denied",
    );
    await q(user(p.ownerId), "select public.set_experience_state($1, 'archive')", [experienceId]);
    const guest = await createUser();
    await rejects(book(guest.id, experienceId, await departure(10)), "HK_LISTING_UNAVAILABLE");
  });

  it("enforces capacity", async () => {
    const p = await createVerifiedProvider("Capacity");
    const { experienceId } = await createPublishedExperience(p, { capacity: 4 });
    const when = await departure(9);
    await book((await createUser()).id, experienceId, when, 3);
    await rejects(book((await createUser()).id, experienceId, when, 2), "HK_SOLD_OUT");
    await book((await createUser()).id, experienceId, when, 1);
    await rejects(book((await createUser()).id, experienceId, when, 1), "HK_SOLD_OUT");
  });

  it("never oversells under concurrent requests", async () => {
    const p = await createVerifiedProvider("Concurrency");
    const capacity = 5;
    const { experienceId } = await createPublishedExperience(p, { capacity });
    const when = await departure(11);
    const guests = await Promise.all(Array.from({ length: 15 }, () => createUser()));
    const results = await Promise.allSettled(guests.map((g) => book(g.id, experienceId, when, 1)));
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(capacity);
    expect(failed.every((f) => String(f.reason.message).includes("HK_SOLD_OUT"))).toBe(true);
    const [seats] = await setup<{ n: string }>(
      "select sum(party_size) n from public.bookings where experience_id = $1 and starts_at = $2",
      [experienceId, when],
    );
    expect(Number(seats.n)).toBe(capacity);
  });

  it("is idempotent for repeated and simultaneous requests with the same key", async () => {
    const p = await createVerifiedProvider("Idempotency");
    const { experienceId } = await createPublishedExperience(p, { capacity: 10 });
    const when = await departure(14);
    const guest = await createUser();
    const key = randomUUID();
    const ids = await Promise.all(Array.from({ length: 6 }, () => book(guest.id, experienceId, when, 2, key)));
    expect(new Set(ids).size).toBe(1);
    expect(await book(guest.id, experienceId, when, 2, key)).toBe(ids[0]);
    const [count] = await setup<{ n: string }>("select count(*) n from public.bookings where customer_id = $1", [guest.id]);
    expect(Number(count.n)).toBe(1);
    await rejects(book(guest.id, experienceId, when, 3, key), "HK_IDEMPOTENCY_CONFLICT");
  });

  it("caps concurrent unpaid holds per customer", async () => {
    const p = await createVerifiedProvider("Hoarding");
    const { experienceId } = await createPublishedExperience(p, { capacity: 50 });
    const guest = await createUser();
    for (let i = 0; i < 5; i++) await book(guest.id, experienceId, await departure(20 + i), 1);
    await rejects(book(guest.id, experienceId, await departure(30), 1), "HK_TOO_MANY_HOLDS");
  });

  it("releases seats when holds expire, and the expiry job marks them expired", async () => {
    const p = await createVerifiedProvider("Expiry");
    const { experienceId } = await createPublishedExperience(p, { capacity: 2 });
    const when = await departure(15);
    const first = await book((await createUser()).id, experienceId, when, 2);
    await rejects(book((await createUser()).id, experienceId, when, 1), "HK_SOLD_OUT");
    await setup("update public.bookings set hold_expires_at = now() - interval '1 minute' where id = $1", [first]);
    // Seats are free even before the job runs.
    await book((await createUser()).id, experienceId, when, 2);
    const [{ expire_stale_bookings: n }] = await q<{ expire_stale_bookings: number }>(service, "select public.expire_stale_bookings()");
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await status(first)).toBe("expired");
    await rejects(q(user(p.ownerId), "select public.expire_stale_bookings()"), "permission denied");
  });

  it("blocks bookings until a commission rule exists", async () => {
    const p = await createVerifiedProvider("No commission");
    const { experienceId } = await createPublishedExperience(p);
    await setup("update public.commission_rules set active_until = now() where active_until is null or active_until > now()");
    try {
      await rejects(book((await createUser()).id, experienceId, await departure(10)), "HK_BOOKINGS_NOT_OPEN");
    } finally {
      await q(user(await getAdmin()), "select public.admin_set_commission_rule('default', 1000)");
    }
  });

  it("uses the most specific commission rule", async () => {
    const p = await createVerifiedProvider("Provider commission");
    const { experienceId } = await createPublishedExperience(p);
    await q(user(await getAdmin()), "select public.admin_set_commission_rule('provider', 750, null, $1)", [p.providerId]);
    const id = await book((await createUser()).id, experienceId, await departure(10));
    const [b] = await setup<{ commission_rate_bps: number }>("select commission_rate_bps from public.bookings where id = $1", [id]);
    expect(b.commission_rate_bps).toBe(750);
  });
});

describe("request-to-book", () => {
  it("holds seats until the provider answers, then requires payment", async () => {
    const p = await createVerifiedProvider("Request mode");
    const { experienceId } = await createPublishedExperience(p, { bookingMode: "request", capacity: 3 });
    const guest = await createUser();
    const when = await departure(10);
    const id = await book(guest.id, experienceId, when, 3);
    expect(await status(id)).toBe("pending_provider_confirmation");
    await rejects(q(user(guest.id), "select * from public.begin_payment($1)", [id]), "HK_NOT_PAYABLE");
    await rejects(book((await createUser()).id, experienceId, when, 1), "HK_SOLD_OUT");
    await q(user(p.ownerId), "select public.provider_respond_to_booking($1, true, 'See you there')", [id]);
    expect(await status(id)).toBe("pending_payment");
    const { result } = await payInFull(guest.id, id);
    expect(result).toBe("confirmed");
  });

  it("requires a reason to decline and frees the seats", async () => {
    const p = await createVerifiedProvider("Request decline");
    const { experienceId } = await createPublishedExperience(p, { bookingMode: "request", capacity: 2 });
    const when = await departure(10);
    const id = await book((await createUser()).id, experienceId, when, 2);
    await rejects(q(user(p.ownerId), "select public.provider_respond_to_booking($1, false, '')", [id]), "HK_NOTES_REQUIRED");
    await q(user(p.ownerId), "select public.provider_respond_to_booking($1, false, 'Guide unavailable that day')", [id]);
    expect(await status(id)).toBe("cancelled");
    await book((await createUser()).id, experienceId, when, 2);
  });
});

describe("payments", () => {
  it("confirms only on a verified success with the exact amount", async () => {
    const p = await createVerifiedProvider("Pay success");
    const { experienceId } = await createPublishedExperience(p);
    const guest = await createUser();
    const id = await book(guest.id, experienceId, await departure(10), 2);
    const { reference, result } = await payInFull(guest.id, id);
    expect(result).toBe("confirmed");
    expect(await status(id)).toBe("confirmed");
    // Replays are idempotent.
    const [again] = await q<{ apply_payment_result: string }>(
      service,
      "select public.apply_payment_result($1, 'succeeded', 1000000, 'KES')",
      [reference],
    );
    expect(again.apply_payment_result).toBe("already_succeeded");
  });

  it("flags amount and currency mismatches without confirming", async () => {
    const p = await createVerifiedProvider("Mismatch");
    const { experienceId } = await createPublishedExperience(p, { priceMinor: 100000 });
    const guest = await createUser();
    const id = await book(guest.id, experienceId, await departure(10), 1);
    const [pay] = await q<{ reference: string }>(user(guest.id), "select * from public.begin_payment($1)", [id]);
    const [r1] = await q<{ apply_payment_result: string }>(
      service,
      "select public.apply_payment_result($1, 'succeeded', 1000, 'KES')",
      [pay.reference],
    );
    expect(r1.apply_payment_result).toBe("amount_mismatch");
    expect(await status(id)).toBe("pending_payment");

    const [pay2] = await q<{ reference: string }>(user(guest.id), "select * from public.begin_payment($1)", [id]);
    const [r2] = await q<{ apply_payment_result: string }>(
      service,
      "select public.apply_payment_result($1, 'succeeded', 100000, 'USD')",
      [pay2.reference],
    );
    expect(r2.apply_payment_result).toBe("amount_mismatch");
    expect(await status(id)).toBe("pending_payment");
  });

  it("handles failure, pending and retry", async () => {
    const p = await createVerifiedProvider("Pay failure");
    const { experienceId } = await createPublishedExperience(p);
    const guest = await createUser();
    const id = await book(guest.id, experienceId, await departure(10), 1);
    const [pay] = await q<{ reference: string }>(user(guest.id), "select * from public.begin_payment($1)", [id]);
    const [pending] = await q<{ apply_payment_result: string }>(
      service,
      "select public.apply_payment_result($1, 'pending', null, null)",
      [pay.reference],
    );
    expect(pending.apply_payment_result).toBe("pending");
    await q(service, "select public.apply_payment_result($1, 'failed', null, null, null, null, null, null, 'Insufficient funds')", [
      pay.reference,
    ]);
    expect(await status(id)).toBe("payment_failed");
    const { result } = await payInFull(guest.id, id);
    expect(result).toBe("confirmed");
  });

  it("ignores unknown references", async () => {
    const [r] = await q<{ apply_payment_result: string }>(
      service,
      "select public.apply_payment_result('HKP_00000000000000000000000000000000', 'succeeded', 1, 'KES')",
    );
    expect(r.apply_payment_result).toBe("unknown_reference");
  });

  it("deduplicates webhook deliveries", async () => {
    const key = `test:${randomUUID()}`;
    const [a] = await q<{ record_payment_event: boolean }>(
      service,
      "select public.record_payment_event('paystack', $1, 'charge.success', 'HKP_x', '{}')",
      [key],
    );
    await q(service, "select public.finish_payment_event($1, 'confirmed', null)", [key]);
    const [b] = await q<{ record_payment_event: boolean }>(
      service,
      "select public.record_payment_event('paystack', $1, 'charge.success', 'HKP_x', '{}')",
      [key],
    );
    expect(a.record_payment_event).toBe(true);
    expect(b.record_payment_event).toBe(false);
  });

  it("confirms a late payment when places remain, otherwise refunds it", async () => {
    const p = await createVerifiedProvider("Late payments");
    const { experienceId } = await createPublishedExperience(p, { capacity: 2 });
    const when = await departure(12);
    const g1 = await createUser();
    const id1 = await book(g1.id, experienceId, when, 2);
    const [pay1] = await q<{ reference: string; amount_minor: string }>(user(g1.id), "select * from public.begin_payment($1)", [id1]);
    await setup("update public.bookings set hold_expires_at = now() - interval '1 minute' where id = $1", [id1]);
    const [late] = await q<{ apply_payment_result: string }>(
      service,
      "select public.apply_payment_result($1, 'succeeded', $2, 'KES')",
      [pay1.reference, pay1.amount_minor],
    );
    expect(late.apply_payment_result).toBe("confirmed_late");

    const g2 = await createUser();
    const when2 = await departure(13);
    const id2 = await book(g2.id, experienceId, when2, 2);
    const [pay2] = await q<{ reference: string; amount_minor: string }>(user(g2.id), "select * from public.begin_payment($1)", [id2]);
    await setup("update public.bookings set hold_expires_at = now() - interval '1 minute' where id = $1", [id2]);
    await book((await createUser()).id, experienceId, when2, 2); // someone else takes the places
    const [refunded] = await q<{ apply_payment_result: string }>(
      service,
      "select public.apply_payment_result($1, 'succeeded', $2, 'KES')",
      [pay2.reference, pay2.amount_minor],
    );
    expect(refunded.apply_payment_result).toBe("late_refund");
    expect(await status(id2)).toBe("refund_pending");
    const refunds = await setup<{ amount_minor: string }>("select amount_minor from public.refunds where booking_id = $1", [id2]);
    expect(refunds.map((r) => Number(r.amount_minor))).toEqual([Number(pay2.amount_minor)]);
  });

  it("refunds a duplicate successful payment", async () => {
    const p = await createVerifiedProvider("Duplicate payments");
    const { experienceId } = await createPublishedExperience(p);
    const guest = await createUser();
    const id = await book(guest.id, experienceId, await departure(10), 1);
    const [a] = await q<{ reference: string; amount_minor: string }>(user(guest.id), "select * from public.begin_payment($1)", [id]);
    const [b] = await q<{ reference: string; amount_minor: string }>(user(guest.id), "select * from public.begin_payment($1)", [id]);
    await q(service, "select public.apply_payment_result($1, 'succeeded', $2, 'KES')", [b.reference, b.amount_minor]);
    const [dup] = await q<{ apply_payment_result: string }>(
      service,
      "select public.apply_payment_result($1, 'succeeded', $2, 'KES')",
      [a.reference, a.amount_minor],
    );
    expect(dup.apply_payment_result).toBe("duplicate_refund");
    expect(await status(id)).toBe("confirmed");
  });

  it("cannot pay after the hold expires", async () => {
    const p = await createVerifiedProvider("Expired pay");
    const { experienceId } = await createPublishedExperience(p);
    const guest = await createUser();
    const id = await book(guest.id, experienceId, await departure(10), 1);
    await setup("update public.bookings set hold_expires_at = now() - interval '1 minute' where id = $1", [id]);
    await rejects(q(user(guest.id), "select * from public.begin_payment($1)", [id]), "HK_NOT_PAYABLE");
  });
});

describe("cancellation and refunds", () => {
  it("applies the moderate policy: full refund 5+ days out", async () => {
    const p = await createVerifiedProvider("Cancel full");
    const { experienceId } = await createPublishedExperience(p, { cancellationPolicy: "moderate", priceMinor: 100000 });
    const guest = await createUser();
    const id = await book(guest.id, experienceId, await departure(10), 2);
    await payInFull(guest.id, id);
    const [quote] = await q<{ refund_minor: string; refund_percent: number }>(
      user(guest.id),
      "select * from public.cancellation_quote($1)",
      [id],
    );
    expect(quote.refund_percent).toBe(100);
    const [{ cancel_booking: result }] = await q<{ cancel_booking: string }>(user(guest.id), "select public.cancel_booking($1, 'Plans changed')", [
      id,
    ]);
    expect(result).toBe("refund_pending");
    const [refund] = await setup<{ id: string; amount_minor: string }>("select id, amount_minor from public.refunds where booking_id = $1", [id]);
    expect(Number(refund.amount_minor)).toBe(200000);
    await q(service, "select public.apply_refund_result($1, 'processed', 'rf_1')", [refund.id]);
    expect(await status(id)).toBe("refunded");
  });

  it("applies the moderate policy: 50% between 1 and 5 days", async () => {
    const p = await createVerifiedProvider("Cancel half");
    const { experienceId } = await createPublishedExperience(p, { cancellationPolicy: "moderate", priceMinor: 100001 });
    const guest = await createUser();
    const id = await book(guest.id, experienceId, await departure(3), 1);
    await payInFull(guest.id, id);
    await q(user(guest.id), "select public.cancel_booking($1, 'Unwell')", [id]);
    const [b] = await setup<{ refund_minor: string; status: string }>("select refund_minor, status from public.bookings where id = $1", [id]);
    expect(b.status).toBe("refund_pending");
    expect(Number(b.refund_minor)).toBe(50001); // rounded half-up
  });

  it("gives no refund inside the strict window", async () => {
    const p = await createVerifiedProvider("Cancel strict");
    const { experienceId } = await createPublishedExperience(p, { cancellationPolicy: "strict" });
    const guest = await createUser();
    const id = await book(guest.id, experienceId, await departure(3), 1);
    await payInFull(guest.id, id);
    const [{ cancel_booking: result }] = await q<{ cancel_booking: string }>(user(guest.id), "select public.cancel_booking($1, 'x')", [id]);
    expect(result).toBe("cancelled");
    expect(await setup("select 1 from public.refunds where booking_id = $1", [id])).toHaveLength(0);
  });

  it("frees seats when an unpaid booking is cancelled", async () => {
    const p = await createVerifiedProvider("Cancel unpaid");
    const { experienceId } = await createPublishedExperience(p, { capacity: 1 });
    const when = await departure(10);
    const guest = await createUser();
    const id = await book(guest.id, experienceId, when, 1);
    await q(user(guest.id), "select public.cancel_booking($1, '')", [id]);
    expect(await status(id)).toBe("cancelled");
    await book((await createUser()).id, experienceId, when, 1);
  });

  it("refunds in full when the provider cancels", async () => {
    const p = await createVerifiedProvider("Provider cancel");
    const { experienceId } = await createPublishedExperience(p, { cancellationPolicy: "strict", priceMinor: 70000 });
    const guest = await createUser();
    const id = await book(guest.id, experienceId, await departure(2), 1);
    await payInFull(guest.id, id);
    await q(user(p.ownerId), "select public.provider_cancel_booking($1, 'Road closed by flooding')", [id]);
    const [b] = await setup<{ refund_minor: string; status: string }>("select refund_minor, status from public.bookings where id = $1", [id]);
    expect(b).toEqual({ refund_minor: "70000", status: "refund_pending" });
  });
});

describe("completion, reviews and payouts", () => {
  it("only allows one review per completed booking, by its guest", async () => {
    const p = await createVerifiedProvider("Reviews");
    const { experienceId } = await createPublishedExperience(p);
    const guest = await createUser("Wanjiru Kamau");
    const stranger = await createUser();
    const id = await book(guest.id, experienceId, await departure(10), 1);
    await payInFull(guest.id, id);
    const body = "We had a genuinely wonderful morning with the guide.";
    await rejects(q(user(guest.id), "select public.create_review($1, 5, 'Great', $2)", [id, body]), "HK_REVIEW_NOT_ELIGIBLE");

    await setup("update public.bookings set starts_at = now() - interval '2 days', ends_at = now() - interval '2 days' + interval '3 hours' where id = $1", [id]);
    const [{ complete_past_bookings: n }] = await q<{ complete_past_bookings: number }>(service, "select public.complete_past_bookings()");
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await status(id)).toBe("completed");

    await rejects(q(user(stranger.id), "select public.create_review($1, 1, 'Bad', $2)", [id, body]), "HK_NOT_FOUND");
    await rejects(
      q(user(guest.id), "insert into public.reviews (booking_id, experience_id, provider_id, reviewer_display_name, rating, body, experienced_on) values ($1, $2, $3, 'x', 5, $4, now())", [
        id,
        experienceId,
        p.providerId,
        body,
      ]),
      "permission denied",
    );
    await q(user(guest.id), "select public.create_review($1, 5, 'Great', $2)", [id, body]);
    await rejects(q(user(guest.id), "select public.create_review($1, 5, 'Again', $2)", [id, body]), "HK_ALREADY_REVIEWED");

    const [pub] = await q<{ reviewer_display_name: string }>(anon, "select reviewer_display_name from public.reviews where booking_id = $1", [id]);
    expect(pub.reviewer_display_name).toBe("Wanjiru K.");
    const [stats] = await q<{ review_count: number; average_rating: string }>(
      anon,
      "select * from public.experience_review_stats where experience_id = $1",
      [experienceId],
    );
    expect(stats.review_count).toBe(1);
    expect(Number(stats.average_rating)).toBe(5);
  });

  it("calculates provider earnings and pays each booking out once", async () => {
    const p = await createVerifiedProvider("Payouts");
    const { experienceId } = await createPublishedExperience(p, { priceMinor: 100000 });
    const admin = await getAdmin();
    const guest = await createUser();
    const id = await book(guest.id, experienceId, await departure(10), 2);
    await payInFull(guest.id, id);
    await setup("update public.bookings set starts_at = now() - interval '1 day', ends_at = now() - interval '20 hours' where id = $1", [id]);
    await q(service, "select public.complete_past_bookings()");

    const [summary] = await q<Record<string, string>>(user(p.ownerId), "select * from public.provider_earnings_summary()");
    expect(Number(summary.gross_minor)).toBe(200000);
    expect(Number(summary.commission_minor)).toBe(20000);
    expect(Number(summary.net_minor)).toBe(180000);
    expect(Number(summary.available_minor)).toBe(180000);
    expect(Number(summary.paid_out_minor)).toBe(0);

    const [{ admin_create_payout: payoutId }] = await q<{ admin_create_payout: string }>(
      user(admin),
      "select public.admin_create_payout($1, 'KES')",
      [p.providerId],
    );
    await rejects(q(user(admin), "select public.admin_create_payout($1, 'KES')", [p.providerId]), "HK_NOTHING_TO_PAY");
    await rejects(q(user(admin), "select public.admin_update_payout($1, 'paid')", [payoutId]), "HK_NOTES_REQUIRED");
    await q(user(admin), "select public.admin_update_payout($1, 'paid', 'MPESA-TEST-REF')", [payoutId]);
    const [after] = await q<Record<string, string>>(user(p.ownerId), "select * from public.provider_earnings_summary()");
    expect(Number(after.paid_out_minor)).toBe(180000);
    expect(Number(after.available_minor)).toBe(0);
  });
});

describe("search", () => {
  it("filters by category, county, price, group size, accessibility and date", async () => {
    const p = await createVerifiedProvider("Search");
    const tag = randomUUID().slice(0, 8);
    const a = await createPublishedExperience(p, {
      title: `Searchable dawn walk ${tag}`,
      categorySlug: "hiking-outdoors",
      countyCode: 31,
      priceMinor: 300000,
      maxParticipants: 6,
      accessibility: ["wheelchair_accessible"],
    });
    await createPublishedExperience(p, {
      title: `Searchable boat trip ${tag}`,
      categorySlug: "beaches-coast",
      countyCode: 5,
      priceMinor: 900000,
      maxParticipants: 12,
    });
    const search = (args: Record<string, unknown>) =>
      q<{ id: string; total_count: string }>(
        anon,
        `select * from public.search_experiences(
           p_query => $1, p_category => $2, p_county => $3, p_max_price_minor => $4, p_group_size => $5,
           p_accessibility => $6, p_date => $7, p_licence_checked => $8)`,
        [
          args.query ?? tag,
          args.category ?? null,
          args.county ?? null,
          args.maxPrice ?? null,
          args.group ?? null,
          args.accessibility ?? null,
          args.date ?? null,
          args.licence ?? null,
        ],
      );
    expect(await search({})).toHaveLength(2);
    expect((await search({ category: "hiking-outdoors" })).map((r) => r.id)).toEqual([a.experienceId]);
    expect((await search({ county: 31 })).map((r) => r.id)).toEqual([a.experienceId]);
    expect((await search({ maxPrice: 500000 })).map((r) => r.id)).toEqual([a.experienceId]);
    expect(await search({ group: 10 })).toHaveLength(1);
    expect((await search({ accessibility: ["wheelchair_accessible"] })).map((r) => r.id)).toEqual([a.experienceId]);
    expect(await search({ licence: true })).toHaveLength(2);
    const [{ d }] = await setup<{ d: string }>("select to_char((now() at time zone 'Africa/Nairobi')::date + 7, 'YYYY-MM-DD') d");
    expect(await search({ date: d })).toHaveLength(2);
    expect(Number((await search({}))[0].total_count)).toBe(2);
  });

  it("returns nothing for an unmatched query", async () => {
    const rows = await q(anon, "select * from public.search_experiences(p_query => 'zzqx-no-such-thing-zzqx')");
    expect(rows).toHaveLength(0);
  });
});
