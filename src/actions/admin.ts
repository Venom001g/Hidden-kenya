"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorize } from "@/lib/auth";
import { sendEmail, siteUrl, templates } from "@/lib/email";
import { fail, type ActionResult } from "@/lib/errors";
import { slugify, toMinorUnits } from "@/lib/format";
import { isWithinKenya } from "@/lib/maps";
import { processPhoto } from "@/lib/media-server";
import { notifyBooking } from "@/lib/notifications";
import { getGateway, GatewayError, payoutReference } from "@/lib/payments";
import { processPendingRefunds } from "@/lib/payments/service";
import { auditEvent, validateUpload } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuid = z.uuid();
const notes = z.string().trim().max(2000);

async function admin() {
  const auth = await authorize("admin");
  if (!auth.ok) return { ok: false as const, error: auth.error };
  return { ok: true as const, user: auth.user, db: await createClient() };
}

async function providerEmail(providerId: string) {
  const { data } = await createAdminClient().from("provider_private_details").select("contact_email").eq("provider_id", providerId).maybeSingle();
  return data?.contact_email || null;
}

/* ------------------------------------------------------------------------------------------
 * Providers and documents
 * ---------------------------------------------------------------------------------------- */

const PROVIDER_DECISIONS = { verify: "verified", request_changes: "sent back for changes", reject: "rejected", suspend: "suspended", reinstate: "reinstated" } as const;

export async function reviewProvider(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const p = z
    .object({ providerId: uuid, decision: z.enum(["verify", "request_changes", "reject", "suspend", "reinstate"]), reason: notes })
    .safeParse({ providerId: formData.get("providerId"), decision: formData.get("decision"), reason: formData.get("reason") ?? "" });
  if (!p.success) return { ok: false, error: "Invalid request." };
  const { error } = await ctx.db.rpc("admin_review_provider", { p_provider_id: p.data.providerId, p_decision: p.data.decision, p_notes: p.data.reason });
  if (error) return fail(error);
  const to = await providerEmail(p.data.providerId);
  if (to) {
    await sendEmail({
      to,
      template: "provider_decision",
      content: templates.providerDecision(siteUrl(), { decision: PROVIDER_DECISIONS[p.data.decision], notes: p.data.reason, url: `${siteUrl()}/provider` }),
      dedupeKey: `provider:${p.data.providerId}:${p.data.decision}:${randomUUID()}`,
    });
  }
  revalidatePath(`/admin/providers/${p.data.providerId}`);
  revalidatePath("/admin/providers");
  return { ok: true, message: `Provider ${PROVIDER_DECISIONS[p.data.decision]}.` };
}

export async function reviewDocument(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const p = z
    .object({ documentId: uuid, decision: z.enum(["accepted", "rejected"]), reason: notes })
    .safeParse({ documentId: formData.get("documentId"), decision: formData.get("decision"), reason: formData.get("reason") ?? "" });
  if (!p.success) return { ok: false, error: "Invalid request." };
  const { error } = await ctx.db.rpc("admin_review_document", { p_document_id: p.data.documentId, p_decision: p.data.decision, p_notes: p.data.reason });
  if (error) return fail(error);
  revalidatePath("/admin/providers", "layout");
  return { ok: true, message: p.data.decision === "accepted" ? "Document accepted." : "Document rejected." };
}

/** Issues a 60-second signed URL for a private verification document, and audits the access. */
export async function openDocument(documentId: string): Promise<ActionResult<{ url: string }>> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  if (!uuid.safeParse(documentId).success) return { ok: false, error: "Invalid document." };
  const { data: doc } = await ctx.db.from("provider_verification_documents").select("storage_path, provider_id").eq("id", documentId).maybeSingle();
  if (!doc) return { ok: false, error: "Document not found." };
  const { data, error } = await createAdminClient().storage.from("verification-documents").createSignedUrl(doc.storage_path, 60);
  if (error || !data) return { ok: false, error: "Could not open the document." };
  await auditEvent(ctx.user.id, "document.viewed", "provider_document", documentId, { provider_id: doc.provider_id });
  return { ok: true, data: { url: data.signedUrl } };
}

