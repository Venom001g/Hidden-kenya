import type { Metadata } from "next";
import { Suspense } from "react";
import { deleteVerificationDocument, setServiceCategories, submitForVerification, uploadVerificationDocument } from "@/actions/provider";
import { DashboardSkeleton, Section } from "@/components/layout/dashboard-shell";
import { Alert, Badge, PageHeader } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/ui/forms";
import { getCategories } from "@/lib/data/public";
import { requireProvider } from "@/lib/data/provider";
import { formatShortDate } from "@/lib/format";
import { DOCUMENT_TYPES, PROVIDER_STATUS } from "@/lib/status";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile and verification" };

async function submitAction() {
  "use server";
  return submitForVerification();
}

async function Content() {
  const { profile, details, supabase } = await requireProvider("/provider/profile");
  const [categories, { data: chosen }, { data: docs }] = await Promise.all([
    getCategories(),
    supabase.from("provider_service_categories").select("category_id").eq("provider_id", profile.id),
    supabase
      .from("provider_verification_documents")
      .select("id, document_type, original_filename, status, review_notes, created_at")
      .eq("provider_id", profile.id)
      .order("created_at", { ascending: false }),
  ]);
  const chosenIds = new Set((chosen ?? []).map((c) => c.category_id));
  const status = PROVIDER_STATUS[profile.verification_status];
  const canSubmit = ["draft", "changes_requested", "rejected"].includes(profile.verification_status);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Profile and verification"
        description={
          <>
            Status: <Badge tone={status.tone}>{status.label}</Badge>
            {profile.verification_status === "verified" ? (
              <span className="ml-2">
                Your public page: <a className="underline" href={`/hosts/${profile.slug}`}>/hosts/{profile.slug}</a>
              </span>
            ) : null}
          </>
        }
      />
      {details.verification_feedback && profile.verification_status !== "verified" ? (
        <Alert tone="warning" title="Feedback from our team">
          {details.verification_feedback}
        </Alert>
      ) : null}

      <Section title="Profile">
        <ProfileForm
          nameLocked={["verified", "suspended"].includes(profile.verification_status)}
          defaults={{
            businessName: profile.business_name,
            description: profile.description,
            operatingAreas: profile.operating_areas,
            websiteUrl: profile.website_url ?? "",
            yearEstablished: profile.year_established ? String(profile.year_established) : "",
            legalName: details.legal_name,
            registrationNumber: details.registration_number,
            tourismLicenceNumber: details.tourism_licence_number,
            contactEmail: details.contact_email,
            contactPhone: details.contact_phone,
          }}
        />
      </Section>

      <div id="categories" className="scroll-mt-24">
        <Section title="Service categories" description="The kinds of experiences you offer.">
          <ActionForm action={setServiceCategories} className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2.5">
                  <Checkbox name="categoryId" value={c.id} defaultChecked={chosenIds.has(c.id)} />
                  {c.name}
                </label>
              ))}
            </div>
            <SubmitButton variant="secondary">Save categories</SubmitButton>
          </ActionForm>
        </Section>
      </div>

      <div id="documents" className="scroll-mt-24">
        <Section
          title="Verification documents"
          description="Stored privately. Only our review team can open them, using links that expire after a minute. PDF, JPG, PNG or WebP, up to 4 MB."
        >
          {docs?.length ? (
            <ul className="mb-6 divide-y divide-sand-deep">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{DOCUMENT_TYPES[d.document_type]}</p>
                    <p className="truncate text-sm text-stone">
                      {d.original_filename} · uploaded {formatShortDate(d.created_at)}
                    </p>
                    {d.review_notes ? <p className="mt-1 text-sm">Reviewer note: {d.review_notes}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={d.status === "accepted" ? "forest" : d.status === "rejected" ? "danger" : "outline"}>
                      {d.status === "submitted" ? "Not yet reviewed" : d.status === "accepted" ? "Accepted" : "Rejected"}
                    </Badge>
                    {d.status === "submitted" ? (
                      <ConfirmAction
                        action={deleteVerificationDocument}
                        hidden={{ documentId: d.id }}
                        trigger="Remove"
                        title="Remove this document?"
                        description="The file will be deleted."
                        confirmLabel="Remove document"
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-6 text-stone">No documents uploaded yet.</p>
          )}
          <ActionForm action={uploadVerificationDocument} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" resetOnSuccess>
            <Field id="documentType" label="Document type">
              <Select id="documentType" name="documentType" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {Object.entries(DOCUMENT_TYPES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="file" label="File">
              <Input id="file" name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="py-2" />
            </Field>
            <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
          </ActionForm>
        </Section>
      </div>

      <div id="submit" className="scroll-mt-24">
        <Section title="Submit for verification">
          {canSubmit ? (
            <ActionForm action={submitAction} className="space-y-3">
              <p className="text-stone">
                When your profile, categories and documents are complete, submit them. We check documents against your details and may ask for more information.
              </p>
              <SubmitButton pendingLabel="Submitting…">Submit for verification</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-stone">
              {profile.verification_status === "pending_review"
                ? `Submitted ${profile.submitted_at ? formatShortDate(profile.submitted_at) : ""}. We will email you when the review is done.`
                : profile.verification_status === "verified"
                  ? "Your profile is verified."
                  : "Your account is suspended. Contact support."}
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}

export default function ProviderProfilePage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content />
    </Suspense>
  );
}
