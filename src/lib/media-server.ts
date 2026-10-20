import "server-only";
import sharp from "sharp";

/**
 * Re-encodes an uploaded photo: decodes it (rejecting anything that is not a real image),
 * applies EXIF orientation, strips all metadata (including GPS location), limits the
 * size to 2400px and outputs WebP.
 */
export async function processPhoto(bytes: Uint8Array): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(bytes, { limitInputPixels: 60_000_000, failOn: "error" })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  if (info.width < 400 || info.height < 300) {
    throw new PhotoTooSmallError();
  }
  return { data, width: info.width, height: info.height };
}

export class PhotoTooSmallError extends Error {
  constructor() {
    super("Photos must be at least 400 × 300 pixels.");
  }
}
