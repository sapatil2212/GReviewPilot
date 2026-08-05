/**
 * MIME-type helpers.
 *
 * We deliberately keep an allowlist rather than accepting arbitrary
 * content types. Anything not on the list is rejected at the service
 * boundary. Prevents users from uploading executables / HTML that
 * could be served back to other users.
 */

import { MediaKind } from "@prisma/client";

interface MimeEntry {
  kind: MediaKind;
  extensions: readonly string[];
}

// Ordered by frequency of use so a linear scan is fast.
export const ALLOWED_MIME: Record<string, MimeEntry> = {
  // Images
  "image/jpeg": { kind: MediaKind.IMAGE, extensions: ["jpg", "jpeg"] },
  "image/png": { kind: MediaKind.IMAGE, extensions: ["png"] },
  "image/webp": { kind: MediaKind.IMAGE, extensions: ["webp"] },
  "image/gif": { kind: MediaKind.IMAGE, extensions: ["gif"] },
  "image/svg+xml": { kind: MediaKind.IMAGE, extensions: ["svg"] },
  "image/avif": { kind: MediaKind.IMAGE, extensions: ["avif"] },
  "image/heic": { kind: MediaKind.IMAGE, extensions: ["heic"] },

  // Video
  "video/mp4": { kind: MediaKind.VIDEO, extensions: ["mp4", "m4v"] },
  "video/webm": { kind: MediaKind.VIDEO, extensions: ["webm"] },
  "video/quicktime": { kind: MediaKind.VIDEO, extensions: ["mov"] },
  "video/x-matroska": { kind: MediaKind.VIDEO, extensions: ["mkv"] },

  // Audio
  "audio/mpeg": { kind: MediaKind.AUDIO, extensions: ["mp3"] },
  "audio/wav": { kind: MediaKind.AUDIO, extensions: ["wav"] },
  "audio/ogg": { kind: MediaKind.AUDIO, extensions: ["ogg"] },
  "audio/webm": { kind: MediaKind.AUDIO, extensions: ["weba"] },
  "audio/mp4": { kind: MediaKind.AUDIO, extensions: ["m4a"] },

  // Documents
  "application/pdf": { kind: MediaKind.DOCUMENT, extensions: ["pdf"] },
  "application/msword": { kind: MediaKind.DOCUMENT, extensions: ["doc"] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    kind: MediaKind.DOCUMENT,
    extensions: ["docx"],
  },
  "application/vnd.ms-excel": { kind: MediaKind.DOCUMENT, extensions: ["xls"] },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    kind: MediaKind.DOCUMENT,
    extensions: ["xlsx"],
  },
  "application/vnd.ms-powerpoint": {
    kind: MediaKind.DOCUMENT,
    extensions: ["ppt"],
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    kind: MediaKind.DOCUMENT,
    extensions: ["pptx"],
  },
  "text/plain": { kind: MediaKind.DOCUMENT, extensions: ["txt"] },
  "text/csv": { kind: MediaKind.DOCUMENT, extensions: ["csv"] },
};

export function normalizeMime(mime: string | null | undefined): string | null {
  if (!mime) return null;
  const m = mime.trim().toLowerCase();
  // Strip parameters like `; charset=utf-8`.
  return m.split(";")[0]!.trim();
}

export function extensionFor(mime: string): string | null {
  const entry = ALLOWED_MIME[mime];
  return entry?.extensions[0] ?? null;
}

export function kindFor(mime: string): MediaKind {
  return ALLOWED_MIME[mime]?.kind ?? MediaKind.OTHER;
}

export function isMimeAllowed(mime: string): boolean {
  return Boolean(ALLOWED_MIME[mime]);
}

/**
 * Sanitize a user-supplied filename to a safe basename. Keeps letters,
 * digits, dots, dashes, underscores; strips everything else. Never
 * used as part of the storage key (that's content-addressable) — only
 * echoed back in the response and included in Content-Disposition on
 * download.
 */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^\w.\- ]+/g, "_").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 200) : "file";
}
