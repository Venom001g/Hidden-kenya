import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anon,
  as,
  book,
  createPublishedExperience,
  createUser,
  createVerifiedProvider,
  departure,
  ensureDefaultCommission,
  getAdmin,
  pool,
  q,
  rejects,
  service,
  setup,
  user,
} from "./helpers";

afterAll(() => pool.end());

describe("accounts and roles", () => {
  it("creates a profile and customer role on signup, ignoring any role in metadata", async () => {
    const u = await createUser("Asha Mwangi", { role: "admin", roles: ["admin"] });
    const roles = await q<{ role: string }>(user(u.id), "select role from public.user_roles where user_id = $1", [u.id]);
    expect(roles.map((r) => r.role)).toEqual(["customer"]);
    const [profile] = await q<{ full_name: string }>(user(u.id), "select full_name from public.profiles where id = $1", [u.id]);
    expect(profile.full_name).toBe("Asha Mwangi");
  });

  it("blocks direct role escalation", async () => {
    const u = await createUser();
    await rejects(
      q(user(u.id), "insert into public.user_roles (user_id, role) values ($1, 'admin')", [u.id]),
      "permission denied",
    );
    await rejects(q(user(u.id), "update public.user_roles set role = 'admin' where user_id = $1", [u.id]), "permission denied");
    await rejects(q(user(u.id), "select public.admin_set_admin_role($1, true)", [u.id]), "HK_FORBIDDEN");
    await rejects(q(user(u.id), "select public.bootstrap_first_admin($1)", [u.id]), "permission denied");
  });

  it("refuses a second bootstrap admin", async () => {
    await getAdmin();
    const u = await createUser();
    await rejects(q(service, "select public.bootstrap_first_admin($1)", [u.id]), "already exists");
  });

  it("lets users edit only their own profile and only allowed columns", async () => {
    const a = await createUser();
    const b = await createUser();
    await q(user(a.id), "update public.profiles set full_name = 'New Name' where id = $1", [a.id]);
    const changed = await q(user(a.id), "update public.profiles set full_name = 'Hacked' where id = $1 returning id", [b.id]);
    expect(changed).toHaveLength(0);
    await rejects(q(user(a.id), "update public.profiles set deactivated_at = null where id = $1", [a.id]), "permission denied");
    expect(await q(user(a.id), "select * from public.profiles where id = $1", [b.id])).toHaveLength(0);
  });

  it("hides every profile from anonymous visitors", async () => {
    await createUser();
    await rejects(q(anon, "select * from public.profiles"), "permission denied");
  });
});

