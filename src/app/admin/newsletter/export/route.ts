import { getCurrentUser, hasRole } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { siteUrl } from "@/lib/email";
import { nairobiDate } from "@/lib/format";
import { unsubscribeUrl } from "@/lib/newsletter";
import { auditEvent } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.deactivated || !hasRole(user, "admin")) return new Response("Not allowed", { status: 403 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("newsletter_subscriptions").select("id, email, consented_at, confirmed_at").eq("status", "subscribed").order("confirmed_at");
  if (error) return new Response("Export failed", { status: 500 });
  await auditEvent(user.id, "newsletter.exported", "newsletter", null, { rows: data?.length ?? 0 });
  const site = siteUrl();
  const csv = toCsv(
    ["email", "consented_at", "confirmed_at", "unsubscribe_url"],
    (data ?? []).map((s) => [s.email, s.consented_at, s.confirmed_at, unsubscribeUrl(site, s.id)]),
  );
  return csvResponse(`hidden-kenya-subscribers-${nairobiDate()}.csv`, csv);
}
