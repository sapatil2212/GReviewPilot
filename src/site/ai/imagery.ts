/**
 * Curated stock imagery per industry.
 *
 * Replaces an earlier approach that built URLs like
 * `images.unsplash.com/photo-placeholder?keywords=dental`. That endpoint does
 * not exist — it 404s — so every image in every generated site and every
 * seeded template rendered as an empty box. Unsplash has no keyword-to-image
 * URL API, and the old `source.unsplash.com` redirector was retired (503), so
 * the only reliable way to get a real, topical photo without an API key at
 * render time is to reference real photo IDs directly.
 *
 * Every ID below was verified to return HTTP 200 from the Unsplash CDN. Adding
 * one without checking it reintroduces exactly the bug this module exists to
 * fix, so new entries must be verified with `npm run verify:imagery`.
 *
 * Licensing: the Unsplash License permits free commercial use without
 * attribution, which is what makes these safe to ship inside tenant sites.
 * They are still starting points — the builder's image fields let a tenant
 * replace any of them with their own upload.
 */

import { resolveIndustryKey } from "@/site/document/theme";

export type ImageRole = "hero" | "about" | "gallery" | "portrait";

interface IndustryImagery {
  hero: string[];
  about: string[];
  gallery: string[];
}

/**
 * Photo IDs grouped by industry and by the job the photo does. Splitting by
 * role matters: a hero needs a wide establishing shot, an "about" panel needs
 * something human, and a gallery needs variety. Reusing one pool for all three
 * is what makes generated sites look repetitive.
 */