describe("provider records", () => {
  it("keeps private provider details away from the public and other providers", async () => {
    const p1 = await createVerifiedProvider("Private Details One");
    const p2 = await createVerifiedProvider("Private Details Two");
    await rejects(q(anon, "select * from public.provider_private_details"), "permission denied");
    const seen = await q(user(p2.ownerId), "select * from public.provider_private_details where provider_id = $1", [p1.providerId]);
    expect(seen).toHaveLength(0);
    const own = await q(user(p1.ownerId), "select * from public.provider_private_details where provider_id = $1", [p1.providerId]);
    expect(own).toHaveLength(1);
  });

  it("does not let a provider verify themselves", async () => {
    const owner = await createUser();
    const [{ become_provider: id }] = await q<{ become_provider: string }>(
      user(owner.id),
      "select public.become_provider('Self Verifier')",
    );
    await rejects(
      q(user(owner.id), "update public.provider_profiles set verification_status = 'verified' where id = $1", [id]),
      "permission denied",
    );
    await rejects(q(user(owner.id), "select public.admin_review_provider($1, 'verify', '')", [id]), "HK_FORBIDDEN");
    const [row] = await setup<{ verification_status: string }>(
      "select verification_status from public.provider_profiles where id = $1",
      [id],
    );
    expect(row.verification_status).toBe("draft");
  });

  it("shows unverified providers only to their owner and admins", async () => {
    const owner = await createUser();
    const [{ become_provider: id }] = await q<{ become_provider: string }>(
      user(owner.id),
      "select public.become_provider('Hidden Until Verified')",
    );
    expect(await q(anon, "select id from public.provider_profiles where id = $1", [id])).toHaveLength(0);
    expect(await q(user(owner.id), "select id from public.provider_profiles where id = $1", [id])).toHaveLength(1);
    expect(await q(user(await getAdmin()), "select id from public.provider_profiles where id = $1", [id])).toHaveLength(1);
  });

  it("protects verification document metadata and storage objects", async () => {
    const p1 = await createVerifiedProvider("Docs Owner");
    const p2 = await createVerifiedProvider("Docs Snooper");
    const outsider = await createUser();
    await rejects(q(anon, "select * from public.provider_verification_documents"), "permission denied");
    expect(
      await q(user(p2.ownerId), "select * from public.provider_verification_documents where provider_id = $1", [p1.providerId]),
    ).toHaveLength(0);
    expect(
      await q(user(outsider.id), "select * from public.provider_verification_documents where provider_id = $1", [p1.providerId]),
    ).toHaveLength(0);

    // Insert a document metadata row into another provider's folder: denied.
    await rejects(
      q(
        user(p2.ownerId),
        `insert into public.provider_verification_documents (provider_id, document_type, storage_path, original_filename, mime_type, size_bytes)
         values ($1, 'other', $2 || '/x.pdf', 'x.pdf', 'application/pdf', 10)`,
        [p1.providerId, p1.providerId],
      ),
      "row-level security",
    );

    // Storage: upload into own folder allowed; into another provider's folder denied.
    await q(
      user(p1.ownerId),
      "insert into storage.objects (bucket_id, name) values ('verification-documents', $1 || '/doc.pdf')",
      [p1.providerId],
    );
    await rejects(
      q(user(p2.ownerId), "insert into storage.objects (bucket_id, name) values ('verification-documents', $1 || '/evil.pdf')", [
        p1.providerId,
      ]),
      "row-level security",
    );
    const visibleTo = async (actor: ReturnType<typeof user> | typeof anon) =>
      q(actor, "select name from storage.objects where bucket_id = 'verification-documents' and name = $1 || '/doc.pdf'", [
        p1.providerId,
      ]);
    expect(await visibleTo(anon)).toHaveLength(0);
    expect(await visibleTo(user(p2.ownerId))).toHaveLength(0);
    expect(await visibleTo(user(outsider.id))).toHaveLength(0);
    expect(await visibleTo(user(p1.ownerId))).toHaveLength(1);
    expect(await visibleTo(user(await getAdmin()))).toHaveLength(1);
  });

  it("prevents uploading listing media for another provider's experience", async () => {
    const p1 = await createVerifiedProvider("Media Owner");
    const p2 = await createVerifiedProvider("Media Intruder");
    const { experienceId } = await createPublishedExperience(p1);
    await rejects(
      q(user(p2.ownerId), "insert into storage.objects (bucket_id, name) values ('experience-media', $1 || '/' || $2 || '/x.jpg')", [
        p2.providerId,
        experienceId,
      ]),
      "row-level security",
    );
    await rejects(
      q(
        user(p2.ownerId),
        `insert into public.experience_images (experience_id, storage_path, alt_text, rights_confirmed)
         values ($1, $2 || '/' || $3 || '/x.jpg', 'Injected', true)`,
        [experienceId, p2.providerId, experienceId],
      ),
      "row-level security",
    );
  });
});

