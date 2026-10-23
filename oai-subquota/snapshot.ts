import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface LimitWindow {
  usedPercent: number;
  leftPercent: number;
  windowSeconds?: number;
  resetAt?: number;
  resetAfterSeconds?: number;
}

export interface RateLimit {
  id: string;
  name: string;
  primary?: LimitWindow;
  secondary?: LimitWindow;
}

export interface CreditsSnapshot {
  hasCredits?: boolean;
  unlimited?: boolean;
  balance?: number | string;
}

export interface ResetsSnapshot {
  availableCount?: number;
  applicableCount?: number;
}

export interface AccountSnapshot {
  email?: string;
  plan?: string;
  accountId?: string;
}

export interface CodexUsageSnapshot {
  source: "api" | "headers" | "cache";
  fetchedAt: string;
  account: AccountSnapshot;
  defaultLimit?: RateLimit;
  credits?: CreditsSnapshot;
  resets?: ResetsSnapshot;
}

export function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function normalizeResetAt(val: unknown): number | undefined {
  if (typeof val !== "number" || !Number.isFinite(val) || val <= 0) return undefined;
  return val > 10_000_000_000 ? Math.round(val / 1000) : val;
}

function normalizeWindow(val: unknown, nowMs = Date.now()): LimitWindow | undefined {
  if (!isRecord(val)) return undefined;

  const rawUsed = typeof val.used_percent === "number" ? val.used_percent : val.usedPercent;
  if (typeof rawUsed !== "number" || !Number.isFinite(rawUsed) || rawUsed < 0) return undefined;

  const usedPercent = Math.min(100, Math.max(0, rawUsed));
  const leftPercent = Math.max(0, Math.min(100, 100 - usedPercent));

  const resetAt = normalizeResetAt(val.reset_at ?? val.resetAt);
  const rawAfter = typeof val.reset_after_seconds === "number" ? val.reset_after_seconds : val.resetAfterSeconds;
  const resetAfterSeconds =
    typeof rawAfter === "number" && Number.isFinite(rawAfter) && rawAfter >= 0
      ? rawAfter
      : resetAt !== undefined
        ? Math.max(0, Math.round(resetAt - nowMs / 1000))
        : undefined;

  const rawSec = typeof val.limit_window_seconds === "number" ? val.limit_window_seconds : val.windowSeconds;
  const rawMin = typeof val.window_minutes === "number" ? val.window_minutes : val.windowMinutes;
  const windowSeconds =
    typeof rawSec === "number" && rawSec > 0
      ? rawSec
      : typeof rawMin === "number" && rawMin > 0
        ? rawMin * 60
        : undefined;

  return {
    usedPercent,
    leftPercent,
    ...(windowSeconds !== undefined ? { windowSeconds } : {}),
    ...(resetAt !== undefined ? { resetAt } : {}),
    ...(resetAfterSeconds !== undefined ? { resetAfterSeconds } : {}),
  };
}

function parseCredits(val: unknown): CreditsSnapshot | undefined {
  if (!isRecord(val)) return undefined;
  const hasCredits = val.has_credits === true;
  const unlimited = val.unlimited === true;
  const rawBalance = val.balance;
  const balance =
    typeof rawBalance === "number"
      ? rawBalance
      : typeof rawBalance === "string"
        ? Number(rawBalance.trim())
        : undefined;

  return {
    hasCredits,
    unlimited,
    ...(balance !== undefined && Number.isFinite(balance) ? { balance } : {}),
  };
}

function parseResets(val: unknown): ResetsSnapshot | undefined {
  if (!isRecord(val)) return undefined;
  const available = typeof val.available_count === "number" ? val.available_count : undefined;
  const applicable = typeof val.applicable_available_count === "number" ? val.applicable_available_count : undefined;
  if (available === undefined && applicable === undefined) return undefined;
  return {
    ...(available !== undefined ? { availableCount: available } : {}),
    ...(applicable !== undefined ? { applicableCount: applicable } : {}),
  };
}

export function parseUsageApiResponse(data: unknown, tokenAccount: AccountSnapshot): CodexUsageSnapshot {
  if (!isRecord(data)) throw new Error("Usage API returned non-object response");

  const rateLimit = isRecord(data.rate_limit) ? data.rate_limit : undefined;
  const primary = normalizeWindow(rateLimit?.primary_window);
  const secondary = normalizeWindow(rateLimit?.secondary_window);

  const email = (typeof data.email === "string" && data.email) || tokenAccount.email;
  const plan = (typeof data.plan_type === "string" && data.plan_type) || tokenAccount.plan;
  const accountId = (typeof data.account_id === "string" && data.account_id) || tokenAccount.accountId;

  return {
    source: "api",
    fetchedAt: new Date().toISOString(),
    account: { email, plan, accountId },
    defaultLimit: {
      id: "codex",
      name: "Codex",
      ...(primary ? { primary } : {}),
      ...(secondary ? { secondary } : {}),
    },
    credits: parseCredits(data.credits),
    resets: parseResets(data.rate_limit_reset_credits),
  };
}

