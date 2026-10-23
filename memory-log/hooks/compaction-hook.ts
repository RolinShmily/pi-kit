import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { renderMemoryMap } from "../memory/index-render.ts";
import { listTopics, readJourney } from "../memory/paths.ts";
import type { Runtime } from "../runtime.ts";
import {
  buildCompactionProjection,
  entryIndexById,
  findLastCompactionIndex,
  isObservationsRecordedEntry,
  isSourceEntry,
  isValidCutPoint,
  rawTokensAfterIndex,
  renderSummary,
  type Entry,
} from "../ledger/index.ts";

/**
 * Completed boundaries behind the contiguous observation frontier. A later worker
 * finishing first must not authorize discarding an earlier failed/in-flight chunk.
 * Legacy records only have a cumulative watermark; retain that older contract.
 */
function chunkBoundaryIndices(branch: Entry[]): number[] {
  const indexes = entryIndexById(branch);
  const boundaries = new Set<number>();
  const coveredAt = new Map<string, number>();
  let legacyFrontier = -1;
  for (let i = 0; i < branch.length; i++) {
    const entry = branch[i];
    if (!isObservationsRecordedEntry(entry)) continue;
    const idx = indexes.get(entry.data.coversUpToId);
    if (idx === undefined || idx >= i || !isSourceEntry(branch[idx])) continue;
    if (entry.data.sourceEntryIds === undefined) {
      legacyFrontier = Math.max(legacyFrontier, idx);
    } else {
      const ids = entry.data.sourceEntryIds;
      // Reject unresolved, out-of-order, or non-source anchors.
      let previous = -1;
      const valid = ids.length > 0 && ids.at(-1) === entry.data.coversUpToId && ids.every((id) => {
        const index = indexes.get(id);
        if (index === undefined || index <= previous || index > idx || !isSourceEntry(branch[index])) return false;
        previous = index;
        return true;
      });
      if (!valid) continue;
      for (const id of ids) coveredAt.set(id, Math.min(coveredAt.get(id) ?? Infinity, idx));
    }
    boundaries.add(idx);
  }
  const safeBoundaries: number[] = [];
  let requiredCoverageEnd = -1;
  for (let i = 0; i < branch.length; i++) {
    if (isSourceEntry(branch[i])) {
      const coveredEnd = i <= legacyFrontier ? i : (coveredAt.get(branch[i].id) ?? Infinity);
      requiredCoverageEnd = Math.max(requiredCoverageEnd, coveredEnd);
    }
    // The projection must include the records that authorize this cut, not just
    // records for overlapping chunks whose watermarks lie beyond it.
    if (boundaries.has(i) && requiredCoverageEnd <= i) safeBoundaries.push(i);
  }
  return safeBoundaries;
}

/** First source entry after `boundaryIndex` that is a valid cut point, or undefined. */
function firstKeptAfterBoundary(branch: Entry[], boundaryIndex: number): Entry | undefined {
  for (let i = boundaryIndex + 1; i < branch.length; i++) {
    if (!isSourceEntry(branch[i])) continue;
    return isValidCutPoint(branch[i]) ? branch[i] : undefined;
  }
  return undefined;
}

export function snapCutoff(
  branch: Entry[],
  _proposedFirstKeptId: string,
  tailTokens: number,
): { firstKeptId: string | undefined; tail: number | undefined } {
  const indexes = entryIndexById(branch);
  const lastCompactionIdx = findLastCompactionIndex(branch);
  const boundaries = chunkBoundaryIndices(branch);
  let bestId: string | undefined;
  let bestTail: number | undefined;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const boundaryIndex of boundaries) {
    if (lastCompactionIdx !== -1 && boundaryIndex <= lastCompactionIdx) {
      continue;
    }
    const firstKept = firstKeptAfterBoundary(branch, boundaryIndex);
    if (!firstKept) continue;

    const firstKeptIdx = indexes.get(firstKept.id);
    if (lastCompactionIdx !== -1 && (firstKeptIdx === undefined || firstKeptIdx <= lastCompactionIdx)) {
      continue;
    }

    const tail = rawTokensAfterIndex(branch, boundaryIndex);
    const delta = Math.abs(tail - tailTokens);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestId = firstKept.id;
      bestTail = tail;
    }
  }

  let finalFirstKeptId = bestId;
  let finalTail = bestTail;

  // Defensive verification: ensure the returned firstKeptId is NEVER at or before any existing compaction entry on branch.
  if (finalFirstKeptId !== undefined) {
    const finalIdx = indexes.get(finalFirstKeptId);
    if (finalIdx === undefined || (lastCompactionIdx !== -1 && finalIdx <= lastCompactionIdx)) {
      finalFirstKeptId = undefined;
      finalTail = undefined;
    }
  }

  return { firstKeptId: finalFirstKeptId, tail: finalTail };
}

