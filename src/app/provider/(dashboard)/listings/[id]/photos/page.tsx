import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { deleteListingImage, makeCoverImage, uploadListingImage } from "@/actions/listings";
import { DashboardSkeleton, Section } from "@/components/layout/dashboard-shell";
import { ListingTabs } from "@/components/provider/listing-tabs";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/ui/forms";
import { requireOwnListing } from "@/lib/data/provider";
import { publicImageUrl } from "@/lib/media";

export const metadata: Metadata = { title: "Photos" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { listing, supabase } = await requireOwnListing(id);
  const { data: images } = await supabase.from("experience_images").select("*").eq("experience_id", id).order("position").order("created_at");
  const live = ["published", "paused"].includes(listing.status);
  return (
    <div className="space-y-6">
      <ListingTabs id={id} title={listing.title} status={listing.status} active="photos" />
      {live ? <Alert tone="warning">Adding a photo to a live listing sends it back to review.</Alert> : null}
      <Section title="Photos" description="Use your own photos of this experience. The first photo is the cover. Up to 12 photos, JPG, PNG or WebP, 4 MB each.">
        {images?.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((img, i) => (
              <li key={img.id} className="space-y-2">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-card)] bg-sand">
                  <Image src={publicImageUrl("experience-media", img.storage_path)} alt={img.alt_text} fill sizes="33vw" className="object-cover" />
                  {i === 0 ? <Badge className="absolute left-2 top-2 bg-paper">Cover</Badge> : null}
                </div>
                <p className="text-sm">{img.alt_text}</p>
                <div className="flex gap-2">
                  {i > 0 ? (
                    <ActionForm action={makeCoverImage}>
                      <input type="hidden" name="imageId" value={img.id} />
                      <SubmitButton size="sm" variant="secondary">
                        Make cover
                      </SubmitButton>
                    </ActionForm>
                  ) : null}
                  <ConfirmAction action={deleteListingImage} hidden={{ imageId: img.id }} trigger="Remove" title="Remove this photo?" description="It is deleted from the listing." confirmLabel="Remove photo" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No photos yet">Listings need at least one photo before they can be submitted.</EmptyState>
        )}
      </Section>

      <Section title="Add a photo" description="Location data and other metadata are removed from photos when you upload them.">
        <ActionForm action={uploadListingImage} className="space-y-4" resetOnSuccess>
          <input type="hidden" name="experienceId" value={id} />
          <Field id="file" label="Photo">
            <Input id="file" name="file" type="file" required accept="image/jpeg,image/png,image/webp" className="py-2" />
          </Field>
          <Field id="altText" label="Description of the photo" hint="For people using screen readers, e.g. “Guide pointing out a turaco in the forest canopy”.">
            <Input id="altText" name="altText" required minLength={3} maxLength={250} aria-describedby="altText-hint" />
          </Field>
          <Field id="credit" label="Photographer credit" optional>
            <Input id="credit" name="credit" maxLength={200} />
          </Field>
          <label className="flex items-start gap-2.5">
            <Checkbox name="rights" required className="mt-0.5" />
            <span>I took this photo or have permission to use it on Hidden Kenya.</span>
          </label>
          <SubmitButton pendingLabel="Uploading…">Upload photo</SubmitButton>
        </ActionForm>
      </Section>
    </div>
  );
}

export default function PhotosPage(props: PageProps<"/provider/listings/[id]/photos">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
