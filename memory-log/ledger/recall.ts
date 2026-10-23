import { foldLedger } from "./fold.ts";
import { entryIndexById, isSourceEntry } from "./progress.ts";
import { serializeSourceAddressedBranchEntries } from "./serialize.ts";
import { isObservationsRecordedEntry, type Entry, type Observation } from "./types.ts";

export type RecalledObservationSource = {
  observation: Observation;
  status: "active" | "dropped";
  provenance: "explicit" | "inferred";
  coversUpToId: string;
  sourceEntryIds: string[];
  missingSourceEntryIds: string[];
  renderedSource: string;
};

export type RecallResult =
  | { ok: true; match: RecalledObservationSource }
  | { ok: false; status: "invalid_query" | "not_found" | "ambiguous" | "source_unavailable"; reason: string };

/**
 * Recover the source chunk for a timestamp-id on this branch only. Observations
 * share chunk-level provenance, not individual sentence-level citations.
 */
export function recallObservationSource(branch: Entry[], timestampQuery: string): RecallResult {
  const query = timestampQuery.trim();
  if (!query || query.length > 100) {
    return { ok: false, status: "invalid_query", reason: "Supply an observation timestamp or a unique timestamp prefix (1–100 characters)." };
  }

  const indexes = entryIndexById(branch);
  const folded = foldLedger(branch);
  const records = branch.flatMap((entry, recordIndex) =>
    isObservationsRecordedEntry(entry) ? [{ data: entry.data, recordIndex }] : [],
  );
  // Keep the same first-valid-record-wins rule as foldLedger, even when a record
  // was replayed or observers committed in a different order from their chunks.
  const candidates = new Map<string, { observation: Observation; record: typeof records[number] }>();
  for (const record of records) {
    for (const observation of record.data.observations) {
      if (observation.timestamp.startsWith(query) && !candidates.has(observation.timestamp)) {
        candidates.set(observation.timestamp, { observation, record });
      }
    }
  }
  if (candidates.size === 0) {
    return { ok: false, status: "not_found", reason: `No observation matches "${query}" on the current branch.` };
  }
  const chosen = candidates.get(query) ?? (candidates.size === 1 ? candidates.values().next().value : undefined);
  if (!chosen) {
    return {
      ok: false,
      status: "ambiguous",
      reason: `Ambiguous timestamp prefix: ${[...candidates.keys()].slice(0, 5).join(", ")}. Supply the full timestamp.`,
    };
  }

  const { observation, record } = chosen;
  const end = indexes.get(record.data.coversUpToId);
  let requestedIds: string[];
  const provenance = record.data.sourceEntryIds === undefined ? "inferred" : "explicit";
  if (record.data.sourceEntryIds !== undefined) {
    requestedIds = [...new Set(record.data.sourceEntryIds)];
  } else {
    if (end === undefined || end >= record.recordIndex || !isSourceEntry(branch[end])) {
      return { ok: false, status: "source_unavailable", reason: "The legacy coverage anchor is unavailable on this branch; its source range cannot be inferred safely." };
    }
    // Infer old chunks by SOURCE order, not completion order. This is best-effort:
    // old records cannot prove the exact start if a preceding worker failed.
    let start = -1;
    for (const other of records) {
      const index = indexes.get(other.data.coversUpToId);
      if (index !== undefined && index < end && index < other.recordIndex && isSourceEntry(branch[index])) {
        start = Math.max(start, index);
      }
    }
    requestedIds = branch.slice(start + 1, end + 1).filter(isSourceEntry).map((entry) => entry.id);
  }

  const missing = new Set<string>();
  const sourceEntries: Entry[] = [];
  for (const id of requestedIds) {
    const index = indexes.get(id);
    if (index === undefined || index >= record.recordIndex || (end !== undefined && index > end) || !isSourceEntry(branch[index])) {
      missing.add(id);
    } else {
      sourceEntries.push(branch[index]);
    }
  }
  sourceEntries.sort((a, b) => indexes.get(a.id)! - indexes.get(b.id)!);
  const { text: renderedSource, sourceEntryIds } = serializeSourceAddressedBranchEntries(sourceEntries);
  // Empty/unrenderable entries must not be reported as successfully recovered.
  const renderedIds = new Set(sourceEntryIds);
  for (const entry of sourceEntries) if (!renderedIds.has(entry.id)) missing.add(entry.id);
  if (end === undefined) missing.add(record.data.coversUpToId);
  if (!renderedSource) {
    return { ok: false, status: "source_unavailable", reason: "No renderable source conversation is available for this observation on the current branch." };
  }

  return {
    ok: true,
    match: {
      observation,
      status: folded.droppedObservationTimestamps.has(observation.timestamp) ? "dropped" : "active",
      provenance,
      coversUpToId: record.data.coversUpToId,
      sourceEntryIds,
      missingSourceEntryIds: [...missing],
      renderedSource,
    },
  };
}
