import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Editor, Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { getOtherLabel, isChineseContext, type AskAnswer, type AskOption, type DisplayOption } from "./types.ts";
import { addWrapped, createEditorTheme } from "./dialog-ui.ts";

export async function askSingleChoice(
  ctx: ExtensionContext,
  question: string,
  context: string | undefined,
  options: AskOption[],
): Promise<AskAnswer | null> {
  const isZh = isChineseContext(question, options, context);
  const otherLabel = getOtherLabel(options, isZh);
  const allOptions: DisplayOption[] = [
    ...options.map((option, index) => ({
      ...option,
      id: `option:${index}`,
      index: index + 1,
    })),
    { id: "other", label: otherLabel, value: "__other__", isOther: true },
  ];

  return ctx.ui.custom<AskAnswer | null>(
    (tui, theme, _kb, done: (result: AskAnswer | null) => void) => {
      let optionIndex = 0;
      let editMode = false;
      let cachedLines: string[] | undefined;
      let cachedWidth = -1;
      let componentFocused = false;
      const editor = new Editor(tui, createEditorTheme(theme));

      editor.onSubmit = (value) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        done({ type: "other", label: trimmed, value: trimmed });
      };

      function refresh() {
        cachedLines = undefined;
        tui.requestRender();
      }

      function handleInput(data: string) {
        if (editMode) {
          if (matchesKey(data, Key.escape)) {
            editMode = false;
            editor.focused = false;
            editor.setText("");
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
          optionIndex = Math.min(allOptions.length - 1, optionIndex + 1);
          refresh();
          return;
        }
        if (matchesKey(data, Key.enter)) {
          const selected = allOptions[optionIndex];
          if (selected.isOther) {
            editMode = true;
            editor.focused = componentFocused;
            editor.setText("");
            refresh();
            return;
          }
          done({
            type: "option",
            label: selected.label,
            value: selected.value,
            index: selected.index!,
          });
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
          const header = allOptions[optionIndex]?.label || otherLabel;
          add(theme.fg("accent", ` > ${header}:`));
          for (const line of editor.render(Math.max(1, width - 4))) {
            add(`   ${line}`);
          }
          lines.push("");
          const editHint = isZh
            ? " Enter 提交 • Esc 返回选项"
            : " Enter to submit • Esc to return";
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

        for (let i = 0; i < allOptions.length; i++) {
          const item = allOptions[i];
          const selected = i === optionIndex;
          const prefix = selected ? theme.fg("accent", " > ") : "   ";

          if (item.isOther) {
            const styledLabel = selected
              ? theme.bold(theme.fg("accent", item.label))
              : theme.fg("text", item.label);
            lines.push(truncateToWidth(`${prefix}${styledLabel}`, width));
          } else {
            const numPrefix = `${item.index}. `;
            const firstIndent = `${prefix}${selected ? theme.fg("accent", numPrefix) : numPrefix}`;
            const restIndent = " ".repeat(visibleWidth(firstIndent));
            const styleLabel = (l: string) =>
              selected ? theme.bold(theme.fg("accent", l)) : theme.fg("text", l);

            addWrapped(lines, item.label, width, firstIndent, restIndent, styleLabel);

            if (item.description) {
              const descIndent = " ".repeat(visibleWidth(firstIndent));
              const descStyle = (l: string) => theme.fg("muted", l);
              addWrapped(lines, item.description, width, descIndent, descIndent, descStyle);
            }
          }
        }

        lines.push("");
        const navHint = isZh
          ? " ↑↓ 选择 • Enter 确定 • Esc 取消"
          : " ↑↓ to navigate • Enter to select • Esc to cancel";
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
