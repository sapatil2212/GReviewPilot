/**
 * SiteSpec -> SiteDocument.
 *
 * The deterministic half of the AI pipeline. Takes the small, easily
 * validated spec the model produced and expands it into full node trees
 * using the preset library, then fills in the things the model should not
 * be trusted with: image URLs, contact details, nav links, and anything
 * that must match real tenant data.
 *
 * Being deterministic matters beyond correctness — the same spec always
 * compiles to the same document, so regenerating a page is predictable and
 * a spec can be stored as a compact "recipe" for a template.
 */

import { createEmptyDocument, insertSubtree, normalizeDocument } from "@/site/document/operations";
import { createTheme } from "@/site/document/theme";
import { buildSection, resolvePresetAlias } from "@/site/registry/presets";
import type { PresetInput } from "@/site/registry/presets";
import type { BrandContext, SeoMeta, SiteDocument, ThemeTokens } from "@/site/document/types";
import { getBlueprint, type Blueprint } from "./blueprints";
import { industryImage, industryImageSet, type ImageRole } from "./imagery";
import type { PageSpec, SectionSpec, SiteSpec } from "./spec";

export interface CompiledPage {
  title: string;
  path: string;
  isHome: boolean;
  document: SiteDocument;
  seo: SeoMeta;
}

export interface CompiledSite {
  theme: ThemeTokens;
  brand: BrandContext;
  pages: CompiledPage[];
  summary?: string;
}

/** Contact + identity details that come from the tenant, never the model. */
export interface CompileContext {
  businessName: string;
  industry?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  locationId?: string | null;
  language?: string | null;
  /** Existing theme to preserve brand colors across regenerations. */
  baseTheme?: ThemeTokens;
}

// =====================================================================
// Imagery
// =====================================================================

/**
 * Which preset gets which kind of photo.
 *
 * Sections absent from this map are left without imagery on purpose — a
 * pricing table or FAQ padded with stock photos looks worse, not better.
 *
 * The AI supplies `imageQuery` describing *what* the photo should show; it must
 * never supply URLs, because hallucinated image links are the most common way
 * AI-generated sites ship visibly broken. The query is used as an industry hint
 * into the curated library in ./imagery.ts, which only contains photo IDs
 * verified to resolve.
 */
const SECTION_IMAGE_ROLE: Record<string, ImageRole> = {
  "hero-split": "hero",
  "hero-centered": "hero",
  about: "about",
  gallery: "gallery",
  team: "portrait",
};

// =====================================================================
// Section input
// =====================================================================

function toPresetInput(
  section: SectionSpec,
  ctx: CompileContext,
  seed: number,
): PresetInput {
  const preset = resolvePresetAlias(section.preset) || section.preset;
  const role = SECTION_IMAGE_ROLE[preset];
  // The model's imageQuery is only a hint; an unrecognised phrase falls back to
  // the tenant's industry rather than to nothing.
  const industryHint = section.imageQuery ?? ctx.industry;

  return {
    businessName: ctx.businessName,
    eyebrow: section.eyebrow,
    title: section.title,
    subtitle: section.subtitle,
    body: section.body,
    ctaLabel: section.ctaLabel,
    ctaHref: section.ctaHref,
    secondaryCtaLabel: section.secondaryCtaLabel,
    ...(role
      ? {
          imageUrl: industryImage({
            // A team section's single image slot still wants a scene, not a
            // face; only the per-person cards use portraits.
            industry: industryHint,
            role: role === "portrait" ? "about" : role,
            seed,
            width: 1200,
            height: 900,
          }),
          imageUrls: industryImageSet({
            industry: industryHint,
            role: role === "portrait" ? "gallery" : role,
            seed,
            count: 6,
            width: 900,
            height: 900,
          }),
        }
      : {}),
    ...(ctx.phone ? { phone: ctx.phone } : {}),
    ...(ctx.whatsapp ? { whatsapp: ctx.whatsapp } : {}),
    ...(ctx.email ? { email: ctx.email } : {}),
    ...(ctx.address ? { address: ctx.address } : {}),
    ...(ctx.locationId ? { locationId: ctx.locationId } : {}),
    // Item-level images: fill any the model left empty so a card never renders
    // a blank box. Team cards get portraits; everything else gets scene shots.
    items: section.items?.map((item, i) => ({
      ...item,
      imageUrl:
        item.imageUrl ||
        (role
          ? industryImage({
              industry: industryHint,
              role: role === "portrait" ? "portrait" : role,
              seed: seed + i * 7 + 1,
              width: 600,
              height: 600,
            })
          : undefined),
    })),
  };
}

