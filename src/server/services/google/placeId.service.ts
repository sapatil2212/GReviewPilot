/**
 * Place ID resolver + verifier.
 *
 * Powers the "Quick Connect" flow — the business (or someone testing)
 * pastes a Google Maps URL or a raw Place ID, and we normalize it to
 * a usable Place ID plus (optionally, if GOOGLE_MAPS_API_KEY is set)
 * verify it and pull the business name/address via the Places API.
 *
 * Accepted inputs:
 *   - Raw Place ID: "ChIJ..." / "GhIJ..." / "Ei....", etc.
 *   - Maps URL with ?placeid=ChIJ...
 *   - Maps URL with ?q=place_id:ChIJ...
 *   - Maps "share" / "place" URL containing a Place ID in the path/data
 *
 * NOTE: Some Google Maps share links (maps.app.goo.gl short links, or
 * URLs that only contain a CID hex like !1s0x...:0x...) do NOT contain
 * an extractable Place ID. For those we instruct the user to use
 * Google's Place ID Finder. We never guess.
 */

import { placesApiEnabled } from "@/server/utils/env";
import {
  placesGetLegacy,
  placesGetNew,
} from "@/server/google/gateway/placesGateway";
import { logger } from "@/server/utils/logger";
import { ValidationError } from "@/server/utils/errors";

export interface ResolvedPlace {
  placeId: string;
  verified: boolean;
  name?: string | null;
  formattedAddress?: string | null;
  city?: string | null;
  country?: string | null;
  rating?: number | null;
  userRatingsTotal?: number | null;
  // Richer business context for AI review generation.
  primaryType?: string | null; // e.g. "Hospital"
  types?: string[] | null; // e.g. ["hospital", "health", "point_of_interest"]
  editorialSummary?: string | null; // Google's one-line description
  websiteUri?: string | null;
  phone?: string | null;
}

// Place IDs are URL-safe base64-ish tokens. Google's docs say they
// start with common prefixes but can vary; we accept a permissive but
// safe character set and a minimum length.
const PLACE_ID_RE = /^[A-Za-z0-9_-]{15,512}$/;

/**
 * Extract a Place ID from arbitrary user input (raw ID or Maps URL).
 * Synchronous parser for explicit URLs or raw IDs.
 */
export function extractPlaceId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Case 1: looks like a raw Place ID already.
  if (!trimmed.includes("/") && !trimmed.includes(" ") && PLACE_ID_RE.test(trimmed)) {
    return trimmed;
  }

  // Case 2: a URL — parse query params + path.
  let url: URL | null = null;
  try {
    url = new URL(trimmed);
  } catch {
    // Not a URL; try to salvage a place_id: token.
    const m = trimmed.match(/place_id:([A-Za-z0-9_-]{15,512})/);
    if (m) return m[1]!;
    return null;
  }

  // ?placeid=... or ?place_id=...
  const direct =
    url.searchParams.get("placeid") ?? url.searchParams.get("place_id");
  if (direct && PLACE_ID_RE.test(direct)) return direct;

  // ?q=place_id:ChIJ...
  const q = url.searchParams.get("q") ?? "";
  const qMatch = q.match(/place_id:([A-Za-z0-9_-]{15,512})/);
  if (qMatch) return qMatch[1]!;

  // Anywhere in the full URL: "place_id:XXXX"
  const anyMatch = trimmed.match(/place_id:([A-Za-z0-9_-]{15,512})/);
  if (anyMatch) return anyMatch[1]!;

  // Some URLs embed "!1s(ChIJ...)" or "!1s(0x...)" in the data param.
  const dataMatch = trimmed.match(/!1s(ChI[A-Za-z0-9_-]{10,})/);
  if (dataMatch) return dataMatch[1]!;

  // Match ChIJ / GhIJ anywhere in the URL query or path
  const chijMatch = trimmed.match(/(ChI[A-Za-z0-9_-]{20,})/);
  if (chijMatch) return chijMatch[1]!;

  return null;
}

/**
 * Expand short URLs (e.g. maps.app.goo.gl or goo.gl/maps) by following HTTP redirects.
 */