/* ------------------------------------------------------------------------------------------
 * Listings
 * ---------------------------------------------------------------------------------------- */

const LISTING_DECISIONS = { approve: "approved", request_changes: "sent back for changes", reject: "rejected", suspend: "suspended", archive: "archived", reinstate: "reinstated" } as const;

export async function moderateListing(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const p = z
    .object({ experienceId: uuid, decision: z.enum(["approve", "request_changes", "reject", "suspend", "archive", "reinstate"]), reason: notes })
    .safeParse({ experienceId: formData.get("experienceId"), decision: formData.get("decision"), reason: formData.get("reason") ?? "" });
  if (!p.success) return { ok: false, error: "Invalid request." };
  const { error } = await ctx.db.rpc("admin_moderate_experience", { p_experience_id: p.data.experienceId, p_decision: p.data.decision, p_notes: p.data.reason });
  if (error) return fail(error);
  const { data: exp } = await ctx.db.from("experiences").select("title, provider_id").eq("id", p.data.experienceId).single();
  if (exp) {
    const to = await providerEmail(exp.provider_id);
    if (to) {
      await sendEmail({
        to,
        template: "listing_decision",
        content: templates.listingDecision(siteUrl(), {
          title: exp.title,
          decision: LISTING_DECISIONS[p.data.decision],
          notes: p.data.reason,
          url: `${siteUrl()}/provider/listings/${p.data.experienceId}`,
        }),
        dedupeKey: `listing:${p.data.experienceId}:${p.data.decision}:${randomUUID()}`,
      });
    }
  }
  revalidatePath("/admin/listings", "layout");
  revalidatePath("/experiences", "layout");
  return { ok: true, message: `Listing ${LISTING_DECISIONS[p.data.decision]}.` };
}

/* ------------------------------------------------------------------------------------------
 * Destinations (genuine, sourced records only)
 * ---------------------------------------------------------------------------------------- */

const destinationSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(2, "Enter a name.").max(120),
    countyCode: z.coerce.number().int().min(1, "Choose a county.").max(47),
    summary: z.string().trim().max(300),
    description: z.string().trim().max(10000),
    travelInformation: z.string().trim().max(5000),
    latitude: z.string().trim(),
    longitude: z.string().trim(),
    locationSource: z.string().trim().max(300),
    contentSourceName: z.string().trim().max(200),
    contentSourceUrl: z.union([z.literal(""), z.url({ protocol: /^https?$/ })]),
    contentRetrievedOn: z.union([z.literal(""), z.iso.date()]),
    status: z.enum(["draft", "published", "archived"]),
  })
  .superRefine((v, ctx) => {
    const hasLat = v.latitude !== "";
    const hasLng = v.longitude !== "";
    if (hasLat !== hasLng) ctx.addIssue({ code: "custom", path: ["longitude"], message: "Enter both coordinates or neither." });
    if (hasLat && hasLng) {
      const lat = Number(v.latitude);
      const lng = Number(v.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isWithinKenya({ lat, lng })) {
        ctx.addIssue({ code: "custom", path: ["latitude"], message: "Coordinates must be decimal degrees within Kenya." });
      }
      if (!v.locationSource) ctx.addIssue({ code: "custom", path: ["locationSource"], message: "Record where the coordinates came from." });
    }
    if (v.status === "published") {
      if (v.description.length < 100) ctx.addIssue({ code: "custom", path: ["description"], message: "Published destinations need a description of at least 100 characters." });
      if (!v.contentSourceName) ctx.addIssue({ code: "custom", path: ["contentSourceName"], message: "Record the source of this information before publishing." });
    }
  });

