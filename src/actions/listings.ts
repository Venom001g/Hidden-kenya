"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";
import { slugify } from "@/lib/format";
import { PhotoTooSmallError, processPhoto } from "@/lib/media-server";
import { RATE_LIMITED, rateLimitRequest, validateUpload } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { listingColumns, listingSchema, type ListingInput } from "@/lib/validation/listing";

const uuid = z.uuid();

async function providerOnly() {
  const auth = await authorize("provider");
  if (!auth.ok) return { ok: false as const, error: auth.error };
  if (!auth.user.providerId) return { ok: false as const, error: "Create your host profile first." };
  return { ok: true as const, user: auth.user, providerId: auth.user.providerId };
}

const revalidateListing = (id: string) => {
  revalidatePath("/provider/listings");
  revalidatePath(`/provider/listings/${id}`);
};

export async function createListing(input: ListingInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await providerOnly();
  if (!ctx.ok) return ctx;
  const parsed = listingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const supabase = await createClient();
  const slug = `${slugify(parsed.data.title).slice(0, 80) || "experience"}-${randomUUID().slice(0, 6)}`;
  const { data, error } = await supabase
    .from("experiences")
    .insert({ ...listingColumns(parsed.data), provider_id: ctx.providerId, slug })
    .select("id")
    .single();
  if (error) return fail(error, "We could not create the listing.");
  revalidatePath("/provider/listings");
  return { ok: true, data: { id: data.id } };
}

export async function updateListing(id: string, input: ListingInput): Promise<ActionResult> {
  const ctx = await providerOnly();
  if (!ctx.ok) return ctx;
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid listing." };
  const parsed = listingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("experiences")
    .update(listingColumns(parsed.data))
    .eq("id", id)
    .eq("provider_id", ctx.providerId)
    .select("status")
    .maybeSingle();
  if (error) return fail(error, "We could not save the listing.");
  if (!data) return { ok: false, error: "This listing cannot be edited." };
  revalidateListing(id);
  return {
    ok: true,
    message: data.status === "pending_review" ? "Saved. Because the listing was live, it is back in review before the changes appear." : "Saved.",
  };
}

export async function uploadListingImage(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await providerOnly();
  if (!ctx.ok) return ctx;
  if (!(await rateLimitRequest("upload", ctx.user.id))) return { ok: false, error: RATE_LIMITED };
  const parsed = z
    .object({
      experienceId: uuid,
      altText: z.string().trim().min(3, "Describe the photo for people who cannot see it (3+ characters).").max(250),
      credit: z.string().trim().max(200),
      rights: z.literal("on", { error: "Confirm you own or have permission to use this photo." }),
    })
    .safeParse({
      experienceId: formData.get("experienceId"),
      altText: formData.get("altText"),
      credit: formData.get("credit") ?? "",
      rights: formData.get("rights"),
    });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };

  const checked = await validateUpload(formData.get("file") as File | null, ["image/jpeg", "image/png", "image/webp"], 4 * 1024 * 1024);
  if (!checked.ok) return checked;
  let photo;
  try {
    photo = await processPhoto(checked.bytes);
  } catch (e) {
    return { ok: false, error: e instanceof PhotoTooSmallError ? e.message : "That file could not be read as a photo." };
  }

  const supabase = await createClient();
  const { count } = await supabase.from("experience_images").select("id", { count: "exact", head: true }).eq("experience_id", parsed.data.experienceId);
  if ((count ?? 0) >= 12) return { ok: false, error: "A listing can have up to 12 photos." };

  const path = `${ctx.providerId}/${parsed.data.experienceId}/${randomUUID()}.webp`;
  const { error: upErr } = await supabase.storage
    .from("experience-media")
    .upload(path, photo.data, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (upErr) return fail(upErr, "The upload failed. Please try again.");
  const { error } = await supabase.from("experience_images").insert({
    experience_id: parsed.data.experienceId,
    storage_path: path,
    alt_text: parsed.data.altText,
    credit: parsed.data.credit,
    rights_confirmed: true,
    width: photo.width,
    height: photo.height,
    position: count ?? 0,
  });
  if (error) {
    await supabase.storage.from("experience-media").remove([path]);
    return fail(error, "We could not add the photo.");
  }
  revalidateListing(parsed.data.experienceId);
  return { ok: true, message: "Photo added." };
}

