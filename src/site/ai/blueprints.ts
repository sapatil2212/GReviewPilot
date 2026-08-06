/**
 * Industry blueprints — deterministic section recipes per business type.
 *
 * Two jobs:
 *
 *   1. Fallback. When Gemini is unconfigured, rate-limited, or returns
 *      garbage, generation still produces a complete, sensible site. The
 *      existing services in this codebase (postGenerator, reviewGenerator)
 *      follow the same "AI with a template floor" pattern, and a website
 *      builder needs it more, not less — a failed generation is a blank
 *      product.
 *
 *   2. Grounding. When the AI *is* available, the blueprint's page and
 *      section structure goes into the prompt as a strong suggestion. A
 *      model asked to invent site structure from nothing produces
 *      inconsistent results; a model asked to fill in a proven structure
 *      is reliable.
 *
 * Section order encodes conversion logic, not taste: proof before ask,
 * one primary CTA per page, contact reachable without scrolling past the
 * fold on mobile.
 */

import { resolveIndustryKey } from "@/site/document/theme";

export interface BlueprintPage {
  title: string;
  path: string;
  sections: string[];
}

export interface Blueprint {
  key: string;
  label: string;
  /** Words that describe what this business sells, used in copy prompts. */
  serviceNoun: string;
  defaultServices: string[];
  pages: BlueprintPage[];
  /**
   * Present only on a second, alternate-layout blueprint for an industry
   * that already has a primary one. `resolveIndustryKey` is many-to-one —
   * free-text industry labels can only ever resolve to ONE blueprint key —
   * so a variant is never reachable through `getBlueprint()`. It exists
   * purely to be seeded as a second, visually distinct SiteTemplate under
   * the same `industry` label (see prisma/seeds/siteTemplates.ts), giving
   * the template gallery two real choices per business type instead of
   * one. Value is the primary blueprint's `key`.
   */
  variantOf?: string;
  /** Display name for the seeded template, when it should differ from `label` (variants only). */
  variantName?: string;
}

/** Sections every home page gets, in order, unless the blueprint overrides. */
const HOME_CORE = [
  "navbar",
  "hero-split",
  "services",
  "about",
  "stats",
  "reviews",
  "faq",
  "cta",
  "contact",
  "footer",
  "whatsapp",
];

function page(title: string, path: string, sections: string[]): BlueprintPage {
  // Every page needs chrome; declaring it once here stops each blueprint
  // from repeating navbar/footer/whatsapp and forgetting one.
  //
  // `page-header` gives inner pages the H1, page title, and above-the-fold
  // CTA that a home page gets from its hero. Without it every inner page
  // opened straight into a content grid with no heading — no H1 for SEO or
  // screen readers, and no title container for the eye to land on. The home
  // page is declared inline with its own hero, so it never routes through
  // here and never gets a doubled-up header.
  return {
    title,
    path,
    sections: ["navbar", "page-header", ...sections, "cta", "footer", "whatsapp"],
  };
}

