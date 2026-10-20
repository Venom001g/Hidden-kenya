import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { moderateListing } from "@/actions/admin";
import { DashboardSkeleton, Section } from "@/components/layout/dashboard-shell";
import { MapBlock } from "@/components/map-block";
import { Alert, Badge, PageHeader } from "@/components/ui/feedback";
import { ConfirmAction } from "@/components/ui/forms";
import { requireAdmin } from "@/lib/data/admin";
import { formatDateTime, formatDuration, formatMoney } from "@/lib/format";
import { publicImageUrl } from "@/lib/media";
import { accessibilityLabel, CANCELLATION_POLICIES } from "@/lib/site";
import { EXPERIENCE_STATUS } from "@/lib/status";

export const metadata: Metadata = { title: "Listing review" };

const CHECKLIST = [
  "Title and description are accurate, specific and free of misleading claims",
  "Price, inclusions and exclusions are clear",
  "Photos show this experience and have descriptive alt text",
  "Meeting point is specific enough to find",
  "Wildlife and community activities follow our community guidelines",
  "No contact details or off-platform payment requests in the text",
];

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { db } = await requireAdmin(`/admin/listings/${id}`);
  const [{ data: l }, { data: images }, { data: rules }, { data: history }] = await Promise.all([
    db.from("experiences").select("*, provider_profiles(id, business_name, verification_status), experience_categories(name), counties(name), destinations(name)").eq("id", id).maybeSingle(),
    db.from("experience_images").select("*").eq("experience_id", id).order("position"),
    db.from("experience_availability").select("weekdays, start_time, capacity, valid_from, valid_until, is_active").eq("experience_id", id),
    db.from("moderation_actions").select("action, notes, created_at").eq("target_type", "experience").eq("target_id", id).order("created_at", { ascending: false }),
  ]);
  if (!l) notFound();
  const s = EXPERIENCE_STATUS[l.status];
  const providerOk = l.provider_profiles?.verification_status === "verified";

  return (
    <div className="space-y-6">
      <PageHeader
        title={l.title}
        description={
          <>
            <Badge tone={s.tone}>{s.label}</Badge>{" "}
            <Link href={`/admin/providers/${l.provider_profiles?.id}`} className="ml-2 underline">
              {l.provider_profiles?.business_name}
            </Link>
          </>
        }
      />
      {!providerOk ? <Alert tone="warning">The host is not verified. Verify the host before approving this listing.</Alert> : null}

      <Section title="Decision">
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-stone">
          {CHECKLIST.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {l.status === "pending_review" ? (
            <>
              <ConfirmAction action={moderateListing} hidden={{ experienceId: id, decision: "approve" }} trigger="Approve and publish" triggerVariant="primary" title="Publish this listing?" description="It becomes visible and bookable immediately." confirmLabel="Publish" tone="primary" reason={{ label: "Note to the host (optional)" }} />
              <ConfirmAction action={moderateListing} hidden={{ experienceId: id, decision: "request_changes" }} trigger="Request changes" title="Request changes?" description="The host sees your note and can resubmit." confirmLabel="Send back" tone="primary" reason={{ label: "What needs to change", required: true }} />
              <ConfirmAction action={moderateListing} hidden={{ experienceId: id, decision: "reject" }} trigger="Reject" title="Reject this listing?" description="Use when the experience cannot be listed." confirmLabel="Reject" reason={{ label: "Reason (shared with the host)", required: true }} />
            </>
          ) : null}
          {["published", "paused"].includes(l.status) ? (
            <ConfirmAction action={moderateListing} hidden={{ experienceId: id, decision: "suspend" }} trigger="Suspend" triggerVariant="danger" title="Suspend this listing?" description="It is hidden and cannot be booked. Existing bookings remain." confirmLabel="Suspend" reason={{ label: "Reason (shared with the host)", required: true }} />
          ) : null}
          {l.status === "suspended" ? (
            <ConfirmAction action={moderateListing} hidden={{ experienceId: id, decision: "reinstate" }} trigger="Reinstate" title="Reinstate this listing?" description="It becomes visible again." confirmLabel="Reinstate" tone="primary" reason={{ label: "Note (optional)" }} />
          ) : null}
          {l.status !== "archived" ? (
            <ConfirmAction action={moderateListing} hidden={{ experienceId: id, decision: "archive" }} trigger="Archive" title="Archive this listing?" description="It is removed permanently from the site." confirmLabel="Archive" reason={{ label: "Note (optional)" }} />
          ) : null}
        </div>
      </Section>

      <Section title="Content">
        {images?.length ? (
          <ul className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.map((img) => (
              <li key={img.id}>
                <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-sand">
                  <Image src={publicImageUrl("experience-media", img.storage_path)} alt={img.alt_text} fill sizes="25vw" className="object-cover" />
                </div>
                <p className="mt-1 text-xs text-stone">{img.alt_text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Alert tone="warning" className="mb-4">No photos.</Alert>
        )}
        <dl className="grid gap-x-6 gap-y-3 text-[0.95rem] sm:grid-cols-2">
          <div><dt className="text-sm text-stone">Type</dt><dd>{l.experience_categories?.name}</dd></div>
          <div><dt className="text-sm text-stone">Where</dt><dd>{l.destinations?.name ? `${l.destinations.name}, ` : ""}{l.counties?.name}</dd></div>
          <div><dt className="text-sm text-stone">Price</dt><dd>{formatMoney(l.price_minor, l.currency)} {l.pricing_model.replace("_", " ")}</dd></div>
          <div><dt className="text-sm text-stone">Duration / group</dt><dd>{formatDuration(l.duration_minutes)} · {l.min_participants}–{l.max_participants} guests</dd></div>
          <div><dt className="text-sm text-stone">Booking</dt><dd>{l.booking_mode} · {l.lead_time_hours} h notice · {CANCELLATION_POLICIES[l.cancellation_policy].label}</dd></div>
          <div><dt className="text-sm text-stone">Accessibility</dt><dd>{l.accessibility_features.map(accessibilityLabel).join(", ") || "—"}</dd></div>
        </dl>
        <div className="mt-5 space-y-3">
          <p className="font-medium">{l.summary}</p>
          <p className="whitespace-pre-line">{l.description}</p>
          <p><span className="text-stone">Included:</span> {l.included.join("; ") || "—"}</p>
          <p><span className="text-stone">Not included:</span> {l.excluded.join("; ") || "—"}</p>
          <p><span className="text-stone">Meeting point:</span> {l.meeting_point_name}. {l.meeting_point_instructions}</p>
          {l.meeting_latitude !== null && l.meeting_longitude !== null ? <MapBlock point={{ lat: l.meeting_latitude, lng: l.meeting_longitude }} label={l.meeting_point_name} /> : null}
        </div>
      </Section>

      <Section title="Availability">
        {rules?.length ? (
          <ul className="space-y-1 text-sm">
            {rules.map((r, i) => (
              <li key={i}>
                {r.is_active ? "" : "(off) "}Days {r.weekdays.join(",")} at {r.start_time.slice(0, 5)}, {r.capacity} places, {r.valid_from} → {r.valid_until ?? "open-ended"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone">No availability.</p>
        )}
      </Section>

      <Section title="History">
        {history?.length ? (
          <ul className="space-y-1 text-sm">
            {history.map((h, i) => (
              <li key={i}>
                <span className="text-stone">{formatDateTime(h.created_at)}</span> · {h.action.replace(/_/g, " ")}
                {h.notes ? `: ${h.notes}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone">No decisions yet.</p>
        )}
      </Section>
    </div>
  );
}

export default function AdminListingPage(props: PageProps<"/admin/listings/[id]">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
