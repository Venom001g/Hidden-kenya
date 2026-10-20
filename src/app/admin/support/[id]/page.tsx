import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { setTicketStatus, staffReply } from "@/actions/admin";
import { DashboardSkeleton } from "@/components/layout/dashboard-shell";
import { Badge, PageHeader } from "@/components/ui/feedback";
import { Field, Select, Textarea } from "@/components/ui/field";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { requireAdmin } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/format";
import { TICKET_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Support request" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { db } = await requireAdmin(`/admin/support/${id}`);
  const { data: t } = await db.from("support_tickets").select("*, support_messages(id, body, is_staff, created_at), bookings(id, reference)").eq("id", id).maybeSingle();
  if (!t) notFound();
  const messages = [...t.support_messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <div className="space-y-6">
      <PageHeader
        title={t.subject}
        description={
          <>
            <Badge tone={TICKET_STATUS[t.status].tone}>{TICKET_STATUS[t.status].label}</Badge> · {t.category}
            {t.bookings ? (
              <>
                {" "}
                · booking{" "}
                <Link href={`/admin/bookings/${t.bookings.id}`} className="underline">
                  {t.bookings.reference}
                </Link>
              </>
            ) : null}
          </>
        }
      />
      <ol className="space-y-4">
        {messages.map((m) => (
          <li key={m.id} className={cn("max-w-2xl rounded-[var(--radius-card)] p-4", m.is_staff ? "ml-auto bg-forest-soft" : "border border-sand-deep bg-paper")}>
            <p className="text-sm font-medium">{m.is_staff ? "Staff" : "Customer"}</p>
            <p className="mt-1 whitespace-pre-line">{m.body}</p>
            <p className="mt-2 text-xs text-stone">{formatDateTime(m.created_at)}</p>
          </li>
        ))}
      </ol>
      <ActionForm action={staffReply} className="space-y-3" resetOnSuccess>
        <input type="hidden" name="ticketId" value={t.id} />
        <Field id="body" label="Reply to the customer">
          <Textarea id="body" name="body" rows={4} required maxLength={5000} />
        </Field>
        <SubmitButton>Send reply</SubmitButton>
      </ActionForm>
      <ActionForm action={setTicketStatus} className="flex items-end gap-3">
        <input type="hidden" name="ticketId" value={t.id} />
        <Field id="status" label="Status">
          <Select id="status" name="status" defaultValue={t.status}>
            {Object.entries(TICKET_STATUS).map(([v, s]) => (
              <option key={v} value={v}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton variant="secondary">Update status</SubmitButton>
      </ActionForm>
    </div>
  );
}

export default function AdminTicketPage(props: PageProps<"/admin/support/[id]">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