export function snapFirstKeptEntryId(branch: Entry[], proposedFirstKeptId: string, tailTokens: number): string | undefined {
  return snapCutoff(branch, proposedFirstKeptId, tailTokens).firstKeptId;
}

export function canSkipObserverWait(
  branch: Entry[],
  snappedFirstKeptId: string | undefined,
  snappedTail: number | undefined,
  tailTokens: number,
  observersInFlight: Iterable<{ coversUpToId: string }>,
): boolean {
  if (!snappedFirstKeptId || snappedTail === undefined || snappedTail > tailTokens) return false;

  const indexes = entryIndexById(branch);
  const cutoffIndex = indexes.get(snappedFirstKeptId);
  if (cutoffIndex === undefined) return false;

  for (const { coversUpToId } of observersInFlight) {
    const idx = indexes.get(coversUpToId);
    if (idx === undefined || idx < cutoffIndex) return false;
  }
  return true;
}

export function registerCompactionHook(pi: ExtensionAPI, runtime: Runtime): void {
  pi.on("session_before_compact", async (event: any, ctx: any) => {
    if (!runtime.enabled || runtime.config.passive) return undefined;
    if (event.signal?.aborted) return { cancel: true };

    const hasUI = ctx.hasUI;
    if (runtime.compactHookInFlight) {
      if (hasUI) ctx.ui.notify("memory-log: another compaction is already in progress, skipping duplicate trigger", "warning");
      return { cancel: true };
    }

    runtime.compactHookInFlight = true;
    try {
      runtime.ensureConfig(ctx.cwd);
      const tailTokens = runtime.config.tailTokens;
      const { firstKeptEntryId, tokensBefore } = event.preparation;

      let branch = (ctx.sessionManager?.getBranch?.() as Entry[] | undefined) ?? (event.branchEntries as Entry[]);
      let snap = snapCutoff(branch, firstKeptEntryId, tailTokens);

      const skip = canSkipObserverWait(branch, snap.firstKeptId, snap.tail, tailTokens, runtime.observersInFlight.values());
      runtime.lastCompactionObserverWait = skip ? "skipped" : "waited";
      if (!skip) {
        if (hasUI) ctx.ui.notify("memory-log: waiting for in-flight observers to finish before compaction...", "info");
        await runtime.whenObserversIdle();
        branch = (ctx.sessionManager?.getBranch?.() as Entry[] | undefined) ?? (event.branchEntries as Entry[]);
        snap = snapCutoff(branch, firstKeptEntryId, tailTokens);
      }

      if (event.signal?.aborted) return { cancel: true };
      if (!runtime.enabled) return undefined;

      // No proven observed cut: let Pi summarize the raw history, never stamp an
      // empty deterministic summary over unobserved messages (including old tails).
      const snapped = snap.firstKeptId;
      if (!snapped || snap.tail === undefined) {
        if (hasUI) ctx.ui.notify("memory-log: no safe observed cutoff — using Pi's native summarizer", "info");
        return undefined;
      }
      const projection = buildCompactionProjection(branch, snapped);
      const journey = readJourney(runtime.memoryRoot);
      const map = renderMemoryMap(listTopics(runtime.memoryRoot));
      const summary = renderSummary(journey, map, projection.observations);
      if (!summary.trim()) {
        if (hasUI) ctx.ui.notify("memory-log: memory summary is empty — using Pi's native summarizer", "info");
        return undefined;
      }

      return {
        compaction: {
          summary,
          firstKeptEntryId: snapped,
          tokensBefore,
          details: projection.details,
        },
      };
    } finally {
      runtime.compactHookInFlight = false;
    }
  });
}
