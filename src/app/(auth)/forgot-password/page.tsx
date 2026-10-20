"use client";

import Link from "next/link";
import { useServerForm } from "@/components/forms/use-server-form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, fieldAria, Input } from "@/components/ui/field";
import { resetRequestSchema } from "@/lib/validation/auth";
import { requestPasswordReset } from "../actions";

export default function ForgotPasswordPage() {
  const { form, onSubmit, pending, result } = useServerForm(resetRequestSchema, requestPasswordReset, { email: "" });
  const e = form.formState.errors;
  return (
    <div className="space-y-6">
      <title>Reset your password · Hidden Kenya</title>
      <div>
        <h1 className="text-3xl">Reset your password</h1>
        <p className="mt-2 text-stone">We will email you a link to choose a new password.</p>
      </div>
      {result?.ok ? (
        <Alert tone="success" live>
          {result.message}
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <Field id="email" label="Email" error={e.email?.message}>
            <Input {...fieldAria("email", e.email?.message)} type="email" autoComplete="email" {...form.register("email")} />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
          <div aria-live="polite">{result && !result.ok ? <Alert tone="error">{result.error}</Alert> : null}</div>
        </form>
      )}
      <Link href="/login" className="inline-block text-sm text-forest underline underline-offset-4">
        Back to sign in
      </Link>
    </div>
  );
}
