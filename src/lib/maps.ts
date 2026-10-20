/**
 * Map integration. Provider: Mapbox Static Images API (configurable via
 * NEXT_PUBLIC_MAPBOX_TOKEN, a public "pk." token restricted to your domain in the Mapbox
 * dashboard). Without a token the site shows the coordinates with links to open them in
 * OpenStreetMap or Google Maps; nothing breaks.
 *
 * Coordinates are only ever those entered by an authorised provider or administrator.
 */

export type LatLng = { lat: number; lng: number };

export function mapsConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.startsWith("pk."));
}

export function staticMapUrl({ lat, lng }: LatLng, opts: { zoom?: number; width?: number; height?: number } = {}): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token?.startsWith("pk.")) return null;
  const zoom = opts.zoom ?? 13;
  const w = Math.min(opts.width ?? 640, 1280);
  const h = Math.min(opts.height ?? 360, 1280);
  const ll = `${lng.toFixed(5)},${lat.toFixed(5)}`;
  return `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/pin-l+1d4a37(${ll})/${ll},${zoom},0/${w}x${h}@2x?access_token=${encodeURIComponent(token)}&attribution=false&logo=false`;
}

export function openStreetMapUrl({ lat, lng }: LatLng): string {
  return `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lng.toFixed(5)}#map=15/${lat.toFixed(5)}/${lng.toFixed(5)}`;
}

export function directionsUrl({ lat, lng }: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/** Kenya's approximate bounding box; matches the database check constraints. */
export function isWithinKenya({ lat, lng }: LatLng): boolean {
  return lat >= -5 && lat <= 5.5 && lng >= 33.5 && lng <= 42.5;
}
