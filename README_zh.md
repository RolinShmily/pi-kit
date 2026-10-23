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

[kit.config.json](kit.config.json) 统一管理聚合包选择（`bundle`）、扩展间的依赖关系（`deps`）与发布版本。顶层 `version` 属于 `@rol1n/pi-kit`；各扩展可以单独设置 `version`，未设置时继承顶层版本。为每个扩展显式设置版本即可让聚合包与独立包分别升级。

### 自动发布

1. 修改代码，并在 `kit.config.json` 中提升需要发布的包的版本。
2. 将包含 `kit.config.json` 或 `package.json` 变更的提交推送到 `main`，或在 GitHub Actions 手动运行 **Publish to npm**。修改打包脚本或工作流本身也会触发发布流程。
3. 自动和手动触发均执行同一条流水线：

```sh
npm run manifest
npm run check
npm run publish:ci -- all
```

[`.github/workflows/publish.yml`](.github/workflows/publish.yml) 会生成 `package.json`、校验扩展布局，再按依赖顺序发布所有独立扩展，最后发布聚合包。已存在的版本自动跳过，不会自动提升版本号。`bundle: false` 只表示不纳入聚合包，不影响独立发布。发布流程不会并行执行，新触发的流程也不会取消正在进行的发布。仅修改扩展代码不会触发发布。

发布 npm 包无需本地运行 `manifest` 或 `publish`。CI 只在运行目录中生成清单，不会自动提交回仓库。若使用本地或 Git 安装，调整聚合包选择或版本后仍应运行 `npm run manifest` 并提交生成的 `package.json`，保持仓库清单同步。

### 本地开发与手动发布

```sh
# 同步本地清单并校验所有扩展
npm run manifest
npm run check

# 将单个扩展构建到 dist/<id>
npm run prepare:extension -- memory-log

# 可选的本地发布，也支持 extensions、kit 或单个扩展 ID
npm run publish:ci -- all
```

---

## 致谢

- [elpapi42/pi-observational-memory](https://github.com/elpapi42/pi-observational-memory) — [`memory-log`](memory-log/README.md) 的观察记忆架构灵感与上游基础。
- [earendil-works/pi](https://github.com/earendil-works/pi) — Pi Coding Agent 运行时与 SDK。

---

## 许可证

[MIT](LICENSE) © RoL1n_SrP
