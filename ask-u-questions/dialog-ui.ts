import type { Theme } from "@earendil-works/pi-coding-agent";
import { type EditorTheme, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

export function createEditorTheme(theme: Theme): EditorTheme {
  return {
    borderColor: (s) => theme.fg("accent", s),
    selectList: {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t),
    },
  };
}

export function addWrapped(
  lines: string[],
  text: string,
  width: number,
  firstIndent = " ",
  restIndent = firstIndent,
  styleFn?: (line: string) => string,
): void {
  if (!text) return;
  const paragraphs = text.split(/\r?\n/);
  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const paragraph = paragraphs[pIdx];
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    const isFirstParagraph = pIdx === 0;
    const currentFirstIndent = isFirstParagraph ? firstIndent : restIndent;
    const firstWidth = Math.max(1, width - visibleWidth(currentFirstIndent));
    const restWidth = Math.max(1, width - visibleWidth(restIndent));

    if (firstWidth === restWidth) {
      const wrapped = wrapTextWithAnsi(paragraph, firstWidth);
      for (let i = 0; i < wrapped.length; i++) {
        const indent = isFirstParagraph && i === 0 ? firstIndent : restIndent;
        const rawLine = wrapped[i];
        const styled = styleFn ? styleFn(rawLine) : rawLine;
        lines.push(truncateToWidth(`${indent}${styled}`, width));
      }
    } else {
      const wrapped = wrapTextWithAnsi(paragraph, Math.min(firstWidth, restWidth));
      for (let i = 0; i < wrapped.length; i++) {
        const indent = isFirstParagraph && i === 0 ? firstIndent : restIndent;
        const rawLine = wrapped[i];
        const styled = styleFn ? styleFn(rawLine) : rawLine;
        lines.push(truncateToWidth(`${indent}${styled}`, width));
      }
    }
  }
}

const SHARED_UI_LOCK_KEY = "__piSharedUiLock";
function getSharedUiLock(): { withLock<T>(fn: () => T | Promise<T>): Promise<T> } {
  const g = globalThis as any;
  if (!g[SHARED_UI_LOCK_KEY]) {
    let chain: Promise<void> = Promise.resolve();
    g[SHARED_UI_LOCK_KEY] = {
      withLock<T>(fn: () => T | Promise<T>): Promise<T> {
        const prev = chain;
        let release: () => void;
        chain = new Promise<void>((r) => {
          release = r;
        });
        return prev.then(fn).finally(() => release!());
      },
    };
  }
  return g[SHARED_UI_LOCK_KEY];
}
const sharedUiLock = getSharedUiLock();

export function withUILock<T>(fn: () => Promise<T>): Promise<T> {
  return sharedUiLock.withLock(fn);
}
