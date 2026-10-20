import type { Metadata } from "next";
import { Suspense } from "react";
import { deleteDraftListing, setListingState, submitListing } from "@/actions/listings";
import { DashboardSkeleton, Section } from "@/components/layout/dashboard-shell";
import { ListingForm } from "@/components/provider/listing-form";
import { ListingTabs } from "@/components/provider/listing-tabs";
import { Alert } from "@/components/ui/feedback";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/ui/forms";
import { getCategories, getCounties, getDestinations } from "@/lib/data/public";
import { requireOwnListing } from "@/lib/data/provider";
import { formatDateTime } from "@/lib/format";
import { listingToInput } from "@/lib/listing-defaults";

export const metadata: Metadata = { title: "Edit listing" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { listing, profile, supabase } = await requireOwnListing(id);
  const [categories, counties, destinations, { data: feedback }] = await Promise.all([
    getCategories(),
    getCounties(),
    getDestinations(),
    supabase
      .from("moderation_actions")
      .select("action, notes, created_at")
      .eq("target_type", "experience")
      .eq("target_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const latest = feedback?.[0];
  const canSubmit = ["draft", "changes_requested", "rejected"].includes(listing.status);
  const providerVerified = profile.verification_status === "verified";

  return (
    <div className="space-y-6">
      <ListingTabs id={id} title={listing.title} status={listing.status} active="details" />

      {latest && ["changes_requested", "rejected", "suspended"].includes(listing.status) && latest.notes ? (
        <Alert tone="warning" title="Feedback from our review team">
          {latest.notes}
          <span className="mt-1 block text-sm text-stone">{formatDateTime(latest.created_at)}</span>
        </Alert>
      ) : null}

      <Section title="Status and review">
        <div className="flex flex-wrap items-start gap-3">
          {canSubmit ? (
            providerVerified ? (
              <ActionForm action={submitListing}>
                <input type="hidden" name="experienceId" value={id} />
                <SubmitButton pendingLabel="Submitting…">Submit for review</SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-stone">You can submit listings once your host profile is verified.</p>
            )
          ) : null}
          {listing.status === "pending_review" ? (
            <ConfirmAction action={setListingState} hidden={{ experienceId: id, action: "withdraw" }} trigger="Withdraw from review" title="Withdraw this listing from review?" description="It goes back to draft. You can submit it again later." confirmLabel="Withdraw" tone="primary" />
          ) : null}
          {listing.status === "published" ? (
            <ConfirmAction action={setListingState} hidden={{ experienceId: id, action: "pause" }} trigger="Pause listing" title="Pause this listing?" description="It disappears from search and no new bookings can be made. Existing bookings stay confirmed." confirmLabel="Pause" tone="primary" />
          ) : null}
          {listing.status === "paused" ? (
            <ActionForm action={setListingState}>
              <input type="hidden" name="experienceId" value={id} />
              <input type="hidden" name="action" value="resume" />
              <SubmitButton>Make live again</SubmitButton>
            </ActionForm>
          ) : null}
          {!["archived", "suspended", "draft"].includes(listing.status) ? (
            <ConfirmAction action={setListingState} hidden={{ experienceId: id, action: "archive" }} trigger="Archive" title="Archive this listing?" description="It is removed from the site permanently. Existing bookings are not cancelled; honour or cancel them from Bookings." confirmLabel="Archive listing" />
          ) : null}
          {listing.status === "draft" ? (
            <ConfirmAction action={deleteDraftListing} hidden={{ experienceId: id }} trigger="Delete draft" title="Delete this draft?" description="The draft and its photos are deleted. This cannot be undone." confirmLabel="Delete draft" />
          ) : null}
        </div>
      </Section>

      <Section title="Listing details">
        <ListingForm
          listingId={id}
          isLive={["published", "paused"].includes(listing.status)}
          defaults={listingToInput(listing)}
          categories={categories.map((c) => ({ value: c.id, label: c.name }))}
          counties={counties.map((c) => ({ value: String(c.code), label: c.name }))}
          destinations={destinations.map((d) => ({ value: d.id, label: d.name }))}
        />
      </Section>
    </div>
  );
}

export default function EditListingPage(props: PageProps<"/provider/listings/[id]">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
