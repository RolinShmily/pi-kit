import type { ExtensionCommandContext, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Text, visibleWidth } from "@earendil-works/pi-tui";
import type { CodexUsageSnapshot, LimitWindow } from "./snapshot.ts";

const USAGE_SETTINGS_URL = "https://chatgpt.com/codex/settings/usage";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pct(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "?%";
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function padLabel(label: string, width = 28): string {
  return `${label}:`.padEnd(width, " ");
}

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatReset(resetAt: number | undefined, now = new Date()): string {
  if (!resetAt) return "";
  const reset = new Date(resetAt * 1000);
  if (!Number.isFinite(reset.getTime())) return "";
  const time = formatTime(reset);
  if (sameDay(reset, now)) return `resets ${time}`;
  const date = `${reset.getDate()} ${MONTH_NAMES[reset.getMonth()]}`;
  return reset.getFullYear() === now.getFullYear() ? `resets ${time} on ${date}` : `resets ${time} on ${date} ${reset.getFullYear()}`;
}

export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return "";
  const rounded = Math.round(seconds);
  const days = Math.floor(rounded / 86_400);
  const hours = Math.floor((rounded % 86_400) / 3600);
  const mins = Math.floor((rounded % 3600) / 60);
  if (days > 0) return `${days}d${hours ? `${hours}h` : ""}`;
  if (hours > 0) return `${hours}h${mins ? `${mins}m` : ""}`;
  return `${mins || 1}m`;
}

function resetSeconds(window: LimitWindow | undefined, now: Date): number | undefined {
  if (!window) return undefined;
  if (window.resetAfterSeconds !== undefined) return window.resetAfterSeconds;
  return window.resetAt !== undefined ? Math.max(0, Math.round(window.resetAt - now.getTime() / 1000)) : undefined;
}

export function bar(leftPercent: number | undefined, width = 20): string {
  const left = Math.max(0, Math.min(100, leftPercent ?? 0));
  const filled = Math.max(0, Math.min(width, Math.round((left / 100) * width)));
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
}

function formatWindowLine(label: string, window: LimitWindow | undefined, now: Date): string | undefined {
  if (!window) return undefined;
  const reset = formatReset(window.resetAt, now) || (formatDuration(window.resetAfterSeconds) ? `resets in ${formatDuration(window.resetAfterSeconds)}` : "");
  const suffix = reset ? ` (${reset})` : "";
  return `${padLabel(label)}${bar(window.leftPercent)} ${pct(window.leftPercent)} left${suffix}`;
}

function formatCreditsLine(snapshot: CodexUsageSnapshot): string | undefined {
  const c = snapshot.credits;
  if (!c) return undefined;
  if (c.unlimited) return `${padLabel("Credits")}unlimited`;
  if (c.balance !== undefined) {
    const val = Number(c.balance);
    if (!Number.isFinite(val) || val <= 0) return undefined;
    return `${padLabel("Credits")}${Math.floor(val).toLocaleString()} credits`;
  }
  return c.hasCredits ? `${padLabel("Credits")}available` : undefined;
}

function formatResetsLine(snapshot: CodexUsageSnapshot): string | undefined {
  const count = snapshot.resets?.availableCount;
  return typeof count === "number" && count > 0 ? `${padLabel("Resets")}${count} available` : undefined;
}

export function formatStatusline(snapshot: CodexUsageSnapshot, now = new Date()): string {
  const parts: string[] = [];
  const primary = snapshot.defaultLimit?.primary;
  const secondary = snapshot.defaultLimit?.secondary;

  if (primary) {
    parts.push(`5h:${pct(primary.leftPercent)}`);
  }

  if (secondary) {
    parts.push(`7d:${pct(secondary.leftPercent)}`);
    const r7d = formatDuration(resetSeconds(secondary, now));
    if (r7d) parts.push(`↺ ${r7d}`);
  }

  return parts.length > 0 ? parts.join(" ") : "unavailable";
}

