import type { Metadata } from "next";
import { Suspense } from "react";
import { confirmNewsletter } from "@/actions/newsletter";
import { ButtonLink } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/forms";

export const metadata: Metadata = { title: "Confirm subscription", robots: { index: false } };

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  return (
    <ActionForm action={confirmNewsletter}>
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingLabel="Confirming…">Confirm subscription</SubmitButton>
    </ActionForm>
  );
}

export default function NewsletterConfirmPage(props: PageProps<"/newsletter/confirm">) {
  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-16">
      <h1 className="text-3xl">Confirm your newsletter subscription</h1>
      <p className="text-stone">Press the button to start receiving the Hidden Kenya newsletter at this address.</p>
      <Suspense fallback={null}>
        <Form searchParams={props.searchParams} />
      </Suspense>
      <ButtonLink href="/" variant="link">
        Back to Hidden Kenya
      </ButtonLink>
    </div>
  );
}
