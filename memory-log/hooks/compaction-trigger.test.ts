import test from "node:test";
import assert from "node:assert/strict";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Runtime } from "../runtime.ts";
import { registerCompactionTrigger } from "./compaction-trigger.ts";

function fixture() {
  const handlers = new Map<string, (event: any, ctx: any) => void>();
  const runtime = {
    enabled: true,
    config: { passive: false, compactAtContextTokens: 100 },
    compactInFlight: false,
    compactHookInFlight: false,
  } as unknown as Runtime;
  const notifications: Array<[string, string]> = [];
  let calls = 0;
  let callbacks!: { onComplete: () => void; onError: (error: Error) => void };
  const ctx = {
    hasUI: true,
    ui: { notify: (message: string, level: string) => { notifications.push([message, level]); } },
    isIdle: () => true,
    hasPendingMessages: () => false,
    getContextUsage: () => ({ tokens: 200 }),
    sessionManager: { getBranch: () => [{ type: "message", id: "a", message: { role: "assistant", content: "answer" } }] },
    compact: (options: typeof callbacks) => { calls++; callbacks = options; },
  };
  registerCompactionTrigger({ on(name: string, handler: (event: any, ctx: any) => void) { handlers.set(name, handler); } } as unknown as ExtensionAPI, runtime);
  return { handlers, runtime, ctx, notifications, calls: () => calls, callbacks: () => callbacks, settle: (aborted = false) => handlers.get("agent_settled")!({ aborted }, ctx) };
}

test("only agent_settled triggers compaction, with no idle polling", () => {
  const f = fixture();
  assert.deepEqual([...f.handlers.keys()], ["agent_settled"]);
  f.settle();
  assert.equal(f.calls(), 1);
  assert.equal(f.runtime.compactInFlight, true);
  f.settle();
  assert.equal(f.calls(), 1);
  f.callbacks().onComplete();
  assert.equal(f.runtime.compactInFlight, false);
  assert.match(f.notifications.at(-1)![0], /completed/);
});

test("aborted, disabled, passive, busy, pending and below-threshold sessions do not compact", () => {
  const f = fixture();
  f.settle(true);
  f.runtime.enabled = false;
  f.settle();
  f.runtime.enabled = true;
  f.runtime.config.passive = true;
  f.settle();
  f.runtime.config.passive = false;
  f.runtime.compactHookInFlight = true;
  f.settle();
  f.runtime.compactHookInFlight = false;
  f.ctx.isIdle = () => false;
  f.settle();
  f.ctx.isIdle = () => true;
  f.ctx.hasPendingMessages = () => true;
  f.settle();
  f.ctx.hasPendingMessages = () => false;
  f.ctx.getContextUsage = () => ({ tokens: 50 });
  f.settle();
  assert.equal(f.calls(), 0);
  assert.equal(f.runtime.compactInFlight, false);
});

test("errors and cancellation release the lock; non-UI mode needs no UI", () => {
  const f = fixture();
  f.settle();
  f.callbacks().onError(new Error("failure"));
  assert.equal(f.runtime.compactInFlight, false);
  assert.equal(f.notifications.at(-1)![1], "error");
  f.settle();
  const count = f.notifications.length;
  f.callbacks().onError(new Error("Compaction cancelled"));
  assert.equal(f.notifications.length, count);
  f.ctx.hasUI = false;
  f.ctx.ui.notify = () => { throw new Error("must not use UI"); };
  f.settle();
  f.callbacks().onComplete();
  assert.equal(f.runtime.compactInFlight, false);
});

test("synchronous compaction failure also releases the lock", () => {
  const f = fixture();
  f.ctx.compact = () => { throw new Error("sync failure"); };
  f.settle();
  assert.equal(f.runtime.compactInFlight, false);
  assert.match(f.notifications.at(-1)![0], /sync failure/);
});
