import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { becomeProvider } from "@/actions/provider";
import { DashboardSkeleton } from "@/components/layout/dashboard-shell";
import { Field, Input } from "@/components/ui/field";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Become a host", robots: { index: false } };

async function Content() {
  const user = await requireUser("/provider/onboarding");
  if (user.providerId) redirect("/provider");
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl">Set up your host profile</h1>
        <p className="mt-3 text-stone">
          Start with the name guests will see. Next you will add your details and verification documents. Nothing is public until our team verifies you.
        </p>
      </div>
      <ActionForm action={becomeProvider} className="space-y-5">
        <Field id="businessName" label="Business or trading name" hint="For example the name on your business registration or the name you guide under.">
          <Input id="businessName" name="businessName" required minLength={2} maxLength={120} autoComplete="organization" aria-describedby="businessName-hint" />
        </Field>
        <SubmitButton pendingLabel="Creating profile…">Continue</SubmitButton>
      </ActionForm>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <Suspense fallback={<DashboardSkeleton />}>
        <Content />
      </Suspense>
    </div>
  );
}
