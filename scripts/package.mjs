import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const rawConfig = readJson(join(root, "kit.config.json"));
const current = readJson(join(root, "package.json"));
const scope = rawConfig.name?.startsWith("@") ? `${rawConfig.name.split("/")[0]}/` : "";
const hostPeers = Object.fromEntries([
  "@earendil-works/pi-ai", "@earendil-works/pi-agent-core",
  "@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox",
].map((name) => [name, "*"]));

function normalizeExtension(id, item = {}) {
  const directory = id;
  const promptsDir = `${directory}/prompts`;
  const prompts = Array.isArray(item.prompts)
    ? item.prompts
    : existsSync(join(root, promptsDir))
      ? [promptsDir]
      : [];
  return {
    id,
    name: item.name ?? `${scope}${id}`,
    version: item.version ?? rawConfig.version,
    bundle: Boolean(item.bundle),
    publish: Boolean(item.publish),
    entry: item.entry ?? `${directory}/index.ts`,
    readme: item.readme ?? `${directory}/README.md`,
    files: item.files ?? [directory],
    prompts,
    deps: Array.isArray(item.deps) ? item.deps : [],
    exports: item.exports && typeof item.exports === "object" ? item.exports : undefined,
  };
}

const config = {
  ...rawConfig,
  extensions: Object.fromEntries(
    Object.entries(rawConfig.extensions ?? {}).map(([id, item]) => [id, normalizeExtension(id, item)]),
  ),
};

function sourcePath(path) {
  if (typeof path !== "string" || path.length === 0 || isAbsolute(path)) {
    throw new Error(`Expected a relative source path, received ${JSON.stringify(path)}`);
  }
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || rel.split(sep).some((part) => part.startsWith("."))) {
    throw new Error(`Source path must stay inside a visible repository resource directory: ${path}`);
  }
  if (!existsSync(absolute)) throw new Error(`Missing source: ${path}`);
  return absolute;
}

function assertRelease(item, label) {
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(item.name ?? "")) {
    throw new Error(`Invalid npm name for ${label}`);
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(item.version ?? "")) {
    throw new Error(`Invalid version for ${label}`);
  }
}

