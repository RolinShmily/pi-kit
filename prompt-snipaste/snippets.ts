import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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

const UNREADABLE_PROMPT_CODES = new Set(["ENOENT", "ENOTDIR", "EISDIR", "EACCES", "EPERM"]);

/**
 * Pi owns prompt discovery, trust, and resource filtering. Consume only its
 * enabled prompt commands; never scan directories or revive excluded templates.
 */
export function loadSnippets(pi: Pick<ExtensionAPI, "getCommands">): Snippet[] {
	const seen = new Map<string, Snippet>();

	for (const command of pi.getCommands()) {
		if (command.source !== "prompt") continue;
		const path = resolve(command.sourceInfo.path);
		if (!path.toLowerCase().endsWith(".md") || seen.has(path)) continue;

		let raw: string;
		try {
			raw = readFileSync(path, "utf-8");
		} catch (error) {
			if (!(error instanceof Error) || !("code" in error) || !UNREADABLE_PROMPT_CODES.has(String(error.code))) throw error;
			console.error(`prompt-snipaste: cannot read enabled prompt ${path}: ${error.message}`);
			continue;
		}
		const snippet = parseSnippet(basename(path), raw);
		if (snippet) {
			// Source paths, not basenames, keep same-named templates independent.
			seen.set(path, {
				...snippet,
				id: path,
				description: command.description ?? snippet.description,
			});
		}
	}

	return [...seen.values()].sort((a, b) => {
		if (a.placement !== b.placement) return a.placement === "prepend" ? -1 : 1;
		if (a.order !== b.order) return a.order - b.order;
		return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
	});
}
