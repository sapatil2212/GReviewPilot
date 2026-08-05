/**
 * GET /api/media/serve?key=...&t=...&s=...&d=...&f=...
 *
 * Public serving endpoint for the local-disk storage provider.
 * Validates a signed URL (HMAC-SHA256 over key+expiry), then streams
 * the object body with correct Content-Type + Content-Disposition
 * headers.
 *
 * S3 / Cloudinary providers will typically bypass this route by
 * returning direct signed URLs from `storage.getSignedUrl()`; this
 * handler exists so the local dev experience matches the interface
 * exactly.
 *
 * NOTE: This route is intentionally OUTSIDE `/api/private/*` because
 * URLs are consumed by <img>, <video>, etc. that don't send cookies.
 * Security comes from the HMAC on the URL itself.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { verifySignedKey } from "@/server/storage/localStorage";
import { storage } from "@/server/storage";
import { serveMediaQuerySchema } from "@/server/validators/media.schema";
import { handleError, fail } from "@/server/utils/response";
import { NotFoundError, UnauthorizedError } from "@/server/utils/errors";
import { sanitizeFilename } from "@/server/utils/mime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = serveMediaQuerySchema.parse({
      key: url.searchParams.get("key"),
      t: url.searchParams.get("t"),
      s: url.searchParams.get("s"),
      d: url.searchParams.get("d") ?? undefined,
      f: url.searchParams.get("f") ?? undefined,
    });

    if (!verifySignedKey(parsed.key, parsed.t, parsed.s)) {
      throw new UnauthorizedError("SESSION_INVALID", "Invalid or expired media link");
    }

    const obj = await storage.get(parsed.key).catch(() => null);
    if (!obj) throw new NotFoundError("Media not found");

    const headers = new Headers();
    headers.set("Content-Type", obj.contentType);
    headers.set("Content-Length", String(obj.size));
    headers.set("Cache-Control", "private, max-age=3600");
    if (parsed.f) {
      const disp = parsed.d === "attachment" ? "attachment" : "inline";
      headers.set(
        "Content-Disposition",
        `${disp}; filename="${sanitizeFilename(parsed.f)}"`,
      );
    }

    // Body can be Buffer or Readable; wrap Readable into a Web ReadableStream.
    if (Buffer.isBuffer(obj.body)) {
      return new NextResponse(new Uint8Array(obj.body), { status: 200, headers });
    }
    const webStream = Readable.toWeb(obj.body) as unknown as ReadableStream;
    return new NextResponse(webStream, { status: 200, headers });
  } catch (err) {
    return handleError(err);
  }
}
