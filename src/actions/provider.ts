"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorize } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";
import { getGateway, GatewayError } from "@/lib/payments";
import { auditEvent, RATE_LIMITED, rateLimitRequest, validateUpload } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { providerProfileSchema } from "@/lib/validation/listing";

const DOC_TYPES = [
  "business_registration",
  "tourism_licence",
  "identity_document",
  "tax_pin_certificate",
  "insurance_certificate",
  "guide_certification",
  "other",
] as const;

export async function becomeProvider(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  const name = z.string().trim().min(2).max(120).safeParse(formData.get("businessName"));
  if (!name.success) return { ok: false, error: "Enter your business or trading name (2–120 characters)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("become_provider", { p_business_name: name.data });
  if (error) return fail(error);
  revalidatePath("/", "layout");
  redirect("/provider/profile");
}

export async function updateProviderProfile(input: z.input<typeof providerProfileSchema>): Promise<ActionResult> {
  const auth = await authorize("provider");
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = providerProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const v = parsed.data;
  const providerId = auth.user.providerId;
  if (!providerId) return { ok: false, error: "Create your host profile first." };

  const supabase = await createClient();
  const { error: e1 } = await supabase
    .from("provider_profiles")
    .update({
      business_name: v.businessName,
      description: v.description,
      operating_areas: v.operatingAreas,
      website_url: v.websiteUrl,
      year_established: v.yearEstablished,
    })
    .eq("id", providerId);
  if (e1) return fail(e1, "We could not save your profile.");
  const { error: e2 } = await supabase
    .from("provider_private_details")
    .update({
      legal_name: v.legalName,
      registration_number: v.registrationNumber,
      tourism_licence_number: v.tourismLicenceNumber,
      contact_email: v.contactEmail,
      contact_phone: v.contactPhone,
    })
    .eq("provider_id", providerId);
  if (e2) return fail(e2, "We could not save your contact details.");
  revalidatePath("/provider", "layout");
  return { ok: true, message: "Profile saved." };
}

export async function setServiceCategories(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("provider");
  if (!auth.ok || !auth.user.providerId) return { ok: false, error: auth.ok ? "Create your host profile first." : auth.error };
  const ids = z.array(z.uuid()).max(20).safeParse(formData.getAll("categoryId"));
  if (!ids.success) return { ok: false, error: "Invalid selection." };
  const supabase = await createClient();
  const providerId = auth.user.providerId;
  const { data: current } = await supabase.from("provider_service_categories").select("category_id").eq("provider_id", providerId);
  const have = new Set((current ?? []).map((c) => c.category_id));
  const want = new Set(ids.data);
  const toAdd = [...want].filter((id) => !have.has(id)).map((category_id) => ({ provider_id: providerId, category_id }));
  const toRemove = [...have].filter((id) => !want.has(id));
  if (toAdd.length) {
    const { error } = await supabase.from("provider_service_categories").insert(toAdd);
    if (error) return fail(error);
  }
  if (toRemove.length) {
    const { error } = await supabase.from("provider_service_categories").delete().eq("provider_id", providerId).in("category_id", toRemove);
    if (error) return fail(error);
  }
  revalidatePath("/provider/profile");
  return { ok: true, message: "Service categories saved." };
}

export async function uploadVerificationDocument(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("provider");
  if (!auth.ok || !auth.user.providerId) return { ok: false, error: auth.ok ? "Create your host profile first." : auth.error };
  if (!(await rateLimitRequest("upload", auth.user.id))) return { ok: false, error: RATE_LIMITED };
  const type = z.enum(DOC_TYPES).safeParse(formData.get("documentType"));
  if (!type.success) return { ok: false, error: "Choose the type of document." };
  const file = formData.get("file") as File | null;
  const checked = await validateUpload(file, ["application/pdf", "image/jpeg", "image/png", "image/webp"], 4 * 1024 * 1024);
  if (!checked.ok) return checked;

  const providerId = auth.user.providerId;
  const path = `${providerId}/${randomUUID()}.${checked.ext}`;
  const supabase = await createClient();
  // Upload with the user's session: storage RLS restricts the folder to their own provider id.
  const { error: upErr } = await supabase.storage
    .from("verification-documents")
    .upload(path, checked.bytes, { contentType: checked.type, upsert: false });
  if (upErr) return fail(upErr, "The upload failed. Please try again.");
  const { error } = await supabase.from("provider_verification_documents").insert({
    provider_id: providerId,
    document_type: type.data,
    storage_path: path,
    original_filename: (file?.name ?? "document").replace(/[^\w.\- ]+/g, "_").slice(0, 200),
    mime_type: checked.type,
    size_bytes: file?.size ?? checked.bytes.length,
  });
  if (error) {
    await supabase.storage.from("verification-documents").remove([path]);
    return fail(error, "We could not record the document.");
  }
  revalidatePath("/provider/profile");
  return { ok: true, message: "Document uploaded. Only our review team can see it." };
}

export async function deleteVerificationDocument(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("provider");
  if (!auth.ok) return { ok: false, error: auth.error };
  const id = z.uuid().safeParse(formData.get("documentId"));
  if (!id.success) return { ok: false, error: "Invalid document." };
  const supabase = await createClient();
  const { data: doc, error } = await supabase
    .from("provider_verification_documents")
    .delete()
    .eq("id", id.data)
    .eq("status", "submitted")
    .select("storage_path")
    .maybeSingle();
  if (error || !doc) return { ok: false, error: "Only documents that have not been reviewed can be removed." };
  await supabase.storage.from("verification-documents").remove([doc.storage_path]);
  revalidatePath("/provider/profile");
  return { ok: true, message: "Document removed." };
}

export async function submitForVerification(): Promise<ActionResult> {
  const auth = await authorize("provider");
  if (!auth.ok) return { ok: false, error: auth.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_provider_for_verification");
  if (error) return fail(error);
  revalidatePath("/provider", "layout");
  return { ok: true, message: "Submitted. We will email you when our team has reviewed your profile." };
}

/**
 * Registers an M-Pesa payout destination. The number goes straight to the payment gateway,
 * which returns a recipient token; only the token and a masked label are stored.
 */
export async function savePayoutAccount(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("provider");
  if (!auth.ok || !auth.user.providerId) return { ok: false, error: auth.ok ? "Create your host profile first." : auth.error };
  const parsed = z
    .object({ name: z.string().trim().min(2).max(100), phone: z.string().trim().min(9).max(20) })
    .safeParse({ name: formData.get("accountName"), phone: formData.get("phone") });
  if (!parsed.success) return { ok: false, error: "Enter the registered M-Pesa name and number." };
  if (!(await rateLimitRequest("payment", auth.user.id))) return { ok: false, error: RATE_LIMITED };

  const gateway = getGateway();
  if (!gateway.isConfigured()) return { ok: false, error: "Payout setup is not available yet. Our team will contact you." };
  try {
    const recipient = await gateway.createMobileMoneyRecipient({ name: parsed.data.name, phone: parsed.data.phone, currency: "KES" });
    const { error } = await createAdminClient()
      .from("provider_payout_accounts")
      .upsert({
        provider_id: auth.user.providerId,
        method: "mobile_money",
        display_label: recipient.label,
        gateway: gateway.id,
        gateway_recipient_code: recipient.recipientCode,
        currency: "KES",
      });
    if (error) return fail(error);
    await auditEvent(auth.user.id, "payout_account.saved", "provider", auth.user.providerId, { label: recipient.label });
  } catch (e) {
    return { ok: false, error: e instanceof GatewayError ? e.userMessage : "We could not save the payout account." };
  }
  revalidatePath("/provider/earnings");
  return { ok: true, message: "Payout account saved." };
}
