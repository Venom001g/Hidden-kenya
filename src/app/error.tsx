"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The digest links this to the server log entry without exposing details to the user.
    console.error("Page error", error.digest ?? "");
  }, [error]);
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center" role="alert">
      <h1 className="text-3xl">This page could not be loaded</h1>
      <p className="mt-3 text-stone">
        Something went wrong on our side. Try again, and if it keeps happening, come back in a few minutes.
        {error.digest ? <span className="mt-2 block text-sm">Reference: {error.digest}</span> : null}
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/" variant="secondary">
          Home
        </ButtonLink>
      </div>
    </div>
  );
}
