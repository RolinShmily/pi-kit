import { envNum, truncate, withTimeout } from "./transport.ts";

const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
const EXA_SEARCH_TOOL = "web_search_exa";

interface ExaMcpResponse {
  result?: {
    content?: Array<{ type?: string; text?: string }>;
    isError?: boolean;
  };
  error?: { code?: number; message?: string };
}

function parseExaResponse(body: string): ExaMcpResponse | undefined {
  for (const line of body.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    try {
      const parsed = JSON.parse(payload) as ExaMcpResponse;
      if (parsed.result || parsed.error) return parsed;
    } catch {
      /* continue to next SSE event */
    }
  }
  try {
    const parsed = JSON.parse(body) as ExaMcpResponse;
    return parsed.result || parsed.error ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function searchWeb(
  query: string,
  signal?: AbortSignal,
): Promise<{ text: string; provider: string }> {
  query = query.trim();
  if (!query) throw new Error("Search query cannot be empty.");
  const { ac, done } = withTimeout(
    envNum("SRP_WEB_SEARCH_TIMEOUT_MS", 60_000),
    "Search request timed out",
    signal,
  );
  try {
    const res = await fetch(`${EXA_MCP_URL}?tools=${EXA_SEARCH_TOOL}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "x-exa-source": "web-reach",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: EXA_SEARCH_TOOL, arguments: { query, numResults: 6 } },
      }),
      signal: ac.signal,
    });
    const body = await res.text();
    if (!res.ok) {
      const hint = res.status === 429 ? " (Exa free tier rate limit reached; please try again later)" : "";
      throw new Error(`Exa MCP HTTP ${res.status}${hint}: ${body.slice(0, 300)}`);
    }

    const payload = parseExaResponse(body);
    if (!payload) throw new Error("Exa MCP returned an unparseable response.");
    if (payload.error) {
      throw new Error(
        `Exa MCP error${payload.error.code ? ` ${payload.error.code}` : ""}: ${payload.error.message ?? "Unknown error"}`,
      );
    }

    const text = payload.result?.content
      ?.find((item) => item.type === "text" && item.text?.trim())
      ?.text?.trim();
    if (payload.result?.isError || !text) {
      throw new Error(text || "Exa MCP returned empty content.");
    }
    return { text: truncate(text), provider: "exa-mcp" };
  } finally {
    done();
  }
}
