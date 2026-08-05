/**
 * Site audit: SEO, accessibility, conversion, and performance checks.
 *
 * Deliberately rule-based rather than AI-driven. These questions have
 * objectively correct answers — is there exactly one H1, does every image have
 * alt text, is the tap target big enough, does the primary button meet 4.5:1
 * contrast. An LLM would answer them inconsistently and could not be trusted
 * as a compliance signal, while rules are fast, free, deterministic, and
 * explainable.
 *
 * The AI's role is the layer above: turning a finding into a fix, via the
 * `autoFix` operation attached to each issue.
 */

import { getSections } from "@/site/document/operations";
import { contrastRatio } from "@/site/document/theme";
import type {
  BrandContext,
  SeoMeta,
  SiteDocument,
  SiteNode,
  ThemeTokens,
} from "@/site/document/types";

export type AuditCategory = "seo" | "accessibility" | "conversion" | "performance" | "content";
export type AuditSeverity = "critical" | "warning" | "suggestion";

export interface AuditIssue {
  id: string;
  category: AuditCategory;
  severity: AuditSeverity;
  title: string;
  detail: string;
  /** How to fix it, in the user's terms. */
  fix: string;
  /** Nodes involved, so the editor can jump straight to them. */
  nodeIds?: string[];
  /** A prompt the user can send to the AI chat to fix this in one click. */
  autoFixPrompt?: string;
}

export interface AuditResult {
  /** 0-100, weighted by severity. */
  score: number;
  issues: AuditIssue[];
  counts: Record<AuditSeverity, number>;
  byCategory: Record<AuditCategory, number>;
  passed: string[];
}

export interface AuditInput {
  document: SiteDocument;
  theme: ThemeTokens;
  seo: SeoMeta;
  brand: BrandContext;
  path: string;
}

const SEVERITY_WEIGHT: Record<AuditSeverity, number> = {
  critical: 12,
  warning: 5,
  suggestion: 2,
};

