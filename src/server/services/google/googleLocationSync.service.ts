/**
 * Google location sync service.
 *
 * Pulls the list of locations from every account the connected Google
 * identity has access to, upserts them into `GoogleLocation`, and
 * records a `SyncRun` for observability. Idempotent — reruns are
 * cheap thanks to the per-row `dataHash`.
 */

import { AuditAction, Prisma, SyncKind, SyncStatus } from "@prisma/client";
import { createHash } from "node:crypto";
import { auditRepository } from "@/server/repositories/audit.repository";
import { googleAccountRepository } from "@/server/repositories/googleAccount.repository";
import { googleLocationRepository } from "@/server/repositories/googleLocation.repository";
import { locationRepository } from "@/server/repositories/location.repository";
import { syncRunRepository } from "@/server/repositories/syncRun.repository";
import { googleAccountService } from "./googleAccount.service";
import type { GoogleLocationResource } from "./googleClient";
import { GoogleApiError } from "./googleClient";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/server/utils/errors";
import { logger } from "@/server/utils/logger";
import type { AuthContext } from "@/server/auth/requireSession";

interface SyncOutcome {
  status: SyncStatus;
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsFailed: number;
  errorMessage?: string;
}

export const googleLocationSyncService = {
  async listSynced(ctx: AuthContext) {
    return googleLocationRepository.listForTenant(ctx.tenantId);
  },

  async runFor(ctx: AuthContext, req: Request) {
    const { account, client } = await googleAccountService.getClient(
      ctx.tenantId,
    );

    // Start a SyncRun row.
    const run = await syncRunRepository.create({
      tenantId: ctx.tenantId,
      googleAccountId: account.id,
      kind: SyncKind.LOCATIONS,
      triggeredById: ctx.userId,
    });
    await auditRepository.record({
      action: AuditAction.GOOGLE_SYNC_STARTED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      metadata: { runId: run.id, kind: SyncKind.LOCATIONS },
    });

    const outcome: SyncOutcome = {
      status: SyncStatus.RUNNING,
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsFailed: 0,
    };

    try {
      // Fetch every account the user has, then every location per account.
      const accounts = await client.listAccounts();
      if (accounts.length === 0) {
        throw new ConflictError(
          "CONFLICT",
          "The connected Google identity has no Business Profile accounts",
        );
      }

      // If we didn't know accountId at connect time, backfill now.
      if (!account.googleAccountId) {
        await googleAccountRepository.updateAccountIds(account.id, {
          googleAccountId: accounts[0]!.name,
          googleAccountName: accounts[0]!.accountName ?? null,
        });
      }

      const seenResourceNames: string[] = [];
      for (const acc of accounts) {
        let locations: GoogleLocationResource[] = [];
        try {
          locations = await client.listLocations(acc.name);
        } catch (err) {
          logger.warn("listLocations failed", {
            accountName: acc.name,
            err: err instanceof Error ? err.message : String(err),
          });
          outcome.itemsFailed += 1;
          continue;
        }
        for (const loc of locations) {
          outcome.itemsProcessed += 1;
          try {
            const resourceName = ensureResourceName(acc.name, loc.name);
            seenResourceNames.push(resourceName);

            const shaped = shapeLocation(loc);
            const dataHash = createHash("sha256")
              .update(JSON.stringify(loc))
              .digest("hex");

            const existing = await googleLocationRepository.findByResourceName(
              account.id,
              resourceName,
            );

            await googleLocationRepository.upsert({
              tenantId: ctx.tenantId,
              googleAccountId: account.id,
              googleLocationName: resourceName,
              googleLocationId: extractLocationId(resourceName),
              googlePlaceId: shaped.googlePlaceId,
              title: shaped.title,
              storeCode: shaped.storeCode,
              primaryCategory: shaped.primaryCategory,
              addressLine: shaped.addressLine,
              city: shaped.city,
              state: shaped.state,
              postalCode: shaped.postalCode,
              country: shaped.country,
              phone: shaped.phone,
              websiteUri: shaped.websiteUri,
              raw: loc as unknown as Prisma.InputJsonValue,
              dataHash,
            });

            if (!existing) outcome.itemsCreated += 1;
            else if (existing.dataHash !== dataHash)
              outcome.itemsUpdated += 1;
          } catch (err) {
            logger.warn("Location upsert failed", {
              err: err instanceof Error ? err.message : String(err),
            });
            outcome.itemsFailed += 1;
          }
        }
      }

      // Prune locations that no longer exist on Google's side.
      await googleLocationRepository.deleteMissing(account.id, seenResourceNames);

      outcome.status =
        outcome.itemsFailed === 0
          ? SyncStatus.SUCCESS
          : outcome.itemsProcessed === outcome.itemsFailed
            ? SyncStatus.FAILED
            : SyncStatus.PARTIAL;
      const completed = await syncRunRepository.complete(run.id, outcome);
      await googleAccountRepository.updateSyncTimestamp(
        account.id,
        new Date(),
        null,
      );
      await auditRepository.record({
        action: AuditAction.GOOGLE_SYNC_COMPLETED,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        metadata: {
          runId: run.id,
          kind: SyncKind.LOCATIONS,
          created: outcome.itemsCreated,
          updated: outcome.itemsUpdated,
          failed: outcome.itemsFailed,
        },
      });
      return completed;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed = await syncRunRepository.fail(run.id, message);
      await googleAccountRepository.updateSyncTimestamp(
        account.id,
        new Date(),
        message,
      );
      await auditRepository.record({
        action: AuditAction.GOOGLE_SYNC_FAILED,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        metadata: { runId: run.id, kind: SyncKind.LOCATIONS, error: message },
      });
      if (err instanceof GoogleApiError && err.status === 401) {
        // token expired — surface a friendlier error to callers
        throw new ValidationError(
          "Google access token expired. Reconnect the account and try again.",
        );
      }
      return failed;
    }
  },

  async link(ctx: AuthContext, googleLocationId: string, localLocationId: string) {
    const gl = await googleLocationRepository.findByIdForTenant(
      googleLocationId,
      ctx.tenantId,
    );
    if (!gl) throw new NotFoundError("Google location not found");
    const local = await locationRepository.findByIdForTenant(
      localLocationId,
      ctx.tenantId,
    );
    if (!local) throw new NotFoundError("Local location not found");

    // Also mirror Google IDs onto the local Location so review-URL
    // generation and metadata reads don't need a join.
    const linked = await googleLocationRepository.updateLink(
      googleLocationId,
      localLocationId,
    );
    await locationRepository.update(localLocationId, {
      googleLocationId: gl.googleLocationName,
      googlePlaceId: gl.googlePlaceId,
    });

    await auditRepository.record({
      action: AuditAction.GOOGLE_LOCATION_LINKED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      metadata: {
        googleLocationId: gl.googleLocationName,
        localLocationId,
      },
    });
    return linked;
  },

  async unlink(ctx: AuthContext, googleLocationId: string) {
    const gl = await googleLocationRepository.findByIdForTenant(
      googleLocationId,
      ctx.tenantId,
    );
    if (!gl) throw new NotFoundError("Google location not found");
    if (!gl.localLocationId) return gl;

    const priorLocal = gl.localLocationId;
    const unlinked = await googleLocationRepository.updateLink(
      googleLocationId,
      null,
    );
    await locationRepository.update(priorLocal, {
      googleLocationId: null,
    });

    await auditRepository.record({
      action: AuditAction.GOOGLE_LOCATION_UNLINKED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      metadata: { googleLocationId: gl.googleLocationName, localLocationId: priorLocal },
    });
    return unlinked;
  },
};

