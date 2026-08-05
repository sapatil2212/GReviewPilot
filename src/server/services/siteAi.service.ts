/**
 * Orchestrates AI generation and editing against persisted sites.
 *
 * The AI itself lives in ai/siteGenerator.service.ts; this layer owns the
 * database side: replacing pages, snapshotting revisions before every AI
 * change, and recording the conversation.
 *
 * Every AI mutation creates an AI_EDIT revision first. That is what makes
 * "the AI changed something I didn't want" recoverable in one click, which is
 * the difference between a tool people trust with their live site and one they
 * are afraid to use.
 */

import { AuditAction, Prisma, SiteAiRole, SiteRevisionKind } from "@prisma/client";
import type { AuthContext } from "@/server/auth/requireSession";
import { auditRepository } from "@/server/repositories/audit.repository";
import { siteAiRepository } from "@/server/repositories/siteAi.repository";
import { siteRepository } from "@/server/repositories/site.repository";
import { sitePageRepository } from "@/server/repositories/sitePage.repository";
import { extractRequestContext } from "@/server/middleware/requestContext";
import { NotFoundError, ValidationError } from "@/server/utils/errors";
import { generateContent, generateSite, editSite } from "@/server/services/ai/siteGenerator.service";
import {
  loadTenantContext,
  pageDocument,
  siteBrand,
  siteSeo,
  siteTheme,
} from "@/server/services/site.service";
import type { BrandContext, SeoMeta, SiteDocument } from "@/site/document/types";
import type { PresetInput } from "@/site/registry/presets";
import type { AiEditInput, GenerateSiteInput } from "@/server/validators/site.schema";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** Contact details every preset needs, assembled from the site's brand memory. */
function presetInputFor(brand: BrandContext, locationId?: string | null): PresetInput {
  return {
    businessName: brand.businessName,
    phone: brand.phone,
    whatsapp: brand.whatsapp,
    email: brand.email,
    address: brand.address,
    ...(locationId ? { locationId } : {}),
  };
}

