import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { AskUserQuestionParams, getOtherLabel, isChineseContext, normalizeOptions, type AskUserQuestionResultDetails } from "./types.ts";

export const questionRenderers: Pick<ToolDefinition<typeof AskUserQuestionParams, AskUserQuestionResultDetails>, "renderCall" | "renderResult"> = {
  renderCall(args, theme, context) {
    const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
    const options = normalizeOptions(
      args.options as Array<{ label: string; value?: string; description?: string }> | undefined,
    );
    const isZh = isChineseContext(args.question || "", options, args.details);
    let summary =
      theme.fg("toolTitle", theme.bold("ask_user_question ")) +
      theme.fg("accent", `"${args.question || ""}"`);
    if (args.multiSelect) {
      summary += theme.fg("dim", " [multi-select]");
    }
    if (options.length > 0) {
      const otherLbl = getOtherLabel(options, isZh);
      const labels = [...options.map((option) => option.label), otherLbl].join(", ");
      const optPrefix = isZh ? "  选项: " : "  Options: ";
      summary += `\n${theme.fg("dim", `${optPrefix}${labels}`)}`;
    }
    text.setText(summary);
    return text;
  },

  renderResult(result, _options, theme, context) {
    const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
    const details = result.details as AskUserQuestionResultDetails | undefined;
    if (!details) {
      const first = result.content?.[0];
      text.setText(first?.type === "text" ? first.text : "");
      return text;
    }

    const isZh = isChineseContext(details.question || "", details.answers, details.context);

    if (details.status === "cancelled") {
      const defaultCancelled = isZh ? "已取消" : "Cancelled";
      text.setText(theme.fg("warning", `⊘ ${details.message || defaultCancelled}`));
      return text;
    }

    if (details.status === "unavailable") {
      const defaultUnavailable = isZh ? "提问工具不可用" : "Tool unavailable";
      text.setText(theme.fg("error", `! ${details.message || defaultUnavailable}`));
      return text;
    }

    const emptyText = isZh ? "(空回答)" : "(empty)";
    const otherPrefix = isZh ? "其他：" : "Other: ";

    const lines = details.answers.map((answer) => {
      switch (answer.type) {
        case "text":
          return `${theme.fg("success", "✓ ")}${theme.fg("accent", answer.label || emptyText)}`;
        case "other":
          return `${theme.fg("success", "✓ ")}${theme.fg("muted", otherPrefix)}${theme.fg("accent", answer.label)}`;
        case "option":
          return `${theme.fg("success", "✓ ")}${theme.fg("accent", `${answer.index}. ${answer.label}`)}`;
      }
    });
    text.setText(lines.join("\n"));
    return text;
  },
};
