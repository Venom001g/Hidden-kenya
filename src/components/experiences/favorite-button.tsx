"use client";

import { Heart } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toggleFavorite } from "@/actions/bookings";
import { cn } from "@/lib/utils";

export function FavoriteButton({ experienceId, saved, signedIn, loginHref }: { experienceId: string; saved: boolean; signedIn: boolean; loginHref: string }) {
  const [optimistic, setOptimistic] = useOptimistic(saved);
  const [, start] = useTransition();
  const cls = "inline-flex h-10 items-center gap-2 rounded-full border border-sand-deep bg-paper px-4 text-sm hover:bg-sand";
  if (!signedIn) {
    return (
      <Link href={loginHref} className={cls}>
        <Heart className="size-4" aria-hidden /> Save
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      aria-pressed={optimistic}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          await toggleFavorite(experienceId, !optimistic);
        })
      }
    >
      <Heart className={cn("size-4", optimistic && "fill-terracotta text-terracotta")} aria-hidden />
      {optimistic ? "Saved" : "Save"}
    </button>
  );
}
