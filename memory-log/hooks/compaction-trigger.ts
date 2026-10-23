import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  findLastCompactionIndex,
  rawTokensAfterIndex,
  rawTokensSinceLastCompaction,
  type Entry,
} from "../ledger/index.ts";
import type { Runtime } from "../runtime.ts";

export function contextPressureTokens(
  ctx: { getContextUsage?: () => { tokens: number | null } | undefined; sessionManager: { getBranch: () => Entry[] } },
  threshold: number,
): { tokens: number; due: boolean } {
  const branch = ctx.sessionManager.getBranch();
  if (branch.length === 0) return { tokens: 0, due: false };

  // If the last entry on the branch is already a compaction, context was just compacted on this branch.
  const lastEntry = branch[branch.length - 1];
  if (lastEntry.type === "compaction") {
    return { tokens: 0, due: false };
  }

  const lastCompactionIdx = findLastCompactionIndex(branch);
  if (lastCompactionIdx !== -1) {
    // If no new source entries exist after compaction, context has not grown since compaction.
    const tokensSinceCompaction = rawTokensAfterIndex(branch, lastCompactionIdx);
    if (tokensSinceCompaction === 0) {
      return { tokens: 0, due: false };
    }

    // Check if any assistant message has responded after the compaction.
    // In Pi, getContextUsage() returns tokens: null until an assistant message responds post-compaction.
    let hasAssistantAfterCompaction = false;
    for (let i = branch.length - 1; i > lastCompactionIdx; i--) {
      const entry = branch[i];
      if (entry.type === "message" && (entry.message as any)?.role === "assistant") {
        hasAssistantAfterCompaction = true;
        break;
      }
    }
    if (!hasAssistantAfterCompaction) {
      return { tokens: 0, due: false };
    }
  }

  const live = ctx.getContextUsage?.()?.tokens;
  if (live != null) {
    return { tokens: live, due: live >= threshold };
  }

  const raw = rawTokensSinceLastCompaction(branch);
  return { tokens: raw, due: raw >= threshold };
}

/**
 * agent_end is not idle: Pi may still retry or drain queued work. agent_settled
 * is the final boundary, so no retry guessing, timers, or idle polling is needed.
 */
export function registerCompactionTrigger(pi: ExtensionAPI, runtime: Runtime): void {
  pi.on("agent_settled", (event, ctx) => {
    if (event.aborted || !runtime.enabled || runtime.config.passive) return;
    if (runtime.compactInFlight || runtime.compactHookInFlight) return;
    // Another handler may already have started work at this notification boundary.
    if (!ctx.isIdle() || ctx.hasPendingMessages()) return;
    if (!contextPressureTokens(ctx, runtime.config.compactAtContextTokens).due) return;

    runtime.compactInFlight = true;
    try {
      if (ctx.hasUI) ctx.ui.notify("memory-log: context threshold reached — compacting (waiting for pending observers if needed)...", "info");
      // compact() is callback-based. Do not await session idle from this handler.
      ctx.compact({
        onComplete: () => {
          runtime.compactInFlight = false;
          if (ctx.hasUI) ctx.ui.notify("memory-log: compaction completed", "info");
        },
        onError: (error) => {
          runtime.compactInFlight = false;
          if (error.message !== "Compaction cancelled" && ctx.hasUI) ctx.ui.notify(`memory-log: ${error.message}`, "error");
        },
      });
    } catch (error) {
      runtime.compactInFlight = false;
      const message = error instanceof Error ? error.message : String(error);
      if (ctx.hasUI) ctx.ui.notify(`memory-log: compaction trigger failed — ${message}`, "error");
    }
  });
}
