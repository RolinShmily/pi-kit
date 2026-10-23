# memory-log

> Tiered asynchronous observational memory for long-running Pi sessions.

`memory-log` keeps multi-day coding sessions coherent across compactions without blocking your workflow. Based on the observational memory paradigm from [elpapi42/pi-observational-memory](https://github.com/elpapi42/pi-observational-memory), it moves memory distillation into background subprocesses while you work, making compaction a model-free rendering step when sufficient observations are available. If a safe cutoff or usable memory summary is unavailable, Pi's native summarizer takes over instead.

## Install

```sh
pi install npm:@rol1n/pi-kit
```

Included and loaded by default in `@rol1n/pi-kit`. See [resource selection](../README.md#resource-selection) to disable this entry or load only selected extensions. The extension loads with new-session memory disabled by default (`/mem-log on` to enable for the current session, or `"defaultEnabled": true` in settings).

---

## Why it exists

Long AI coding sessions typically hit two walls:

1. **The Compression Wall (Summary of a Summary)**: Traditional compaction summarizes the conversation when the context window fills up. Over multiple cycles, the agent carries a compressed summary of a previous summary, gradually losing concrete architectural rationale, rejected approaches, and subtle constraints.
2. **Compaction Stalls**: Waiting for a model to rewrite a massive transcript right when the context window overflows interrupts flow.

`memory-log` solves both by doing the heavy lifting **asynchronously in the background** as the session progresses:

- **Background Observers**: Whenever raw conversation history accumulates a full chunk (`chunkTokens`), a background Pi worker distills that chunk into timestamped, priority-tagged (`🔴` / `🟡` / `🟢`) atomic observations stored in the session branch ledger.
- **Consolidator & Durable Topic Files**: When the active observation pool reaches `consolidateAtPoolTokens`, a background consolidator archives older observations into durable Markdown topic files under `.memory/<sessionId>/` (`INDEX.md`, `<topic>.md`) and appends project milestones to `.memory/<sessionId>/JOURNEY.md`, draining the active pool back toward `poolTargetTokens`.
- **Safe Deterministic Compaction**: After `agent_settled` (all retries and queued continuations have finished), context pressure can trigger compaction. The cutoff snaps to a completed observation boundary near `tailTokens`, never crossing an unobserved gap in newly recorded chunks or splitting a tool call from its results. The entire unobserved tail stays verbatim, even if larger than the target. The summary is rendered from `JOURNEY.md` + the **Memory Map** + active observations, without an LLM call. Missing boundaries or empty memory delegate to Pi's native summarizer, which may make an LLM call.
- **Source Recall**: `memory_recall` retrieves the original conversation chunk behind an observation by timestamp, including history hidden by compaction and observations archived to topic files.
- **TUI Observability**: Displays live footer gauges (`Next` chunk progress, `Pool` capacity, `Ctx` window usage), active worker spinners, and session memory cost.

---

## Commands

| Command | Action |
|---|---|
| `/mem-log` | Enable memory log (if off) or display status & timeline (if on) |
| `/mem-log on` / `/mem-log off` | Enable or disable observational memory for the current session |
| `/mem-log status` or `/mem-log:status` | View gauges, worker states, cost summary, and observation timeline |
| `/mem-log compact` or `/mem-log:compact` | Request immediate compaction (native summarization if no safe memory cutoff exists) |
| `/mem-log consolidate` or `/mem-log:consolidate` | Consolidate the active observation pool into durable topic files immediately |

---

## Source recall

The agent can call `memory_recall` with an observation's full timestamp-id (including a `.NN` suffix, if present), or an unambiguous prefix:

```json
{ "timestamp": "2026-10-23T14:30:00" }
```

- New observations persist exact `sourceEntryIds`; provenance covers the **whole chunk**, not a per-fact citation.
- Older records remain readable: ranges are inferred from coverage anchors in source order, not worker completion order. Inferred ranges are explicitly labeled and may include extra conversation; old records cannot prove gaps caused by failed workers. Legacy compaction coverage retains its existing watermark interpretation.
- Recall searches only the **current branch**. Missing sources are reported as unavailable or partial, never borrowed from another branch. Archived observations remain traceable in the ledger.
- Output is paged at 12,000 source characters. Use the returned `nextOffset` as `offset` to continue; `limit` can request a smaller page. Images/non-text blocks use placeholders.
- Recall is read-only and remains available when background memory processing is disabled.

Automatic compaction requires a Pi version that exposes `agent_settled`. Aborted runs do not trigger it; there is no retry-error guessing or idle polling. Pi's own compaction mechanism remains independent.

---

## Configuration

Add a `memoryLog` section to `~/.pi/agent/settings.json` (global) or `.pi/settings.json` (project-level override):

```json
{
  "memoryLog": {
    "defaultEnabled": false,
    "chunkTokens": 10000,
    "poolTargetTokens": 10000,
    "consolidateAtPoolTokens": 15000,
    "compactAtContextTokens": 150000,
    "tailTokens": 20000,
    "journeyTargetTokens": 1000,
    "observerConcurrency": 4,
    "passive": false,
    "debugLog": false,
    "models": {
      "observer": { "thinking": "low" },
      "consolidator": { "thinking": "medium" }
    }
  }
}
```

`resumeAfterMidRunCompaction` is retained for configuration compatibility but has no effect: this extension's automatic trigger now runs only after settlement and never starts a synthetic continuation.

### Model resolution

`models.observer` and `models.consolidator` accept `{ "provider": "...", "id": "...", "thinking": "off|minimal|low|medium|high|xhigh" }`.
Resolution priority: **explicit `memoryLog.models` -> current session model -> Pi default model (`defaultProvider` / `defaultModel`)**.

### Environment overrides

| Variable | Purpose |
|---|---|
| `PI_OM_PASSIVE=1` | Disable automatic observer/consolidator/compaction triggers while keeping manual commands |
| `PI_OM_OBSERVER_PROVIDER` / `PI_OM_OBSERVER_MODEL` / `PI_OM_OBSERVER_THINKING` | Override observer worker model |
| `PI_OM_CONSOLIDATOR_PROVIDER` / `PI_OM_CONSOLIDATOR_MODEL` / `PI_OM_CONSOLIDATOR_THINKING` | Override consolidator worker model |

---

## Storage layout

```text
<project-root>/.memory/<session-id>/
├── INDEX.md          # Orchestrator-rendered index of durable topics (injected as the Memory Map)
├── JOURNEY.md        # Chronological project history maintained by the consolidator
└── <topic-slug>.md   # Durable topic notes read on demand by the agent
```

Short-term observations and enable/disable gates are stored directly in the Pi session JSONL ledger so they branch and fork naturally with your session tree.

---

## Credits

Adapted from and inspired by [elpapi42/pi-observational-memory](https://github.com/elpapi42/pi-observational-memory) (MIT License), extended with file-backed durable topic consolidation (`.memory/<sessionId>/`), `JOURNEY.md` tracking, and TUI progress gauges.