function validateConfig() {
  assertRelease(config, "kit");
  for (const [id, item] of Object.entries(config.extensions)) {
    assertRelease(item, id);
    if (item.entry !== `${id}/index.ts`) throw new Error(`${id}.entry must be ${id}/index.ts`);
    if (item.readme !== `${id}/README.md`) throw new Error(`${id}.readme must be ${id}/README.md`);
    sourcePath(item.entry);
    sourcePath(item.readme);
    for (const path of item.files) sourcePath(path);
    for (const path of item.prompts) sourcePath(path);
    for (const depId of item.deps) {
      if (!config.extensions[depId]) throw new Error(`${id}.deps references unknown extension '${depId}'`);
    }
    if (item.exports) {
      for (const target of Object.values(item.exports)) {
        sourcePath(join(id, target.replace(/^\.\//, "")));
      }
    }
  }
}

function kitManifest() {
  const pi = { extensions: [], skills: [], prompts: [], themes: [] };
  const files = ["README_zh.md", ...Object.values(config.extensions).map((item) => item.readme)];
  for (const item of Object.values(config.extensions).filter((item) => item.bundle)) {
    pi.extensions.push(`./${item.entry}`);
    pi.prompts.push(...item.prompts.map((path) => `./${path}`));
    files.push(...item.files);
    for (const depId of item.deps) {
      files.push(...config.extensions[depId].files);
    }
  }
  return {
    ...current, name: config.name, version: config.version, description: config.description,
    files: [...new Set(files), "!**/test/**", "!**/tests/**", "!**/*.{test,spec}.{ts,js,mjs,cjs}", "!**/.env", "!**/.env.*"],
    peerDependencies: hostPeers, pi,
  };
}

function shouldCopy(path) {
  const parts = relative(root, path).split(sep);
  return !parts.some((part) => ["node_modules", ".git", "test", "tests"].includes(part)
    || part === ".env" || part.startsWith(".env.") || part.endsWith(".tgz"))
    && !/\.(?:test|spec)\.[cm]?[jt]s$/.test(path);
}

function resolveCrossExtensionSpecifier(sourceAbsolute, specifier, deps) {
  const targetAbsolute = resolve(dirname(sourceAbsolute), specifier);
  const relFromRoot = relative(root, targetAbsolute).split(sep).join("/");
  for (const depId of deps) {
    const dep = config.extensions[depId];
    const depPrefix = `${depId}/`;
    if (!relFromRoot.startsWith(depPrefix)) continue;
    const relInsideDep = `./${relFromRoot.slice(depPrefix.length)}`;
    if (dep.exports) {
      for (const [subpath, expTarget] of Object.entries(dep.exports)) {
        if (expTarget === relInsideDep) {
          return subpath === "." ? dep.name : `${dep.name}/${subpath.replace(/^\.\//, "")}`;
        }
      }
    }
    if (relFromRoot === dep.entry) return dep.name;
    throw new Error(`Cross-extension import ${specifier} is not exported by ${dep.name}. Add it to ${depId}.exports in kit.config.json.`);
  }
  return null;
}

function rewriteAndValidateStagedImports(directory, item) {
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const absolute = join(path, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!/\.[cm]?[jt]s$/.test(entry.name)) continue;

      const relToStage = relative(directory, absolute);
      const sourceInRepo = join(root, item.id, relToStage);
      let source = readFileSync(absolute, "utf8");
      let modified = false;

      source = source.replace(
        /((?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\(\s*))(["'])(\.[^"']+)\2/g,
        (full, prefix, quote, specifier) => {
          const targetInStage = resolve(dirname(absolute), specifier);
          const relInStage = relative(directory, targetInStage);
          if (relInStage !== ".." && !relInStage.startsWith(`..${sep}`) && existsSync(targetInStage)) {
            return full;
          }
          const rewritten = resolveCrossExtensionSpecifier(sourceInRepo, specifier, item.deps);
          if (rewritten) {
            modified = true;
            return `${prefix}${quote}${rewritten}${quote}`;
          }
          throw new Error(`Missing local import in release: ${relToStage} -> ${specifier}`);
        },
      );

      if (modified) {
        writeFileSync(absolute, source, "utf8");
      }
    }
  };
  walk(directory);
}

function stage(id, item, manifest) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Invalid release id: ${id}`);
  const output = join(root, "dist", id);
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  cpSync(sourcePath(id), output, { recursive: true, filter: shouldCopy });
  if (existsSync(join(root, "LICENSE"))) {
    cpSync(join(root, "LICENSE"), join(output, "LICENSE"));
  }
  writeFileSync(join(output, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  rewriteAndValidateStagedImports(output, item);
  console.log(`Prepared ${item.name}@${item.version}: ${output}`);
  console.log(`Inspect with: npm pack "${output}" --dry-run --ignore-scripts`);
  return output;
}

function stageExtension(id) {
  const item = config.extensions[id];
  if (!item) throw new Error(`Unknown extension: ${id ?? "(missing id)"}. Choices: ${Object.keys(config.extensions).join(", ")}`);
  const dependencies = Object.fromEntries(
    item.deps.map((depId) => {
      const dep = config.extensions[depId];
      return [dep.name, `^${dep.version}`];
    }),
  );
  const stagedPrompts = item.prompts.map((path) => `./${relative(id, path).split(sep).join("/")}`);
  return stage(id, item, {
    name: item.name,
    version: item.version,
    type: "module",
    description: `${id} extension from pi-kit`,
    author: current.author,
    license: current.license,
    keywords: ["pi-package"],
    repository: { ...current.repository, directory: id },
    homepage: current.homepage,
    bugs: current.bugs,
    engines: current.engines,
    publishConfig: current.publishConfig,
    ...(item.exports ? { exports: item.exports } : {}),
    ...(Object.keys(dependencies).length ? { dependencies } : {}),
    peerDependencies: hostPeers,
    pi: {
      extensions: ["./index.ts"],
      skills: [],
      prompts: stagedPrompts,
      themes: [],
    },
  });
}

function isVersionPublished(pkgName, version) {
  try {
    const out = execFileSync("npm", ["view", `${pkgName}@${version}`, "version"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return out === version;
  } catch (err) {
    const stderr = String(err?.stderr ?? err?.message ?? "");
    if (stderr.includes("E404") || stderr.includes("404")) return false;
    throw new Error(`Failed to query npm registry for ${pkgName}@${version}: ${stderr.trim()}`);
  }
}

function runNpmPublish(dir, pkgName, version) {
  const args = ["publish", dir, "--access", "public"];
  if (process.env.GITHUB_ACTIONS === "true") args.push("--provenance");
  console.log(`Publishing ${pkgName}@${version} from ${dir}...`);
  execFileSync("npm", args, { cwd: root, stdio: "inherit" });
}

function expandWithDeps(extIds) {
  const ordered = [];
  const visited = new Set();
  const visit = (extId) => {
    if (visited.has(extId)) return;
    visited.add(extId);
    const item = config.extensions[extId];
    for (const depId of item.deps) visit(depId);
    ordered.push(extId);
  };
  for (const id of extIds) visit(id);
  return ordered;
}

async function publishTarget(target = "auto") {
  if (JSON.stringify(current) !== JSON.stringify(kitManifest())) {
    throw new Error("package.json differs from kit.config.json; run npm run manifest first");
  }

  const tasks = [];
  if (target === "extensions" || target === "all" || target === "auto") {
    for (const extId of expandWithDeps(Object.keys(config.extensions))) {
      const item = config.extensions[extId];
      tasks.push({ kind: "extension", id: extId, name: item.name, version: item.version });
    }
  }
  if (target === "kit" || target === "all" || target === "auto") {
    tasks.push({ kind: "kit", id: "kit", name: config.name, version: config.version });
  }
  if (!["extensions", "kit", "all", "auto"].includes(target)) {
    if (!config.extensions[target]) {
      throw new Error(`Unknown publish target: ${target}. Use extensions, kit, all, or one of: ${Object.keys(config.extensions).join(", ")}`);
    }
    for (const extId of expandWithDeps([target])) {
      const item = config.extensions[extId];
      tasks.push({ kind: "extension", id: extId, name: item.name, version: item.version });
    }
  }

  for (const task of tasks) {
    if (isVersionPublished(task.name, task.version)) {
      console.log(`Skipped ${task.name}@${task.version} (already published on npm).`);
      continue;
    }
    const dir = task.kind === "kit" ? root : stageExtension(task.id);
    runNpmPublish(dir, task.name, task.version);
  }
}

validateConfig();
const [command = "check", id] = process.argv.slice(2);
if (command === "sync") {
  writeFileSync(join(root, "package.json"), `${JSON.stringify(kitManifest(), null, 2)}\n`);
  console.log("Updated package.json from kit.config.json");
} else if (command === "check") {
  if (JSON.stringify(current) !== JSON.stringify(kitManifest())) {
    throw new Error("package.json differs from kit.config.json; run npm run manifest");
  }
  console.log(`Checked ${Object.keys(config.extensions).length} extensions.`);
  console.log(`Kit exposes ${current.pi.extensions.length} extension entries and ${current.pi.prompts.length} prompt roots.`);
} else if (command === "extension") {
  stageExtension(id);
} else if (command === "publish") {
  await publishTarget(id || "auto");
} else {
  throw new Error(`Unknown command: ${command}. Use check, sync, extension <id>, or publish [extensions|kit|all|<id>].`);
}
