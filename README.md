# pi-kit

> Modular extensions and prompt templates for the [Pi Coding Agent](https://pi.dev), published as the **`@rol1n/pi-kit`** bundle and as standalone **`@rol1n/<extension>`** packages.

<p align="left">
  <b>English</b> •
  <a href="README_zh.md"><b>中文说明</b></a>
</p>

[![npm version](https://img.shields.io/npm/v/@rol1n/pi-kit?style=flat-square&logo=npm)](https://www.npmjs.com/package/@rol1n/pi-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

---

## Install

Install the default bundle:

```sh
pi install npm:@rol1n/pi-kit
```

Or install any standalone extension individually:

```sh
pi install npm:@rol1n/memory-log
pi install npm:@rol1n/subagent
pi install npm:@rol1n/multi-harness
```

Install from GitHub or a local checkout during development:

```sh
pi install https://github.com/RolinShmily/pi-kit
pi install /absolute/path/to/pi-kit
```

Update installed packages:

```sh
pi update npm:@rol1n/pi-kit
pi update --extensions
```

---

## Extensions

Each top-level directory is a self-contained extension (`<name>/index.ts` + `README.md`). Detailed commands, parameters, and settings are documented in each extension's README:

| Extension | Description | In `@rol1n/pi-kit` | Standalone Package |
| :--- | :--- | :---: | :--- |
| [ask-u-questions](ask-u-questions/README.md) | Interactive single-choice, multi-choice, and text dialogs | Yes | `@rol1n/ask-u-questions` |
| [continue-signal](continue-signal/README.md) | Resume an idle agent via `/continue` or `Alt+C` | Yes | `@rol1n/continue-signal` |
| [custom-providers](custom-providers/README.md) | Additional model providers and gateway registration | Yes | `@rol1n/custom-providers` |
| [image-generate](image-generate/README.md) | Image generation tool and `/image-generate` model selector | Yes | `@rol1n/image-generate` |
| [memory-log](memory-log/README.md) | Tiered asynchronous observational memory and instant compaction | Yes | `@rol1n/memory-log` |
| [model-vision](model-vision/README.md) | Image understanding and OCR tool (`model_vision`) | No | `@rol1n/model-vision` |
| [multi-harness](multi-harness/README.md) | Delegate tasks across `pi`, `codex`, `claude`, and `opencode` | Yes | `@rol1n/multi-harness` |
| [oai-subquota](oai-subquota/README.md) | OpenAI Codex subscription quota monitor and statusline | Yes | `@rol1n/oai-subquota` |
| [prompt-snipaste](prompt-snipaste/README.md) | Prompt snippet selector (`/snipaste`, `Alt+S`) with 7 built-in prompts | Yes | `@rol1n/prompt-snipaste` |
| [screenshot](screenshot/README.md) | Insert the latest Windows/WSL screenshot path (`/screenshot`) | No | `@rol1n/screenshot` |
| [srp-theme](srp-theme/README.md) | Last-prompt preview widget and real-time streaming TPS meter | Yes | `@rol1n/srp-theme` |
| [subagent](subagent/README.md) | Delegate tasks to parallel Pi workers in tmux/Zellij or background processes | Yes | `@rol1n/subagent` |
| [tui-asr](tui-asr/README.md) | Streaming voice dictation via Aliyun DashScope ASR (`/asr`, `Alt+M`) | Yes | `@rol1n/tui-asr` |
| [web-reach](web-reach/README.md) | Keyless Exa MCP web search and multi-tier page extraction | No | `@rol1n/web-reach` |
| [windows-wheel-fix](windows-wheel-fix/README.md) | Windows ConPTY / Zellij mouse-wheel reporting fix | Yes (Windows) | `@rol1n/windows-wheel-fix` |

> Standalone packages with cross-extension dependencies (`tui-asr` / `image-generate` -> `@rol1n/custom-providers`, `multi-harness` -> `@rol1n/subagent`) declare standard npm `dependencies` and resolve them automatically on install.

---

## Resource Selection

`@rol1n/pi-kit` exposes 12 extension entrypoints and the 7 prompt templates bundled in [prompt-snipaste/prompts](prompt-snipaste/prompts/). Use `pi config` or filter loaded resources in `settings.json`:

```json
{
  "packages": [
    {
      "source": "npm:@rol1n/pi-kit",
      "extensions": ["**/*.ts", "!tui-asr/**"],
      "prompts": ["prompt-snipaste/prompts/diagnose-report.md"]
    }
  ]
}
```

---

## Development & Publishing

[kit.config.json](kit.config.json) defines which extensions are bundled into `@rol1n/pi-kit` (`bundle: true`) and declares inter-extension dependencies (`deps`).

```sh
# Sync package.json from kit.config.json and validate all extensions
npm run manifest
npm run check

# Stage a standalone package into dist/<id>
npm run prepare:extension -- memory-log

# Publish updated packages (extensions, kit, all, or a single extension ID)
npm run publish:ci -- extensions
npm run publish:ci -- kit
```

Automated releases run via GitHub Actions in [`.github/workflows/publish.yml`](.github/workflows/publish.yml).

---

## Acknowledgements

- [elpapi42/pi-observational-memory](https://github.com/elpapi42/pi-observational-memory) — Observational memory architecture and inspiration for [`memory-log`](memory-log/README.md).
- [earendil-works/pi](https://github.com/earendil-works/pi) — The Pi coding agent harness and SDK.

---

## License

[MIT](LICENSE) © RoL1n_SrP
