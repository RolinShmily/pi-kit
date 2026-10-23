# pi-kit

> 面向 [Pi Coding Agent](https://pi.dev) 的模块化扩展与提示词模板套件，支持作为 **`@rol1n/pi-kit`** 聚合包或 **`@rol1n/<extension>`** 独立包安装。

<p align="left">
  <a href="README.md"><b>English</b></a> •
  <b>中文说明</b>
</p>

[![npm version](https://img.shields.io/npm/v/@rol1n/pi-kit?style=flat-square&logo=npm)](https://www.npmjs.com/package/@rol1n/pi-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

---

## 安装

安装默认聚合包：

```sh
pi install npm:@rol1n/pi-kit
```

或按需安装任意独立扩展包：

```sh
pi install npm:@rol1n/memory-log
pi install npm:@rol1n/subagent
pi install npm:@rol1n/multi-harness
```

开发期间也可直接从 GitHub 或本地目录安装：

```sh
pi install https://github.com/RolinShmily/pi-kit
pi install /absolute/path/to/pi-kit
```

更新已安装的包：

```sh
pi update npm:@rol1n/pi-kit
pi update --extensions
```

---

## 扩展列表

仓库根目录下每个文件夹均为自包含扩展（`<name>/index.ts` + `README.md`）。各扩展的详细命令、参数与配置说明请参阅对应目录的 README：

| 扩展目录 | 功能简介 | 默认纳入 `pi-kit` | 独立 npm 包名 |
| :--- | :--- | :---: | :--- |
| [ask-u-questions](ask-u-questions/README.md) | 交互式单选、多选与自由文本提问弹窗（共享 UI 锁） | Yes | `@rol1n/ask-u-questions` |
| [continue-signal](continue-signal/README.md) | 通过 `/continue` 或 `Alt+C` 唤醒空闲智能体继续未完成任务 | Yes | `@rol1n/continue-signal` |
| [custom-providers](custom-providers/README.md) | 自定义模型服务商与网关（Magpie、智谱、阿里百炼等）注册 | Yes | `@rol1n/custom-providers` |
| [image-generate](image-generate/README.md) | OpenRouter / 百炼文生图与参考图生图工具及 `/image-generate` 模型选择器 | Yes | `@rol1n/image-generate` |
| [memory-log](memory-log/README.md) | 分层异步观察记忆系统与零模型阻塞的确定性秒级压缩 | Yes | `@rol1n/memory-log` |
| [model-vision](model-vision/README.md) | 本地与远程图片视觉理解、OCR 与 UI 诊断工具（`model_vision`） | No | `@rol1n/model-vision` |
| [multi-harness](multi-harness/README.md) | 跨 `pi`、`codex`、`claude`、`opencode` 的多 CLI 协同委派运行时 | Yes | `@rol1n/multi-harness` |
| [oai-subquota](oai-subquota/README.md) | OpenAI Codex 订阅额度（5h / 7d 窗口与重置时间）状态栏监控 | Yes | `@rol1n/oai-subquota` |
| [prompt-snipaste](prompt-snipaste/README.md) | 提示词片段选择器（`/snipaste`、`Alt+S`），内置 7 个常用提示词模板 | Yes | `@rol1n/prompt-snipaste` |
| [screenshot](screenshot/README.md) | 一键将最新 Windows / WSL 系统截图路径插入编辑器（`/screenshot`） | No | `@rol1n/screenshot` |
| [srp-theme](srp-theme/README.md) | 编辑器下方最近提问预览组件与实时流式 TPS 速率仪表 | Yes | `@rol1n/srp-theme` |
| [subagent](subagent/README.md) | 基于 tmux / Zellij 分屏或后台进程的并发 Pi 子智能体工具 | Yes | `@rol1n/subagent` |
| [tui-asr](tui-asr/README.md) | 基于阿里百炼 Paraformer 的终端实时流式语音听写（`/asr`、`Alt+M`） | Yes | `@rol1n/tui-asr` |
| [web-reach](web-reach/README.md) | 免 Key Exa MCP 网页搜索与多级网页正文提取（RSC / HTML / PDF / Jina） | No | `@rol1n/web-reach` |
| [windows-wheel-fix](windows-wheel-fix/README.md) | 修复 Windows ConPTY / Zellij 下鼠标滚轮被误转为上下方向键的问题 | Yes (仅 Windows) | `@rol1n/windows-wheel-fix` |

> 带有跨扩展依赖的独立包（`tui-asr` / `image-generate` 依赖 `@rol1n/custom-providers`，`multi-harness` 依赖 `@rol1n/subagent`）已声明标准 npm `dependencies`，单独安装时会自动拉取补全并激活所需依赖。

---

## 资源按需筛选

`@rol1n/pi-kit` 默认导出 12 个扩展入口与 [prompt-snipaste/prompts](prompt-snipaste/prompts/) 下的 7 个提示词模板。可通过 `pi config` 或在 `settings.json` 中按需过滤：

```json
{
  "packages": [
    {
      "source": "npm:@rol1n/pi-kit",
      "extensions": ["**/*.ts", "!tui-asr/**"],
      "prompts": ["prompt-snipaste/prompts/diagnose-report.md"]
    }
  ]
}
```

---

## 构建与发布

[kit.config.json](kit.config.json) 统一管理哪些扩展纳入 `@rol1n/pi-kit`（`bundle: true`）以及扩展间的依赖关系（`deps`）。

```sh
# 从 kit.config.json 同步生成 package.json 并校验所有扩展
npm run manifest
npm run check

# 将单个扩展构建到 dist/<id>
npm run prepare:extension -- memory-log

# 发布更新（支持 extensions、kit、all 或单个扩展 ID）
npm run publish:ci -- extensions
npm run publish:ci -- kit
```

GitHub Actions 自动发布工作流位于 [`.github/workflows/publish.yml`](.github/workflows/publish.yml)。

---

## 致谢

- [elpapi42/pi-observational-memory](https://github.com/elpapi42/pi-observational-memory) — [`memory-log`](memory-log/README.md) 的观察记忆架构灵感与上游基础。
- [earendil-works/pi](https://github.com/earendil-works/pi) — Pi Coding Agent 运行时与 SDK。

---

## 许可证

[MIT](LICENSE) © RoL1n_SrP