export async function saveDestination(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const raw = Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
  const p = destinationSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form." };
  const v = p.data;
  const row = {
    name: v.name,
    county_code: v.countyCode,
    summary: v.summary,
    description: v.description,
    travel_information: v.travelInformation,
    latitude: v.latitude ? Number(v.latitude) : null,
    longitude: v.longitude ? Number(v.longitude) : null,
    location_source: v.locationSource,
    content_source_name: v.contentSourceName,
    content_source_url: v.contentSourceUrl || null,
    content_retrieved_on: v.contentRetrievedOn || null,
    status: v.status,
    published_at: v.status === "published" ? new Date().toISOString() : null,
  };
  if (v.id && uuid.safeParse(v.id).success) {
    const { data: existing } = await ctx.db.from("destinations").select("published_at").eq("id", v.id).single();
    const { error } = await ctx.db.from("destinations").update({ ...row, published_at: existing?.published_at ?? row.published_at }).eq("id", v.id);
    if (error) return fail(error);
    await auditEvent(ctx.user.id, "destination.updated", "destination", v.id, { status: v.status });
    revalidatePath("/admin/destinations", "layout");
    revalidatePath("/destinations", "layout");
    return { ok: true, message: "Destination saved." };
  }
  const slug = `${slugify(v.name) || "destination"}`;
  const { data: clash } = await ctx.db.from("destinations").select("id").eq("slug", slug).maybeSingle();
  const { data, error } = await ctx.db
    .from("destinations")
    .insert({ ...row, slug: clash ? `${slug}-${randomUUID().slice(0, 4)}` : slug, created_by: ctx.user.id })
    .select("id")
    .single();
  if (error) return fail(error);
  await auditEvent(ctx.user.id, "destination.created", "destination", data.id, { status: v.status });
  revalidatePath("/admin/destinations", "layout");
  revalidatePath("/destinations", "layout");
  redirect(`/admin/destinations/${data.id}`);
}

export async function uploadDestinationImage(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const p = z
    .object({
      destinationId: uuid,
      altText: z.string().trim().min(3, "Describe the photo.").max(250),
      credit: z.string().trim().min(2, "Credit the photographer or owner.").max(200),
      licence: z.string().trim().min(2, "Record the licence (e.g. “CC BY 4.0” or “Owned by Hidden Kenya”).").max(120),
      sourceUrl: z.union([z.literal(""), z.url()]),
    })
    .safeParse({
      destinationId: formData.get("destinationId"),
      altText: formData.get("altText"),
      credit: formData.get("credit"),
      licence: formData.get("licence"),
      sourceUrl: formData.get("sourceUrl") ?? "",
    });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form." };
  const checked = await validateUpload(formData.get("file") as File | null, ["image/jpeg", "image/png", "image/webp"], 5 * 1024 * 1024);
  if (!checked.ok) return checked;
  let photo;
  try {
    photo = await processPhoto(checked.bytes);
  } catch (e) {
    return { ok: false, error: (e as Error).message.includes("pixels") ? (e as Error).message : "That file could not be read as a photo." };
  }
  const path = `${p.data.destinationId}/${randomUUID()}.webp`;
  const { error: upErr } = await ctx.db.storage.from("destination-media").upload(path, photo.data, { contentType: "image/webp", cacheControl: "31536000" });
  if (upErr) return fail(upErr, "Upload failed.");
  const { count } = await ctx.db.from("destination_images").select("id", { count: "exact", head: true }).eq("destination_id", p.data.destinationId);
  const { error } = await ctx.db.from("destination_images").insert({
    destination_id: p.data.destinationId,
    storage_path: path,
    alt_text: p.data.altText,
    credit: p.data.credit,
    licence: p.data.licence,
    source_url: p.data.sourceUrl || null,
    width: photo.width,
    height: photo.height,
    position: count ?? 0,
  });
  if (error) {
    await ctx.db.storage.from("destination-media").remove([path]);
    return fail(error);
  }
  revalidatePath(`/admin/destinations/${p.data.destinationId}`);
  return { ok: true, message: "Photo added." };
}

