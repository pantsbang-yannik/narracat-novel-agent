# ADR 0002: Agent Workflow And Project Docs

## Status

Accepted

## Context

项目需要提升开发效率和进度追踪。参考 [mattpocock/skills](https://github.com/mattpocock/skills) 后，值得迁移的是它的轻量化协作思想：小型技能、共享上下文、ADR、清晰的 setup 和交接方式。

但 NarraCat-app 当前还不需要完整照搬 Claude plugin 仓库结构，也不需要马上接入复杂 issue tracker 流程。

## Decision

采用轻量 Agent Ops 文档体系：

- `AGENTS.md` 作为 Agent 进入项目的项目级入口。
- `CONTEXT.md` 维护共享术语。
- `docs/adr/` 记录长期架构和产品决策。
- `docs/agents/workflow.md` 描述日常开发流程。
- `docs/agents/progress.md` 追踪当前阶段、下一步和阻塞。
- `docs/agents/verification.md` 定义不同改动类型对应的验证矩阵。
- `docs/agents/handoff.md` 提供交接模板。

暂不引入完整 issue tracker、triage label 或外部项目管理自动化。等任务量和协作人数增加后，再决定是否接入 GitHub Issues、Linear 或其他工具。

## Consequences

- Agent 接手任务时有固定阅读顺序，减少重复解释。
- 进度追踪先落到仓库内文档，和代码变更同源。
- ADR 负责记录“为什么这样做”，避免架构决策散落在聊天记录。
- 文档体系保持小而可维护，不把外部项目的 Claude 专用结构直接搬进来。
