import type { Metadata } from "next";
import { Suspense } from "react";
import { addAvailabilityRule, addException, deleteException, deleteRule, setRuleActive } from "@/actions/listings";
import { DashboardSkeleton, Section } from "@/components/layout/dashboard-shell";
import { ListingTabs } from "@/components/provider/listing-tabs";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/ui/forms";
import { requireOwnListing } from "@/lib/data/provider";
import { formatDate, formatShortDate, formatTime, nairobiDate } from "@/lib/format";

export const metadata: Metadata = { title: "Dates and capacity" };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dateOnly = (d: string) => formatShortDate(`${d}T12:00:00+03:00`);

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { listing, supabase } = await requireOwnListing(id);
  const today = nairobiDate();
  const [{ data: rules }, { data: exceptions }, { data: upcoming }] = await Promise.all([
    supabase.from("experience_availability").select("*").eq("experience_id", id).order("valid_from"),
    supabase.from("availability_exceptions").select("*").eq("experience_id", id).gte("exception_date", today).order("exception_date"),
    supabase.rpc("get_experience_availability", { p_experience_id: id, p_from: today, p_to: null as unknown as string }),
  ]);
  const next = (upcoming ?? []).slice(0, 30);

  return (
    <div className="space-y-6">
      <ListingTabs id={id} title={listing.title} status={listing.status} active="availability" />
      <p className="text-stone">
        All times are Nairobi time (EAT). Changes here take effect immediately and do not need review. Capacity is the total number of guests across all bookings for one departure.
      </p>

      <Section title="Schedules">
        {rules?.length ? (
          <ul className="divide-y divide-sand-deep">
            {rules.map((r) => {
              const oneOff = r.valid_until === r.valid_from;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">
                      {oneOff ? dateOnly(r.valid_from) : r.weekdays.length === 7 ? "Every day" : r.weekdays.map((d) => DAYS[d - 1]).join(", ")} at {r.start_time.slice(0, 5)}
                    </p>
                    <p className="text-sm text-stone">
                      {r.capacity} places per departure
                      {oneOff ? " · one-off date" : ` · from ${dateOnly(r.valid_from)}${r.valid_until ? ` until ${dateOnly(r.valid_until)}` : ", no end date"}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!r.is_active ? <Badge tone="outline">Off</Badge> : null}
                    <ActionForm action={setRuleActive}>
                      <input type="hidden" name="ruleId" value={r.id} />
                      <input type="hidden" name="active" value={String(!r.is_active)} />
                      <SubmitButton size="sm" variant="secondary">
                        {r.is_active ? "Turn off" : "Turn on"}
                      </SubmitButton>
                    </ActionForm>
                    <ConfirmAction action={deleteRule} hidden={{ ruleId: r.id }} trigger="Delete" title="Delete this schedule?" description="Future departures from it disappear. Bookings already made are not cancelled." confirmLabel="Delete schedule" />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No dates yet">Add a weekly schedule or a single date so guests can book.</EmptyState>
        )}
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Add a weekly schedule">
          <ActionForm action={addAvailabilityRule} className="space-y-4" resetOnSuccess>
            <input type="hidden" name="experienceId" value={id} />
            <input type="hidden" name="mode" value="weekly" />
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Days</legend>
              <div className="flex flex-wrap gap-3">
                {DAYS.map((d, i) => (
                  <label key={d} className="flex items-center gap-1.5">
                    <Checkbox name="weekdays" value={i + 1} /> {d}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-4">
              <Field id="w-start" label="Start time">
                <Input id="w-start" name="startTime" type="time" required />
              </Field>
              <Field id="w-cap" label="Places per departure">
                <Input id="w-cap" name="capacity" type="number" min={1} max={1000} required defaultValue={listing.max_participants} />
              </Field>
              <Field id="w-from" label="From">
                <Input id="w-from" name="validFrom" type="date" min={today} required defaultValue={today} />
              </Field>
              <Field id="w-until" label="Until" optional>
                <Input id="w-until" name="validUntil" type="date" min={today} />
              </Field>
            </div>
            <SubmitButton>Add schedule</SubmitButton>
          </ActionForm>
        </Section>

        <Section title="Add a single date">
          <ActionForm action={addAvailabilityRule} className="space-y-4" resetOnSuccess>
            <input type="hidden" name="experienceId" value={id} />
            <input type="hidden" name="mode" value="one-off" />
            <div className="grid grid-cols-2 gap-4">
              <Field id="o-date" label="Date" className="col-span-2">
                <Input id="o-date" name="date" type="date" min={today} required />
              </Field>
              <Field id="o-start" label="Start time">
                <Input id="o-start" name="startTime" type="time" required />
              </Field>
              <Field id="o-cap" label="Places">
                <Input id="o-cap" name="capacity" type="number" min={1} max={1000} required defaultValue={listing.max_participants} />
              </Field>
            </div>
            <SubmitButton>Add date</SubmitButton>
          </ActionForm>
        </Section>
      </div>

      <Section title="Closures and capacity changes" description="Close a day (for example a public holiday) or change capacity for one date.">
        {exceptions?.length ? (
          <ul className="mb-5 divide-y divide-sand-deep">
            {exceptions.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <p>
                  <span className="font-medium">{dateOnly(x.exception_date)}</span>
                  {x.start_time ? ` at ${x.start_time.slice(0, 5)}` : " (all day)"}: {x.kind === "closed" ? "closed" : `capacity ${x.capacity_override}`}
                  {x.reason ? <span className="text-stone"> · {x.reason}</span> : null}
                </p>
                <ConfirmAction action={deleteException} hidden={{ exceptionId: x.id }} trigger="Remove" title="Remove this exception?" description="The normal schedule applies again on that date." confirmLabel="Remove" tone="primary" />
              </li>
            ))}
          </ul>
        ) : null}
        <ActionForm action={addException} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end" resetOnSuccess>
          <input type="hidden" name="experienceId" value={id} />
          <Field id="x-date" label="Date">
            <Input id="x-date" name="date" type="date" min={today} required />
          </Field>
          <Field id="x-time" label="Start time" optional>
            <Input id="x-time" name="startTime" type="time" />
          </Field>
          <Field id="x-kind" label="Change">
            <Select id="x-kind" name="kind" defaultValue="closed">
              <option value="closed">Close</option>
              <option value="capacity_override">Change capacity</option>
            </Select>
          </Field>
          <Field id="x-cap" label="New capacity" optional>
            <Input id="x-cap" name="capacity" type="number" min={0} max={1000} />
          </Field>
          <Field id="x-reason" label="Note" optional>
            <Input id="x-reason" name="reason" maxLength={300} />
          </Field>
          <SubmitButton className="sm:col-span-2 lg:col-span-5 lg:w-fit">Save exception</SubmitButton>
        </ActionForm>
      </Section>

      <Section title="Next bookable departures" description="What guests can book right now, after notice periods and existing bookings.">
        {next.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {next.map((s) => (
              <li key={s.starts_at} className="flex items-center justify-between rounded-[var(--radius-control)] border border-sand-deep px-3 py-2 text-sm">
                <span>
                  {formatDate(s.starts_at)}, {formatTime(s.starts_at)}
                </span>
                <span className={s.seats_available ? "text-forest" : "text-danger"}>
                  {s.seats_available}/{s.capacity} left
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone">No bookable departures in the next 60 days.</p>
        )}
      </Section>
    </div>
  );
}

export default function AvailabilityPage(props: PageProps<"/provider/listings/[id]/availability">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