export async function deleteDestinationImage(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const id = uuid.safeParse(formData.get("imageId"));
  if (!id.success) return { ok: false, error: "Invalid photo." };
  const { data } = await ctx.db.from("destination_images").delete().eq("id", id.data).select("storage_path, destination_id").maybeSingle();
  if (!data) return { ok: false, error: "Photo not found." };
  await ctx.db.storage.from("destination-media").remove([data.storage_path]);
  revalidatePath(`/admin/destinations/${data.destination_id}`);
  return { ok: true, message: "Photo removed." };
}

/* ------------------------------------------------------------------------------------------
 * Categories, settings, commission, featured listings
 * ---------------------------------------------------------------------------------------- */

export async function saveCategory(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const p = z
    .object({
      id: z.string().optional(),
      name: z.string().trim().min(2).max(60),
      description: z.string().trim().max(300),
      sortOrder: z.coerce.number().int().min(0).max(1000),
      isActive: z.boolean(),
    })
    .safeParse({ id: formData.get("id") ?? undefined, name: formData.get("name"), description: formData.get("description") ?? "", sortOrder: formData.get("sortOrder") ?? 0, isActive: formData.get("isActive") === "on" });
  if (!p.success) return { ok: false, error: "Enter a name (2–60 characters)." };
  const row = { name: p.data.name, description: p.data.description, sort_order: p.data.sortOrder, is_active: p.data.isActive };
  const { error } =
    p.data.id && uuid.safeParse(p.data.id).success
      ? await ctx.db.from("experience_categories").update(row).eq("id", p.data.id)
      : await ctx.db.from("experience_categories").insert({ ...row, slug: slugify(p.data.name) });
  if (error) return fail(error, error.code === "23505" ? "A category with that name already exists." : undefined);
  await auditEvent(ctx.user.id, "category.saved", "category", p.data.id ?? null, { name: p.data.name });
  updateTag("taxonomy");
  revalidatePath("/admin/categories");
  return { ok: true, message: "Category saved." };
}

export async function setCommission(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const p = z
    .object({
      scope: z.enum(["default", "category", "provider"]),
      percent: z.string().trim().regex(/^\d{1,2}(\.\d{1,2})?$/, "Enter a percentage such as 12 or 12.5."),
      categoryId: z.string().optional(),
      providerId: z.string().optional(),
      note: z.string().trim().max(300),
    })
    .safeParse({
      scope: formData.get("scope"),
      percent: formData.get("percent"),
      categoryId: formData.get("categoryId") || undefined,
      providerId: formData.get("providerId") || undefined,
      note: formData.get("note") ?? "",
    });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form." };
  const bps = Math.round(Number(p.data.percent) * 100);
  if (bps > 5000) return { ok: false, error: "Commission cannot exceed 50%." };
  const { error } = await ctx.db.rpc("admin_set_commission_rule", {
    p_scope: p.data.scope,
    p_rate_bps: bps,
    p_category_id: p.data.scope === "category" ? (p.data.categoryId ?? null) : null,
    p_provider_id: p.data.scope === "provider" ? (p.data.providerId ?? null) : null,
    p_note: p.data.note,
  });
  if (error) return fail(error);
  revalidatePath("/admin/settings");
  return { ok: true, message: `Commission set to ${p.data.percent}% for new bookings.` };
}

export async function endCommission(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const id = uuid.safeParse(formData.get("ruleId"));
  if (!id.success) return { ok: false, error: "Invalid rule." };
  const { error } = await ctx.db.rpc("admin_end_commission_rule", { p_rule_id: id.data });
  if (error) return fail(error);
  revalidatePath("/admin/settings");
  return { ok: true, message: "Rule ended." };
}

