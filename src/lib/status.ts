import type { Enums } from "@/lib/database.types";

type Tone = "neutral" | "forest" | "terracotta" | "danger" | "outline";

export const BOOKING_STATUS: Record<Enums<"booking_status">, { label: string; tone: Tone }> = {
  pending_provider_confirmation: { label: "Awaiting host", tone: "terracotta" },
  pending_payment: { label: "Awaiting payment", tone: "terracotta" },
  payment_failed: { label: "Payment failed", tone: "danger" },
  confirmed: { label: "Confirmed", tone: "forest" },
  refund_pending: { label: "Refund in progress", tone: "terracotta" },
  refunded: { label: "Refunded", tone: "outline" },
  cancelled: { label: "Cancelled", tone: "outline" },
  expired: { label: "Expired", tone: "outline" },
  completed: { label: "Completed", tone: "neutral" },
};

export const EXPERIENCE_STATUS: Record<Enums<"experience_status">, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "outline" },
  pending_review: { label: "In review", tone: "terracotta" },
  changes_requested: { label: "Changes requested", tone: "danger" },
  published: { label: "Live", tone: "forest" },
  paused: { label: "Paused", tone: "neutral" },
  archived: { label: "Archived", tone: "outline" },
  rejected: { label: "Rejected", tone: "danger" },
  suspended: { label: "Suspended", tone: "danger" },
};

export const PROVIDER_STATUS: Record<Enums<"provider_status">, { label: string; tone: Tone }> = {
  draft: { label: "Not submitted", tone: "outline" },
  pending_review: { label: "In review", tone: "terracotta" },
  verified: { label: "Verified", tone: "forest" },
  changes_requested: { label: "Changes requested", tone: "danger" },
  rejected: { label: "Rejected", tone: "danger" },
  suspended: { label: "Suspended", tone: "danger" },
};

export const PAYMENT_STATUS: Record<Enums<"payment_status">, { label: string; tone: Tone }> = {
  initiated: { label: "Started", tone: "outline" },
  pending: { label: "Pending", tone: "terracotta" },
  succeeded: { label: "Paid", tone: "forest" },
  failed: { label: "Failed", tone: "danger" },
  abandoned: { label: "Abandoned", tone: "outline" },
  amount_mismatch: { label: "Needs review", tone: "danger" },
};

export const REFUND_STATUS: Record<Enums<"refund_status">, { label: string; tone: Tone }> = {
  pending: { label: "Queued", tone: "terracotta" },
  processing: { label: "Processing", tone: "terracotta" },
  processed: { label: "Refunded", tone: "forest" },
  failed: { label: "Failed", tone: "danger" },
};

export const PAYOUT_STATUS: Record<Enums<"payout_status">, { label: string; tone: Tone }> = {
  draft: { label: "Prepared", tone: "outline" },
  processing: { label: "Sending", tone: "terracotta" },
  paid: { label: "Paid", tone: "forest" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "outline" },
};

export const DOCUMENT_TYPES: Record<Enums<"document_type">, string> = {
  business_registration: "Business registration certificate",
  tourism_licence: "Tourism licence (Tourism Regulatory Authority)",
  identity_document: "National ID or passport",
  tax_pin_certificate: "KRA PIN certificate",
  insurance_certificate: "Insurance certificate",
  guide_certification: "Guide certification",
  other: "Other supporting document",
};

export const TICKET_STATUS: Record<Enums<"ticket_status">, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "terracotta" },
  awaiting_customer: { label: "Reply from us", tone: "forest" },
  resolved: { label: "Resolved", tone: "neutral" },
  closed: { label: "Closed", tone: "outline" },
};
