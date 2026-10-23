import test, { type TestContext } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { canSkipObserverWait, registerCompactionHook, snapCutoff, snapFirstKeptEntryId } from "./compaction-hook.ts";
import { contextPressureTokens } from "./compaction-trigger.ts";
import { OM_OBSERVATIONS_DROPPED, OM_OBSERVATIONS_RECORDED, type Entry } from "../ledger/index.ts";
import type { Runtime } from "../runtime.ts";

function makeMessageEntry(id: string, role: "user" | "assistant", text: string): Entry {
  return {
    type: "message",
    id,
    message: {
      role,
      content: text,
    },
  };
}

function makeObservationEntry(id: string, coversUpToId: string, sourceEntryIds?: string[]): Entry {
  return {
    type: "custom",
    customType: OM_OBSERVATIONS_RECORDED,
    id,
    data: {
      coversUpToId,
      sourceEntryIds,
      observations: [
        {
          timestamp: "2026-09-10T12:00:00",
          content: "Observation content",
          tokenCount: 10,
        },
      ],
    },
  };
}

function makeCompactionEntry(id: string, firstKeptEntryId: string): Entry {
  return {
    type: "compaction",
    id,
    summary: "Compacted conversation summary",
    firstKeptEntryId,
  };
}

test("snapCutoff: without prior compaction, snaps to boundary closest to tailTokens", () => {
  // m0 (100 tok), m1 (100 tok), obs1 (covers m1), m2 (100 tok), m3 (100 tok), obs2 (covers m3), m4 (100 tok)
  const branch: Entry[] = [
    makeMessageEntry("m0", "user", "a".repeat(400)), // 100 tok
    makeMessageEntry("m1", "assistant", "b".repeat(400)), // 100 tok
    makeObservationEntry("obs1", "m1"),
    makeMessageEntry("m2", "user", "c".repeat(400)), // 100 tok
    makeMessageEntry("m3", "assistant", "d".repeat(400)), // 100 tok
    makeObservationEntry("obs2", "m3"),
    makeMessageEntry("m4", "user", "e".repeat(400)), // 100 tok
  ];

  // Tail after boundary m1 (idx 1): m2 (100) + m3 (100) + m4 (100) = 300 tok. First kept = m2.
  // Tail after boundary m3 (idx 4): m4 (100) = 100 tok. First kept = m4.
  // If target tail is 110, boundary m3 is much closer (delta 10 vs 190)
  const snap = snapCutoff(branch, "fallback", 110);
  assert.strictEqual(snap.firstKeptId, "m4");
  assert.strictEqual(snap.tail, 100);
});

test("snapCutoff: NEVER selects a boundary or firstKeptId before or at a prior compaction entry", () => {
  // Scenario:
  // entry 0: m0 (100 tok)
  // entry 1: m1 (100 tok)
  // entry 2: obs1 (covers m1)
  // entry 3: compaction c1 (firstKeptEntryId: m1)
  // entry 4: m2 (100 tok)
  // entry 5: m3 (100 tok)
  // entry 6: obs2 (covers m3)
  // entry 7: m4 (100 tok)
  const branch: Entry[] = [
    makeMessageEntry("m0", "user", "a".repeat(400)),
    makeMessageEntry("m1", "assistant", "b".repeat(400)),
    makeObservationEntry("obs1", "m1"), // boundary at idx 1 (before compaction at idx 3)
    makeCompactionEntry("c1", "m1"),
    makeMessageEntry("m2", "user", "c".repeat(400)),
    makeMessageEntry("m3", "assistant", "d".repeat(400)),
    makeObservationEntry("obs2", "m3"), // boundary at idx 5 (after compaction at idx 3)
    makeMessageEntry("m4", "user", "e".repeat(400)),
  ];

  // Tail after boundary m1: m2 (100) + m3 (100) + m4 (100) = 300 tok.
  // Tail after boundary m3: m4 (100) = 100 tok.
  // If tailTokens = 295, boundary m1 (tail 300) would be closer (delta 5) than m3 (delta 195).
  // BUT boundary m1 is before compaction c1 (idx 1 < idx 3).
  // snapCutoff MUST NOT select m1 or anything before c1!
  const snap = snapCutoff(branch, "fallback", 295);
  assert.strictEqual(snap.firstKeptId, "m4");
  assert.strictEqual(snap.tail, 100);
  assert.strictEqual(snapFirstKeptEntryId(branch, "fallback", 295), "m4");
});

