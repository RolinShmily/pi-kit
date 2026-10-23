# pi-kit

Pi extensions and prompt templates distributed together as **`@rol1n/pi-kit`** and individually as **`@rol1n/<extension>`**. Each extension directory contains its own `index.ts` and `README.md`.

## Install

```sh
pi install npm:@rol1n/pi-kit
```

Install from GitHub or a local checkout:

```sh
pi install https://github.com/RolinShmily/pi-kit
pi install /absolute/path/to/pi-kit
```

Update with `pi update npm:@rol1n/pi-kit` or `pi update --extensions`.

## Extensions

| Extension | Purpose | Default in kit | Standalone npm |
|---|---|---|---|
| [ask-u-questions](ask-u-questions/README.md) | Interactive single/multi-choice and text dialogs | Yes | `@rol1n/ask-u-questions` |
| [continue-signal](continue-signal/README.md) | Resume an idle agent via `/continue` or Alt+C | Yes | `@rol1n/continue-signal` |
| [custom-providers](custom-providers/README.md) | Additional model providers and gateway registration | Yes | `@rol1n/custom-providers` |
| [image-generate](image-generate/README.md) | Image generation tool and `/image-generate` selector | Yes | `@rol1n/image-generate` |
| [memory-log](memory-log/README.md) | Background observational memory and compaction | Yes | `@rol1n/memory-log` |
| [model-vision](model-vision/README.md) | Image understanding and OCR tool | No | `@rol1n/model-vision` |
| [multi-harness](multi-harness/README.md) | Delegate to Pi, Codex, Claude, and OpenCode | Yes | `@rol1n/multi-harness` |
| [oai-subquota](oai-subquota/README.md) | OpenAI Codex subscription quota monitor | Yes | `@rol1n/oai-subquota` |
| [prompt-snipaste](prompt-snipaste/README.md) | Select prompt snippets for the next user message (bundles 7 built-in prompts) | Yes | `@rol1n/prompt-snipaste` |
| [screenshot](screenshot/README.md) | Insert the latest Windows/WSL screenshot path | No | `@rol1n/screenshot` |
| [srp-theme](srp-theme/README.md) | Prompt preview footer and streaming TPS meter | Yes | `@rol1n/srp-theme` |
| [subagent](subagent/README.md) | Delegate to asynchronous Pi workers | Yes | `@rol1n/subagent` |
| [tui-asr](tui-asr/README.md) | Streaming voice dictation via DashScope ASR | Yes | `@rol1n/tui-asr` |
| [web-reach](web-reach/README.md) | Keyless Exa web search and multi-tier page extraction | No | `@rol1n/web-reach` |
| [windows-wheel-fix](windows-wheel-fix/README.md) | Windows ConPTY/Zellij mouse-wheel reporting fix | Yes (Windows only) | `@rol1n/windows-wheel-fix` |

## Resource selection

The kit exposes 12 extension entrypoints and the 7 prompt templates bundled in [prompt-snipaste/prompts](prompt-snipaste/prompts/). Narrow loaded resources with `pi config` or in `settings.json`:

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

## Build and publish

[kit.config.json](kit.config.json) controls which extensions are bundled into `@rol1n/pi-kit` (`bundle: true`) and inter-extension npm dependencies (`deps`).

```sh
# Sync package.json from kit.config.json and validate
npm run manifest
npm run check

# Stage any extension into dist/<id>
npm run prepare:extension -- subagent

# Publish all standalone extensions, or the kit, or one extension
npm run publish:ci -- extensions
npm run publish:ci -- kit
npm run publish:ci -- tui-asr
```

GitHub Actions OIDC Trusted Publishing is configured in [`.github/workflows/publish.yml`](.github/workflows/publish.yml).
