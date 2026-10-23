# pi-kit

> One package of modular extensions, prompt templates, and skills for the [Pi Coding Agent](https://pi.dev). Install **`@rol1n/pi-kit`**, then choose what loads through Pi settings.

<p align="left">
  <b>English</b> •
  <a href="README_zh.md"><b>中文说明</b></a>
</p>

[![npm version](https://img.shields.io/npm/v/@rol1n/pi-kit?style=flat-square&logo=npm)](https://www.npmjs.com/package/@rol1n/pi-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

---

## Install

```sh
pi install npm:@rol1n/pi-kit
```

The package includes **15 extension entrypoints, 7 prompt templates, and the worktree-studio skill**. Extensions and prompt commands load by default; skill instructions are read on demand. No separate extension packages are needed. See [Resource Selection](#resource-selection) to disable extensions or use an allowlist. Individual features may still require credentials, platform support, or activation (`/mem-log on` for background memory).

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

Each top-level extension directory has an `index.ts` entrypoint and an English README covering its commands, parameters, and configuration. All entries below are declared in `package.json`:

| Extension | Description | Entry path for settings |
| :--- | :--- | :--- |
| [ask-u-questions](ask-u-questions/README.md) | Interactive single-choice, multi-choice, and text dialogs | `ask-u-questions/index.ts` |
| [continue-signal](continue-signal/README.md) | Resume an idle agent via `/continue` or `Alt+C` | `continue-signal/index.ts` |
| [custom-providers](custom-providers/README.md) | Additional model providers and gateway registration | `custom-providers/index.ts` |
| [image-generate](image-generate/README.md) | Image generation tool and `/image-generate` model selector | `image-generate/index.ts` |
| [memory-log](memory-log/README.md) | Tiered observational memory, source recall, and safe compaction | `memory-log/index.ts` |
| [model-vision](model-vision/README.md) | Image understanding and OCR (`model_vision`) | `model-vision/index.ts` |
| [multi-harness](multi-harness/README.md) | Delegate across `pi`, `codex`, `claude`, and `opencode` | `multi-harness/index.ts` |
| [oai-subquota](oai-subquota/README.md) | OpenAI Codex subscription quota monitor | `oai-subquota/index.ts` |
| [prompt-snipaste](prompt-snipaste/README.md) | Generic selector for enabled Pi prompts (`/snipaste`, `Alt+S`) | `prompt-snipaste/index.ts` |
| [screenshot](screenshot/README.md) | Insert the latest Windows/WSL screenshot path | `screenshot/index.ts` |
| [srp-theme](srp-theme/README.md) | Last-prompt preview and streaming TPS meter | `srp-theme/index.ts` |
| [subagent](subagent/README.md) | Parallel Pi workers in tmux/Zellij or background processes | `subagent/index.ts` |
| [tui-asr](tui-asr/README.md) | DashScope voice dictation (`/asr`, `Alt+M`) | `tui-asr/index.ts` |
| [web-reach](web-reach/README.md) | Keyless Exa MCP search and multi-tier page extraction | `web-reach/index.ts` |
| [windows-wheel-fix](windows-wheel-fix/README.md) | Windows ConPTY / Zellij wheel fix; no-op elsewhere | `windows-wheel-fix/index.ts` |

---

## Skills

The root [`skills/`](skills/) directory is declared through `pi.skills` and distributed in the same npm package. Skills are instructions, not extension code: Pi advertises their metadata and reads the full document when needed.

| Skill | Purpose |
| :--- | :--- |
| [worktree-studio](skills/worktree-studio/SKILL.md) | Plan isolated Git-worktree alternatives, delegate implementation, collect real diffs and verification, and compare results without automatically integrating or deleting them |

Invoke it explicitly with `/skill:worktree-studio Compare the viable approaches for this change`. Git and a suitable delegation runtime are needed for experiments; `multi_harness` and `subagent` are available options. The skill requires confirmation before creating worktrees or launching paid workers. It never treats exploration approval as permission to merge, commit, or discard results.

To load only this skill, without any kit extensions or prompt templates:

```json
{
  "packages": [
    {
      "source": "npm:@rol1n/pi-kit",
      "extensions": [],
      "prompts": [],
      "skills": ["skills/worktree-studio/SKILL.md"]
    }
  ]
}
```

Remove older local copies from configured skill locations to avoid duplicate skill names. Setting `"skills": []` on this package disables its skills independently of extensions and prompts.

---

## Prompt Templates

The root [`prompts/`](prompts/) directory is an independent, standard Pi resource, declared as `"pi": { "prompts": ["./prompts"] }` in `package.json`. It does not belong to or require the `prompt-snipaste` extension.

Templates become normal Pi slash commands: [/ask-questions](prompts/ask-questions.md), [/delegate-exploration](prompts/delegate-exploration.md), [/diagnose-report](prompts/diagnose-report.md), [/frontend-tech-preset](prompts/frontend-tech-preset.md), [/orchestrator-mode](prompts/orchestrator-mode.md), [/session-kickoff](prompts/session-kickoff.md), and [/verify-not-assume](prompts/verify-not-assume.md). They remain available when `prompt-snipaste` is disabled, or even with `"extensions": []`.

To use only the directory from a local checkout, reference it through the top-level `prompts` setting; no extension needs to be loaded:

```json
{
  "prompts": ["/absolute/path/to/pi-kit/prompts"]
}
```

Existing filters using `prompt-snipaste/prompts/...` must be changed to `prompts/...` after updating.

Conversely, `prompt-snipaste` is a generic composer for **any enabled Pi prompt templates** from personal, trusted project, or package sources. It has no required template names or bundled fallback library.

---

## Resource Selection

Edit `~/.pi/agent/settings.json` (personal) or `.pi/settings.json` (project). Replace the existing `"npm:@rol1n/pi-kit"` string inside `packages` with an object; keep your other packages. **`source` belongs inside `packages[]`, not at the top level.** Paths are relative to the installed package root, not the startup listing's `@rol1n/pi-kit:...` labels.

### Disable selected extensions

This loads everything except voice dictation, web search/extraction, and the Windows wheel fix. Omitting `prompts` and `skills` keeps all 7 templates and the bundled skill available:

```json
{
  "packages": [
    {
      "source": "npm:@rol1n/pi-kit",
      "extensions": [
        "!tui-asr/**",
        "!web-reach/**",
        "!windows-wheel-fix/**"
      ]
    }
  ]
}
```

### Load only selected extensions

This loads only memory and Pi subagents, with no bundled prompt commands or skills:

```json
{
  "packages": [
    {
      "source": "npm:@rol1n/pi-kit",
      "extensions": ["memory-log/index.ts", "subagent/index.ts"],
      "prompts": [],
      "skills": []
    }
  ]
}
```

### Filter rules

| Setting | Effect |
| :--- | :--- |
| Property omitted | Load all resources of that type declared by the package |
| `"extensions": []` | Disable all extension entrypoints, without disabling prompts or skills |
| `"extensions": ["!tui-asr/**"]` | Load all entrypoints except matches |
| `"extensions": ["memory-log/index.ts"]` | Load only matching entrypoints |
| `"extensions": ["-tui-asr/index.ts"]` | Exclude one exact entry path |
| `"prompts": ["prompts/diagnose-report.md"]` | Load only that prompt template |
| `"prompts": []` | Disable all bundled prompt templates |
| `"skills": []` | Disable all bundled skills |
| `"skills": ["skills/worktree-studio/SKILL.md"]` | Load only that skill |

Run `/reload` or restart Pi after editing. Alternatively, run `pi config` in a terminal to toggle discovered resources interactively. Use an allowlist if newly added extensions should remain disabled after future kit updates.

### Dependencies and overlapping tools

Filtering controls entrypoint loading, not installation or imports. `image-generate` and `tui-asr` initialize the shared `custom-providers` module themselves; exclude all three entries if you do not want those providers registered. `multi-harness` uses shared helpers from `subagent/mux.ts` without requiring the `subagent` tool entry to load. These files ship in the same package; there are no sibling npm packages to install.

Disable overlapping entries when another package already provides the same tool, especially `web-reach` (`web_search`, `web_fetch`) and `image-generate` (`image_generate`). Extensions and the root `prompts/` resource are independent. Disabling `prompt-snipaste/index.ts` leaves template commands available; filtering out all kit prompts leaves the selector free to use enabled prompts from other sources.

### Migrating from standalone packages

This repository now releases only `@rol1n/pi-kit`. Previously published standalone versions remain on npm but receive no further releases from this workflow. Remove old standalone declarations before enabling the same extensions through the kit to avoid duplicate registration; use the filters above instead.

---

## Development & Publishing

[package.json](package.json) is the single source of package metadata, the release version, published files, and Pi resources. Edit it directly; no manifest generation or standalone staging is needed. When adding an extension, list its directory in `files` and its entrypoint in `pi.extensions` so it is included by default. Add skills as `skills/<name>/SKILL.md` and prompt templates as `prompts/<name>.md`; the declared root resource directories already cover them.

```sh
npm run check                      # Validate the manifest and extension coverage
npm test                           # Run offline memory-log and prompt selector tests
npm pack --dry-run --ignore-scripts # Inspect the npm package contents
```

### Releases

1. Make your changes and bump `version` directly in `package.json`.
2. Push to `main`, or manually run **Publish to npm** in GitHub Actions.
3. [The workflow](.github/workflows/publish.yml) validates the package, runs tests, and publishes **only the root `@rol1n/pi-kit` package** with npm provenance. Existing versions are skipped; registry/network errors fail the job rather than being treated as an unpublished version.

Automatic runs watch `package.json`, the validation script, and the workflow itself. Code-only pushes do not publish; bump the version when ready to release. Runs are serialized without cancelling an active publish. CI uses the configured npm Trusted Publisher, or `NPM_TOKEN` if provided, and never rewrites the manifest or bumps versions.

For an authorized local release, use the normal npm command: `npm publish --access public`.

---

## Acknowledgements

- [elpapi42/pi-observational-memory](https://github.com/elpapi42/pi-observational-memory) — Observational memory architecture and inspiration for [`memory-log`](memory-log/README.md).
- [earendil-works/pi](https://github.com/earendil-works/pi) — The Pi coding agent harness and SDK.

---

## License

[MIT](LICENSE) © RoL1n_SrP
