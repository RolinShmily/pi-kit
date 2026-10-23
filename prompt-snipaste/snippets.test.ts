import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadSnippets, parseSnippet } from "./snippets.ts";

type Command = ReturnType<ExtensionAPI["getCommands"]>[number];
const registry = (commands: Command[]) => ({ getCommands: () => commands });
function prompt(path: string, overrides: Partial<Command> = {}): Command {
  return { name: "arbitrary-template", source: "prompt", sourceInfo: { path, source: "test", scope: "user", origin: "package" }, ...overrides };
}
function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "prompt-snipaste-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return {
    root,
    file(name: string, body: string): string {
      const path = join(root, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, body);
      return path;
    },
  };
}

test("plain Markdown works without any snippet-specific metadata", () => {
  const snippet = parseSnippet("team-review.md", "# Review code\n\nKeep the original text.");
  assert.deepEqual(snippet, { id: "team-review.md", name: "team-review", description: "Review code", placement: "append", order: 100, body: "# Review code\n\nKeep the original text." });
});

test("optional metadata accepts BOM/CRLF and preserves raw prompt placeholders", () => {
  const snippet = parseSnippet("anything.md", '\uFEFF---\r\nname: "Project rules"\r\ndescription: Team conventions\r\nplacement: prepend\r\norder: 5\r\n---\r\nReview $1 and ${@:-all changes}.\r\n');
  assert.equal(snippet?.name, "Project rules");
  assert.equal(snippet?.placement, "prepend");
  assert.equal(snippet?.order, 5);
  assert.equal(snippet?.body, "Review $1 and ${@:-all changes}.");
});

test("invalid optional values use defaults and empty bodies are ignored", () => {
  const snippet = parseSnippet("generic.md", "---\nplacement: unknown\norder: not-a-number\n---\nContent");
  assert.equal(snippet?.placement, "append");
  assert.equal(snippet?.order, 100);
  assert.equal(parseSnippet("empty.md", " \n"), null);
  assert.equal(parseSnippet("empty.md", "---\ndescription: no body\n---\n"), null);
});

test("only Pi-resolved prompt commands are loaded, regardless of directory or name", (t) => {
  const f = fixture(t);
  const path = f.file("third-party/custom-location/unrelated-name.md", "Any reusable instructions.");
  const ignored = f.file("project/.pi/prompts/not-enabled.md", "Must not appear.");
  const snippets = loadSnippets(registry([
    prompt(path, { description: "Pi-resolved description" }),
    prompt(ignored, { source: "extension" }),
    prompt(ignored, { source: "skill" }),
  ]));
  assert.equal(snippets.length, 1);
  assert.equal(snippets[0].id, path);
  assert.equal(snippets[0].body, "Any reusable instructions.");
  assert.equal(snippets[0].description, "Pi-resolved description");
});

test("an empty registry never scans package, personal or project prompt folders", (t) => {
  const f = fixture(t);
  f.file("prompts/available-on-disk.md", "Not enabled by Pi.");
  f.file(".pi/prompts/available-on-disk.md", "Not enabled by Pi.");
  assert.deepEqual(loadSnippets(registry([])), []);
});

test("changes to Pi's enabled templates apply on every refresh without cached fallback", (t) => {
  const f = fixture(t);
  const a = f.file("one.md", "One");
  const b = f.file("two.md", "Two");
  let commands = [prompt(a), prompt(b)];
  const pi = { getCommands: () => commands };
  assert.equal(loadSnippets(pi).length, 2);
  commands = [prompt(b)];
  assert.deepEqual(loadSnippets(pi).map((s) => s.id), [b]);
  commands = [];
  assert.deepEqual(loadSnippets(pi), []);
});

test("same-named files from different prompt sources keep independent identities", (t) => {
  const f = fixture(t);
  const a = f.file("personal/review.md", "Personal review");
  const b = f.file("package/review.md", "Package review");
  const snippets = loadSnippets(registry([prompt(a), prompt(b)]));
  assert.equal(snippets.length, 2);
  assert.deepEqual(new Set(snippets.map((s) => s.id)), new Set([a, b]));
  assert.deepEqual(new Set(snippets.map((s) => s.body)), new Set(["Personal review", "Package review"]));
});

test("duplicate references to the same source file produce one snippet", (t) => {
  const f = fixture(t);
  const path = f.file("notes.md", "Notes");
  assert.equal(loadSnippets(registry([prompt(path), prompt(path, { name: "alias" })])).length, 1);
});

test("selection order is placement, numeric order, then display name", (t) => {
  const f = fixture(t);
  const a = f.file("a.md", "---\nname: A\norder: 10\n---\nA");
  const b = f.file("b.md", "---\nname: B\norder: 10\n---\nB");
  const c = f.file("c.md", "---\nplacement: prepend\norder: 100\n---\nC");
  assert.deepEqual(loadSnippets(registry([prompt(b), prompt(a), prompt(c)])).map((s) => s.id), [c, a, b]);
});

test("missing/unreadable source paths are reported and do not hide readable templates", (t) => {
  const f = fixture(t);
  const valid = f.file("valid.md", "Available");
  const directory = join(f.root, "directory.md");
  mkdirSync(directory);
  const errors: string[] = [];
  t.mock.method(console, "error", (message: string) => errors.push(message));
  const snippets = loadSnippets(registry([prompt(join(f.root, "missing.md")), prompt(directory), prompt(valid)]));
  assert.deepEqual(snippets.map((s) => s.id), [valid]);
  assert.equal(errors.length, 2);
  assert.ok(errors.every((message) => message.includes("cannot read enabled prompt")));
});

test("non-Markdown and empty prompt files are ignored", (t) => {
  const f = fixture(t);
  const other = f.file("instructions.txt", "Not a Markdown template");
  const empty = f.file("empty.md", "");
  assert.deepEqual(loadSnippets(registry([prompt(other), prompt(empty)])), []);
});

test("registry errors propagate rather than enabling hidden filesystem fallbacks", () => {
  assert.throws(() => loadSnippets({ getCommands() { throw new Error("Runtime unavailable"); } }), /Runtime unavailable/);
});
