"use client";

import Link from "next/link";
import { useServerForm } from "@/components/forms/use-server-form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, fieldAria, Input } from "@/components/ui/field";
import { signUpSchema } from "@/lib/validation/auth";
import { signUp } from "../actions";

export function SignupForm({ intent }: { intent: "guest" | "host" }) {
  const { form, onSubmit, pending, result } = useServerForm(signUpSchema, signUp, {
    fullName: "",
    email: "",
    password: "",
    intent,
  });
  const e = form.formState.errors;

  if (result?.ok) {
    return (
      <Alert tone="success" title="Confirm your email" live>
        {result.message}
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {intent === "host" ? (
        <Alert>After confirming your email you will set up your host profile. Listings go live only after our team reviews them.</Alert>
      ) : null}
      <Field id="fullName" label="Full name" error={e.fullName?.message}>
        <Input {...fieldAria("fullName", e.fullName?.message)} autoComplete="name" {...form.register("fullName")} />
      </Field>
      <Field id="email" label="Email" error={e.email?.message}>
        <Input {...fieldAria("email", e.email?.message)} type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <Field id="password" label="Password" hint="At least 10 characters, mixing letters with numbers or symbols." error={e.password?.message}>
        <Input
          {...fieldAria("password", e.password?.message, true)}
          type="password"
          autoComplete="new-password"
          {...form.register("password")}
        />
      </Field>
      <div className="space-y-1.5">
        <label className="flex items-start gap-3 text-[0.95rem]">
          <Checkbox className="mt-0.5" aria-invalid={Boolean(e.acceptTerms) || undefined} {...form.register("acceptTerms")} />
          <span>
            I agree to the{" "}
            <Link href="/legal/terms" className="text-forest underline underline-offset-2" target="_blank">
              terms of service
            </Link>{" "}
            and have read the{" "}
            <Link href="/legal/privacy" className="text-forest underline underline-offset-2" target="_blank">
              privacy policy
            </Link>
            .
          </span>
        </label>
        {e.acceptTerms ? (
          <p className="text-sm text-danger" role="alert">
            {e.acceptTerms.message}
          </p>
        ) : null}
      </div>
      <input type="hidden" {...form.register("intent")} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <div aria-live="polite">{result && !result.ok ? <Alert tone="error">{result.error}</Alert> : null}</div>
    </form>
  );
}
