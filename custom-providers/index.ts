/**
 * Register custom providers through Pi's native model and /login APIs.
 * Organizes models and providers by Pi's core model types: chat, image, classifier, and asr.
 * Credentials belong in Pi's auth.json, not here.
 */

import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import { chatProviders } from "./chat/index.ts";
import { imageProviders } from "./image/index.ts";
import { classifierProviders } from "./classifier/index.ts";
import { asrProviders } from "./asr/index.ts";

export { asrProviders, ALL_ASR_MODELS, createAsrProvider, type AsrModelDefinition, type StreamingAsrProvider } from "./asr/index.ts";
export { imageProviders, fetchAllAvailableImageModels, generateImage, resolveImageModel, type ImageModelDefinition } from "./image/index.ts";

const BATCH_LOCK_KEY = "__piCustomProvidersBatchLock";

export function ensureCustomProviders(pi: ExtensionAPI): void {
  const g = globalThis as Record<string, unknown>;
  if (g[BATCH_LOCK_KEY]) return;
  g[BATCH_LOCK_KEY] = true;
  setTimeout(() => {
    g[BATCH_LOCK_KEY] = false;
  }, 0).unref?.();

  const providerIds = new Set<string>([
    ...Object.keys(chatProviders),
    ...Object.keys(imageProviders),
    ...Object.keys(classifierProviders),
    ...Object.keys(asrProviders),
  ]);

  for (const id of providerIds) {
    const chat = chatProviders[id];
    const image = imageProviders[id];
    const classifier = classifierProviders[id];
    const asr = asrProviders[id];

    const config: ProviderConfig = {
      name: chat?.name ?? image?.name ?? classifier?.name ?? asr?.name ?? id,
      baseUrl: chat?.baseUrl ?? image?.baseUrl ?? classifier?.baseUrl,
      api: (chat?.api ?? "openai-completions") as any,
      ...(chat?.apiKey ? { apiKey: chat.apiKey } : {}),
      ...(chat?.refreshModels ? { refreshModels: chat.refreshModels } : {}),
      models: [
        ...(chat?.models ?? []),
        ...(image?.models ?? []),
        ...(classifier?.models ?? []),
      ],
      ...(image?.images || chat?.images || classifier?.images
        ? { images: { ...chat?.images, ...image?.images, ...classifier?.images } }
        : {}),
      ...(classifier?.classifiers || chat?.classifiers || image?.classifiers
        ? { classifiers: { ...chat?.classifiers, ...image?.classifiers, ...classifier?.classifiers } }
        : {}),
    };

    pi.registerProvider(id, config);
  }
}

export default function customProviders(pi: ExtensionAPI): void {
  ensureCustomProviders(pi);
}
