/**
 * GeneratedReviewText repository — the uniqueness ledger.
 *
 * Every AI-generated review option served to a customer is fingerprinted
 * and stored here. This guarantees that no two customers (and no repeat
 * visitor) ever receives the same or a near-duplicate review for a given
 * location — not even a single one.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { normalizeReviewText } from "@/server/services/reviewGenerator.service";

/** Stable fingerprint of a review's normalized text. */
export function fingerprint(text: string): string {
  return createHash("sha256").update(normalizeReviewText(text)).digest("hex");
}

export const generatedReviewRepository = {
  /** Recent review texts for a location, newest first (for the avoid list). */
  async recentTexts(locationId: string, take = 30): Promise<string[]> {
    const rows = await prisma.generatedReviewText.findMany({
      where: { locationId },
      orderBy: { createdAt: "desc" },
      take,
      select: { text: true },
    });
    return rows.map((r) => r.text);
  },

  /** Which of the given fingerprints already exist for this location. */
  async existingHashes(locationId: string, hashes: string[]): Promise<Set<string>> {
    if (hashes.length === 0) return new Set();
    const rows = await prisma.generatedReviewText.findMany({
      where: { locationId, hash: { in: hashes } },
      select: { hash: true },
    });
    return new Set(rows.map((r) => r.hash));
  },

  /**
   * Persist newly served reviews. Uses createMany with skipDuplicates so
   * concurrent requests can't violate the [locationId, hash] unique index.
   */
  async record(
    tenantId: string,
    locationId: string,
    starRating: number,
    sessionId: string | null,
    items: { text: string; hash: string }[],
  ): Promise<void> {
    if (items.length === 0) return;
    await prisma.generatedReviewText.createMany({
      data: items.map((i) => ({
        tenantId,
        locationId,
        starRating,
        sessionId,
        text: i.text,
        hash: i.hash,
      })),
      skipDuplicates: true,
    });
  },
};
