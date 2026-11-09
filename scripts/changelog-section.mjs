import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Prints the CHANGELOG section body for one version, for use as GitHub Release
// notes. Exits non-zero when the version has no section or the section is empty,
// so a tag can never ship an empty release body.
//
// Usage: node scripts/changelog-section.mjs <version> [changelogPath]
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [rawVersion, explicitChangelog] = process.argv.slice(2);
const version = (rawVersion ?? "").trim().replace(/^v/, "");

if (!version) {
  console.error("Usage: node scripts/changelog-section.mjs <version> [changelogPath]");
  process.exit(2);
}

const changelogPath = explicitChangelog ? resolve(explicitChangelog) : join(root, "CHANGELOG.md");
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isVersionHeading = new RegExp(`^##\\s+\\[?v?${escapeRegex(version)}\\]?(?:\\s|$)`);
const isSectionHeading = /^##\s+/;

const lines = readFileSync(changelogPath, "utf8").split(/\r?\n/);
const start = lines.findIndex((line) => isVersionHeading.test(line));

if (start === -1) {
  console.error(`CHANGELOG has no section for version ${version} (${changelogPath})`);
  process.exit(1);
}

const body = [];
for (let index = start + 1; index < lines.length; index += 1) {
  if (isSectionHeading.test(lines[index])) break;
  body.push(lines[index]);
}

const section = body.join("\n").trim();
if (!section) {
  console.error(`CHANGELOG section for version ${version} is empty (${changelogPath})`);
  process.exit(1);
}

process.stdout.write(`${section}\n`);
