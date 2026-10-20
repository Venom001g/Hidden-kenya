"use client";

import { AlertDialog } from "radix-ui";
import { Loader2 } from "lucide-react";
import { useActionState, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/errors";
import { Button, type ButtonProps } from "./button";
import { Alert } from "./feedback";
import { toast } from "./toaster";

export type FormAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

export function SubmitButton({ children, pendingLabel, ...props }: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-disabled={pending} {...props}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}

/**
 * Progressive-enhancement form around a server action. Shows the action's result in an
 * aria-live region. The server action re-validates everything; this adds no trust.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await action(prev, fd);
    if (result.ok && result.message) toast(result.message);
    if (result.ok && resetOnSuccess) formRef.current?.reset();
    return result;
  }, { ok: true } as ActionResult);
  return (
    <form ref={formRef} action={formAction} className={className} noValidate>
      {children}
      <div aria-live="polite">
        {!state.ok ? (
          <Alert tone="error" className="mt-4">
            {state.error}
          </Alert>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Confirmation dialog for destructive or consequential actions. The action runs only
 * after explicit confirmation; optional textarea collects a reason.
 */
export function ConfirmAction({
  action,
  trigger,
  title,
  description,
  confirmLabel,
  hidden,
  reason,
  tone = "danger",
  triggerVariant = "secondary",
  triggerSize = "sm",
}: {
  action: FormAction;
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  hidden?: Record<string, string>;
  reason?: { label: string; required?: boolean; placeholder?: string };
  tone?: "danger" | "primary";
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await action(prev, fd);
    if (result.ok) {
      setOpen(false);
      if (result.message) toast(result.message);
    }
    return result;
  }, { ok: true } as ActionResult);

  return (
    <>
      <AlertDialog.Root open={open} onOpenChange={setOpen}>
        <AlertDialog.Trigger asChild>
          <Button variant={triggerVariant} size={triggerSize}>
            {trigger}
          </Button>
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-charcoal/40 backdrop-blur-[2px]" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-paper p-6 shadow-raised focus:outline-none">
            <AlertDialog.Title className="font-display text-xl">{title}</AlertDialog.Title>
            <AlertDialog.Description asChild>
              <div className="mt-2 text-stone">{description}</div>
            </AlertDialog.Description>
            <form action={formAction} className="mt-5 space-y-4">
              {Object.entries(hidden ?? {}).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              {reason ? (
                <div className="space-y-1.5">
                  <label htmlFor="confirm-reason" className="block text-sm font-medium">
                    {reason.label}
                  </label>
                  <textarea
                    id="confirm-reason"
                    name="reason"
                    required={reason.required}
                    minLength={reason.required ? 5 : undefined}
                    maxLength={1000}
                    placeholder={reason.placeholder}
                    className="min-h-24 w-full rounded-[var(--radius-control)] border border-sand-deep bg-ivory px-3 py-2"
                  />
                </div>
              ) : null}
              {!state.ok ? (
                <Alert tone="error" live>
                  {state.error}
                </Alert>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <AlertDialog.Cancel asChild>
                  <Button variant="secondary">Keep as is</Button>
                </AlertDialog.Cancel>
                <Button type="submit" variant={tone} disabled={pending}>
                  {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  {confirmLabel}
                </Button>
              </div>
            </form>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
