import type { Metadata } from "next";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export const metadata: Metadata = { title: { default: "Host dashboard", template: "%s · Host · Hidden Kenya" }, robots: { index: false } };

const NAV = [
  { href: "/provider", label: "Overview", exact: true },
  { href: "/provider/listings", label: "Listings" },
  { href: "/provider/bookings", label: "Bookings" },
  { href: "/provider/earnings", label: "Earnings" },
  { href: "/provider/reviews", label: "Reviews" },
  { href: "/provider/profile", label: "Profile and verification" },
];

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell title="Host dashboard" nav={NAV}>
      {children}
    </DashboardShell>
  );
}
