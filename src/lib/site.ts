export const SITE_NAME = "Hidden Kenya";
export const SITE_TAGLINE = "Book local experiences across Kenya, hosted by verified guides and community businesses.";

export const MAIN_NAV = [
  { href: "/experiences", label: "Experiences" },
  { href: "/destinations", label: "Destinations" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/for-providers", label: "For hosts" },
] as const;

export const LEGAL_PAGES = [
  { slug: "privacy", title: "Privacy policy" },
  { slug: "terms", title: "Terms of service" },
  { slug: "booking-and-cancellation", title: "Booking and cancellation policy" },
  { slug: "refunds", title: "Refund policy" },
  { slug: "provider-terms", title: "Host terms" },
  { slug: "cookies", title: "Cookies and tracking" },
  { slug: "community-guidelines", title: "Community guidelines" },
] as const;

export const REGIONS = ["Nairobi", "Central", "Coast", "Eastern", "North Eastern", "Nyanza", "Rift Valley", "Western"] as const;

/** Accessibility features providers can declare (shown as provider-supplied information). */
export const ACCESSIBILITY_FEATURES = [
  { value: "step_free_access", label: "Step-free access" },
  { value: "wheelchair_accessible", label: "Wheelchair accessible" },
  { value: "accessible_toilet", label: "Accessible toilet" },
  { value: "low_physical_effort", label: "Low physical effort" },
  { value: "seating_available", label: "Seating available throughout" },
  { value: "sign_language", label: "Sign language available" },
  { value: "service_animals_welcome", label: "Service animals welcome" },
  { value: "child_friendly", label: "Suitable for children" },
] as const;

export const accessibilityLabel = (v: string) => ACCESSIBILITY_FEATURES.find((f) => f.value === v)?.label ?? v;

export const DURATION_FILTERS = [
  { value: "up_to_3h", label: "Up to 3 hours" },
  { value: "3_to_8h", label: "3 to 8 hours" },
  { value: "full_day", label: "Full day" },
  { value: "multi_day", label: "More than a day" },
] as const;

export const SORT_OPTIONS = [
  { value: "recommended", label: "Best match" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "rating", label: "Guest rating" },
] as const;

export const CANCELLATION_POLICIES = {
  flexible: { label: "Flexible", summary: "Full refund if you cancel at least 24 hours before the start time." },
  moderate: {
    label: "Moderate",
    summary: "Full refund at least 5 days before the start time; 50% at least 24 hours before; no refund after that.",
  },
  strict: {
    label: "Strict",
    summary: "Full refund at least 14 days before the start time; 50% at least 7 days before; no refund after that.",
  },
} as const;
