"use client";

import { useServerForm } from "@/components/forms/use-server-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, fieldAria, Input } from "@/components/ui/field";
import { newPasswordSchema } from "@/lib/validation/auth";
import { updatePassword } from "../actions";

export default function ResetPasswordPage() {
  const { form, onSubmit, pending, result } = useServerForm(newPasswordSchema, updatePassword, { password: "", confirm: "" });
  const e = form.formState.errors;
  return (
    <div className="space-y-6">
      <title>Choose a new password · Hidden Kenya</title>
      <h1 className="text-3xl">Choose a new password</h1>
      {result?.ok ? (
        <div className="space-y-4">
          <Alert tone="success" live>
            Your password has been updated and other devices have been signed out.
          </Alert>
          <ButtonLink href="/account">Go to your account</ButtonLink>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <Field id="password" label="New password" hint="At least 10 characters, mixing letters with numbers or symbols." error={e.password?.message}>
            <Input {...fieldAria("password", e.password?.message, true)} type="password" autoComplete="new-password" {...form.register("password")} />
          </Field>
          <Field id="confirm" label="Repeat new password" error={e.confirm?.message}>
            <Input {...fieldAria("confirm", e.confirm?.message)} type="password" autoComplete="new-password" {...form.register("confirm")} />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save new password"}
          </Button>
          <div aria-live="polite">{result && !result.ok ? <Alert tone="error">{result.error}</Alert> : null}</div>
        </form>
      )}
    </div>
  );
}
