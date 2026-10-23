import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

assert.equal(manifest.name, "@rol1n/pi-kit");
assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "Expected a release version in package.json");
assert.equal(manifest.type, "module");
assert.equal(manifest.license, "MIT");
assert.ok(manifest.keywords.includes("pi-package"), "Missing pi-package discovery keyword");
assert.ok(Array.isArray(manifest.files), "Expected a files allowlist");

// Validate the hand-maintained manifest; never generate or rewrite it.
const extensions = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "index.ts")))
  .map((entry) => entry.name)
  .sort();
assert.ok(extensions.length > 0, "No extension directories found");
assert.deepEqual(
  [...manifest.pi.extensions].sort(),
  extensions.map((name) => `./${name}/index.ts`),
  "pi.extensions must declare every top-level extension exactly once",
);
for (const name of extensions) {
  assert.ok(existsSync(join(root, name, "README.md")), `Missing ${name}/README.md`);
  assert.ok(manifest.files.includes(name), `files must include the complete ${name} directory`);
}

assert.deepEqual(manifest.pi.prompts, ["./prompts"], "pi.prompts must declare the independent root prompts directory");
assert.ok(manifest.files.includes("prompts"), "files must include the root prompts directory");
assert.ok(existsSync(join(root, "prompts")), "Missing root prompts directory");
assert.deepEqual(manifest.pi.skills, ["./skills"], "pi.skills must declare the root skills directory");
assert.ok(manifest.files.includes("skills"), "files must include the root skills directory");
const skills = readdirSync(join(root, "skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(root, "skills", entry.name, "SKILL.md")))
  .map((entry) => entry.name);
assert.ok(skills.length > 0, "Expected at least one skill directory containing SKILL.md");
assert.deepEqual(manifest.pi.themes, []);
for (const name of ["@earendil-works/pi-ai", "@earendil-works/pi-agent-core", "@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox"]) {
  assert.equal(manifest.peerDependencies[name], "*", `${name} must remain a host-provided peer`);
  assert.ok(!manifest.dependencies?.[name], `Do not install a separate copy of ${name}`);
}
for (const exclusion of ["!**/test/**", "!**/tests/**", "!**/*.{test,spec}.{ts,js,mjs,cjs}", "!**/.env", "!**/.env.*"]) {
  assert.ok(manifest.files.includes(exclusion), `Missing package exclusion: ${exclusion}`);
}
for (const path of ["LICENSE", "README.md", "README_zh.md", "scripts/check-package.mjs"]) {
  assert.ok(existsSync(join(root, path)), `Missing ${path}`);
}

const promptCount = readdirSync(join(root, "prompts")).filter((name) => name.endsWith(".md")).length;
console.log(`Checked ${manifest.name}@${manifest.version}: ${extensions.length} extensions, ${promptCount} prompts, ${skills.length} skill${skills.length === 1 ? "" : "s"}.`);