// ---------- helpers ----------

function ensureResourceName(accountName: string, locationName: string): string {
  return locationName.startsWith("accounts/")
    ? locationName
    : `${accountName}/${locationName}`;
}

function extractLocationId(resourceName: string): string {
  const parts = resourceName.split("/");
  return parts[parts.length - 1] ?? resourceName;
}

interface ShapedLocation {
  title: string;
  storeCode: string | null;
  primaryCategory: string | null;
  googlePlaceId: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  websiteUri: string | null;
}

function shapeLocation(loc: GoogleLocationResource): ShapedLocation {
  const addr = loc.storefrontAddress;
  const primaryCategory =
    loc.categories?.primaryCategory?.displayName ??
    loc.categories?.primaryCategory?.name ??
    null;
  return {
    title: loc.title,
    storeCode: loc.storeCode ?? null,
    primaryCategory,
    googlePlaceId: loc.metadata?.placeId ?? null,
    addressLine: addr?.addressLines?.[0] ?? null,
    city: addr?.locality ?? null,
    state: addr?.administrativeArea ?? null,
    postalCode: addr?.postalCode ?? null,
    country: addr?.regionCode ?? null,
    phone: loc.phoneNumbers?.primaryPhone ?? null,
    websiteUri: loc.websiteUri ?? null,
  };
}
