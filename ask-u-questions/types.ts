import { Type } from "typebox";

const OptionSchema = Type.Object({
  label: Type.String({ description: 'Option label. Put a recommended option first and append "(Recommended)".' }),
  value: Type.Optional(Type.String({ description: "Machine-readable value; defaults to the label." })),
  description: Type.Optional(Type.String({ description: "Additional context shown below the option." })),
});

export const AskUserQuestionParams = Type.Object({
  question: Type.String({ description: "The question to ask. Ask only one question per call." }),
  details: Type.Optional(Type.String({ description: "Background or instructions shown below the question." })),
  options: Type.Optional(Type.Array(OptionSchema, {
    description: "Choices for selection. Omit or pass an empty array for free-text input. An Other choice is always available.",
  })),
  multiSelect: Type.Optional(Type.Boolean({ description: "Allow selecting multiple options when true." })),
});

export interface AskOption {
  label: string;
  value: string;
  description?: string;
}

export interface DisplayOption extends AskOption {
  id: string;
  index?: number;
  isOther?: boolean;
  isSubmit?: boolean;
}

export interface TextAnswer {
  type: "text";
  label: string;
  value: string;
}

export interface OptionAnswer {
  type: "option";
  label: string;
  value: string;
  index: number;
}

export interface OtherAnswer {
  type: "other";
  label: string;
  value: string;
}

export type AskAnswer = TextAnswer | OptionAnswer | OtherAnswer;
export type AskUserQuestionStatus = "answered" | "cancelled" | "unavailable";
export type AskUserQuestionMode = "text" | "single-select" | "multi-select";

export interface AskUserQuestionResultDetails {
  status: AskUserQuestionStatus;
  question: string;
  context?: string;
  mode: AskUserQuestionMode;
  answers: AskAnswer[];
  message?: string;
}

export function normalizeOptions(
  options: Array<{ label: string; value?: string; description?: string }> | undefined,
): AskOption[] {
  return (options || [])
    .map((option) => ({
      label: option.label.trim(),
      value: option.value?.trim() || option.label.trim(),
      description: option.description?.trim() || undefined,
    }))
    .filter((option) => option.label.length > 0);
}

export function isChineseContext(
  question: string,
  options?: Array<{ label?: string; description?: string }>,
  context?: string,
): boolean {
  if (/[\u4e00-\u9fa5]/.test(question)) return true;
  if (context && /[\u4e00-\u9fa5]/.test(context)) return true;
  if (options && options.some((o) => (o.label && /[\u4e00-\u9fa5]/.test(o.label)) || (o.description && /[\u4e00-\u9fa5]/.test(o.description)))) {
    return true;
  }
  return false;
}

export function getOtherLabel(options: AskOption[], isZh = false): string {
  if (isZh) {
    return options.some((option) => option.label === "其他（自定义输入）")
      ? "自定义输入"
      : "其他（自定义输入）";
  }
  return options.some((option) => option.label === "Other (custom input)")
    ? "Custom input"
    : "Other (custom input)";
}

function answerSortRank(answer: AskAnswer): number {
  switch (answer.type) {
    case "option":
      return answer.index;
    case "other":
      return Number.MAX_SAFE_INTEGER - 1;
    case "text":
      return Number.MAX_SAFE_INTEGER;
  }
}

export function sortAnswers(answers: AskAnswer[]): AskAnswer[] {
  return [...answers].sort((a, b) => answerSortRank(a) - answerSortRank(b));
}

function formatAnswerForModel(answer: AskAnswer): string {
  switch (answer.type) {
    case "text":
      return answer.label;
    case "other":
      return `Other: ${answer.label}`;
    case "option":
      return `${answer.index}. ${answer.label}`;
  }
}

function buildStructuredResult(
  status: AskUserQuestionStatus,
  question: string,
  mode: AskUserQuestionMode,
  answers: AskAnswer[],
  context?: string,
  message?: string,
): AskUserQuestionResultDetails {
  return {
    status,
    question,
    context,
    mode,
    answers,
    message,
  };
}

export function cancelledResult(question: string, mode: AskUserQuestionMode, context?: string) {
  const isZh = isChineseContext(question, undefined, context);
  const message = isZh ? "用户取消了本次提问" : "User cancelled the question.";
  return {
    content: [{ type: "text" as const, text: message }],
    details: buildStructuredResult("cancelled", question, mode, [], context, message),
  };
}

export function unavailableResult(question: string, mode: AskUserQuestionMode, message: string, context?: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    details: buildStructuredResult("unavailable", question, mode, [], context, message),
  };
}

export function buildResult(
  question: string,
  context: string | undefined,
  mode: AskUserQuestionMode,
  answers: AskAnswer[],
) {
  const isZh = isChineseContext(question, answers, context);
  let text: string;
  if (mode === "text") {
    const answer = answers[0];
    if (isZh) {
      text = answer.label.trim().length > 0
        ? `用户输入回答: ${answer.label}`
        : "用户提交了空回答";
    } else {
      text = answer.label.trim().length > 0
        ? `User answered: ${answer.label}`
        : "User submitted an empty answer";
    }
  } else if (mode === "single-select") {
    text = isZh
      ? `用户选择项: ${formatAnswerForModel(answers[0])}`
      : `User selected: ${formatAnswerForModel(answers[0])}`;
  } else {
    text = isZh
      ? `用户选择多项:\n${answers.map((answer) => `- ${formatAnswerForModel(answer)}`).join("\n")}`
      : `User selected multiple:\n${answers.map((answer) => `- ${formatAnswerForModel(answer)}`).join("\n")}`;
  }

  return {
    content: [{ type: "text" as const, text }],
    details: buildStructuredResult("answered", question, mode, answers, context),
  };
}
