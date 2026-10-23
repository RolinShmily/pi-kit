import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const config = readJson(join(root, "kit.config.json"));
const current = readJson(join(root, "package.json"));
const hostPeers = Object.fromEntries([
  "@earendil-works/pi-ai", "@earendil-works/pi-agent-core",
  "@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox",
].map((name) => [name, "*"]));
const resourceTypes = ["extensions", "skills", "prompts", "themes"];

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
    if (typeof item.bundle !== "boolean") throw new Error(`${id}.bundle must be boolean`);
    sourcePath(item.entry);
    if (!Array.isArray(item.files) || item.files.length === 0) throw new Error(`${id}.files must list its source and runtime assets`);
    for (const path of item.files) sourcePath(path);
    if (!item.files.some((path) => item.entry === path || item.entry.startsWith(`${path}/`))) {
      throw new Error(`${id}.files does not contain its entry`);
    }
  }
  for (const [id, item] of Object.entries(config.forks)) {
    assertRelease(item, id);
    if (typeof item.bundle !== "boolean") throw new Error(`${id}.bundle must be boolean`);
    sourcePath(item.path);
    sourcePath(`${item.path}/package.json`);
    if (!item.upstream) throw new Error(`${id} must identify its upstream`);
  }
  for (const path of config.prompts) sourcePath(path);
}

function addDependencies(target, dependencies = {}) {
  for (const [name, version] of Object.entries(dependencies)) {
    if (name in hostPeers) throw new Error(`${name} must be a peerDependency supplied by Pi`);
    if (target[name] && target[name] !== version) throw new Error(`Conflicting dependency versions for ${name}`);
    target[name] = version;
  }
}

function forkResources(item) {
  const manifest = readJson(sourcePath(`${item.path}/package.json`));
  if (!manifest.pi) throw new Error(`${item.path} must declare its Pi resources explicitly`);
  const pi = Object.fromEntries(resourceTypes.map((type) => [type, (manifest.pi[type] ?? []).map((path) => {
    // Keeping fork paths explicit prevents silently losing nested resources.
    if (/[!*?]/.test(path) || path.startsWith("+") || path.startsWith("-")) {
      throw new Error(`Fork manifest patterns require explicit adaptation: ${item.path}: ${path}`);
    }
    const prefixed = `${item.path}/${path.replace(/^\.\//, "")}`;
    sourcePath(prefixed);
    return `./${prefixed}`;
  })]));
  return { manifest, pi };
}

function kitManifest() {
  const pi = { extensions: [], skills: [], prompts: config.prompts.map((path) => `./${path}`), themes: [] };
  const files = ["THIRD_PARTY.md", ...config.prompts];
  const dependencies = {};
  for (const item of Object.values(config.extensions).filter((item) => item.bundle)) {
    pi.extensions.push(`./${item.entry}`);
    files.push(...item.files);
  }
  for (const item of Object.values(config.forks).filter((item) => item.bundle)) {
    const fork = forkResources(item);
    files.push(item.path);
    for (const type of resourceTypes) pi[type].push(...fork.pi[type]);
    addDependencies(dependencies, fork.manifest.dependencies);
  }
  const result = {
    ...current, name: config.name, version: config.version, description: config.description,
    files: [...new Set(files), "!**/test/**", "!**/tests/**", "!**/*.{test,spec}.{ts,js,mjs,cjs}", "!**/.env", "!**/.env.*"], peerDependencies: hostPeers, pi,
  };
  delete result.dependencies;
  if (Object.keys(dependencies).length) result.dependencies = dependencies;
  return result;
}

function shouldCopy(path) {
  const parts = relative(root, path).split(sep);
  return !parts.some((part) => ["node_modules", ".git", "test", "tests"].includes(part)
    || part === ".env" || part.startsWith(".env.") || part.endsWith(".tgz"))
    && !/\.(?:test|spec)\.[cm]?[jt]s$/.test(path);
}

