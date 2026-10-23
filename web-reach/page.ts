import { DEFAULT_USER_AGENT, envNum, truncate, withTimeout } from "./transport.ts";
import { extractRSCContent } from "./rsc.ts";
import { extractTitleFromHtml, htmlToMarkdown, isLikelyJSRendered } from "./html.ts";

const JINA_READER_BASE = "https://r.jina.ai/";

export async function fetchViaJinaReader(
  url: string,
  signal?: AbortSignal,
): Promise<{ text: string; title: string } | null> {
  const { ac, done } = withTimeout(30_000, "Jina Reader timed out", signal);
  try {
    const res = await fetch(`${JINA_READER_BASE}${url}`, {
      headers: {
        Accept: "text/markdown",
        "X-No-Cache": "true",
        "User-Agent": DEFAULT_USER_AGENT,
      },
      signal: ac.signal,
    });
    if (!res.ok) return null;

    const raw = await res.text();
    const contentIndex = raw.indexOf("Markdown Content:");
    const markdown = contentIndex >= 0 ? raw.slice(contentIndex + 17).trim() : raw.trim();

    if (
      markdown.length < 80 ||
      markdown.startsWith("Loading...") ||
      markdown.startsWith("Please enable JavaScript")
    ) {
      return null;
    }

    const titleMatch = markdown.match(/^#+\s+(.+)$/m);
    const title = titleMatch?.[1]?.trim() || "";

    return { text: markdown, title };
  } catch {
    return null;
  } finally {
    done();
  }
}

export function isPdfUrl(url: string, contentType?: string): boolean {
  if (contentType?.includes("application/pdf")) return true;
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

export async function extractPdfBuffer(
  buffer: ArrayBuffer,
  url: string,
): Promise<{ text: string; title: string }> {
  try {
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const maxPages = Math.min(pdf.numPages, 80);
    const pages: string[] = [];

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: unknown) => (item as { str?: string }).str || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (pageText) pages.push(`--- Page ${i} ---\n${pageText}`);
    }

    const title = new URL(url).pathname.split("/").pop() || "PDF Document";
    const text = `# ${title}\n\nPages: ${pdf.numPages}\n\n${pages.join("\n\n")}`;
    return { text, title };
  } catch {
    // Fallback plain text extraction
    const text = Buffer.from(buffer).toString("latin1").replace(/[^\x20-\x7E\n\r\t]/g, " ");
    return {
      text: `# PDF Document\n\n${text.slice(0, 8000)}`,
      title: "PDF Document",
    };
  }
}

const MIN_USEFUL_CONTENT_LENGTH = 300;

export async function fetchUrl(
  url: string,
  opts: { mode?: "readable" | "raw" } = {},
  signal?: AbortSignal,
): Promise<{ text: string; title: string; contentType: string; status: number; engine: string }> {
  const mode = opts.mode ?? "readable";
  const { ac, done } = withTimeout(
    envNum("SRP_WEB_FETCH_TIMEOUT_MS", 20_000),
    "Web fetch timed out",
    signal,
  );

  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,text/plain,*/*;q=0.8",
      },
      signal: ac.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const maxBytes = envNum("SRP_WEB_FETCH_MAX_BYTES", 4 * 1024 * 1024);
    const arrayBuf = await res.arrayBuffer();

    if (arrayBuf.byteLength > maxBytes) {
      throw new Error(`Content exceeds ${Math.round((maxBytes / 1024 / 1024) * 10) / 10} MiB limit.`);
    }

    // 1. PDF extraction
    if (isPdfUrl(url, contentType)) {
      const { text, title } = await extractPdfBuffer(arrayBuf, url);
      return { text: truncate(text), title, contentType, status: res.status, engine: "unpdf" };
    }

    const body = Buffer.from(arrayBuf).toString("utf8");

    // 2. Raw mode
    if (mode === "raw") {
      return {
        text: truncate(body),
        title: extractTitleFromHtml(body) || url,
        contentType,
        status: res.status,
        engine: "raw",
      };
    }

    // 3. JSON formatting
    if (contentType.includes("json")) {
      try {
        const text = JSON.stringify(JSON.parse(body), null, 2);
        return { text: truncate(text), title: "JSON Response", contentType, status: res.status, engine: "json" };
      } catch {
        return { text: truncate(body), title: "JSON", contentType, status: res.status, engine: "text" };
      }
    }

    // 4. HTML processing
    if (contentType.includes("html") || contentType.includes("xhtml")) {
      // 4.1 Attempt Next.js RSC extraction
      const rsc = extractRSCContent(body);
      if (rsc && rsc.content.length >= MIN_USEFUL_CONTENT_LENGTH) {
        return {
          text: truncate(rsc.content),
          title: rsc.title || extractTitleFromHtml(body),
          contentType,
          status: res.status,
          engine: "nextjs-rsc",
        };
      }

      // 4.2 Semantic HTML to Markdown
      const title = extractTitleFromHtml(body);
      const markdown = htmlToMarkdown(body);

      if (markdown.length >= MIN_USEFUL_CONTENT_LENGTH && !isLikelyJSRendered(body)) {
        return {
          text: truncate(markdown),
          title,
          contentType,
          status: res.status,
          engine: "html-markdown",
        };
      }

      // 4.3 Dynamic JS page or short content: attempt Jina Reader fallback
      const jina = await fetchViaJinaReader(url, signal);
      if (jina && jina.text.length >= 100) {
        return {
          text: truncate(jina.text),
          title: jina.title || title,
          contentType: "text/markdown",
          status: res.status,
          engine: "jina-reader",
        };
      }

      return {
        text: truncate(markdown || body.slice(0, 4000)),
        title,
        contentType,
        status: res.status,
        engine: "html-fallback",
      };
    }

    // 5. Plain text and other types
    return {
      text: truncate(body),
      title: url.split("/").pop() || "Plain Text",
      contentType,
      status: res.status,
      engine: "text",
    };
  } finally {
    done();
  }
}
