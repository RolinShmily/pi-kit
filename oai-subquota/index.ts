/**
 * oai-subquota — OpenAI Codex subscription quota & status monitor for Pi
 *
 * Capabilities:
 * - Queries ChatGPT Codex backend usage quota (5-hour window, 7-day weekly window,
 *   banked rate-limit resets, and flexible credits).
 * - Renders a boxed quota summary in chat transcript on `/oai-subquota [codex]`.
 * - Displays a persistent, right-aligned single-line status in the footer:
 *     5h:100% 7d:71% ↺4d5h
 * - Provider-scoped: active exclusively when current model provider is "openai-codex".
 *   Automatically clears when switching away and restores upon switching back.
 * - Turn-based hot refresh: passively collects x-codex-* headers during agent loops
 *   and refreshes the footer on turn completion (agent_end / agent_settled).
 * - ChatGPT OAuth (provider: "openai") quota querying is parked pending official API.
 */

import type { AutocompleteItem, ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  extractAccountFromToken,
  mergeSnapshots,
  parseCodexRateLimitHeaders,
  parseUsageApiResponse,
  queryUsage,
  readCachedSnapshot,
  writeCachedSnapshot,
  type AccountSnapshot,
  type CodexUsageSnapshot,
  type CreditsSnapshot,
  type LimitWindow,
  type RateLimit,
  type ResetsSnapshot,
} from "./snapshot.ts";
import { dimText, formatBoxedStatus, formatRightAlignedStatusline, formatStatusline, renderStatusMessage } from "./ui.ts";

export type { LimitWindow, RateLimit, CreditsSnapshot, ResetsSnapshot, AccountSnapshot, CodexUsageSnapshot };
export { bar, formatDuration, formatStatusline, formatBoxedStatus, formatRightAlignedStatusline } from "./ui.ts";

const CODEX_PROVIDER = "openai-codex";
const CHATGPT_PROVIDER = "openai";
const STATUS_KEY = "oai-subquota";
const MESSAGE_TYPE = "codex-quota";
const CACHE_TTL_MS = 60_000;

function isCodexProvider(ctx: ExtensionContext | ExtensionCommandContext): boolean {
  return ctx.model?.provider === CODEX_PROVIDER;
}

let activeCtx: ExtensionContext | ExtensionCommandContext | null = null;
let latestSnapshot: CodexUsageSnapshot | undefined;

function setFooterStatus(ctx: ExtensionContext | ExtensionCommandContext, snapshot: CodexUsageSnapshot | undefined): void {
  latestSnapshot = snapshot;
  activeCtx = ctx;
  try {
    if (!ctx.ui?.setStatus) return;
    if (!snapshot || !isCodexProvider(ctx)) {
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }
    ctx.ui.setStatus(STATUS_KEY, dimText(ctx, formatRightAlignedStatusline(snapshot)));
  } catch {
    // UI unavailable
  }
}

async function refreshCodexSnapshot(
  ctx: ExtensionContext | ExtensionCommandContext,
  force = false,
): Promise<CodexUsageSnapshot | undefined> {
  const cached = await readCachedSnapshot();
  if (cached) {
    setFooterStatus(ctx, cached);
    if (!force && Date.now() - Date.parse(cached.fetchedAt) < CACHE_TTL_MS) {
      return cached;
    }
  }

  const resolved = await ctx.modelRegistry.getProviderAuth(CODEX_PROVIDER).catch(() => undefined);
  const accessToken = resolved?.auth.apiKey;
  if (!accessToken) {
    if (!cached) setFooterStatus(ctx, undefined);
    return undefined;
  }

  const tokenAccount = extractAccountFromToken(accessToken);
  const rawBody = await queryUsage(accessToken, tokenAccount.accountId);
  const snapshot = parseUsageApiResponse(rawBody, tokenAccount);

  await writeCachedSnapshot(snapshot);
  setFooterStatus(ctx, snapshot);
  return snapshot;
}

// ----------------- Extension Entrypoint -----------------

