import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { VisionCandidate } from "./index.ts";
import { combinedSignal, readBounded } from "./network.ts";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_TOKENS = 8192;
const REQUEST_TIMEOUT_MS = 90_000;

async function parseChatResponse(response: Response): Promise<string> {
  const raw = (await readBounded(response, MAX_RESPONSE_BYTES)).toString("utf8");
  if (!(response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    let json: any;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`Vision model returned invalid JSON: ${raw.slice(0, 200)}`);
    }
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content
        .map((part) => (typeof part === "string" ? part : part?.text ?? ""))
        .join("")
        .trim();
    }
    return String(json?.choices?.[0]?.message?.reasoning_content ?? "").trim();
  }

  let text = "";
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const delta = JSON.parse(payload)?.choices?.[0]?.delta;
      const content = delta?.content ?? delta?.reasoning_content;
      if (typeof content === "string") text += content;
    } catch {}
  }
  return text.trim();
}

export async function callOpenAICompatible(
  ctx: ExtensionContext,
  candidate: VisionCandidate,
  dataUri: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const registered = ctx.modelRegistry.getProvider(candidate.provider);
  const resolved = await ctx.modelRegistry.getProviderAuth(candidate.provider);
  const apiKey = resolved?.auth.apiKey;
  if (!apiKey) {
    throw new Error(`No API key found for provider "${candidate.provider}". Run /login ${candidate.provider} first.`);
  }

  const baseUrl = (resolved.auth.baseUrl || registered?.baseUrl)?.replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error(`Provider "${candidate.provider}" has no base URL configured.`);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  for (const source of [registered?.headers, resolved.auth.headers]) {
    for (const [key, value] of Object.entries(source ?? {})) {
      if (typeof value === "string") headers[key] = value;
    }
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: candidate.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        },
      ],
      max_tokens: MAX_TOKENS,
    }),
    signal: combinedSignal(REQUEST_TIMEOUT_MS, signal),
  });

  if (!response.ok) {
    const errorBody = (await readBounded(response, 16 * 1024)).toString("utf8");
    throw new Error(`HTTP ${response.status}: ${errorBody.slice(0, 300)}`);
  }
  const text = await parseChatResponse(response);
  if (!text) throw new Error("Vision model returned an empty response.");
  return text;
}

export async function callPiNative(
  ctx: ExtensionContext,
  candidate: VisionCandidate,
  dataUri: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const model = ctx.modelRegistry.find(candidate.provider, candidate.model);
  if (!model) {
    throw new Error(`Model ${candidate.provider}/${candidate.model} not found in modelRegistry.`);
  }
  const auth = await ctx.modelRegistry.getProviderAuth(candidate.provider);
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Failed to parse image data URI.");
  const [, mimeType, base64Data] = match;

  const { completeSimple } = await import("@earendil-works/pi-ai/compat");
  const response = await completeSimple(
    model,
    {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image", data: base64Data, mimeType },
          ],
          timestamp: Date.now(),
        },
      ],
    },
    {
      apiKey: auth?.auth.apiKey,
      headers: auth?.auth.headers,
      signal: combinedSignal(REQUEST_TIMEOUT_MS, signal),
      maxTokens: MAX_TOKENS,
    },
  );

  if (response.stopReason === "error") {
    throw new Error(response.errorMessage || "Vision model request failed.");
  }

  const text = response.content
    ?.filter((c: any) => c.type === "text")
    ?.map((c: any) => c.text)
    ?.join("\n")
    ?.trim();

  if (!text) throw new Error("Vision model returned an empty response.");
  return text;
}
