import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { reviewDocument, reviewProvider, setCommission } from "@/actions/admin";
import { OpenDocumentButton } from "@/components/admin/open-document-button";
import { DashboardSkeleton, Section } from "@/components/layout/dashboard-shell";
import { Alert, Badge, PageHeader } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/ui/forms";
import { requireAdmin } from "@/lib/data/admin";
import { formatDateTime, formatShortDate } from "@/lib/format";
import { DOCUMENT_TYPES, EXPERIENCE_STATUS, PROVIDER_STATUS } from "@/lib/status";

export const metadata: Metadata = { title: "Host review" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { db } = await requireAdmin(`/admin/providers/${id}`);
  const [{ data: p }, { data: d }, { data: docs }, { data: cats }, { data: listings }, { data: history }, { data: payout }, { data: rules }] = await Promise.all([
    db.from("provider_profiles").select("*").eq("id", id).maybeSingle(),
    db.from("provider_private_details").select("*").eq("provider_id", id).maybeSingle(),
    db.from("provider_verification_documents").select("*").eq("provider_id", id).order("created_at", { ascending: false }),
    db.from("provider_service_categories").select("experience_categories(name)").eq("provider_id", id),
    db.from("experiences").select("id, title, status").eq("provider_id", id).order("updated_at", { ascending: false }),
    db.from("moderation_actions").select("action, notes, created_at, target_type").eq("provider_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("provider_payout_accounts").select("display_label").eq("provider_id", id).maybeSingle(),
    db.from("commission_rules").select("id, rate_bps, active_from, active_until").eq("scope", "provider").eq("provider_id", id).order("active_from", { ascending: false }),
  ]);
  if (!p || !d) notFound();
  const s = PROVIDER_STATUS[p.verification_status];
  const activeRule = (rules ?? []).find((r) => !r.active_until);

  return (
    <div className="space-y-6">
      <PageHeader title={p.business_name} description={<Badge tone={s.tone}>{s.label}</Badge>} />

      <Section title="Decision">
        <div className="flex flex-wrap gap-2">
          {["pending_review", "changes_requested", "rejected"].includes(p.verification_status) ? (
            <>
              <ConfirmAction action={reviewProvider} hidden={{ providerId: id, decision: "verify" }} trigger="Verify host" triggerVariant="primary" title="Verify this host?" description="They can publish listings (after listing review) and take bookings. At least one accepted document is required." confirmLabel="Verify" tone="primary" reason={{ label: "Note to the host (optional)" }} />
              <ConfirmAction action={reviewProvider} hidden={{ providerId: id, decision: "request_changes" }} trigger="Request changes" title="Request changes?" description="The host sees your note and can resubmit." confirmLabel="Send back" tone="primary" reason={{ label: "What needs to change", required: true }} />
              <ConfirmAction action={reviewProvider} hidden={{ providerId: id, decision: "reject" }} trigger="Reject" title="Reject this host?" description="Use for applications that cannot be verified." confirmLabel="Reject" reason={{ label: "Reason (shared with the host)", required: true }} />
            </>
          ) : null}
          {p.verification_status === "verified" ? (
            <ConfirmAction action={reviewProvider} hidden={{ providerId: id, decision: "suspend" }} trigger="Suspend host" triggerVariant="danger" title="Suspend this host?" description="All their listings are hidden immediately and new bookings are blocked. Existing bookings are not cancelled automatically." confirmLabel="Suspend" reason={{ label: "Reason (shared with the host)", required: true }} />
          ) : null}
          {p.verification_status === "suspended" ? (
            <ConfirmAction action={reviewProvider} hidden={{ providerId: id, decision: "reinstate" }} trigger="Reinstate" title="Reinstate this host?" description="Their published listings become visible again." confirmLabel="Reinstate" tone="primary" reason={{ label: "Note (optional)" }} />
          ) : null}
          {p.verification_status === "draft" ? <p className="text-stone">The host has not submitted their profile yet.</p> : null}
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Public profile">
          <dl className="space-y-2 text-[0.95rem]">
            <div><dt className="text-sm text-stone">Operates in</dt><dd>{p.operating_areas || "—"}</dd></div>
            <div><dt className="text-sm text-stone">Established</dt><dd>{p.year_established ?? "—"}</dd></div>
            <div><dt className="text-sm text-stone">Website</dt><dd className="break-all">{p.website_url ?? "—"}</dd></div>
            <div><dt className="text-sm text-stone">Categories</dt><dd>{(cats ?? []).map((c) => c.experience_categories?.name).join(", ") || "—"}</dd></div>
            <div><dt className="text-sm text-stone">Description</dt><dd className="whitespace-pre-line">{p.description || "—"}</dd></div>
          </dl>
        </Section>
        <Section title="Private details">
          <dl className="space-y-2 text-[0.95rem]">
            <div><dt className="text-sm text-stone">Legal name</dt><dd>{d.legal_name || "—"}</dd></div>
            <div><dt className="text-sm text-stone">Registration number</dt><dd>{d.registration_number || "—"}</dd></div>
            <div><dt className="text-sm text-stone">Tourism licence number</dt><dd>{d.tourism_licence_number || "—"}</dd></div>
            <div><dt className="text-sm text-stone">Contact</dt><dd>{d.contact_email} · {d.contact_phone || "no phone"}</dd></div>
            <div><dt className="text-sm text-stone">Payout account</dt><dd>{payout?.display_label ?? "Not added"}</dd></div>
            <div><dt className="text-sm text-stone">Licence check</dt><dd>{p.licence_checked_at ? `Accepted ${formatShortDate(p.licence_checked_at)}` : "Not checked"}</dd></div>
          </dl>
        </Section>
      </div>

      <Section title="Documents" description="Compare each document with the details above. Accepting a tourism licence marks the host as licence-checked.">
        {docs?.length ? (
          <ul className="divide-y divide-sand-deep">
            {docs.map((doc) => (
              <li key={doc.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{DOCUMENT_TYPES[doc.document_type]}</p>
                  <p className="text-sm text-stone">
                    {doc.original_filename} · {(doc.size_bytes / 1024).toFixed(0)} KB · {formatShortDate(doc.created_at)}
                  </p>
                  {doc.review_notes ? <p className="text-sm">Note: {doc.review_notes}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={doc.status === "accepted" ? "forest" : doc.status === "rejected" ? "danger" : "terracotta"}>{doc.status}</Badge>
                  <OpenDocumentButton documentId={doc.id} />
                  {doc.status !== "accepted" ? (
                    <ActionForm action={reviewDocument}>
                      <input type="hidden" name="documentId" value={doc.id} />
                      <input type="hidden" name="decision" value="accepted" />
                      <SubmitButton size="sm">Accept</SubmitButton>
                    </ActionForm>
                  ) : null}
                  {doc.status !== "rejected" ? (
                    <ConfirmAction action={reviewDocument} hidden={{ documentId: doc.id, decision: "rejected" }} trigger="Reject" title="Reject this document?" description="The host sees your note." confirmLabel="Reject" reason={{ label: "Why (shared with the host)", required: true }} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Alert tone="warning">No documents uploaded.</Alert>
        )}
      </Section>

      <Section title="Commission override" description={activeRule ? `This host pays ${(activeRule.rate_bps / 100).toFixed(2)}% since ${formatShortDate(activeRule.active_from)}.` : "This host pays the default or category rate."}>
        <ActionForm action={setCommission} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="scope" value="provider" />
          <input type="hidden" name="providerId" value={id} />
          <Field id="percent" label="Rate (%)">
            <Input id="percent" name="percent" inputMode="decimal" required className="w-28" />
          </Field>
          <Field id="note" label="Note" optional>
            <Input id="note" name="note" maxLength={300} />
          </Field>
          <SubmitButton variant="secondary">Set host rate</SubmitButton>
        </ActionForm>
      </Section>

      <Section title="Listings">
        {listings?.length ? (
          <ul className="space-y-1">
            {listings.map((l) => (
              <li key={l.id}>
                <Link href={`/admin/listings/${l.id}`} className="text-forest hover:underline">
                  {l.title}
                </Link>{" "}
                <Badge tone={EXPERIENCE_STATUS[l.status].tone}>{EXPERIENCE_STATUS[l.status].label}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone">No listings.</p>
        )}
      </Section>

      <Section title="History">
        {history?.length ? (
          <ul className="space-y-2 text-sm">
            {history.map((h, i) => (
              <li key={i}>
                <span className="text-stone">{formatDateTime(h.created_at)}</span> · {h.target_type} {h.action.replace(/_/g, " ")}
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

export default function AdminProviderPage(props: PageProps<"/admin/providers/[id]">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
