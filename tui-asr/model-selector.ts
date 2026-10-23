import { Input, fuzzyFilter, getKeybindings } from "@earendil-works/pi-tui";
import type { AsrModelDefinition } from "./dictation.ts";

export class SearchableAsrModelSelectorComponent {
  private searchInput = new Input();
  private selectedIndex = 0;
  private filteredModels: AsrModelDefinition[] = [];
  private _focused = true;
  private cachedLines?: string[];
  private cachedWidth = -1;

  get focused() {
    return this._focused;
  }
  set focused(value: boolean) {
    this._focused = value;
    this.searchInput.focused = value;
  }

  constructor(
    private tui: any,
    private theme: any,
    private models: AsrModelDefinition[],
    private currentModelId: string,
    private onSelect: (model: AsrModelDefinition) => void,
    private onCancel: () => void,
    private getLoginStatus?: (provider: string) => boolean,
  ) {
    this.filteredModels = [...models];
    const curIdx = models.findIndex((m) => m.id === currentModelId);
    this.selectedIndex = curIdx >= 0 ? curIdx : 0;
    this.searchInput.focused = true;
  }

  private refresh() {
    this.cachedLines = undefined;
    this.tui.requestRender?.();
  }

  filterModels(query: string) {
    const q = query.trim().toLowerCase();
    if (q) {
      this.filteredModels = fuzzyFilter(
        this.models,
        q,
        (m) => `${m.id} ${m.name} ${m.provider} ${m.description}`,
      );
    } else {
      this.filteredModels = [...this.models];
    }
    this.selectedIndex = q ? 0 : Math.min(this.selectedIndex, Math.max(0, this.filteredModels.length - 1));
    this.refresh();
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const lines: string[] = [];
    const border = this.theme.fg("accent", "─".repeat(Math.max(10, width)));

    lines.push(border);
    lines.push("");

    // Scope & credentials status line (matching Pi native selector screenshot)
    const scopeTitle = `${this.theme.fg("muted", "Scope: ")}${this.theme.fg("accent", "all")}${this.theme.fg("muted", " | dashscope")}`;
    lines.push(`  ${scopeTitle}`);

    if (this.getLoginStatus) {
      const loggedIn = this.getLoginStatus("dashscope");
      const authStatus = loggedIn
        ? this.theme.fg("success", "✓ DashScope credentials: ready (via /login dashscope)")
        : this.theme.fg("warning", "! DashScope credentials: not logged in (run /login dashscope)");
      lines.push(`  ${authStatus}`);
    }
    lines.push("");

    // Search input line (> █)
    for (const l of this.searchInput.render(Math.max(1, width - 4))) {
      lines.push(`  ${l}`);
    }
    lines.push("");

    // Model list (<cursor><check><model-id> [<provider>] [badges])
    if (this.filteredModels.length === 0) {
      lines.push(`  ${this.theme.fg("warning", "No matching ASR models found")}`);
    } else {
      const maxVisible = 6;
      const total = this.filteredModels.length;
      const startIndex = Math.max(0, Math.min(this.selectedIndex - Math.floor(maxVisible / 2), total - maxVisible));
      const endIndex = Math.min(startIndex + maxVisible, total);

      for (let i = startIndex; i < endIndex; i++) {
        const item = this.filteredModels[i];
        const isSelected = i === this.selectedIndex;
        const isCurrent = item.id === this.currentModelId;

        const cursor = isSelected ? this.theme.fg("accent", "→ ") : "  ";
        const check = isCurrent ? this.theme.fg("accent", "✓ ") : "  ";
        const modelText = isSelected
          ? (this.theme.bold ? this.theme.bold(this.theme.fg("accent", item.id)) : this.theme.fg("accent", item.id))
          : this.theme.fg("text", item.id);
        const providerBadge = this.theme.fg("muted", `[${item.provider}]`);
        const currentBadge = isCurrent ? this.theme.fg("muted", " · current") : "";

        lines.push(`  ${cursor}${check}${modelText} ${providerBadge}${currentBadge}`);
      }

      if (startIndex > 0 || endIndex < total) {
        lines.push(`  ${this.theme.fg("muted", `(${this.selectedIndex + 1}/${total})`)}`);
      }
    }
    lines.push("");

    // Selected model detail
    const selected = this.filteredModels[this.selectedIndex];
    if (selected) {
      lines.push(`  ${this.theme.fg("muted", "Model Name: ")}${selected.name}`);
      lines.push(`  ${this.theme.fg("muted", "Description: ")}${selected.description}`);
    }
    lines.push("");

    // Keybinding footer hints
    lines.push(this.theme.fg("dim", "  Enter to select · Escape/Ctrl+C to cancel · ↑↓ to navigate"));
    lines.push(border);

    this.cachedLines = lines;
    this.cachedWidth = width;
    return lines;
  }

  invalidate() {
    this.cachedLines = undefined;
  }

  handleInput(keyData: string) {
    const kb = getKeybindings();
    if (kb.matches(keyData, "tui.select.up") || keyData === "k") {
      if (this.filteredModels.length === 0) return;
      this.selectedIndex = this.selectedIndex === 0 ? this.filteredModels.length - 1 : this.selectedIndex - 1;
      this.refresh();
      return;
    }
    if (kb.matches(keyData, "tui.select.down") || keyData === "j") {
      if (this.filteredModels.length === 0) return;
      this.selectedIndex = this.selectedIndex === this.filteredModels.length - 1 ? 0 : this.selectedIndex + 1;
      this.refresh();
      return;
    }
    if (kb.matches(keyData, "tui.select.confirm") || keyData === "\n" || keyData === "\r") {
      const selected = this.filteredModels[this.selectedIndex];
      if (selected) {
        this.onSelect(selected);
      }
      return;
    }
    if (kb.matches(keyData, "tui.select.cancel") || keyData === "\x1b" || keyData === "\x03") {
      this.onCancel();
      return;
    }
    this.searchInput.handleInput(keyData);
    this.filterModels(this.searchInput.getValue());
  }
}
