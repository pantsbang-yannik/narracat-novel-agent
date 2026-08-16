# GitHub Issue Workflow

> GitHub Issues 是阶段任务和可交付切片的主看板。`docs/agents/progress.md` 只保留摘要。

## When To Create An Issue

必须建 issue：

- P0 / P1 / P2 阶段任务。
- 跨主进程、preload、renderer、脚本或文档的多模块任务。
- 需要明确验收标准的 UI、Agent、SDK 或插件资源流程。
- 有复现步骤的 bug。
- 可以交给 Agent 独立执行的垂直切片。

不用建 issue：

- 小型文档修正。
- 当前对话内能快速完成的一次性排查。
- 尚未形成方案的产品讨论。
- 临时 mockup 或探索性草稿。

## Labels

状态标签：

- `needs-triage`：刚创建，尚未整理。
- `needs-info`：需要用户或外部上下文补充。
- `ready-for-agent`：Agent 可以领取执行。
- `ready-for-human`：需要人验收或产品判断。
- `blocked`：存在明确阻塞。

类型标签：

- `type:feature`
- `type:bug`
- `type:docs`
- `type:ops`
- `type:design`

优先级标签：

- `priority:p0`
- `priority:p1`
- `priority:p2`

执行模式：

- `mode:afk`：Agent 可独立推进。
- `mode:hitl`：需要人参与判断。

## Issue Template

```md
## Goal

一句话说明要完成什么。

## Context

- 相关背景
- 相关文档或代码

## Scope

- 本 issue 包含什么
- 不包含什么

## Design Assets / References

- PRD / spec:
- Curated assets:
- Final mockups:
- Notes:

## Acceptance Criteria

- [ ] 可验证结果 1
- [ ] 可验证结果 2

## Verification

- 需要运行的命令或人工验收方式

## Notes

- 依赖、风险或后续 issue
```

## Branch And PR

- 分支名优先包含 issue 编号，例如 `codex/123-plugin-version-lock`。
- commit 或 PR 描述中引用 `Closes #123` 或 `Refs #123`。
- 一个 PR 可以关闭一个或多个强相关 issues，但不要把无关任务混在一个 PR。

## OPS Rules

- `progress.md` 只同步阶段摘要，不复制完整 issue 内容。
- `ready-for-agent` 的 issue 必须有验收标准。
- `mode:hitl` 的 issue 必须写清需要用户判断什么。
- UI / 设计类 issue 如果讨论阶段产出视觉资产，必须按 `docs/agents/design-handoff.md` 完成 Design Artifact Sweep，并在 `Design Assets / References` 中写清稳定资产路径。
- 不要把 `.superpowers/` raw HTML 当作后续 Agent 的执行依赖；需要复用的 mockup、截图或素材必须导出到 `docs/design-assets/<feature>/` 并提交到 Git。
- 如果 issue 执行过程中发现长期决策，补 ADR。