test("snapCutoff: handles multiple compactions and respects the latest compaction", () => {
  const branch: Entry[] = [
    makeMessageEntry("m0", "user", "a".repeat(400)),
    makeCompactionEntry("c1", "m0"), // first compaction at idx 1
    makeMessageEntry("m1", "user", "b".repeat(400)),
    makeMessageEntry("m2", "assistant", "c".repeat(400)),
    makeObservationEntry("obs1", "m2"), // boundary at idx 4
    makeCompactionEntry("c2", "m1"), // second compaction at idx 5
    makeMessageEntry("m3", "user", "d".repeat(400)),
    makeMessageEntry("m4", "assistant", "e".repeat(400)),
    makeObservationEntry("obs2", "m4"), // boundary at idx 8
    makeMessageEntry("m5", "user", "f".repeat(400)),
  ];

  // Boundary m2 (idx 4) is after c1 but BEFORE c2 (idx 5).
  // Target tail: 200.
  // Tail after m2 is m3 (100) + m4 (100) + m5 (100) = 300 tok.
  // Tail after m4 is m5 (100) = 100 tok.
  // Even if tailTokens is 290 (closer to 300 than 100), m2 must be excluded because idx 4 <= lastCompactionIdx (5).
  const snap = snapCutoff(branch, "proposedId", 290);
  assert.strictEqual(snap.firstKeptId, "m5");
  assert.strictEqual(snap.tail, 100);
});

test("snapCutoff: refuses an unproven proposed cutoff when all boundaries precede the last compaction", () => {
  const branch: Entry[] = [
    makeMessageEntry("m0", "user", "a".repeat(400)),
    makeMessageEntry("m1", "assistant", "b".repeat(400)),
    makeObservationEntry("obs1", "m1"), // boundary at idx 1
    makeCompactionEntry("c1", "m1"), // compaction at idx 3
    makeMessageEntry("m2", "user", "c".repeat(400)),
    makeMessageEntry("m3", "assistant", "d".repeat(400)),
  ];

  // No observation chunk boundaries exist after c1.
  // Let the hook delegate to native summarization, never use an unobserved cut.
  const snap = snapCutoff(branch, "m2", 100);
  assert.strictEqual(snap.firstKeptId, undefined);
  assert.strictEqual(snap.tail, undefined);
});

test("contextPressureTokens: returns due: false when last entry is a compaction", () => {
  const branch: Entry[] = [
    makeMessageEntry("m0", "user", "a".repeat(400)),
    makeMessageEntry("m1", "assistant", "b".repeat(400)),
    makeCompactionEntry("c1", "m1"),
  ];

  const ctx = {
    getContextUsage: () => ({ tokens: 50_000 }),
    sessionManager: { getBranch: () => branch },
  };

  const result = contextPressureTokens(ctx, 10_000);
  assert.strictEqual(result.due, false);
  assert.strictEqual(result.tokens, 0);
});

test("contextPressureTokens: returns due: false when context was compacted and no assistant has responded", () => {
  const branch: Entry[] = [
    makeMessageEntry("m0", "user", "a".repeat(400)),
    makeMessageEntry("m1", "assistant", "b".repeat(400)),
    makeCompactionEntry("c1", "m1"),
    makeMessageEntry("m2", "user", "c".repeat(400)), // only user prompt after compaction, no assistant yet
  ];

  const ctx = {
    // In Pi, getContextUsage() returns tokens: null after compaction until assistant responds
    getContextUsage: () => ({ tokens: null }),
    sessionManager: { getBranch: () => branch },
  };

  const result = contextPressureTokens(ctx, 100);
  assert.strictEqual(result.due, false);
  assert.strictEqual(result.tokens, 0);
});

test("contextPressureTokens: returns due: false when no new tokens exist after compaction entry", () => {
  const branch: Entry[] = [
    makeMessageEntry("m0", "user", "a".repeat(400)),
    makeCompactionEntry("c1", "m0"),
    { type: "custom", id: "cust1", customType: "om.enabled", data: { enabled: true } },
  ];

  const ctx = {
    getContextUsage: () => ({ tokens: null }),
    sessionManager: { getBranch: () => branch },
  };

  const result = contextPressureTokens(ctx, 50);
  assert.strictEqual(result.due, false);
  assert.strictEqual(result.tokens, 0);
});

