# oai-subquota

Monitor OpenAI Codex subscription quota (5-hour and 7-day windows, resets, and credits) when using the `openai-codex` provider.

## Install

```sh
pi install npm:@rol1n/pi-kit
```

Included and loaded by default in `@rol1n/pi-kit`. See [resource selection](../README.md#resource-selection) to disable this entry or load only selected extensions.

## Commands

| Command | Action |
|---|---|
| `/oai-subquota codex` | Render boxed quota summary and refresh footer |
| `/oai-subquota refresh` | Force a fresh backend query |
| `/oai-subquota statusline` | Print compact single-line quota text |
| `/oai-subquota chatgpt` | Inspect parked ChatGPT OAuth quota status |

Authenticate with `/login openai-codex`. Snapshots are cached under `$XDG_CACHE_HOME/oai-subquota/usage.json` (or `~/.cache/oai-subquota/usage.json`) for 60 seconds.