function stage(kind, id, item, manifest, files) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Invalid release id: ${id}`);
  const output = join(root, "dist", kind, id);
  // Only generated output for this exact release target is replaced.
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const path of files) {
    const destination = join(output, path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(sourcePath(path), destination, { recursive: true, filter: shouldCopy });
  }
  cpSync(join(root, "THIRD_PARTY.md"), join(output, "THIRD_PARTY.md"));
  const description = kind === "forks"
    ? `Third-party fork of ${item.upstream}. Original resources and existing license files are preserved under \`${item.path}/\`. See [the imported README](${item.path}/README.md) and [THIRD_PARTY.md](THIRD_PARTY.md) for provenance and license scope.`
    : `The \`${id}\` extension from pi-kit, generated from the same source as the aggregate package. Its shared implementation files are included; only its declared entry is registered as an extension.`;
  writeFileSync(join(output, "README.md"), `# ${item.name}\n\n${description}\n\nInstall after publication:\n\n\`\`\`sh\npi install npm:${item.name}\n\`\`\`\n\nDo not load the same extension through both this package and the aggregate pi-kit package. Host libraries are supplied by Pi. OS tools and provider authentication retain the requirements of the original extension. This release was generated locally; no publication is performed by the preparation script.\n`);
  writeFileSync(join(output, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  validateRelativeImports(output);
  console.log(`Prepared ${item.name}@${item.version}: ${output}`);
  console.log(`Inspect with: npm pack "${output}" --dry-run --ignore-scripts`);
}

function validateRelativeImports(directory) {
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const absolute = join(path, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (/\.[cm]?[jt]s$/.test(entry.name)) {
        const source = readFileSync(absolute, "utf8");
        const imports = source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\(\s*)["'](\.[^"']+)["']/g);
        for (const [, specifier] of imports) {
          const target = resolve(dirname(absolute), specifier);
          const rel = relative(directory, target);
          if (rel === ".." || rel.startsWith(`..${sep}`) || !existsSync(target)) {
            throw new Error(`Missing local import in release: ${relative(directory, absolute)} -> ${specifier}`);
          }
        }
      }
    }
  };
  walk(directory);
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
  for (const item of Object.values(config.forks)) forkResources(item);
  console.log(`Checked ${Object.keys(config.extensions).length} extensions and ${Object.keys(config.forks).length} fork(s).`);
  console.log(`Kit exposes ${current.pi.extensions.length} extension entries; top-level skills stay in dotfiles.`);
} else if (command === "extension") {
  const item = config.extensions[id];
  if (!item) throw new Error(`Unknown extension: ${id ?? "(missing id)"}. Choices: ${Object.keys(config.extensions).join(", ")}`);
  stage("extensions", id, item, {
    name: item.name, version: item.version, type: "module",
    description: `${id} extension from pi-kit`, keywords: ["pi-package"],
    repository: { ...current.repository, directory: dirname(item.entry).split(sep).join("/") },
    homepage: current.homepage, bugs: current.bugs,
    engines: current.engines, publishConfig: current.publishConfig,
    files: [...item.files, "THIRD_PARTY.md"], peerDependencies: hostPeers,
    pi: { extensions: [`./${item.entry}`], skills: [], prompts: [], themes: [] },
  }, item.files);
} else if (command === "fork") {
  const item = config.forks[id];
  if (!item) throw new Error(`Unknown fork: ${id ?? "(missing id)"}`);
  const { manifest, pi } = forkResources(item);
  stage("forks", id, item, {
    name: item.name, version: item.version, type: "module", description: manifest.description,
    repository: { ...current.repository, directory: item.path },
    homepage: current.homepage, bugs: current.bugs,
    keywords: ["pi-package"], engines: current.engines, publishConfig: current.publishConfig,
    files: [item.path, "THIRD_PARTY.md"], peerDependencies: { ...manifest.peerDependencies, ...hostPeers },
    ...(manifest.dependencies ? { dependencies: manifest.dependencies } : {}), pi,
  }, [item.path]);
} else {
  throw new Error(`Unknown command: ${command}. Use check, sync, extension <id>, or fork <id>.`);
}