test("contextPressureTokens: triggers when threshold is exceeded after assistant responds post-compaction", () => {
  const branch: Entry[] = [
    makeMessageEntry("m0", "user", "a".repeat(400)),
    makeMessageEntry("m1", "assistant", "b".repeat(400)),
    makeCompactionEntry("c1", "m1"),
    makeMessageEntry("m2", "user", "c".repeat(400)),
    makeMessageEntry("m3", "assistant", "d".repeat(400)),
  ];

  const ctxLive = {
    getContextUsage: () => ({ tokens: 25_000 }),
    sessionManager: { getBranch: () => branch },
  };

  // Live usage >= threshold
  assert.strictEqual(contextPressureTokens(ctxLive, 20_000).due, true);
  assert.strictEqual(contextPressureTokens(ctxLive, 30_000).due, false);

  // Fallback to rawTokensSinceLastCompaction when getContextUsage() returns null
  const ctxNull = {
    getContextUsage: () => ({ tokens: null }),
    sessionManager: { getBranch: () => branch },
  };
  // m1 (100) + m2 (100) + m3 (100) = 300 raw tokens
  assert.strictEqual(contextPressureTokens(ctxNull, 200).due, true);
  assert.strictEqual(contextPressureTokens(ctxNull, 500).due, false);
});

test("snapCutoff: later completed workers cannot skip an earlier observation gap", () => {
  const branch = [
    makeMessageEntry("m0", "user", "first chunk"),
    makeMessageEntry("m1", "assistant", "first answer"),
    makeMessageEntry("m2", "user", "second chunk"),
    makeMessageEntry("m3", "assistant", "second answer"),
    makeObservationEntry("late", "m3", ["m2", "m3"]),
    makeMessageEntry("m4", "user", "unobserved tail"),
  ];
  assert.strictEqual(snapCutoff(branch, "m4", 0).firstKeptId, undefined);
  branch.push(makeObservationEntry("early", "m1", ["m0", "m1"]));
  assert.strictEqual(snapCutoff(branch, "m4", 0).firstKeptId, "m4");
});

test("snapCutoff: coverage from a later overlapping chunk cannot authorize an earlier projection", () => {
  const branch = [
    makeMessageEntry("m0", "user", "only in later chunk"),
    makeMessageEntry("m1", "assistant", "early chunk"),
    makeObservationEntry("early", "m1", ["m1"]),
    makeMessageEntry("m2", "user", "later chunk"),
    makeObservationEntry("late", "m2", ["m0", "m2"]),
    makeMessageEntry("tail", "user", "tail"),
  ];
  // m1's apparent boundary would omit the only memory of m0.
  assert.strictEqual(snapCutoff(branch, "m2", 1000).firstKeptId, "tail");
});

test("snapCutoff: never splits an assistant call from its tool result", () => {
  const branch: Entry[] = [
    makeMessageEntry("m0", "assistant", "tool call"),
    makeObservationEntry("obs", "m0", ["m0"]),
    { type: "message", id: "result", message: { role: "toolResult", content: "output" } },
    makeMessageEntry("m1", "assistant", "tail"),
  ];
  assert.strictEqual(snapCutoff(branch, "m1", 0).firstKeptId, undefined);
});

test("snapCutoff: invalid and off-branch anchors cannot authorize a cut", () => {
  for (const ids of [["missing"], ["m1", "m0"], [], ["m0", "missing", "m1"]]) {
    const branch = [makeMessageEntry("m0", "user", "raw"), makeMessageEntry("m1", "assistant", "raw"), makeObservationEntry("obs", "m1", ids), makeMessageEntry("tail", "user", "tail")];
    assert.strictEqual(snapCutoff(branch, "tail", 0).firstKeptId, undefined);
  }
});

function hookFixture(t: TestContext, initialBranch: Entry[]) {
  const memoryRoot = mkdtempSync(join(tmpdir(), "memory-hook-test-"));
  t.after(() => rmSync(memoryRoot, { recursive: true, force: true }));
  let branch = initialBranch;
  let hook!: (event: any, ctx: any) => Promise<any>;
  let waits = 0;
  const runtime = {
    enabled: true,
    config: { passive: false, tailTokens: 100 },
    memoryRoot,
    compactHookInFlight: false,
    observersInFlight: new Map(),
    ensureConfig() {},
    async whenObserversIdle() { waits++; },
  } as unknown as Runtime;
  registerCompactionHook({ on(_name: string, handler: typeof hook) { hook = handler; } } as unknown as ExtensionAPI, runtime);
  const event = { preparation: { firstKeptEntryId: "tail", tokensBefore: 1000 }, branchEntries: initialBranch, signal: new AbortController().signal };
  const ctx = { cwd: memoryRoot, hasUI: false, sessionManager: { getBranch: () => branch } };
  return { runtime, event, ctx, run: () => hook(event, ctx), setBranch(next: Entry[]) { branch = next; }, waits: () => waits };
}