export default function (pi: ExtensionAPI): void {
  pi.registerMessageRenderer(MESSAGE_TYPE, renderStatusMessage);

  const onResize = () => {
    if (activeCtx && latestSnapshot && isCodexProvider(activeCtx)) {
      setFooterStatus(activeCtx, latestSnapshot);
    }
  };
  process.stdout?.on?.("resize", onResize);

  let queryInFlight = false;
  let isLoopActive = false;
  let latestLoopHeaders: Record<string, string> | null = null;
  let lastLoopRefreshTime = 0;

  pi.on("session_shutdown", () => {
    process.stdout?.off?.("resize", onResize);
    activeCtx = null;
  });

  // Session start: activate only if current model provider is openai-codex
  pi.on("session_start", async (_event, ctx) => {
    if (!isCodexProvider(ctx)) {
      setFooterStatus(ctx, undefined);
      return;
    }
    try {
      const cached = await readCachedSnapshot();
      if (cached) setFooterStatus(ctx, cached);
      void refreshCodexSnapshot(ctx, false).catch(() => undefined);
    } catch {
      // Non-blocking
    }
  });

  // Dynamically react to model selection changes (/model or Ctrl+P)
  pi.on("model_select", async (event, ctx) => {
    if (event.model.provider === CODEX_PROVIDER) {
      try {
        const cached = await readCachedSnapshot();
        if (cached) setFooterStatus(ctx, cached);
        void refreshCodexSnapshot(ctx, false).catch(() => undefined);
      } catch {
        // Non-blocking
      }
    } else {
      setFooterStatus(ctx, undefined);
    }
  });

  // Turn start: activate hot-capture only for openai-codex
  pi.on("before_agent_start", (_event, ctx) => {
    if (!isCodexProvider(ctx)) {
      isLoopActive = false;
      latestLoopHeaders = null;
      return;
    }
    isLoopActive = true;
    latestLoopHeaders = null;
  });

  // Provider response: passively buffer rate limit headers during turn
  pi.on("after_provider_response", (event, ctx) => {
    if (!isCodexProvider(ctx) || !isLoopActive || !event.headers) return;
    for (const [k, v] of Object.entries(event.headers)) {
      if (k.toLowerCase().startsWith("x-codex-")) {
        if (!latestLoopHeaders) latestLoopHeaders = {};
        latestLoopHeaders[k] = v;
      }
    }
  });

  // Turn completion: refresh quota on agent loop boundary
  const onAgentLoopFinished = async (ctx: ExtensionContext) => {
    if (!isCodexProvider(ctx)) {
      isLoopActive = false;
      latestLoopHeaders = null;
      return;
    }
    isLoopActive = false;
    const now = Date.now();
    if (now - lastLoopRefreshTime < 1500) return;
    lastLoopRefreshTime = now;

    try {
      if (latestLoopHeaders) {
        const parsed = parseCodexRateLimitHeaders(latestLoopHeaders);
        latestLoopHeaders = null;
        if (parsed) {
          const cached = await readCachedSnapshot();
          const merged = mergeSnapshots(cached, parsed);
          await writeCachedSnapshot(merged);
          setFooterStatus(ctx, merged);
          return;
        }
      }
      void refreshCodexSnapshot(ctx, false).catch(() => undefined);
    } catch {
      // Non-blocking
    }
  };

  pi.on("agent_end", (_event, ctx) => {
    void onAgentLoopFinished(ctx);
  });
  pi.on("agent_settled", (_event, ctx) => {
    void onAgentLoopFinished(ctx);
  });

  // Slash command registration with English schema
  pi.registerCommand("oai-subquota", {
    description: "Check OpenAI Codex subscription quota (5h, 7d, resets); new ChatGPT OAuth quota is parked",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const items: AutocompleteItem[] = [
        { value: "codex", label: "codex", description: "Display Codex quota summary box and refresh footer" },
        { value: "refresh", label: "refresh", description: "Force fresh quota query from OpenAI backend" },
        { value: "statusline", label: "statusline", description: "Print compact single-line quota text" },
        { value: "chatgpt", label: "chatgpt", description: "Inspect new ChatGPT OAuth status (parked)" },
      ];
      const filtered = items.filter((item) => item.value.startsWith(prefix.trimStart()));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx) => {
      const sub = args.trim().toLowerCase();

      // ChatGPT new provider parked placeholder
      if (sub === "chatgpt") {
        const resolved = await ctx.modelRegistry.getProviderAuth(CHATGPT_PROVIDER).catch(() => undefined);
        const hasAuth = !!resolved?.auth.apiKey;
        const msg = hasAuth
          ? "ChatGPT subscription (provider: openai) is parked: official 5h/weekly rate limit endpoint is not yet supported."
          : "ChatGPT subscription (provider: openai) is not authenticated. Quota querying is parked.";

        if (ctx.hasUI) {
          ctx.ui.notify(msg, "info");
        } else {
          console.log(msg);
        }
        return;
      }

      if (queryInFlight) {
        if (ctx.hasUI) ctx.ui.notify("oai-subquota: Query in progress.", "warning");
        return;
      }

      queryInFlight = true;
      try {
        const force = sub === "refresh";
        const snapshot = await refreshCodexSnapshot(ctx, force);
        if (!snapshot) {
          throw new Error("No openai-codex OAuth credentials found. Please run /login openai-codex first.");
        }

        if (sub === "statusline") {
          const line = formatStatusline(snapshot);
          if (ctx.hasUI === false) {
            console.log(line);
          } else {
            ctx.ui.notify(line, "info");
          }
          return;
        }

        // Render boxed quota summary
        const boxed = formatBoxedStatus(snapshot);
        if (ctx.hasUI === false) {
          console.log(boxed);
        } else if (pi.sendMessage) {
          await pi.sendMessage({
            customType: MESSAGE_TYPE,
            content: boxed,
            display: true,
            details: snapshot,
          });
        } else {
          ctx.ui.notify(formatStatusline(snapshot), "info");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (ctx.hasUI) {
          ctx.ui.notify(`oai-subquota error: ${message}`, "error");
        } else {
          console.error(`oai-subquota error: ${message}`);
        }
      } finally {
        queryInFlight = false;
      }
    },
  });
}
