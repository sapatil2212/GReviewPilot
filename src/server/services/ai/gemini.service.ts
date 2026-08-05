/**
 * Gemini AI client.
 *
 * Thin wrapper over the Google Generative Language REST API. Used by
 * the review generator now; later modules (insights, content studio,
 * competitor intel) reuse `generateText` / `generateJson`.
 *
 * Design:
 *   - No SDK dependency — plain fetch against the REST endpoint.
 *   - Every method degrades gracefully: callers should catch
 *     `GeminiError` and fall back (e.g. to templates).
 *   - Key + model come from env; `geminiEnabled` gates usage.
 */

import { env, geminiEnabled } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

interface GenerateOptions {
  /** System-level instruction that shapes tone/behavior. */
  systemInstruction?: string;
  /** 0.0 = deterministic, 1.0 = creative. Default 0.9 for reviews. */
  temperature?: number;
  /** Desired length of the *visible* answer, in tokens. */
  maxOutputTokens?: number;
}

/**
 * Extra token budget reserved for model "thinking".
 *
 * Current Gemini flash models reason internally before answering, and
 * those thought tokens are billed against `maxOutputTokens`. A request
 * for 300 visible tokens can burn ~1000 on thinking and return an EMPTY
 * candidate, which silently degrades callers to their fallbacks.
 *
 * So we add headroom on top of whatever the caller asked for. Callers
 * keep expressing intent ("I want ~300 tokens of answer") and we make
 * sure the model has room to think first.
 */
const THINKING_HEADROOM_TOKENS = 3072;

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    /** Tokens spent on internal reasoning — billed against maxOutputTokens. */
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
}

export const geminiService = {
  isEnabled(): boolean {
    return geminiEnabled;
  },

  /**
   * Generate freeform text from a prompt. Throws GeminiError on
   * failure (network, quota, safety block, or disabled).
   */
  async generateText(prompt: string, opts: GenerateOptions = {}): Promise<string> {
    if (!geminiEnabled) {
      throw new GeminiError(503, "Gemini is not configured");
    }

    const model = env.GEMINI_MODEL;
    const url = `${API_BASE}/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      ...(opts.systemInstruction
        ? {
            systemInstruction: {
              parts: [{ text: opts.systemInstruction }],
            },
          }
        : {}),
      generationConfig: {
        temperature: opts.temperature ?? 0.9,
        // See THINKING_HEADROOM_TOKENS — reasoning tokens share this budget.
        maxOutputTokens: (opts.maxOutputTokens ?? 512) + THINKING_HEADROOM_TOKENS,
        topP: 0.95,
      },
      // Reasonable safety defaults — block only high-severity content.
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_ONLY_HIGH",
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_ONLY_HIGH",
        },
      ],
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new GeminiError(
        502,
        `Gemini request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const text = await res.text();
    if (!res.ok) {
      logger.warn("Gemini API error", { status: res.status, body: text.slice(0, 500) });
      throw new GeminiError(res.status, `Gemini returned ${res.status}`);
    }

    let parsed: GeminiResponse;
    try {
      parsed = JSON.parse(text) as GeminiResponse;
    } catch {
      throw new GeminiError(500, "Gemini returned invalid JSON");
    }

    if (parsed.promptFeedback?.blockReason) {
      throw new GeminiError(
        422,
        `Gemini blocked the prompt: ${parsed.promptFeedback.blockReason}`,
      );
    }

    const candidate = parsed.candidates?.[0];
    const out = candidate?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();

    // MAX_TOKENS with empty/partial text almost always means thinking
    // tokens consumed the budget. Log the counts so it's diagnosable
    // instead of looking like a generic AI failure.
    if (candidate?.finishReason === "MAX_TOKENS") {
      logger.warn("Gemini hit the output token cap", {
        model,
        thoughtsTokenCount: parsed.usageMetadata?.thoughtsTokenCount,
        candidatesTokenCount: parsed.usageMetadata?.candidatesTokenCount,
        returnedChars: out?.length ?? 0,
      });
    }

    if (!out) {
      throw new GeminiError(
        500,
        candidate?.finishReason === "MAX_TOKENS"
          ? "Gemini returned no text — the token budget was consumed by reasoning. Raise maxOutputTokens."
          : `Gemini returned an empty response (finishReason: ${candidate?.finishReason ?? "unknown"})`,
      );
    }
    return out;
  },

  /**
   * Generate + parse JSON. Instructs the model to return raw JSON and
   * strips markdown fences before parsing.
   */
  async generateJson<T>(prompt: string, opts: GenerateOptions = {}): Promise<T> {
    const raw = await geminiService.generateText(
      `${prompt}\n\nRespond with ONLY valid JSON, no markdown, no explanation.`,
      { ...opts, temperature: opts.temperature ?? 0.4 },
    );
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // Most common cause is a truncated response. Surface enough detail
      // for the caller's warning log to be actionable.
      throw new GeminiError(
        500,
        `Gemini returned unparseable JSON (${cleaned.length} chars, likely truncated): ${cleaned.slice(-80)}`,
      );
    }
  },
};