const SETTINGS = {
  support_email: { schema: z.string().trim().toLowerCase().pipe(z.union([z.literal(""), z.email()])), isPublic: true, description: "Public support email shown in the footer." },
  payment_hold_minutes: { schema: z.coerce.number().int().min(10).max(120), isPublic: false, description: "Minutes an instant booking is held while the guest pays." },
  provider_response_hours: { schema: z.coerce.number().int().min(2).max(96), isPublic: false, description: "Hours a host has to answer a booking request." },
  request_payment_hold_hours: { schema: z.coerce.number().int().min(1).max(72), isPublic: false, description: "Hours a guest has to pay after a host accepts a request." },
  review_window_days: { schema: z.coerce.number().int().min(7).max(365), isPublic: false, description: "Days after completion during which a guest can review." },
} as const;

export async function saveSetting(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const key = String(formData.get("key") ?? "") as keyof typeof SETTINGS;
  const def = SETTINGS[key];
  if (!def) return { ok: false, error: "Unknown setting." };
  const value = def.schema.safeParse(formData.get("value"));
  if (!value.success) return { ok: false, error: "Enter a valid value." };
  const { error } = await ctx.db.rpc("admin_set_site_setting", {
    p_key: key,
    p_value: value.data as never,
    p_is_public: def.isPublic,
    p_description: def.description,
  });
  if (error) return fail(error);
  updateTag("settings");
  revalidatePath("/admin/settings");
  return { ok: true, message: "Setting saved." };
}

export async function setFeatured(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const ids = formData.getAll("experienceId").map(String).filter(Boolean);
  const sponsored = new Set(formData.getAll("sponsored").map(String));
  if (!z.array(uuid).max(8).safeParse(ids).success) return { ok: false, error: "Choose up to 8 published listings." };
  const value = ids.map((id) => ({ id, sponsored: sponsored.has(id) }));
  const { error } = await ctx.db.rpc("admin_set_site_setting", {
    p_key: "featured_experiences",
    p_value: value as never,
    p_is_public: true,
    p_description: "Homepage selection. Sponsored entries are labelled.",
  });
  if (error) return fail(error);
  revalidatePath("/");
  revalidatePath("/admin/settings");
  return { ok: true, message: "Homepage selection saved." };
}

/* ------------------------------------------------------------------------------------------
 * Users
 * ---------------------------------------------------------------------------------------- */

export async function setAdminRole(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const p = z.object({ userId: uuid, grant: z.enum(["true", "false"]) }).safeParse({ userId: formData.get("userId"), grant: formData.get("grant") });
  if (!p.success) return { ok: false, error: "Invalid request." };
  const { error } = await ctx.db.rpc("admin_set_admin_role", { p_user_id: p.data.userId, p_grant: p.data.grant === "true" });
  if (error) return fail(error);
  revalidatePath("/admin/users");
  return { ok: true, message: p.data.grant === "true" ? "Administrator access granted." : "Administrator access removed." };
}

export async function setUserActive(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const p = z
    .object({ userId: uuid, active: z.enum(["true", "false"]), reason: notes })
    .safeParse({ userId: formData.get("userId"), active: formData.get("active"), reason: formData.get("reason") ?? "" });
  if (!p.success) return { ok: false, error: "Invalid request." };
  const active = p.data.active === "true";
  const { error } = await ctx.db.rpc("admin_set_user_active", { p_user_id: p.data.userId, p_active: active, p_reason: p.data.reason });
  if (error) return fail(error);
  // Also block sign-in at the auth layer while deactivated.
  await createAdminClient().auth.admin.updateUserById(p.data.userId, { ban_duration: active ? "none" : "876000h" });
  revalidatePath("/admin/users");
  return { ok: true, message: active ? "Account reactivated." : "Account deactivated and signed out." };
}

/* ------------------------------------------------------------------------------------------
 * Bookings, refunds and payouts
 * ---------------------------------------------------------------------------------------- */

