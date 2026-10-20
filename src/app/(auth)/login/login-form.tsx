"use client";

import Link from "next/link";
import { useServerForm } from "@/components/forms/use-server-form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, fieldAria, Input } from "@/components/ui/field";
import { signInSchema } from "@/lib/validation/auth";
import { signIn } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  const { form, onSubmit, pending, result } = useServerForm(signInSchema, signIn, { email: "", password: "", next });
  const e = form.formState.errors;
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field id="email" label="Email" error={e.email?.message}>
        <Input {...fieldAria("email", e.email?.message)} type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <Field id="password" label="Password" error={e.password?.message}>
        <Input
          {...fieldAria("password", e.password?.message)}
          type="password"
          autoComplete="current-password"
          {...form.register("password")}
        />
      </Field>
      <div className="flex items-center justify-between gap-4">
        <Link href="/forgot-password" className="text-sm text-forest underline underline-offset-4">
          Forgot your password?
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </div>
      <div aria-live="polite">{result && !result.ok ? <Alert tone="error">{result.error}</Alert> : null}</div>
    </form>
  );
}
