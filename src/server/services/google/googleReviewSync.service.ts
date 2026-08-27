/**
 * Google review sync service.
 *
 * Pulls reviews from:
 *   1. Official GMB Account API (listReviews) for connected Google accounts
 *      — full review history when OAuth is connected
 *   2. Google Places API (Place Details → reviews) for Quick Connect /
 *      googlePlaceId locations — Google returns at most ~5 most-relevant
 *      reviews via Places; full history requires Official OAuth
 *
 * Never invents / seeds fake reviews for connected businesses.
 */

import { Prisma, ReviewSource, ReviewStatus } from "@prisma/client";
import { createHash } from "node:crypto";
import { googleAccountRepository } from "@/server/repositories/googleAccount.repository";
import { reviewRepository } from "@/server/repositories/review.repository";
import { googleAccountService } from "./googleAccount.service";
import { analyzeAndSaveReview } from "@/server/services/sentiment.service";
import { placesApiEnabled } from "@/server/utils/env";
import {
  placesGetLegacy,
  placesGetNew,
} from "@/server/google/gateway/placesGateway";
import { logger } from "@/server/utils/logger";
import type { AuthContext } from "@/server/auth/requireSession";
import { prisma } from "@/server/db/prisma";
import { googleLocationRepository } from "@/server/repositories/googleLocation.repository";

interface RawGmbReview {
  name?: string;
  reviewId?: string;
  reviewer?: {
    displayName?: string;
    profilePhotoUrl?: string;
    isAnonymous?: boolean;
  };
  starRating?: string | number;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: {
    comment?: string;
    updateTime?: string;
  };
}

interface NormalizedPlaceReview {
  authorName: string;
  authorPhotoUrl: string | null;
  rating: number;
  text: string | null;
  /** Unix seconds */
  time: number | null;
  raw: unknown;
}

interface PlaceDetailsResult {
  reviews: NormalizedPlaceReview[];
  name: string | null;
  formattedAddress: string | null;
  city: string | null;
  country: string | null;
  rating: number | null;
  userRatingsTotal: number | null;
  websiteUri: string | null;
  phone: string | null;
}

function parseStarRating(val: unknown): number {
  if (typeof val === "number") return Math.min(5, Math.max(1, Math.round(val)));
  if (typeof val === "string") {
    const map: Record<string, number> = {
      ONE: 1,
      TWO: 2,
      THREE: 3,
      FOUR: 4,
      FIVE: 5,
    };
    if (map[val.toUpperCase()]) return map[val.toUpperCase()]!;
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed)) return Math.min(5, Math.max(1, parsed));
  }
  return 5;
}

function countryNameToIso(name: string | null | undefined): string | null {
  if (!name) return null;
  const raw = name.trim();
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  const map: Record<string, string> = {
    india: "IN",
    "united states": "US",
    usa: "US",
    "united kingdom": "GB",
    uk: "GB",
    canada: "CA",
    australia: "AU",
    germany: "DE",
    france: "FR",
    singapore: "SG",
    "united arab emirates": "AE",
    uae: "AE",
  };
  return map[raw.toLowerCase()] ?? null;
}

