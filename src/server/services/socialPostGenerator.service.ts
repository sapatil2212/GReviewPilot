/**
 * AI social media post generator.
 *
 * Takes a freeform prompt from the user and produces caption copy tailored
 * to each target platform's conventions (length, hashtag density, tone,
 * emoji tolerance). Grounded in the tenant's business profile and the
 * location's AI brief so posts sound like the actual business.
 *
 * Generation only — publishing to social networks would require per-platform
 * OAuth that this app doesn't have. Output is meant to be reviewed, copied,
 * or carried into a Google post draft.
 */

import { geminiService } from "@/server/services/ai/gemini.service";
import { logger } from "@/server/utils/logger";

export const SOCIAL_PLATFORMS = [
  "INSTAGRAM",
  "FACEBOOK",
  "LINKEDIN",
  "X",
  "WHATSAPP",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

interface PlatformSpec {
  label: string;
  /** Hard ceiling we enforce after generation. */
  maxChars: number;
  /** What we ask the model to aim for. */
  targetChars: string;
  hashtags: string;
  style: string;
}

const SPECS: Record<SocialPlatform, PlatformSpec> = {
  INSTAGRAM: {
    label: "Instagram",
    maxChars: 2200,
    targetChars: "400-700 characters",
    hashtags: "8-12 relevant hashtags at the end, on their own line",
    style:
      "Visual and personable. Open with a hook line that stops the scroll. Short paragraphs, line breaks between them. Emoji are welcome but keep them purposeful.",
  },
  FACEBOOK: {
    label: "Facebook",
    maxChars: 2000,
    targetChars: "300-600 characters",
    hashtags: "0-3 hashtags maximum",
    style:
      "Conversational and community-minded, like talking to neighbours. Plain sentences, a clear invitation to visit or comment. Minimal emoji.",
  },
  LINKEDIN: {
    label: "LinkedIn",
    maxChars: 3000,
    targetChars: "500-900 characters",
    hashtags: "3-5 professional hashtags at the end",
    style:
      "Professional and credible. Lead with insight or a milestone rather than a sales pitch. No hype, no emoji beyond one if truly fitting.",
  },
  X: {
    label: "X (Twitter)",
    maxChars: 280,
    targetChars: "under 260 characters, hashtags included",
    hashtags: "1-2 hashtags only",
    style:
      "Punchy and single-idea. Every word earns its place. No thread, no filler.",
  },
  WHATSAPP: {
    label: "WhatsApp",
    maxChars: 700,
    targetChars: "150-300 characters",
    hashtags: "no hashtags",
    style:
      "Direct and warm, like a broadcast message to existing customers. Lead with the useful detail. A couple of emoji are fine.",
  },
};

export interface SocialPostInput {
  /** The user's freeform instruction — the core of the request. */
  prompt: string;
  platforms: SocialPlatform[];
  businessName: string;
  category?: string | null;
  city?: string | null;
  tone?: string | null;
  includeHashtags?: boolean;
  includeEmoji?: boolean;
  /** Optional call-to-action to work in (e.g. "Book on our website"). */
  callToAction?: string | null;
  /** Business brief from the review profile / website scrape. */
  aiContext?: string | null;
  highlights?: string[] | null;
}

export interface GeneratedSocialPost {
  platform: SocialPlatform;
  platformLabel: string;
  caption: string;
  hashtags: string[];
  charCount: number;
  /** True when we had to trim to respect the platform ceiling. */
  truncated: boolean;
}

export interface SocialPostResult {
  posts: GeneratedSocialPost[];
  source: "ai" | "template";
}

export function platformLabel(p: SocialPlatform): string {
  return SPECS[p].label;
}

export async function generateSocialPosts(
  input: SocialPostInput,
): Promise<SocialPostResult> {
  const platforms = input.platforms.length > 0 ? input.platforms : ["INSTAGRAM" as const];

  if (geminiService.isEnabled()) {
    try {
      const posts = await withGemini({ ...input, platforms });
      if (posts.length > 0) return { posts, source: "ai" };
    } catch (err) {
      logger.warn("Gemini social post generation failed — using template", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    posts: platforms.map((p) => templatePost(p, input)),
    source: "template",
  };
}

async function withGemini(
  input: SocialPostInput,
): Promise<GeneratedSocialPost[]> {
  const highlights = (input.highlights ?? []).filter(Boolean).slice(0, 6);

  const platformBlock = input.platforms
    .map((p) => {
      const s = SPECS[p];
      return [
        `- ${p} (${s.label}):`,
        `    length: ${s.targetChars}`,
        `    hashtags: ${input.includeHashtags === false ? "none — the user disabled hashtags" : s.hashtags}`,
        `    style: ${s.style}`,
      ].join("\n");
    })
    .join("\n");

  const prompt = [
    `You are the social media manager for "${input.businessName}".`,
    input.category ? `Business category: ${input.category}.` : "",
    input.city ? `Location: ${input.city}.` : "",
    input.aiContext ? `Business brief: ${input.aiContext}` : "",
    highlights.length ? `Known strengths: ${highlights.join(", ")}.` : "",
    "",
    "THE USER'S REQUEST (this is the subject of the post — follow it closely):",
    `"""${input.prompt}"""`,
    "",
    input.callToAction
      ? `Work in this call to action naturally: ${input.callToAction}.`
      : "",
    `Overall tone: ${input.tone?.trim() || "warm and professional"}.`,
    input.includeEmoji === false
      ? "Do NOT use any emoji."
      : "Use emoji sparingly and only where they add warmth.",
    "",
    "Write ONE post per platform below, each genuinely rewritten for that platform's conventions — not the same text reposted:",
    platformBlock,
    "",
    "Rules:",
    "- Never invent specific facts: no prices, discount percentages, dates, awards, or staff names unless the user's request supplies them.",
    "- No markdown formatting, no asterisks, no headings. Plain text with line breaks only.",
    "- Do not mention that this was AI generated.",
    "- Keep claims honest and compliant; avoid guarantees about outcomes.",
    "",
    "Return a JSON array, one object per requested platform, in this exact shape:",
    '[{ "platform": "INSTAGRAM", "caption": "the post text without the hashtag block", "hashtags": ["#example", "#another"] }]',
    "Put hashtags ONLY in the hashtags array, never inside caption. Use an empty array when a platform should have none.",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await geminiService.generateJson<
    Array<{ platform?: string; caption?: string; hashtags?: string[] }>
  >(prompt, {
    systemInstruction:
      "You are an experienced social media manager for local businesses. You write platform-native copy and never fabricate facts about the business.",
    temperature: 0.9,
    // Multi-platform output is long; give the model real room.
    maxOutputTokens: 2200,
  });

  if (!Array.isArray(raw)) return [];

  const byPlatform = new Map<SocialPlatform, GeneratedSocialPost>();

  for (const item of raw) {
    const key = (item.platform ?? "").toUpperCase() as SocialPlatform;
    if (!SPECS[key]) continue;
    if (!input.platforms.includes(key)) continue;

    const caption = (item.caption ?? "").trim();
    if (!caption) continue;

    const hashtags =
      input.includeHashtags === false
        ? []
        : Array.isArray(item.hashtags)
          ? item.hashtags
              .filter((h): h is string => typeof h === "string" && h.trim().length > 1)
              .map((h) => (h.trim().startsWith("#") ? h.trim() : `#${h.trim()}`))
              .slice(0, 15)
          : [];

    byPlatform.set(key, shape(key, caption, hashtags));
  }

  // Fill any platform the model skipped so the UI always answers the request.
  for (const p of input.platforms) {
    if (!byPlatform.has(p)) byPlatform.set(p, templatePost(p, input));
  }

  return input.platforms.map((p) => byPlatform.get(p)!);
}

/**
 * Assemble the final caption and enforce the platform's hard ceiling.
 * Trimming happens on word boundaries so we never cut mid-word.
 */
function shape(
  platform: SocialPlatform,
  caption: string,
  hashtags: string[],
): GeneratedSocialPost {
  const spec = SPECS[platform];
  const tagLine = hashtags.join(" ");
  let body = caption;
  let truncated = false;

  const full = tagLine ? `${body}\n\n${tagLine}` : body;
  if (full.length > spec.maxChars) {
    // Preserve the hashtags; claw back space from the caption.
    const room = spec.maxChars - (tagLine ? tagLine.length + 2 : 0);
    if (room > 40) {
      body = body.slice(0, room);
      const lastSpace = body.lastIndexOf(" ");
      if (lastSpace > room * 0.6) body = body.slice(0, lastSpace);
      body = body.trimEnd().replace(/[,;:]$/, "") + "…";
    } else {
      body = body.slice(0, Math.max(spec.maxChars - 1, 0)).trimEnd() + "…";
      hashtags = [];
    }
    truncated = true;
  }

  const finalTagLine = hashtags.join(" ");
  const finalCaption = finalTagLine ? `${body}\n\n${finalTagLine}` : body;

  return {
    platform,
    platformLabel: spec.label,
    caption: finalCaption,
    hashtags,
    charCount: finalCaption.length,
    truncated,
  };
}

/** Offline fallback so the studio still returns something usable. */
function templatePost(
  platform: SocialPlatform,
  input: SocialPostInput,
): GeneratedSocialPost {
  const biz = input.businessName;
  const where = input.city ? ` in ${input.city}` : "";
  const topic = input.prompt.trim().replace(/\s+/g, " ").slice(0, 200);
  const cta = input.callToAction?.trim();

  const bodies: Record<SocialPlatform, string> = {
    INSTAGRAM: `${topic}\n\nThat's the latest from ${biz}${where}. Come see us — we'd love to have you.${cta ? `\n\n${cta}` : ""}`,
    FACEBOOK: `${topic}\n\nHere's what's happening at ${biz}${where}. Stop by and say hello.${cta ? ` ${cta}` : ""}`,
    LINKEDIN: `${topic}\n\nAn update from the team at ${biz}${where}.${cta ? ` ${cta}` : ""}`,
    X: `${topic}${cta ? ` ${cta}` : ""}`.slice(0, 240),
    WHATSAPP: `${topic}\n\n— The team at ${biz}${cta ? `\n${cta}` : ""}`,
  };

  const baseTags =
    input.includeHashtags === false
      ? []
      : buildFallbackTags(platform, input);

  return shape(platform, bodies[platform], baseTags);
}

function buildFallbackTags(
  platform: SocialPlatform,
  input: SocialPostInput,
): string[] {
  const slug = (s: string) =>
    "#" + s.replace(/[^\p{L}\p{N}]/gu, "").replace(/^./, (c) => c.toUpperCase());

  const pool = [
    input.city ? slug(input.city) : "",
    input.category ? slug(input.category) : "",
    slug(input.businessName),
  ].filter(Boolean);

  const limits: Record<SocialPlatform, number> = {
    INSTAGRAM: 3,
    FACEBOOK: 2,
    LINKEDIN: 3,
    X: 1,
    WHATSAPP: 0,
  };
  return pool.slice(0, limits[platform]);
}
