/** Interactive questions, serialized through the shared dialog lock. */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  AskUserQuestionParams,
  buildResult,
  cancelledResult,
  normalizeOptions,
  unavailableResult,
  type AskUserQuestionMode,
} from "./types.ts";
import { withUILock } from "./dialog-ui.ts";
import { askSingleChoice } from "./single-choice.ts";
import { askMultiChoice } from "./multi-choice.ts";
import { questionRenderers } from "./tool-renderers.ts";

export type { AskOption, TextAnswer, OptionAnswer, OtherAnswer, AskAnswer, AskUserQuestionStatus, AskUserQuestionMode, AskUserQuestionResultDetails } from "./types.ts";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user_question",
    label: "Ask User Question",
    description:
      "Ask the user a clear question and pause execution until they select an option or provide input. Useful when requirements are ambiguous, user preferences or architectural decisions are needed, or critical operations require explicit user confirmation. Always phrase the question and options in the same language as the conversation context. Ask exactly one focused question per call.",
    promptSnippet:
      "Ask the user a question to clarify requirements or gather decisions instead of making assumptions.",
    promptGuidelines: [
      "Always phrase the question and options in the same language as the conversation context (e.g. ask in Chinese if conversing in Chinese, ask in English if conversing in English).",
      "Ask exactly one specific question per tool call.",
      "If you need input across multiple distinct dimensions, make separate tool calls instead of combining them into one.",
      "When options are provided, an 'Other (custom input)' choice is automatically available in the user interface.",
      "Set multiSelect: true only when the user is expected to select multiple choices.",
      'Put the recommended option first in the list and append "(Recommended)" to its label.',
      "Prefer using this tool whenever multiple valid implementation paths exist that depend on user preference.",
    ],
    parameters: AskUserQuestionParams,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const options = normalizeOptions(params.options);
      const context = params.details?.trim() || undefined;
      const mode: AskUserQuestionMode =
        options.length === 0
          ? "text"
          : params.multiSelect
            ? "multi-select"
            : "single-select";

      if (signal?.aborted) {
        return cancelledResult(params.question, mode, context);
      }

      if (!ctx.hasUI) {
        return unavailableResult(
          params.question,
          mode,
          "ask_user_question requires an interactive TUI environment",
          context,
        );
      }

      return withUILock(async () => {
        if (mode === "text") {
          const editorTitle = context
            ? `${params.question}\n\n${context}`
            : params.question;
          const answer = await ctx.ui.editor(editorTitle);
          if (answer === undefined) {
            return cancelledResult(params.question, mode, context);
          }
          return buildResult(params.question, context, mode, [
            { type: "text", label: answer.trim(), value: answer.trim() },
          ]);
        }

        if (mode === "single-select") {
          const answer = await askSingleChoice(ctx, params.question, context, options);
          if (!answer) {
            return cancelledResult(params.question, mode, context);
          }
          return buildResult(params.question, context, mode, [answer]);
        }

        const answers = await askMultiChoice(ctx, params.question, context, options);
        if (!answers) {
          return cancelledResult(params.question, mode, context);
        }
        return buildResult(params.question, context, mode, answers);
      });
    },

    ...questionRenderers,
  });
}