export const googleReviewSyncService = {
  /**
   * Sync reviews for all locations in the caller's tenant.
   */
  async syncForTenant(ctx: AuthContext, _req?: Request) {
    const locations = await prisma.location.findMany({
      where: { tenantId: ctx.tenantId, deletedAt: null },
    });

    let processed = 0;
    let created = 0;
    let updated = 0;
    let failed = 0;
    let removedSeeds = 0;
    let placesFetched = 0;
    let gmbFetched = 0;
    let placeRatingsTotal: number | null = null;
    let placeAverageRating: number | null = null;
    const warnings: string[] = [];

    // Drop previously seeded demo reviews so they never mask real data.
    const seedDelete = await prisma.review.deleteMany({
      where: {
        tenantId: ctx.tenantId,
        googleReviewId: { startsWith: "seed_" },
      },
    });
    removedSeeds = seedDelete.count;

    // 1. Official GMB Account API
    const account = await googleAccountRepository.findConnectedByTenantId(
      ctx.tenantId,
    );
    if (account) {
      try {
        const { client } = await googleAccountService.getClient(ctx.tenantId);
        const googleLocations =
          await googleLocationRepository.listForTenant(ctx.tenantId);

        for (const loc of googleLocations) {
          const resourceName = loc.googleLocationName || loc.googleLocationId;
          if (!resourceName) continue;
          try {
            const rawReviews = (await client.listReviews(
              resourceName,
            )) as RawGmbReview[];
            gmbFetched += rawReviews.length;

            for (const raw of rawReviews) {
              processed++;
              const reviewId = raw.reviewId || raw.name?.split("/").pop();
              if (!reviewId) continue;

              const rating = parseStarRating(raw.starRating);
              const dataHash = createHash("sha256")
                .update(JSON.stringify(raw))
                .digest("hex");

              const existing =
                await reviewRepository.findByGoogleReviewId(reviewId);

              let localLocationId = loc.localLocationId;
              if (!localLocationId) {
                const matched = await prisma.location.findFirst({
                  where: {
                    tenantId: ctx.tenantId,
                    deletedAt: null,
                    OR: [
                      { googleLocationId: loc.googleLocationName },
                      { googleLocationId: loc.googleLocationId },
                      ...(loc.googlePlaceId
                        ? [{ googlePlaceId: loc.googlePlaceId }]
                        : []),
                    ],
                  },
                  select: { id: true },
                });
                localLocationId = matched?.id ?? null;
              }

              const reviewData: Prisma.ReviewCreateInput = {
                tenant: { connect: { id: ctx.tenantId } },
                ...(localLocationId
                  ? { location: { connect: { id: localLocationId } } }
                  : {}),
                source: ReviewSource.GOOGLE,
                status: raw.reviewReply
                  ? ReviewStatus.REPLIED
                  : ReviewStatus.NEW,
                googleReviewId: reviewId,
                googleReviewName: raw.name ?? null,
                reviewerName: raw.reviewer?.displayName ?? "Google User",
                reviewerPhotoUrl: raw.reviewer?.profilePhotoUrl ?? null,
                reviewerIsAnonymous: raw.reviewer?.isAnonymous ?? false,
                starRating: rating,
                comment: raw.comment ?? null,
                reviewCreatedAt: raw.createTime
                  ? new Date(raw.createTime)
                  : new Date(),
                reviewUpdatedAt: raw.updateTime
                  ? new Date(raw.updateTime)
                  : null,
                googleRaw: raw as unknown as Prisma.InputJsonValue,
                dataHash,
                syncedAt: new Date(),
              };

              const saved = await reviewRepository.upsertByGoogleReviewId(
                reviewId,
                reviewData,
                {
                  ...(localLocationId
                    ? { location: { connect: { id: localLocationId } } }
                    : {}),
                  status: raw.reviewReply
                    ? ReviewStatus.REPLIED
                    : ReviewStatus.NEW,
                  reviewerName: raw.reviewer?.displayName ?? "Google User",
                  reviewerPhotoUrl: raw.reviewer?.profilePhotoUrl ?? null,
                  starRating: rating,
                  comment: raw.comment ?? null,
                  reviewUpdatedAt: raw.updateTime
                    ? new Date(raw.updateTime)
                    : null,
                  googleRaw: raw as unknown as Prisma.InputJsonValue,
                  dataHash,
                  syncedAt: new Date(),
                },
              );

              if (raw.reviewReply?.comment) {
                const activeReply = await prisma.reviewReply.findFirst({
                  where: { reviewId: saved.id, deletedAt: null },
                });
                if (!activeReply) {
                  await prisma.reviewReply.create({
                    data: {
                      reviewId: saved.id,
                      comment: raw.reviewReply.comment,
                      isFromGoogle: true,
                      googleUpdateTime: raw.reviewReply.updateTime
                        ? new Date(raw.reviewReply.updateTime)
                        : null,
                    },
                  });
                }
              }

              if (!existing) {
                created++;
                void analyzeAndSaveReview(saved.id).catch((err) => {
                  logger.warn("Sentiment analysis failed for review", {
                    reviewId: saved.id,
                    err,
                  });
                });
              } else if (existing.dataHash !== dataHash) {
                updated++;
              }
            }
          } catch (err) {
            logger.warn("Failed to list GMB reviews for location", {
              locationId: loc.id,
              googleLocationName: loc.googleLocationName,
              err: err instanceof Error ? err.message : String(err),
            });
            failed++;
          }
        }
      } catch (err) {
        logger.warn("GMB review sync failed for tenant", {
          tenantId: ctx.tenantId,
          err: err instanceof Error ? err.message : String(err),
        });
        warnings.push(
          "Official Google Business sync failed. Check OAuth connection.",
        );
      }
    }

    // 2. Places API for Quick Connect locations
    const quickConnectLocations = locations.filter(
      (loc) => loc.googlePlaceId && !(account && loc.googleLocationId),
    );

    if (quickConnectLocations.length > 0 && !placesApiEnabled) {
      warnings.push(
        "GOOGLE_MAPS_API_KEY is not set — cannot fetch real Google reviews for Quick Connect locations. Add the key and enable Places API.",
      );
    }

    for (const loc of quickConnectLocations) {
      if (!loc.googlePlaceId) continue;
      try {
        const details = await fetchPlaceDetails(loc.googlePlaceId);
        if (!details) {
          failed++;
          warnings.push(
            `Could not fetch Places data for “${loc.name}”. Check the Place ID and API key.`,
          );
          continue;
        }

        placesFetched += details.reviews.length;
        if (details.userRatingsTotal != null) {
          placeRatingsTotal = Math.max(
            placeRatingsTotal ?? 0,
            details.userRatingsTotal,
          );
        }
        if (details.rating != null) {
          placeAverageRating = details.rating;
        }

        // Refresh location profile from Google so names/cities aren't wrong.
        const countryIso = countryNameToIso(details.country);
        const cityNeedsFix =
          !loc.city ||
          loc.city === "Unknown" ||
          loc.city.trim().toLowerCase() === loc.name.trim().toLowerCase();

        await prisma.location.update({
          where: { id: loc.id },
          data: {
            ...(details.name ? { name: details.name } : {}),
            ...(details.formattedAddress
              ? { addressLine1: details.formattedAddress }
              : {}),
            ...(details.city && cityNeedsFix ? { city: details.city } : {}),
            ...(countryIso ? { country: countryIso } : {}),
            ...(details.websiteUri ? { website: details.websiteUri } : {}),
            ...(details.phone ? { phone: details.phone } : {}),
          },
        });

        for (const pr of details.reviews) {
          processed++;
          const pseudoId = `place_${loc.googlePlaceId}_${createHash("md5")
            .update(
              `${pr.authorName}_${pr.time ?? ""}_${(pr.text ?? "").slice(0, 30)}`,
            )
            .digest("hex")
            .slice(0, 16)}`;

          const rating = Math.min(5, Math.max(1, Math.round(pr.rating)));
          const dataHash = createHash("sha256")
            .update(JSON.stringify(pr.raw))
            .digest("hex");

          const existing =
            await reviewRepository.findByGoogleReviewId(pseudoId);
          const reviewCreatedAt = pr.time
            ? new Date(pr.time * 1000)
            : new Date();

          const saved = await reviewRepository.upsertByGoogleReviewId(
            pseudoId,
            {
              tenant: { connect: { id: ctx.tenantId } },
              location: { connect: { id: loc.id } },
              source: ReviewSource.GOOGLE,
              status: ReviewStatus.NEW,
              googleReviewId: pseudoId,
              reviewerName: pr.authorName,
              reviewerPhotoUrl: pr.authorPhotoUrl,
              reviewerIsAnonymous: false,
              starRating: rating,
              comment: pr.text,
              reviewCreatedAt,
              googleRaw: pr.raw as Prisma.InputJsonValue,
              dataHash,
              syncedAt: new Date(),
            },
            {
              reviewerName: pr.authorName,
              reviewerPhotoUrl: pr.authorPhotoUrl,
              starRating: rating,
              comment: pr.text,
              googleRaw: pr.raw as Prisma.InputJsonValue,
              dataHash,
              syncedAt: new Date(),
            },
          );

          if (!existing) {
            created++;
            void analyzeAndSaveReview(saved.id).catch((err) => {
              logger.warn("Sentiment analysis failed for place review", {
                reviewId: saved.id,
                err,
              });
            });
          } else if (existing.dataHash !== dataHash) {
            updated++;
          }
        }

        if (
          details.userRatingsTotal != null &&
          details.userRatingsTotal > details.reviews.length
        ) {
          warnings.push(
            `“${details.name ?? loc.name}” has ${details.userRatingsTotal.toLocaleString()} Google reviews (avg ${details.rating ?? "—"}★). Quick Connect can import only the ${details.reviews.length} most-relevant reviews from Places API. Use Official Google Business to sync the full history.`,
          );
        }
      } catch (err) {
        logger.warn("Failed to fetch Places API reviews for location", {
          locationId: loc.id,
          placeId: loc.googlePlaceId,
          err: err instanceof Error ? err.message : String(err),
        });
        failed++;
      }
    }

    return {
      processed,
      created,
      updated,
      failed,
      removedSeeds,
      placesFetched,
      gmbFetched,
      placeRatingsTotal,
      placeAverageRating,
      placesApiEnabled,
      warnings,
    };
  },
};

