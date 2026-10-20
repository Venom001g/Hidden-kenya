import type { Metadata } from "next";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export const metadata: Metadata = { title: { default: "Your account", template: "%s · Hidden Kenya" }, robots: { index: false } };

const NAV = [
  { href: "/account", label: "Overview", exact: true },
  { href: "/account/bookings", label: "Bookings" },
  { href: "/account/favorites", label: "Saved" },
  { href: "/account/reviews", label: "Your reviews" },
  { href: "/account/support", label: "Support" },
  { href: "/account/settings", label: "Settings and privacy" },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell title="Your account" nav={NAV}>
      {children}
    </DashboardShell>
  );
}
