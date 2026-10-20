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

describe("moderation guards", () => {
  it("sends a live listing back to review when a photo is added", async () => {
    const p = await createVerifiedProvider("Photo rereview");
    const { experienceId } = await createPublishedExperience(p);
    await q(
      user(p.ownerId),
      `insert into public.experience_images (experience_id, storage_path, alt_text, rights_confirmed)
       values ($1, $2 || '/' || $3 || '/new.webp', 'New photo', true)`,
      [experienceId, p.providerId, experienceId],
    );
    const [row] = await setup<{ status: string }>("select status from public.experiences where id = $1", [experienceId]);
    expect(row.status).toBe("pending_review");
  });

  it("does not re-review for availability changes", async () => {
    const p = await createVerifiedProvider("Availability no rereview");
    const { experienceId } = await createPublishedExperience(p);
    await q(user(p.ownerId), "update public.experience_availability set capacity = 3 where experience_id = $1", [experienceId]);
    const [row] = await setup<{ status: string }>("select status from public.experiences where id = $1", [experienceId]);
    expect(row.status).toBe("published");
  });

  it("locks the business name of a verified host", async () => {
    const p = await createVerifiedProvider("Locked Name");
    await rejects(q(user(p.ownerId), "update public.provider_profiles set business_name = 'Impersonator Tours' where id = $1", [p.providerId]), "HK_NAME_LOCKED");
    await q(user(p.ownerId), "update public.provider_profiles set description = $2 where id = $1", [p.providerId, "Updated description. ".repeat(5)]);
  });

  it("requires notes for negative decisions and a verified host to publish", async () => {
    const admin = await getAdmin();
    const owner = await createUser();
    const [{ become_provider: pid }] = await q<{ become_provider: string }>(user(owner.id), "select public.become_provider('Unverified Publisher')");
    await rejects(q(user(admin), "select public.admin_review_provider($1, 'reject', '')", [pid]), /HK_INVALID_STATE|HK_NOTES_REQUIRED/);
    const p = await createVerifiedProvider("Needs Notes");
    const { experienceId } = await createPublishedExperience(p);
    await rejects(q(user(admin), "select public.admin_moderate_experience($1, 'suspend', '')", [experienceId]), "HK_NOTES_REQUIRED");
  });

  it("refuses to submit an incomplete listing", async () => {
    const p = await createVerifiedProvider("Incomplete");
    const [cat] = await setup<{ id: string }>("select id from public.experience_categories limit 1");
    const [exp] = await q<{ id: string }>(
      user(p.ownerId),
      `insert into public.experiences (provider_id, county_code, category_id, slug, title, price_minor, duration_minutes, max_participants)
       values ($1, 47, $2, $3, 'Incomplete listing', 1000, 60, 4) returning id`,
      [p.providerId, cat.id, `incomplete-${randomUUID().slice(0, 8)}`],
    );
    await rejects(q(user(p.ownerId), "select public.submit_experience_for_review($1)", [exp.id]), "HK_LISTING_INCOMPLETE");
  });
});

describe("guest access to their own bookings", () => {
  it("keeps the listing readable for its guests after it is paused, but not for others", async () => {
    const p = await createVerifiedProvider("Paused After Booking");
    const { experienceId } = await createPublishedExperience(p);
    const guest = await createUser();
    const other = await createUser();
    const id = await book(guest.id, experienceId, await departure(10));
    await payInFull(guest.id, id);
    await q(user(p.ownerId), "select public.set_experience_state($1, 'pause')", [experienceId]);
    expect(await q(user(guest.id), "select id from public.experiences where id = $1", [experienceId])).toHaveLength(1);
    expect(await q(user(other.id), "select id from public.experiences where id = $1", [experienceId])).toHaveLength(0);
    expect(await q(anon, "select id from public.experiences where id = $1", [experienceId])).toHaveLength(0);
  });

  it("shows host contact details only to the guest of a confirmed booking", async () => {
    const p = await createVerifiedProvider("Contactable Host");
    const { experienceId } = await createPublishedExperience(p);
    const guest = await createUser();
    const other = await createUser();
    const id = await book(guest.id, experienceId, await departure(10));
    expect(await q(user(guest.id), "select * from public.booking_host_contact($1)", [id])).toHaveLength(0); // not paid yet
    await payInFull(guest.id, id);
    const [c] = await q<{ contact_phone: string }>(user(guest.id), "select * from public.booking_host_contact($1)", [id]);
    expect(c.contact_phone).toBe("+254700000000");
    expect(await q(user(other.id), "select * from public.booking_host_contact($1)", [id])).toHaveLength(0);
    expect(await q(user(p.ownerId), "select * from public.booking_host_contact($1)", [id])).toHaveLength(0);
  });
});

