/**
 * Storage provider interfaces.
 *
 * All modules that persist binary content depend on `StorageProvider`
 * — never on the underlying transport. New providers (S3, Cloudinary,
 * R2, GCS) implement this interface and are wired in `./index.ts`.
 *
 * `storageKey` is the opaque handle for a stored object. It's chosen
 * by the provider (or by the caller for content-addressable schemes)
 * and is stored on the MediaAsset row.
 */

import type { Readable } from "node:stream";

export interface PutObjectInput {
  /** Content-addressable path — see media.service.ts for the format. */
  key: string;
  /** File bytes. */
  body: Buffer;
  contentType: string;
  /** Cache-Control header for public objects. Providers set a sensible default. */
  cacheControl?: string;
  /** Provider-specific metadata; local-disk stores it alongside the file. */
  metadata?: Record<string, string>;
}

export interface PutObjectResult {
  key: string;
  /** Direct public URL if this provider has one; otherwise null. */
  publicUrl: string | null;
  size: number;
  etag?: string;
}

export interface GetSignedUrlInput {
  key: string;
  /** Seconds until the URL expires. Providers may cap this. */
  expiresIn?: number;
  /** Optional Content-Disposition override for downloads. */
  disposition?: "inline" | "attachment";
  /** Optional filename to hint into Content-Disposition. */
  filename?: string;
}

export interface ObjectStream {
  contentType: string;
  size: number;
  body: Readable | Buffer;
  etag?: string;
}

export interface StorageProvider {
  readonly name: string;
  put(input: PutObjectInput): Promise<PutObjectResult>;
  getSignedUrl(input: GetSignedUrlInput): Promise<string>;
  /** Retrieve an object as a stream/buffer — used by our download route. */
  get(key: string): Promise<ObjectStream>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
