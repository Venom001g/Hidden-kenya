import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deleteDestinationImage, uploadDestinationImage } from "@/actions/admin";
import { DestinationForm } from "@/components/admin/destination-form";
import { DashboardSkeleton, Section } from "@/components/layout/dashboard-shell";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/ui/forms";
import { requireAdmin } from "@/lib/data/admin";
import { getCounties } from "@/lib/data/public";
import { publicImageUrl } from "@/lib/media";

export const metadata: Metadata = { title: "Edit destination" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { db } = await requireAdmin(`/admin/destinations/${id}`);
  const [{ data: d }, { data: images }, counties] = await Promise.all([
    db.from("destinations").select("*").eq("id", id).maybeSingle(),
    db.from("destination_images").select("*").eq("destination_id", id).order("position"),
    getCounties(),
  ]);
  if (!d) notFound();
  return (
    <div className="space-y-6">
      <PageHeader title={d.name} actions={d.status === "published" ? <ButtonLink href={`/destinations/${d.slug}`} variant="secondary">View page</ButtonLink> : null} />
      <Section title="Details">
        <DestinationForm destination={d} counties={counties} />
      </Section>
      <Section title="Photos" description="Use only photos you own or are licensed to use. Credit and licence are shown publicly.">
        {images?.length ? (
          <ul className="mb-6 grid gap-4 sm:grid-cols-3">
            {images.map((img) => (
              <li key={img.id} className="space-y-1">
                <div className="relative aspect-[3/2] overflow-hidden rounded-md bg-sand">
                  <Image src={publicImageUrl("destination-media", img.storage_path)} alt={img.alt_text} fill sizes="33vw" className="object-cover" />
                </div>
                <p className="text-xs text-stone">
                  {img.credit} · {img.licence}
                </p>
                <ConfirmAction action={deleteDestinationImage} hidden={{ imageId: img.id }} trigger="Remove" title="Remove this photo?" description="It is deleted." confirmLabel="Remove" />
              </li>
            ))}
          </ul>
        ) : null}
        <ActionForm action={uploadDestinationImage} className="grid gap-4 sm:grid-cols-2" resetOnSuccess>
          <input type="hidden" name="destinationId" value={id} />
          <Field id="file" label="Photo">
            <Input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp" required className="py-2" />
          </Field>
          <Field id="altText" label="Description (alt text)">
            <Input id="altText" name="altText" required maxLength={250} />
          </Field>
          <Field id="credit" label="Credit">
            <Input id="credit" name="credit" required maxLength={200} />
          </Field>
          <Field id="licence" label="Licence">
            <Input id="licence" name="licence" required maxLength={120} placeholder="e.g. CC BY 4.0" />
          </Field>
          <Field id="sourceUrl" label="Source URL" optional className="sm:col-span-2">
            <Input id="sourceUrl" name="sourceUrl" type="url" />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton pendingLabel="Uploading…">Add photo</SubmitButton>
          </div>
        </ActionForm>
      </Section>
    </div>
  );
}

export default function EditDestinationPage(props: PageProps<"/admin/destinations/[id]">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
