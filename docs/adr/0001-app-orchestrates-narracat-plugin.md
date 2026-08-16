# ADR 0001: App Orchestrates NarraCat Plugin

## Status

Accepted

Superseded in part by the Agent Core cutover (ADR 0007, kept private): NarraCat-app now owns the internal NarraCat Agent Core, and the engine is discovered through its own `narracat.manifest.json` contract.

> Current reading: the App-vs-engine boundary remains valid, but the "NarraCat plugin" wording and the ongoing upstream-sync workflow below are historical. The current engine source is the product-owned NarraCat Agent Core under `agent-core/narracat/`, discovered through `narracat.manifest.json`. The old plugin-shaped manifest artifact was a compatibility shim for the retired SDK runtime and no longer exists.

## Context

NarraCat-app 的目标是给中国网文作者提供桌面 GUI，而核心创作流程已经存在于 NarraCat plugin。早期开发中出现过本地插件路径、manifest 缺失、最终用户是否需要自行下载插件等问题，需要明确 App 与插件的职责边界。

## Decision

NarraCat-app 是 GUI + 编排层。NarraCat plugin 是创作引擎来源。

App 层负责：

- 同步和打包 NarraCat plugin 运行资源。
- 解析插件 manifest 和版本状态。
- 通过 Claude Code SDK 加载本地插件。
- 渲染 NarraCat 生成的小说项目文件。
- 把桌面端按钮和自然语言输入转换为 Agent action。
- 为更好的用户体验新增产品化 Agent 指令抽象。

Plugin 层负责：

- 定义核心创作命令。
- 维护小说项目文件结构和生成流程。
- 输出可被 App 渲染的设定、大纲、正文和报告文件。

## Consequences

- 最终用户不需要自己下载 NarraCat plugin。
- App 不直接复制上游插件的内部实现逻辑，只依赖 manifest、命令和文件结构。
- 后续插件更新通过同步脚本和版本锁定流程进入 App。
- 如果产品化指令长期稳定，再评估是否反向沉淀到 NarraCat plugin。
- 修改上游插件源码需要单独决策，不能作为 App 层修 bug 的默认手段。
