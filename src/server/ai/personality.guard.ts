/**
 * Compile-time bridge between the Prisma enums and the string-union mirrors in
 * personality.types.ts.
 *
 * Those mirrors exist so the wizard UI and validators can import the option
 * catalogs without pulling @prisma/client into a client bundle. The cost of a
 * mirror is drift: add a value to the Prisma enum and the union silently stops
 * covering it. These assignments make that a build error instead — each one
 * fails to compile if the two definitions diverge in either direction.
 *
 * Server-only, and intentionally has no runtime exports beyond a marker: it is
 * a type-level test, not a module anyone calls.
 */

import type {
  AiConfidenceLevel as PrismaAiConfidenceLevel,
  AppreciationPolicy as PrismaAppreciationPolicy,
  EmojiUsage as PrismaEmojiUsage,
  ReplyApprovalMode as PrismaReplyApprovalMode,
  ReplyLength as PrismaReplyLength,
  ReplySentiment as PrismaReplySentiment,
} from "@prisma/client";
import type {
  AiConfidenceLevel,
  AppreciationPolicy,
  EmojiUsage,
  ReplyApprovalMode,
  ReplyLength,
  ReplySentiment,
} from "./personality.types";

/** Fails to compile unless A and B are exactly the same union. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

type Assertions = [
  Exact<EmojiUsage, PrismaEmojiUsage>,
  Exact<ReplyLength, PrismaReplyLength>,
  Exact<ReplyApprovalMode, PrismaReplyApprovalMode>,
  Exact<AiConfidenceLevel, PrismaAiConfidenceLevel>,
  Exact<AppreciationPolicy, PrismaAppreciationPolicy>,
  Exact<ReplySentiment, PrismaReplySentiment>,
];

/** Referencing the tuple is what forces the checks to be evaluated. */
export const PERSONALITY_ENUMS_IN_SYNC: Assertions = [true, true, true, true, true, true];
