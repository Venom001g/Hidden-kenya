/**
 * Database integration-test helpers.
 *
 * Every query in a test runs as a real Postgres role (anon / authenticated / service_role)
 * with Supabase-style JWT claims, so Row Level Security and column privileges are
 * exercised exactly as the Supabase Data API would exercise them.
 *
 * All records are created in the dedicated local test database (TEST_DATABASE_URL),
 * which is dropped and recreated before each run.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for database tests (see docs/testing.md).");
}
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  throw new Error("Database tests only run against a local database.");
}

export const pool = new pg.Pool({ connectionString: url, max: 20 });

type Role = "anon" | "authenticated" | "service_role";

export type Actor = { role: Role; userId?: string };
export const anon: Actor = { role: "anon" };
export const service: Actor = { role: "service_role" };
export const user = (userId: string): Actor => ({ role: "authenticated", userId });

/** Runs fn inside a transaction as the given actor, then commits. */
export async function as<T>(actor: Actor, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${actor.role}`);
    const claims = actor.userId ? { sub: actor.userId, role: actor.role } : { role: actor.role };
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Single query as an actor. */
export async function q<R extends pg.QueryResultRow = pg.QueryResultRow>(
  actor: Actor,
  sql: string,
  params: unknown[] = [],
): Promise<R[]> {
  return as(actor, async (c) => (await c.query<R>(sql, params)).rows);
}

/** Superuser query for test setup only (bypasses RLS). */
export async function setup<R extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<R[]> {
  return (await pool.query<R>(sql, params)).rows;
}

export async function createUser(name = "Test Guest", metadata: Record<string, unknown> = {}) {
  const id = randomUUID();
  const email = `${id.slice(0, 8)}@example.test`;
  await setup("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
    id,
    email,
    JSON.stringify({ full_name: name, ...metadata }),
  ]);
  return { id, email };
}

let adminId: string | null = null;
export async function getAdmin() {
  if (adminId) return adminId;
  const existing = await setup<{ user_id: string }>(
    "select user_id from public.user_roles where role = 'admin' limit 1",
  );
  if (existing[0]) {
    adminId = existing[0].user_id;
    return adminId;
  }
  const admin = await createUser("Test Admin");
  await q(service, "select public.bootstrap_first_admin($1)", [admin.id]);
  adminId = admin.id;
  return adminId;
}

export async function ensureDefaultCommission(rateBps = 1000) {
  const admin = await getAdmin();
  const active = await setup(
    "select 1 from public.commission_rules where scope = 'default' and active_from <= now() and (active_until is null or active_until > now())",
  );
  if (active.length === 0) {
    await q(user(admin), "select public.admin_set_commission_rule('default', $1)", [rateBps]);
  }
}

/** Creates a provider through the real onboarding + verification functions. */
export async function createVerifiedProvider(name = "Test Provider") {
  const owner = await createUser(`${name} Owner`);
  const admin = await getAdmin();
  const [{ become_provider: providerId }] = await q<{ become_provider: string }>(
    user(owner.id),
    "select public.become_provider($1)",
    [name],
  );
  await q(
    user(owner.id),
    `update public.provider_profiles set description = $2, operating_areas = 'Test area'
       where id = $1`,
    [providerId, "A provider used only by automated tests. ".repeat(3)],
  );
  await q(
    user(owner.id),
    `update public.provider_private_details set contact_phone = '+254700000000', legal_name = 'Test Ltd'
       where provider_id = $1`,
    [providerId],
  );
  const [cat] = await setup<{ id: string }>("select id from public.experience_categories order by sort_order limit 1");
  await q(user(owner.id), "insert into public.provider_service_categories (provider_id, category_id) values ($1, $2)", [
    providerId,
    cat.id,
  ]);
  const [doc] = await q<{ id: string }>(
    user(owner.id),
    `insert into public.provider_verification_documents
       (provider_id, document_type, storage_path, original_filename, mime_type, size_bytes)
     values ($1, 'tourism_licence', $2 || '/' || gen_random_uuid() || '.pdf', 'licence.pdf', 'application/pdf', 1000)
     returning id`,
    [providerId, providerId],
  );
  await q(user(owner.id), "select public.submit_provider_for_verification()");
  await q(user(admin), "select public.admin_review_document($1, 'accepted', 'ok')", [doc.id]);
  await q(user(admin), "select public.admin_review_provider($1, 'verify', '')", [providerId]);
  return { ownerId: owner.id, providerId };
}

export type ExperienceOptions = {
  capacity?: number;
  maxParticipants?: number;
  minParticipants?: number;
  priceMinor?: number;
  pricingModel?: "per_person" | "per_group";
  bookingMode?: "instant" | "request";
  leadTimeHours?: number;
  cancellationPolicy?: "flexible" | "moderate" | "strict";
  countyCode?: number;
  categorySlug?: string;
  title?: string;
  currency?: "KES" | "USD";
  durationMinutes?: number;
  accessibility?: string[];
};

/** Creates a published experience through the real provider + moderation functions. */
export async function createPublishedExperience(
  provider: { ownerId: string; providerId: string },
  opts: ExperienceOptions = {},
) {
  const admin = await getAdmin();
  const [cat] = await setup<{ id: string }>("select id from public.experience_categories where slug = $1", [
    opts.categorySlug ?? "wildlife-safari",
  ]);
  const slug = `test-${randomUUID().slice(0, 12)}`;
  const [exp] = await q<{ id: string }>(
    user(provider.ownerId),
    `insert into public.experiences (
       provider_id, county_code, category_id, slug, title, summary, description, pricing_model,
       price_minor, currency, duration_minutes, min_participants, max_participants,
       meeting_point_name, meeting_point_instructions, booking_mode, lead_time_hours, cancellation_policy,
       accessibility_features)
     values ($1, $2, $3, $4, $5, 'A test summary for automated tests only.', $6, $7, $8, $9, $10, $11, $12,
             'Test meeting point', 'Meet at the test meeting point by the entrance.', $13, $14, $15, $16)
     returning id`,
    [
      provider.providerId,
      opts.countyCode ?? 33,
      cat.id,
      slug,
      opts.title ?? "Automated test experience",
      "This description exists only inside the automated test database. ".repeat(4),
      opts.pricingModel ?? "per_person",
      opts.priceMinor ?? 500000,
      opts.currency ?? "KES",
      opts.durationMinutes ?? 180,
      opts.minParticipants ?? 1,
      opts.maxParticipants ?? 10,
      opts.bookingMode ?? "instant",
      opts.leadTimeHours ?? 0,
      opts.cancellationPolicy ?? "moderate",
      opts.accessibility ?? [],
    ],
  );
  await q(
    user(provider.ownerId),
    `insert into public.experience_images (experience_id, storage_path, alt_text, rights_confirmed)
     values ($1, $2 || '/' || $3 || '/cover.jpg', 'Test image', true)`,
    [exp.id, provider.providerId, exp.id],
  );
  // Daily departures at 09:00 Nairobi time, starting today.
  await q(
    user(provider.ownerId),
    `insert into public.experience_availability (experience_id, weekdays, start_time, capacity, valid_from)
     values ($1, '{1,2,3,4,5,6,7}', '09:00', $2, (now() at time zone 'Africa/Nairobi')::date)`,
    [exp.id, opts.capacity ?? 6],
  );
  await q(user(provider.ownerId), "select public.submit_experience_for_review($1)", [exp.id]);
  await q(user(admin), "select public.admin_moderate_experience($1, 'approve', '')", [exp.id]);
  return { experienceId: exp.id, slug };
}

/** Next 09:00 Nairobi departure at least `daysAhead` days from now. */
export async function departure(daysAhead = 10): Promise<Date> {
  const [row] = await setup<{ ts: Date }>(
    `select (((now() at time zone 'Africa/Nairobi')::date + $1::int) + time '09:00') at time zone 'Africa/Nairobi' as ts`,
    [daysAhead],
  );
  return row.ts;
}

export async function book(
  customerId: string,
  experienceId: string,
  startsAt: Date,
  partySize = 2,
  key: string = randomUUID(),
) {
  const [row] = await q<{ create_booking: string }>(
    user(customerId),
    "select public.create_booking($1, $2, $3, $4, 'Test Guest', 'guest@example.test', '+254700000001', '')",
    [experienceId, startsAt, partySize, key],
  );
  return row.create_booking;
}

export async function payInFull(customerId: string, bookingId: string) {
  const [pay] = await q<{ reference: string; amount_minor: string; currency: string }>(
    user(customerId),
    "select * from public.begin_payment($1)",
    [bookingId],
  );
  const [res] = await q<{ apply_payment_result: string }>(
    service,
    "select public.apply_payment_result($1, 'succeeded', $2, $3, 'tx_test', 'card', 100, now())",
    [pay.reference, pay.amount_minor, pay.currency],
  );
  return { reference: pay.reference, result: res.apply_payment_result };
}

/** Expects a promise to reject with a Postgres error whose message contains `match`. */
export async function rejects(promise: Promise<unknown>, match: string | RegExp) {
  try {
    await promise;
  } catch (error) {
    const message = (error as Error).message;
    if (typeof match === "string" ? message.includes(match) : match.test(message)) return message;
    throw new Error(`Expected error matching ${match}, got: ${message}`);
  }
  throw new Error(`Expected rejection matching ${match}, but it resolved`);
}
