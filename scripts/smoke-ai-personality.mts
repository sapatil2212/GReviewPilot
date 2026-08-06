/**
 * AI Business Personality + reply engine smoke test.
 *
 * Exercises the real service and repository layers against the database:
 * personality save/read, knowledge assembly, preview, draft generation,
 * approval routing, the learning signal, and analytics. Creates a throwaway
 * tenant and deletes it afterwards.
 *
 * Run with: npm run smoke:ai
 */

import { PrismaClient, UserRole } from "@prisma/client";
import { businessPersonalityService } from "../src/server/services/businessPersonality.service";
import { aiReplyEngineService } from "../src/server/services/aiReplyEngine.service";
import type { AuthContext } from "../src/server/auth/requireSession";

const prisma = new PrismaClient();
const suffix = Date.now().toString(36);

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const tenant = await prisma.tenant.create({
  data: {
    name: `AI Smoke ${suffix}`,
    slug: `ai-smoke-${suffix}`,
    industry: "Dental clinic",
    businessEmail: `ai-${suffix}@example.test`,
  },
});
const user = await prisma.user.create({
  data: {
    tenantId: tenant.id,
    firstName: "AI",
    lastName: "Smoke",
    email: `ai-${suffix}@example.test`,
    role: UserRole.TENANT_OWNER,
  },
});

const ctx: AuthContext = {
  userId: user.id,
  tenantId: tenant.id,
  role: UserRole.TENANT_OWNER,
  sessionId: "smoke",
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
};

