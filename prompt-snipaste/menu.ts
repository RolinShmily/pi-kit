import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Snippet } from "./types.ts";

/** Edit a working selection; the caller commits it only after confirmation. */
export function showSnippetMenu(ctx: ExtensionContext, snippets: Snippet[], working: Set<string>): Promise<boolean> {
	return ctx.ui.custom<boolean>((tui, theme, _keybindings, done) => {
		const prepends = snippets.filter((s) => s.placement === "prepend");
		const appends = snippets.filter((s) => s.placement === "append");
		const items = [...prepends, ...appends];

		let mode: "list" | "preview" = "list";
		let cursor = 0;
		let listScroll = 0;
		let previewScroll = 0;

		const itemRow = (snippet: Snippet, idx: number, width: number): string => {
			const pointer = idx === cursor ? theme.fg("accent", "> ") : "  ";
			const checkbox = working.has(snippet.id) ? theme.fg("success", "[x]") : theme.fg("dim", "[ ]");
			const desc = snippet.description ? theme.fg("dim", ` — ${snippet.description}`) : "";
			return truncateToWidth(`${pointer}${checkbox} ${theme.bold(snippet.name)}${desc}`, width);
		};

		const buildListRows = (width: number): { text: string; itemIndex: number | null }[] => {
			const rows: { text: string; itemIndex: number | null }[] = [];
			rows.push({ text: theme.fg("dim", "↑ Prepend Prompts"), itemIndex: null });
			prepends.forEach((s, i) => rows.push({ text: itemRow(s, i, width), itemIndex: i }));
			rows.push({ text: "", itemIndex: null });
			rows.push({ text: theme.fg("dim", "↓ Append Prompts"), itemIndex: null });
			appends.forEach((s, i) => rows.push({ text: itemRow(s, prepends.length + i, width), itemIndex: prepends.length + i }));
			return rows;
		};

		const buildPreviewRows = (snippet: Snippet, width: number): string[] => {
			const rows: string[] = [];
			rows.push(truncateToWidth(theme.bold(snippet.name), width));
			rows.push(truncateToWidth(theme.fg("dim", `${snippet.placement === "prepend" ? "Prepend" : "Append"} · Order ${snippet.order} · ${snippet.id}`), width));
			rows.push(theme.fg("dim", "─".repeat(Math.min(width, 40))));
			for (const line of snippet.body.split("\n")) {
				for (const wrapped of wrapTextWithAnsi(line, width)) {
					rows.push(truncateToWidth(wrapped, width));
				}
			}
			return rows;
		};

		const viewport = (
			lines: string[],
			scroll: number,
			maxView: number,
			focusRow?: number,
		): { out: string[]; scroll: number } => {
			const clipped = lines.length > maxView;
			const view = clipped ? Math.max(1, maxView - 2) : maxView;

			let s = Math.min(Math.max(0, scroll), Math.max(0, lines.length - view));
			if (focusRow !== undefined) {
				if (focusRow < s) s = focusRow;
				else if (focusRow >= s + view) s = focusRow - view + 1;
			}

			const visible = lines.slice(s, s + view);
			if (!clipped) return { out: visible, scroll: s };

			const above = s;
			const below = lines.length - (s + view);
			return {
				out: [
					above > 0 ? theme.fg("dim", `  ↑ ${above} more`) : "",
					...visible,
					below > 0 ? theme.fg("dim", `  ↓ ${below} more`) : "",
				],
				scroll: s,
			};
		};

		return {
			render(width: number): string[] {
				const maxView = Math.max(5, tui.terminal.rows - 10);

				let content: string[];
				let title: string;
				let hints: string;
				if (mode === "list") {
					const rows = buildListRows(width);
					const cursorRow = rows.findIndex((r) => r.itemIndex === cursor);
					const v = viewport(rows.map((r) => r.text), listScroll, maxView, cursorRow);
					content = v.out;
					listScroll = v.scroll;
					title = "Prompt Snippets";
					hints = "↑↓ Navigate • Space Select • Tab Preview • Enter Confirm • Esc Cancel";
				} else {
					const snippet = items[cursor];
					const rows = buildPreviewRows(snippet, width);
					const v = viewport(rows, previewScroll, maxView);
					content = v.out;
					previewScroll = v.scroll;
					title = `Preview: ${snippet.name}`;
					hints = "↑↓ Scroll • Tab/Esc Back to list";
				}

				const innerW = width - 4;
				const titleVisW = visibleWidth(title);
				const hintsVisW = visibleWidth(hints);
				const titlePad = Math.max(0, innerW - titleVisW);
				const hintsPad = Math.max(0, innerW - hintsVisW);

				const rawLines = [
					theme.fg("border", `╭─ ${theme.bold(title)} ${"─".repeat(titlePad)}╮`),
					...content.map((l) => {
						const pad = Math.max(0, innerW - visibleWidth(l));
						return theme.fg("border", "│ ") + l + " ".repeat(pad) + theme.fg("border", " │");
					}),
					theme.fg("border", `├${"─".repeat(innerW + 2)}┤`),
					theme.fg("border", "│ ") + theme.fg("dim", hints) + " ".repeat(hintsPad) + theme.fg("border", " │"),
					theme.fg("border", `╰${"─".repeat(innerW + 2)}╯`),
				];

				return rawLines.map((line) => truncateToWidth(line, width));
			},
			invalidate() {},
			handleInput(data: string) {
				if (mode === "list") {
					if (matchesKey(data, Key.up)) {
						cursor = (cursor - 1 + items.length) % items.length;
						tui.requestRender();
					} else if (matchesKey(data, Key.down)) {
						cursor = (cursor + 1) % items.length;
						tui.requestRender();
					} else if (matchesKey(data, Key.space)) {
						const id = items[cursor].id;
						if (working.has(id)) working.delete(id);
						else working.add(id);
						tui.requestRender();
					} else if (matchesKey(data, Key.tab)) {
						mode = "preview";
						previewScroll = 0;
						tui.requestRender();
					} else if (matchesKey(data, Key.enter)) {
						done(true);
					} else if (matchesKey(data, Key.escape)) {
						done(false);
					}
				} else {
					if (matchesKey(data, Key.up)) {
						previewScroll--;
						tui.requestRender();
					} else if (matchesKey(data, Key.down)) {
						previewScroll++;
						tui.requestRender();
					} else if (matchesKey(data, Key.tab) || matchesKey(data, Key.escape)) {
						mode = "list";
						tui.requestRender();
					}
				}
			},
		};
	});
}
