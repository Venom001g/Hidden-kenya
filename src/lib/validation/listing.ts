import { z } from "zod";
import { toMinorUnits } from "@/lib/format";
import { ACCESSIBILITY_FEATURES } from "@/lib/site";

const lines = (max: number) =>
  z
    .string()
    .max(6000)
    .transform((v) =>
      v
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => l.slice(0, 200)),
    )
    .refine((a) => a.length <= max, `List up to ${max} items.`);

const csv = (max: number) =>
  z
    .string()
    .max(600)
    .transform((v) =>
      v
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => l.slice(0, 40)),
    )
    .refine((a) => a.length <= max, `List up to ${max} items.`);

const coordinate = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v >= min && v <= max), `${label} must be within Kenya (${min} to ${max}).`);

const features = ACCESSIBILITY_FEATURES.map((f) => f.value) as [string, ...string[]];

export const listingSchema = z
  .object({
    title: z.string().trim().min(5, "Use at least 5 characters.").max(120),
    summary: z.string().trim().max(300, "Keep the summary under 300 characters."),
    description: z.string().trim().max(10000),
    categoryId: z.uuid("Choose a type of experience."),
    countyCode: z.coerce.number().int().min(1, "Choose a county.").max(47),
    destinationId: z
      .string()
      .optional()
      .transform((v) => v || null)
      .pipe(z.uuid().nullable()),
    pricingModel: z.enum(["per_person", "per_group"]),
    price: z.string().trim().min(1, "Enter a price."),
    currency: z.enum(["KES", "USD"]),
    durationHours: z.coerce.number().int().min(0).max(720),
    durationMinutes: z.coerce.number().int().min(0).max(59),
    minParticipants: z.coerce.number().int().min(1).max(500),
    maxParticipants: z.coerce.number().int().min(1, "At least 1 guest.").max(500),
    included: lines(30),
    excluded: lines(30),
    languages: csv(15),
    tags: csv(15),
    accessibilityFeatures: z.array(z.enum(features)).max(15).default([]),
    accessibilityNotes: z.string().trim().max(2000),
    meetingPointName: z.string().trim().max(200),
    meetingPointInstructions: z.string().trim().max(2000),
    meetingLatitude: coordinate(-5, 5.5, "Latitude"),
    meetingLongitude: coordinate(33.5, 42.5, "Longitude"),
    bookingMode: z.enum(["instant", "request"]),
    leadTimeHours: z.coerce.number().int().min(0).max(720),
    maxAdvanceDays: z.coerce.number().int().min(1).max(730),
    cancellationPolicy: z.enum(["flexible", "moderate", "strict"]),
  })
  .superRefine((v, ctx) => {
    if (v.minParticipants > v.maxParticipants) {
      ctx.addIssue({ code: "custom", path: ["maxParticipants"], message: "Must be at least the minimum group size." });
    }
    const minutes = v.durationHours * 60 + v.durationMinutes;
    if (minutes < 15 || minutes > 43200) ctx.addIssue({ code: "custom", path: ["durationHours"], message: "Duration must be between 15 minutes and 30 days." });
    const price = toMinorUnits(v.price, v.currency);
    if (price === null || price <= 0) ctx.addIssue({ code: "custom", path: ["price"], message: "Enter a price such as 2500 or 2500.50." });
    if ((v.meetingLatitude === null) !== (v.meetingLongitude === null)) {
      ctx.addIssue({ code: "custom", path: ["meetingLongitude"], message: "Enter both latitude and longitude, or neither." });
    }
  });

export type ListingInput = z.input<typeof listingSchema>;
export type ListingValues = z.output<typeof listingSchema>;

/** Maps validated form values to experiences columns that providers are allowed to write. */
export function listingColumns(v: ListingValues) {
  return {
    title: v.title,
    summary: v.summary,
    description: v.description,
    category_id: v.categoryId,
    county_code: v.countyCode,
    destination_id: v.destinationId,
    pricing_model: v.pricingModel,
    price_minor: toMinorUnits(v.price, v.currency)!,
    currency: v.currency,
    duration_minutes: v.durationHours * 60 + v.durationMinutes,
    min_participants: v.minParticipants,
    max_participants: v.maxParticipants,
    included: v.included,
    excluded: v.excluded,
    languages: v.languages,
    tags: v.tags,
    accessibility_features: v.accessibilityFeatures,
    accessibility_notes: v.accessibilityNotes,
    meeting_point_name: v.meetingPointName,
    meeting_point_instructions: v.meetingPointInstructions,
    meeting_latitude: v.meetingLatitude,
    meeting_longitude: v.meetingLongitude,
    booking_mode: v.bookingMode,
    lead_time_hours: v.leadTimeHours,
    max_advance_days: v.maxAdvanceDays,
    cancellation_policy: v.cancellationPolicy,
  };
}

export const providerProfileSchema = z.object({
  businessName: z.string().trim().min(2, "Enter your business or trading name.").max(120),
  description: z.string().trim().max(4000),
  operatingAreas: z.string().trim().max(500),
  websiteUrl: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null)
    .pipe(z.url({ protocol: /^https$/, error: "Use a full https:// address." }).nullable()),
  yearEstablished: z
    .string()
    .trim()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1900 && v <= new Date().getFullYear()), "Enter a valid year."),
  legalName: z.string().trim().max(160),
  registrationNumber: z.string().trim().max(60),
  tourismLicenceNumber: z.string().trim().max(60),
  contactEmail: z.string().trim().toLowerCase().pipe(z.union([z.literal(""), z.email("Enter a valid email address.")])),
  contactPhone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number.")]),
});
