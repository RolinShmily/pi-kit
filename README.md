# pi-kit

Pi extensions 与 prompt templates 的源码和发布仓库。`extensions/` 保存扩展源码，`prompts/` 保存模板，`packages/` 专门保存第三方项目的本地 fork。

顶层 skills、个人 settings、MCP 配置、keybindings 和 OS 部署仍由 srp-dotfiles 管理。本仓库不迁移 `srp-dotfiles/pi/skills/`。扩展或 fork 内原有的配套 skills 作为其源码保留；只有 fork 的 manifest 明确声明时才随 fork 暴露。

## 目录

```text
pi-kit/
├── kit.config.json       # 总包选择、各扩展与 fork 的 npm 名称及版本
├── package.json          # 根据 kit.config.json 同步的 Pi/npm manifest
├── extensions/           # 一份源码，同时用于总包与独立小包
├── prompts/
├── packages/             # 第三方 fork；默认不整合进总包
├── scripts/package.mjs   # 同步清单与准备独立发布目录
└── THIRD_PARTY.md
```

## 本地使用

```sh
pi install /absolute/path/to/pi-kit
```

发布后使用 `pi install npm:pi-kit`。当前 npm 名称是初始配置，尚未检查占用情况；发布前可在 `kit.config.json` 改为自己的 npm scope，并运行 `npm run manifest`。源码仓库为 [RolinShmily/pi-kit](https://github.com/RolinShmily/pi-kit)，Git remote 使用 SSH：`git@github.com:RolinShmily/pi-kit.git`。

skills 继续由 dotfiles 的 settings 管理，例如保留其原有绝对路径；Pi 自己不识别 dotfiles 部署器的 `@repo/` 令牌。不要同时通过 dotfiles 的旧 extension 路径和这个包加载同一个扩展。

## 总包与小包共用源码

`kit.config.json` 中每个 extension 的 `entry` 指定 Pi 入口，`files` 指定该功能运行所需的源码和资产，`bundle` 决定它是否整合进总包。总包直接引用这些入口，小包准备脚本复制同一份源码到忽略提交的 `dist/`，不维护第二套实现。

跨扩展依赖需要列在 `files` 中：例如 `multi-harness` 还携带 `subagent/mux.ts`；生图和语音扩展携带 `custom-providers/`。把辅助源码带进小包不会自动注册其他扩展。脚本会检查小包中的字面量相对 import 是否齐全；动态读取的文件或后续新增依赖仍应更新 `files` 并实际验证。

当前总包选择与原 Arch 配置一致：10 个 extension 入口和 7 个 prompts。其余扩展已迁入，并可单独打包；需要整合时将对应的 `bundle` 改为 `true`。Windows 滚轮补丁默认未整合，因为它当前没有平台检查。

客户端 settings 可以进一步筛选总包已经公开的资源：

```json
{
  "packages": [
    {
      "source": "npm:pi-kit",
      "extensions": ["extensions/**", "!extensions/tui-asr.ts"],
      "prompts": ["prompts/diagnose-report.md"]
    }
  ]
}
```

也可以使用 `pi config`。客户端筛选只影响加载；需要改变发布内容时编辑 `kit.config.json`。总包和小包是不同 npm 包，Pi 不会按功能自动去重：同时安装时须在总包中排除已由小包提供的入口。

## npm 与 Pi 官网列表

GitHub 只有一个源码仓库；每个独立发布的 npm 名称都有自己的 npm 页面、版本和下载统计。总包和小包的 `repository` 都指向同一个 GitHub 仓库，小包额外标记源码所在目录。

Pi 官网 packages 列表按 npm 包发现，`pi-package` keyword 使包具备被收录资格，收录与索引刷新不保证即时完成。目前总包和生成的小包都带有这个 keyword，因此分别发布后都具备成为独立条目的资格。只发布总包时，不会因为其中包含多个 extension 而自动出现多个 npm 包或官网条目。希望仅总包参与官网发现时，可在发布小包前移除它的 `pi-package` keyword；这不影响通过 npm 来源安装。

## 准备与发布

同步并检查总包：

```sh
npm run manifest
npm run check
npm pack --dry-run --ignore-scripts
# 检查打包结果后，在仓库根目录发布
npm publish --access public
```

准备独立扩展（与它的 `bundle` 开关无关）：

```sh
npm run prepare:extension -- memory-log
npm run prepare:extension -- multi-harness
cd dist/extensions/memory-log
npm pack --dry-run --ignore-scripts
npm publish --access public
```

准备第三方 fork：

```sh
npm run prepare:fork -- pi-learn
cd dist/forks/pi-learn
npm pack --dry-run --ignore-scripts
# 核对来源、许可证和依赖后再发布
npm publish --access public
```

`kit.config.json` 中总包、各扩展、各 fork 的名称与版本可分别调整。直接执行 `npm version` 后需要把版本同步回该配置。每次发布必须使用未发布过的新版本号。上述准备过程不安装依赖，也不会自动发布。运行时使用 Pi 提供的宿主库，manifest 将其声明为 peers；fork 的既有 dependencies 随其保留。

客户端更新：

```sh
pi update npm:pi-kit
# 更新全部安装的 Pi packages
pi update --extensions
```

## 第三方 fork 与可选依赖

详见 [packages/README.md](packages/README.md) 与 [THIRD_PARTY.md](THIRD_PARTY.md)。`packages/pi-learn/` 默认独立管理；将其 `bundle` 改为 `true` 后，总包会显式整合 fork 的入口、配套 skills 和既有 npm dependencies。fork 内自己的 package.json 不会被顶层扫描自动整合。

`web-reach` 和 fork 中的 web 工具已有一个按需导入 `unpdf` 的 PDF 分支；导入失败会降级处理，初始迁移没有新增该依赖。系统工具、浏览器、音频设备和模型认证仍按各扩展原本的要求配置。

Magpie 网关通过 `MAGPIE_BASE_URL` 指定，默认 `http://127.0.0.1:3425/v1`；原先 dotfiles 中的 `http://n100.tail.net:3425/v1` 需要在个人配置或环境中明确设置。分类器通过 Pi 的公开 provider 集合取得宿主实现，已移除固定 Windows 用户目录的回退路径。`multi-harness` 的 `worktree-studio` 提示仅在该外部 skill 已安装时适用。

本仓库的 `pi-learn` 已关闭旧 bootstrap 对全局 agent 文件的复制和覆盖，直接使用内嵌 subagents 的包内发现机制，保留个人和项目 agent 的覆盖优先级。Mermaid CLI 按目录向上查找本地 npm bin，兼容 fork 独立安装和整合后的依赖位置。

迁移保留现有源码及已有许可文件，没有为第三方代码另行授予许可证。`pi-learn` 根目录原本没有完整项目许可证，首次发布该 fork 前需要核实上游许可范围；内嵌 subagents 的许可文件不能代表整个 fork。
