import { ButtonLink } from "@/components/ui/button";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { UserMenuDropdown } from "./user-menu-dropdown";

export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="flex items-center gap-1.5">
        <ButtonLink href="/login" variant="ghost" size="sm">
          Sign in
        </ButtonLink>
        <ButtonLink href="/signup" size="sm" className="hidden sm:inline-flex">
          Create account
        </ButtonLink>
      </div>
    );
  }
  const links = [
    { href: "/account", label: "Your account" },
    { href: "/account/bookings", label: "Bookings" },
    { href: "/account/favorites", label: "Saved experiences" },
    hasRole(user, "provider")
      ? { href: "/provider", label: "Host dashboard" }
      : { href: "/provider/onboarding", label: "Become a host" },
    ...(hasRole(user, "admin") ? [{ href: "/admin", label: "Administration" }] : []),
  ];
  return <UserMenuDropdown name={user.fullName || user.email} links={links} />;
}
