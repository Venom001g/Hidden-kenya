import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-[var(--radius-control)] border border-sand-deep bg-paper px-3 text-charcoal placeholder:text-stone/70 transition-colors focus:border-forest focus:outline-none focus-visible:outline-2 focus-visible:outline-forest aria-[invalid=true]:border-danger disabled:opacity-60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-28 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        control,
        "h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%228%22 viewBox=%220 0 12 8%22><path d=%22M1 1l5 5 5-5%22 fill=%22none%22 stroke=%22%235b5a52%22 stroke-width=%221.6%22/></svg>')] bg-[length:12px_8px] bg-[position:right_0.85rem_center] bg-no-repeat pr-9",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("block text-sm font-medium text-charcoal", className)} {...props} />;
}

/**
 * Label + control + hint + error, wired with aria attributes.
 * Pass the control as children; it must have id={id}.
 */
export function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | string[];
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="ml-1.5 font-normal text-stone">(optional)</span> : null}
      </Label>
      {children}
      {hint && !message ? (
        <p id={`${id}-hint`} className="text-sm text-stone">
          {hint}
        </p>
      ) : null}
      {message ? (
        <p id={`${id}-error`} className="text-sm text-danger" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** aria props to spread on a control rendered inside <Field>. */
export function fieldAria(id: string, error?: string | string[], hint?: boolean) {
  const has = Boolean(Array.isArray(error) ? error.length : error);
  return {
    id,
    "aria-invalid": has || undefined,
    "aria-describedby": has ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}

export function Checkbox({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      className={cn("size-[18px] shrink-0 rounded border-sand-deep accent-forest", className)}
      {...props}
    />
  );
}
