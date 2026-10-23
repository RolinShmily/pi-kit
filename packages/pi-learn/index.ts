/**
 * pi-learn — compatibility entry for existing package manifests.
 *
 * subagents/index.ts discovers ../agents directly, then lets personal and
 * project definitions override them. Loading a package must not copy, unlink,
 * or replace the user's global agent definitions.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function piLearn(_pi: ExtensionAPI): void {
  // Agent discovery belongs to the bundled subagent runtime; no setup is needed.
}
