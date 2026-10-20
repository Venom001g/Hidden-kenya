import type { Metadata } from "next";
import { Suspense } from "react";
import { unsubscribeNewsletter } from "@/actions/newsletter";
import { ButtonLink } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/forms";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <ActionForm action={unsubscribeNewsletter}>
      <input type="hidden" name="id" value={typeof sp.id === "string" ? sp.id : ""} />
      <input type="hidden" name="sig" value={typeof sp.sig === "string" ? sp.sig : ""} />
      <SubmitButton pendingLabel="Unsubscribing…">Unsubscribe</SubmitButton>
    </ActionForm>
  );
}

export default function UnsubscribePage(props: PageProps<"/newsletter/unsubscribe">) {
  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-16">
      <h1 className="text-3xl">Unsubscribe from the newsletter</h1>
      <p className="text-stone">You will stop receiving the newsletter. Emails about your bookings are not affected.</p>
      <Suspense fallback={null}>
        <Form searchParams={props.searchParams} />
      </Suspense>
      <ButtonLink href="/" variant="link">
        Back to Hidden Kenya
      </ButtonLink>
    </div>
  );
}
