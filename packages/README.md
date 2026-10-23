# Third-party forks

此目录专用于第三方项目的本地 fork，与 `../extensions/` 的发布入口分开登记。每个 fork 保留自己的目录、manifest、文档、配套资源和已有许可文件。

| Fork | 上游 | 迁移来源 | 总包默认整合 |
|---|---|---|---|
| `pi-learn` | https://github.com/amosblomqvist/learn | `srp-dotfiles/pi/packages/pi-learn` 的当前工作树快照 | 否 |

`pi-learn` 是已在 dotfiles 中修改的版本，并非未经修改的上游发行版。原目录未记录确定的上游 commit，故没有推断或补写一个版本。保留的 README 是上游文档与本地修改的现状；在本仓库使用时以根 README 的打包说明为准。

嵌入的 `subagents/` 也是已修改代码；其现有 README 与 LICENSE 一并保留，来源和许可说明见 [../THIRD_PARTY.md](../THIRD_PARTY.md)。

在 `../kit.config.json` 的 `forks` 下登记包的路径、upstream、独立 npm 名称、版本和 `bundle` 开关。需要独立发布时运行 `npm run prepare:fork -- pi-learn`；需要整合进总包时将 `bundle` 设为 `true` 后运行 `npm run manifest`。脚本显式转换 fork manifest 的资源路径，并合并其已有运行时依赖。

顶层 `srp-dotfiles/pi/skills/` 不属于此仓库；fork 本身的 skills 保留为 fork 的组成部分。
