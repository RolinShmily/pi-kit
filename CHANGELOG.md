# Changelog

All notable changes to the `@rol1n/pi-kit` package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.5] - 2026-11-17

### Fixed
- `custom-providers` / `magpie-lan`: a gateway on this machine no longer asks for an API key. Magpie's gateway listens on loopback and accepts any token there (`gateway.Token` is the literal `magpie`, which magpie itself writes into an agent's config), but Pi hides a provider whose auth cannot resolve, so the provider now falls back to that local token instead of requiring `MAGPIE_*_GATEWAY_KEY` or `/login magpie-lan`. Model discovery also runs over loopback without a key. A gateway beyond loopback (`MAGPIE_LAN_BASE_URL` on the LAN, sharing on) still needs a real gateway key; a stored `/login` credential still takes precedence over the local token.

## [0.2.4] - 2026-11-10

### Changed
- Renamed `magpie` provider to `magpie-lan` in `custom-providers`.
- Updated model refresh mechanism to only pull models over the network when an API key is provided (via environment variables or `/login magpie-lan`), preventing continuous refresh failures and API key prompts in the model selector.

## [0.2.3] - 2026-11-10

### Removed
- Removed the `shuaiapi` provider from `custom-providers`.

## [0.2.2] - 2026-11-09

### Changed
- Releases are now driven only by `v*` tag pushes: the tag publishes to npm and `CHANGELOG.md` for that version becomes the GitHub Release body.

## [0.2.1] - 2026-11-09

### Removed
- The `frontend-tech-preset` prompt template (`prompts/frontend-tech-preset.md`); the `prompts/` directory now ships 6 templates and the README command lists match.

## [0.2.0] - 2026-11-03

### Added
- Native extension update changelog support for Pi 1.5.0 (`CHANGELOG.md`).
- Terminal `blocked` status reporting in `ask-u-questions` so supported terminals (via OSC 7501) display that Pi is waiting for user input during single-choice and multi-choice prompts.

### Changed
- Validated compatibility with Pi 1.5.0 and `@earendil-works/pi-schema` parameter validation across all tools.

## [0.1.3] - 2026-11-03

### Added
- Unified package bundle with selectable extensions, independent prompt templates, and skills (`worktree-studio`).
- Safe compaction and source provenance recall in `memory-log`.
- Custom providers (`magpie`, `shuaiapi`, `bigmodel`, `dashscope`).
- Multi-harness and subagent split terminal pane execution.
- Prompt-snipaste, screenshot, ASR speech-to-text, and Windows mouse wheel fix.