describe("account deletion", () => {
  it("scrubs contact data, deletes reviews and keeps financial records", async () => {
    const p = await createVerifiedProvider("Deletion Host");
    const { experienceId } = await createPublishedExperience(p);
    const guest = await createUser("Delete Me");
    const id = await book(guest.id, experienceId, await departure(10));
    await payInFull(guest.id, id);
    // Active bookings block deletion.
    await rejects(q(service, "select public.prepare_account_deletion($1)", [guest.id]), "HK_ACTIVE_BOOKINGS");
    await setup("update public.bookings set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' where id = $1", [id]);
    await q(service, "select public.complete_past_bookings()");
    await q(user(guest.id), "select public.create_review($1, 4, 'Good', 'A good experience overall, would recommend it.')", [id]);

    await q(service, "select public.prepare_account_deletion($1)", [guest.id]);
    // Deleting the auth user cascades; the audit log must allow actor_id to become null.
    await setup("delete from auth.users where id = $1", [guest.id]);

    const [b] = await setup<{ customer_id: string | null; contact_name: string; contact_email: string; total_minor: string }>(
      "select customer_id, contact_name, contact_email, total_minor from public.bookings where id = $1",
      [id],
    );
    expect(b.customer_id).toBeNull();
    expect(b.contact_name).toBe("Deleted user");
    expect(b.contact_email).toBe("deleted-user@hiddenkenya.invalid");
    expect(await setup("select 1 from public.reviews where booking_id = $1", [id])).toHaveLength(0);
    expect(await setup("select 1 from public.payments where booking_id = $1 and status = 'succeeded'", [id])).toHaveLength(1);
    expect(await setup("select 1 from public.profiles where id = $1", [guest.id])).toHaveLength(0);
    const [log] = await setup<{ actor_id: string | null }>("select actor_id from public.audit_logs where action = 'user.deleted' and entity_id = $1", [guest.id]);
    expect(log.actor_id).toBeNull();
  });

  it("refuses to delete host accounts automatically", async () => {
    const p = await createVerifiedProvider("Host Deletion");
    await rejects(q(service, "select public.prepare_account_deletion($1)", [p.ownerId]), "HK_PROVIDER_ACCOUNT");
  });

  it("is not callable by users", async () => {
    const u = await createUser();
    await rejects(q(user(u.id), "select public.prepare_account_deletion($1)", [u.id]), "permission denied");
  });

  it("exports the signed-in user's own data", async () => {
    const u = await createUser("Export Me");
    const [{ export_my_data: data }] = await q<{ export_my_data: { profile: { full_name: string }; bookings: unknown[] } }>(
      user(u.id),
      "select public.export_my_data()",
    );
    expect(data.profile.full_name).toBe("Export Me");
    expect(Array.isArray(data.bookings)).toBe(true);
  });
});

describe("webhook retry semantics", () => {
  it("lets a failed delivery be reprocessed, but not a completed one", async () => {
    const key = `retry:${randomUUID()}`;
    const rec = async () =>
      (await q<{ record_payment_event: boolean }>(service, "select public.record_payment_event('paystack', $1, 'charge.success', 'HKP_x', '{}')", [key]))[0]
        .record_payment_event;
    expect(await rec()).toBe(true);
    await q(service, "select public.finish_payment_event($1, 'error', 'gateway timeout')", [key]);
    expect(await rec()).toBe(true); // retried after failure
    await q(service, "select public.finish_payment_event($1, 'confirmed', null)", [key]);
    expect(await rec()).toBe(false); // processed: duplicate
  });
});

