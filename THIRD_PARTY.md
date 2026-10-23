# Third-party source inventory

This repository starts from the current working-tree contents of `srp-dotfiles/pi/extensions`, `pi/prompts`, and `pi/packages`. The source checkout was clean at import and its commit was `54dce5772dc880d7b0555c6a0766670f144a95e8`; this identifies the dotfiles snapshot, not an upstream fork revision. Existing authorship comments and license files are preserved. This inventory records available evidence; it does not grant a new license to imported code.

## packages/pi-learn

- Upstream: https://github.com/amosblomqvist/learn (identified by the imported README).
- Import source: `srp-dotfiles/pi/packages/pi-learn`.
- Status: locally modified third-party fork, not an official upstream release.
- Exact upstream commit: not recorded in the imported directory.
- Existing license: `packages/pi-learn/subagents/LICENSE` applies to that embedded component; no complete-project root license was present in the import. Verify the upstream license scope before redistributing the complete fork.
- Existing nested package manifests and their dependency versions are retained.
- pi-kit adjustments after import: the legacy bootstrap no longer writes global agent files; the bundled runtime already discovers package-local agents. Mermaid CLI lookup searches ancestor npm bin directories to support hoisted dependencies in aggregate and standalone releases.

## Embedded subagents

The `packages/pi-learn/subagents/` README identifies https://github.com/amosblomqvist/pi-interactive-subagents and the original https://github.com/HazAT/pi-interactive-subagents. Its MIT LICENSE (copyright 2026 HazAT) is retained together with its existing local modifications. Refer to those files for the component attribution. Do not treat that component license as blanket coverage for the surrounding learning package.

## Extensions and prompt templates

Files retain the authorship comments, upstream issue links, and attribution already present in srp-dotfiles. Moving a file under `extensions/` does not change its original ownership or make it wholly original code. No repository-wide replacement license was inferred during this migration.

pi-kit portability adjustments: Magpie now accepts `MAGPIE_BASE_URL` with a loopback default and uses the host's public provider collection instead of an absolute Windows fallback path. Multi-harness documentation and its optional worktree-studio skill reference were updated for the extracted repository.
