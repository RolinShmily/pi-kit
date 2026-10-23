/** Select prompt snippets for the next user message with /snipaste or Alt+S. */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import type { PromptCardData, Snippet } from "./types.ts";
import { loadSnippets } from "./snippets.ts";
import { showSnippetMenu } from "./menu.ts";
import { buildPromptCardComponent, updateSnippetWidget } from "./renderers.ts";

export default function promptSnipaste(pi: ExtensionAPI) {
	let enabled = new Set<string>();
	let snippets: Snippet[] = [];

	function updateWidget(ctx: ExtensionContext) {
		updateSnippetWidget(ctx, () => ({ snippets, enabled }));
	}

	async function openMenu(ctx: ExtensionContext) {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("Prompt snippets menu is only available in interactive terminals", "warning");
			return;
		}

		snippets = loadSnippets(pi);
		enabled = new Set([...enabled].filter((id) => snippets.some((s) => s.id === id)));

		if (snippets.length === 0) {
			ctx.ui.notify("No enabled prompt templates. Add prompts in Pi settings, then /reload.", "warning");
			updateWidget(ctx);
			return;
		}

		const working = new Set(enabled);

		const confirmed = await showSnippetMenu(ctx, snippets, working);

		if (confirmed) {
			enabled = working;
		}
		updateWidget(ctx);
	}

	let pendingTurnSnippets: Snippet[] | null = null;

	pi.registerEntryRenderer<PromptCardData>("prompt-snipaste-card", (entry, _options, theme) => {
		const data = entry.data;
		if (!data?.snippets || data.snippets.length === 0) return undefined;
		return buildPromptCardComponent(data.snippets, theme);
	});

	pi.on("session_start", (_event, ctx) => {
		enabled = new Set();
		pendingTurnSnippets = null;
		snippets = loadSnippets(pi);
		updateWidget(ctx);
	});

	pi.on("input", async (_event, ctx) => {
		if (enabled.size === 0) return undefined;

		snippets = loadSnippets(pi);
		const active = snippets.filter((s) => enabled.has(s.id));
		enabled = new Set();
		updateWidget(ctx);

		if (active.length === 0) return undefined;

		pendingTurnSnippets = active;

		pi.appendEntry<PromptCardData>("prompt-snipaste-card", {
			snippets: active.map((s) => ({
				id: s.id,
				name: s.name,
				placement: s.placement,
				order: s.order,
				body: s.body,
			})),
		});

		return undefined;
	});

	pi.on("context", async (event, _ctx) => {
		if (!pendingTurnSnippets || pendingTurnSnippets.length === 0) return undefined;

		const active = pendingTurnSnippets;
		pendingTurnSnippets = null;

		const prepends = active.filter((s) => s.placement === "prepend");
		const appends = active.filter((s) => s.placement === "append");

		const messages = [...event.messages];
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if (msg.role === "user") {
				if (typeof msg.content === "string") {
					const parts: string[] = [];

					if (prepends.length > 0) {
						parts.push(prepends.map((s) => s.body.trim()).join("\n\n"));
					}
					if (msg.content.trim()) {
						parts.push(msg.content.trim());
					}
					if (appends.length > 0) {
						parts.push(appends.map((s) => s.body.trim()).join("\n\n"));
					}

					messages[i] = {
						...msg,
						content: parts.join("\n\n"),
					};
				} else if (Array.isArray(msg.content)) {
					const prependText = prepends.map((s) => s.body.trim()).join("\n\n");
					const appendText = appends.map((s) => s.body.trim()).join("\n\n");
					const newContent = [...msg.content];
					if (prependText) {
						newContent.unshift({ type: "text", text: prependText });
					}
					if (appendText) {
						newContent.push({ type: "text", text: appendText });
					}
					messages[i] = {
						...msg,
						content: newContent as any,
					};
				}
				return { messages };
			}
		}

		return undefined;
	});

	pi.registerCommand("snipaste", {
		description: "Select prepended or appended prompt snippets to inject into the next message",
		handler: (_args, ctx) => openMenu(ctx),
	});

	pi.registerShortcut(Key.alt("s"), {
		description: "Open prompt snippets menu",
		handler: (ctx) => openMenu(ctx),
	});
}
