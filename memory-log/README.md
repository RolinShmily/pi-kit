# memory-log

> Tiered asynchronous observational memory for long-running Pi sessions.

`memory-log` keeps multi-day coding sessions coherent across compactions without blocking your workflow. Based on the observational memory paradigm from [elpapi42/pi-observational-memory](https://github.com/elpapi42/pi-observational-memory), it moves memory distillation into background subprocesses while you work, turning context compaction into an instant, model-free rendering step.

## Install

```sh
pi install npm:@rol1n/memory-log
```

Also included in `@rol1n/pi-kit`. The extension loads with new-session memory disabled by default (`/mem-log on` to enable for the current session, or `"defaultEnabled": true` in settings).

---

## Why it exists

Long AI coding sessions typically hit two walls:

1. **The Compression Wall (Summary of a Summary)**: Traditional compaction summarizes the conversation when the context window fills up. Over multiple cycles, the agent carries a compressed summary of a previous summary, gradually losing concrete architectural rationale, rejected approaches, and subtle constraints.
2. **Compaction Stalls**: Waiting for a model to rewrite a massive transcript right when the context window overflows interrupts flow.

`memory-log` solves both by doing the heavy lifting **asynchronously in the background** as the session progresses:

- **Background Observers**: Whenever raw conversation history accumulates a full chunk (`chunkTokens`), a background Pi worker distills that chunk into timestamped, priority-tagged (`🔴` / `🟡` / `🟢`) atomic observations stored in the session branch ledger.
- **Consolidator & Durable Topic Files**: When the active observation pool reaches `consolidateAtPoolTokens`, a background consolidator archives older observations into durable Markdown topic files under `.memory/<sessionId>/` (`INDEX.md`, `<topic>.md`) and appends project milestones to `.memory/<sessionId>/JOURNEY.md`, draining the active pool back toward `poolTargetTokens`.
- **Model-Free Deterministic Compaction**: When live context usage reaches `compactAtContextTokens`, compaction snaps the cutoff to the nearest completed observation chunk boundary (preserving `tailTokens` of verbatim recent dialogue) and deterministically reconstructs the context block from `JOURNEY.md` + the **Memory Map** (topic summaries) + the short-term active observation pool. Zero LLM calls are made during compaction itself.
- **TUI Observability**: Displays live footer gauges (`Next` chunk progress, `Pool` capacity, `Ctx` window usage), active worker spinners, and session memory cost.

---

## Commands

| Command | Action |
|---|---|
| `/mem-log` | Enable memory log (if off) or display status & timeline (if on) |
| `/mem-log on` / `/mem-log off` | Enable or disable observational memory for the current session |
| `/mem-log status` or `/mem-log:status` | View gauges, worker states, cost summary, and observation timeline |
| `/mem-log compact` or `/mem-log:compact` | Trigger immediate deterministic compaction |
| `/mem-log consolidate` or `/mem-log:consolidate` | Consolidate the active observation pool into durable topic files immediately |

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
    "resumeAfterMidRunCompaction": true,
    "passive": false,
    "debugLog": false,
    "models": {
      "observer": { "thinking": "low" },
      "consolidator": { "thinking": "medium" }
    }
  }
}
```

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
