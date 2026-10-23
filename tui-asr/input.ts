import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { spawn, type ChildProcessByStdio } from "node:child_process";

export function copyToClipboard(text: string): boolean {
  try {
    const isWsl =
      process.platform === "linux" &&
      typeof process.env.WSL_DISTRO_NAME === "string";

    let proc: ChildProcessByStdio<any, any, any>;
    if (isWsl) {
      proc = spawn("clip.exe", [], { stdio: ["pipe", "ignore", "ignore"] });
    } else if (process.platform === "win32") {
      proc = spawn("clip", [], { stdio: ["pipe", "ignore", "ignore"] });
    } else if (process.platform === "darwin") {
      proc = spawn("pbcopy", [], { stdio: ["pipe", "ignore", "ignore"] });
    } else {
      try {
        proc = spawn("wl-copy", [], { stdio: ["pipe", "ignore", "ignore"] });
      } catch {
        proc = spawn("xclip", ["-selection", "clipboard"], { stdio: ["pipe", "ignore", "ignore"] });
      }
    }

    proc.stdin.write(text);
    proc.stdin.end();
    return true;
  } catch {
    return false;
  }
}

interface EditorLike {
  getText(): string;
  setText(text: string): void;
}

type Target =
  | { kind: "editor"; editor: EditorLike }
  | { kind: "typable"; component: { handleInput(data: string): void } };

const asEditorLike = (value: any): EditorLike | null =>
  value && typeof value.getText === "function" && typeof value.setText === "function" ? value : null;

function resolveTarget(tuiHandle: any): Target | null {
  const focused = tuiHandle?.focusedComponent;
  if (!focused) return null;
  const editor = asEditorLike(focused) ?? asEditorLike(focused.editor);
  if (editor) return { kind: "editor", editor };
  if (typeof focused.handleInput === "function") return { kind: "typable", component: focused };
  return null;
}

/** Insert a final transcript into the focused input, with editor and clipboard fallbacks. */
export function insertTranscript(ctx: ExtensionContext, tuiHandle: any, text: string): void {
  // 1. Fallback: append to main editor if no TUI handle
  if (!tuiHandle) {
    const current = ctx.ui.getEditorText() ?? "";
    const sep = current && !/\s$/.test(current) ? " " : "";
    ctx.ui.setEditorText(current + sep + text);
    return;
  }

  // 2. Insert into focused editor or typable component
  const target = resolveTarget(tuiHandle);
  if (target?.kind === "editor") {
    const current = target.editor.getText() ?? "";
    const sep = current && !/\s$/.test(current) ? " " : "";
    target.editor.setText(current + sep + text);
    tuiHandle.requestRender?.();
    return;
  }

  if (target?.kind === "typable") {
    target.component.handleInput(text);
    tuiHandle.requestRender?.();
    return;
  }

  // 3. Fallback: copy to clipboard if no input focused
  const copied = copyToClipboard(text);
  if (copied) {
    ctx.ui.notify("Dictated text copied to clipboard (no input focused)", "info");
  } else {
    ctx.ui.notify(`Dictated: ${text}`, "info");
  }
}
