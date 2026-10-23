# pi-kit

> 面向 [Pi Coding Agent](https://pi.dev) 的模块化扩展、提示词模板与技能套件。只安装 **`@rol1n/pi-kit`** 一个包，通过 Pi 配置选择加载哪些功能。

<p align="left">
  <a href="README.md"><b>English</b></a> •
  <b>中文说明</b>
</p>

[![npm version](https://img.shields.io/npm/v/@rol1n/pi-kit?style=flat-square&logo=npm)](https://www.npmjs.com/package/@rol1n/pi-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

---

## 安装

```sh
pi install npm:@rol1n/pi-kit
```

包含 **15 个扩展入口、7 个提示词模板及 worktree-studio 技能**。扩展与提示词命令默认加载，技能正文按需读取；无需安装独立扩展包。通过[资源按需筛选](#资源按需筛选)禁用不需要的扩展，或仅启用指定功能。具体功能仍可能需要认证、平台支持或单独激活（例如 `/mem-log on` 开启后台记忆）。

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

每个扩展目录都有 `index.ts` 入口和英文 README，介绍对应命令、参数与配置。以下入口全部直接声明在 `package.json` 中：

| 扩展 | 功能简介 | 配置中使用的入口路径 |
| :--- | :--- | :--- |
| [ask-u-questions](ask-u-questions/README.md) | 交互式单选、多选与自由文本提问 | `ask-u-questions/index.ts` |
| [continue-signal](continue-signal/README.md) | 通过 `/continue` 或 `Alt+C` 继续未完成任务 | `continue-signal/index.ts` |
| [custom-providers](custom-providers/README.md) | 注册自定义模型服务商与网关 | `custom-providers/index.ts` |
| [image-generate](image-generate/README.md) | 图片生成工具与 `/image-generate` 模型选择器 | `image-generate/index.ts` |
| [memory-log](memory-log/README.md) | 分层观察记忆、原始对话溯源与安全压缩 | `memory-log/index.ts` |
| [model-vision](model-vision/README.md) | 图片理解与 OCR（`model_vision`） | `model-vision/index.ts` |
| [multi-harness](multi-harness/README.md) | 跨 `pi`、`codex`、`claude`、`opencode` 委派任务 | `multi-harness/index.ts` |
| [oai-subquota](oai-subquota/README.md) | OpenAI Codex 订阅额度监控 | `oai-subquota/index.ts` |
| [prompt-snipaste](prompt-snipaste/README.md) | 面向已启用 Pi 提示词的通用选择器（`/snipaste`、`Alt+S`） | `prompt-snipaste/index.ts` |
| [screenshot](screenshot/README.md) | 插入最新 Windows / WSL 截图路径 | `screenshot/index.ts` |
| [srp-theme](srp-theme/README.md) | 最近提问预览与实时流式 TPS 仪表 | `srp-theme/index.ts` |
| [subagent](subagent/README.md) | tmux / Zellij 分屏或后台进程中的并发 Pi 子智能体 | `subagent/index.ts` |
| [tui-asr](tui-asr/README.md) | 百炼语音听写（`/asr`、`Alt+M`） | `tui-asr/index.ts` |
| [web-reach](web-reach/README.md) | 免 Key Exa MCP 搜索与多级网页正文提取 | `web-reach/index.ts` |
| [windows-wheel-fix](windows-wheel-fix/README.md) | Windows ConPTY / Zellij 滚轮修复，其他平台无操作 | `windows-wheel-fix/index.ts` |

---

## 技能

根目录 [`skills/`](skills/) 通过 `pi.skills` 声明，随同一个 npm 包分发。技能是工作流指导，不是扩展代码：Pi 先展示其名称与描述，需要时再读取完整内容。

| 技能 | 用途 |
| :--- | :--- |
| [worktree-studio](skills/worktree-studio/SKILL.md) | 规划隔离的 Git worktree 方案实验，委派实现，收集真实 diff 与验证结果，再比较取舍，不自动集成或删除成果 |

可显式使用 `/skill:worktree-studio 比较这次修改的可行实现方案`。实验需要 Git 和可用的委派运行时，`multi_harness`、`subagent` 都可以使用。创建 worktree 或启动付费 worker 前会要求确认；同意探索不等于授权合并、提交或删除结果。

只使用该技能，不加载 kit 的扩展和提示词：

```json
{
  "packages": [
    {
      "source": "npm:@rol1n/pi-kit",
      "extensions": [],
      "prompts": [],
      "skills": ["skills/worktree-studio/SKILL.md"]
    }
  ]
}
```

请移除其他已配置技能目录里的旧副本，避免同名冲突。在包配置中设置 `"skills": []` 可单独禁用技能，不影响扩展和提示词。

---

## 独立提示词目录

根目录 [`prompts/`](prompts/) 是独立、标准的 Pi 资源，在 `package.json` 中通过 `"pi": { "prompts": ["./prompts"] }` 声明，不属于、也不依赖 `prompt-snipaste` 扩展。

模板会成为普通 Pi 斜杠命令：[/ask-questions](prompts/ask-questions.md)、[/delegate-exploration](prompts/delegate-exploration.md)、[/diagnose-report](prompts/diagnose-report.md)、[/frontend-tech-preset](prompts/frontend-tech-preset.md)、[/orchestrator-mode](prompts/orchestrator-mode.md)、[/session-kickoff](prompts/session-kickoff.md)、[/verify-not-assume](prompts/verify-not-assume.md)。即使禁用 `prompt-snipaste`，或配置 `"extensions": []`，这些模板仍可单独使用。

如需只部署本地检出目录中的模板，可通过顶层 `prompts` 引用，无需加载任何扩展：

```json
{
  "prompts": ["/absolute/path/to/pi-kit/prompts"]
}
```

升级后，已有筛选配置中的 `prompt-snipaste/prompts/...` 路径需要改为 `prompts/...`。

反过来，`prompt-snipaste` 是面向**任意已启用 Pi 提示词**的通用组合框架，可读取全局、已信任项目或其他包提供的模板，不依赖固定文件名，也没有内置模板兜底。

---

## 资源按需筛选

编辑全局 `~/.pi/agent/settings.json` 或项目 `.pi/settings.json`，将 `packages` 数组中原有的 `"npm:@rol1n/pi-kit"` 字符串替换为对象，保留其他包。**`source` 是 `packages[]` 内的字段，不是顶层字段。** 筛选路径相对于安装包根目录，不是启动列表里的 `@rol1n/pi-kit:...` 展示名称。

### 黑名单：禁用部分扩展

以下配置加载除语音听写、网页搜索与 Windows 滚轮修复之外的所有扩展。不写 `prompts` 和 `skills`，仍然提供全部 7 个模板及内置技能：

```json
{
  "packages": [
    {
      "source": "npm:@rol1n/pi-kit",
      "extensions": [
        "!tui-asr/**",
        "!web-reach/**",
        "!windows-wheel-fix/**"
      ]
    }
  ]
}
```

### 白名单：只加载指定扩展

以下配置只启用记忆与 Pi 子智能体，不加载内置提示词命令或技能：

```json
{
  "packages": [
    {
      "source": "npm:@rol1n/pi-kit",
      "extensions": ["memory-log/index.ts", "subagent/index.ts"],
      "prompts": [],
      "skills": []
    }
  ]
}
```

### 筛选规则

| 写法 | 效果 |
| :--- | :--- |
| 省略某个资源字段 | 加载包中声明的全部该类资源 |
| `"extensions": []` | 禁用全部扩展入口，不影响提示词和技能 |
| `"extensions": ["!tui-asr/**"]` | 加载除匹配项之外的全部扩展 |
| `"extensions": ["memory-log/index.ts"]` | 只加载匹配入口 |
| `"extensions": ["-tui-asr/index.ts"]` | 按精确路径排除一个入口 |
| `"prompts": ["prompts/diagnose-report.md"]` | 只加载该提示词模板 |
| `"prompts": []` | 禁用全部内置提示词模板 |
| `"skills": []` | 禁用全部内置技能 |
| `"skills": ["skills/worktree-studio/SKILL.md"]` | 只加载该技能 |

修改后执行 `/reload` 或重启 Pi。也可以在终端运行 `pi config`，交互勾选并保存配置。如果不希望未来升级时自动启用新增扩展，请使用白名单。

### 依赖与工具重名

筛选控制入口加载，不会卸载文件或阻止其他入口导入模块。`image-generate` 和 `tui-asr` 会主动初始化共用的 `custom-providers`；若不希望注册这些服务商，需要同时排除三个入口。`multi-harness` 复用 `subagent/mux.ts`，不要求启用 `subagent` 工具入口。这些依赖均包含在同一个包内，无需再安装其他独立扩展包。

如果其他包已经提供同名工具，请禁用重叠入口，尤其是 `web-reach`（`web_search`、`web_fetch`）和 `image-generate`（`image_generate`）。扩展与根目录 `prompts/` 资源彼此独立：禁用 `prompt-snipaste/index.ts` 后仍可使用模板命令；禁用全部 kit 提示词后，选择器仍可使用其他来源中已启用的提示词。

### 从独立包迁移

本仓库此后只发布 `@rol1n/pi-kit`。已发布的独立版本仍保留在 npm，但本工作流不再发布其新版本。请先移除旧独立包的配置，再通过聚合包启用相同扩展，避免重复注册；按需加载改用上述筛选配置。

---

## 构建与发布

[package.json](package.json) 是包元数据、版本、发布文件及 Pi 资源的唯一配置来源，直接编辑即可，无需生成清单或构建独立包。新增扩展时，将目录加入 `files`、入口加入 `pi.extensions`，默认随包加载。技能放在 `skills/<name>/SKILL.md`，提示词放在 `prompts/<name>.md`，已声明的资源根目录会自动覆盖新增文件。

```sh
npm run check                      # 校验清单与扩展覆盖范围
npm test                           # 运行离线 memory-log 与提示词选择器测试
npm pack --dry-run --ignore-scripts # 检查 npm 包内容
```

### 发布

1. 修改代码，直接提升 `package.json` 中的 `version`。
2. 推送到 `main`，或在 GitHub Actions 手动运行 **Publish to npm**。
3. [工作流](.github/workflows/publish.yml) 校验清单、运行测试，随后**仅发布根目录的 `@rol1n/pi-kit`**，附带 npm provenance。已发布版本自动跳过；查询遇到网络或注册表错误会使任务失败，不会误判为尚未发布。

自动触发范围是 `package.json`、校验脚本和工作流本身。仅修改扩展代码不会发布，准备发布时请提升版本。任务串行执行，不取消进行中的发布。CI 使用已配置的 npm Trusted Publisher，或提供的 `NPM_TOKEN`；不会重写清单或自动升级版本。

如需经授权后在本地发布，直接使用标准命令：`npm publish --access public`。

---

## 致谢

- [elpapi42/pi-observational-memory](https://github.com/elpapi42/pi-observational-memory) — [`memory-log`](memory-log/README.md) 的观察记忆架构灵感与上游基础。
- [earendil-works/pi](https://github.com/earendil-works/pi) — Pi Coding Agent 运行时与 SDK。

---

## 许可证

[MIT](LICENSE) © RoL1n_SrP
