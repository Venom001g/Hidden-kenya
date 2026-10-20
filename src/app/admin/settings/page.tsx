import type { Metadata } from "next";
import { Suspense } from "react";
import { endCommission, saveSetting, setCommission, setFeatured } from "@/actions/admin";
import { DashboardSkeleton, DataTable, Section, td } from "@/components/layout/dashboard-shell";
import { Alert, PageHeader } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/ui/forms";
import { requireAdmin } from "@/lib/data/admin";
import { formatShortDate } from "@/lib/format";
import { requestNow } from "@/lib/time";

export const metadata: Metadata = { title: "Settings" };

const SETTINGS = [
  { key: "support_email", label: "Public support email", hint: "Shown in the site footer. Leave empty to hide.", type: "email", fallback: "" },
  { key: "payment_hold_minutes", label: "Payment hold (minutes)", hint: "How long an instant booking holds places while the guest pays. Default 30.", type: "number", fallback: "30" },
  { key: "provider_response_hours", label: "Host response window (hours)", hint: "For request-to-book listings. Default 48.", type: "number", fallback: "48" },
  { key: "request_payment_hold_hours", label: "Payment window after acceptance (hours)", hint: "Default 24.", type: "number", fallback: "24" },
  { key: "review_window_days", label: "Review window (days)", hint: "Default 90.", type: "number", fallback: "90" },
] as const;

async function Content() {
  const { db } = await requireAdmin("/admin/settings");
  const now = requestNow();
  const [{ data: settings }, { data: rules }, { data: categories }, { data: live }] = await Promise.all([
    db.from("site_settings").select("key, value"),
    db.from("commission_rules").select("id, scope, rate_bps, active_from, active_until, note, experience_categories(name), provider_profiles(business_name)").order("active_from", { ascending: false }).limit(100),
    db.from("experience_categories").select("id, name").order("sort_order"),
    db.from("experiences").select("id, title, provider_profiles(business_name)").eq("status", "published").order("title").limit(500),
  ]);
  const value = (k: string) => {
    const v = settings?.find((s) => s.key === k)?.value;
    return v === undefined || v === null ? undefined : String(v);
  };
  const featured = ((settings?.find((s) => s.key === "featured_experiences")?.value as { id: string; sponsored: boolean }[] | undefined) ?? []);
  const active = (rules ?? []).filter((r) => !r.active_until || Date.parse(r.active_until) > now);
  const hasDefault = active.some((r) => r.scope === "default");

  return (
    <div className="space-y-8">
      <PageHeader title="Settings" />

      <Section title="Commission" description="Charged to hosts on what guests pay, net of refunds. The rate in force when a booking is made is fixed on that booking. Most specific rule wins: host, then category, then default.">
        {!hasDefault ? <Alert tone="warning" className="mb-4">No default rate is set. Guests cannot book until one is.</Alert> : null}
        {active.length ? (
          <DataTable head={["Applies to", "Rate", "Since", "Note", ""]}>
            {active.map((r) => (
              <tr key={r.id}>
                <td className={td}>{r.scope === "default" ? "Everyone (default)" : r.scope === "category" ? `Category: ${r.experience_categories?.name}` : `Host: ${r.provider_profiles?.business_name}`}</td>
                <td className={td}>{(r.rate_bps / 100).toFixed(2)}%</td>
                <td className={td}>{formatShortDate(r.active_from)}</td>
                <td className={td}>{r.note}</td>
                <td className={td}>
                  <ConfirmAction action={endCommission} hidden={{ ruleId: r.id }} trigger="End" title="End this rule?" description="New bookings use the next applicable rule. Existing bookings keep their rate." confirmLabel="End rule" />
                </td>
              </tr>
            ))}
          </DataTable>
        ) : null}
        <ActionForm action={setCommission} className="mt-5 grid gap-4 sm:grid-cols-4 sm:items-end">
          <Field id="scope" label="Applies to">
            <Select id="scope" name="scope" defaultValue="default">
              <option value="default">Everyone (default)</option>
              <option value="category">A category</option>
            </Select>
          </Field>
          <Field id="categoryId" label="Category" optional>
            <Select id="categoryId" name="categoryId" defaultValue="">
              <option value="">—</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="percent" label="Rate (%)">
            <Input id="percent" name="percent" inputMode="decimal" required />
          </Field>
          <Field id="note" label="Note" optional>
            <Input id="note" name="note" maxLength={300} />
          </Field>
          <SubmitButton className="w-fit">Set rate</SubmitButton>
        </ActionForm>
        <p className="mt-3 text-sm text-stone">Host-specific rates are set from each host&apos;s page.</p>
      </Section>

      <Section title="Booking and site settings">
        <div className="space-y-5">
          {SETTINGS.map((s) => (
            <ActionForm key={s.key} action={saveSetting} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="key" value={s.key} />
              <Field id={s.key} label={s.label} hint={s.hint} className="min-w-64 flex-1">
                <Input id={s.key} name="value" type={s.type} defaultValue={value(s.key) ?? s.fallback} aria-describedby={`${s.key}-hint`} />
              </Field>
              <SubmitButton variant="secondary">Save</SubmitButton>
            </ActionForm>
          ))}
        </div>
      </Section>

      <Section title="Homepage selection" description="Up to 8 live listings shown as “Selected by our team”. Tick “Sponsored” for any paid placement; it is labelled publicly.">
        {live?.length ? (
          <ActionForm action={setFeatured} className="space-y-3">
            <ul className="max-h-96 space-y-2 overflow-y-auto">
              {live.map((l) => {
                const f = featured.find((x) => x.id === l.id);
                return (
                  <li key={l.id} className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2">
                      <Checkbox name="experienceId" value={l.id} defaultChecked={Boolean(f)} /> {l.title} <span className="text-sm text-stone">({l.provider_profiles?.business_name})</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-sm">
                      <Checkbox name="sponsored" value={l.id} defaultChecked={f?.sponsored} /> Sponsored
                    </label>
                  </li>
                );
              })}
            </ul>
            <SubmitButton variant="secondary">Save selection</SubmitButton>
          </ActionForm>
        ) : (
          <p className="text-stone">No live listings yet.</p>
        )}
      </Section>
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content />
    </Suspense>
  );
}
