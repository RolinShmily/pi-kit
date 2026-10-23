import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BUNDLED_PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "prompts");
import { CONFIG_DIR_NAME, getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Snippet } from "./types.ts";

export function parseSnippet(filename: string, raw: string): Snippet | null {
	const cleanRaw = raw.replace(/^\uFEFF/, "");
	const match = cleanRaw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

	let name = filename.replace(/\.md$/, "");
	let description = "";
	let placement: "prepend" | "append" = "append";
	let order = 100;
	let body = "";

	if (match) {
		const meta: Record<string, string> = {};
		for (const line of match[1].split(/\r?\n/)) {
			const kv = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
			if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
		}
		if (meta.name) name = meta.name;
		if (meta.description) description = meta.description;
		if (meta.placement === "prepend") placement = "prepend";
		const parsedOrder = Number.parseInt(meta.order ?? "100", 10);
		if (!Number.isNaN(parsedOrder)) order = parsedOrder;
		body = match[2].trim();
	} else {
		body = cleanRaw.trim();
		if (!body) return null;
		const firstLine = body.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
		description = firstLine.replace(/^#+\s*/, "").slice(0, 80);
	}

	if (!body) return null;

	return {
		id: filename,
		name,
		description,
		placement,
		order,
		body,
	};
}

function resolveSnippetPath(rawPath: string, cwd: string): string {
	const trimmed = rawPath.trim();
	if (trimmed === "~" || trimmed.startsWith("~/") || (process.platform === "win32" && trimmed.startsWith("~\\"))) {
		return resolve(homedir(), trimmed.replace(/^~[/\\]?/, ""));
	}
	if (isAbsolute(trimmed)) {
		return resolve(trimmed);
	}
	const fromCwd = resolve(cwd, trimmed);
	if (existsSync(fromCwd)) return fromCwd;
	const fromAgent = resolve(getAgentDir(), trimmed);
	if (existsSync(fromAgent)) return fromAgent;
	return fromCwd;
}

function getSettingsPrompts(cwd: string, pi?: ExtensionAPI): string[] {
	const results: string[] = [];

	if (pi) {
		try {
			const settings = pi.getSettings();
			if (Array.isArray(settings?.prompts)) {
				results.push(...settings.prompts);
				return results;
			}
		} catch {
			// pi.getSettings() may throw before runner binds
		}
	}

	const settingsFiles = [
		join(getAgentDir(), "settings.json"),
		join(cwd, CONFIG_DIR_NAME, "settings.json"),
	];

	for (const sf of settingsFiles) {
		if (!existsSync(sf)) continue;
		try {
			const content = readFileSync(sf, "utf-8");
			const parsed = JSON.parse(content.replace(/^\uFEFF/, ""));
			if (Array.isArray(parsed?.prompts)) {
				for (const p of parsed.prompts) {
					if (typeof p === "string" && !results.includes(p)) {
						results.push(p);
					}
				}
			}
		} catch {
			// ignore JSON parse errors
		}
	}

	return results;
}

export function loadSnippets(cwd: string, pi?: ExtensionAPI): Snippet[] {
	const seen = new Map<string, Snippet>();
	const excludedNames = new Set<string>();

	const loadedPromptPaths = pi?.getCommands()
		.filter((command) => command.source === "prompt")
		.map((command) => command.sourceInfo.path);
	const defaultDirs = loadedPromptPaths ? [] : [
		BUNDLED_PROMPTS_DIR,
		join(getAgentDir(), "prompts"),
		join(cwd, CONFIG_DIR_NAME, "prompts"),
	];
	const settingsPrompts = loadedPromptPaths ?? getSettingsPrompts(cwd, pi);

	const processDirectory = (dir: string) => {
		if (!existsSync(dir)) return;
		let files: string[];
		try {
			files = readdirSync(dir);
		} catch (error) {
			if (!(error instanceof Error) || !("code" in error)) throw error;
			console.error(`Failed to read prompt directory ${dir}: ${error.message}`);
			return;
		}
		for (const file of files) {
			if (!file.endsWith(".md")) continue;
			if (excludedNames.has(file)) continue;
			const fullPath = join(dir, file);
			try {
				const snippet = parseSnippet(file, readFileSync(fullPath, "utf-8"));
				if (snippet) seen.set(file, snippet);
			} catch (error) {
				if (!(error instanceof Error) || !("code" in error)) throw error;
				console.error(`Failed to read prompt ${fullPath}: ${error.message}`);
			}
		}
	};

	const processFile = (filePath: string) => {
		if (!existsSync(filePath) || !filePath.endsWith(".md")) return;
		const filename = basename(filePath);
		if (excludedNames.has(filename)) return;
		try {
			const snippet = parseSnippet(filename, readFileSync(filePath, "utf-8"));
			if (snippet) seen.set(filename, snippet);
		} catch (error) {
			if (!(error instanceof Error) || !("code" in error)) throw error;
			console.error(`Failed to read prompt file ${filePath}: ${error.message}`);
		}
	};

	// Collect exclusions first
	for (const raw of settingsPrompts) {
		if (typeof raw !== "string") continue;
		const trimmed = raw.trim();
		if (trimmed.startsWith("-") || trimmed.startsWith("!")) {
			const clean = trimmed.slice(1).trim();
			excludedNames.add(basename(clean));
		}
	}

	// 1. Load default prompt directories
	for (const dir of defaultDirs) {
		processDirectory(dir);
	}

	// 2. Load Pi's resolved prompts, or explicit settings paths without a runtime.
	for (const raw of settingsPrompts) {
		if (typeof raw !== "string") continue;
		let trimmed = raw.trim();
		if (trimmed.startsWith("-") || trimmed.startsWith("!")) continue;
		if (trimmed.startsWith("+")) trimmed = trimmed.slice(1).trim();
		if (!trimmed) continue;

		const resolved = resolveSnippetPath(trimmed, cwd);
		if (!existsSync(resolved)) continue;

		try {
			const stat = statSync(resolved);
			if (stat.isDirectory()) {
				processDirectory(resolved);
			} else if (stat.isFile() && resolved.endsWith(".md")) {
				processFile(resolved);
			}
		} catch (error) {
			if (!(error instanceof Error) || !("code" in error)) throw error;
			console.error(`Failed to inspect prompt path ${resolved}: ${error.message}`);
		}
	}

	// Remove any excluded items
	for (const ex of excludedNames) {
		seen.delete(ex);
	}

	return Array.from(seen.values()).sort((a, b) => {
		if (a.placement !== b.placement) return a.placement === "prepend" ? -1 : 1;
		if (a.order !== b.order) return a.order - b.order;
		return a.name.localeCompare(b.name);
	});
}