const IMAGERY: Record<string, IndustryImagery> = {
  hospital: {
    hero: ["photo-1519494026892-80bbd2d6fd0d", "photo-1631217868264-e5b90bb7e133"],
    about: ["photo-1516549655169-df83a0774514", "photo-1576091160399-112ba8d25d1d"],
    gallery: [
      "photo-1538108149393-fbbd81895907",
      "photo-1579684385127-1ef15d508118",
      "photo-1551190822-a9333d879b1f",
      "photo-1519494026892-80bbd2d6fd0d",
      "photo-1516549655169-df83a0774514",
      "photo-1631217868264-e5b90bb7e133",
    ],
  },
  clinic: {
    hero: ["photo-1666214280557-f1b5022eb634", "photo-1631217868264-e5b90bb7e133"],
    about: ["photo-1576091160399-112ba8d25d1d", "photo-1516549655169-df83a0774514"],
    gallery: [
      "photo-1551190822-a9333d879b1f",
      "photo-1538108149393-fbbd81895907",
      "photo-1579684385127-1ef15d508118",
      "photo-1666214280557-f1b5022eb634",
      "photo-1576091160399-112ba8d25d1d",
      "photo-1519494026892-80bbd2d6fd0d",
    ],
  },
  dental: {
    hero: ["photo-1588776814546-1ffcf47267a5", "photo-1606811841689-23dfddce3e95"],
    about: ["photo-1629909613654-28e377c37b09", "photo-1609840114035-3c981b782dfe"],
    gallery: [
      "photo-1588776814546-1ffcf47267a5",
      "photo-1606811841689-23dfddce3e95",
      "photo-1609840114035-3c981b782dfe",
      "photo-1629909613654-28e377c37b09",
      "photo-1576091160399-112ba8d25d1d",
      "photo-1551190822-a9333d879b1f",
    ],
  },
  restaurant: {
    hero: ["photo-1517248135467-4c7edcad34c4", "photo-1552566626-52f8b828add9"],
    about: ["photo-1414235077428-338989a2e8c0", "photo-1552566626-52f8b828add9"],
    gallery: [
      "photo-1466978913421-dad2ebd01d17",
      "photo-1504674900247-0877df9cc836",
      "photo-1540189549336-e6e99c3679fe",
      "photo-1517248135467-4c7edcad34c4",
      "photo-1552566626-52f8b828add9",
      "photo-1414235077428-338989a2e8c0",
    ],
  },
  cafe: {
    hero: ["photo-1554118811-1e0d58224f24", "photo-1501339847302-ac426a4a7cbb"],
    about: ["photo-1495474472287-4d71bcdd2085", "photo-1554118811-1e0d58224f24"],
    gallery: [
      "photo-1509042239860-f550ce710b93",
      "photo-1495474472287-4d71bcdd2085",
      "photo-1501339847302-ac426a4a7cbb",
      "photo-1554118811-1e0d58224f24",
      "photo-1504674900247-0877df9cc836",
      "photo-1466978913421-dad2ebd01d17",
    ],
  },
  hotel: {
    hero: ["photo-1566073771259-6a8506099945", "photo-1445019980597-93fa8acb246c"],
    about: ["photo-1571003123894-1f0594d2b5d9", "photo-1445019980597-93fa8acb246c"],
    gallery: [
      "photo-1590490360182-c33d57733427",
      "photo-1571003123894-1f0594d2b5d9",
      "photo-1445019980597-93fa8acb246c",
      "photo-1566073771259-6a8506099945",
      "photo-1504674900247-0877df9cc836",
      "photo-1554118811-1e0d58224f24",
    ],
  },
  gym: {
    hero: ["photo-1534438327276-14e5300c3a48", "photo-1571902943202-507ec2618e8f"],
    about: ["photo-1517836357463-d25dfeac3438", "photo-1541534741688-6078c6bfb5c5"],
    gallery: [
      "photo-1541534741688-6078c6bfb5c5",
      "photo-1517836357463-d25dfeac3438",
      "photo-1571902943202-507ec2618e8f",
      "photo-1534438327276-14e5300c3a48",
      "photo-1600880292203-757bb62b4baf",
      "photo-1531973576160-7125cd663d86",
    ],
  },
  salon: {
    hero: ["photo-1560066984-138dadb4c035", "photo-1522337360788-8b13dee7a37e"],
    about: ["photo-1562322140-8baeececf3df", "photo-1631730359585-38a4935cbec4"],
    gallery: [
      "photo-1631730359585-38a4935cbec4",
      "photo-1562322140-8baeececf3df",
      "photo-1522337360788-8b13dee7a37e",
      "photo-1560066984-138dadb4c035",
      "photo-1544161515-4ab6ce6db874",
      "photo-1540555700478-4be289fbecef",
    ],
  },
  spa: {
    hero: ["photo-1544161515-4ab6ce6db874", "photo-1540555700478-4be289fbecef"],
    about: ["photo-1600334129128-685c5582fd35", "photo-1512290923902-8a9f81dc236c"],
    gallery: [
      "photo-1512290923902-8a9f81dc236c",
      "photo-1600334129128-685c5582fd35",
      "photo-1540555700478-4be289fbecef",
      "photo-1544161515-4ab6ce6db874",
      "photo-1560066984-138dadb4c035",
      "photo-1562322140-8baeececf3df",
    ],
  },
  school: {
    hero: ["photo-1580582932707-520aed937b7b", "photo-1523240795612-9a054b0db644"],
    about: ["photo-1503676260728-1c00da094a0b", "photo-1509062522246-3755977927d7"],
    gallery: [
      "photo-1509062522246-3755977927d7",
      "photo-1503676260728-1c00da094a0b",
      "photo-1523240795612-9a054b0db644",
      "photo-1580582932707-520aed937b7b",
      "photo-1522071820081-009f0129c71c",
      "photo-1600880292089-90a7e086ee0c",
    ],
  },
  realestate: {
    hero: ["photo-1560518883-ce09059eeffa", "photo-1564013799919-ab600027ffc6"],
    about: ["photo-1512917774080-9991f1c4c750", "photo-1600585154340-be6161a56a0c"],
    gallery: [
      "photo-1600585154340-be6161a56a0c",
      "photo-1512917774080-9991f1c4c750",
      "photo-1564013799919-ab600027ffc6",
      "photo-1560518883-ce09059eeffa",
      "photo-1445019980597-93fa8acb246c",
      "photo-1566073771259-6a8506099945",
    ],
  },
  lawfirm: {
    hero: ["photo-1589829545856-d10d557cf95f", "photo-1568992687947-868a62a9f521"],
    about: ["photo-1505664194779-8beaceb93744", "photo-1521737604893-d14cc237f11d"],
    gallery: [
      "photo-1521737604893-d14cc237f11d",
      "photo-1568992687947-868a62a9f521",
      "photo-1505664194779-8beaceb93744",
      "photo-1589829545856-d10d557cf95f",
      "photo-1497366754035-f200968a6e72",
      "photo-1497366811353-6870744d04b2",
    ],
  },
  agency: {
    hero: ["photo-1552664730-d307ca884978", "photo-1600880292203-757bb62b4baf"],
    about: ["photo-1522071820081-009f0129c71c", "photo-1531973576160-7125cd663d86"],
    gallery: [
      "photo-1531973576160-7125cd663d86",
      "photo-1600880292203-757bb62b4baf",
      "photo-1522071820081-009f0129c71c",
      "photo-1552664730-d307ca884978",
      "photo-1497366754035-f200968a6e72",
      "photo-1600880292089-90a7e086ee0c",
    ],
  },
  retail: {
    hero: ["photo-1441986300917-64674bd600d8", "photo-1567401893414-76b7b1e5a7a5"],
    about: ["photo-1555529669-e69e7aa0ba9a", "photo-1483985988355-763728e1935b"],
    gallery: [
      "photo-1483985988355-763728e1935b",
      "photo-1567401893414-76b7b1e5a7a5",
      "photo-1555529669-e69e7aa0ba9a",
      "photo-1441986300917-64674bd600d8",
      "photo-1531973576160-7125cd663d86",
      "photo-1600880292203-757bb62b4baf",
    ],
  },
  automotive: {
    hero: ["photo-1486262715619-67b85e0b08d3", "photo-1619642751034-765dfdf7c58e"],
    about: ["photo-1503376780353-7e6692767b70", "photo-1492144534655-ae79c964c9d7"],
    gallery: [
      "photo-1492144534655-ae79c964c9d7",
      "photo-1503376780353-7e6692767b70",
      "photo-1619642751034-765dfdf7c58e",
      "photo-1486262715619-67b85e0b08d3",
      "photo-1497366754035-f200968a6e72",
      "photo-1600880292089-90a7e086ee0c",
    ],
  },
  default: {
    hero: ["photo-1497366754035-f200968a6e72", "photo-1600880292089-90a7e086ee0c"],
    about: ["photo-1497366811353-6870744d04b2", "photo-1522071820081-009f0129c71c"],
    gallery: [
      "photo-1600880292203-757bb62b4baf",
      "photo-1552664730-d307ca884978",
      "photo-1497366754035-f200968a6e72",
      "photo-1497366811353-6870744d04b2",
      "photo-1531973576160-7125cd663d86",
      "photo-1600880292089-90a7e086ee0c",
    ],
  },
};

