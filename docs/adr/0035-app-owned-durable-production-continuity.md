# ADR-0035: App Owns Durable Production Continuity

Date: 2026-07-23

Status: Accepted

## Context

NarraCat-app 已经能完成正文编辑、Agent 创作、通知和写作断点恢复，但这些能力的
“持续可解释性”仍分散在 renderer 内存、sender 级主进程对象和若干独立 JSON 文件中。
刷新、关窗、完整退出或进程崩溃时，作者可能失去未保存正文、Agent 可见历史、任务状态
或工作位置；renderer 是否仍存在甚至会影响后台任务能否继续和副作用能否落地。

Agent Core 的 Write checkpoint 只负责 `/write` 流程恢复，不能承担 App 会话、作者草稿、
通知和导航状态。反过来，App 也不能另造第二套写作 checkpoint 或把 NovelMemory 当作
通用事务数据库。

P1A 的产品决策需要一个长期架构边界，避免六个垂直切片各自再造存储、恢复和错误语义。

## Decision

### 1. 按数据所有权选择存储位置

- 作者正文草稿和已保存正文版本属于 Novel project，存放在项目内 `.narracat/`，随作品
  移动、备份和进入废纸篓。
- 用户可见 Agent 对话、SDK session registry、App 任务投影、结果通知和最后工作位置属于
  App 编排层，存放在 App `userData`。
- API Key 继续只由 Keychain 保存；任何 P1A 存储、备份、日志或通知都不得包含 Key。
- Agent conversation 不进入 NovelMemory，也不成为 Agent Core 项目文件契约。

### 2. 主进程拥有耐久事实，renderer 只消费投影

- Agent run 的事件必须先进入主进程 durable event sink，再广播给 renderer。
- renderer 断开、窗口关闭或事件发送失败，不得终止后台任务或决定持久副作用是否发生。
- 通知写入、session registry、任务终态和项目刷新等 App 自有副作用由主进程完成。
- renderer 通过带 sequence 的 snapshot + event hydration 恢复视图，不把 Zustand 当作
  长期真相源。

### 3. 可见历史与 SDK 上下文分离

- “新会话”只清除 SDK 上下文，保留作者可见历史，并写入会话分隔事件。
- 可见历史按会话分段持久化；默认加载最近分段，旧分段按需加载，不按时间或数量静默删除。
- 存储用户消息、最终回复、任务计划、问题与回答、人读工具摘要、终态和脱敏错误；不存
  reasoning、streaming delta、完整工具输入输出、任意大 payload、绝对路径或正文副本。
- 单段损坏时隔离该段并保留其它历史；当前段损坏则封存并开启新上下文，不静默清空。
- P1A 不从旧 SDK session、日志或缓存反向拼装升级前历史。

### 4. RunManager 是 App 级生命周期

- 同一 Novel project 同时最多一个 Agent run，不同项目可以并行。
- 关闭窗口但主进程仍存活时，run 和 SDK session 继续；重新打开后 renderer 重新连接。
- 完整 App 退出、崩溃或强杀后，不自动续跑在途任务；它们标记为 `interrupted`。
- 中断中的 SDK session 视为不可信并失效；可见历史保留，后续恢复使用新 session。
- `/write` 继续走既有 `recover-write`；其它写项目任务由作者触发“检查并继续”，先检查
  当前产物再补未完成部分，不机械重放工具动作；纯对话或只读请求才可重发原请求。
- 作者停止任务后进入 `cancelling`，底层流真正收尾前不释放同项目任务锁。
- 5 分钟无事件只提示可能卡住；30 分钟无事件自动停止并记录 `idle-timeout`；等待作者
  回答问题期间不计入 watchdog。

### 5. 恢复与清理必须显式

- 未保存正文只在正式保存成功或作者明确放弃后删除。
- 正文版本、Agent 可见历史和损坏隔离文件不做静默时间/数量清理。
- 正文冲突、版本恢复和备份恢复均禁止自动合并或覆盖。
- 任何加载失败必须与成功但为空区分；有旧数据时保留 last-good projection 并标记 stale。

### 6. 系统通知使用低敏内容

- macOS 系统通知只显示任务完成、失败或等待确认等通用状态。
- 不显示小说名、章节名、正文摘要或问题内容；点击后回到 App 内原任务卡片。
- App 内全局通知入口可以展示必要的项目与任务详情，并承载进行中/等待确认任务的找回入口。

## Consequences

- P1A-2 与 P1A-3 必须先完成联合架构规格，锁定 event schema、sequence、snapshot、
  session registry 和 RunManager 生命周期，再分别实施。
- 现有 renderer store 会退化为 hydrated projection；不能在其上直接追加 `persist`
  中间件来替代主进程 durable store。
- 后台任务连续性不等于进程级自动恢复。完整 App 退出后的安全默认值是可解释的中断，
  不是盲目续跑。
- 项目备份只保护 Novel project 数据，不偷偷导出全局能力包、造包草稿或 App 设置；
  这些资产需要独立的整体备份设计。
- 完整诊断包仍由 #372 处理；P1A 只提供脱敏错误 ID、明确错误态和现有诊断入口。

## Verification Gate

P1A 只有在自动验证、packaged `.app` 破坏性 smoke、真实 Provider 连续性 smoke 和产品
主人真机验收全部通过后才算完成。P1B 可以并行讨论和写规格，但不得在此前开始实施。
