# ADR 0028: Agent 运行只加载 project 级文件设置（`settingSources: ['project']`）——用户全局 CLAUDE.md 不进 Agent

## Status

Accepted

## Context

疑问：开发者/用户本机的 `~/.claude/CLAUDE.md`（个人 Claude Code 全局偏好，例如"中文沟通、表格优先于段落"）会不会泄漏进小说创作 Agent 的运行上下文？这关系到"App 只依赖引擎稳定契约、不被本机环境污染"的边界。

逐层核实后结论是**不会**，且这是 SDK 配置层主动选择的结果：

**① 我们的开关**（`electron/main/orchestrator/sdk-runner.ts`，`createSdkOptions`）固定：

```ts
settingSources: ['project'],   // 只有 project，刻意不含 'user'
cwd: projectPath ?? appRoot,
```

**② 运行时契约**（当时的 SDK 运行时 0.2.112 的类型声明 `sdk.d.ts`）：`settingSources` 控制加载哪些文件型设置（`CLAUDE.md` + `.claude/settings.json`）。取值 `'user'`（`~/.claude/...`）/ `'project'`（`.claude/...`）/ `'local'`。原文：

> When omitted or empty, no filesystem settings are loaded (**SDK isolation mode**). Must include `'project'` to load CLAUDE.md files.

**③ SDK 实现实锤**（`cli.js` 的 `getMemoryFiles`，已反混淆核验）：CLAUDE.md 按 memory 类型分别门控，而非"含 project 就全量加载"：

| Memory 类型 | 路径 | 加载条件 |
|---|---|---|
| Managed / policy | 企业策略目录 | 永远加载（与本项目无关） |
| **User** | `~/.claude/CLAUDE.md` | **仅当 `'user'` source 启用** |
| Project | 从 `cwd` 逐级向上的 `CLAUDE.md` / `.claude/CLAUDE.md` | 仅当 `'project'` source 启用 |
| Local | `CLAUDE.local.md` | 仅当 `'local'` source 启用 |

`'user'→userSettings`、`'project'→projectSettings` 是 SDK 内部 1:1 映射。我们只配 `['project']` ⇒ `userSettings` 关闭 ⇒ User 级 `~/.claude/CLAUDE.md` **不加载**。

**④ `cwd` 决定 Project memory 取自哪棵目录树**（`cwd: projectPath ?? appRoot`）：

- **有小说项目的 run**：`cwd` = 小说项目目录 → 向上走加载小说目录树内的 `CLAUDE.md`，即产品在项目根生成的 **Project Agent guide**（见 `CONTEXT.md`）。这是预期来源。
- **无小说项目的 run**（直连问答 / runtime-status）：`cwd` = `appRoot`。开发态下 `appRoot` 是本仓库根，向上走会把**本仓库自己的开发指引 `CLAUDE.md`**（给 Claude Code 开发 App 用，与小说创作无关）读进 Agent 上下文。打包档 `appRoot` 无此文件，**仅影响 dev 态**。

为什么这个隔离是对的：小说创作 Agent 的规则只应来自 `agent-core/narracat/` 的创作 prompt + 产品生成的 Project Agent guide + App 注入的 system prompt / 用户 Skill 正文；开发者/用户本机的个人 Claude Code 偏好不属于产品契约，一旦混入会让 Agent 行为随本机环境漂移、不可复现。

## Decision

**维持 `settingSources: ['project']`，刻意不加入 `'user'`**，保证用户/开发者本机全局 `~/.claude/CLAUDE.md` 永不进入任何 Agent run。

由此确定 Agent 运行期"创作规则"的合法来源**只有**：

1. `agent-core/narracat/` 经 `plugins:[{type:'local'}]` 加载的 agents / skills / commands prompt；
2. 产品在小说项目根生成的 **Project Agent guide**（即 `cwd` 目录树内的项目级 `CLAUDE.md`）；
3. App 在 `createSdkOptions` 注入的 `systemPrompt` 与用户自定义 Skill 正文。

**dev-only 注意**：无项目 run 的 `cwd=appRoot` 会读到本仓库开发指引 `CLAUDE.md`。这只影响开发态、不影响分发包，当前**不值得**为它引入 `cwd` 改写或 `claudeMdExcludes` 复杂度；若将来 dev 态出现真实污染，再按 SDK 的 `claudeMdExcludes` 精确排除。

关联：`settingSources` 是 ADR-0027 已点名的在用 Options 之一；术语锚点见 `CONTEXT.md` 的 **Setting source isolation** 与 **Project Agent guide**。

## Considered Options

- **含 `'user'`（加载全局 `~/.claude/CLAUDE.md`）**：否决。会把开发者/用户的个人 Claude Code 偏好泄漏进创作 Agent，行为随本机环境漂移、不可复现，违反 App↔引擎契约边界。
- **空 `settingSources`（完全 SDK isolation，连项目级 `CLAUDE.md` 都不加载）**：否决。会让产品在项目根生成的 Project Agent guide 失效，等于砍掉一条已设计的产品化约束通道。
- **只挂 `'project'`（现状）**：采纳。项目级 Project Agent guide 生效，用户全局偏好被隔离，是恰好覆盖需求且不堵死未来扩展的最小配置。
