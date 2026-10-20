import { getCurrentUser, hasRole } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDateTime, nairobiDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/** CSV of the provider's own bookings. RLS limits rows to this provider. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.deactivated || !hasRole(user, "provider") || !user.providerId) {
    return new Response("Not allowed", { status: 403 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("reference, status, starts_at, party_size, total_minor, currency, commission_rate_bps, refund_minor, contact_name, contact_phone, contact_email, created_at, experiences(title)")
    .eq("provider_id", user.providerId)
    .order("starts_at", { ascending: false })
    .limit(5000);
  if (error) return new Response("Export failed", { status: 500 });

  const active = new Set(["confirmed", "completed", "pending_provider_confirmation", "pending_payment"]);
  const csv = toCsv(
    ["Reference", "Experience", "Status", "Starts (EAT)", "Guests", "Total", "Currency", "Commission %", "Refunded", "Lead guest", "Phone", "Email", "Booked (EAT)"],
    (data ?? []).map((b) => [
      b.reference,
      b.experiences?.title,
      b.status,
      formatDateTime(b.starts_at),
      b.party_size,
      (b.total_minor / 100).toFixed(2),
      b.currency,
      (b.commission_rate_bps / 100).toFixed(2),
      (b.refund_minor / 100).toFixed(2),
      // Contact details only for active bookings (data minimisation).
      active.has(b.status) ? b.contact_name : "",
      active.has(b.status) ? b.contact_phone : "",
      active.has(b.status) ? b.contact_email : "",
      formatDateTime(b.created_at),
    ]),
  );
  return csvResponse(`hidden-kenya-bookings-${nairobiDate()}.csv`, csv);
}
