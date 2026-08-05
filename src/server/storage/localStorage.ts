/**
 * Local disk storage provider.
 *
 * Writes into `env.STORAGE_LOCAL_PATH` (default `.uploads/`). Signed
 * URLs are token-based query strings resolved by the download route,
 * so we get a common URL shape across providers.
 *
 * For production, swap this out for S3/Cloudinary — the interface is
 * identical and no call site changes.
 */

import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";
import type {
  GetSignedUrlInput,
  ObjectStream,
  PutObjectInput,
  PutObjectResult,
  StorageProvider,
} from "./types";

const SIGN_TTL_DEFAULT = 60 * 60; // 1 hour

/**
 * The download route validates signed URLs against this secret. We
 * derive it from AUTH_SECRET so no additional env is required.
 */
function signingSecret(): Buffer {
  return Buffer.from(`media-sig:${env.AUTH_SECRET}`);
}

export function signKey(key: string, expiresAt: number): string {
  const payload = `${key}|${expiresAt}`;
  return createHmac("sha256", signingSecret()).update(payload).digest("hex");
}

/**
 * Verifies a `t` (expiresAt) + `s` (sig) pair on a download request.
 * Returns true if the signature is valid AND unexpired.
 */
export function verifySignedKey(key: string, expiresAt: number, sig: string): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = signKey(key, expiresAt);
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Storage keys for website-builder uploads are prefixed with this segment
 * (see media.service.ts) so they can be routed to a dedicated disk root —
 * separate from the shared media library — without changing the
 * StorageProvider interface or the DB-stored storageKey format.
 */
const WEBSITE_MEDIA_PREFIX = "website-media/";

export class LocalDiskStorage implements StorageProvider {
  readonly name = "local";

  private root(): string {
    // Resolve against CWD so it lives inside the project regardless
    // of where Node was launched.
    return path.resolve(process.cwd(), env.STORAGE_LOCAL_PATH);
  }

  /**
   * Dedicated root for website media. Absolute (e.g. a VPS mount path)
   * used as-is; relative resolves against the same base as the default root.
   */
  private websiteRoot(): string {
    return path.isAbsolute(env.WEBSITE_MEDIA_PATH)
      ? env.WEBSITE_MEDIA_PATH
      : path.resolve(process.cwd(), env.WEBSITE_MEDIA_PATH);
  }

  private absPath(key: string): string {
    const safeKey = key.replace(/\\/g, "/").replace(/^\/+/, "");
    // Reject path traversal.
    if (safeKey.includes("..")) {
      throw new Error("Invalid storage key");
    }
    if (safeKey.startsWith(WEBSITE_MEDIA_PREFIX)) {
      return path.resolve(this.websiteRoot(), safeKey.slice(WEBSITE_MEDIA_PREFIX.length));
    }
    return path.resolve(this.root(), safeKey);
  }

  async put(input: PutObjectInput): Promise<PutObjectResult> {
    const abs = this.absPath(input.key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, input.body);

    // Sidecar metadata file with content-type + optional metadata so
    // GET can reconstruct headers without a DB round-trip.
    const meta = {
      contentType: input.contentType,
      cacheControl: input.cacheControl ?? "private, max-age=31536000, immutable",
      metadata: input.metadata ?? {},
      size: input.body.length,
      createdAt: new Date().toISOString(),
    };
    await fs.writeFile(`${abs}.meta.json`, JSON.stringify(meta), "utf8");

    logger.debug("Local storage put", {
      key: input.key,
      size: input.body.length,
      contentType: input.contentType,
    });

    return { key: input.key, publicUrl: null, size: input.body.length };
  }

  async getSignedUrl(input: GetSignedUrlInput): Promise<string> {
    const expiresAt =
      Math.floor(Date.now() / 1000) + (input.expiresIn ?? SIGN_TTL_DEFAULT);
    const sig = signKey(input.key, expiresAt);
    const params = new URLSearchParams({
      key: input.key,
      t: String(expiresAt),
      s: sig,
    });
    if (input.disposition) params.set("d", input.disposition);
    if (input.filename) params.set("f", input.filename);
    return `${env.APP_URL}/api/media/serve?${params.toString()}`;
  }

  async get(key: string): Promise<ObjectStream> {
    const abs = this.absPath(key);
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat) throw new Error("Object not found");

    let contentType = "application/octet-stream";
    try {
      const meta = JSON.parse(await fs.readFile(`${abs}.meta.json`, "utf8"));
      if (typeof meta.contentType === "string") contentType = meta.contentType;
    } catch {
      // sidecar missing — fine, fall back to default
    }

    return {
      contentType,
      size: stat.size,
      body: createReadStream(abs),
    };
  }

  async delete(key: string): Promise<void> {
    const abs = this.absPath(key);
    await fs.rm(abs, { force: true });
    await fs.rm(`${abs}.meta.json`, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.absPath(key));
      return true;
    } catch {
      return false;
    }
  }
}
