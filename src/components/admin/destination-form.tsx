import { saveDestination } from "@/actions/admin";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import type { Tables } from "@/lib/database.types";

export function DestinationForm({ destination, counties }: { destination?: Tables<"destinations">; counties: { code: number; name: string }[] }) {
  const d = destination;
  return (
    <ActionForm action={saveDestination} className="space-y-6">
      {d ? <input type="hidden" name="id" value={d.id} /> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="name" label="Name">
          <Input id="name" name="name" required maxLength={120} defaultValue={d?.name} />
        </Field>
        <Field id="countyCode" label="County">
          <Select id="countyCode" name="countyCode" defaultValue={d?.county_code ?? ""} required>
            <option value="">Choose…</option>
            {counties.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id="summary" label="Summary" hint="One or two sentences.">
        <Textarea id="summary" name="summary" rows={2} maxLength={300} defaultValue={d?.summary} aria-describedby="summary-hint" />
      </Field>
      <Field id="description" label="Description" hint="General information about the place, written from or checked against your sources. 100+ characters to publish.">
        <Textarea id="description" name="description" rows={8} maxLength={10000} defaultValue={d?.description} aria-describedby="description-hint" />
      </Field>
      <Field id="travelInformation" label="Getting there and practical information" optional hint="Only information you have verified, e.g. official park fees, access roads, opening hours.">
        <Textarea id="travelInformation" name="travelInformation" rows={4} maxLength={5000} defaultValue={d?.travel_information} aria-describedby="travelInformation-hint" />
      </Field>

      <fieldset className="space-y-4 rounded-[var(--radius-card)] border border-sand-deep p-4">
        <legend className="px-1 font-semibold">Source of this information</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="contentSourceName" label="Source name" hint="e.g. Kenya Wildlife Service, National Museums of Kenya">
            <Input id="contentSourceName" name="contentSourceName" maxLength={200} defaultValue={d?.content_source_name} aria-describedby="contentSourceName-hint" />
          </Field>
          <Field id="contentSourceUrl" label="Source URL" optional>
            <Input id="contentSourceUrl" name="contentSourceUrl" type="url" defaultValue={d?.content_source_url ?? ""} />
          </Field>
          <Field id="contentRetrievedOn" label="Retrieved on" optional>
            <Input id="contentRetrievedOn" name="contentRetrievedOn" type="date" defaultValue={d?.content_retrieved_on ?? ""} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-[var(--radius-card)] border border-sand-deep p-4">
        <legend className="px-1 font-semibold">Location</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="latitude" label="Latitude" optional>
            <Input id="latitude" name="latitude" inputMode="decimal" defaultValue={d?.latitude ?? ""} />
          </Field>
          <Field id="longitude" label="Longitude" optional>
            <Input id="longitude" name="longitude" inputMode="decimal" defaultValue={d?.longitude ?? ""} />
          </Field>
          <Field id="locationSource" label="How the coordinates were established" hint="Required with coordinates, e.g. “KWS park map, gate location”.">
            <Input id="locationSource" name="locationSource" maxLength={300} defaultValue={d?.location_source} aria-describedby="locationSource-hint" />
          </Field>
        </div>
      </fieldset>

      <Field id="status" label="Status">
        <Select id="status" name="status" defaultValue={d?.status ?? "draft"} className="max-w-xs">
          <option value="draft">Draft (not public)</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </Select>
      </Field>
      <SubmitButton>{d ? "Save destination" : "Create destination"}</SubmitButton>
    </ActionForm>
  );
}
