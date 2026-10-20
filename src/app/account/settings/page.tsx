import type { Metadata } from "next";
import { Suspense } from "react";
import { changePassword, deleteAccount, signOutEverywhere, updateNotificationPrefs, updateProfile } from "@/actions/account";
import { DashboardSkeleton, Section } from "@/components/layout/dashboard-shell";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, PageHeader } from "@/components/ui/feedback";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings and privacy" };

async function Content() {
  const user = await requireUser("/account/settings");
  const supabase = await createClient();
  const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!p) return null;
  return (
    <div className="space-y-8">
      <PageHeader title="Settings and privacy" description={`Signed in as ${user.email}`} />

      <Section title="Profile">
        <ActionForm action={updateProfile} className="grid gap-5 sm:grid-cols-2">
          <Field id="fullName" label="Full name" className="sm:col-span-2">
            <Input id="fullName" name="fullName" defaultValue={p.full_name} required maxLength={120} autoComplete="name" />
          </Field>
          <Field id="phone" label="Phone" optional hint="Used to pre-fill bookings.">
            <Input id="phone" name="phone" type="tel" defaultValue={p.phone ?? ""} autoComplete="tel" aria-describedby="phone-hint" />
          </Field>
          <Field id="country" label="Country code" optional hint="Two letters, e.g. KE, GB, US.">
            <Input id="country" name="country" defaultValue={p.country_code ?? ""} maxLength={2} pattern="[A-Z]{2}" className="uppercase" aria-describedby="country-hint" />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton>Save profile</SubmitButton>
          </div>
        </ActionForm>
      </Section>

      <Section title="Email preferences" description="Emails about your bookings (confirmations, changes, refunds) are always sent.">
        <ActionForm action={updateNotificationPrefs} className="space-y-3">
          <label className="flex items-center gap-2.5">
            <Checkbox name="reminders" defaultChecked={p.email_booking_reminders} /> Reminders a day or two before an experience
          </label>
          <label className="flex items-center gap-2.5">
            <Checkbox name="productUpdates" defaultChecked={p.email_product_updates} /> Occasional updates about Hidden Kenya features
          </label>
          <SubmitButton variant="secondary">Save preferences</SubmitButton>
        </ActionForm>
      </Section>

      <Section title="Password and sessions">
        <ActionForm action={changePassword} className="grid gap-5 sm:grid-cols-3" resetOnSuccess>
          <Field id="current" label="Current password">
            <Input id="current" name="current" type="password" required autoComplete="current-password" />
          </Field>
          <Field id="next" label="New password">
            <Input id="next" name="next" type="password" required minLength={10} autoComplete="new-password" />
          </Field>
          <Field id="confirm" label="Repeat new password">
            <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" />
          </Field>
          <div className="sm:col-span-3">
            <SubmitButton variant="secondary">Change password</SubmitButton>
          </div>
        </ActionForm>
        <form action={signOutEverywhere} className="mt-6 border-t border-sand-deep pt-5">
          <p className="mb-3 text-sm text-stone">Signs you out on every device, including this one.</p>
          <Button type="submit" variant="secondary">
            Sign out everywhere
          </Button>
        </form>
      </Section>

      <Section title="Your data" description="Your rights under Kenya's Data Protection Act, 2019 include access, correction and deletion.">
        <div className="space-y-6">
          <div>
            <p className="mb-3">Download a copy of the personal data we hold about you (JSON).</p>
            <ButtonLink href="/account/settings/export" variant="secondary" prefetch={false}>
              Download my data
            </ButtonLink>
          </div>
          <div className="border-t border-sand-deep pt-6">
            <h3 className="font-sans text-lg font-semibold">Delete account</h3>
            <Alert tone="warning" className="my-3">
              Your profile, saved experiences, reviews and support history are deleted. Booking and payment records are kept for 7 years for tax purposes, with your name and contact details removed. Cancel any active bookings first. Host accounts are closed through support.
            </Alert>
            <ActionForm action={deleteAccount} className="grid gap-4 sm:grid-cols-2">
              <Field id="del-password" label="Password">
                <Input id="del-password" name="password" type="password" required autoComplete="current-password" />
              </Field>
              <Field id="del-confirm" label="Type DELETE to confirm">
                <Input id="del-confirm" name="confirm" required pattern="DELETE" autoComplete="off" />
              </Field>
              <div className="sm:col-span-2">
                <SubmitButton variant="danger" pendingLabel="Deleting…">
                  Delete my account
                </SubmitButton>
              </div>
            </ActionForm>
          </div>
        </div>
      </Section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content />
    </Suspense>
  );
}
