/**
 * Storage provider factory.
 *
 * Selects the concrete provider from `env.STORAGE_PROVIDER` at boot.
 * Every service imports `storage` — they never instantiate providers
 * directly. To add S3/Cloudinary, implement the `StorageProvider`
 * interface and wire it into the switch below.
 */

import { env } from "@/server/utils/env";
import { LocalDiskStorage, verifySignedKey } from "./localStorage";
import type { StorageProvider } from "./types";

function makeProvider(): StorageProvider {
  switch (env.STORAGE_PROVIDER) {
    case "local":
      return new LocalDiskStorage();
    case "s3":
      throw new Error(
        "S3 storage provider is not implemented yet. Set STORAGE_PROVIDER=local.",
      );
    case "cloudinary":
      throw new Error(
        "Cloudinary storage provider is not implemented yet. Set STORAGE_PROVIDER=local.",
      );
  }
}

export const storage: StorageProvider = makeProvider();

// Re-export helpers the serve route needs to validate signed URLs.
export { verifySignedKey };
export type * from "./types";
