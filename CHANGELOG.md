# Changelog

All notable changes to the `@rol1n/pi-kit` package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
