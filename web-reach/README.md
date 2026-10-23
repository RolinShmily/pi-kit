# web-reach

Keyless web search (`web_search` via Exa MCP) and multi-tier page extraction (`web_fetch` supporting Next.js RSC, semantic HTML-to-Markdown, optional `unpdf` PDF extraction, and Jina Reader fallback).

## Install

```sh
pi install npm:@rol1n/web-reach
```

Also included in `@rol1n/pi-kit`.

## Configuration

| Environment variable | Default |
|---|---|
| `SRP_WEB_SEARCH_TIMEOUT_MS` | `60000` |
| `SRP_WEB_FETCH_TIMEOUT_MS` | `20000` |
| `SRP_WEB_FETCH_MAX_BYTES` | `4194304` (4 MiB) |