describe("payout transfers", () => {
  it("marks a processing payout paid from a gateway result, only once", async () => {
    const p = await createVerifiedProvider("Transfer Host");
    const { experienceId } = await createPublishedExperience(p, { priceMinor: 100000 });
    const admin = await getAdmin();
    const guest = await createUser();
    const id = await book(guest.id, experienceId, await departure(10), 1);
    await payInFull(guest.id, id);
    await setup("update public.bookings set starts_at = now() - interval '1 day', ends_at = now() - interval '20 hours' where id = $1", [id]);
    await q(service, "select public.complete_past_bookings()");
    const [{ admin_create_payout: payoutId }] = await q<{ admin_create_payout: string }>(user(admin), "select public.admin_create_payout($1, 'KES')", [p.providerId]);
    const [r0] = await q<{ apply_payout_transfer_result: string }>(service, "select public.apply_payout_transfer_result($1, 'success', 'TRF_1')", [payoutId]);
    expect(r0.apply_payout_transfer_result).toBe("ignored"); // still draft: not sent yet
    await q(user(admin), "select public.admin_update_payout($1, 'processing')", [payoutId]);
    const [r1] = await q<{ apply_payout_transfer_result: string }>(service, "select public.apply_payout_transfer_result($1, 'success', 'TRF_1')", [payoutId]);
    expect(r1.apply_payout_transfer_result).toBe("paid");
    const [r2] = await q<{ apply_payout_transfer_result: string }>(service, "select public.apply_payout_transfer_result($1, 'failed', 'TRF_1')", [payoutId]);
    expect(r2.apply_payout_transfer_result).toBe("already_paid");
    await rejects(q(user(p.ownerId), "select public.apply_payout_transfer_result($1, 'success')", [payoutId]), "permission denied");
  });

  it("deducts refunds before commission in host earnings", async () => {
    const p = await createVerifiedProvider("Refund Accounting");
    const { experienceId } = await createPublishedExperience(p, { priceMinor: 100000, cancellationPolicy: "moderate" });
    const guest = await createUser();
    const id = await book(guest.id, experienceId, await departure(3), 1); // 50% refund window
    await payInFull(guest.id, id);
    await q(user(guest.id), "select public.cancel_booking($1, 'x')", [id]);
    const [refund] = await setup<{ id: string }>("select id from public.refunds where booking_id = $1", [id]);
    await q(service, "select public.apply_refund_result($1, 'processed', 'rf')", [refund.id]);
    const [s] = await q<Record<string, string>>(user(p.ownerId), "select * from public.provider_earnings_summary()");
    expect(Number(s.gross_minor)).toBe(100000);
    expect(Number(s.refunded_minor)).toBe(50000);
    expect(Number(s.commission_minor)).toBe(5000); // 10% of 50,000
    expect(Number(s.net_minor)).toBe(45000);
  });
});

describe("reviews", () => {
  it("lets providers respond and anyone signed in report, but not edit", async () => {
    const p = await createVerifiedProvider("Review Responses");
    const { experienceId } = await createPublishedExperience(p);
    const guest = await createUser("Guest Reviewer");
    const reporter = await createUser();
    const id = await book(guest.id, experienceId, await departure(10));
    await payInFull(guest.id, id);
    await setup("update public.bookings set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' where id = $1", [id]);
    await q(service, "select public.complete_past_bookings()");
    const [{ create_review: reviewId }] = await q<{ create_review: string }>(user(guest.id), "select public.create_review($1, 2, 'Meh', 'It rained and the guide was late, but fine overall.')", [id]);
    await q(user(p.ownerId), "select public.respond_to_review($1, 'Sorry about the delay, thank you for coming.')", [reviewId]);
    await rejects(q(user(guest.id), "update public.reviews set rating = 5 where id = $1", [reviewId]), "permission denied");
    await rejects(q(user(p.ownerId), "update public.reviews set body = 'Edited by host to be positive' where id = $1", [reviewId]), "permission denied");
    await q(user(reporter.id), "select public.report_review($1, 'Contains personal information')", [reviewId]);
    await rejects(q(anon, "select public.report_review($1, 'anonymous report')", [reviewId]), "permission denied");
    await q(user(await getAdmin()), "select public.admin_moderate_review($1, 'removed', 'Upheld')", [reviewId]);
    expect(await q(anon, "select id from public.reviews where id = $1", [reviewId])).toHaveLength(0);
    const [rep] = await setup<{ status: string }>("select status from public.review_reports where review_id = $1", [reviewId]);
    expect(rep.status).toBe("upheld");
  });
});
