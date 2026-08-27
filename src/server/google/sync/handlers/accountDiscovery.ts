/**
 * ACCOUNT discovery handler (SyncKind.ACCOUNTS).
 * Lists Google Business accounts via Account Management API once,
 * stores preferred account ids, then enqueues LOCATION sync.
 */

import { GoogleAccountStatus, SyncKind, SyncStatus } from "@prisma/client";
import { googleAccountRepository } from "@/server/repositories/googleAccount.repository";
import { googleAccountService } from "@/server/services/google/googleAccount.service";
import { syncJobService } from "@/server/google/sync/syncJob.service";
import { handleSyncJobError } from "./jobError";
import { logger } from "@/server/utils/logger";

export async function handleAccountDiscovery(job: {
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

  try {
    await googleAccountRepository.updateStatus(
      job.googleAccountId,
      GoogleAccountStatus.SYNCING,
    );

    const { account, client } = await googleAccountService.getClient(
      job.tenantId,
    );

    const accounts = await client.listAccounts();

    // A successful call that returns nothing is a real and common outcome:
    // the Google account that signed in does not own or manage any Business
    // Profile. Treating it as a bare success left the tenant staring at an
    // empty location list with no explanation, so say so explicitly and skip
    // chaining LOCATIONS — there is nothing for it to read.
    if (accounts.length === 0) {
      logger.info("Google account has no Business Profile accounts", {
        tenantId: job.tenantId,
        email: account.email,
      });
      await syncJobService.complete(job.id, {
        status: SyncStatus.SUCCESS,
        totalItems: 0,
        itemsProcessed: 0,
        itemsCreated: 0,
        itemsUpdated: 0,
        itemsFailed: 0,
        metadata: { accountCount: 0, preferred: null },
      });
      await googleAccountRepository.updateSyncTimestamp(
        account.id,
        new Date(),
        "This Google account does not manage any Business Profiles. Connect the " +
          "account that owns your business listing, or accept the invitation to " +
          "manage it first.",
      );
      await googleAccountRepository.updateStatus(
        account.id,
        GoogleAccountStatus.CONNECTED,
      );
      return;
    }

    const preferred =
      accounts.find((a) => a.type && a.type !== "PERSONAL") ?? accounts[0];

    if (preferred) {
      await googleAccountRepository.updateAccountIds(account.id, {
        googleAccountId: preferred.name,
        googleAccountName: preferred.accountName ?? null,
      });
    }

    await syncJobService.complete(job.id, {
      status: SyncStatus.SUCCESS,
      totalItems: accounts.length,
      itemsProcessed: accounts.length,
      itemsCreated: preferred ? 1 : 0,
      itemsUpdated: 0,
      itemsFailed: 0,
      metadata: {
        accountCount: accounts.length,
        preferred: preferred?.name ?? null,
      },
    });

    // Chain location sync (deduped if already active).
    await syncJobService.enqueue({
      tenantId: job.tenantId,
      googleAccountId: account.id,
      kind: SyncKind.LOCATIONS,
      triggeredById: job.triggeredById,
      priority: 50,
      delayMs: 500 + Math.floor(Math.random() * 2000),
      metadata: { source: "account_discovery" },
    });

    await googleAccountRepository.updateStatus(
      account.id,
      GoogleAccountStatus.CONNECTED,
    );
  } catch (err) {
    await handleSyncJobError({ job, err, label: "Account discovery" });
  }
}
