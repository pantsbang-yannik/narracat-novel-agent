# ADR 0010: Character Chat Uses A Native App Runtime

## Status

Accepted

## Context

Character chat / 唠个嗑让用户在单本 Novel project 内和 Appeared character 一对一对话。它需要模型服务和已完成剧情知识，但它不是 Agent action：它不执行写作流程、不产生产物、不刷新 Workbench 文档、不创建 Result notification，也不写入 NovelMemory。OSS audit 结论是：SillyTavern、Agnai 和 ChatterUI 是强参考但 AGPL-3.0；ChatClaw、LibreChat 和 Character Card 相关项目可作为工程或 schema 参考，但不应取代 NarraCat 的角色与记忆契约。

## Decision

Character chat 作为 NarraCat-app 原生功能实现，使用独立的 Character chat runner / IPC 契约，而不是复用 Agent run 模型，也不嵌入现成 character-chat OSS 产品。

Character chat 可以复用 App orchestration layer 中的模型服务验证、Provider 配置和 SDK 调用基础设施，但产品模型保持独立：

- `CharacterContact` 来源于 NarraCat 的已确认角色设定、Character UID 和 Appeared character 判断。
- `CharacterChatTranscript` 是 App 层本机聊天记录，保存在 App 用户数据边界，不写入 Novel project 目录，也不属于创作产物。
- 角色回复的上下文由角色设定、最新 Chapter completed 和按需 NovelMemory 读工具组成。
- NovelMemory 补查策略归 Character chat runner 所有；renderer 只发送 project、character_uid、message 和 latest completed chapter，不根据用户文本做知识路由。
- 角色回复可以 streaming，但 UI 只呈现角色打字中或消息增量，不展示工具调用、检索过程或 Agent 执行日志。
- 普通发送失败在 Character chat 流内显示轻量错误并允许重试；未验证模型服务才使用页面级空态。
- Character chat 不创建 Agent run、Agent task plan、Result notification 或 Push notification。
- MVP 不导入 / 导出外部 Character Card，也不把 Character Card V2 作为主契约。

## Considered Options

- **复用 Agent run / Agent conversation**：否决。它会把角色闲聊混入创作 Agent 执行模型，污染 Agent action、任务状态、通知和 Workbench 产物刷新边界。
- **嵌入 SillyTavern、Agnai 或 ChatterUI**：否决。它们的角色聊天能力成熟，但 AGPL-3.0 与商业桌面 App 的代码复用风险不匹配，且产品形态偏 power user。
- **直接采用 Character Card V2 作为角色主契约**：否决。NarraCat 已有 `bible/characters/*.md`、Chapter completed 和 NovelMemory 契约；外部角色卡只适合未来 import/export。
- **原生 App runtime**：采纳。它保留 NarraCat 的小说文件和记忆边界，同时允许借鉴 OSS 的联系人、角色卡、开场白、头像和 transcript 设计。

## Consequences

Character chat 的第一版实现应围绕新的 App-native model、IPC 和 runner 切片，而不是修改现有 Agent run reducer 或通知模型来适配它。后续如需 Character ping、读者模式、外部角色卡导入、群聊或角色头像上传，应在这个原生边界内扩展，并分别评估是否需要新的 ADR 或 issue。
