/**
 * model-vision — Image understanding extension for Pi.
 *
 * Registers the `model_vision` tool to analyze local or remote images
 * using a vision model and return a textual description.
 */

import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateHead,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { readImage } from "./image.ts";
import { callOpenAICompatible, callPiNative } from "./requests.ts";

/**
 * Configure your default vision model(s) here.
 * The first available model in the chain will be used; subsequent ones act as fallbacks.
 * Supported protocols: "pi-native" (Antigravity/built-in) or "openai-completions".
 */
export const DEFAULT_VISION_MODELS: Array<{
  provider: string;
  model: string;
  protocol?: "pi-native" | "openai-completions";
}> = [
  { provider: "antigravity", model: "gemini-3.8-flash", protocol: "pi-native" },
  { provider: "shuaiapi", model: "gpt-6-luna", protocol: "openai-completions" },
];

export type VisionCandidate = {
  provider: string;
  model: string;
  protocol?: "pi-native" | "openai-completions";
};

export function getVisionCandidates(): VisionCandidate[] {
  const models = DEFAULT_VISION_MODELS as VisionCandidate[] | VisionCandidate;
  const list = Array.isArray(models) ? models : [models];
  return list.map((c) => ({
    ...c,
    protocol: c.protocol ?? (c.provider === "antigravity" ? "pi-native" : "openai-completions"),
  }));
}

const DEFAULT_PROMPT =
  "Describe this image in detail: transcribe any visible text verbatim, describe visual elements, layout, colors, and note any errors, anomalies, or important details.";

export async function analyzeImage(
  image: string,
  promptText: string | undefined,
  cwd: string,
  ctx: ExtensionContext,
  signal?: AbortSignal,
): Promise<{ text: string; model: string; provider: string; truncated: boolean }> {
  const candidates = getVisionCandidates();
  if (!candidates.length) throw new Error("No vision models configured.");

  const dataUri = await readImage(image, cwd, signal);
  const prompt = promptText?.trim() || DEFAULT_PROMPT;
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const text =
        candidate.protocol === "pi-native"
          ? await callPiNative(ctx, candidate, dataUri, prompt, signal)
          : await callOpenAICompatible(ctx, candidate, dataUri, prompt, signal);
      const output = truncateHead(text, { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES });
      return {
        text: output.content,
        model: candidate.model,
        provider: candidate.provider,
        truncated: output.truncated,
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      errors.push(`${candidate.provider}/${candidate.model}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`All vision models failed: ${errors.join("; ")}`);
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "model_vision",
    label: "model_vision",
    description:
      "Analyze an image using a vision model and return a textual description. Supports local PNG/JPEG/WebP/GIF/BMP file paths or public http(s) URLs. Use prompt to specify OCR, error diagnosis, UI inspection, or detailed description.",
    parameters: Type.Object({
      image: Type.String({
        minLength: 1,
        description: "Local image path (relative to cwd or absolute) or public http(s) URL",
      }),
      prompt: Type.Optional(
        Type.String({
          description: "Specific question or instruction for the vision model",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await analyzeImage(params.image, params.prompt, ctx.cwd, ctx, signal);
      return {
        content: [{ type: "text", text: result.text }],
        details: {
          model: result.model,
          provider: result.provider,
          truncated: result.truncated,
        },
      };
    },
    renderCall(args, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      const { image } = args as { image?: string };
      const display = image && image.length > 50 ? "..." + image.slice(-47) : image || "";
      text.setText(theme.fg("toolTitle", theme.bold("model_vision ")) + theme.fg("accent", display));
      return text;
    },
  });
}
