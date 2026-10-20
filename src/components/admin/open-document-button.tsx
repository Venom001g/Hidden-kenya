"use client";

import { ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import { openDocument } from "@/actions/admin";
import { Button } from "@/components/ui/button";

/** Opens a private document through a short-lived signed URL. Each opening is audited. */
export function OpenDocumentButton({ documentId }: { documentId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await openDocument(documentId);
            if (!r.ok) return setError(r.error);
            window.open(r.data!.url, "_blank", "noopener,noreferrer");
          })
        }
      >
        <ExternalLink aria-hidden /> {pending ? "Opening…" : "Open"}
      </Button>
      {error ? (
        <span className="text-sm text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