export async function adminCancelBooking(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const p = z
    .object({ bookingId: uuid, reason: z.string().trim().min(5, "Record a reason.").max(1000), refund: z.string().trim(), currency: z.string() })
    .safeParse({ bookingId: formData.get("bookingId"), reason: formData.get("reason"), refund: formData.get("refund") ?? "", currency: formData.get("currency") ?? "KES" });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid request." };
  const refundMinor = p.data.refund === "" ? null : toMinorUnits(p.data.refund, p.data.currency);
  if (p.data.refund !== "" && refundMinor === null) return { ok: false, error: "Enter a valid refund amount." };
  const { data, error } = await ctx.db.rpc("admin_cancel_booking", { p_booking_id: p.data.bookingId, p_reason: p.data.reason, p_refund_minor: refundMinor });
  if (error) return fail(error);
  await notifyBooking(p.data.bookingId, "cancelled");
  if (data === "refund_pending") await processPendingRefunds(p.data.bookingId);
  revalidatePath(`/admin/bookings/${p.data.bookingId}`);
  return { ok: true, message: data === "refund_pending" ? "Cancelled; refund submitted." : "Cancelled." };
}

export async function retryRefund(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const id = uuid.safeParse(formData.get("refundId"));
  if (!id.success) return { ok: false, error: "Invalid refund." };
  const db = createAdminClient();
  const { data: r } = await db.from("refunds").update({ status: "pending", failure_reason: "" }).eq("id", id.data).eq("status", "failed").select("booking_id").maybeSingle();
  if (!r) return { ok: false, error: "Only failed refunds can be retried." };
  await auditEvent(ctx.user.id, "refund.retried", "refund", id.data);
  if (!getGateway().isConfigured()) return { ok: false, error: "The payment gateway is not configured; the refund is queued." };
  const res = await processPendingRefunds(r.booking_id);
  revalidatePath("/admin/payments");
  return res.failed ? { ok: false, error: "The gateway rejected the refund again. Check the payment in Paystack." } : { ok: true, message: "Refund resubmitted." };
}

export async function createPayout(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const p = z.object({ providerId: uuid, currency: z.enum(["KES", "USD"]) }).safeParse({ providerId: formData.get("providerId"), currency: formData.get("currency") });
  if (!p.success) return { ok: false, error: "Invalid request." };
  const { error } = await ctx.db.rpc("admin_create_payout", { p_provider_id: p.data.providerId, p_currency: p.data.currency });
  if (error) return fail(error);
  revalidatePath("/admin/payouts");
  return { ok: true, message: "Payout prepared." };
}

export async function updatePayout(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const p = z
    .object({ payoutId: uuid, status: z.enum(["paid", "failed", "cancelled"]), reference: z.string().trim().max(120), reason: z.string().trim().max(300) })
    .safeParse({ payoutId: formData.get("payoutId"), status: formData.get("status"), reference: formData.get("reference") ?? "", reason: formData.get("reason") ?? "" });
  if (!p.success) return { ok: false, error: "Invalid request." };
  // The confirmation dialog collects the transfer reference in its text box ("reason").
  const reference = p.data.reference || (p.data.status === "paid" ? p.data.reason : "");
  const { error } = await ctx.db.rpc("admin_update_payout", {
    p_payout_id: p.data.payoutId,
    p_status: p.data.status,
    p_transfer_reference: reference || null,
    p_failure_reason: p.data.status === "paid" ? null : p.data.reason || null,
  });
  if (error) return fail(error);
  revalidatePath("/admin/payouts");
  return { ok: true, message: "Payout updated." };
}