// =====================================================================
// Page compilation
// =====================================================================

export function compilePage(
  spec: PageSpec,
  ctx: CompileContext,
  pageIndex = 0,
): CompiledPage {
  let document = createEmptyDocument();
  const root = document.root;

  for (const [i, section] of spec.sections.entries()) {
    // Seed from page + position so imagery is varied within a page but
    // stable across recompiles of the same spec.
    const seed = pageIndex * 1000 + i * 17 + 3;
    const subtree = buildSection(section.preset, toPresetInput(section, ctx, seed));
    if (!subtree) continue;
    document = insertSubtree(document, root, subtree.nodes, subtree.rootId, -1);
  }

  const isHome = spec.path === "/";
  const title = spec.metaTitle ?? buildMetaTitle(spec, ctx, isHome);

  return {
    title: spec.title,
    path: normalizePath(spec.path),
    isHome,
    document: normalizeDocument(document),
    seo: {
      title,
      description: spec.metaDescription ?? buildMetaDescription(spec, ctx),
      schemaType: schemaTypeFor(ctx.industry),
    },
  };
}

function buildMetaTitle(spec: PageSpec, ctx: CompileContext, isHome: boolean): string {
  const where = ctx.city ? ` in ${ctx.city}` : "";
  // Home pages read better as "Business | Category in City"; inner pages as
  // "Page | Business". Both stay inside the ~60 char SERP budget.
  const raw = isHome
    ? `${ctx.businessName}${ctx.industry ? ` | ${titleCase(ctx.industry)}${where}` : where}`
    : `${spec.title} | ${ctx.businessName}`;
  return raw.slice(0, 60);
}

function buildMetaDescription(spec: PageSpec, ctx: CompileContext): string {
  const hero = spec.sections.find((s) => s.subtitle || s.body);
  const base =
    hero?.subtitle ??
    hero?.body ??
    `${ctx.businessName} offers trusted ${ctx.industry ? titleCase(ctx.industry).toLowerCase() : "local"} services${ctx.city ? ` in ${ctx.city}` : ""}. Get in touch today.`;
  return base.replace(/\s+/g, " ").trim().slice(0, 155);
}

