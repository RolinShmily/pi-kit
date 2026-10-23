import { Container, Input, Spacer, Text, fuzzyFilter, getKeybindings } from "@earendil-works/pi-tui";
import type { ImageModelDefinition } from "../custom-providers/index.ts";

export class SearchableImageModelSelectorComponent extends Container {
  private searchInput: Input;
  private listContainer: Container;
  private selectedIndex = 0;
  private filteredModels: ImageModelDefinition[] = [];
  private _focused = true;

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
    private title: string,
    private models: ImageModelDefinition[],
    private currentModelId: string,
    private onSelect: (model: ImageModelDefinition) => void,
    private onCancel: () => void,
    private getLoginStatus?: (provider: string) => boolean,
  ) {
    super();
    this.filteredModels = [...models];
    const curIdx = models.findIndex((m) => m.id === currentModelId);
    this.selectedIndex = curIdx >= 0 ? curIdx : 0;

    this.searchInput = new Input();
    this.searchInput.focused = true;
    this.listContainer = new Container();

    this.updateList();
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
    this.updateList();
    this.tui.requestRender?.();
  }

  updateList() {
    this.listContainer.clear();
    const maxVisible = 6;
    const total = this.filteredModels.length;

    if (total === 0) {
      this.listContainer.addChild(new Text(this.theme.fg("muted", "  No matching models"), 0, 0));
      return;
    }

    const startIndex = Math.max(0, Math.min(this.selectedIndex - Math.floor(maxVisible / 2), total - maxVisible));
    const endIndex = Math.min(startIndex + maxVisible, total);

    for (let i = startIndex; i < endIndex; i++) {
      const item = this.filteredModels[i];
      const isSelected = i === this.selectedIndex;
      const isCurrent = item.id === this.currentModelId;

      const cursor = isSelected ? this.theme.fg("accent", "→ ") : "  ";
      const check = isCurrent ? this.theme.fg("accent", "✓ ") : "  ";
      const modelText = isSelected
        ? this.theme.fg("accent", this.theme.bold ? this.theme.bold(item.id) : item.id)
        : this.theme.fg("text", item.id);
      const providerBadge = this.theme.fg("muted", `[${item.provider}]`);

      let authBadge = "";
      if (this.getLoginStatus) {
        const loggedIn = this.getLoginStatus(item.provider);
        authBadge = loggedIn
          ? this.theme.fg("dim", " · logged in")
          : this.theme.fg("warning", ` · not logged in: /login ${item.provider}`);
      }

      const line = `${cursor}${check}${modelText} ${providerBadge}${authBadge}`;
      this.listContainer.addChild(new Text(line, 0, 0));
    }

    if (startIndex > 0 || endIndex < total) {
      const scrollInfo = this.theme.fg("muted", `  (${this.selectedIndex + 1}/${total})`);
      this.listContainer.addChild(new Text(scrollInfo, 0, 0));
    }

    const selected = this.filteredModels[this.selectedIndex];
    if (selected) {
      this.listContainer.addChild(new Spacer(1));
      this.listContainer.addChild(
        new Text(this.theme.fg("muted", `  Model: ${selected.name} — ${selected.description}`), 0, 0),
      );
    }
  }

  render(width: number): string[] {
    this.clear();
    const border = this.theme.fg("accent", "─".repeat(Math.max(10, width)));

    this.addChild(new Text(border, 0, 0));
    this.addChild(new Spacer(1));
    this.addChild(new Text(this.theme.fg("accent", this.theme.bold ? this.theme.bold(`  ${this.title}`) : `  ${this.title}`), 0, 0));
    this.addChild(new Spacer(1));
    this.addChild(this.searchInput);
    this.addChild(new Spacer(1));
    this.addChild(this.listContainer);
    this.addChild(new Spacer(1));
    this.addChild(new Text(this.theme.fg("dim", "  Enter to select · Escape to cancel"), 0, 0));
    this.addChild(new Text(border, 0, 0));

    return super.render(width);
  }

  handleInput(keyData: string) {
    const kb = getKeybindings();
    if (kb.matches(keyData, "tui.select.up") || keyData === "k") {
      if (this.filteredModels.length === 0) return;
      this.selectedIndex = this.selectedIndex === 0 ? this.filteredModels.length - 1 : this.selectedIndex - 1;
      this.updateList();
      this.tui.requestRender?.();
    } else if (kb.matches(keyData, "tui.select.down") || keyData === "j") {
      if (this.filteredModels.length === 0) return;
      this.selectedIndex = this.selectedIndex === this.filteredModels.length - 1 ? 0 : this.selectedIndex + 1;
      this.updateList();
      this.tui.requestRender?.();
    } else if (kb.matches(keyData, "tui.select.confirm") || keyData === "\n" || keyData === "\r") {
      const selected = this.filteredModels[this.selectedIndex];
      if (selected) {
        this.onSelect(selected);
      }
    } else if (kb.matches(keyData, "tui.select.cancel") || keyData === "\x1b" || keyData === "\x03") {
      this.onCancel();
    } else {
      this.searchInput.handleInput(keyData);
      this.filterModels(this.searchInput.getValue());
    }
  }
}