async function expandShortUrl(input: string): Promise<string> {
  const trimmed = input.trim();
  if (
    trimmed.includes("maps.app.goo.gl") ||
    trimmed.includes("goo.gl/maps") ||
    trimmed.includes("g.co/maps")
  ) {
    try {
      const res = await fetch(trimmed, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      return res.url || trimmed;
    } catch (err) {
      logger.warn("Failed to expand short Maps URL", {
        url: trimmed,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return trimmed;
}

/**
 * Verify a Place ID against the Google Places API (Place Details).
 * Only runs when GOOGLE_MAPS_API_KEY is configured; otherwise returns
 * the id unverified.
 */
export async function verifyPlaceId(placeId: string): Promise<ResolvedPlace> {
  if (!placesApiEnabled) {
    return { placeId, verified: false };
  }

  // Try the new Places API (v1) first — it's the recommended endpoint.
  const viaNew = await verifyViaNewApi(placeId);
  if (viaNew) return viaNew;

  // Fall back to the legacy Place Details endpoint.
  const viaLegacy = await verifyViaLegacyApi(placeId);
  if (viaLegacy) return viaLegacy;

  // Both failed — still usable, just unverified.
  return { placeId, verified: false };
}

/** Places API (New): GET https://places.googleapis.com/v1/places/{id} */
async function verifyViaNewApi(placeId: string): Promise<ResolvedPlace | null> {
  {
    const { data } = await placesGetNew<{
      displayName?: { text?: string };
      formattedAddress?: string;
      rating?: number;
      userRatingCount?: number;
      primaryTypeDisplayName?: { text?: string };
      types?: string[];
      editorialSummary?: { text?: string };
      websiteUri?: string;
      internationalPhoneNumber?: string;
      addressComponents?: Array<{ longText?: string; types?: string[] }>;
    }>({
      placeId,
      fieldMask:
        "id,displayName,formattedAddress,rating,userRatingCount,addressComponents,primaryTypeDisplayName,types,editorialSummary,websiteUri,internationalPhoneNumber",
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
    return {
      placeId,
      verified: true,
      name: data.displayName?.text ?? null,
      formattedAddress: data.formattedAddress ?? null,
      city,
      country,
      rating: data.rating ?? null,
      userRatingsTotal: data.userRatingCount ?? null,
      primaryType: data.primaryTypeDisplayName?.text ?? null,
      types: data.types ?? null,
      editorialSummary: data.editorialSummary?.text ?? null,
      websiteUri: data.websiteUri ?? null,
      phone: data.internationalPhoneNumber ?? null,
    };
  }
}

/** Legacy Place Details: GET /maps/api/place/details/json */
async function verifyViaLegacyApi(placeId: string): Promise<ResolvedPlace | null> {
  {
    const { data } = await placesGetLegacy<{
      status?: string;
      result?: {
        name?: string;
        formatted_address?: string;
        rating?: number;
        user_ratings_total?: number;
        address_components?: Array<{ long_name: string; types: string[] }>;
      };
      error_message?: string;
    }>({
      path: "place/details/json",
      params: {
        place_id: placeId,
        fields:
          "name,formatted_address,address_components,rating,user_ratings_total,place_id",
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
    return {
      placeId,
      verified: true,
      name: data.result.name ?? null,
      formattedAddress: data.result.formatted_address ?? null,
      city,
      country,
      rating: data.result.rating ?? null,
      userRatingsTotal: data.result.user_ratings_total ?? null,
    };
  }
}

/**
 * One-shot resolve: extract + verify. Throws ValidationError with a
 * helpful message when no Place ID can be extracted.
 */
export async function resolvePlace(input: string): Promise<ResolvedPlace> {
  const expanded = await expandShortUrl(input);
  const placeId = extractPlaceId(expanded) ?? extractPlaceId(input);
  if (!placeId) {
    throw new ValidationError(
      "Couldn't find a Place ID in that input. Please paste a direct Google Maps URL or raw Place ID. You can find your Place ID using Google's Place ID Finder: https://developers.google.com/maps/documentation/places/web-service/place-id",
    );
  }
  return verifyPlaceId(placeId);
}
