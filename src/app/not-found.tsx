import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="font-display text-6xl text-sand-deep" aria-hidden>
        404
      </p>
      <h1 className="mt-4 text-3xl">We could not find that page</h1>
      <p className="mt-3 text-stone">It may have moved, or the listing may no longer be available.</p>
      <div className="mt-8 flex justify-center gap-3">
        <ButtonLink href="/experiences">Browse experiences</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Home
        </ButtonLink>
      </div>
    </div>
  );
}