/** Map an industry onto a schema.org type for rich results. */
function schemaTypeFor(industry?: string | null): string {
  const map: Record<string, string> = {
    hospital: "Hospital",
    clinic: "MedicalClinic",
    dental: "Dentist",
    restaurant: "Restaurant",
    cafe: "CafeOrCoffeeShop",
    hotel: "Hotel",
    gym: "ExerciseGym",
    salon: "BeautySalon",
    spa: "DaySpa",
    school: "School",
    realestate: "RealEstateAgent",
    lawfirm: "LegalService",
    agency: "ProfessionalService",
    retail: "Store",
    automotive: "AutoRepair",
  };
  const key = getBlueprint(industry).key;
  return map[key] ?? "LocalBusiness";
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Normalize to a leading-slash, no-trailing-slash, lowercase route. */
export function normalizePath(path: string): string {
  let p = path.trim().toLowerCase();
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

// =====================================================================
// Site compilation
// =====================================================================

export function compileSite(spec: SiteSpec, ctx: CompileContext): CompiledSite {
  const theme = ctx.baseTheme
    ? {
        ...ctx.baseTheme,
        ...(spec.theme?.primary || spec.theme?.styleKeyword
          ? createTheme({
              industry: spec.brand?.industry ?? ctx.industry,
              primary: spec.theme?.primary ?? ctx.baseTheme.colors.primary,
              secondary: spec.theme?.secondary ?? ctx.baseTheme.colors.secondary,
              accent: spec.theme?.accent ?? ctx.baseTheme.colors.accent,
              styleKeyword: spec.theme?.styleKeyword ?? ctx.baseTheme.styleKeyword,
            })
          : {}),
      }
    : createTheme({
        industry: spec.brand?.industry ?? ctx.industry,
        primary: spec.theme?.primary,
        secondary: spec.theme?.secondary,
        accent: spec.theme?.accent,
        styleKeyword: spec.theme?.styleKeyword,
      });

  const brand: BrandContext = {
    businessName: spec.brand?.businessName ?? ctx.businessName,
    industry: spec.brand?.industry ?? ctx.industry ?? undefined,
    businessCategory: spec.brand?.businessCategory ?? undefined,
    services: spec.brand?.services ?? undefined,
    targetAudience: spec.brand?.targetAudience ?? undefined,
    tone: spec.brand?.tone ?? undefined,
    highlights: spec.brand?.highlights ?? undefined,
    brandColors: [theme.colors.primary, theme.colors.secondary, theme.colors.accent],
    logoUrl: ctx.logoUrl ?? undefined,
    city: ctx.city ?? undefined,
    country: ctx.country ?? undefined,
    language: ctx.language ?? undefined,
    phone: ctx.phone ?? undefined,
    email: ctx.email ?? undefined,
    whatsapp: ctx.whatsapp ?? undefined,
    address: ctx.address ?? undefined,
  };

  // Guarantee exactly one home page: a model can omit "/" or emit it twice,
  // and both break routing.
  const seen = new Set<string>();
  const pages: CompiledPage[] = [];
  for (const [i, pageSpec] of spec.pages.entries()) {
    const path = normalizePath(pageSpec.path);
    if (seen.has(path)) continue;
    seen.add(path);
    pages.push(compilePage({ ...pageSpec, path }, { ...ctx, baseTheme: theme }, i));
  }
  if (pages.length > 0 && !pages.some((p) => p.isHome)) {
    pages[0] = { ...pages[0], path: "/", isHome: true };
  }

  return { theme, brand, pages, summary: spec.summary };
}

// =====================================================================
// Deterministic spec (no-AI path)
// =====================================================================

export interface BlueprintSpecOptions {
  /**
   * Fill people-shaped fields (staff names, reviewer names) with plausible
   * sample values instead of neutral placeholders.
   *
   * Off by default, and deliberately so. This same function is the fallback
   * that builds a real tenant's site when Gemini is unavailable, and putting
   * invented staff names on a real business's website is a serious problem —
   * it is why the default is the honest "Team member" placeholder.
   *
   * The template seeder turns it on, because a gallery template is understood
   * to be demo content and "Team member" repeated four times makes an
   * otherwise finished design look broken.
   */
  demoContent?: boolean;
  /**
   * Use this blueprint instead of resolving one from `ctx.industry`.
   *
   * `getBlueprint()` resolves free-text industry labels to a blueprint key
   * many-to-one, so a second, alternate-layout blueprint for an industry
   * (see `listBlueprintVariants()` in blueprints.ts) is never reachable
   * through that lookup — it needs to be handed in directly. Used by the
   * template seeder to compile variant templates.
   */
  blueprintOverride?: Blueprint;
}

/** Sample staff, per industry, used only when `demoContent` is on. */
const DEMO_STAFF: Record<string, Array<{ title: string; role: string }>> = {
  hospital: [
    { title: "Dr. Anita Rao", role: "Chief of Medicine" },
    { title: "Dr. Michael Chen", role: "Cardiologist" },
    { title: "Dr. Sarah Whitfield", role: "Head of Paediatrics" },
    { title: "Dr. Omar Haddad", role: "Orthopaedic Surgeon" },
  ],
  clinic: [
    { title: "Dr. Ellen Park", role: "General Physician" },
    { title: "Dr. Raj Malhotra", role: "Family Medicine" },
    { title: "Nurse Grace Adeyemi", role: "Practice Nurse" },
    { title: "Dr. Laura Bennett", role: "Consultant" },
  ],
  dental: [
    { title: "Dr. Meera Iyer", role: "Principal Dentist" },
    { title: "Dr. James Okoro", role: "Orthodontist" },
    { title: "Dr. Sofia Almeida", role: "Implant Surgeon" },
    { title: "Hannah Cole", role: "Dental Hygienist" },
  ],
  restaurant: [
    { title: "Marco Bellini", role: "Head Chef" },
    { title: "Yuki Tanaka", role: "Sous Chef" },
    { title: "Amara Diallo", role: "Restaurant Manager" },
    { title: "Tom Hargreaves", role: "Sommelier" },
  ],
  cafe: [
    { title: "Leo Fernandes", role: "Head Barista" },
    { title: "Nina Kowalski", role: "Pastry Chef" },
    { title: "Sam Ortiz", role: "Café Manager" },
    { title: "Priya Nair", role: "Roaster" },
  ],
  hotel: [
    { title: "Claire Dubois", role: "General Manager" },
    { title: "Ravi Shankar", role: "Head of Guest Relations" },
    { title: "Elena Petrova", role: "Head Concierge" },
    { title: "Daniel Mensah", role: "Executive Chef" },
  ],
  gym: [
    { title: "Chris Whelan", role: "Head Coach" },
    { title: "Aisha Rahman", role: "Strength Specialist" },
    { title: "Diego Morales", role: "Personal Trainer" },
    { title: "Freya Lindqvist", role: "Yoga & Mobility" },
  ],
  salon: [
    { title: "Isabelle Moreau", role: "Creative Director" },
    { title: "Zara Ahmed", role: "Senior Colourist" },
    { title: "Nate Robinson", role: "Senior Stylist" },
    { title: "Lucia Rossi", role: "Bridal Specialist" },
  ],
  spa: [
    { title: "Mia Sørensen", role: "Lead Therapist" },
    { title: "Arjun Kapoor", role: "Massage Therapist" },
    { title: "Chloé Martin", role: "Aesthetician" },
    { title: "Kenji Watanabe", role: "Wellness Consultant" },
  ],
  school: [
    { title: "Dr. Patricia Lowe", role: "Principal" },
    { title: "Mr. Samuel Adeyemi", role: "Head of Academics" },
    { title: "Ms. Rebecca Tan", role: "Head of Primary" },
    { title: "Mr. Victor Ivanov", role: "Head of Sports" },
  ],
  realestate: [
    { title: "Grace Sullivan", role: "Managing Director" },
    { title: "Faisal Karim", role: "Senior Sales Agent" },
    { title: "Nora Bergström", role: "Lettings Manager" },
    { title: "Peter Nkemelu", role: "Commercial Specialist" },
  ],
  lawfirm: [
    { title: "Katherine Whitfield", role: "Managing Partner" },
    { title: "Adrian Cross", role: "Partner, Corporate" },
    { title: "Deepa Menon", role: "Partner, Family Law" },
    { title: "Julian Reyes", role: "Senior Associate" },
  ],
  agency: [
    { title: "Ben Alvarez", role: "Founder & Strategy Lead" },
    { title: "Maya Krishnan", role: "Creative Director" },
    { title: "Oskar Nowak", role: "Head of Performance" },
    { title: "Tania Brooks", role: "Account Director" },
  ],
  retail: [
    { title: "Holly Fraser", role: "Store Manager" },
    { title: "Idris Bello", role: "Buyer" },
    { title: "Camille Lefèvre", role: "Visual Merchandiser" },
    { title: "Jonas Weber", role: "Customer Experience Lead" },
  ],
  automotive: [
    { title: "Dave Mitchell", role: "Master Technician" },
    { title: "Sunil Bhatt", role: "Diagnostics Specialist" },
    { title: "Erin Doyle", role: "Service Manager" },
    { title: "Marcus Bianchi", role: "Bodywork Specialist" },
  ],
  default: [
    { title: "Alex Morgan", role: "Founder" },
    { title: "Sam Rivera", role: "Operations Lead" },
    { title: "Jordan Blake", role: "Senior Specialist" },
    { title: "Riley Chen", role: "Client Manager" },
  ],
};

/** Sample reviewer names, used only when `demoContent` is on. */
const DEMO_REVIEWERS = ["Priya S.", "Daniel M.", "Aisha K.", "Tom R."];

/**
 * Pick a service-card icon.
 *
 * Keyword match first so the icon actually relates to the service ("Teeth
 * cleaning" gets a smile, "Airport transfer" gets a car), then a rotation
 * through visually distinct generic icons so no two adjacent cards repeat.
 *
 * Every name here must exist in `SITE_ICONS` (src/site/render/icons.ts), which
 * is a curated allowlist rather than the whole lucide set — an unlisted name
 * resolves to the `Sparkles` fallback, which would silently undo the variety
 * this function exists to add. `verify:site-render` asserts that.
 */
const SERVICE_ICON_KEYWORDS: Array<[RegExp, string]> = [
  [/tooth|teeth|dental|smile|braces|align|implant|whiten/i, "Smile"],
  [/clean|hygien|polish|scrub/i, "Sparkles"],
  [/emergency|urgent|ambulance/i, "Ambulance"],
  [/heart|cardio/i, "HeartPulse"],
  [/bone|ortho|joint/i, "Bone"],
  [/child|kid|paediatr|pediatr|matern|pregnan/i, "Baby"],
  [/lab|test|diagnos|scan|x-?ray/i, "FlaskConical"],
  [/consult|check-?up|advis/i, "Stethoscope"],
  [/vaccin|inject|needle/i, "Syringe"],
  [/coffee|espresso|brew|latte/i, "Coffee"],
  [/dessert|cake|sweet|pastry|bake/i, "Cake"],
  [/food|dish|menu|main course|starter|platter|sandwich|breakfast/i, "Utensils"],
  [/drink|beverage|juice|bar\b|wine/i, "HandPlatter"],
  [/room|suite|stay|accommodat/i, "Bed"],
  [/transfer|transport|tyre|tire|engine|vehicle|\bcar\b|auto/i, "Car"],
  [/paint|dent|bodywork/i, "Brush"],
  [/banquet|event|hall|party/i, "PartyPopper"],
  [/train|strength|gym|fitness|crossfit/i, "Dumbbell"],
  [/yoga|mobility|stretch|medit/i, "Flower2"],
  [/nutrition|diet|meal/i, "Leaf"],
  [/hair|cut|styl|colour|color/i, "Scissors"],
  [/facial|skin|beaut|makeup|bridal|nail|manicure|pedicure/i, "Gem"],
  [/massage|therap|spa|aroma|relax/i, "HandHeart"],
  [/school|class|academic|primary|secondary|tuition|course/i, "GraduationCap"],
  [/sport|athlet/i, "Trophy"],
  [/art|music|dance/i, "Music"],
  [/sale|sell|buy|proper|resident|commercial|lease|rent/i, "Home"],
  [/loan|mortgage|financ|valuation|tax/i, "PiggyBank"],
  [/legal|law|court|arbitr|defence|defense|dispute/i, "Scale"],
  [/corporate|business|company/i, "Briefcase"],
  [/famil/i, "Users"],
  [/brand|strateg|design|creativ/i, "Palette"],
  [/market|seo|performance|ads|advertis/i, "TrendingUp"],
  [/content|copy|blog|video|production/i, "Video"],
  [/analytic|report|data|insight/i, "Activity"],
  [/web|site|app|develop/i, "Laptop"],
  [/deliver|shipping|courier/i, "Truck"],
  [/gift|voucher/i, "Gift"],
  [/insur|claim|warrant/i, "ShieldCheck"],
  [/service|repair|maintain|servicing/i, "Wrench"],
  [/arrival|new\b|trend|best seller|accessor/i, "ShoppingBag"],
];

const SERVICE_ICON_ROTATION = [
  "Sparkles",
  "ShieldCheck",
  "HeartHandshake",
  "BadgeCheck",
  "Star",
  "Award",
  "Target",
  "Package",
];

function matchServiceIcon(serviceName: string): string | null {
  for (const [pattern, icon] of SERVICE_ICON_KEYWORDS) {
    if (pattern.test(serviceName)) return icon;
  }
  return null;
}

/**
 * Icons for a whole service list, avoiding adjacent repeats.
 *
 * Resolving each name independently is not enough: a dental list is six dental
 * services, so keyword matching hands back "Smile" four times in a row, which
 * looks exactly as generated as the single hardcoded icon it replaced. Choosing
 * across the list lets a repeat fall through to the rotation, so neighbours
 * always differ while the icon still relates to the service where it can.
 */
export function serviceIcons(serviceNames: string[]): string[] {
  const out: string[] = [];
  let rotation = 0;

  for (const name of serviceNames) {
    const matched = matchServiceIcon(name);
    if (matched && matched !== out[out.length - 1]) {
      out.push(matched);
      continue;
    }
    // Either no keyword matched, or it would repeat the previous card. Walk the
    // rotation until it differs from the neighbour.
    let candidate = SERVICE_ICON_ROTATION[rotation % SERVICE_ICON_ROTATION.length];
    while (candidate === out[out.length - 1]) {
      rotation += 1;
      candidate = SERVICE_ICON_ROTATION[rotation % SERVICE_ICON_ROTATION.length];
    }
    rotation += 1;
    out.push(candidate);
  }

  return out;
}

/**
 * Build a complete SiteSpec from a blueprint alone.
 *
 * This is what runs when Gemini is unavailable. The copy is generic but
 * grammatical and on-topic, the structure is identical to the AI path, and
 * every section is fully editable — so the user still lands in a real
 * website rather than an error state.
 */
export function blueprintSpec(
  ctx: CompileContext,
  options: BlueprintSpecOptions = {},
): SiteSpec {
  const blueprint = options.blueprintOverride ?? getBlueprint(ctx.industry);
  const name = ctx.businessName;
  const where = ctx.city ? ` in ${ctx.city}` : "";
  const services = blueprint.defaultServices;
  const demo = options.demoContent === true;

  const sectionContent = (preset: string, pageTitle?: string): SectionSpec => {
    switch (resolvePresetAlias(preset) || preset) {
      case "page-header":
        return {
          preset,
          eyebrow: blueprint.label,
          title: pageTitle ?? name,
          subtitle: `${pageTitle ?? name} at ${name} — trusted ${blueprint.label.toLowerCase()} services${where}.`,
          ctaLabel: "Book an appointment",
          ctaHref: "#contact",
          secondaryCtaLabel: ctx.phone ? "Call us" : "Learn more",
        };
      case "hero-split":
      case "hero-centered":
        return {
          preset,
          eyebrow: blueprint.label,
          title: `${name}`,
          subtitle: `Trusted ${blueprint.label.toLowerCase()} services${where}. Friendly, professional, and always on your side.`,
          ctaLabel: "Book an appointment",
          ctaHref: "#contact",
          secondaryCtaLabel: ctx.phone ? "Call us" : "Learn more",
          imageQuery: blueprint.label,
        };
      case "services": {
        // Every card used to get "Sparkles". Six identical icons down a grid is
        // the clearest tell that a page was generated rather than designed, and
        // it costs nothing to vary.
        const icons = serviceIcons(services);
        return {
          preset,
          eyebrow: "What we offer",
          title: `Our ${blueprint.serviceNoun}s`,
          subtitle: "Clear options, honest advice, and no surprises.",
          items: services.map((s, i) => ({
            title: s,
            description: `Professional ${s.toLowerCase()} delivered by an experienced team.`,
            icon: icons[i],
          })),
        };
      }
      case "about":
        return {
          preset,
          eyebrow: "About us",
          title: `Why people choose ${name}`,
          body: `${name} has built its reputation${where} on careful work and straight answers. We take the time to understand what you need before recommending anything, and we stand behind everything we do.`,
          items: [
            { title: "Experienced, qualified team", icon: "BadgeCheck" },
            { title: "Transparent pricing", icon: "ReceiptText" },
            { title: "Same-day response", icon: "Clock" },
            { title: "Highly rated by customers", icon: "Star" },
          ],
          imageQuery: blueprint.label,
        };
      case "stats":
        return {
          preset,
          items: [
            { value: "10", label: "Years of experience" },
            { value: "4.8", label: "Average rating" },
            { value: "2000", label: "Customers served" },
            { value: "24", label: "Hour response time" },
          ],
        };
      case "team":
        return {
          preset,
          eyebrow: "Our team",
          title: "The people who look after you",
          items: demo
            ? (DEMO_STAFF[blueprint.key] ?? DEMO_STAFF.default).map((person) => ({
                title: person.title,
                role: person.role,
                description: `${person.role} at ${name}.`,
              }))
            : [
                { title: "Team member", role: "Senior specialist" },
                { title: "Team member", role: "Specialist" },
                { title: "Team member", role: "Consultant" },
                { title: "Team member", role: "Coordinator" },
              ],
          // Steers imagery to the industry pool; portraits are chosen per card.
          imageQuery: blueprint.label,
        };
      case "gallery":
        return { preset, eyebrow: "Gallery", title: "A look inside", imageQuery: blueprint.label };
      case "testimonials": {
        const quotes = [
          "Genuinely excellent from the first phone call to the final result.",
          "Professional, punctual, and fairly priced. Highly recommended.",
          "They explained everything clearly and never pushed extras.",
        ];
        return {
          preset,
          title: "What our customers say",
          items: quotes.map((quote, i) => ({
            quote,
            author: demo ? DEMO_REVIEWERS[i] : "Verified customer",
            rating: 5,
          })),
        };
      }
      case "reviews":
        return { preset, eyebrow: "Reviews", title: "Rated by our customers on Google" };
      case "pricing":
        return {
          preset,
          title: "Simple, honest pricing",
          subtitle: "No hidden charges. Ask us anything before you commit.",
          ctaLabel: "Enquire now",
          items: [
            { title: "Basic", price: "49", priceSuffix: "onwards", features: [services[0] ?? "Core service", "Standard support"] },
            { title: "Standard", price: "99", priceSuffix: "onwards", features: ["Everything in Basic", services[1] ?? "Extended service", "Priority booking"], highlighted: true },
            { title: "Premium", price: "199", priceSuffix: "onwards", features: ["Everything in Standard", services[2] ?? "Full service", "Dedicated contact"] },
          ],
        };
      case "faq":
        return {
          preset,
          title: "Frequently asked questions",
          items: [
            { question: "What are your opening hours?", answer: "Our current hours are shown on this page and kept in sync with our Google listing." },
            { question: "Do I need to book in advance?", answer: "Booking ahead is recommended so we can give you a time that suits. Walk-ins are welcome when we have space." },
            { question: "How much will it cost?", answer: "It depends on what you need. Get in touch and we will give you a clear estimate before any work begins." },
            { question: "How do I reach you quickly?", answer: `Call us${ctx.phone ? ` on ${ctx.phone}` : ""}, message us on WhatsApp, or use the contact form on this page.` },
          ],
        };
      case "cta":
        return {
          preset,
          title: "Ready to get started?",
          subtitle: "Book in under a minute. We will confirm your slot right away.",
          ctaLabel: "Book now",
          ctaHref: "#contact",
        };
      case "contact":
        return {
          preset,
          title: "Get in touch",
          subtitle: "Send us a message and we will reply the same day.",
          ctaLabel: "Send message",
        };
      case "appointment":
        return {
          preset,
          title: "Book an appointment",
          subtitle: "Tell us what you need and a time that suits. We will confirm by phone or email.",
          ctaLabel: "Request appointment",
        };
      case "blog":
        return { preset, eyebrow: "Blog", title: "Latest updates", subtitle: "News, tips, and advice from our team." };
      default:
        return { preset };
    }
  };

  return {
    siteName: name,
    brand: {
      businessName: name,
      industry: ctx.industry ?? blueprint.label,
      businessCategory: blueprint.label,
      services,
      tone: "warm and professional",
    },
    theme: {},
    pages: blueprint.pages.map((p) => ({
      title: p.title,
      path: p.path,
      sections: p.sections.map((s) => sectionContent(s, p.title)),
    })),
    summary: `Generated a ${blueprint.pages.length}-page ${blueprint.label.toLowerCase()} website for ${name} using the ${blueprint.label} blueprint. Every section is editable — ask me to change anything.`,
  };
}
