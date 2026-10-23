import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// ============================ Prompt Preview Widget ============================

const POWERLINE_SEP_ANSI = "\x1b[38;5;244m";
const ANSI_RESET = "\x1b[0m";

/** Compact a multiline prompt into a single line, matching powerline's last-prompt behavior. */
export function compactPrompt(prompt: string | null | undefined): string {
  // Custom-message runs (extension `sendMessage`, auto-continue, retries) have no user prompt.
  if (typeof prompt !== "string") return "";
  return prompt.replace(/\s+/g, " ").trim();
}

/**
 * Render last prompt line using powerline's sep color (ANSI 244), displaying '↳ prompt'.
 */
export function renderLastPromptLine(
  lastUserPrompt: string | null | undefined,
  width: number,
): string[] {
  const compact = compactPrompt(lastUserPrompt);
  const prefix = ` ${POWERLINE_SEP_ANSI}↳${ANSI_RESET} `;
  const availableWidth = width - visibleWidth(prefix);

  if (!compact || availableWidth < 10) return [];

  return [
    truncateToWidth(
      `${prefix}${POWERLINE_SEP_ANSI}${truncateToWidth(compact, availableWidth, "…")}${ANSI_RESET}`,
      width,
      "…",
    ),
  ];
}



// ============================ Incremental Time / Finished Widget ============================

// const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// type ClockVariant = "full" | "month_day" | "time_only";
type FinishedVariant = "full" | "compact" | "duration_only";

function formatDuration(ms: number): string {
  if (ms < 0) return "0.0s";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600_000) {
    const totalSecs = Math.round(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}m${secs < 10 ? "0" : ""}${secs}s`;
  }
  const totalMins = Math.round(ms / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `${hours}h${mins < 10 ? "0" : ""}${mins}m`;
}

/*
// 时间胶囊格式化已注释停用
function formatFooterClockVariant(date: Date, variant: ClockVariant): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  if (variant === "time_only") return `[${hours}:${minutes}]`;

  const month = pad(date.getMonth() + 1);
  const dayOfMonth = pad(date.getDate());
  if (variant === "month_day") return `[${month}-${dayOfMonth} ${hours}:${minutes}]`;

  return `[${date.getFullYear()}-${month}-${dayOfMonth} ${WEEK_DAYS[date.getDay()]} ${hours}:${minutes}]`;
}
*/

function formatLoopEndVariant(
  finished: Date,
  now: Date,
  durationMs: number | null,
  variant: FinishedVariant,
): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  const hasDuration = typeof durationMs === "number" && durationMs >= 0;

  if (variant === "duration_only") {
    return hasDuration ? `X ${formatDuration(durationMs)}` : "X";
  }

  const isCrossYear = finished.getFullYear() !== now.getFullYear();
  const isCrossDay =
    finished.getMonth() !== now.getMonth() || finished.getDate() !== now.getDate();
  const dateOrTime = isCrossYear
    ? `${finished.getFullYear()}`
    : isCrossDay
      ? `${pad(finished.getMonth() + 1)}-${pad(finished.getDate())}`
      : `${pad(finished.getHours())}:${pad(finished.getMinutes())}`;

  const details = hasDuration ? `${formatDuration(durationMs)} ${dateOrTime}` : dateOrTime;
  return `X ${details}`;
}

export function getLastLoopInfoFromSession(ctx: ExtensionContext): {
  endTime: Date;
  durationMs: number | null;
} | null {
  try {
    const entries = ctx.sessionManager?.getEntries?.() ?? [];
    let assistantIndex = -1;
    let endTime: Date | null = null;

    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i] as any;
      if (entry?.type !== "message" || entry?.message?.role !== "assistant" || !entry?.timestamp) continue;
      const timestamp = new Date(entry.timestamp);
      if (!Number.isNaN(timestamp.getTime())) {
        assistantIndex = i;
        endTime = timestamp;
        break;
      }
    }

    if (!endTime || assistantIndex < 0) return null;

    let durationMs: number | null = null;
    for (let i = assistantIndex - 1; i >= 0; i--) {
      const entry = entries[i] as any;
      if (entry?.type !== "message" || entry?.message?.role !== "user" || !entry?.timestamp) continue;
      const startTime = new Date(entry.timestamp);
      if (!Number.isNaN(startTime.getTime())) {
        const duration = endTime.getTime() - startTime.getTime();
        durationMs = duration >= 0 ? duration : null;
        break;
      }
    }

    return { endTime, durationMs };
  } catch {
    return null;
  }
}

export function renderTimeAndFinishedLine(
  lastLoopEndTime: Date | null,
  lastLoopDurationMs: number | null,
  width: number,
  theme: Theme,
): string[] {
  if (!lastLoopEndTime) return [];

  const now = new Date();
  const candidates: string[] = [];

  const fullFinished = formatLoopEndVariant(lastLoopEndTime, now, lastLoopDurationMs, "full");
  const compactFinished = formatLoopEndVariant(lastLoopEndTime, now, lastLoopDurationMs, "compact");
  const durationFinished = formatLoopEndVariant(lastLoopEndTime, now, lastLoopDurationMs, "duration_only");

  candidates.push(fullFinished);
  if (compactFinished !== fullFinished) {
    candidates.push(compactFinished);
  }
  if (durationFinished && durationFinished !== compactFinished && durationFinished !== fullFinished) {
    candidates.push(durationFinished);
  }

  /*
  // 时间胶囊（已禁用/注释，仅保留 agent-loop 完成时间和用时）：
  if (lastLoopEndTime) {
    candidates.push(
      `${fullFinished} ${formatFooterClockVariant(now, "full")}`,
      `${fullFinished} ${formatFooterClockVariant(now, "month_day")}`,
      `${fullFinished} ${formatFooterClockVariant(now, "time_only")}`,
    );
    if (compactFinished !== fullFinished) {
      candidates.push(`${compactFinished} ${formatFooterClockVariant(now, "time_only")}`);
    }
    if (durationFinished && durationFinished !== compactFinished && durationFinished !== fullFinished) {
      candidates.push(`${durationFinished} ${formatFooterClockVariant(now, "time_only")}`);
    }
  } else {
    candidates.push(
      formatFooterClockVariant(now, "full"),
      formatFooterClockVariant(now, "month_day"),
      formatFooterClockVariant(now, "time_only"),
    );
  }
  */

  const content = candidates.find((candidate) => visibleWidth(candidate) <= width) ?? candidates.at(-1)!;
  const line = truncateToWidth(content, width, "…");
  return [theme.fg("dim", line)];
}
