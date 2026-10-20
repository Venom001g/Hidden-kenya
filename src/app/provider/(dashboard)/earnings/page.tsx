import type { Metadata } from "next";
import { Suspense } from "react";
import { savePayoutAccount } from "@/actions/provider";
import { DashboardSkeleton, DataTable, Section, Stat, td } from "@/components/layout/dashboard-shell";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { requireProvider } from "@/lib/data/provider";
import { formatMoney, formatShortDate } from "@/lib/format";
import { PAYOUT_STATUS } from "@/lib/status";

export const metadata: Metadata = { title: "Earnings" };

async function Content() {
  const { profile, supabase } = await requireProvider("/provider/earnings");
  const [{ data: summary }, { data: payouts }, { data: account }] = await Promise.all([
    supabase.rpc("provider_earnings_summary", { p_provider_id: profile.id }),
    supabase.from("provider_payouts").select("id, amount_minor, currency, status, transfer_reference, paid_at, created_at").eq("provider_id", profile.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("provider_payout_accounts").select("display_label, updated_at").eq("provider_id", profile.id).maybeSingle(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader title="Earnings" description="All figures come from recorded payments and refunds. Money is only “paid out” once a transfer is confirmed." />

      {summary?.length ? (
        summary.map((s) => (
          <Section key={s.currency} title={`In ${s.currency}`}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Paid by guests" value={formatMoney(s.gross_minor, s.currency)} />
              <Stat label="Refunded to guests" value={formatMoney(s.refunded_minor, s.currency)} />
              <Stat label="Hidden Kenya commission" value={formatMoney(s.commission_minor, s.currency)} />
              <Stat label="Your earnings" value={formatMoney(s.net_minor, s.currency)} hint="Paid by guests − refunds − commission" />
              <Stat label="Upcoming" value={formatMoney(s.upcoming_minor, s.currency)} hint="Confirmed bookings that have not taken place yet" />
              <Stat label="Ready for payout" value={formatMoney(s.available_minor, s.currency)} hint="Experiences that have taken place, not yet in a payout" />
              <Stat label="Payout in progress" value={formatMoney(s.in_payout_minor, s.currency)} />
              <Stat label="Paid out" value={formatMoney(s.paid_out_minor, s.currency)} />
            </div>
            <p className="mt-4 text-sm text-stone">Payment processing fees of {formatMoney(s.gateway_fees_minor, s.currency)} were paid by Hidden Kenya and are not deducted from your earnings.</p>
          </Section>
        ))
      ) : (
        <EmptyState title="No earnings yet">Earnings appear here when guests pay for your bookings.</EmptyState>
      )}

      <Section title="Payout account" description="Earnings are sent to M-Pesa. Your number is passed directly to our payment provider; we store only a masked reference.">
        {account ? (
          <p className="mb-4">
            Current account: <span className="font-medium">{account.display_label}</span> <span className="text-sm text-stone">(updated {formatShortDate(account.updated_at)})</span>
          </p>
        ) : (
          <p className="mb-4 text-stone">No payout account yet.</p>
        )}
        <ActionForm action={savePayoutAccount} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" resetOnSuccess>
          <Field id="accountName" label="Name registered on M-Pesa">
            <Input id="accountName" name="accountName" required autoComplete="name" />
          </Field>
          <Field id="phone" label="M-Pesa number">
            <Input id="phone" name="phone" type="tel" required placeholder="0712 345 678" autoComplete="tel" />
          </Field>
          <SubmitButton pendingLabel="Saving…">{account ? "Replace account" : "Save account"}</SubmitButton>
        </ActionForm>
      </Section>

      <Section title="Payouts">
        {payouts?.length ? (
          <DataTable head={["Created", "Amount", "Status", "Reference", "Paid"]}>
            {payouts.map((p) => (
              <tr key={p.id}>
                <td className={td}>{formatShortDate(p.created_at)}</td>
                <td className={`${td} tabular-nums`}>{formatMoney(p.amount_minor, p.currency)}</td>
                <td className={td}>
                  <Badge tone={PAYOUT_STATUS[p.status].tone}>{PAYOUT_STATUS[p.status].label}</Badge>
                </td>
                <td className={td}>{p.transfer_reference ?? "—"}</td>
                <td className={td}>{p.paid_at ? formatShortDate(p.paid_at) : "—"}</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <p className="text-stone">No payouts yet.</p>
        )}
      </Section>
    </div>
  );
}

export default function EarningsPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content />
    </Suspense>
  );
}
