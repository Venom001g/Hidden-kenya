import type { Metadata } from "next";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export const metadata: Metadata = { title: { default: "Administration", template: "%s · Admin · Hidden Kenya" }, robots: { index: false } };

const NAV = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/providers", label: "Hosts" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/destinations", label: "Destinations" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/payments", label: "Payments and refunds" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/newsletter", label: "Newsletter" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit", label: "Audit log" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell title="Administration" nav={NAV}>
      {children}
    </DashboardShell>
  );
}
