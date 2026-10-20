# Data onboarding

The platform launches empty. Content comes from:

1. **Hosts** — they sign up, submit verification documents and create listings with their own
   photos (they confirm they hold the rights). Admins verify and approve.
2. **Destinations** — written by your team from sources you are entitled to use, either in Admin →
   Destinations or via the import script below. Every record names its source.

Never import scraped listings, reviews or photos, and never create reviews or bookings by hand.

## Destination import

```bash
npm run import:destinations -- destinations.json --dry-run      # validate only
SUPABASE_URL=… SUPABASE_SECRET_KEY=… npm run import:destinations -- destinations.json
```

The file is a JSON array. Records are created as **drafts**; existing slugs are skipped. Publish in
Admin → Destinations after review, and add images there with credit and licence.

| Field | Rules |
| --- | --- |
| `name` | 2–120 chars |
| `slug` | lowercase words joined by hyphens, max 80, unique |
| `county_code` | 1–47 (Constitution of Kenya, First Schedule numbering) |
| `summary` | up to 300 chars |
| `description` | 100–10,000 chars, your own writing |
| `travel_information` | optional, up to 5,000 chars |
| `latitude`, `longitude` | both or neither; inside Kenya's bounding box |
| `location_source` | required when coordinates are given (e.g. "OpenStreetMap node 123, retrieved 2026-10-01") |
| `content_source_name` | required, who/what the facts come from |
| `content_source_url` | optional URL |
| `content_retrieved_on` | required, `YYYY-MM-DD` |

Example shape (values are placeholders to replace with researched content):

```json
[
  {
    "name": "<destination name>",
    "slug": "<destination-slug>",
    "county_code": 0,
    "summary": "<one-sentence summary>",
    "description": "<at least 100 characters of original, sourced description>",
    "travel_information": "",
    "latitude": null,
    "longitude": null,
    "location_source": "",
    "content_source_name": "<source>",
    "content_source_url": null,
    "content_retrieved_on": "2026-10-01"
  }
]
```
