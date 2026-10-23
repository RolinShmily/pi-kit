/**
 * srp-theme — Prompt preview and TPS meter extension.
 *
 * Scheme A (Pure Incremental Mode):
 * Leaves Pi's native Header and Footer untouched so official features
 * (CH cache hit rate, W cache write, auto-compaction indicator, routed models, etc.)
 * work out-of-the-box without maintenance drift.
 *
 * Adds two lightweight incremental UI enhancements:
 * 1. belowEditor widget: Displays the last user prompt in powerline style (↳ <prompt>).
 * 2. Status line item: Real-time streaming TPS meter and sparkline summary.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { getLastLoopInfoFromSession, renderLastPromptLine, renderTimeAndFinishedLine } from "./footer.ts";
import { safeFallbackTheme, TpsMeter } from "./tps-meter.ts";

export { compactPrompt, renderLastPromptLine } from "./footer.ts";
export { TpsMeter } from "./tps-meter.ts";

export default function (pi: ExtensionAPI) {
  let lastUserPrompt = "";
  let footerEnabled = true;
  let lastLoopEndTime: Date | null = null;
  let lastLoopDurationMs: number | null = null;
  let currentLoopStartMs = 0;
  const tpsMeter = new TpsMeter();

  const installFooter = (ctx: ExtensionContext): void => {
    // Keep Pi's native footer active; this widget is purely incremental.
    ctx.ui.setFooter(undefined);
    ctx.ui.setWidget(
      "srp-footer",
      (_tui, theme) => {
        return {
          invalidate() {},
          dispose() {},
          render(width: number): string[] {
            return [
              ...renderLastPromptLine(lastUserPrompt, width),
              ...renderTimeAndFinishedLine(lastLoopEndTime, lastLoopDurationMs, width, theme),
            ];
          },
        };
      },
      { placement: "belowEditor" },
    );
  };

  const removeFooter = (ctx: ExtensionContext): void => {
    ctx.ui.setWidget("srp-footer", undefined);
    ctx.ui.setFooter(undefined);
  };

  pi.on("session_start", (_event, ctx) => {
    lastUserPrompt = "";
    currentLoopStartMs = 0;
    const info = getLastLoopInfoFromSession(ctx);
    lastLoopEndTime = info?.endTime ?? null;
    lastLoopDurationMs = info?.durationMs ?? null;
    footerEnabled = true;
    tpsMeter.enabled = true;
    tpsMeter.reset(ctx);

    if (ctx.mode === "tui") {
      // Restore native header & footer
      ctx.ui.setHeader(undefined);
      ctx.ui.setFooter(undefined);
      removeFooter(ctx);
    }
  });

  // Schedule resources_discover after session_start to position widget below powerline widgets
  pi.on("resources_discover", (_event, ctx) => {
    if (footerEnabled && ctx.mode === "tui") {
      installFooter(ctx);
    }
  });

  // event.prompt is expanded user input. It is absent for custom-message runs
  // (messageType === "custom"), e.g. extension-triggered auto-continue; keep the previous prompt then.
  pi.on("before_agent_start", (event) => {
    if (event.messageType === "user" && typeof event.prompt === "string") {
      lastUserPrompt = event.prompt;
    }
    currentLoopStartMs = Date.now();
  });

  // TPS monitoring and lifecycle hooks
  pi.on("message_start", (event, ctx) => {
    if (event.message.role !== "assistant") return;
    tpsMeter.onMessageStart(ctx);
  });

  pi.on("message_update", (event) => {
    if (event.message.role !== "assistant") return;
    tpsMeter.onMessageUpdate(event.assistantMessageEvent as { type: string; delta?: unknown });
  });

  pi.on("message_end", (event, ctx) => {
    if (event.message.role !== "assistant") return;
    const realOut = (event.message as { usage?: { output?: number } })?.usage?.output;
    tpsMeter.onMessageEnd(realOut, ctx);
  });

  pi.on("tool_execution_start", (_event, ctx) => {
    tpsMeter.onToolStart(ctx);
  });

  pi.on("tool_call", (_event, ctx) => {
    tpsMeter.onToolStart(ctx);
  });

  pi.on("turn_end", (_event, ctx) => {
    tpsMeter.onTurnEnd(ctx);
  });

  pi.on("agent_end", (_event, ctx) => {
    lastLoopEndTime = new Date();
    if (currentLoopStartMs > 0) {
      lastLoopDurationMs = Math.max(0, Date.now() - currentLoopStartMs);
    }
    tpsMeter.onAgentEnd(ctx);
  });

  pi.on("agent_settled", (_event, ctx) => {
    lastLoopEndTime = new Date();
    if (currentLoopStartMs > 0) {
      lastLoopDurationMs = Math.max(0, Date.now() - currentLoopStartMs);
    }
    tpsMeter.onAgentSettled(ctx);
  });

  pi.registerCommand("srp-theme", {
    description: "Toggle SRP prompt widget and TPS meter on/off",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const candidates: AutocompleteItem[] = [
        { value: "on", label: "on", description: "Enable prompt preview and TPS meter" },
        { value: "off", label: "off", description: "Disable prompt preview and TPS meter" },
      ];
      const filtered = candidates.filter((item) => item.value.startsWith(prefix.trimStart()));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx) => {
      const state = args.trim().toLowerCase();
      if (state !== "on" && state !== "off") {
        ctx.ui.notify("Usage: /srp-theme on|off", "info");
        return;
      }

      const enabled = state === "on";
      footerEnabled = enabled;
      tpsMeter.enabled = enabled;

      if (ctx.mode === "tui") {
        ctx.ui.setFooter(undefined);
        if (enabled) installFooter(ctx);
        else removeFooter(ctx);
      }

      if (enabled) {
        const theme = ctx.ui?.theme ?? safeFallbackTheme;
        ctx.ui.setStatus("tps", tpsMeter.renderFinal(theme));
      } else {
        tpsMeter.stopTick();
        ctx.ui.setStatus("tps", undefined);
      }
      ctx.ui.notify(`srp-theme: ${enabled ? "Enabled" : "Disabled"} prompt widget and TPS`, "info");
    },
  });
}
