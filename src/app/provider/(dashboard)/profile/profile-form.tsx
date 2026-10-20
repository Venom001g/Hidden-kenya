"use client";

import { updateProviderProfile } from "@/actions/provider";
import { useServerForm } from "@/components/forms/use-server-form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, fieldAria, Input, Textarea } from "@/components/ui/field";
import { providerProfileSchema } from "@/lib/validation/listing";

type Defaults = {
  businessName: string;
  description: string;
  operatingAreas: string;
  websiteUrl: string;
  yearEstablished: string;
  legalName: string;
  registrationNumber: string;
  tourismLicenceNumber: string;
  contactEmail: string;
  contactPhone: string;
};

export function ProfileForm({ defaults, nameLocked }: { defaults: Defaults; nameLocked: boolean }) {
  const { form, onSubmit, pending, result } = useServerForm(providerProfileSchema, updateProviderProfile, defaults);
  const e = form.formState.errors;
  const reg = form.register;
  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      <fieldset className="space-y-5">
        <legend className="mb-1 text-lg font-semibold">Shown to guests</legend>
        <Field id="businessName" label="Business or trading name" hint={nameLocked ? "Contact support to change the name of a verified business." : undefined} error={e.businessName?.message}>
          <Input {...fieldAria("businessName", e.businessName?.message, nameLocked)} readOnly={nameLocked} {...reg("businessName")} />
        </Field>
        <Field id="description" label="About your business" hint="Who you are, your experience, and what makes your experiences worth booking. At least 80 characters." error={e.description?.message}>
          <Textarea {...fieldAria("description", e.description?.message, true)} rows={6} {...reg("description")} />
        </Field>
        <Field id="operatingAreas" label="Where you operate" hint="Counties, towns or parks, e.g. “Lamu Old Town and Shela”." error={e.operatingAreas?.message}>
          <Input {...fieldAria("operatingAreas", e.operatingAreas?.message, true)} {...reg("operatingAreas")} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="websiteUrl" label="Website" optional error={e.websiteUrl?.message}>
            <Input {...fieldAria("websiteUrl", e.websiteUrl?.message)} type="url" placeholder="https://" {...reg("websiteUrl")} />
          </Field>
          <Field id="yearEstablished" label="Year established" optional error={e.yearEstablished?.message}>
            <Input {...fieldAria("yearEstablished", e.yearEstablished?.message)} inputMode="numeric" {...reg("yearEstablished")} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="mb-1 text-lg font-semibold">Private: used for verification and bookings</legend>
        <p className="-mt-3 text-sm text-stone">Seen only by you and our team. Your contact email and phone are used for booking notifications.</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="legalName" label="Legal name" hint="Registered business name, or your full name if you operate as an individual." error={e.legalName?.message}>
            <Input {...fieldAria("legalName", e.legalName?.message, true)} {...reg("legalName")} />
          </Field>
          <Field id="registrationNumber" label="Business registration number" optional error={e.registrationNumber?.message}>
            <Input {...fieldAria("registrationNumber", e.registrationNumber?.message)} {...reg("registrationNumber")} />
          </Field>
          <Field id="tourismLicenceNumber" label="Tourism Regulatory Authority licence number" optional error={e.tourismLicenceNumber?.message}>
            <Input {...fieldAria("tourismLicenceNumber", e.tourismLicenceNumber?.message)} {...reg("tourismLicenceNumber")} />
          </Field>
          <Field id="contactEmail" label="Booking contact email" error={e.contactEmail?.message}>
            <Input {...fieldAria("contactEmail", e.contactEmail?.message)} type="email" {...reg("contactEmail")} />
          </Field>
          <Field id="contactPhone" label="Booking contact phone" error={e.contactPhone?.message}>
            <Input {...fieldAria("contactPhone", e.contactPhone?.message)} type="tel" placeholder="+254 7…" {...reg("contactPhone")} />
          </Field>
        </div>
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
      <div aria-live="polite">
        {result ? result.ok ? <Alert tone="success">{result.message}</Alert> : <Alert tone="error">{result.error}</Alert> : null}
      </div>
    </form>
  );
}