export const siteAiService = {
  /**
   * Generate a complete site.
   *
   * Refuses to overwrite existing work unless `replaceExisting` is set — an
   * accidental "generate" on a site someone has spent an hour editing would
   * otherwise be catastrophic and, before the revision is written, unrecoverable.
   */
  async generate(ctx: AuthContext, siteId: string, input: GenerateSiteInput, req?: Request) {
    const site = await siteRepository.findById(ctx.tenantId, siteId);
    if (!site) throw new NotFoundError("Website not found");

    const existing = await sitePageRepository.listAll(site.id);
    // A single untouched starter page is not "work", so it does not require the
    // replace flag — otherwise every first generation would need two attempts.
    const hasRealContent = existing.length > 1 || existing.some((p) => p.publishedAt !== null);
    if (hasRealContent && !input.replaceExisting) {
      throw new ValidationError(
        "This website already has pages. Turn on 'replace existing pages' to regenerate it from scratch.",
      );
    }

    const tenantContext = await loadTenantContext(ctx, input.locationId ?? site.locationId);
    const industry = input.industry ?? site.industry ?? tenantContext.industry;

    // Snapshot before touching anything.
    await siteRepository.createRevision({
      siteId: site.id,
      tenantId: ctx.tenantId,
      kind: SiteRevisionKind.AI_EDIT,
      label: "Before AI generation",
      aiPrompt: input.prompt,
      snapshot: toJson({
        theme: siteTheme(site),
        pages: existing.map((p) => ({
          id: p.id,
          title: p.title,
          path: p.path,
          isHome: p.isHome,
          document: p.document,
        })),
      }),
      createdById: ctx.userId,
    });

    const result = await generateSite(input.prompt, {
      businessName: input.businessName ?? tenantContext.businessName,
      industry,
      city: tenantContext.city,
      country: tenantContext.country,
      phone: tenantContext.phone,
      email: tenantContext.email,
      whatsapp: tenantContext.whatsapp,
      address: tenantContext.address,
      logoUrl: tenantContext.logoUrl,
      locationId: input.locationId ?? site.locationId ?? tenantContext.locationId,
      language: tenantContext.language,
      description: tenantContext.description,
      // Preserve any brand colours the user already chose.
      baseTheme: siteTheme(site),
    });

    // Replace pages wholesale. Hard delete rather than soft: the previous
    // content is already preserved in the revision snapshot above, and a
    // soft-deleted page would keep its path reserved (the unique index spans
    // siteId + path + deletedAt), so regenerating a site would collide on "/".
    await sitePageRepository.hardDeleteAll(site.id);

    const created = [];
    for (const [index, page] of result.site.pages.entries()) {
      created.push(
        await sitePageRepository.create({
          siteId: site.id,
          tenantId: ctx.tenantId,
          title: page.title,
          path: page.path,
          isHome: page.isHome,
          sortOrder: index,
          document: toJson(page.document),
          seo: toJson(page.seo),
        }),
      );
    }

    await siteRepository.update(site.id, {
      theme: toJson(result.site.theme),
      brand: toJson({ ...siteBrand(site), ...result.site.brand }),
      industry: industry ?? null,
      ...(input.businessName ? { name: input.businessName } : {}),
    });

    const conversation = await this.ensureConversation(ctx, site.id, input.prompt);
    await siteAiRepository.addMessage({
      conversationId: conversation.id,
      tenantId: ctx.tenantId,
      role: SiteAiRole.USER,
      content: input.prompt,
    });
    await siteAiRepository.addMessage({
      conversationId: conversation.id,
      tenantId: ctx.tenantId,
      role: SiteAiRole.ASSISTANT,
      content: result.message,
      model: result.source === "ai" ? "gemini" : null,
    });

    await auditRepository.record({
      action: AuditAction.SITE_AI_GENERATED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: {
        siteId: site.id,
        pages: created.length,
        source: result.source,
        prompt: input.prompt.slice(0, 500),
      },
      ...(req ? extractRequestContext(req) : {}),
    });

    return {
      message: result.message,
      source: result.source,
      conversationId: conversation.id,
      pages: created.map((p) => ({ id: p.id, title: p.title, path: p.path, isHome: p.isHome })),
      theme: result.site.theme,
    };
  },

  /**
   * Apply a conversational edit to one page (and possibly the theme).
   *
   * Theme changes are site-wide, so a request like "change blue to green"
   * legitimately affects every page even though it was issued while viewing
   * one. Document changes stay scoped to the page in view.
   */
  async edit(ctx: AuthContext, siteId: string, input: AiEditInput, req?: Request) {
    const site = await siteRepository.findById(ctx.tenantId, siteId);
    if (!site) throw new NotFoundError("Website not found");

    const page = input.pageId
      ? await sitePageRepository.findById(ctx.tenantId, input.pageId)
      : await sitePageRepository.findHome(site.id);
    if (!page || page.siteId !== site.id) throw new NotFoundError("Page not found");

    const conversation = await this.ensureConversation(ctx, site.id, input.prompt);
    const history = await siteAiRepository.recentTurns(ctx.tenantId, conversation.id);

    await siteAiRepository.addMessage({
      conversationId: conversation.id,
      tenantId: ctx.tenantId,
      role: SiteAiRole.USER,
      content: input.prompt,
    });

    const brand = siteBrand(site);
    const before: SiteDocument = pageDocument(page);
    const pageSeo = (page.seo ?? {}) as SeoMeta;

    const result = await editSite(input.prompt, {
      document: before,
      theme: siteTheme(site),
      brand,
      seo: { title: pageSeo.title, description: pageSeo.description, keywords: pageSeo.keywords },
      presetInput: presetInputFor(brand, site.locationId),
      history,
    });

    let revisionId: string | null = null;

    if (result.documentChanged || result.themeChanged) {
      const revision = await siteRepository.createRevision({
        siteId: site.id,
        tenantId: ctx.tenantId,
        // Theme edits are site-wide, so they are recorded as a site revision
        // (pageId null) and roll back the theme rather than one page.
        pageId: result.documentChanged ? page.id : null,
        kind: SiteRevisionKind.AI_EDIT,
        label: input.prompt.slice(0, 200),
        aiPrompt: input.prompt,
        aiOperations: toJson(result.operations),
        snapshot: result.documentChanged
          ? toJson(before)
          : toJson({ theme: siteTheme(site), pages: [] }),
        createdById: ctx.userId,
      });
      revisionId = revision.id;
    }

    if (result.documentChanged) {
      await sitePageRepository.update(page.id, {
        document: toJson(result.document),
        ...(result.seo.title || result.seo.description
          ? { seo: toJson({ ...pageSeo, ...result.seo }) }
          : {}),
      });
    }
    if (result.themeChanged) {
      await siteRepository.update(site.id, { theme: toJson(result.theme) });
    }

    await siteAiRepository.addMessage({
      conversationId: conversation.id,
      tenantId: ctx.tenantId,
      role: SiteAiRole.ASSISTANT,
      content: result.message,
      operations: toJson(result.operations),
      revisionId,
      model: result.source === "ai" ? "gemini" : null,
    });
    await siteAiRepository.touchConversation(conversation.id);

    await auditRepository.record({
      action: AuditAction.SITE_AI_EDITED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: {
        siteId: site.id,
        pageId: page.id,
        prompt: input.prompt.slice(0, 500),
        operations: result.operations.map((o) => o.op),
        applied: result.applied.length,
        skipped: result.skipped.length,
      },
      ...(req ? extractRequestContext(req) : {}),
    });

    const reloaded = await sitePageRepository.findById(ctx.tenantId, page.id);

    return {
      message: result.message,
      conversationId: conversation.id,
      revisionId,
      applied: result.applied,
      skipped: result.skipped,
      // Return the new state so the editor updates without a second fetch.
      document: result.documentChanged ? result.document : null,
      theme: result.themeChanged ? result.theme : null,
      version: reloaded?.updatedAt.toISOString() ?? null,
      source: result.source,
    };
  },

  async generateContentBlock(
    ctx: AuthContext,
    siteId: string,
    input: { kind: string; topic?: string; count: number },
  ) {
    const site = await siteRepository.findById(ctx.tenantId, siteId);
    if (!site) throw new NotFoundError("Website not found");
    return generateContent(input.kind, {
      brand: siteBrand(site),
      topic: input.topic,
      count: input.count,
    });
  },

  async ensureConversation(ctx: AuthContext, siteId: string, seedTitle: string) {
    const existing = await siteAiRepository.findLatestConversation(ctx.tenantId, siteId);
    if (existing) return existing;
    return siteAiRepository.createConversation({
      siteId,
      tenantId: ctx.tenantId,
      title: seedTitle.slice(0, 200),
      createdById: ctx.userId,
    });
  },

  async listMessages(ctx: AuthContext, siteId: string, conversationId?: string) {
    const site = await siteRepository.findById(ctx.tenantId, siteId);
    if (!site) throw new NotFoundError("Website not found");

    const conversation = conversationId
      ? await siteAiRepository.findConversation(ctx.tenantId, conversationId)
      : await siteAiRepository.findLatestConversation(ctx.tenantId, site.id);

    if (!conversation || conversation.siteId !== site.id) {
      return { conversationId: null, messages: [] };
    }

    const messages = await siteAiRepository.listMessages(ctx.tenantId, conversation.id);
    return {
      conversationId: conversation.id,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        revisionId: m.revisionId,
        createdAt: m.createdAt,
      })),
    };
  },

  /** SEO/conversion audit of a page, surfaced as actionable suggestions. */
  async audit(ctx: AuthContext, siteId: string, pageId?: string) {
    const site = await siteRepository.findById(ctx.tenantId, siteId);
    if (!site) throw new NotFoundError("Website not found");

    const page = pageId
      ? await sitePageRepository.findById(ctx.tenantId, pageId)
      : await sitePageRepository.findHome(site.id);
    if (!page) throw new NotFoundError("Page not found");

    const { auditPage } = await import("@/site/ai/audit");
    return auditPage({
      document: pageDocument(page),
      theme: siteTheme(site),
      seo: { ...siteSeo(site), ...((page.seo ?? {}) as SeoMeta) },
      brand: siteBrand(site),
      path: page.path,
    });
  },
};
