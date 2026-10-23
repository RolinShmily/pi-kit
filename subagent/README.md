# subagent

Delegate tasks to independent, full-powered Pi workers. The `subagent` tool returns after launch; completion or questions are delivered back to the parent session asynchronously.

## Install

```sh
pi install npm:@rol1n/pi-kit
```

Included and loaded by default in `@rol1n/pi-kit`. See [resource selection](../README.md#resource-selection) to disable this entry or load only selected extensions. The parent and workers require the `pi` executable on PATH and their normal Pi authentication.

## Use

```json
{"action":"spawn","name":"reviewer","cwd":"/existing/project","task":"Review the changed files and report findings."}
{"action":"send","target":"reviewer","task":"Also inspect the error handling."}
{"action":"stop","target":"reviewer"}
```

`model` optionally selects a worker model. `/subagent` shows active workers. Each worker inherits its own normal Pi capabilities; this is a delegation runtime, not a restricted execution environment.

## Backends

| Variable | Behavior |
|---|---|
| `PI_SUBAGENT_BACKEND=process` | Run silent background processes |
| `PI_SUBAGENT_MUX=tmux` | Prefer tmux when running inside an available tmux session |
| `PI_SUBAGENT_MUX=zellij` | Prefer Zellij when running inside an available Zellij session |

Without a usable multiplexer, the worker backend falls back to a background process. Native Windows supports PowerShell launch commands and Zellij panes; tmux is for POSIX environments. Session transcripts and task artifacts are stored under `~/.pi/agent/`.

## Other delegation tools

Use [multi-harness](https://github.com/RolinShmily/pi-kit/tree/main/multi-harness) for Codex, Claude, or OpenCode peers. It shares multiplexer helpers (`mux.ts`) within the same kit while exposing a separate tool.
