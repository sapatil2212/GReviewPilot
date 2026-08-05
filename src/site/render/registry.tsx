"use client";

/**
 * Binds registry `type` strings to React implementations.
 *
 * The definitions in src/site/registry/definitions.ts and the components
 * here are two halves of one contract. `missingRenderers()` reports any
 * drift, and NodeRenderer renders an explicit fallback for an unbound type
 * rather than throwing — a document referencing a component from a newer
 * deploy should degrade, not white-screen the page.
 */

import { COMPONENT_TYPES } from "@/site/registry/definitions";
import type { SiteComponent } from "./shared";
import {
  Accordion,
  Badge,
  Box,
  Button,
  Carousel,
  Container,
  Divider,
  Grid,
  Heading,
  HtmlEmbed,
  Icon,
  Image,
  Page,
  Rating,
  RichText,
  Section,
  SocialLinks,
  Spacer,
  StatCounter,
  Tabs,
  Text,
  VideoEmbed,
} from "./components/primitives";
import {
  CollectionList,
  Footer,
  Form,
  GoogleReviews,
  Navbar,
  OpeningHours,
  SiteMap,
  WhatsAppButton,
} from "./components/business";

export const RENDERERS: Record<string, SiteComponent> = {
  // Layout
  Page,
  Section,
  Container,
  Box,
  Grid,
  Spacer,
  Divider,
  // Typography
  Heading,
  Text,
  RichText,
  Badge,
  // Media
  Icon,
  Image,
  VideoEmbed,
  // Interactive
  Button,
  Accordion,
  Tabs,
  Carousel,
  Form,
  // Business
  Navbar,
  Footer,
  GoogleReviews,
  Map: SiteMap,
  OpeningHours,
  WhatsAppButton,
  StatCounter,
  Rating,
  SocialLinks,
  // CMS
  CollectionList,
  // Advanced
  HtmlEmbed,
};

/** Definition types with no React implementation. Should always be empty. */
export function missingRenderers(): string[] {
  return COMPONENT_TYPES.filter((type) => !RENDERERS[type]);
}

/** Renderers with no definition — unreachable from the palette or AI. */
export function orphanRenderers(): string[] {
  return Object.keys(RENDERERS).filter((type) => !COMPONENT_TYPES.includes(type));
}
