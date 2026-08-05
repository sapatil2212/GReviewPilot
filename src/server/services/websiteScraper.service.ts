/**
 * Website scraper service.
 *
 * Given a business's public website URL, the AI agent fetches the page,
 * strips it down to readable text, and asks Gemini to extract a compact
 * business brief (type, description, highlights, keywords). That brief
 * is saved as a "draft" on the location's review profile and later feeds
 * the review generator so AI reviews are grounded in the real business.
 *
 * Safety / limits:
 *   - Only http(s) URLs, blocks obvious internal/loopback hosts (SSRF).
 *   - Hard timeout + response size cap.
 *   - Never executes fetched content; treats it purely as text.
 */

import { geminiService } from "@/server/services/ai/gemini.service";
import { logger } from "@/server/utils/logger";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 1_500_000; // ~1.5MB of HTML
const MAX_TEXT_CHARS = 12_000; // trimmed text sent to the model

export interface WebsiteBrief {
  businessType: string | null;
  description: string | null;
  highlights: string[];
  keywords: string[];
  /** Human-readable draft summary saved for the tenant's reference. */
  summary: string;
}

/** Reject loopback / private / metadata hosts to avoid SSRF. */
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (
    h === "localhost" ||
    h === "0.0.0.0" ||
    h.endsWith(".local") ||
    h.endsWith(".internal")
  ) {
    return true;
  }
  // IPv4 private / loopback / link-local ranges.
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }
  return false;
}

function normalizeUrl(raw: string): URL | null {
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProto);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (isBlockedHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

/** Strip HTML to readable text (no DOM dependency). */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull the <title> and meta description for extra signal. */
function extractMeta(html: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const desc =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(
      html,
    )?.[1]?.trim() ??
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i.exec(
      html,
    )?.[1]?.trim() ??
    "";
  return [title ? `Title: ${title}` : "", desc ? `Description: ${desc}` : ""]
    .filter(Boolean)
    .join(". ");
}

/**
 * Fetch the website and return trimmed readable text (meta + body).
 * Returns null if the URL is invalid/blocked or the fetch fails.
 */
export async function fetchWebsiteText(rawUrl: string): Promise<string | null> {
  const url = normalizeUrl(rawUrl);
  if (!url) {
    logger.warn("Website fetch skipped — invalid or blocked URL", { rawUrl });
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; GReviewPilotBot/1.0; +https://greviewpilot.app/bot)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      logger.warn("Website fetch non-OK", { url: url.toString(), status: res.status });
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("text")) {
      return null;
    }

    // Read with a byte cap.
    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder();
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (received >= MAX_BYTES) {
          await reader.cancel();
          break;
        }
      }
    } else {
      html = await res.text();
    }

    const meta = extractMeta(html);
    const body = htmlToText(html);
    const combined = [meta, body].filter(Boolean).join(". ");
    if (!combined) return null;
    return combined.slice(0, MAX_TEXT_CHARS);
  } catch (err) {
    logger.warn("Website fetch failed", {
      url: url.toString(),
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a business website and extract a structured brief via Gemini.
 * Returns null when the site can't be fetched or Gemini is unavailable.
 */
export async function extractBusinessBriefFromWebsite(
  websiteUrl: string,
  businessName: string,
): Promise<WebsiteBrief | null> {
  const text = await fetchWebsiteText(websiteUrl);
  if (!text) return null;

  if (!geminiService.isEnabled()) {
    // No AI available — return the raw text as a truncated summary draft so
    // the tenant still gets something to review.
    return {
      businessType: null,
      description: null,
      highlights: [],
      keywords: [],
      summary: text.slice(0, 800),
    };
  }

  const prompt = [
    `You are analyzing the official website of a business called "${businessName}".`,
    "Read the website content below and extract a factual brief about the business.",
    "Only use information present in the content — do NOT invent awards, names, prices, or claims.",
    "",
    "Website content:",
    '"""',
    text,
    '"""',
    "",
    "Return a JSON object with exactly these keys:",
    '  "businessType": short normalized type (e.g. "Family Dental Clinic") or null,',
    '  "description": a 1-2 sentence factual description of what the business does and who it serves,',
    '  "highlights": array of 5-8 specific strengths/services customers would genuinely praise (grounded in the content),',
    '  "keywords": array of 4-8 natural SEO keyword phrases relevant to the business,',
    '  "summary": a concise 2-4 sentence draft brief a review writer can rely on.',
  ].join("\n");

  try {
    const result = await geminiService.generateJson<{
      businessType?: string | null;
      description?: string | null;
      highlights?: string[];
      keywords?: string[];
      summary?: string;
    }>(prompt, { temperature: 0.4, maxOutputTokens: 700 });

    const asStrings = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        : [];

    return {
      businessType: result.businessType?.trim() || null,
      description: result.description?.trim() || null,
      highlights: asStrings(result.highlights).slice(0, 8),
      keywords: asStrings(result.keywords).slice(0, 8),
      summary: (result.summary ?? "").trim() || text.slice(0, 800),
    };
  } catch (err) {
    logger.warn("Website brief extraction failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      businessType: null,
      description: null,
      highlights: [],
      keywords: [],
      summary: text.slice(0, 800),
    };
  }
}
