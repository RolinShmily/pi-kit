import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "scripts", "changelog-section.mjs");

const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

// Real CHANGELOG.md, as the release workflow consumes it.
describe("changelog-section against CHANGELOG.md", () => {
  it("prints only the requested version's body", () => {
    const result = run("0.2.1");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /frontend-tech-preset/);
    assert.doesNotMatch(result.stdout, /^## /m, "Section heading must not be part of the notes");
    assert.doesNotMatch(result.stdout, /Native extension update changelog support/, "Must stop at the next version");
  });

  it("accepts a v-prefixed tag name", () => {
    const result = run("v0.2.0");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Native extension update changelog support/);
  });

  it("reads the final section up to end of file", () => {
    const result = run("0.1.3");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Unified package bundle/);
  });

  it("rejects a version prefix that does not exist", () => {
    const result = run("0.2");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no section for version 0\.2/);
  });

  it("fails when the version has no section", () => {
    const result = run("9.9.9");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no section for version 9\.9\.9/);
  });

  it("fails without a version argument", () => {
    const result = run();
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage:/);
  });
});

describe("changelog-section with fixtures", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pi-kit-changelog-"));
  after(() => rmSync(fixtureDir, { recursive: true, force: true }));

  const fixture = (name, contents) => {
    const path = join(fixtureDir, name);
    writeFileSync(path, contents);
    return path;
  };

  it("rejects a heading with no body", () => {
    const path = fixture("empty.md", "## [1.0.0] - 2026-01-01\n\n## [0.9.0] - 2025-12-01\n\n### Added\n- Old.\n");
    const result = run("1.0.0", path);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /section for version 1\.0\.0 is empty/);
  });

  it("handles CRLF line endings and headings without brackets", () => {
    const path = fixture("crlf.md", "## 2.1.0 - 2026-02-02\r\n\r\n### Added\r\n- Windows friendly.\r\n\r\n## 2.0.0 - 2026-01-01\r\n\r\n- Older.\r\n");
    const result = run("2.1.0", path);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "### Added\n- Windows friendly.\n");
  });

  it("does not leak into the next section when versions share a prefix", () => {
    const path = fixture("prefix.md", "## [2.0.0] - 2026-01-01\n\n- Two.\n\n## [2.0.1] - 2026-01-02\n\n- Ten one.\n");
    const result = run("2.0.0", path);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "- Two.\n");
  });
});
