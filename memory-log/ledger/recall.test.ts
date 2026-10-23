import test from "node:test";
import assert from "node:assert/strict";
import { recallObservationSource } from "./recall.ts";
import { OM_OBSERVATIONS_DROPPED, OM_OBSERVATIONS_RECORDED, type Entry } from "./types.ts";

const timestamp = "2026-10-23T14:30:00";
const laterTimestamp = "2026-10-23T14:30:01";
const message = (id: string, text = id): Entry => ({ type: "message", id, message: { role: "user", content: text } });
function record(id: string, coversUpToId: string, stamp = timestamp, sourceEntryIds?: string[]): Entry {
  return { type: "custom", id, customType: OM_OBSERVATIONS_RECORDED, data: { coversUpToId, sourceEntryIds, observations: [{ timestamp: stamp, content: id, tokenCount: 1 }] } };
}
function success(branch: Entry[], query = timestamp) {
  const result = recallObservationSource(branch, query);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error(result.reason);
  return result.match;
}

test("explicit provenance recalls only the recorded chunk, even after compaction", () => {
  const branch = [message("before", "unrelated"), message("a", "original stack trace"), message("b", "original diff"), record("obs", "b", timestamp, ["a", "b"]), { type: "compaction", id: "c", firstKeptEntryId: "tail" }, message("tail")];
  const match = success(branch);
  assert.deepEqual(match.sourceEntryIds, ["a", "b"]);
  assert.match(match.renderedSource, /original stack trace/);
  assert.match(match.renderedSource, /original diff/);
  assert.doesNotMatch(match.renderedSource, /unrelated|\[Source entry id: tail\]/);
  assert.equal(match.provenance, "explicit");
});

test("exact timestamp wins over longer IDs; unique prefixes work; ambiguous prefixes fail", () => {
  const branch = [message("a"), record("obs", "a", timestamp, ["a"]), record("obs2", "a", timestamp + ".01", ["a"])];
  assert.equal(success(branch).observation.timestamp, timestamp);
  assert.equal(success(branch, timestamp + ".0").observation.timestamp, timestamp + ".01");
  const ambiguous = recallObservationSource(branch, "2026-10-23T14:30");
  assert.equal(ambiguous.ok, false);
  if (!ambiguous.ok) assert.equal(ambiguous.status, "ambiguous");
  assert.equal(recallObservationSource(branch, " ").ok, false);
  assert.equal(recallObservationSource(branch, "x".repeat(101)).ok, false);
});

test("duplicate records obey first-valid-record-wins and do not make prefixes ambiguous", () => {
  const branch = [message("a"), message("b"), record("first", "a", timestamp, ["a"]), record("duplicate", "b", timestamp, ["b"])];
  const match = success(branch, "2026-10");
  assert.equal(match.observation.content, "first");
  assert.deepEqual(match.sourceEntryIds, ["a"]);
});

test("legacy chunks are inferred by source order rather than worker completion order", () => {
  const branch = [message("a"), message("b"), message("c"), message("d"), record("second", "d", laterTimestamp), record("first", "b")];
  assert.deepEqual(success(branch, timestamp).sourceEntryIds, ["a", "b"]);
  const later = success(branch, laterTimestamp);
  assert.deepEqual(later.sourceEntryIds, ["c", "d"]);
  assert.equal(later.provenance, "inferred");
});

test("archived observations remain recallable and are marked dropped", () => {
  const branch = [message("a"), record("obs", "a", timestamp, ["a"]), { type: "custom", id: "drop", customType: OM_OBSERVATIONS_DROPPED, data: { observationTimestamps: [timestamp], coversUpToId: "a" } }];
  assert.equal(success(branch).status, "dropped");
});

test("off-branch and empty sources are unavailable, not empty successes", () => {
  assert.equal(recallObservationSource([], timestamp).ok, false);
  for (const branch of [[record("obs", "missing")], [record("obs", "missing", timestamp, ["missing"])], [message("a"), record("obs", "a", timestamp, [])]]) {
    const result = recallObservationSource(branch, timestamp);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, "source_unavailable");
  }
});

test("partially available explicit sources report missing IDs without searching other branches", () => {
  const match = success([message("a"), record("obs", "missing", timestamp, ["a", "missing"])]);
  assert.deepEqual(match.sourceEntryIds, ["a"]);
  assert.deepEqual(match.missingSourceEntryIds, ["missing"]);
});

test("future and non-source entries cannot be presented as original evidence", () => {
  const branch = [message("a"), { type: "custom", id: "metadata" }, record("obs", "a", timestamp, ["a", "metadata", "future"]), message("future")];
  const match = success(branch);
  assert.deepEqual(match.sourceEntryIds, ["a"]);
  assert.deepEqual(match.missingSourceEntryIds, ["metadata", "future"]);
});

test("raw user/tool text is not silently truncated; source custom/branch entries render", () => {
  const text = "stack trace\n" + "x".repeat(30_000);
  const branch = [
    message("a", text),
    { type: "message", id: "assistant", message: { role: "assistant", content: [{ type: "text", text: "code\n\n  indentation" }] } },
    { type: "message", id: "tool", message: { role: "toolResult", toolName: "bash", content: [{ type: "text", text: "diff\n\n+line" }] } },
    { type: "custom_message", id: "custom", content: "historical note" },
    { type: "branch_summary", id: "summary", summary: "branch evidence" },
    record("obs", "summary", timestamp, ["a", "assistant", "tool", "custom", "summary"]),
  ];
  const match = success(branch);
  assert.ok(match.renderedSource.includes(text));
  assert.match(match.renderedSource, /diff\n\n\+line/);
  assert.ok(match.renderedSource.includes("code\n\n  indentation"));
  assert.match(match.renderedSource, /historical note/);
  assert.match(match.renderedSource, /branch evidence/);
});
