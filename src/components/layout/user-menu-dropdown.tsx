"use client";

import { ChevronDown, UserRound } from "lucide-react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { signOut } from "@/app/(auth)/actions";

export function UserMenuDropdown({ name, links }: { name: string; links: { href: string; label: string }[] }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="inline-flex h-10 items-center gap-2 rounded-full border border-sand-deep bg-paper pl-1 pr-3 text-sm hover:bg-sand">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-forest text-paper" aria-hidden>
          {initial === "?" ? <UserRound className="size-4" /> : initial}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{name}</span>
        <ChevronDown className="size-4 text-stone" aria-hidden />
        <span className="sr-only">Account menu</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-56 rounded-[var(--radius-card)] border border-sand-deep bg-paper p-1.5 shadow-raised"
        >
          {links.map((l) => (
            <DropdownMenu.Item key={l.href} asChild>
              <Link href={l.href} className="block rounded-md px-3 py-2 text-[0.95rem] outline-none data-[highlighted]:bg-sand">
                {l.label}
              </Link>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-sand-deep" />
          <form action={signOut}>
            <DropdownMenu.Item asChild>
              <button type="submit" className="block w-full rounded-md px-3 py-2 text-left text-[0.95rem] outline-none data-[highlighted]:bg-sand">
                Sign out
              </button>
            </DropdownMenu.Item>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