export async function deleteListingImage(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await providerOnly();
  if (!ctx.ok) return ctx;
  const id = uuid.safeParse(formData.get("imageId"));
  if (!id.success) return { ok: false, error: "Invalid photo." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("experience_images").delete().eq("id", id.data).select("storage_path, experience_id").maybeSingle();
  if (error || !data) return { ok: false, error: "We could not remove the photo." };
  await supabase.storage.from("experience-media").remove([data.storage_path]);
  revalidateListing(data.experience_id);
  return { ok: true, message: "Photo removed." };
}

export async function makeCoverImage(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await providerOnly();
  if (!ctx.ok) return ctx;
  const id = uuid.safeParse(formData.get("imageId"));
  if (!id.success) return { ok: false, error: "Invalid photo." };
  const supabase = await createClient();
  const { data: img } = await supabase.from("experience_images").select("experience_id").eq("id", id.data).maybeSingle();
  if (!img) return { ok: false, error: "Photo not found." };
  const { data: all } = await supabase.from("experience_images").select("id").eq("experience_id", img.experience_id).order("position").order("created_at");
  const order = [id.data, ...(all ?? []).map((a) => a.id).filter((x) => x !== id.data)];
  for (const [i, imageId] of order.entries()) {
    await supabase.from("experience_images").update({ position: i }).eq("id", imageId);
  }
  revalidateListing(img.experience_id);
  return { ok: true, message: "Cover photo updated." };
}

export async function submitListing(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await providerOnly();
  if (!ctx.ok) return ctx;
  const id = uuid.safeParse(formData.get("experienceId"));
  if (!id.success) return { ok: false, error: "Invalid listing." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_experience_for_review", { p_experience_id: id.data });
  if (error) return fail(error);
  revalidateListing(id.data);
  return { ok: true, message: "Submitted for review. We will email you with the outcome." };
}

export async function setListingState(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await providerOnly();
  if (!ctx.ok) return ctx;
  const parsed = z
    .object({ experienceId: uuid, action: z.enum(["pause", "resume", "archive", "withdraw"]) })
    .safeParse({ experienceId: formData.get("experienceId"), action: formData.get("action") });
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_experience_state", { p_experience_id: parsed.data.experienceId, p_action: parsed.data.action });
  if (error) return fail(error);
  revalidateListing(parsed.data.experienceId);
  const msg = { pause: "Listing paused.", resume: "Listing is live again.", archive: "Listing archived.", withdraw: "Listing withdrawn from review." };
  return { ok: true, message: msg[parsed.data.action] };
}

export async function deleteDraftListing(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await providerOnly();
  if (!ctx.ok) return ctx;
  const id = uuid.safeParse(formData.get("experienceId"));
  if (!id.success) return { ok: false, error: "Invalid listing." };
  const supabase = await createClient();
  const { data: imgs } = await supabase.from("experience_images").select("storage_path").eq("experience_id", id.data);
  const { data, error } = await supabase.from("experiences").delete().eq("id", id.data).eq("status", "draft").select("id");
  if (error || !data?.length) return { ok: false, error: "Only drafts can be deleted. Archive live listings instead." };
  if (imgs?.length) await supabase.storage.from("experience-media").remove(imgs.map((i) => i.storage_path));
  revalidatePath("/provider/listings");
  return { ok: true, message: "Draft deleted." };
}

/* ------------------------------------------------------------------------------------------
 * Availability
 * ---------------------------------------------------------------------------------------- */

const ruleSchema = z
  .object({
    experienceId: uuid,
    weekdays: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Choose at least one day.").max(7),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a start time."),
    capacity: z.coerce.number().int().min(1, "Capacity must be at least 1.").max(1000),
    validFrom: z.iso.date("Choose a start date."),
    validUntil: z
      .string()
      .optional()
      .transform((v) => v || null)
      .pipe(z.iso.date().nullable()),
  })
  .refine((v) => !v.validUntil || v.validUntil >= v.validFrom, { message: "The end date must be after the start date.", path: ["validUntil"] });

export async function addAvailabilityRule(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await providerOnly();
  if (!ctx.ok) return ctx;
  const oneOff = formData.get("mode") === "one-off";
  const date = String(formData.get("date") ?? "");
  const weekday = date ? (((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1).toString() : "";
  const parsed = ruleSchema.safeParse({
    experienceId: formData.get("experienceId"),
    weekdays: oneOff ? [weekday] : formData.getAll("weekdays"),
    startTime: formData.get("startTime"),
    capacity: formData.get("capacity"),
    validFrom: oneOff ? date : formData.get("validFrom"),
    validUntil: oneOff ? date : (formData.get("validUntil") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("experience_availability").insert({
    experience_id: v.experienceId,
    weekdays: v.weekdays,
    start_time: v.startTime,
    capacity: v.capacity,
    valid_from: v.validFrom,
    valid_until: v.validUntil,
  });
  if (error) return fail(error, "We could not add these dates.");
  revalidatePath(`/provider/listings/${v.experienceId}/availability`);
  return { ok: true, message: oneOff ? "Date added." : "Schedule added." };
}

export async function setRuleActive(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await providerOnly();
  if (!ctx.ok) return ctx;
  const id = uuid.safeParse(formData.get("ruleId"));
  if (!id.success) return { ok: false, error: "Invalid schedule." };
  const active = formData.get("active") === "true";
  const supabase = await createClient();
  const { data, error } = await supabase.from("experience_availability").update({ is_active: active }).eq("id", id.data).select("experience_id").maybeSingle();
  if (error || !data) return { ok: false, error: "We could not update the schedule." };
  revalidatePath(`/provider/listings/${data.experience_id}/availability`);
  return { ok: true, message: active ? "Schedule turned on." : "Schedule turned off. Existing bookings are not affected." };
}

export async function deleteRule(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await providerOnly();
  if (!ctx.ok) return ctx;
  const id = uuid.safeParse(formData.get("ruleId"));
  if (!id.success) return { ok: false, error: "Invalid schedule." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("experience_availability").delete().eq("id", id.data).select("experience_id").maybeSingle();
  if (error || !data) return { ok: false, error: "We could not delete the schedule." };
  revalidatePath(`/provider/listings/${data.experience_id}/availability`);
  return { ok: true, message: "Schedule deleted. Existing bookings are not affected." };
}

export async function addException(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await providerOnly();
  if (!ctx.ok) return ctx;
  const parsed = z
    .object({
      experienceId: uuid,
      date: z.iso.date("Choose a date."),
      startTime: z
        .string()
        .optional()
        .transform((v) => v || null)
        .pipe(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable()),
      kind: z.enum(["closed", "capacity_override"]),
      capacity: z
        .string()
        .optional()
        .transform((v) => (v ? Number(v) : null))
        .pipe(z.number().int().min(0).max(1000).nullable()),
      reason: z.string().trim().max(300),
    })
    .refine((v) => v.kind === "closed" || v.capacity !== null, { message: "Enter the new capacity.", path: ["capacity"] })
    .safeParse({
      experienceId: formData.get("experienceId"),
      date: formData.get("date"),
      startTime: formData.get("startTime") ?? "",
      kind: formData.get("kind"),
      capacity: formData.get("capacity") ?? "",
      reason: formData.get("reason") ?? "",
    });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("availability_exceptions").insert({
    experience_id: v.experienceId,
    exception_date: v.date,
    start_time: v.startTime,
    kind: v.kind,
    capacity_override: v.kind === "capacity_override" ? v.capacity : null,
    reason: v.reason,
  });
  if (error) return fail(error, error.code === "23505" ? "There is already an exception for that date and time." : "We could not save the exception.");
  revalidatePath(`/provider/listings/${v.experienceId}/availability`);
  return { ok: true, message: v.kind === "closed" ? "Date closed. Existing bookings are not cancelled automatically." : "Capacity changed for that date." };
}

export async function deleteException(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await providerOnly();
  if (!ctx.ok) return ctx;
  const id = uuid.safeParse(formData.get("exceptionId"));
  if (!id.success) return { ok: false, error: "Invalid exception." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("availability_exceptions").delete().eq("id", id.data).select("experience_id").maybeSingle();
  if (error || !data) return { ok: false, error: "We could not remove the exception." };
  revalidatePath(`/provider/listings/${data.experience_id}/availability`);
  return { ok: true, message: "Exception removed." };
}
