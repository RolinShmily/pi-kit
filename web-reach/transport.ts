export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 web-reach/2.0";

const MAX_RETURN_CHARS = 35_000;

export function envNum(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ============================ Timeout & Helpers ============================

export function withTimeout(
  ms: number,
  label: string,
  signal?: AbortSignal,
): { ac: AbortController; done: () => void } {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error(`${label} timed out (${ms / 1000}s)`)), ms);
  const onAbort = () => ac.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  return {
    ac,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

export function truncate(text: string, limit = MAX_RETURN_CHARS): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + `\n\n...(content truncated to ${limit} characters)`;
}