export function parseCodexRateLimitHeaders(headers: Record<string, string>): CodexUsageSnapshot | undefined {
  const norm: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) norm[k.toLowerCase()] = String(v);

  const num = (name: string): number | undefined => {
    const v = norm[name];
    if (v === undefined || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const bool = (name: string): boolean | undefined => {
    const v = norm[name]?.trim().toLowerCase();
    return v === "true" || v === "1" ? true : v === "false" || v === "0" ? false : undefined;
  };

  const primaryUsed = num("x-codex-primary-used-percent");
  const secondaryUsed = num("x-codex-secondary-used-percent");
  if (primaryUsed === undefined && secondaryUsed === undefined) return undefined;

  const primary = normalizeWindow({
    used_percent: primaryUsed,
    window_minutes: num("x-codex-primary-window-minutes"),
    reset_at: normalizeResetAt(num("x-codex-primary-reset-at")),
  });
  const secondary = normalizeWindow({
    used_percent: secondaryUsed,
    window_minutes: num("x-codex-secondary-window-minutes"),
    reset_at: normalizeResetAt(num("x-codex-secondary-reset-at")),
  });

  return {
    source: "headers",
    fetchedAt: new Date().toISOString(),
    account: {},
    defaultLimit: {
      id: "codex",
      name: "Codex",
      ...(primary ? { primary } : {}),
      ...(secondary ? { secondary } : {}),
    },
    credits: {
      hasCredits: bool("x-codex-credits-has-credits"),
      unlimited: bool("x-codex-credits-unlimited"),
      balance: num("x-codex-credits-balance"),
    },
  };
}

export function mergeSnapshots(existing: CodexUsageSnapshot | undefined, update: CodexUsageSnapshot): CodexUsageSnapshot {
  if (!existing) return update;
  const defaultLimit = update.defaultLimit ?? existing.defaultLimit;
  if (defaultLimit && existing.defaultLimit) {
    defaultLimit.primary = update.defaultLimit?.primary ?? existing.defaultLimit.primary;
    defaultLimit.secondary = update.defaultLimit?.secondary ?? existing.defaultLimit.secondary;
  }
  return {
    ...existing,
    ...update,
    account: { ...existing.account, ...update.account },
    ...(defaultLimit ? { defaultLimit } : {}),
    credits: update.credits ?? existing.credits,
    resets: update.resets ?? existing.resets,
  };
}

const JWT_AUTH_CLAIM = "https://api.openai.com/auth";
const JWT_PROFILE_CLAIM = "https://api.openai.com/profile";

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  const part = token.split(".")[1];
  if (!part) return undefined;
  try {
    const json = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return isRecord(json) ? json : undefined;
  } catch {
    return undefined;
  }
}

export function extractAccountFromToken(token: string): AccountSnapshot {
  const payload = decodeJwtPayload(token);
  if (!payload) return {};

  const auth = isRecord(payload[JWT_AUTH_CLAIM]) ? payload[JWT_AUTH_CLAIM] : undefined;
  const profile = isRecord(payload[JWT_PROFILE_CLAIM]) ? payload[JWT_PROFILE_CLAIM] : undefined;

  const accountId = typeof auth?.chatgpt_account_id === "string" ? auth.chatgpt_account_id : undefined;
  const plan = typeof auth?.chatgpt_plan_type === "string" ? auth.chatgpt_plan_type : undefined;
  const email =
    (typeof profile?.email === "string" && profile.email) ||
    (typeof payload.email === "string" && payload.email) ||
    undefined;

  return { accountId, plan, email };
}

const USAGE_ENDPOINT = "https://chatgpt.com/backend-api/wham/usage";
const REQUEST_TIMEOUT_MS = 15_000;

export async function queryUsage(accessToken: string, accountId?: string): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "codex-cli",
    Accept: "application/json",
  };
  if (accountId) headers["ChatGPT-Account-Id"] = accountId;

  const res = await fetch(USAGE_ENDPOINT, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.status === 401 || res.status === 403) throw new Error(`Authentication rejected (HTTP ${res.status}). Please run /login openai-codex.`);
  if (res.status === 429) throw new Error("Rate limit exceeded for usage endpoint (HTTP 429). Please try again later.");
  if (!res.ok) throw new Error(`Usage request failed (HTTP ${res.status}).`);

  const body = await res.json();
  if (!isRecord(body)) throw new Error("Invalid JSON received from usage endpoint.");
  return body;
}

function getCachePath(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir() || ".", ".cache");
  return join(base, "oai-subquota", "usage.json");
}

export async function readCachedSnapshot(): Promise<CodexUsageSnapshot | undefined> {
  try {
    const raw = await readFile(getCachePath(), "utf8");
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? (parsed as unknown as CodexUsageSnapshot) : undefined;
  } catch {
    return undefined;
  }
}

export async function writeCachedSnapshot(snapshot: CodexUsageSnapshot): Promise<void> {
  try {
    const file = getCachePath();
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  } catch {
    // Non-fatal if filesystem is read-only
  }
}
