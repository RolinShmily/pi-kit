/**
 * tui-asr — Terminal streaming ASR voice dictation extension for Pi.
 *
 * Features:
 *   1. Streaming ASR: Real-time recognition using Aliyun DashScope Paraformer WebSocket.
 *   2. Visual metering: Animated braille volume level waveform (● ⣀⣄ listening…).
 *   3. Native Pi auth: Resolves keys from `/login dashscope` (auth.json) or DASHSCOPE_API_KEY.
 *   4. Model selector: Native Pi-style searchable TUI selector dialog (/asr model).
 *   5. Input injection: Directly inserts text into active editor or clipboard.
 *
 * Keybindings:
 *   - Alt+M: Start / Stop voice dictation
 *   - Alt+N: Cancel current dictation
 *
 * Commands:
 *   - /asr: Toggle voice dictation
 *   - /asr model [name]: Interactive searchable model selector
 */

import { type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { ALL_ASR_MODELS, createDictationController, ensureCustomProviders, resolveProviderApiKey, type AsrModelDefinition } from "./dictation.ts";
import { SearchableAsrModelSelectorComponent } from "./model-selector.ts";

/** Default startup ASR model ID */
const DEFAULT_ASR_MODEL = "paraformer-realtime-v2";

/** Default shortcuts */
const TOGGLE_SHORTCUTS = ["alt+m"];
const CANCEL_SHORTCUTS = ["alt+n"];

export default function (pi: ExtensionAPI) {
  ensureCustomProviders(pi);
  let activeModel = DEFAULT_ASR_MODEL;

  // TUI state
  let tuiHandle: any = null;
  let removeInputListener: (() => void) | null = null;
  let lastCtx: ExtensionContext | null = null;

  const dictation = createDictationController(() => activeModel, () => tuiHandle);
  const { startDictation, stopDictation, cancelDictation, toggleDictation, cleanup } = dictation;

  // Key interception
  const ensureTuiAttached = (ctx: ExtensionContext) => {
    lastCtx = ctx;
    if (ctx.mode === "tui" && !removeInputListener && typeof ctx.ui?.onTerminalInput === "function") {
      removeInputListener = ctx.ui.onTerminalInput((keyData) => {
        const matchesAny = (list: string[]) =>
          list.some((s) => {
            const raw = s.toLowerCase().trim();
            if (raw === "alt+m" && (keyData === "\x1bm" || keyData === "Âµ")) return true;
            if (raw === "alt+n" && (keyData === "\x1bn" || keyData === "Å")) return true;
            return false;
          });

        if (matchesAny(TOGGLE_SHORTCUTS)) {
          if (dictation.state === "idle") startDictation(ctx);
          else if (dictation.state === "recording") stopDictation();
          return true;
        }

        if (matchesAny(CANCEL_SHORTCUTS)) {
          if (dictation.state !== "idle") {
            cancelDictation();
            return true;
          }
        }

        return undefined;
      });
    }
  };

  pi.on("session_start", (_event, ctx) => {
    ensureTuiAttached(ctx);
    if (ctx.mode === "tui") {
      ctx.ui.setWidget("tui-asr-handle", (tui: any) => {
        tuiHandle = tui;
        return {
          render: () => [],
          invalidate: () => {},
          dispose: () => {
            tuiHandle = null;
          },
        };
      });
    }
  });

  // Register shortcuts
  pi.registerShortcut("alt+m", {
    description: "Toggle voice dictation (tui-asr)",
    handler: async (ctx) => {
      ensureTuiAttached(ctx);
      await toggleDictation(ctx);
    },
  });

  pi.registerShortcut("alt+n", {
    description: "Cancel voice dictation (tui-asr)",
    handler: async (ctx) => {
      ensureTuiAttached(ctx);
      cancelDictation();
    },
  });

  // Register command /asr
  pi.registerCommand("asr", {
    description: "Voice dictation control and model switching (/asr [model])",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const trimmed = prefix.trimStart();
      if (!trimmed || "model".startsWith(trimmed)) {
        return [{ value: "model", label: "model", description: "Select ASR voice model in TUI" }];
      }
      return null;
    },
    handler: async (args, ctx) => {
      ensureTuiAttached(ctx);
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const sub = parts[0]?.toLowerCase();

      if (sub === "model") {
        const modelArg = parts[1]?.toLowerCase();
        if (modelArg) {
          const matched = ALL_ASR_MODELS.find(
            (m) =>
              m.id.toLowerCase() === modelArg ||
              m.name.toLowerCase() === modelArg ||
              m.id.toLowerCase().includes(modelArg),
          );
          if (matched) {
            activeModel = matched.id;
            const isLogged = Boolean(await resolveProviderApiKey(matched.provider, ctx));
            const extra = isLogged ? "" : ` (No key detected: please run /login ${matched.provider})`;
            ctx.ui.notify(`ASR model switched to: ${matched.name} (${matched.id})${extra}`, "info");
            return;
          }
        }

        // Open searchable model selector TUI
        const loginStatusMap = new Map<string, boolean>();
        for (const item of ALL_ASR_MODELS) {
          if (!loginStatusMap.has(item.provider)) {
            const key = await resolveProviderApiKey(item.provider, ctx);
            loginStatusMap.set(item.provider, Boolean(key));
          }
        }

        const selected = await ctx.ui.custom<AsrModelDefinition | undefined>((tui, theme, _kb, done) => {
          return new SearchableAsrModelSelectorComponent(
            tui,
            theme,
            ALL_ASR_MODELS,
            activeModel,
            (model) => done(model),
            () => done(undefined),
            (provider) => loginStatusMap.get(provider) ?? false,
          );
        });

        if (!selected) return;

        activeModel = selected.id;
        const isLogged = loginStatusMap.get(selected.provider);
        const extra = isLogged ? "" : ` (No key detected: please run /login ${selected.provider})`;
        ctx.ui.notify(`ASR model switched to: ${selected.name} (${selected.id})${extra}`, "info");
        return;
      }

      // Default action: toggle dictation
      await toggleDictation(ctx);
    },
  });

  pi.on("session_shutdown", () => {
    if (dictation.state !== "idle") cleanup();
    removeInputListener?.();
    removeInputListener = null;
  });
}