/**
 * Head-and-shoulders portraits for `team` sections.
 *
 * Kept industry-independent: a professional portrait reads correctly whether
 * the person is a dentist or a lawyer, and a per-industry portrait pool would
 * be 15x the images for no visible gain.
 */
const PORTRAITS = [
  "photo-1560250097-0b93528c311a",
  "photo-1573496359142-b8d87734a5a2",
  "photo-1580489944761-15a19d654956",
  "photo-1519085360753-af0119f7cbe7",
  "photo-1494790108377-be9c29b29330",
  "photo-1507003211169-0a1dd7228f2d",
  "photo-1438761681033-6461ffad8d80",
  "photo-1472099645785-5658abf4ff4e",
];

/** Every ID referenced above, for the verification script. */
export function allImageIds(): string[] {
  const ids = new Set<string>(PORTRAITS);
  for (const set of Object.values(IMAGERY)) {
    for (const role of [set.hero, set.about, set.gallery]) {
      for (const id of role) ids.add(id);
    }
  }
  return Array.from(ids);
}

/**
 * Build a CDN URL for a photo ID at a given size.
 *
 * `auto=format` lets Unsplash serve AVIF/WebP to browsers that accept them,
 * and cropping server-side means we ship a 1200px hero rather than a 4000px
 * original — both matter for the Core Web Vitals the builder promises.
 */
export function unsplashUrl(id: string, width: number, height: number, quality = 80): string {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&h=${height}&q=${quality}`;
}

function poolFor(industry: string | null | undefined, role: ImageRole): string[] {
  if (role === "portrait") return PORTRAITS;
  const set = IMAGERY[resolveIndustryKey(industry)] ?? IMAGERY.default;
  return set[role].length > 0 ? set[role] : IMAGERY.default[role];
}

/**
 * Pick one image deterministically.
 *
 * Deterministic on `seed` so recompiling the same spec produces the same page:
 * imagery that reshuffles on every save makes diffs meaningless and looks like
 * a bug to the user.
 */
export function industryImage(opts: {
  industry?: string | null;
  role: ImageRole;
  seed: number;
  width?: number;
  height?: number;
}): string {
  const pool = poolFor(opts.industry, opts.role);
  const id = pool[Math.abs(opts.seed) % pool.length];
  return unsplashUrl(id, opts.width ?? 1200, opts.height ?? 900);
}

/** Pick `count` distinct images, wrapping only if the pool is smaller. */
export function industryImageSet(opts: {
  industry?: string | null;
  role: ImageRole;
  seed: number;
  count: number;
  width?: number;
  height?: number;
}): string[] {
  const pool = poolFor(opts.industry, opts.role);
  const start = Math.abs(opts.seed) % pool.length;
  return Array.from({ length: opts.count }, (_, i) =>
    unsplashUrl(pool[(start + i) % pool.length], opts.width ?? 900, opts.height ?? 900),
  );
}
