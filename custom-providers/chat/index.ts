import type { ModalityProvidersRecord } from "../types.ts";
import { magpieChatProvider } from "./magpie.ts";
import {
  BIGMODEL_MODELS,
  DASHSCOPE_CHAT_MODELS,
} from "./models.ts";

const BIGMODEL_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
const DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

export const chatProviders: ModalityProvidersRecord = {
  magpie: magpieChatProvider,
  bigmodel: {
    name: "BigModel (智谱)",
    baseUrl: BIGMODEL_BASE_URL,
    api: "openai-completions",
    models: BIGMODEL_MODELS,
  },
  dashscope: {
    name: "Aliyun DashScope (阿里百炼)",
    baseUrl: DASHSCOPE_BASE_URL,
    api: "openai-completions",
    models: DASHSCOPE_CHAT_MODELS,
  },
};
