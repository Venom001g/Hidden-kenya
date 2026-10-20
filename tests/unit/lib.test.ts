import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { errorCode, friendlyError } from "@/lib/errors";
import { formatDuration, formatMoney, fromMinorUnits, toMinorUnits } from "@/lib/format";
import { isWithinKenya, staticMapUrl } from "@/lib/maps";
import { safeNext, signUpSchema } from "@/lib/validation/auth";
import { createBookingSchema } from "@/lib/validation/booking";
import { listingColumns, listingSchema } from "@/lib/validation/listing";
import { EMPTY_LISTING } from "@/lib/listing-defaults";

describe("money", () => {
  it("parses major units into integer minor units without floating-point error", () => {
    expect(toMinorUnits("2500", "KES")).toBe(250000);
    expect(toMinorUnits("2,500.50", "KES")).toBe(250050);
    expect(toMinorUnits("0.1", "USD")).toBe(10);
    expect(toMinorUnits("19.99", "USD")).toBe(1999);
    expect(toMinorUnits("1.005", "USD")).toBeNull();
    expect(toMinorUnits("-5", "KES")).toBeNull();
    expect(toMinorUnits("abc", "KES")).toBeNull();
    expect(toMinorUnits("1e5", "KES")).toBeNull();
  });
  it("round-trips for editing", () => {
    expect(fromMinorUnits(250050, "KES")).toBe("2500.50");
    expect(fromMinorUnits(250000, "KES")).toBe("2500");
  });
  it("formats with the currency code", () => {
    expect(formatMoney(250000, "KES")).toBe("KES 2,500");
    expect(formatMoney(1999, "USD")).toBe("USD 19.99");
  });
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(180)).toBe("3 hours");
    expect(formatDuration(150)).toBe("2 h 30 min");
    expect(formatDuration(2880)).toBe("2 days");
  });
});

describe("open redirect protection", () => {
  it.each([
    ["/account", "/account"],
    ["/experiences?q=lamu", "/experiences?q=lamu"],
    ["//evil.example", "/account"],
    ["/\\evil.example", "/account"],
    ["https://evil.example", "/account"],
    ["javascript:alert(1)", "/account"],
    [null, "/account"],
  ])("safeNext(%s) = %s", (input, out) => expect(safeNext(input as string | null)).toBe(out));
});

describe("CSV export", () => {
  it("neutralises spreadsheet formulas and quotes properly", () => {
    const csv = toCsv(["a", "b"], [["=HYPERLINK(\"x\")", "+1"], ["-2", "@cmd"], ['he said "hi", ok', "plain"]]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain("'+1");
    expect(csv).toContain("'-2,'@cmd");
    expect(csv).toContain('"he said ""hi"", ok"');
  });
});

describe("errors", () => {
  it("shows database messages only for coded errors", () => {
    expect(errorCode("HK_SOLD_OUT: Only 2 place(s) left")).toBe("HK_SOLD_OUT");
    expect(friendlyError({ message: "HK_SOLD_OUT: Only 2 place(s) left for this departure." })).toBe("Only 2 place(s) left for this departure.");
    expect(friendlyError({ message: 'duplicate key value violates unique constraint "x"' })).toBe("Something went wrong. Please try again.");
    expect(friendlyError({ message: "HK_FORBIDDEN: raw" })).toBe("You do not have access to do that.");
  });
});

describe("validation", () => {
  it("never lets sign-up choose a role", () => {
    const parsed = signUpSchema.parse({ fullName: "Asha", email: "A@Example.com ", password: "longpassword1", acceptTerms: true, role: "admin" } as never);
    expect(parsed).not.toHaveProperty("role");
    expect(parsed.email).toBe("a@example.com");
  });
  it("requires accepting the terms and a reasonable password", () => {
    expect(signUpSchema.safeParse({ fullName: "Asha", email: "a@b.co", password: "short", acceptTerms: true }).success).toBe(false);
    expect(signUpSchema.safeParse({ fullName: "Asha", email: "a@b.co", password: "longpassword1", acceptTerms: false }).success).toBe(false);
  });
  it("has no price field in the booking request", () => {
    const parsed = createBookingSchema.parse({
      experienceId: "8f0c2f9e-4f36-4a5e-9a51-2b1f7f1d2c3a",
      startsAt: "2026-11-01T09:00:00+03:00",
      partySize: 2,
      contactName: "Asha",
      contactEmail: "a@b.co",
      contactPhone: "+254 712 345 678",
      idempotencyKey: "abcdefgh-1234",
      totalMinor: 1,
    } as never);
    expect(parsed).not.toHaveProperty("totalMinor");
  });
  it("validates listings and maps only provider-writable columns", () => {
    const base = { ...EMPTY_LISTING, title: "Dawn birding walk", categoryId: "8f0c2f9e-4f36-4a5e-9a51-2b1f7f1d2c3a", countyCode: 37, price: "2500" };
    const ok = listingSchema.parse(base);
    const cols = listingColumns(ok);
    expect(cols.price_minor).toBe(250000);
    expect(cols.duration_minutes).toBe(180);
    expect(cols).not.toHaveProperty("status");
    expect(cols).not.toHaveProperty("provider_id");
    expect(listingSchema.safeParse({ ...base, minParticipants: 5, maxParticipants: 2 }).success).toBe(false);
    expect(listingSchema.safeParse({ ...base, meetingLatitude: "-1.2" }).success).toBe(false); // longitude missing
    expect(listingSchema.safeParse({ ...base, meetingLatitude: "51.5", meetingLongitude: "-0.1" }).success).toBe(false); // London
    expect(listingSchema.safeParse({ ...base, price: "free" }).success).toBe(false);
  });
});

describe("maps", () => {
  it("checks Kenya's bounding box", () => {
    expect(isWithinKenya({ lat: -1.2921, lng: 36.8219 })).toBe(true);
    expect(isWithinKenya({ lat: 51.5, lng: -0.12 })).toBe(false);
  });
  it("only builds a static map URL with a public token", () => {
    const prev = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "";
    expect(staticMapUrl({ lat: -1.29, lng: 36.82 })).toBeNull();
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.test";
    expect(staticMapUrl({ lat: -1.29, lng: 36.82 })).toContain("36.82000,-1.29000");
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = prev;
  });
});
