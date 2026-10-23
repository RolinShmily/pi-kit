import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { combinedSignal, readBounded, validateRemoteUrl } from "./network.ts";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};
const SUPPORTED_MIMES = new Set(Object.values(MIME_MAP));

function detectMime(buffer: Buffer): string | undefined {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
    buffer.subarray(0, 6).toString("ascii") === "GIF89a"
  ) {
    return "image/gif";
  }
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.subarray(0, 2).toString("ascii") === "BM") return "image/bmp";
  return undefined;
}

async function fetchRemoteImage(url: string, signal: AbortSignal): Promise<{ buffer: Buffer; mime: string }> {
  let current = await validateRemoteUrl(url);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: { Accept: "image/png,image/jpeg,image/webp,image/gif,image/bmp" },
      signal,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`Image redirect missing Location header: HTTP ${response.status}`);
      if (redirects === MAX_REDIRECTS) throw new Error("Too many image redirects.");
      current = await validateRemoteUrl(new URL(location, current).href);
      continue;
    }
    if (!response.ok) throw new Error(`Failed to fetch image: HTTP ${response.status} ${response.statusText}`);

    const mime = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
    if (!SUPPORTED_MIMES.has(mime)) throw new Error(`Unsupported remote image MIME type: ${mime || "unknown"}`);
    return { buffer: await readBounded(response, MAX_IMAGE_BYTES), mime };
  }
  throw new Error("Too many image redirects.");
}

export async function readImage(image: string, cwd: string, signal?: AbortSignal): Promise<string> {
  const trimmed = image.trim();
  if (!trimmed) throw new Error("Image path or URL cannot be empty.");

  let buffer: Buffer;
  let mime: string;
  if (/^https?:\/\//i.test(trimmed)) {
    ({ buffer, mime } = await fetchRemoteImage(trimmed, combinedSignal(30_000, signal)));
  } else {
    const filePath = resolve(cwd, trimmed);
    const expectedMime = MIME_MAP[extname(filePath).toLowerCase()];
    if (!expectedMime) throw new Error(`Unsupported image file extension: ${extname(filePath) || "none"}`);
    const fileStat = await stat(filePath);
    if (fileStat.size > MAX_IMAGE_BYTES) throw new Error("Image file exceeds 10 MiB limit.");
    buffer = await readFile(filePath);
    mime = expectedMime;
  }

  const detected = detectMime(buffer);
  if (!detected || detected !== mime) {
    throw new Error(`Image content does not match MIME type (expected ${mime}, detected ${detected ?? "unknown"}).`);
  }
  return `data:${mime};base64,${buffer.toString("base64")}`;
}
