# memory-log

Observational memory for long Pi sessions: background observers distill conversation chunks, a ledger records observations, and a consolidator writes durable project memory. Compaction rebuilds context from the recorded memory and recent conversation.

## Install

```sh
pi install npm:@rol1n/memory-log
```

Also included in `@rol1n/pi-kit`. The extension loads with new-session memory disabled by default.

## Commands

| Command | Action |
|---|---|
| `/mem-log on` / `/mem-log off` | Set the current session's memory gate |
| `/mem-log status` or `/mem-log:status` | Inspect observation progress, workers, memory, and costs |
| `/mem-log compact` or `/mem-log:compact` | Request compaction |
| `/mem-log consolidate` or `/mem-log:consolidate` | Consolidate the observation pool |

## Settings

Add `memoryLog` to personal or project Pi settings. Project values override personal values:

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

Observer and consolidator model objects accept `provider`, `id`, and `thinking`. An explicitly configured model takes priority over the session model, followed by Pi's configured default model. `chunkOverlapTokens` defaults to zero.

Environment overrides are `PI_OM_PASSIVE`, `PI_OM_OBSERVER_PROVIDER`, `PI_OM_OBSERVER_MODEL`, `PI_OM_OBSERVER_THINKING`, and the corresponding `PI_OM_CONSOLIDATOR_*` values. Passive mode disables automatic triggers separately from the session gate.

## Storage and requirements

Durable files live under `.memory/<session-id>/` in the working project, including topic files and `JOURNEY.md`. Gate changes and observation history are recorded in the Pi session ledger. Observer and consolidator workers require the `pi` executable and model credentials; they make additional model requests. Disabling memory aborts active background workers.
