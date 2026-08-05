/**
 * Zero-dependency image dimension parser.
 *
 * Reads just enough of the file header to extract width/height for
 * the most common formats: PNG, JPEG, GIF, WebP. Falls back to
 * `null` on formats we don't parse (SVG/AVIF/HEIC) — the frontend
 * can still render them; the DB just stores nulls.
 *
 * Deliberately does NOT decode the image (no heavy deps). Keeps the
 * upload path light in dev.
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

export function readImageDimensions(
  buf: Buffer,
  mime: string,
): ImageDimensions | null {
  try {
    switch (mime) {
      case "image/png":
        return readPng(buf);
      case "image/jpeg":
        return readJpeg(buf);
      case "image/gif":
        return readGif(buf);
      case "image/webp":
        return readWebp(buf);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function readPng(buf: Buffer): ImageDimensions | null {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A. IHDR chunk starts at offset 8:
  // 4-byte length, 4-byte "IHDR", then 4-byte width, 4-byte height.
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    return null;
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return width && height ? { width, height } : null;
}

function readJpeg(buf: Buffer): ImageDimensions | null {
  // JPEG: SOI (FFD8), then a stream of markers. SOFn markers hold dims.
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buf.length - 8) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1];
    offset += 2;
    // SOF markers: C0..CF, excluding DHT (C4), JPG (C8), DAC (CC).
    if (
      marker !== undefined &&
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      // Segment: 2-byte length, 1-byte precision, 2-byte height, 2-byte width.
      const height = buf.readUInt16BE(offset + 3);
      const width = buf.readUInt16BE(offset + 5);
      return width && height ? { width, height } : null;
    }
    // Skip this segment: 2-byte length includes the length bytes.
    const segLen = buf.readUInt16BE(offset);
    offset += segLen;
  }
  return null;
}

function readGif(buf: Buffer): ImageDimensions | null {
  // "GIF87a" or "GIF89a", then 2-byte width, 2-byte height (little-endian).
  if (buf.length < 10) return null;
  const sig = buf.subarray(0, 3).toString("ascii");
  if (sig !== "GIF") return null;
  return {
    width: buf.readUInt16LE(6),
    height: buf.readUInt16LE(8),
  };
}

function readWebp(buf: Buffer): ImageDimensions | null {
  // RIFF....WEBP, then VP8 / VP8L / VP8X.
  if (buf.length < 30) return null;
  if (buf.subarray(0, 4).toString("ascii") !== "RIFF") return null;
  if (buf.subarray(8, 12).toString("ascii") !== "WEBP") return null;
  const chunk = buf.subarray(12, 16).toString("ascii");
  if (chunk === "VP8 ") {
    // Lossy: bytes 26/28 are 14-bit width/height with 2-bit padding.
    const w = buf.readUInt16LE(26) & 0x3fff;
    const h = buf.readUInt16LE(28) & 0x3fff;
    return w && h ? { width: w, height: h } : null;
  }
  if (chunk === "VP8L") {
    // Lossless: 14-bit width-1 and height-1 packed in 4 bytes at offset 21.
    const b0 = buf[21]!;
    const b1 = buf[22]!;
    const b2 = buf[23]!;
    const b3 = buf[24]!;
    const w = 1 + (((b1 & 0x3f) << 8) | b0);
    const h = 1 + ((b3 & 0x0f) << 10) | ((b2 & 0xff) << 2) | ((b1 & 0xc0) >> 6);
    return w && h ? { width: w, height: h } : null;
  }
  if (chunk === "VP8X") {
    // Extended: 3-byte width-1 and 3-byte height-1 at offsets 24 / 27.
    const w = 1 + buf.readUIntLE(24, 3);
    const h = 1 + buf.readUIntLE(27, 3);
    return w && h ? { width: w, height: h } : null;
  }
  return null;
}
