import assert from "node:assert/strict";
import test from "node:test";
import { chatProviders } from "./chat/index.ts";
import { magpieChatProvider, refreshMagpieModels } from "./chat/magpie.ts";

test("magpie-lan provider registration and naming", () => {
  assert.ok(chatProviders["magpie-lan"], "magpie-lan provider must be registered in chatProviders");
  assert.equal(chatProviders.magpie, undefined, "legacy magpie key must not be present in chatProviders");
  assert.equal(magpieChatProvider.name, "magpie-lan");
});

test("model refresh skips network fetch when no API key is provided", async () => {
  const originalLanKey = process.env.MAGPIE_LAN_GATEWAY_KEY;
  const originalKey = process.env.MAGPIE_GATEWAY_KEY;
  const originalLanApiKey = process.env.MAGPIE_LAN_API_KEY;
  const originalApiKey = process.env.MAGPIE_API_KEY;
  delete process.env.MAGPIE_LAN_GATEWAY_KEY;
  delete process.env.MAGPIE_GATEWAY_KEY;
  delete process.env.MAGPIE_LAN_API_KEY;
  delete process.env.MAGPIE_API_KEY;

  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called when no API key is provided");
  }) as typeof fetch;

  try {
    // Check that apiKey is undefined when no env var is present
    assert.equal(magpieChatProvider.apiKey, undefined, "apiKey must be undefined when no API key is provided");

    // Call refreshMagpieModels with allowNetwork: true and no credential
    const models = await refreshMagpieModels({
      allowNetwork: true,
      baseUrl: "http://127.0.0.1:3425/v1",
      signal: new AbortController().signal,
      stored: {
        models: [
          {
            id: "cached-model",
            name: "Cached Model",
            provider: "magpie-lan",
            type: "chat",
            api: "openai-completions",
            baseUrl: "http://127.0.0.1:3425/v1",
            contextWindow: 128000,
            maxTokens: 8192,
            input: ["text"],
            reasoning: false,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          },
        ],
      },
      publish: async () => {},
    } as any);

    assert.equal(fetchCalled, false, "fetch must not be called when no API key is configured");
    assert.equal(models.length, 1);
    assert.equal(models[0].id, "cached-model");
    assert.equal(models[0].provider, "magpie-lan");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLanKey !== undefined) process.env.MAGPIE_LAN_GATEWAY_KEY = originalLanKey;
    if (originalKey !== undefined) process.env.MAGPIE_GATEWAY_KEY = originalKey;
    if (originalLanApiKey !== undefined) process.env.MAGPIE_LAN_API_KEY = originalLanApiKey;
    if (originalApiKey !== undefined) process.env.MAGPIE_API_KEY = originalApiKey;
  }
});

test("model refresh pulls model list when API key is provided via env var", async () => {
  const originalLanKey = process.env.MAGPIE_LAN_GATEWAY_KEY;
  process.env.MAGPIE_LAN_GATEWAY_KEY = "test-lan-secret";

  let requestedUrl = "";
  let authHeader = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    requestedUrl = String(url);
    authHeader = (init?.headers as Record<string, string>)?.Authorization ?? "";
    return new Response(JSON.stringify({
      data: [
        {
          id: "magpie/test-model",
          display_name: "Test Model",
          context_window: 64000,
          max_output_tokens: 4096,
        },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    assert.equal(magpieChatProvider.apiKey, "$MAGPIE_LAN_GATEWAY_KEY");

    let publishedModels: any[] = [];
    const models = await refreshMagpieModels({
      allowNetwork: true,
      baseUrl: "http://127.0.0.1:3425/v1",
      signal: new AbortController().signal,
      stored: undefined,
      publish: async (data: any) => {
        publishedModels = data.persist.models;
      },
    } as any);

    assert.equal(requestedUrl, "http://127.0.0.1:3425/v1/models");
    assert.equal(authHeader, "Bearer test-lan-secret");
    assert.equal(models.length, 1);
    assert.equal(models[0].id, "magpie/test-model");
    assert.equal(publishedModels.length, 1);
    assert.equal(publishedModels[0].provider, "magpie-lan");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLanKey !== undefined) process.env.MAGPIE_LAN_GATEWAY_KEY = originalLanKey;
    else delete process.env.MAGPIE_LAN_GATEWAY_KEY;
  }
});

test("model refresh pulls model list when API key is provided via context.credential", async () => {
  const originalLanKey = process.env.MAGPIE_LAN_GATEWAY_KEY;
  const originalKey = process.env.MAGPIE_GATEWAY_KEY;
  delete process.env.MAGPIE_LAN_GATEWAY_KEY;
  delete process.env.MAGPIE_GATEWAY_KEY;

  let authHeader = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    authHeader = (init?.headers as Record<string, string>)?.Authorization ?? "";
    return new Response(JSON.stringify({
      data: [
        {
          id: "magpie/login-model",
          display_name: "Login Model",
        },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    assert.equal(magpieChatProvider.apiKey, undefined);

    let publishedModels: any[] = [];
    const models = await refreshMagpieModels({
      allowNetwork: true,
      baseUrl: "http://127.0.0.1:3425/v1",
      credential: { type: "api_key", key: "stored-auth-json-key" },
      signal: new AbortController().signal,
      stored: undefined,
      publish: async (data: any) => {
        publishedModels = data.persist.models;
      },
    } as any);

    assert.equal(authHeader, "Bearer stored-auth-json-key");
    assert.equal(models.length, 1);
    assert.equal(models[0].id, "magpie/login-model");
    assert.equal(publishedModels[0].provider, "magpie-lan");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLanKey !== undefined) process.env.MAGPIE_LAN_GATEWAY_KEY = originalLanKey;
    if (originalKey !== undefined) process.env.MAGPIE_GATEWAY_KEY = originalKey;
  }
});

test("model refresh gracefully falls back to cached models on network failure when cached models exist", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("Connection refused (gateway offline)");
  }) as typeof fetch;

  try {
    const cachedModel = {
      id: "cached-model",
      name: "Cached Model",
      provider: "magpie", // legacy provider name
      type: "chat" as const,
      api: "openai-completions" as const,
      baseUrl: "http://127.0.0.1:3425/v1",
      contextWindow: 128000,
      maxTokens: 8192,
      input: ["text" as const],
      reasoning: false,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };

    const models = await refreshMagpieModels({
      allowNetwork: true,
      baseUrl: "http://127.0.0.1:3425/v1",
      credential: { type: "api_key", key: "some-key" },
      signal: new AbortController().signal,
      stored: { models: [cachedModel] },
      publish: async () => {},
    } as any);

    assert.equal(models.length, 1);
    assert.equal(models[0].id, "cached-model");
    assert.equal(models[0].provider, "magpie-lan", "cached model should be migrated to magpie-lan");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