describe("listings", () => {
  it("stops a provider from editing another provider's listing", async () => {
    const p1 = await createVerifiedProvider("Listing Owner");
    const p2 = await createVerifiedProvider("Listing Intruder");
    const { experienceId } = await createPublishedExperience(p1);
    const updated = await q(user(p2.ownerId), "update public.experiences set title = 'Hijacked listing' where id = $1 returning id", [
      experienceId,
    ]);
    expect(updated).toHaveLength(0);
    await rejects(q(user(p2.ownerId), "select public.set_experience_state($1, 'archive')", [experienceId]), "HK_NOT_FOUND");
    const deleted = await q(user(p2.ownerId), "delete from public.experiences where id = $1 returning id", [experienceId]);
    expect(deleted).toHaveLength(0);
  });

  it("does not let providers set status or publish directly", async () => {
    const p = await createVerifiedProvider("Status Setter");
    const [cat] = await setup<{ id: string }>("select id from public.experience_categories limit 1");
    await rejects(
      q(
        user(p.ownerId),
        `insert into public.experiences (provider_id, county_code, category_id, slug, title, price_minor, duration_minutes, max_participants, status)
         values ($1, 47, $2, 'status-attempt', 'Status attempt', 1000, 60, 4, 'published')`,
        [p.providerId, cat.id],
      ),
      "permission denied",
    );
    const { experienceId } = await createPublishedExperience(p);
    await rejects(q(user(p.ownerId), "update public.experiences set status = 'published' where id = $1", [experienceId]), "permission denied");
    await rejects(q(user(p.ownerId), "update public.experiences set published_at = now() where id = $1", [experienceId]), "permission denied");
  });

  it("does not let a customer create listings", async () => {
    const c = await createUser();
    const p = await createVerifiedProvider("Someone Else");
    const [cat] = await setup<{ id: string }>("select id from public.experience_categories limit 1");
    await rejects(
      q(
        user(c.id),
        `insert into public.experiences (provider_id, county_code, category_id, slug, title, price_minor, duration_minutes, max_participants)
         values ($1, 47, $2, 'customer-attempt', 'Customer attempt', 1000, 60, 4)`,
        [p.providerId, cat.id],
      ),
      "row-level security",
    );
  });

  it("sends an approved listing back to review when its content changes, hiding it publicly", async () => {
    const p = await createVerifiedProvider("Re-review");
    const { experienceId } = await createPublishedExperience(p);
    expect(await q(anon, "select id from public.experiences where id = $1", [experienceId])).toHaveLength(1);
    await q(user(p.ownerId), "update public.experiences set price_minor = 1 where id = $1", [experienceId]);
    const [row] = await setup<{ status: string }>("select status from public.experiences where id = $1", [experienceId]);
    expect(row.status).toBe("pending_review");
    expect(await q(anon, "select id from public.experiences where id = $1", [experienceId])).toHaveLength(0);
  });

  it("hides listings when their provider is suspended", async () => {
    const p = await createVerifiedProvider("Suspended Provider");
    const { experienceId } = await createPublishedExperience(p);
    await q(user(await getAdmin()), "select public.admin_review_provider($1, 'suspend', 'Safety complaint under review')", [
      p.providerId,
    ]);
    expect(await q(anon, "select id from public.experiences where id = $1", [experienceId])).toHaveLength(0);
    expect(await q(anon, "select id from public.experience_images where experience_id = $1", [experienceId])).toHaveLength(0);
  });
});

describe("bookings and money", () => {
  beforeAll(() => ensureDefaultCommission());

  it("stops customers seeing or changing other customers' bookings", async () => {
    const p = await createVerifiedProvider("Booking Privacy");
    const { experienceId } = await createPublishedExperience(p);
    const alice = await createUser();
    const bob = await createUser();
    const bookingId = await book(alice.id, experienceId, await departure(12));

    expect(await q(user(bob.id), "select id from public.bookings where id = $1", [bookingId])).toHaveLength(0);
    await rejects(q(user(bob.id), "select public.cancel_booking($1, 'not mine')", [bookingId]), "HK_NOT_FOUND");
    await rejects(q(user(bob.id), "select * from public.begin_payment($1)", [bookingId]), "HK_NOT_FOUND");
    await rejects(q(user(alice.id), "update public.bookings set status = 'confirmed' where id = $1", [bookingId]), "permission denied");
    await rejects(q(user(alice.id), "update public.bookings set total_minor = 1 where id = $1", [bookingId]), "permission denied");
    await rejects(
      q(user(alice.id), "insert into public.payments (booking_id, reference, amount_minor, currency, status) values ($1, 'HKP_' || md5('x'), 1, 'KES', 'succeeded')", [
        bookingId,
      ]),
      "permission denied",
    );
    expect(await q(user(alice.id), "select id from public.bookings where id = $1", [bookingId])).toHaveLength(1);
  });

  it("scopes provider booking access to their own listings", async () => {
    const p1 = await createVerifiedProvider("Provider A Bookings");
    const p2 = await createVerifiedProvider("Provider B Bookings");
    const { experienceId } = await createPublishedExperience(p1);
    const guest = await createUser();
    const bookingId = await book(guest.id, experienceId, await departure(13));
    expect(await q(user(p1.ownerId), "select id from public.bookings where id = $1", [bookingId])).toHaveLength(1);
    expect(await q(user(p2.ownerId), "select id from public.bookings where id = $1", [bookingId])).toHaveLength(0);
    await rejects(q(user(p2.ownerId), "select public.provider_cancel_booking($1, 'not my listing')", [bookingId]), "HK_NOT_FOUND");
  });

  it("does not let clients apply payment results or read webhook events", async () => {
    const guest = await createUser();
    await rejects(
      q(user(guest.id), "select public.apply_payment_result('HKP_x', 'succeeded', 1, 'KES')"),
      "permission denied",
    );
    await rejects(q(anon, "select public.apply_payment_result('HKP_x', 'succeeded', 1, 'KES')"), "permission denied");
    await rejects(q(user(guest.id), "select public.record_payment_event('paystack', 'k', 'charge.success', null, '{}')"), "permission denied");
    expect(await q(user(guest.id), "select * from public.payment_events")).toHaveLength(0);
    await rejects(q(anon, "select * from public.payment_events"), "permission denied");
    await rejects(q(anon, "select * from public.bookings"), "permission denied");
    await rejects(q(anon, "select * from public.payments"), "permission denied");
  });

  it("restricts payouts to the provider and admins, and payout changes to admins", async () => {
    const p = await createVerifiedProvider("Payout Privacy");
    await rejects(q(user(p.ownerId), "select public.admin_create_payout($1, 'KES')", [p.providerId]), "HK_FORBIDDEN");
    const other = await createVerifiedProvider("Payout Peeker");
    await rejects(q(user(other.ownerId), "select * from public.provider_earnings_summary($1)", [p.providerId]), "HK_FORBIDDEN");
  });
});

