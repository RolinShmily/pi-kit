/**
 * image-generate — Image generation tool and model selector.
 *
 * Provides:
 * 1. Tool `image_generate`: Tool call for generating images with local disk persistence.
 *    Delegates generation to adapters in custom-providers/image (DashScope and OpenRouter).
 * 2. Command `/image-generate model`: Interactive model picker matching Pi's native model selector UI.
 */

import { type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Text, type AutocompleteItem } from "@earendil-works/pi-tui";
import { Type } from "typebox";

import {
  ensureCustomProviders,
  fetchAllAvailableImageModels,
  generateImage,
  resolveImageModel,
  type ImageModelDefinition,
} from "../custom-providers/index.ts";
import { saveImageAtomically } from "./files.ts";
/** Image catalog lookup and provider selection. */

export const DEFAULT_MODEL = "google/gemini-3.1-flash-image";

/** Image models known to Pi: OpenRouter's built-in catalog plus our DashScope registration. */
export function registryImageModels(ctx: { modelRegistry: { getModelsOfType(type: string): readonly any[] } }) {
  return ctx.modelRegistry.getModelsOfType("image") as readonly { id: string; name?: string; provider: string }[];
}

/** Resolve which provider owns a model id, preferring the Pi registry over heuristics. */
export function resolveProviderId(
  ctx: { modelRegistry: { getModelsOfType(type: string): readonly any[] } },
  modelId: string,
): string {
  const lower = modelId.toLowerCase();
  const known = registryImageModels(ctx).find((m) => m.id.toLowerCase() === lower);
  if (known) return known.provider;
  return lower.startsWith("qwen-image") ? "dashscope" : "openrouter";
}
import { SearchableImageModelSelectorComponent } from "./model-selector.ts";

const DEFAULT_TIMEOUT_MS = 120_000;

let currentModel = DEFAULT_MODEL;

// ============================ Extension Entrypoint ============================

export default function imageGenerate(pi: ExtensionAPI): void {
  ensureCustomProviders(pi);
  // 1. Slash command: /image-generate model [name]
  pi.registerCommand("image-generate", {
    description: "Switch default image generation model (/image-generate model [name])",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const trimmed = prefix.trimStart();
      if (!trimmed || "model".startsWith(trimmed)) {
        return [{ value: "model", label: "model", description: "Select image generation model in TUI" }];
      }
      return null;
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const sub = (parts[0] || "").toLowerCase();

      const models = await fetchAllAvailableImageModels(registryImageModels(ctx), ctx.signal);

      // Case: direct model slug provided
      if (sub === "model" && parts[1]) {
        const resolved = resolveImageModel(parts.slice(1).join(" "), models);
        currentModel = resolved;
        ctx.ui.notify(`Default image model set to: ${resolved}`, "info");
        return;
      }

      // Case: bare command or /image-generate model -> open interactive selector
      if (sub === "model" || parts.length === 0) {
        // Detect login status for each provider
        const loginStatusMap = new Map<string, boolean>();
        for (const m of models) {
          if (!loginStatusMap.has(m.provider)) {
            const key = await ctx.modelRegistry.getApiKeyForProvider(m.provider);
            loginStatusMap.set(
              m.provider,
              Boolean(key) || Boolean(process.env[`${m.provider.toUpperCase()}_API_KEY`]),
            );
          }
        }

        const chosenModel = await ctx.ui.custom<ImageModelDefinition | undefined>((tui, theme, _kb, done) => {
          return new SearchableImageModelSelectorComponent(
            tui,
            theme,
            "Select Image Generation Model",
            models,
            currentModel,
            (model) => done(model),
            () => done(undefined),
            (provider) => loginStatusMap.get(provider) ?? false,
          );
        });

        if (!chosenModel) return;

        currentModel = chosenModel.id;
        const isLogged = loginStatusMap.get(chosenModel.provider);
        const extra = isLogged ? "" : ` (No key detected: please run /login ${chosenModel.provider})`;
        ctx.ui.notify(`Default image model set to: ${chosenModel.name} (${chosenModel.id})${extra}`, "info");
        return;
      }

      // Unknown arguments: report usage instead of silently doing nothing
      ctx.ui.notify(
        `Unknown argument: ${parts.join(" ")}. Usage: /image-generate [model] [name]`,
        "warning",
      );
    },
  });

  // 2. Tool: image_generate (English Schema)
  pi.registerTool({
    name: "image_generate",
    description:
      "Generate an image from a text prompt using OpenRouter or DashScope. Saves the generated image to local disk and returns the file path.",
    parameters: Type.Object({
      prompt: Type.String({
        description: "The text prompt describing the image to generate.",
      }),
      model: Type.Optional(
        Type.String({
          description:
            "Optional model slug (e.g. 'google/gemini-3.1-flash-image', 'qwen-image-3.0-pro', 'black-forest-labs/flux.2-pro'). Defaults to current default model.",
        }),
      ),
      aspectRatio: Type.Optional(
        Type.String({
          description: "Optional aspect ratio for the image (e.g., '1:1', '16:9', '9:16', '4:3', '3:4').",
        }),
      ),
      image: Type.Optional(
        Type.String({
          description: "Optional local file path or remote image URL for image-to-image reference.",
        }),
      ),
    }),
    execute: async (_toolCallId, params, signal, ctx) => {
      const targetModel = params.model
        ? resolveImageModel(params.model, registryImageModels(ctx))
        : currentModel;
      const timeoutSig = AbortSignal.any([AbortSignal.timeout(DEFAULT_TIMEOUT_MS), ...(signal ? [signal] : [])]);

      const providerId = resolveProviderId(ctx, targetModel);
      const apiKey =
        (await ctx.modelRegistry.getApiKeyForProvider(providerId)) ||
        process.env[`${providerId.toUpperCase()}_API_KEY`];

      if (!apiKey) {
        return {
          content: [
            {
              type: "text",
              text: `Error: No ${providerId} API key found. Please run '/login ${providerId}' or set ${providerId.toUpperCase()}_API_KEY environment variable.`,
            },
          ],
          isError: true,
        };
      }

      try {
        const res = await generateImage(
          {
            prompt: params.prompt,
            model: targetModel,
            aspectRatio: params.aspectRatio,
            image: params.image,
            cwd: ctx.cwd,
          },
          { apiKey, provider: providerId, signal: timeoutSig, cwd: ctx.cwd },
        );

        const savedPath = await saveImageAtomically(ctx.cwd, res.buffer, res.mimeType);

        return {
          content: [
            {
              type: "text",
              text: `Image successfully generated using '${res.model}'.\nSaved to: ${savedPath}`,
            },
          ],
          details: {
            model: res.model,
            provider: res.provider,
            savedPath,
            prompt: params.prompt,
            revisedPrompt: res.revisedPrompt,
          },
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text",
              text: `Image generation failed: ${err?.message ?? String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
    renderCall(args, theme) {
      const { prompt, model } = args as { prompt?: string; model?: string };
      const displayModel = model || currentModel;
      const preview = prompt ? (prompt.length > 50 ? prompt.slice(0, 47) + "..." : prompt) : "";
      return new Text(
        theme.fg("toolTitle", theme.bold("generate_image ")) +
          theme.fg("dim", `[${displayModel}] `) +
          theme.fg("accent", `"${preview}"`),
      );
    },
  });
}