function makeBox(lines: string[], reqWidth?: number): string {
  const contentWidth = Math.max(...lines.map((l) => visibleWidth(l)), 1);
  const width = Math.max(contentWidth, reqWidth ?? 0);
  const top = `╭${"─".repeat(width + 2)}╮`;
  const bottom = `╰${"─".repeat(width + 2)}╯`;
  const body = lines.map((l) => `│ ${l}${" ".repeat(Math.max(0, width - visibleWidth(l)))} │`);
  return [top, ...body, bottom].join("\n");
}

export function formatBoxedStatus(snapshot: CodexUsageSnapshot, now = new Date()): string {
  const lines: string[] = [
    ">_ Codex usage",
    "",
    `Visit ${USAGE_SETTINGS_URL} for up-to-date`,
    "information on rate limits and credits",
    "",
  ];

  const acct: string[] = [];
  if (snapshot.account.email) acct.push(snapshot.account.email);
  if (snapshot.account.plan) acct.push(`(${snapshot.account.plan[0]?.toUpperCase()}${snapshot.account.plan.slice(1)})`);
  if (acct.length > 0) lines.push(`${padLabel("Account")}${acct.join(" ")}`);
  if (snapshot.fetchedAt) lines.push(`${padLabel("Updated")}${new Date(snapshot.fetchedAt).toLocaleString()}`);
  lines.push("");

  const p = formatWindowLine("5h limit", snapshot.defaultLimit?.primary, now);
  const s = formatWindowLine("Weekly limit", snapshot.defaultLimit?.secondary, now);
  if (p) lines.push(p);
  if (s) lines.push(s);

  const credits = formatCreditsLine(snapshot);
  if (credits) lines.push(credits);

  const resets = formatResetsLine(snapshot);
  if (resets) lines.push(resets);

  return makeBox(lines);
}

function colorForLeft(left: number): "success" | "warning" | "error" {
  return left >= 60 ? "success" : left >= 25 ? "warning" : "error";
}

function colorizeStatusLine(line: string, theme: Theme): string {
  let out = line;
  const match = line.match(/(\[[█░]+\])\s+(\d+(?:\.\d+)?)% left/);
  if (match?.[1] && match[2]) {
    const barText = match[1];
    const pctText = match[2];
    const color = colorForLeft(Number(pctText) || 0);
    out = out.replace(barText, theme.fg(color, barText));
    out = out.replace(`${pctText}% left`, theme.fg(color, `${pctText}% left`));
  }
  out = out.replace(">_ Codex usage", theme.fg("accent", theme.bold(">_ Codex usage")));
  out = out.replace(/(Account|Updated|5h limit|Weekly limit|Credits|Resets):/g, (lbl) => theme.fg("muted", lbl));
  out = out.replace(/(Visit https:\/\/chatgpt\.com\/codex\/settings\/usage for up-to-date|information on rate limits and credits)/g, (txt) => theme.fg("dim", txt));

  if (out.startsWith("╭") || out.startsWith("╰")) return theme.fg("dim", out);
  if (out.startsWith("│") && out.endsWith("│")) {
    return `${theme.fg("dim", out[0] ?? "")}${out.slice(1, -1)}${theme.fg("dim", out.at(-1) ?? "")}`;
  }
  return out;
}

export function renderStatusMessage(message: { content: string }, _opt: unknown, theme: Theme): Text {
  return new Text(message.content.split("\n").map((l) => colorizeStatusLine(l, theme)).join("\n"), 0, 0);
}

export function dimText(ctx: ExtensionContext | ExtensionCommandContext, text: string): string {
  try {
    return ctx.ui?.theme?.fg ? ctx.ui.theme.fg("dim", text) : text;
  } catch {
    return text;
  }
}

/**
 * Format quota text for Pi's shared extension-status row.
 * It must stay compact because Pi combines all extension statuses before
 * applying the footer width limit.
 */
export function formatRightAlignedStatusline(snapshot: CodexUsageSnapshot, now = new Date()): string {
  return formatStatusline(snapshot, now);
}
