/**
 * LOCATION sync handler (SyncKind.LOCATIONS).
 *
 * Prefers the stored googleAccountId — only calls listAccounts when
 * the account resource name is missing (avoids Account Management bursts).
 */

import {
  GoogleAccountStatus,
  Prisma,
  SyncKind,
  SyncStatus,
} from "@prisma/client";
import { createHash } from "node:crypto";
import { googleAccountRepository } from "@/server/repositories/googleAccount.repository";
import { googleLocationRepository } from "@/server/repositories/googleLocation.repository";
import { googleAccountService } from "@/server/services/google/googleAccount.service";
import type {
  GoogleAccountResource,
  GoogleLocationResource,
} from "@/server/services/google/googleClient";
import {
  isRetryableCategory,
  isTerminalCategory,
} from "@/server/google/gateway/errorClassifier";
import { syncJobService } from "@/server/google/sync/syncJob.service";
import { categorizeSyncError, handleSyncJobError } from "./jobError";
import { logger } from "@/server/utils/logger";

export async function handleLocationSync(job: {
  id: string;
  tenantId: string;
  googleAccountId: string | null;
  attemptCount: number;
  triggeredById: string | null;
}) {
  if (!job.googleAccountId) {
    await syncJobService.complete(job.id, {
      status: SyncStatus.FAILED,
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsFailed: 1,
      lastErrorCode: "GOOGLE_INVALID_REQUEST",
      errorMessage: "Missing googleAccountId on sync job",
    });
    return;
  }

  const outcome = {
    itemsProcessed: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsFailed: 0,
  };

  try {
    await googleAccountRepository.updateStatus(
      job.googleAccountId,
      GoogleAccountStatus.SYNCING,
    );

    const { account, client } = await googleAccountService.getClient(
      job.tenantId,
    );

    let accounts: GoogleAccountResource[] = [];

    if (account.googleAccountId) {
      // Reuse stored account — skip Account Management API.
      accounts = [
        {
          name: account.googleAccountId,
          accountName: account.googleAccountName ?? "",
          type: "LOCATION_GROUP",
        },
      ];
    } else {
      accounts = await client.listAccounts();
      const preferred =
        accounts.find((a) => a.type && a.type !== "PERSONAL") ?? accounts[0];
      if (preferred) {
        await googleAccountRepository.updateAccountIds(account.id, {
          googleAccountId: preferred.name,
          googleAccountName: preferred.accountName ?? null,
        });
      }
    }

    if (accounts.length === 0) {
      await syncJobService.complete(job.id, {
        status: SyncStatus.SUCCESS,
        totalItems: 0,
        itemsProcessed: 0,
        itemsCreated: 0,
        itemsUpdated: 0,
        itemsFailed: 0,
        errorMessage: null,
        metadata: { empty: true },
      });
      await googleAccountRepository.updateSyncTimestamp(
        account.id,
        new Date(),
        null,
      );
      await googleAccountRepository.updateStatus(
        account.id,
        GoogleAccountStatus.CONNECTED,
      );
      return;
    }

    const seenResourceNames: string[] = [];
    // Tracks whether we failed to enumerate an entire account. Reconciliation
    // below is only safe when every account was listed successfully.
    let listingIncomplete = false;

    for (const acc of accounts) {
      if (acc.type === "PERSONAL") continue;

      let locations: GoogleLocationResource[] = [];
      try {
        locations = await client.listLocations(acc.name);
      } catch (err) {
        const category = categorizeSyncError(err);
        logger.warn("listLocations failed in location sync handler", {
          accountName: acc.name,
          category,
          err: err instanceof Error ? err.message : String(err),
        });
        outcome.itemsFailed += 1;
        listingIncomplete = true;

        // Rethrow anything that will fail identically for every remaining
        // account: quota and rate limits (so the job reschedules), and the
        // terminal auth/scope/project categories (so the connection is marked
        // and the tenant is told once, instead of us walking the whole list
        // generating the same error).
        if (
          isRetryableCategory(category) ||
          isTerminalCategory(category)
        ) {
          throw err;
        }
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
            tenantId: job.tenantId,
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
          else if (existing.dataHash !== dataHash) outcome.itemsUpdated += 1;
        } catch (err) {
          logger.warn("Location upsert failed", {
            err: err instanceof Error ? err.message : String(err),
          });
          outcome.itemsFailed += 1;
        }
      }
    }

    // Reconcile deletions only against a complete listing. If any account
    // failed to enumerate, `seenResourceNames` is missing rows that still
    // exist at Google, and deleting them would destroy the mirrored location
    // along with its `localLocationId` link on the strength of a transient
    // API failure.
    if (!listingIncomplete) {
      await googleLocationRepository.deleteMissing(
        account.id,
        seenResourceNames,
      );
    } else {
      logger.warn("Skipping location reconciliation — listing was incomplete", {
        tenantId: job.tenantId,
        seen: seenResourceNames.length,
      });
    }

    const status =
      outcome.itemsFailed === 0
        ? SyncStatus.SUCCESS
        : outcome.itemsProcessed === outcome.itemsFailed
          ? SyncStatus.FAILED
          : SyncStatus.PARTIAL;

    await syncJobService.complete(job.id, {
      status,
      totalItems: outcome.itemsProcessed,
      ...outcome,
    });
    await googleAccountRepository.updateSyncTimestamp(
      account.id,
      new Date(),
      status === SyncStatus.FAILED ? "Location sync partially failed" : null,
    );
    await googleAccountRepository.updateStatus(
      account.id,
      GoogleAccountStatus.CONNECTED,
    );

    // Optionally chain review sync at low priority with jitter.
    await syncJobService.enqueue({
      tenantId: job.tenantId,
      googleAccountId: account.id,
      kind: SyncKind.REVIEWS,
      triggeredById: job.triggeredById,
      priority: 200,
      delayMs: 2000 + Math.floor(Math.random() * 8000),
      metadata: { source: "location_sync" },
    });
  } catch (err) {
    await handleSyncJobError({ job, err, label: "Location sync", outcome });
  }
}

function ensureResourceName(accountName: string, locationName: string): string {
  return locationName.startsWith("accounts/")
    ? locationName
    : `${accountName}/${locationName}`;
}

function extractLocationId(resourceName: string): string {
  const parts = resourceName.split("/");
  return parts[parts.length - 1] ?? resourceName;
}

function shapeLocation(loc: GoogleLocationResource) {
  const addr = loc.storefrontAddress;
  return {
    title: loc.title || "Untitled location",
    storeCode: loc.storeCode ?? null,
    primaryCategory: loc.categories?.primaryCategory?.displayName ?? null,
    addressLine: addr?.addressLines?.join(", ") ?? null,
    city: addr?.locality ?? null,
    state: addr?.administrativeArea ?? null,
    postalCode: addr?.postalCode ?? null,
    country: addr?.regionCode ?? null,
    phone: loc.phoneNumbers?.primaryPhone ?? null,
    websiteUri: loc.websiteUri ?? null,
    googlePlaceId: loc.metadata?.placeId ?? null,
  };
}