try {
  console.log("\nDefaults before onboarding");
  const initial = await businessPersonalityService.get(ctx);
  check("returns defaults with no row", initial.revision === 0);
  check("not complete initially", !initial.complete);
  check("safe default approval mode", initial.approvalMode === "DRAFT_ONLY");
  check("negative strategy defaults are populated", initial.negativeStrategies.length >= 4);
  check(
    "step 1 is pre-filled from workspace data",
    initial.suggestions.businessName === tenant.name,
    JSON.stringify(initial.suggestions),
  );

  console.log("\nPer-step saving");
  await businessPersonalityService.update(ctx, {
    businessName: "Bright Smile Dental",
    shortDescription: "Family-owned, gentle and affordable dental care.",
    completedStep: "introduction",
  });
  const afterStep1 = await businessPersonalityService.update(ctx, {
    communicationStyles: ["Warm", "Professional"],
    completedStep: "style",
  });
  check("step 1 answers survive step 2", afterStep1.businessName === "Bright Smile Dental");
  check("step 2 answers saved", afterStep1.communicationStyles.includes("Warm"));
  check("both steps recorded", afterStep1.completedSteps.length === 2);
  check("revision increments", afterStep1.revision >= 2, String(afterStep1.revision));
  check("still incomplete", !afterStep1.complete);

  // Re-answering a step must not duplicate it.
  const reAnswered = await businessPersonalityService.update(ctx, {
    communicationStyles: ["Warm", "Professional", "Empathetic"],
    completedStep: "style",
  });
  check("re-answering a step is idempotent", reAnswered.completedSteps.length === 2);

  console.log("\nCompletion");
  await businessPersonalityService.update(ctx, {
    negativeStrategies: ["APOLOGIZE_FIRST", "SHOW_EMPATHY", "INVITE_OFFLINE", "NEVER_ARGUE"],
    completedStep: "negative",
  });
  const complete = await businessPersonalityService.update(ctx, {
    approvalMode: "DRAFT_ONLY",
    greetingStyle: "Hi,",
    signature: "The Bright Smile Team",
    neverSay: ["Never promise refunds"],
    completedStep: "approval",
  });
  check("complete once required steps are answered", complete.complete);
  check("completedAt is stamped", complete.completedAt !== null);

  console.log("\nKnowledge assembly");
  const knowledge = await businessPersonalityService.getKnowledge(ctx);
  check("personality name wins over tenant name", knowledge.identity.businessName === "Bright Smile Dental");
  check("industry falls back to workspace data", knowledge.identity.industry === "Dental clinic");
  check("voice carries the chosen styles", knowledge.voice.communicationStyles.length === 3);
  check("restrictions carry never-say", knowledge.restrictions.neverSay.includes("Never promise refunds"));
  check("marked complete", knowledge.meta.complete);

  console.log("\nPreview (nothing persisted)");
  const beforeCount = await prisma.aiReplyDraft.count({ where: { tenantId: tenant.id } });
  const preview = await aiReplyEngineService.preview(ctx, {
    starRating: 5,
    comment: "Painless cleaning and lovely staff!",
    reviewerName: "Priya Sharma",
  });
  const afterCount = await prisma.aiReplyDraft.count({ where: { tenantId: tenant.id } });
  check("preview persists nothing", beforeCount === afterCount);
  check("preview has no id", preview.id === null);
  check("preview classified as very positive", preview.sentiment === "VERY_POSITIVE");
  check("preview produced text", preview.text.length > 30, preview.text);
  check("preview honours the greeting", preview.text.startsWith("Hi Priya,"), preview.text);
  check("preview honours the signature", preview.text.includes("The Bright Smile Team"));
  check("preview exposes prompt sections", preview.sections.length > 3);
  check("preview has no blocking issues", !preview.issues.some((i) => i.severity === "block"), JSON.stringify(preview.issues));

  console.log("\nDraft for a real review");
  const review = await prisma.review.create({
    data: {
      tenantId: tenant.id,
      starRating: 2,
      comment: "Reception was rude and we waited far too long.",
      reviewerName: "Tom Blake",
      reviewCreatedAt: new Date(),
    },
  });
  const draft = await aiReplyEngineService.generateForReview(ctx, { reviewId: review.id });
  check("draft persisted", draft.id !== null);
  check("negative review classified NEGATIVE", draft.sentiment === "NEGATIVE", draft.sentiment);
  check("DRAFT_ONLY routes to DRAFT", draft.status === "DRAFT", draft.status);
  check("apology leads the reply", /sorry|apolog/i.test(draft.text), draft.text);
  check("draft records the personality revision", true);

  console.log("\nEscalation overrides automation");
  await businessPersonalityService.update(ctx, { approvalMode: "AUTO_SEND", completedStep: "approval" });
  const seriousReview = await prisma.review.create({
    data: {
      tenantId: tenant.id,
      starRating: 1,
      comment: "I got an infection afterwards and I am contacting my lawyer.",
      reviewerName: "Dana",
      reviewCreatedAt: new Date(),
    },
  });
  const escalatedDraft = await aiReplyEngineService.generateForReview(ctx, { reviewId: seriousReview.id });
  check("serious claim is escalated", escalatedDraft.escalated);
  check("escalation reasons reported", escalatedDraft.escalationReasons.length > 0);
  check(
    "auto-send is overridden for escalated reviews",
    escalatedDraft.status === "PENDING_APPROVAL",
    escalatedDraft.status,
  );

  // Routine praise under AUTO_SEND should be approved automatically.
  const happyReview = await prisma.review.create({
    data: { tenantId: tenant.id, starRating: 5, comment: "Wonderful!", reviewerName: "Sam", reviewCreatedAt: new Date() },
  });
  const autoDraft = await aiReplyEngineService.generateForReview(ctx, { reviewId: happyReview.id });
  check("auto-send approves routine praise", autoDraft.status === "APPROVED", autoDraft.status);

  console.log("\nSend + learning signal");
  const editedText = "Hi Tom, we are truly sorry about the wait and the way you were greeted. Please call us so we can put it right.";
  const sent = await aiReplyEngineService.decide(ctx, draft.id!, { action: "send", editedText });
  check("draft marked sent", sent.status === "SENT");
  check("sent text recorded", sent.sentText === editedText);

  const stored = await prisma.aiReplyDraft.findUnique({ where: { id: draft.id! } });
  check("original generated text preserved", stored?.generatedText === draft.text);
  check("edit captured separately", stored?.editedText === editedText);
  check("fingerprint recomputed from sent text", Boolean(stored?.fingerprint));

  const replies = await prisma.reviewReply.findMany({ where: { reviewId: review.id, deletedAt: null } });
  check("a real ReviewReply was created", replies.length === 1 && replies[0]!.comment === editedText);
  const updatedReview = await prisma.review.findUnique({ where: { id: review.id } });
  check("review marked REPLIED", updatedReview?.status === "REPLIED");

  console.log("\nGuardrails on send");
  const guardReview = await prisma.review.create({
    data: { tenantId: tenant.id, starRating: 3, comment: "Average", reviewerName: "Guard", reviewCreatedAt: new Date() },
  });
  const guardDraft = await aiReplyEngineService.generateForReview(ctx, { reviewId: guardReview.id });
  let blocked = false;
  try {
    await aiReplyEngineService.decide(ctx, guardDraft.id!, {
      action: "send",
      editedText: "Sorry! We will issue a full refund right away.",
    });
  } catch {
    blocked = true;
  }
  check("a human edit violating never-say is blocked at send", blocked);
  const guardAfter = await prisma.aiReplyDraft.findUnique({ where: { id: guardDraft.id! } });
  check("blocked draft was not marked sent", guardAfter?.status !== "SENT");

  console.log("\nDuplicate protection");
  const dupReview = await prisma.review.create({
    data: { tenantId: tenant.id, starRating: 5, comment: "Wonderful!", reviewerName: "Sam", reviewCreatedAt: new Date() },
  });
  const dupDraft = await aiReplyEngineService.generateForReview(ctx, { reviewId: dupReview.id });
  check("engine retried against sent history", dupDraft.attempts >= 1);
  check("duplicate check produced usable text", dupDraft.text.trim().length > 20);

  console.log("\nDrafts list + approval queue");
  const all = await aiReplyEngineService.listDrafts(ctx, { page: 1, pageSize: 50 });
  check("drafts are listed", all.total >= 5, String(all.total));
  const queue = await aiReplyEngineService.listDrafts(ctx, { status: "PENDING_APPROVAL", page: 1, pageSize: 50 });
  check("approval queue filters", queue.items.every((d) => d.status === "PENDING_APPROVAL"));
  check("queue holds the escalated draft", queue.items.some((d) => d.id === escalatedDraft.id));

  console.log("\nReject + discard");
  const rejected = await aiReplyEngineService.decide(ctx, escalatedDraft.id!, {
    action: "reject",
    reason: "handled by the practice manager offline",
  });
  check("reject transitions", rejected.status === "REJECTED");
  const discarded = await aiReplyEngineService.decide(ctx, autoDraft.id!, { action: "discard" });
  check("discard transitions", discarded.status === "DISCARDED");

  let resendBlocked = false;
  try {
    await aiReplyEngineService.decide(ctx, draft.id!, { action: "send" });
  } catch {
    resendBlocked = true;
  }
  check("an already-sent draft cannot be resent", resendBlocked);

  console.log("\nAnalytics");
  const stats = await aiReplyEngineService.analytics(ctx, 30);
  check("counts generated drafts", stats.generated >= 5, String(stats.generated));
  check("counts sent", stats.sent >= 1);
  check("counts edits", stats.edited >= 1);
  check("counts rejections", stats.rejected >= 1);
  check("edit rate is a ratio", stats.editRate !== null && stats.editRate >= 0 && stats.editRate <= 1);
  check("approval time measured", stats.avgApprovalMs !== null && stats.avgApprovalMs >= 0);
  check("time saved is labelled as an estimate", stats.estimateBasis.length > 0);

  console.log("\nTenant isolation");
  const otherTenant = await prisma.tenant.create({
    data: { name: `Other ${suffix}`, slug: `other-${suffix}` },
  });
  const otherUser = await prisma.user.create({
    data: {
      tenantId: otherTenant.id,
      firstName: "Other",
      lastName: "User",
      email: `other-${suffix}@example.test`,
      role: UserRole.TENANT_OWNER,
    },
  });
  const otherCtx: AuthContext = { ...ctx, userId: otherUser.id, tenantId: otherTenant.id, email: otherUser.email };
  let isolated = false;
  try {
    await aiReplyEngineService.decide(otherCtx, guardDraft.id!, { action: "discard" });
  } catch {
    isolated = true;
  }
  check("another tenant cannot touch this tenant's draft", isolated);
  const otherPersonality = await businessPersonalityService.get(otherCtx);
  check("another tenant sees its own empty personality", otherPersonality.revision === 0);
  await prisma.tenant.delete({ where: { id: otherTenant.id } }).catch(() => undefined);

  console.log("\nReset");
  const reset = await businessPersonalityService.reset(ctx);
  check("reset clears the personality", reset.revision === 0 && !reset.complete);
} finally {
  await prisma.tenant.delete({ where: { id: tenant.id } }).catch((err) => {
    console.error("Cleanup failed — remove tenant manually:", tenant.id, err);
  });
  await prisma.$disconnect();
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAI personality smoke test passed.");