describe("admin-only data", () => {
  it("rejects admin functions and audit access for non-admins", async () => {
    const u = await createUser();
    for (const sql of [
      "select public.admin_metrics()",
      "select * from public.admin_list_users()",
      "select public.admin_set_commission_rule('default', 0)",
      "select public.admin_set_site_setting('x', '1'::jsonb)",
    ]) {
      await rejects(q(user(u.id), sql), "HK_FORBIDDEN");
    }
    expect(await q(user(u.id), "select * from public.audit_logs")).toHaveLength(0);
    expect(await q(user(u.id), "select * from public.newsletter_subscriptions")).toHaveLength(0);
  });

  it("keeps the audit log append-only, even for admins", async () => {
    const admin = await getAdmin();
    await q(user(admin), "select public.admin_set_site_setting('support_email', '\"help@example.test\"'::jsonb, true)");
    await rejects(q(service, "update public.audit_logs set action = 'tampered'"), "append-only");
    await rejects(q(service, "delete from public.audit_logs"), "append-only");
  });

  it("lets admins read the audit log", async () => {
    const admin = await getAdmin();
    const rows = await q(user(admin), "select action from public.audit_logs limit 5");
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("support and favourites", () => {
  it("derives staff flag from role and isolates tickets", async () => {
    const a = await createUser();
    const b = await createUser();
    const [ticket] = await q<{ id: string }>(
      user(a.id),
      "insert into public.support_tickets (user_id, subject, category) values ($1, 'Help please', 'other') returning id",
      [a.id],
    );
    await rejects(
      q(user(a.id), "insert into public.support_messages (ticket_id, body, is_staff) values ($1, 'hi', true)", [ticket.id]),
      "permission denied",
    );
    await q(user(a.id), "insert into public.support_messages (ticket_id, body) values ($1, 'Hello')", [ticket.id]);
    const [msg] = await setup<{ is_staff: boolean; author_id: string }>(
      "select is_staff, author_id from public.support_messages where ticket_id = $1",
      [ticket.id],
    );
    expect(msg).toEqual({ is_staff: false, author_id: a.id });
    await rejects(
      q(user(b.id), "insert into public.support_messages (ticket_id, body) values ($1, 'Intrusion')", [ticket.id]),
      "row-level security",
    );
    expect(await q(user(b.id), "select * from public.support_tickets where id = $1", [ticket.id])).toHaveLength(0);
    // Customers can close but not otherwise change status.
    await rejects(
      q(user(a.id), "update public.support_tickets set status = 'resolved' where id = $1", [ticket.id]),
      "row-level security",
    );
    await q(user(a.id), "update public.support_tickets set status = 'closed' where id = $1", [ticket.id]);
  });

  it("only allows favouriting public listings, for yourself", async () => {
    const a = await createUser();
    const b = await createUser();
    const p = await createVerifiedProvider("Favourites");
    const { experienceId } = await createPublishedExperience(p);
    await q(user(a.id), "insert into public.favorites (user_id, experience_id) values ($1, $2)", [a.id, experienceId]);
    await rejects(
      q(user(a.id), "insert into public.favorites (user_id, experience_id) values ($1, $2)", [b.id, experienceId]),
      "row-level security",
    );
    expect(await q(user(b.id), "select * from public.favorites where user_id = $1", [a.id])).toHaveLength(0);
  });
});

describe("transaction helper sanity", () => {
  it("runs as the requested role", async () => {
    const u = await createUser();
    const [row] = await as(user(u.id), async (c) => (await c.query("select current_user, auth.uid() as uid")).rows);
    expect(row.current_user).toBe("authenticated");
    expect(row.uid).toBe(u.id);
  });
});