/**
 * Fetch place details + reviews via New Places API, with legacy fallback.
 */
async function fetchPlaceDetails(
  placeId: string,
): Promise<PlaceDetailsResult | null> {
  if (!placesApiEnabled) return null;

  const viaNew = await fetchPlaceDetailsNew(placeId);
  if (viaNew) return viaNew;

  return fetchPlaceDetailsLegacy(placeId);
}

async function fetchPlaceDetailsNew(
  placeId: string,
): Promise<PlaceDetailsResult | null> {
  {
    const { data } = await placesGetNew<{
      displayName?: { text?: string };
      formattedAddress?: string;
      rating?: number;
      userRatingCount?: number;
      websiteUri?: string;
      internationalPhoneNumber?: string;
      addressComponents?: Array<{ longText?: string; types?: string[] }>;
      reviews?: Array<{
        rating?: number;
        text?: { text?: string };
        originalText?: { text?: string };
        publishTime?: string;
        authorAttribution?: {
          displayName?: string;
          photoUri?: string;
        };
      }>;
    }>({
      placeId,
      fieldMask:
        "id,displayName,formattedAddress,rating,userRatingCount,addressComponents,websiteUri,internationalPhoneNumber,reviews",
    });
    if (!data) return null;

    const comps = data.addressComponents ?? [];
    const city =
      comps.find((c) => c.types?.includes("locality"))?.longText ??
      comps.find((c) => c.types?.includes("administrative_area_level_2"))
        ?.longText ??
      null;
    const country =
      comps.find((c) => c.types?.includes("country"))?.longText ?? null;

    const reviews: NormalizedPlaceReview[] = (data.reviews ?? []).map((r) => {
      const publishMs = r.publishTime ? Date.parse(r.publishTime) : NaN;
      return {
        authorName: r.authorAttribution?.displayName ?? "Google User",
        authorPhotoUrl: r.authorAttribution?.photoUri ?? null,
        rating: r.rating ?? 5,
        text: r.text?.text ?? r.originalText?.text ?? null,
        time: Number.isFinite(publishMs)
          ? Math.floor(publishMs / 1000)
          : null,
        raw: r,
      };
    });

    return {
      reviews,
      name: data.displayName?.text ?? null,
      formattedAddress: data.formattedAddress ?? null,
      city,
      country,
      rating: data.rating ?? null,
      userRatingsTotal: data.userRatingCount ?? null,
      websiteUri: data.websiteUri ?? null,
      phone: data.internationalPhoneNumber ?? null,
    };
  }
}

