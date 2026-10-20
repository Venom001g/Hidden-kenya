"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm, type DefaultValues, type FieldValues, type Path, type Resolver } from "react-hook-form";
import type { z } from "zod";
import type { ActionResult } from "@/lib/errors";

/**
 * React Hook Form + Zod on the client, calling a server action that validates the same
 * schema again. Server field errors are mapped back onto the form fields.
 */
export function useServerForm<S extends z.ZodType<FieldValues, FieldValues>, R = undefined>(
  schema: S,
  action: (values: z.input<S>) => Promise<ActionResult<R>>,
  defaultValues?: DefaultValues<z.input<S>>,
  onSuccess?: (result: ActionResult<R> & { ok: true }) => void,
) {
  const form = useForm<z.input<S>, unknown, z.output<S>>({
    resolver: zodResolver(schema as never) as unknown as Resolver<z.input<S>, unknown, z.output<S>>,
    defaultValues,
    mode: "onBlur",
  });
  const [result, setResult] = useState<ActionResult<R> | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      // Send the raw input; the server parses it with the same schema.
      const r = await action(form.getValues());
      setResult(r);
      if (!r.ok && r.fieldErrors) {
        for (const [name, messages] of Object.entries(r.fieldErrors)) {
          if (messages?.[0]) form.setError(name as Path<z.input<S>>, { message: messages[0] });
        }
      }
      if (r.ok) onSuccess?.(r as ActionResult<R> & { ok: true });
      void values;
    });
  });

  return { form, onSubmit, pending, result, setResult };
}
