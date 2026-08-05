/**
 * AI conversation persistence.
 *
 * Threads are stored rather than kept in memory so context survives page
 * reloads and so the "what did the AI change, and can I undo it" trail is
 * durable and auditable.
 */

import { Prisma, SiteAiRole, type SiteAiConversation, type SiteAiMessage } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

export const siteAiRepository = {
  findConversation(tenantId: string, id: string): Promise<SiteAiConversation | null> {
    return prisma.siteAiConversation.findFirst({ where: { id, tenantId } });
  },

  /** Most recent thread for a site, so the chat panel resumes where it left off. */
  findLatestConversation(tenantId: string, siteId: string): Promise<SiteAiConversation | null> {
    return prisma.siteAiConversation.findFirst({
      where: { tenantId, siteId },
      orderBy: { updatedAt: "desc" },
    });
  },

  createConversation(data: Prisma.SiteAiConversationUncheckedCreateInput): Promise<SiteAiConversation> {
    return prisma.siteAiConversation.create({ data });
  },

  touchConversation(id: string): Promise<SiteAiConversation> {
    return prisma.siteAiConversation.update({ where: { id }, data: { updatedAt: new Date() } });
  },

  addMessage(data: Prisma.SiteAiMessageUncheckedCreateInput): Promise<SiteAiMessage> {
    return prisma.siteAiMessage.create({ data });
  },

  /**
   * Messages oldest-first for display.
   *
   * `take` from the end then reverse, so a long thread loads the most recent
   * turns rather than the first ones — which is what both the user and the
   * model need for context.
   */
  async listMessages(
    tenantId: string,
    conversationId: string,
    limit = 50,
  ): Promise<SiteAiMessage[]> {
    const rows = await prisma.siteAiMessage.findMany({
      where: { tenantId, conversationId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.reverse();
  },

  /** Compact history for prompt injection: role + content only. */
  async recentTurns(
    tenantId: string,
    conversationId: string,
    limit = 8,
  ): Promise<Array<{ role: "USER" | "ASSISTANT"; content: string }>> {
    const rows = await prisma.siteAiMessage.findMany({
      where: {
        tenantId,
        conversationId,
        role: { in: [SiteAiRole.USER, SiteAiRole.ASSISTANT] },
      },
      select: { role: true, content: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows
      .reverse()
      .map((r) => ({ role: r.role as "USER" | "ASSISTANT", content: r.content }));
  },
};
