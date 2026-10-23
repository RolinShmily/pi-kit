/**
 * web-reach — Lightweight web search and extraction extension for Pi.
 *
 * Injects `web_search` and `web_fetch` tools by default:
 * 1. web_search: Keyless Exa MCP web search returning structured snippets with source URLs.
 * 2. web_fetch : Multi-tier web content extraction engine:
 *    - Next.js RSC (React Server Components) static data parsing;
 *    - Semantic HTML to Markdown conversion;
 *    - PDF document detection and text extraction;
 *    - Automatic fallback to Jina Reader for JS-rendered pages;
 *    - Pretty-printed JSON formatting.
 */

import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { searchWeb } from "./search.ts";
import { fetchUrl } from "./page.ts";

export { searchWeb } from "./search.ts";
export { fetchUrl } from "./page.ts";

export default function (pi: ExtensionAPI) {
  // Register web_search tool
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web using Exa MCP without an API key. Returns high-quality search results with titles, source URLs, and text snippets. Ideal for real-time information, latest news, and research; use web_fetch on result URLs to inspect full pages.",
    parameters: Type.Object({
      query: Type.String({ minLength: 1, description: "Search query, as specific as possible." }),
    }),
    async execute(_toolCallId, params, signal) {
      const { text, provider } = await searchWeb(params.query, signal);
      return { content: [{ type: "text", text }], details: { provider } };
    },
    renderCall(args, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      const { query } = args as { query?: string };
      const display = query && query.length > 60 ? query.slice(0, 57) + "..." : query || "";
      text.setText(
        theme.fg("toolTitle", theme.bold("search ")) + theme.fg("accent", `"${display}"`),
      );
      return text;
    },
  });

  // Register web_fetch tool
  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description:
      "Intelligently fetch and extract content from a web page. Automatically extracts main content and converts to structured Markdown (supports Next.js RSC parsing, PDF extraction, semantic HTML-to-Markdown, and falls back to Jina Reader for JS-rendered pages). Suitable for in-depth reading of documentation and web pages.",
    parameters: Type.Object({
      url: Type.String({ description: "Target http(s) URL." }),
      mode: Type.Optional(
        Type.Enum(
          { readable: "readable", raw: "raw" },
          { description: "readable: intelligently extract Markdown (default); raw: return raw content." },
        ),
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const mode = params.mode as "readable" | "raw" | undefined;
      const { text, title, contentType, status, engine } = await fetchUrl(params.url, { mode }, signal);
      const header = title ? `# ${title}\n\nSource: ${params.url} (Engine: ${engine})\n\n---\n\n` : "";
      return {
        content: [{ type: "text", text: header + text }],
        details: { contentType, status, engine, title, chars: text.length },
      };
    },
    renderCall(args, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      const { url } = args as { url?: string };
      const display = url && url.length > 70 ? url.slice(0, 67) + "..." : url || "";
      text.setText(
        theme.fg("toolTitle", theme.bold("fetch ")) + theme.fg("accent", display),
      );
      return text;
    },
  });
}
