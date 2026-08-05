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
  return {
    title,
    path,
    sections: ["navbar", ...sections, "cta", "footer", "whatsapp"],
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

export function getBlueprint(industry?: string | null): Blueprint {
  return BLUEPRINTS[resolveIndustryKey(industry)] ?? BLUEPRINTS.default;
}

export function listBlueprints(): Blueprint[] {
  return Object.values(BLUEPRINTS).filter((b) => b.key !== "default");
}
