"use client";

/**
 * AI chat panel.
 *
 * Applies edits optimistically to the local document from the server's
 * response, rather than refetching, so the canvas updates the moment the reply
 * lands. Every AI change is server-side revisioned, which is why the local
 * document can be treated as clean afterwards.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUp, Loader2, Sparkles, Undo2 } from "lucide-react";
import { siteApi, type AiMessageDto } from "@/lib/api/site";
import { ApiClientError } from "@/lib/fetcher";
import type { SiteDocument, ThemeTokens } from "@/site/document/types";
import { cn } from "@/lib/utils";

export interface AiChatProps {
  siteId: string;
  pageId: string;
  pageTitle: string;
  onDocument: (document: SiteDocument, version: string | null) => void;
  onTheme: (theme: ThemeTokens) => void;
  onRevision: (revisionId: string) => void;
  /**
   * Prompt handed over from another panel, e.g. the audit's "Fix with AI".
   * Sent automatically once, then cleared through `onInjectedConsumed`.
   */
  injectedPrompt?: string | null;
  onInjectedConsumed?: () => void;
}

interface ChatEntry {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  revisionId?: string | null;
  pending?: boolean;
  failed?: boolean;
}

/** Starter prompts, phrased the way a non-technical owner would ask. */
const SUGGESTIONS = [
  "Make my hero section more modern",
  "Change the blue to green",
  "Add a pricing section after services",
  "Make the whole site look more luxurious",
  "Write a better headline for my home page",
  "Add an FAQ with 5 questions",
];

export function AiChat({
  siteId,
  pageId,
  pageTitle,
  onDocument,
  onTheme,
  onRevision,
  injectedPrompt,
  onInjectedConsumed,
}: AiChatProps) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sendRef = useRef<((prompt: string) => Promise<void>) | null>(null);

  useEffect(() => {
    let active = true;
    void siteApi
      .messages(siteId)
      .then((data) => {
        if (!active) return;
        setEntries(
          data.messages
            .filter((m: AiMessageDto) => m.role !== "SYSTEM")
            .map((m) => ({
              id: m.id,
              role: m.role as "USER" | "ASSISTANT",
              content: m.content,
              revisionId: m.revisionId,
            })),
        );
      })
      .catch(() => undefined)
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [siteId]);

  // Keep the newest message in view as the transcript grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries]);

  const send = async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;

    const userId = `local-${Date.now()}`;
    const pendingId = `${userId}-reply`;
    setEntries((prev) => [
      ...prev,
      { id: userId, role: "USER", content: trimmed },
      { id: pendingId, role: "ASSISTANT", content: "", pending: true },
    ]);
    setInput("");
    setBusy(true);

    try {
      const result = await siteApi.edit(siteId, { prompt: trimmed, pageId });

      if (result.document) onDocument(result.document, result.version);
      if (result.theme) onTheme(result.theme);

      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === pendingId
            ? {
                id: pendingId,
                role: "ASSISTANT",
                content: result.message,
                revisionId: result.revisionId,
              }
            : entry,
        ),
      );
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : "Something went wrong. Please try again.";
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === pendingId
            ? { id: pendingId, role: "ASSISTANT", content: message, failed: true }
            : entry,
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  sendRef.current = send;

  // Consume a prompt injected by another panel. Guarded on `busy` so a fix
  // request cannot interleave with one already in flight.
  useEffect(() => {
    if (!injectedPrompt || busy) return;
    void sendRef.current?.(injectedPrompt);
    onInjectedConsumed?.();
    // Intentionally keyed only on the prompt: re-running on every `busy`
    // transition would resend it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injectedPrompt]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
          <Sparkles className="h-3.5 w-3.5 text-blue-600" />
          AI assistant
        </div>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          Editing <span className="font-medium">{pageTitle}</span>
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {loaded && entries.length === 0 && (
          <div className="space-y-3">
            <p className="text-[11px] leading-relaxed text-slate-500">
              Describe any change in plain English. I know your business details, so you do not need
              to repeat them.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-left text-[11px] text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {entries.map((entry) => (
          <div
            key={entry.id}
            className={cn("flex", entry.role === "USER" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[92%] rounded-lg px-2.5 py-2 text-[11px] leading-relaxed",
                entry.role === "USER"
                  ? "bg-blue-600 text-white"
                  : entry.failed
                    ? "bg-red-50 text-red-800"
                    : "bg-slate-100 text-slate-800",
              )}
            >
              {entry.pending ? (
                <span className="flex items-center gap-1.5 text-slate-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Working on it…
                </span>
              ) : (
                <>
                  {entry.failed && (
                    <AlertTriangle className="mb-1 inline h-3 w-3 align-text-bottom" />
                  )}
                  <span className="whitespace-pre-line">{entry.content}</span>
                  {entry.revisionId && (
                    <button
                      type="button"
                      onClick={() => onRevision(entry.revisionId!)}
                      className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-800"
                    >
                      <Undo2 className="h-2.5 w-2.5" />
                      Undo this change
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="border-t border-slate-200 p-2"
      >
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter is a newline. Matches every chat UI.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            placeholder="Ask for any change…"
            disabled={busy}
            className="w-full resize-none rounded-lg border border-slate-200 py-2 pl-2.5 pr-9 text-xs focus:border-blue-500 focus:outline-none disabled:bg-slate-50"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="absolute bottom-2 right-2 rounded-md bg-blue-600 p-1.5 text-white transition-opacity hover:bg-blue-700 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUp className="h-3 w-3" />}
          </button>
        </div>
      </form>
    </div>
  );
}