export function auditPage(input: AuditInput): AuditResult {
  const issues: AuditIssue[] = [];
  const passed: string[] = [];
  const nodes = Object.values(input.document.nodes);
  const sections = getSections(input.document);
  const sectionKeys = new Set(sections.map((s) => s.presetKey ?? s.type));

  const byType = (type: string) => nodes.filter((n) => n.type === type);
  const isHome = input.path === "/";

  // ------------------------------------------------------------------
  // SEO
  // ------------------------------------------------------------------

  const title = input.seo.title?.trim() ?? "";
  if (!title) {
    issues.push({
      id: "seo-title-missing",
      category: "seo",
      severity: "critical",
      title: "No page title",
      detail: "Search engines use the page title as the clickable headline in results.",
      fix: "Add a page title of 50 to 60 characters that includes what you do and where.",
      autoFixPrompt: "Write an SEO page title and meta description for this page.",
    });
  } else if (title.length > 60) {
    issues.push({
      id: "seo-title-long",
      category: "seo",
      severity: "warning",
      title: "Page title is too long",
      detail: `Your title is ${title.length} characters. Google truncates around 60, so the end will be cut off.`,
      fix: "Shorten the title to 60 characters or fewer, keeping the most important words first.",
      autoFixPrompt: "Shorten the SEO page title to under 60 characters.",
    });
  } else if (title.length < 25) {
    issues.push({
      id: "seo-title-short",
      category: "seo",
      severity: "suggestion",
      title: "Page title is quite short",
      detail: "Short titles waste space that could carry your service and location.",
      fix: "Extend the title toward 50 to 60 characters, adding your service and city.",
      autoFixPrompt: "Rewrite the SEO page title to be around 55 characters and include the city.",
    });
  } else {
    passed.push("Page title is a good length");
  }

  const description = input.seo.description?.trim() ?? "";
  if (!description) {
    issues.push({
      id: "seo-description-missing",
      category: "seo",
      severity: "critical",
      title: "No meta description",
      detail: "Without one, search engines invent a snippet from your page text, usually badly.",
      fix: "Add a 140 to 155 character description that ends with a reason to click.",
      autoFixPrompt: "Write a compelling meta description for this page, under 155 characters.",
    });
  } else if (description.length > 160) {
    issues.push({
      id: "seo-description-long",
      category: "seo",
      severity: "warning",
      title: "Meta description is too long",
      detail: `Yours is ${description.length} characters and will be cut off in search results.`,
      fix: "Trim it to 155 characters or fewer.",
      autoFixPrompt: "Shorten the meta description to under 155 characters.",
    });
  } else {
    passed.push("Meta description is a good length");
  }

  // Heading hierarchy. Exactly one H1 per page is the rule that most
  // hand-built and AI-built pages get wrong.
  const headings = byType("Heading");
  const h1s = headings.filter((h) => h.props.level === "h1");
  if (h1s.length === 0) {
    issues.push({
      id: "seo-h1-missing",
      category: "seo",
      severity: "critical",
      title: "No H1 heading",
      detail: "The H1 tells search engines and screen readers what this page is about.",
      fix: "Make your main headline an H1. Every page should have exactly one.",
      nodeIds: headings[0] ? [headings[0].id] : undefined,
      autoFixPrompt: "Change the main hero headline on this page to an H1.",
    });
  } else if (h1s.length > 1) {
    issues.push({
      id: "seo-h1-multiple",
      category: "seo",
      severity: "warning",
      title: `${h1s.length} H1 headings`,
      detail: "Multiple H1s dilute the signal about what the page is primarily about.",
      fix: "Keep one H1 and change the others to H2.",
      nodeIds: h1s.slice(1).map((h) => h.id),
      autoFixPrompt: "Keep only the first H1 on this page and change the other H1s to H2.",
    });
  } else {
    passed.push("Exactly one H1 heading");
  }

  if (!input.seo.schemaType && isHome) {
    issues.push({
      id: "seo-schema-missing",
      category: "seo",
      severity: "suggestion",
      title: "No structured data type",
      detail:
        "Structured data lets Google show your rating, hours, and address directly in search results.",
      fix: "Set a schema.org business type in the SEO panel.",
    });
  } else if (input.seo.schemaType) {
    passed.push("Structured data type is set");
  }

  const textNodes = nodes.filter((n) => n.type === "Text" || n.type === "Heading");
  const wordCount = textNodes.reduce(
    (sum, n) => sum + String(n.props.text ?? "").trim().split(/\s+/).filter(Boolean).length,
    0,
  );
  if (wordCount < 250) {
    issues.push({
      id: "seo-thin-content",
      category: "seo",
      severity: wordCount < 120 ? "warning" : "suggestion",
      title: "Not much text on this page",
      detail: `About ${wordCount} words. Pages this thin rarely rank for competitive local searches.`,
      fix: "Add an About section, an FAQ, or more detail on your services.",
      autoFixPrompt: "Add an FAQ section with 5 useful questions and answers to this page.",
    });
  } else {
    passed.push("Page has enough text to rank");
  }

  // ------------------------------------------------------------------
  // Accessibility
  // ------------------------------------------------------------------

  const images = byType("Image");
  const missingAlt = images.filter(
    (n) => !n.a11y?.decorative && !String(n.props.alt ?? "").trim() && String(n.props.src ?? "").trim(),
  );
  if (missingAlt.length > 0) {
    issues.push({
      id: "a11y-alt-missing",
      category: "accessibility",
      severity: "critical",
      title: `${missingAlt.length} image${missingAlt.length === 1 ? "" : "s"} without alt text`,
      detail:
        "Screen readers cannot describe these images, and search engines cannot index them.",
      fix: "Add alt text describing each image, or mark it decorative if it carries no meaning.",
      nodeIds: missingAlt.map((n) => n.id),
    });
  } else if (images.length > 0) {
    passed.push("All images have alt text");
  }

  // Contrast on the primary button is the single highest-traffic text on most
  // local sites, so it is checked explicitly rather than sampled.
  const primaryContrast = contrastRatio(
    input.theme.colors.primary,
    input.theme.colors.primaryForeground,
  );
  if (primaryContrast !== null && primaryContrast < 4.5) {
    issues.push({
      id: "a11y-contrast-primary",
      category: "accessibility",
      severity: "critical",
      title: "Button text is hard to read",
      detail: `Your primary colour and its text contrast at ${primaryContrast.toFixed(1)}:1. WCAG AA requires 4.5:1.`,
      fix: "Darken or lighten the primary colour in the theme panel.",
      autoFixPrompt: "Adjust my primary colour so the button text meets WCAG AA contrast.",
    });
  } else if (primaryContrast !== null) {
    passed.push("Primary button contrast meets WCAG AA");
  }

  const bodyContrast = contrastRatio(
    input.theme.colors.background,
    input.theme.colors.mutedForeground,
  );
  if (bodyContrast !== null && bodyContrast < 4.5) {
    issues.push({
      id: "a11y-contrast-body",
      category: "accessibility",
      severity: "warning",
      title: "Secondary text is low contrast",
      detail: `Muted text contrasts at ${bodyContrast.toFixed(1)}:1 against the background.`,
      fix: "Darken the muted text colour in the theme panel.",
    });
  }

  const genericLinks = byType("Button").filter((n) =>
    /^(click here|here|read more|more|link|learn more)$/i.test(String(n.props.label ?? "").trim()),
  );
  if (genericLinks.length > 0) {
    issues.push({
      id: "a11y-generic-link",
      category: "accessibility",
      severity: "suggestion",
      title: "Vague button labels",
      detail:
        "Screen reader users often navigate by listing links, where 'Click here' is meaningless out of context.",
      fix: "Say what happens: 'Book an appointment', 'See our prices'.",
      nodeIds: genericLinks.map((n) => n.id),
      autoFixPrompt: "Rewrite the vague button labels on this page to describe what they do.",
    });
  }

  // ------------------------------------------------------------------
  // Conversion
  // ------------------------------------------------------------------

  const buttons = byType("Button");
  const actionableButtons = buttons.filter((n) => n.action && n.action.kind !== "none");
  if (actionableButtons.length === 0) {
    issues.push({
      id: "conv-no-cta",
      category: "conversion",
      severity: "critical",
      title: "No working call to action",
      detail: "Visitors have no obvious next step, so they leave.",
      fix: "Add a primary button that calls you, books an appointment, or opens WhatsApp.",
      autoFixPrompt: "Add a clear call-to-action section to this page.",
    });
  } else {
    passed.push("Page has a working call to action");
  }

  /**
   * Above-the-fold CTA check.
   *
   * The first two top-level sections are a reasonable proxy for the first
   * screen: a navbar plus a hero is what fits on a typical mobile viewport.
   * A CTA below that is a CTA most mobile visitors never see.
   */
  const aboveFold = sections.slice(0, 2).map((s) => s.id);
  const hasEarlyCta = actionableButtons.some((b) => {
    let node: SiteNode | undefined = b;
    while (node?.parent) {
      if (aboveFold.includes(node.parent)) return true;
      node = input.document.nodes[node.parent];
    }
    return false;
  });
  if (actionableButtons.length > 0 && !hasEarlyCta) {
    issues.push({
      id: "conv-cta-below-fold",
      category: "conversion",
      severity: "warning",
      title: "No call to action near the top",
      detail: "Most mobile visitors never scroll past the first screen.",
      fix: "Add a button to your hero section.",
      autoFixPrompt: "Add a prominent booking button to the hero section.",
    });
  }

  const hasContactPath =
    sectionKeys.has("contact") ||
    sectionKeys.has("appointment") ||
    byType("Form").length > 0 ||
    byType("WhatsAppButton").length > 0 ||
    actionableButtons.some((b) => b.action?.kind === "tel" || b.action?.kind === "whatsapp");
  if (!hasContactPath) {
    issues.push({
      id: "conv-no-contact",
      category: "conversion",
      severity: "critical",
      title: "No way to get in touch",
      detail: "There is no form, phone link, or WhatsApp button on this page.",
      fix: "Add a contact section, or at least a tap-to-call button.",
      autoFixPrompt: "Add a contact section with a form and our phone number to this page.",
    });
  } else {
    passed.push("Visitors can get in touch");
  }

  if (isHome) {
    const socialProof =
      sectionKeys.has("reviews") || sectionKeys.has("testimonials") || sectionKeys.has("stats");
    if (!socialProof) {
      issues.push({
        id: "conv-no-social-proof",
        category: "conversion",
        severity: "warning",
        title: "No social proof on the home page",
        detail:
          "Reviews and ratings are the strongest trust signal for a local business, and you already collect them.",
        fix: "Add your Google reviews section.",
        autoFixPrompt: "Add a Google reviews section to this page.",
      });
    } else {
      passed.push("Home page shows social proof");
    }

    if (!sectionKeys.has("whatsapp") && !byType("WhatsAppButton").length) {
      issues.push({
        id: "conv-no-whatsapp",
        category: "conversion",
        severity: "suggestion",
        title: "No WhatsApp button",
        detail:
          "For most local businesses WhatsApp converts better than a form, because there is no wait for a reply.",
        fix: "Add a floating WhatsApp button.",
        autoFixPrompt: "Add a floating WhatsApp button to this site.",
      });
    }
  }

  // ------------------------------------------------------------------
  // Performance
  // ------------------------------------------------------------------

  const heroImages = images.filter((n) => {
    const first = sections[1]?.id ?? sections[0]?.id;
    let node: SiteNode | undefined = n;
    while (node?.parent) {
      if (node.parent === first) return true;
      node = input.document.nodes[node.parent];
    }
    return false;
  });
  const heroNotPrioritised = heroImages.filter((n) => !n.props.priority && n.props.src);
  if (heroNotPrioritised.length > 0) {
    issues.push({
      id: "perf-hero-lazy",
      category: "performance",
      severity: "warning",
      title: "Hero image is lazy-loaded",
      detail:
        "Lazy-loading the first image visible on screen delays your Largest Contentful Paint, which Google measures directly.",
      fix: "Turn on 'Load immediately' for the hero image.",
      nodeIds: heroNotPrioritised.map((n) => n.id),
    });
  } else if (heroImages.length > 0) {
    passed.push("Hero image loads immediately");
  }

  const unsizedImages = images.filter(
    (n) => String(n.props.src ?? "") && n.props.aspectRatio === "auto",
  );
  if (unsizedImages.length > 2) {
    issues.push({
      id: "perf-layout-shift",
      category: "performance",
      severity: "suggestion",
      title: `${unsizedImages.length} images without a fixed aspect ratio`,
      detail:
        "Images without reserved space push content around as they load, which hurts your Cumulative Layout Shift score.",
      fix: "Set an aspect ratio on these images.",
      nodeIds: unsizedImages.map((n) => n.id),
    });
  }

  const emptyImages = images.filter((n) => !String(n.props.src ?? "").trim());
  if (emptyImages.length > 0) {
    issues.push({
      id: "content-images-missing",
      category: "content",
      severity: "warning",
      title: `${emptyImages.length} image placeholder${emptyImages.length === 1 ? "" : "s"}`,
      detail: "These will render as empty boxes to visitors.",
      fix: "Upload real photos, or delete the placeholders.",
      nodeIds: emptyImages.map((n) => n.id),
    });
  }

  const nodeCount = nodes.length;
  if (nodeCount > 600) {
    issues.push({
      id: "perf-heavy-page",
      category: "performance",
      severity: "suggestion",
      title: "This page is very large",
      detail: `${nodeCount} elements. Large pages are slower to load and harder to edit.`,
      fix: "Consider splitting some sections onto a separate page.",
    });
  }

  // ------------------------------------------------------------------
  // Content quality
  // ------------------------------------------------------------------

  const placeholderPattern = /lorem ipsum|\[[^\]]{2,40}\]|your heading|write something here|service one|team member|placeholder/i;
  const placeholders = textNodes.filter((n) =>
    placeholderPattern.test(String(n.props.text ?? "")),
  );
  if (placeholders.length > 0) {
    issues.push({
      id: "content-placeholder",
      category: "content",
      severity: "warning",
      title: `${placeholders.length} placeholder text block${placeholders.length === 1 ? "" : "s"}`,
      detail: "Default text is still on the page and visitors will see it.",
      fix: "Replace it with real copy, or ask the AI to write it for you.",
      nodeIds: placeholders.map((n) => n.id),
      autoFixPrompt: "Replace all the placeholder text on this page with real copy for my business.",
    });
  } else {
    passed.push("No placeholder text left");
  }

  if (!input.brand.phone && !input.brand.whatsapp) {
    issues.push({
      id: "content-no-phone",
      category: "content",
      severity: "warning",
      title: "No phone number on file",
      detail:
        "Phone and WhatsApp buttons cannot work until a number is set, and local searchers expect to call.",
      fix: "Add a phone number in your business settings.",
    });
  }

  // ------------------------------------------------------------------
  // Score
  // ------------------------------------------------------------------

  const penalty = issues.reduce((sum, issue) => sum + SEVERITY_WEIGHT[issue.severity], 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));

  const counts: Record<AuditSeverity, number> = { critical: 0, warning: 0, suggestion: 0 };
  const byCategory: Record<AuditCategory, number> = {
    seo: 0,
    accessibility: 0,
    conversion: 0,
    performance: 0,
    content: 0,
  };
  for (const issue of issues) {
    counts[issue.severity] += 1;
    byCategory[issue.category] += 1;
  }

  // Critical first, so the panel leads with what actually matters.
  const order: Record<AuditSeverity, number> = { critical: 0, warning: 1, suggestion: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  return { score, issues, counts, byCategory, passed };
}
