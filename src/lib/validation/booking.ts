import { z } from "zod";

export const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a phone number, e.g. +254 712 345 678.");

export const createBookingSchema = z.object({
  experienceId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  partySize: z.coerce.number().int().min(1).max(500),
  contactName: z.string().trim().min(2, "Enter the lead guest's name.").max(120),
  contactEmail: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254)),
  contactPhone: phone,
  notes: z.string().trim().max(1000, "Keep notes under 1000 characters.").optional().default(""),
  idempotencyKey: z.string().min(8).max(100),
});

export const cancelSchema = z.object({
  bookingId: z.uuid(),
  reason: z.string().trim().max(1000).optional().default(""),
});
