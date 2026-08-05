/**
 * PrismaClient singleton.
 *
 * Next.js hot-reloads server modules in dev, which would otherwise
 * create a new PrismaClient per reload and exhaust connections.
 * We attach the client to `globalThis` so a single instance is reused.
 */

import { PrismaClient } from "@prisma/client";
import { isProd } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ["error"] : ["warn", "error"],
  });

if (!isProd) {
  globalForPrisma.prisma = prisma;
}

// Best-effort graceful shutdown in Node runtimes (ignored on Edge).
if (typeof process !== "undefined" && typeof process.on === "function") {
  process.on("beforeExit", () => {
    prisma.$disconnect().catch((err) => {
      logger.warn("Prisma disconnect failed", { err: String(err) });
    });
  });
}
