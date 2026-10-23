import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { PromptCardData, Snippet } from "./types.ts";

const WIDGET_ID = "prompt-snipaste";

export function buildPromptCardComponent(
	snippets: PromptCardData["snippets"],
	theme: Theme,
) {
	const borderCol = (s: string) => theme.fg("borderAccent", s);
	const dim = (s: string) => theme.fg("dim", s);
	const bold = (s: string) => theme.bold(s);

	const titleText = ` Prompt Snippets (${snippets.length}) `;

	return {
		render(width: number): string[] {
			const effectiveWidth = Math.max(20, Math.min(width, 100));
			const innerW = effectiveWidth - 4;

			const titleVisW = visibleWidth(titleText);
			const topDashLen = Math.max(1, innerW - titleVisW);
			const topLine = borderCol("╭─") + bold(titleText) + borderCol("─".repeat(topDashLen) + "╮");
			const botLine = borderCol("╰" + "─".repeat(innerW + 2) + "╯");

			const lines: string[] = [];
			lines.push(topLine);

			snippets.forEach((item, idx) => {
				if (idx > 0) {
					lines.push(borderCol("├" + "─".repeat(innerW + 2) + "┤"));
				}
				const header = `● ${item.name}`;
				const headerVisW = visibleWidth(header);
				const headerPad = Math.max(0, innerW - headerVisW);
				lines.push(borderCol("│ ") + bold(header) + " ".repeat(headerPad) + borderCol(" │"));

				const bodyLines = item.body.split(/\r?\n/);
				for (const line of bodyLines) {
					if (!line.trim()) continue;
					for (const wrapped of wrapTextWithAnsi(line, innerW)) {
						const pad = Math.max(0, innerW - visibleWidth(wrapped));
						lines.push(borderCol("│ ") + dim(wrapped) + " ".repeat(pad) + borderCol(" │"));
					}
				}
			});

			lines.push(botLine);
			return lines.map((l) => truncateToWidth(l, width));
		},
		invalidate() {},
	};
}

export function updateSnippetWidget(
	ctx: ExtensionContext,
	getSelection: () => { snippets: Snippet[]; enabled: Set<string> },
) {
	if (getSelection().enabled.size === 0) {
		ctx.ui.setWidget(WIDGET_ID, undefined);
		return;
	}

	ctx.ui.setWidget(WIDGET_ID, (_tui, theme) => ({
		render(width: number): string[] {
			const { snippets, enabled } = getSelection();
			const active = snippets.filter((s) => enabled.has(s.id));
			if (active.length === 0) return [];

			const prepends = active.filter((s) => s.placement === "prepend");
			const appends = active.filter((s) => s.placement === "append");

			const parts: string[] = [];
			if (prepends.length > 0) {
				parts.push(theme.fg("accent", `↑ ${prepends.map((s) => s.name).join(", ")}`));
			}
			if (appends.length > 0) {
				parts.push(theme.fg("warning", `↓ ${appends.map((s) => s.name).join(", ")}`));
			}

			const text = `[Prompts: ${parts.join(" · ")}]`;
			return [truncateToWidth(text, width)];
		},
		invalidate() {},
	}));
}
