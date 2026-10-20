import { cn } from "@/lib/utils";

/** Mark: a sun partly hidden behind a ridgeline. Original artwork. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-8", className)} aria-hidden focusable="false">
      <rect width="40" height="40" rx="11" fill="#1D4A37" />
      <circle cx="23" cy="22" r="8.5" fill="#E7B98F" />
      <path d="M3 27.5 L12 20.5 L17 24 L25 17.5 L31 22.5 L37 19.5 L37 37 L3 37 Z" fill="#1D4A37" />
      <path d="M3 27.5 L12 20.5 L17 24 L25 17.5 L31 22.5 L37 19.5" fill="none" stroke="#F7F2E8" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className={cn("font-display text-[1.35rem] leading-none tracking-[-0.01em]", inverted ? "text-paper" : "text-forest")}>
        Hidden Kenya
      </span>
    </span>
  );
}
