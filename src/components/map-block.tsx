import { ExternalLink, MapPin } from "lucide-react";
import { directionsUrl, openStreetMapUrl, staticMapUrl, type LatLng } from "@/lib/maps";

/** A map of one point, with a text alternative and links that work without a map provider. */
export function MapBlock({ point, label, source }: { point: LatLng; label: string; source?: string }) {
  const src = staticMapUrl(point);
  return (
    <figure className="space-y-2">
      {src ? (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-sand-deep bg-sand">
          {/* Mapbox static image: plain <img> since it is already sized and served by Mapbox. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`Map showing ${label}`} width={640} height={360} loading="lazy" className="h-auto w-full" />
        </div>
      ) : null}
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden />
          {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
        </span>
        <a href={openStreetMapUrl(point)} className="inline-flex items-center gap-1 text-forest underline underline-offset-2" rel="noopener noreferrer" target="_blank">
          OpenStreetMap <ExternalLink className="size-3" aria-hidden />
        </a>
        <a href={directionsUrl(point)} className="inline-flex items-center gap-1 text-forest underline underline-offset-2" rel="noopener noreferrer" target="_blank">
          Directions <ExternalLink className="size-3" aria-hidden />
        </a>
        {src ? <span>Map © Mapbox © OpenStreetMap contributors</span> : null}
        {source ? <span>{source}</span> : null}
      </figcaption>
    </figure>
  );
}