function observedBranch(): Entry[] {
  return [makeMessageEntry("m0", "user", "observed raw text"), makeObservationEntry("obs", "m0", ["m0"]), makeMessageEntry("tail", "user", "unobserved tail")];
}

test("hook: manual early compaction and failed observers fall back to native summary", async (t) => {
  const f = hookFixture(t, [makeMessageEntry("m0", "user", "raw text"), makeMessageEntry("tail", "assistant", "not yet observed")]);
  assert.strictEqual(await f.run(), undefined);
  assert.strictEqual(f.runtime.compactHookInFlight, false);
  assert.strictEqual(f.waits(), 1);
});

test("hook: preserves the whole unobserved tail, even when it exceeds the target", async (t) => {
  const branch = observedBranch();
  branch.push(makeMessageEntry("newer", "assistant", "x".repeat(2000)));
  const f = hookFixture(t, branch);
  f.event.preparation.firstKeptEntryId = "newer";
  const result = await f.run();
  assert.strictEqual(result.compaction.firstKeptEntryId, "tail");
  assert.match(result.compaction.summary, /Observation content/);
  assert.strictEqual(result.compaction.tokensBefore, 1000);
});

test("hook: waits then rereads the branch to use a newly committed observer", async (t) => {
  const f = hookFixture(t, [makeMessageEntry("m0", "user", "raw text"), makeMessageEntry("tail", "user", "tail")]);
  f.runtime.whenObserversIdle = async () => { f.setBranch(observedBranch()); };
  const result = await f.run();
  assert.strictEqual(result.compaction.firstKeptEntryId, "tail");
});

test("hook: empty memory (all observations archived, no files) uses native summarization", async (t) => {
  const branch = observedBranch();
  branch.push({ type: "custom", id: "drop", customType: OM_OBSERVATIONS_DROPPED, data: { observationTimestamps: ["2026-09-10T12:00:00"], coversUpToId: "m0" } });
  const f = hookFixture(t, branch);
  assert.strictEqual(await f.run(), undefined);
  writeFileSync(join(f.runtime.memoryRoot, "JOURNEY.md"), "Previous milestones");
  writeFileSync(join(f.runtime.memoryRoot, "auth.md"), "---\nsummary: Authentication design\n---\nDetails");
  const result = await f.run();
  assert.match(result.compaction.summary, /Previous milestones/);
  assert.match(result.compaction.summary, /Authentication design/);
});

test("hook: a previous compaction without a new observed boundary uses native summary", async (t) => {
  const branch = observedBranch();
  branch.splice(2, 0, makeCompactionEntry("c1", "m0"));
  const f = hookFixture(t, branch);
  assert.strictEqual(await f.run(), undefined);
});

test("hook: disabled, passive, duplicate and aborted requests are safe", async (t) => {
  const f = hookFixture(t, observedBranch());
  f.runtime.enabled = false;
  assert.strictEqual(await f.run(), undefined);
  f.runtime.enabled = true;
  f.runtime.config.passive = true;
  assert.strictEqual(await f.run(), undefined);
  f.runtime.config.passive = false;
  f.runtime.compactHookInFlight = true;
  assert.deepStrictEqual(await f.run(), { cancel: true });
  f.runtime.compactHookInFlight = false;
  f.event.signal = AbortSignal.abort();
  assert.deepStrictEqual(await f.run(), { cancel: true });
});

test("observer wait: skip only when a safe cut fits the tail and in-flight chunks lie after it", () => {
  const branch = observedBranch();
  assert.strictEqual(canSkipObserverWait(branch, "tail", 10, 100, []), true);
  assert.strictEqual(canSkipObserverWait(branch, undefined, undefined, 100, []), false);
  assert.strictEqual(canSkipObserverWait(branch, "tail", 200, 100, []), false);
  assert.strictEqual(canSkipObserverWait(branch, "tail", 10, 100, [{ coversUpToId: "m0" }]), false);
  assert.strictEqual(canSkipObserverWait(branch, "tail", 10, 100, [{ coversUpToId: "missing" }]), false);
});
