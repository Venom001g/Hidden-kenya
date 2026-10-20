import type { Metadata } from "next";
import { Suspense } from "react";
import { createTicket } from "@/actions/account";
import { DashboardSkeleton, Section } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { requireUser } from "@/lib/auth";
import { formatShortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New support request" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser("/account/support/new");
  const supabase = await createClient();
  const { data: bookings } = await supabase.from("bookings").select("id, reference, starts_at, experiences(title)").eq("customer_id", user.id).order("starts_at", { ascending: false }).limit(30);
  const preselect = typeof sp.booking === "string" ? sp.booking : "";
  return (
    <div className="space-y-6">
      <PageHeader title="New support request" />
      <Section title="How can we help?">
        <ActionForm action={createTicket} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="category" label="Topic">
              <Select id="category" name="category" defaultValue={preselect ? "booking" : "other"}>
                <option value="booking">A booking</option>
                <option value="payment">A payment or refund</option>
                <option value="account">My account</option>
                <option value="listing">A listing</option>
                <option value="safety">Safety concern</option>
                <option value="other">Something else</option>
              </Select>
            </Field>
            <Field id="bookingId" label="Booking" optional>
              <Select id="bookingId" name="bookingId" defaultValue={preselect}>
                <option value="">Not about a booking</option>
                {(bookings ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.reference} · {b.experiences?.title} · {formatShortDate(b.starts_at)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field id="subject" label="Subject">
            <Input id="subject" name="subject" required minLength={4} maxLength={160} />
          </Field>
          <Field id="body" label="Details" hint="Please do not include card numbers or passwords.">
            <Textarea id="body" name="body" required minLength={10} maxLength={5000} rows={6} aria-describedby="body-hint" />
          </Field>
          <SubmitButton pendingLabel="Sending…">Send request</SubmitButton>
        </ActionForm>
      </Section>
    </div>
  );
}

export default function NewTicketPage(props: PageProps<"/account/support/new">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