/** Sends a prepared payout to the provider's M-Pesa via the gateway's transfer API. */
export async function sendPayout(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const id = uuid.safeParse(formData.get("payoutId"));
  if (!id.success) return { ok: false, error: "Invalid payout." };
  const gateway = getGateway();
  if (!gateway.isConfigured()) return { ok: false, error: "The payment gateway is not configured. Pay manually and record the reference." };
  const { data: po } = await ctx.db.from("provider_payouts").select("id, amount_minor, currency, status, provider_id").eq("id", id.data).single();
  if (!po || po.status !== "draft") return { ok: false, error: "Only prepared payouts can be sent." };
  const { data: acct } = await ctx.db.from("provider_payout_accounts").select("gateway_recipient_code").eq("provider_id", po.provider_id).maybeSingle();
  if (!acct) return { ok: false, error: "This host has not added a payout account." };
  const { error: lockErr } = await ctx.db.rpc("admin_update_payout", { p_payout_id: po.id, p_status: "processing" });
  if (lockErr) return fail(lockErr);
  try {
    const t = await gateway.transfer({
      amountMinor: po.amount_minor,
      currency: po.currency,
      recipientCode: acct.gateway_recipient_code,
      reference: payoutReference(po.id),
      reason: "Hidden Kenya payout",
    });
    await auditEvent(ctx.user.id, "payout.sent", "payout", po.id, { status: t.status });
    revalidatePath("/admin/payouts");
    return {
      ok: true,
      message: t.status === "otp" ? "Transfer created but needs OTP approval in the Paystack dashboard." : "Transfer submitted. Status updates when Paystack confirms it.",
    };
  } catch (e) {
    await ctx.db.rpc("admin_update_payout", { p_payout_id: po.id, p_status: "failed", p_failure_reason: e instanceof GatewayError ? e.message.slice(0, 300) : "Transfer request failed" });
    revalidatePath("/admin/payouts");
    return { ok: false, error: e instanceof GatewayError ? e.userMessage : "The transfer could not be created." };
  }
}

/* ------------------------------------------------------------------------------------------
 * Reviews and support
 * ---------------------------------------------------------------------------------------- */

export async function moderateReview(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const p = z
    .object({ reviewId: uuid, status: z.enum(["published", "under_review", "removed"]), reason: notes })
    .safeParse({ reviewId: formData.get("reviewId"), status: formData.get("status"), reason: formData.get("reason") ?? "" });
  if (!p.success) return { ok: false, error: "Invalid request." };
  const { error } = await ctx.db.rpc("admin_moderate_review", { p_review_id: p.data.reviewId, p_status: p.data.status, p_notes: p.data.reason });
  if (error) return fail(error);
  revalidatePath("/admin/reviews");
  return { ok: true, message: "Review updated." };
}

export async function staffReply(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const p = z.object({ ticketId: uuid, body: z.string().trim().min(1).max(5000) }).safeParse({ ticketId: formData.get("ticketId"), body: formData.get("body") });
  if (!p.success) return { ok: false, error: "Write a reply." };
  const { error } = await ctx.db.from("support_messages").insert({ ticket_id: p.data.ticketId, body: p.data.body });
  if (error) return fail(error);
  const { data: t } = await ctx.db.from("support_tickets").select("subject, user_id").eq("id", p.data.ticketId).single();
  if (t) {
    const { data: u } = await createAdminClient().auth.admin.getUserById(t.user_id);
    if (u?.user?.email) {
      await sendEmail({
        to: u.user.email,
        userId: t.user_id,
        template: "support_reply",
        content: templates.supportReply(siteUrl(), { subject: t.subject, url: `${siteUrl()}/account/support/${p.data.ticketId}` }),
        dedupeKey: `support:${p.data.ticketId}:${randomUUID()}`,
        data: { href: `/account/support/${p.data.ticketId}` },
        inApp: true,
      });
    }
  }
  revalidatePath(`/admin/support/${p.data.ticketId}`);
  return { ok: true, message: "Reply sent." };
}

export async function setTicketStatus(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx.ok) return ctx;
  const p = z.object({ ticketId: uuid, status: z.enum(["open", "awaiting_customer", "resolved", "closed"]) }).safeParse({ ticketId: formData.get("ticketId"), status: formData.get("status") });
  if (!p.success) return { ok: false, error: "Invalid request." };
  const { error } = await ctx.db.from("support_tickets").update({ status: p.data.status }).eq("id", p.data.ticketId);
  if (error) return fail(error);
  revalidatePath(`/admin/support/${p.data.ticketId}`);
  return { ok: true, message: "Status updated." };
}
