import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Find npm's local bin shims, including dependencies hoisted above a nested fork. */
export function findLocalBin(startDirectory, name, platform = process.platform) {
  const filename = platform === "win32" ? `${name}.cmd` : name;
  let directory = resolve(startDirectory);
  while (true) {
    const candidate = join(directory, "node_modules", ".bin", filename);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) return filename;
    directory = parent;
  }
}