const BLUEPRINTS: Record<string, Blueprint> = {
  hospital: {
    key: "hospital",
    label: "Hospital",
    serviceNoun: "medical department",
    defaultServices: ["Emergency care", "Cardiology", "Orthopaedics", "Paediatrics", "Diagnostics", "Maternity"],
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-split", "services", "stats", "about", "team", "reviews", "faq", "cta", "contact", "footer", "whatsapp"] },
      page("Departments", "/departments", ["services", "faq"]),
      page("Doctors", "/doctors", ["team", "appointment"]),
      page("About", "/about", ["about", "stats", "team"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  clinic: {
    key: "clinic",
    label: "Clinic",
    serviceNoun: "treatment",
    defaultServices: ["General consultation", "Health check-up", "Vaccinations", "Lab tests", "Follow-up care"],
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-split", "services", "about", "team", "reviews", "appointment", "faq", "contact", "footer", "whatsapp"] },
      page("Services", "/services", ["services", "pricing", "faq"]),
      page("Our team", "/team", ["team"]),
      page("Book", "/book", ["appointment", "map"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  dental: {
    key: "dental",
    label: "Dental clinic",
    serviceNoun: "dental treatment",
    defaultServices: ["Teeth cleaning", "Root canal", "Braces & aligners", "Implants", "Teeth whitening", "Kids dentistry"],
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-split", "services", "about", "team", "gallery", "reviews", "appointment", "faq", "contact", "footer", "whatsapp"] },
      page("Treatments", "/treatments", ["services", "pricing", "faq"]),
      page("Doctors", "/doctors", ["team"]),
      page("Smile gallery", "/gallery", ["gallery", "testimonials"]),
      page("Book", "/book", ["appointment", "map"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  restaurant: {
    key: "restaurant",
    label: "Restaurant",
    serviceNoun: "dish",
    defaultServices: ["Starters", "Main course", "Desserts", "Beverages", "Family platters"],
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-centered", "about", "services", "gallery", "reviews", "stats", "cta", "contact", "footer", "whatsapp"] },
      page("Menu", "/menu", ["services", "faq"]),
      page("Gallery", "/gallery", ["gallery", "testimonials"]),
      page("Reserve", "/reserve", ["appointment", "map"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  cafe: {
    key: "cafe",
    label: "Cafe",
    serviceNoun: "item",
    defaultServices: ["Espresso & filter coffee", "Fresh bakes", "All-day breakfast", "Cold brews", "Sandwiches"],
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-centered", "about", "services", "gallery", "reviews", "cta", "contact", "footer", "whatsapp"] },
      page("Menu", "/menu", ["services"]),
      page("Gallery", "/gallery", ["gallery"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  hotel: {
    key: "hotel",
    label: "Hotel",
    serviceNoun: "room type",
    defaultServices: ["Deluxe room", "Executive suite", "Family suite", "Airport transfer", "Banquet hall", "Restaurant"],
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-centered", "about", "services", "gallery", "stats", "reviews", "faq", "cta", "contact", "footer", "whatsapp"] },
      page("Rooms", "/rooms", ["services", "pricing", "gallery"]),
      page("Amenities", "/amenities", ["services", "gallery"]),
      page("Book", "/book", ["appointment", "map"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  gym: {
    key: "gym",
    label: "Gym",
    serviceNoun: "programme",
    defaultServices: ["Strength training", "Personal training", "CrossFit", "Yoga & mobility", "Cardio zone", "Nutrition coaching"],
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-centered", "stats", "services", "about", "team", "pricing", "reviews", "faq", "cta", "contact", "footer", "whatsapp"] },
      page("Programmes", "/programmes", ["services", "faq"]),
      page("Membership", "/membership", ["pricing", "faq"]),
      page("Trainers", "/trainers", ["team"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  salon: {
    key: "salon",
    label: "Salon",
    serviceNoun: "service",
    defaultServices: ["Haircut & styling", "Hair colour", "Facials", "Bridal makeup", "Manicure & pedicure", "Spa therapies"],
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-split", "services", "gallery", "about", "team", "reviews", "appointment", "contact", "footer", "whatsapp"] },
      page("Services", "/services", ["services", "pricing"]),
      page("Gallery", "/gallery", ["gallery", "testimonials"]),
      page("Book", "/book", ["appointment", "map"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  spa: {
    key: "spa",
    label: "Spa & wellness",
    serviceNoun: "therapy",
    defaultServices: ["Deep tissue massage", "Aromatherapy", "Body scrub", "Couples therapy", "Facial rituals"],
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-centered", "about", "services", "gallery", "reviews", "appointment", "contact", "footer", "whatsapp"] },
      page("Therapies", "/therapies", ["services", "pricing"]),
      page("Book", "/book", ["appointment", "map"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  school: {
    key: "school",
    label: "School",
    serviceNoun: "programme",
    defaultServices: ["Primary school", "Middle school", "Senior secondary", "Sports academy", "Arts & music", "Transport"],
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-split", "about", "services", "stats", "team", "gallery", "reviews", "faq", "cta", "contact", "footer", "whatsapp"] },
      page("Academics", "/academics", ["services", "faq"]),
      page("Admissions", "/admissions", ["appointment", "faq"]),
      page("Faculty", "/faculty", ["team"]),
      page("Campus", "/campus", ["gallery", "map"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  realestate: {
    key: "realestate",
    label: "Real estate",
    serviceNoun: "property type",
    defaultServices: ["Residential sales", "Commercial leasing", "Property management", "Home loans", "Legal advisory", "Valuation"],
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-split", "services", "stats", "about", "gallery", "reviews", "faq", "cta", "contact", "footer", "whatsapp"] },
      page("Properties", "/properties", ["services", "gallery"]),
      page("About", "/about", ["about", "team", "stats"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  lawfirm: {
    key: "lawfirm",
    label: "Law firm",
    serviceNoun: "practice area",
    defaultServices: ["Corporate law", "Family law", "Property disputes", "Criminal defence", "Taxation", "Arbitration"],
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-split", "services", "about", "team", "stats", "reviews", "faq", "cta", "contact", "footer", "whatsapp"] },
      page("Practice areas", "/practice-areas", ["services", "faq"]),
      page("Our lawyers", "/lawyers", ["team"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  agency: {
    key: "agency",
    label: "Agency",
    serviceNoun: "service",
    defaultServices: ["Brand strategy", "Web design", "Performance marketing", "SEO", "Content production", "Analytics"],
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-centered", "services", "stats", "gallery", "about", "testimonials", "pricing", "faq", "cta", "contact", "footer", "whatsapp"] },
      page("Services", "/services", ["services", "pricing", "faq"]),
      page("Work", "/work", ["gallery", "testimonials"]),
      page("About", "/about", ["about", "team", "stats"]),
      page("Blog", "/blog", ["blog"]),
      page("Contact", "/contact", ["contact"]),
    ],
  },
  retail: {
    key: "retail",
    label: "Retail store",
    serviceNoun: "category",
    defaultServices: ["New arrivals", "Best sellers", "Sale", "Accessories", "Gift cards"],
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-centered", "services", "gallery", "about", "reviews", "stats", "cta", "contact", "footer", "whatsapp"] },
      page("Shop", "/shop", ["services", "gallery"]),
      page("About", "/about", ["about", "stats", "team"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  automotive: {
    key: "automotive",
    label: "Automotive",
    serviceNoun: "service",
    defaultServices: ["General servicing", "Engine diagnostics", "Denting & painting", "AC service", "Tyre & alignment", "Insurance claims"],
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-split", "services", "stats", "about", "gallery", "reviews", "pricing", "faq", "cta", "contact", "footer", "whatsapp"] },
      page("Services", "/services", ["services", "pricing", "faq"]),
      page("Our workshop", "/workshop", ["gallery", "about", "stats"]),
      page("Our team", "/team", ["team"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  default: {
    key: "default",
    label: "Local business",
    serviceNoun: "service",
    defaultServices: ["Service one", "Service two", "Service three", "Service four"],
    pages: [
      { title: "Home", path: "/", sections: HOME_CORE },
      page("Services", "/services", ["services", "pricing", "faq"]),
      page("About", "/about", ["about", "stats", "team"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
};

/**
 * A second, differently-composed blueprint per industry.
 *
 * Each variant keeps the same `label` (so it groups under the same industry
 * filter in the template gallery) and the same `defaultServices`/
 * `serviceNoun` (same business, same offering), but swaps the hero style,
 * reorders proof/social sections, and varies which optional sections show up
 * — enough to make it a genuinely different layout to pick from, not a
 * re-skin. `variantOf` points back at the primary blueprint's key so the
 * seed script can validate it instead of round-tripping through
 * `resolveIndustryKey`, which can only ever resolve a label to one key.
 */
const BLUEPRINT_VARIANTS: Record<string, Blueprint> = {
  "hospital-2": {
    key: "hospital-2",
    label: BLUEPRINTS.hospital.label,
    serviceNoun: BLUEPRINTS.hospital.serviceNoun,
    defaultServices: BLUEPRINTS.hospital.defaultServices,
    variantOf: "hospital",
    variantName: "Hospital — Emergency focus",
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-centered", "stats", "services", "reviews", "team", "faq", "cta", "contact", "footer", "whatsapp"] },
      page("Departments", "/departments", ["services", "stats", "faq"]),
      page("Doctors", "/doctors", ["team", "reviews", "appointment"]),
      page("About", "/about", ["about", "gallery", "stats"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  "clinic-2": {
    key: "clinic-2",
    label: BLUEPRINTS.clinic.label,
    serviceNoun: BLUEPRINTS.clinic.serviceNoun,
    defaultServices: BLUEPRINTS.clinic.defaultServices,
    variantOf: "clinic",
    variantName: "Clinic — Booking focus",
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-split", "stats", "services", "reviews", "faq", "appointment", "contact", "footer", "whatsapp"] },
      page("Services", "/services", ["services", "faq"]),
      page("Our team", "/team", ["team", "stats"]),
      page("Pricing", "/pricing", ["pricing", "faq"]),
      page("Book", "/book", ["appointment", "map"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  "dental-2": {
    key: "dental-2",
    label: BLUEPRINTS.dental.label,
    serviceNoun: BLUEPRINTS.dental.serviceNoun,
    defaultServices: BLUEPRINTS.dental.defaultServices,
    variantOf: "dental",
    variantName: "Dental clinic — Smile gallery focus",
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-centered", "gallery", "services", "stats", "testimonials", "team", "faq", "appointment", "contact", "footer", "whatsapp"] },
      page("Treatments", "/treatments", ["services", "faq"]),
      page("Pricing", "/pricing", ["pricing", "faq"]),
      page("Doctors", "/doctors", ["team", "reviews"]),
      page("Smile gallery", "/gallery", ["gallery", "testimonials"]),
      page("Book", "/book", ["appointment", "map"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  "restaurant-2": {
    key: "restaurant-2",
    label: BLUEPRINTS.restaurant.label,
    serviceNoun: BLUEPRINTS.restaurant.serviceNoun,
    defaultServices: BLUEPRINTS.restaurant.defaultServices,
    variantOf: "restaurant",
    variantName: "Restaurant — Gallery-led",
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-split", "gallery", "services", "about", "stats", "testimonials", "reviews", "cta", "contact", "footer", "whatsapp"] },
      page("Menu", "/menu", ["services", "pricing", "faq"]),
      page("Gallery", "/gallery", ["gallery", "testimonials"]),
      page("Reserve", "/reserve", ["appointment", "map"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  "cafe-2": {
    key: "cafe-2",
    label: BLUEPRINTS.cafe.label,
    serviceNoun: BLUEPRINTS.cafe.serviceNoun,
    defaultServices: BLUEPRINTS.cafe.defaultServices,
    variantOf: "cafe",
    variantName: "Cafe — Photo-first",
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-split", "gallery", "about", "services", "testimonials", "reviews", "cta", "contact", "footer", "whatsapp"] },
      page("Menu", "/menu", ["services", "faq"]),
      page("Gallery", "/gallery", ["gallery", "testimonials"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  "hotel-2": {
    key: "hotel-2",
    label: BLUEPRINTS.hotel.label,
    serviceNoun: BLUEPRINTS.hotel.serviceNoun,
    defaultServices: BLUEPRINTS.hotel.defaultServices,
    variantOf: "hotel",
    variantName: "Hotel — Booking focus",
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-split", "stats", "gallery", "services", "reviews", "testimonials", "faq", "appointment", "contact", "footer", "whatsapp"] },
      page("Rooms", "/rooms", ["services", "pricing", "gallery", "faq"]),
      page("Amenities", "/amenities", ["services", "gallery", "stats"]),
      page("Book", "/book", ["appointment", "map"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  "gym-2": {
    key: "gym-2",
    label: BLUEPRINTS.gym.label,
    serviceNoun: BLUEPRINTS.gym.serviceNoun,
    defaultServices: BLUEPRINTS.gym.defaultServices,
    variantOf: "gym",
    variantName: "Gym — Trainer focus",
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-split", "team", "services", "stats", "gallery", "pricing", "testimonials", "faq", "cta", "contact", "footer", "whatsapp"] },
      page("Programmes", "/programmes", ["services", "gallery", "faq"]),
      page("Membership", "/membership", ["pricing", "stats", "faq"]),
      page("Trainers", "/trainers", ["team", "reviews"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  "salon-2": {
    key: "salon-2",
    label: BLUEPRINTS.salon.label,
    serviceNoun: BLUEPRINTS.salon.serviceNoun,
    defaultServices: BLUEPRINTS.salon.defaultServices,
    variantOf: "salon",
    variantName: "Salon — Portfolio-led",
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-centered", "gallery", "services", "team", "testimonials", "reviews", "appointment", "contact", "footer", "whatsapp"] },
      page("Services", "/services", ["services", "pricing", "faq"]),
      page("Our stylists", "/team", ["team", "reviews"]),
      page("Gallery", "/gallery", ["gallery", "testimonials"]),
      page("Book", "/book", ["appointment", "map"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  "spa-2": {
    key: "spa-2",
    label: BLUEPRINTS.spa.label,
    serviceNoun: BLUEPRINTS.spa.serviceNoun,
    defaultServices: BLUEPRINTS.spa.defaultServices,
    variantOf: "spa",
    variantName: "Spa & wellness — Gallery-led",
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-split", "gallery", "services", "about", "testimonials", "reviews", "appointment", "contact", "footer", "whatsapp"] },
      page("Therapies", "/therapies", ["services", "pricing", "faq"]),
      page("Gallery", "/gallery", ["gallery", "testimonials"]),
      page("Book", "/book", ["appointment", "map"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  "school-2": {
    key: "school-2",
    label: BLUEPRINTS.school.label,
    serviceNoun: BLUEPRINTS.school.serviceNoun,
    defaultServices: BLUEPRINTS.school.defaultServices,
    variantOf: "school",
    variantName: "School — Admissions focus",
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-centered", "stats", "services", "gallery", "testimonials", "reviews", "faq", "appointment", "contact", "footer", "whatsapp"] },
      page("Academics", "/academics", ["services", "stats", "faq"]),
      page("Admissions", "/admissions", ["appointment", "pricing", "faq"]),
      page("Faculty", "/faculty", ["team", "reviews"]),
      page("Campus", "/campus", ["gallery", "map"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  "realestate-2": {
    key: "realestate-2",
    label: BLUEPRINTS.realestate.label,
    serviceNoun: BLUEPRINTS.realestate.serviceNoun,
    defaultServices: BLUEPRINTS.realestate.defaultServices,
    variantOf: "realestate",
    variantName: "Real estate — Listings-led",
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-split", "gallery", "services", "stats", "testimonials", "reviews", "faq", "cta", "contact", "footer", "whatsapp"] },
      page("Properties", "/properties", ["services", "gallery", "faq"]),
      page("About", "/about", ["about", "team", "stats", "reviews"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  "lawfirm-2": {
    key: "lawfirm-2",
    label: BLUEPRINTS.lawfirm.label,
    serviceNoun: BLUEPRINTS.lawfirm.serviceNoun,
    defaultServices: BLUEPRINTS.lawfirm.defaultServices,
    variantOf: "lawfirm",
    variantName: "Law firm — Practice-led",
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-centered", "stats", "services", "testimonials", "reviews", "team", "faq", "cta", "contact", "footer", "whatsapp"] },
      page("Practice areas", "/practice-areas", ["services", "stats", "faq"]),
      page("Our lawyers", "/lawyers", ["team", "reviews"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  "agency-2": {
    key: "agency-2",
    label: BLUEPRINTS.agency.label,
    serviceNoun: BLUEPRINTS.agency.serviceNoun,
    defaultServices: BLUEPRINTS.agency.defaultServices,
    variantOf: "agency",
    variantName: "Agency — Portfolio-led",
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-split", "gallery", "stats", "services", "testimonials", "pricing", "faq", "cta", "contact", "footer", "whatsapp"] },
      page("Services", "/services", ["services", "faq"]),
      page("Work", "/work", ["gallery", "testimonials", "stats"]),
      page("Pricing", "/pricing", ["pricing", "faq"]),
      page("About", "/about", ["about", "team"]),
      page("Blog", "/blog", ["blog"]),
      page("Contact", "/contact", ["contact"]),
    ],
  },
  "retail-2": {
    key: "retail-2",
    label: BLUEPRINTS.retail.label,
    serviceNoun: BLUEPRINTS.retail.serviceNoun,
    defaultServices: BLUEPRINTS.retail.defaultServices,
    variantOf: "retail",
    variantName: "Retail store — Gallery-led",
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-split", "gallery", "services", "stats", "testimonials", "reviews", "cta", "contact", "footer", "whatsapp"] },
      page("Shop", "/shop", ["services", "gallery", "faq"]),
      page("About", "/about", ["about", "stats", "reviews"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
  "automotive-2": {
    key: "automotive-2",
    label: BLUEPRINTS.automotive.label,
    serviceNoun: BLUEPRINTS.automotive.serviceNoun,
    defaultServices: BLUEPRINTS.automotive.defaultServices,
    variantOf: "automotive",
    variantName: "Automotive — Workshop focus",
    pages: [
      { title: "Home", path: "/", sections: ["navbar", "hero-centered", "gallery", "stats", "services", "testimonials", "reviews", "faq", "cta", "contact", "footer", "whatsapp"] },
      page("Services", "/services", ["services", "pricing", "faq"]),
      page("Our workshop", "/workshop", ["gallery", "stats", "team"]),
      page("Our team", "/team", ["team", "reviews"]),
      page("Contact", "/contact", ["contact", "map"]),
    ],
  },
};

export function getBlueprint(industry?: string | null): Blueprint {
  return BLUEPRINTS[resolveIndustryKey(industry)] ?? BLUEPRINTS.default;
}

export function listBlueprints(): Blueprint[] {
  return Object.values(BLUEPRINTS).filter((b) => b.key !== "default");
}

/** The second, alternate-layout blueprint for each industry (see `BLUEPRINT_VARIANTS`). */
export function listBlueprintVariants(): Blueprint[] {
  return Object.values(BLUEPRINT_VARIANTS);
}
