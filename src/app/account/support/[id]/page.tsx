import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { closeTicket, replyToTicket } from "@/actions/account";
import { DashboardSkeleton } from "@/components/layout/dashboard-shell";
import { Badge, PageHeader } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/field";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/ui/forms";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { TICKET_STATUS } from "@/lib/status";

export const metadata: Metadata = { title: "Support request" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser(`/account/support/${id}`);
  const supabase = await createClient();
  const { data: t } = await supabase.from("support_tickets").select("*, support_messages(id, body, is_staff, created_at)").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!t) notFound();
  const messages = [...t.support_messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <div className="space-y-6">
      <PageHeader title={t.subject} description={<Badge tone={TICKET_STATUS[t.status].tone}>{TICKET_STATUS[t.status].label}</Badge>} />
      <ol className="space-y-4">
        {messages.map((m) => (
          <li key={m.id} className={cn("max-w-2xl rounded-[var(--radius-card)] p-4", m.is_staff ? "bg-forest-soft" : "ml-auto bg-paper border border-sand-deep")}>
            <p className="text-sm font-medium">{m.is_staff ? "Hidden Kenya support" : "You"}</p>
            <p className="mt-1 whitespace-pre-line">{m.body}</p>
            <p className="mt-2 text-xs text-stone">{formatDateTime(m.created_at)}</p>
          </li>
        ))}
      </ol>
      {t.status !== "closed" ? (
        <div className="space-y-4">
          <ActionForm action={replyToTicket} className="space-y-3" resetOnSuccess>
            <input type="hidden" name="ticketId" value={t.id} />
            <Field id="body" label="Reply">
              <Textarea id="body" name="body" required rows={4} maxLength={5000} />
            </Field>
            <SubmitButton>Send reply</SubmitButton>
          </ActionForm>
          <ConfirmAction action={closeTicket} hidden={{ ticketId: t.id }} trigger="Close request" title="Close this request?" description="You can open a new request at any time." confirmLabel="Close request" tone="primary" />
        </div>
      ) : (
        <p className="text-stone">This request is closed.</p>
      )}
    </div>
  );
}

export default function TicketPage(props: PageProps<"/account/support/[id]">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