async function fetchPlaceDetailsLegacy(
  placeId: string,
): Promise<PlaceDetailsResult | null> {
  {
    const { data } = await placesGetLegacy<{
      status?: string;
      result?: {
        name?: string;
        formatted_address?: string;
        rating?: number;
        user_ratings_total?: number;
        website?: string;
        formatted_phone_number?: string;
        international_phone_number?: string;
        address_components?: Array<{ long_name: string; types: string[] }>;
        reviews?: Array<{
          author_name?: string;
          profile_photo_url?: string;
          rating?: number;
          text?: string;
          time?: number;
        }>;
      };
      error_message?: string;
    }>({
      path: "place/details/json",
      params: {
        place_id: placeId,
        fields:
          "name,formatted_address,address_components,rating,user_ratings_total,website,formatted_phone_number,international_phone_number,reviews",
        reviews_sort: "newest",
      },
    });

    if (!data?.result) return null;

    const comps = data.result.address_components ?? [];
    const city =
      comps.find((c) => c.types.includes("locality"))?.long_name ??
      comps.find((c) => c.types.includes("administrative_area_level_2"))
        ?.long_name ??
      null;
    const country =
      comps.find((c) => c.types.includes("country"))?.long_name ?? null;

    const reviews: NormalizedPlaceReview[] = (data.result.reviews ?? []).map(
      (r) => ({
        authorName: r.author_name ?? "Google User",
        authorPhotoUrl: r.profile_photo_url ?? null,
        rating: r.rating ?? 5,
        text: r.text ?? null,
        time: r.time ?? null,
        raw: r,
      }),
    );

    return {
      reviews,
      name: data.result.name ?? null,
      formattedAddress: data.result.formatted_address ?? null,
      city,
      country,
      rating: data.result.rating ?? null,
      userRatingsTotal: data.result.user_ratings_total ?? null,
      websiteUri: data.result.website ?? null,
      phone:
        data.result.international_phone_number ??
        data.result.formatted_phone_number ??
        null,
    };
  }
}
