import type { Metadata } from "next";
import { Suspense } from "react";
import { createPayout, sendPayout, updatePayout } from "@/actions/admin";
import { DashboardSkeleton, DataTable, Section, td } from "@/components/layout/dashboard-shell";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/ui/forms";
import { requireAdmin } from "@/lib/data/admin";
import { formatMoney, formatShortDate } from "@/lib/format";
import { getGateway } from "@/lib/payments";
import { PAYOUT_STATUS } from "@/lib/status";

export const metadata: Metadata = { title: "Payouts" };

async function Content() {
  const { db } = await requireAdmin("/admin/payouts");
  const { data: providers } = await db.from("provider_profiles").select("id, business_name, provider_payout_accounts(display_label)").in("verification_status", ["verified", "suspended"]).order("business_name");
  const ready = (
    await Promise.all(
      (providers ?? []).map(async (p) => {
        const { data } = await db.rpc("provider_earnings_summary", { p_provider_id: p.id });
        return (data ?? []).filter((s) => s.available_minor > 0).map((s) => ({ provider: p, currency: s.currency, amount: s.available_minor }));
      }),
    )
  ).flat();
  const { data: payouts } = await db.from("provider_payouts").select("id, amount_minor, currency, status, transfer_reference, failure_reason, created_at, paid_at, provider_profiles(business_name)").order("created_at", { ascending: false }).limit(100);
  const gatewayReady = getGateway().isConfigured();

  return (
    <div className="space-y-8">
      <PageHeader title="Payouts" description="Host earnings from experiences that have taken place, net of refunds and commission. Each booking can be paid out only once." />
      <Section title="Ready for payout">
        {ready.length ? (
          <DataTable head={["Host", "Amount", "Payout account", ""]}>
            {ready.map((r) => (
              <tr key={`${r.provider.id}-${r.currency}`}>
                <td className={td}>{r.provider.business_name}</td>
                <td className={td}>{formatMoney(r.amount, r.currency)}</td>
                <td className={td}>{r.provider.provider_payout_accounts?.display_label ?? <span className="text-terracotta">not added</span>}</td>
                <td className={td}>
                  <ActionForm action={createPayout}>
                    <input type="hidden" name="providerId" value={r.provider.id} />
                    <input type="hidden" name="currency" value={r.currency} />
                    <SubmitButton size="sm">Prepare payout</SubmitButton>
                  </ActionForm>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <p className="text-stone">No earnings are ready to pay out.</p>
        )}
      </Section>
      <Section title="Payouts" description={gatewayReady ? "Send prepared payouts through Paystack, or record a manual transfer." : "Paystack is not configured: pay manually and record the transfer reference."}>
        {payouts?.length ? (
          <DataTable head={["Host", "Amount", "Status", "Reference", "Created", "Actions"]}>
            {payouts.map((p) => (
              <tr key={p.id}>
                <td className={td}>{p.provider_profiles?.business_name}</td>
                <td className={td}>{formatMoney(p.amount_minor, p.currency)}</td>
                <td className={td}>
                  <Badge tone={PAYOUT_STATUS[p.status].tone}>{PAYOUT_STATUS[p.status].label}</Badge>
                  {p.failure_reason ? <span className="block text-xs text-danger">{p.failure_reason}</span> : null}
                </td>
                <td className={td}>{p.transfer_reference ?? "—"}</td>
                <td className={td}>{formatShortDate(p.created_at)}</td>
                <td className={td}>
                  <div className="flex flex-wrap gap-2">
                    {p.status === "draft" && gatewayReady ? (
                      <ConfirmAction action={sendPayout} hidden={{ payoutId: p.id }} trigger="Send via Paystack" triggerVariant="primary" title="Send this payout?" description={`${formatMoney(p.amount_minor, p.currency)} will be transferred from your Paystack balance.`} confirmLabel="Send" tone="primary" />
                    ) : null}
                    {p.status === "draft" || p.status === "processing" ? (
                      <ConfirmAction
                        action={updatePayout}
                        hidden={{ payoutId: p.id, status: "paid" }}
                        trigger="Record as paid"
                        title="Record a completed transfer"
                        description="Only record this once the money has reached the host. Enter the M-Pesa or bank transfer reference in the box below."
                        confirmLabel="Record paid"
                        tone="primary"
                        reason={{ label: "Transfer reference", required: true }}
                      />
                    ) : null}
                    {p.status === "draft" || p.status === "failed" ? (
                      <ConfirmAction action={updatePayout} hidden={{ payoutId: p.id, status: "cancelled" }} trigger="Cancel" title="Cancel this payout?" description="Its bookings become available for a new payout." confirmLabel="Cancel payout" />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState title="No payouts yet" />
        )}
      </Section>
    </div>
  );
}

export default function AdminPayoutsPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content />
    </Suspense>
  );
}
