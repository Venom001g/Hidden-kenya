import type { Metadata } from "next";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Account deactivated", robots: { index: false } };

export default function DeactivatedPage() {
  return (
    <div className="mx-auto max-w-xl space-y-5 px-4 py-20">
      <h1 className="text-3xl">This account is deactivated</h1>
      <p className="text-stone">
        An administrator has deactivated this account, so bookings and hosting tools are unavailable. If you think this is a mistake, contact us using the address in our privacy policy.
      </p>
      <form action={signOut}>
        <Button type="submit" variant="secondary">
          Sign out
        </Button>
      </form>
    </div>
  );
}
