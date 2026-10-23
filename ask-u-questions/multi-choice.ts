import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Editor, Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { getOtherLabel, isChineseContext, sortAnswers, type AskAnswer, type AskOption, type DisplayOption } from "./types.ts";
import { addWrapped, createEditorTheme } from "./dialog-ui.ts";

export async function askMultiChoice(
  ctx: ExtensionContext,
  question: string,
  context: string | undefined,
  options: AskOption[],
): Promise<AskAnswer[] | null> {
  const isZh = isChineseContext(question, options, context);
  const otherLabel = getOtherLabel(options, isZh);
  const choiceItems: DisplayOption[] = options.map((option, index) => ({
    ...option,
    id: `option:${index}`,
    index: index + 1,
  }));
  const submitItem: DisplayOption = {
    id: "submit",
    label: isZh ? "提交确认" : "Confirm & Submit",
    value: "__submit__",
    isSubmit: true,
  };
  const allItems: DisplayOption[] = [
    ...choiceItems,
    { id: "other", label: otherLabel, value: "__other__", isOther: true },
    submitItem,
  ];

  return ctx.ui.custom<AskAnswer[] | null>(
    (tui, theme, _kb, done: (result: AskAnswer[] | null) => void) => {
      let optionIndex = 0;
      let editMode = false;
      let cachedLines: string[] | undefined;
      let cachedWidth = -1;
      let componentFocused = false;
      const selected = new Map<string, AskAnswer>();
      const editor = new Editor(tui, createEditorTheme(theme));

      editor.onSubmit = (value) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        selected.set("other", { type: "other", label: trimmed, value: trimmed });
        editMode = false;
        editor.focused = false;
        refresh();
      };

      function refresh() {
        cachedLines = undefined;
        tui.requestRender();
      }

      function toggleOption(item: DisplayOption) {
        if (selected.has(item.id)) {
          selected.delete(item.id);
        } else {
          selected.set(item.id, {
            type: "option",
            label: item.label,
            value: item.value,
            index: item.index!,
          });
        }
        refresh();
      }

      function handleInput(data: string) {
        if (editMode) {
          if (matchesKey(data, Key.escape)) {
            editMode = false;
            editor.focused = false;
            editor.setText(selected.get("other")?.label || "");
            refresh();
            return;
          }
          editor.handleInput(data);
          refresh();
          return;
        }

        if (matchesKey(data, Key.up)) {
          optionIndex = Math.max(0, optionIndex - 1);
          refresh();
          return;
        }
        if (matchesKey(data, Key.down)) {
          optionIndex = Math.min(allItems.length - 1, optionIndex + 1);
          refresh();
          return;
        }

        const current = allItems[optionIndex];
        if (matchesKey(data, Key.space)) {
          if (current.isSubmit) return;
          if (current.isOther) {
            if (selected.has("other")) {
              selected.delete("other");
              refresh();
            } else {
              editMode = true;
              editor.focused = componentFocused;
              editor.setText("");
              refresh();
            }
            return;
          }
          toggleOption(current);
          return;
        }

        if (matchesKey(data, Key.enter)) {
          if (current.isSubmit) {
            if (selected.size > 0) {
              done(sortAnswers(Array.from(selected.values())));
            }
            return;
          }
          if (current.isOther) {
            editMode = true;
            editor.focused = componentFocused;
            editor.setText(selected.get("other")?.label || "");
            refresh();
            return;
          }
          toggleOption(current);
          return;
        }

        if (matchesKey(data, Key.escape)) {
          done(null);
        }
      }

      function render(width: number): string[] {
        if (cachedLines && cachedWidth === width) return cachedLines;

        const lines: string[] = [];
        const add = (text: string) => lines.push(truncateToWidth(text, width));

        add(theme.fg("accent", "─".repeat(width)));

        if (editMode) {
          addWrapped(lines, question, width, " ", " ", (l) => theme.fg("text", theme.bold(l)));
          if (context) {
            addWrapped(lines, context, width, " ", " ", (l) => theme.fg("muted", l));
          }
          lines.push("");
          const header = allItems[optionIndex]?.label || otherLabel;
          add(theme.fg("accent", ` > ${header}:`));
          for (const line of editor.render(Math.max(1, width - 4))) {
            add(`   ${line}`);
          }
          lines.push("");
          const editHint = isZh
            ? " Enter 保存 • Esc 返回多选"
            : " Enter to save • Esc to return";
          add(theme.fg("dim", editHint));
          add(theme.fg("accent", "─".repeat(width)));
          cachedLines = lines;
          cachedWidth = width;
          return lines;
        }

        addWrapped(lines, question, width, " ", " ", (l) => theme.fg("text", theme.bold(l)));
        if (context) {
          addWrapped(lines, context, width, " ", " ", (l) => theme.fg("muted", l));
        }
        lines.push("");

        for (let i = 0; i < allItems.length; i++) {
          const item = allItems[i];
          const isFocused = i === optionIndex;
          const prefix = isFocused ? theme.fg("accent", " > ") : "   ";

          if (item.isSubmit) {
            const hasSelected = selected.size > 0;
            const countText = isZh
              ? `(已选 ${selected.size} 项)`
              : `(${selected.size} selected)`;
            const label = hasSelected
              ? `✓ ${item.label} ${countText}`
              : `○ ${item.label}`;
            const styled = isFocused
              ? theme.bold(theme.fg("accent", label))
              : theme.fg(hasSelected ? "success" : "dim", label);
            lines.push(truncateToWidth(`${prefix}${styled}`, width));
            continue;
          }

          if (item.isOther) {
            const other = selected.get("other");
            const marker = other ? "[x]" : "[ ]";
            const suffix = other ? ` — ${other.label}` : "";
            const label = `${marker} ${item.label}${suffix}`;
            const styled = isFocused
              ? theme.bold(theme.fg("accent", label))
              : theme.fg(other ? "success" : "text", label);
            lines.push(truncateToWidth(`${prefix}${styled}`, width));
            continue;
          }

          const checked = selected.has(item.id);
          const marker = checked ? "[x] " : "[ ] ";
          const numPrefix = `${item.index}. `;
          const firstIndent = `${prefix}${checked ? theme.fg("success", marker) : marker}${numPrefix}`;
          const restIndent = " ".repeat(visibleWidth(firstIndent));
          const styleLabel = (l: string) => {
            if (isFocused) return theme.bold(theme.fg("accent", l));
            if (checked) return theme.fg("success", l);
            return theme.fg("text", l);
          };

          addWrapped(lines, item.label, width, firstIndent, restIndent, styleLabel);

          if (item.description) {
            const descIndent = " ".repeat(visibleWidth(firstIndent));
            const descStyle = (l: string) => theme.fg("muted", l);
            addWrapped(lines, item.description, width, descIndent, descIndent, descStyle);
          }
        }

        lines.push("");
        if (selected.size === 0) {
          const warnText = isZh
            ? " 请至少选择一项回答后再提交。"
            : " Please select at least one option before submitting.";
          add(theme.fg("warning", warnText));
        }
        const navHint = isZh
          ? " ↑↓ 切换 • 空格 勾选 • Enter 编辑/提交 • Esc 取消"
          : " ↑↓ to navigate • Space to select • Enter to edit/submit • Esc to cancel";
        add(theme.fg("dim", navHint));
        add(theme.fg("accent", "─".repeat(width)));

        cachedLines = lines;
        cachedWidth = width;
        return lines;
      }

      return {
        render,
        invalidate: () => {
          cachedLines = undefined;
        },
        handleInput,
        get focused(): boolean {
          return componentFocused;
        },
        set focused(value: boolean) {
          componentFocused = value;
          editor.focused = editMode && componentFocused;
        },
      };
    },
  );
}
