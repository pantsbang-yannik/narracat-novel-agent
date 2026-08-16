# ADR 0003: 中断的 NarraCat 写作由 App 显式恢复

## Status

Accepted

## Context

NarraCat 的 `write` 流程包含正文生成、写后审修、记忆更新和项目状态收尾。真实运行中，网络、客户端进程、用户取消或 SDK 会话中断都可能让流程停在中间：正文和审修报告已经落盘，但 `.narracat/state.yaml` 尚未把章节写入 `completed_chapters`。

如果 App 只看正文文件是否存在，就会把未完成流程误判为章节完成；如果 App 只看 `completed_chapters`，用户会看到“正文已生成但章节仍是当前阶段”的困惑状态。这个问题需要产品层解释，但不能让 App 复制或替代 NarraCat plugin 的写作流程。

> 2026-06-19 terminology correction: after ADR 0007, references to "NarraCat plugin" in this ADR should be read as the NarraCat Agent Core write contract. The recovery product model is unchanged.

## Decision

App 将中断写作建模为 NarraCat write 契约上的产品化投影，而不是新的引擎状态源。

- `Chapter completed` 只以 NarraCat 完成状态为准：章节必须经过正文、审修、记忆更新和状态收尾，且 `state.yaml.progress.completed_chapters` 包含该章节。
- 正文文件存在只表示 `Chapter manuscript generated`，不等于章节完成。
- 当 NarraCat 写作断点指向某章，且该章尚未完成时，App 将其显示为 `Recoverable chapter`。
- `Recoverable chapter` 不是普通当前阶段；它会阻塞后续章节写作，直到用户完成恢复或明确处理。
- App 不在打开项目时静默恢复。恢复必须由用户通过 `Recover write action` 显式触发。
- `Recover write action` 的 UI 文案是“继续完成本章”，内部产品化命令可命名为 `recover-write`，但底层仍执行 NarraCat `write` 指令。
- 启动恢复前，App 生成 `Recovery diagnosis`，把断点步骤、目标章节、正文、审修、记忆和状态证据同步给 NarraCat `write` 流程，帮助它按标准流程继续，而不是让 Agent 自由发挥。
- 恢复失败或用户取消后，章节保持 `Recoverable chapter`，不清除写作断点，不标记为完成，也不推进后续章节。

第一版 `Recovery diagnosis` 只传递事实字段和推荐恢复步骤：

- 恢复模式：显式恢复。
- 目标命令：NarraCat `write`。
- 目标章节和卷号。
- 写作断点：`last_command`、`last_step`。
- 产物状态：上下文包、正文、审修报告、审修结果、章节记忆摘要。
- 项目状态：章节是否已完成、进行中章节。
- 推荐恢复步骤。

推荐恢复步骤只是 App 对当前证据的建议，不能替代 NarraCat `write` command source。Agent 必须继续按 NarraCat `write` 的标准断点恢复流程执行。

第一版只覆盖 NarraCat `write` 流程恢复，不扩展到 `setup`、`plan`、`world` 或 `rewrite`。通用恢复机制等 `write` 闭环稳定后再评估。

## Consequences

- 用户能区分“正文已生成”和“章节已完成”，不会把中间产物误认为完整章节。
- App 可以清楚提示“待恢复”，并提供“继续完成本章”，而不是把中断章节混入普通当前阶段。
- App 仍然遵守 ADR 0001 / ADR 0007 的边界：NarraCat Agent Core 是写作引擎来源，App 只做 GUI、编排和状态投影。
- 后续维护 NarraCat Agent Core 时，如果 `write` 契约、checkpoint 字段或完成语义变化，App 的投影和恢复诊断必须随契约测试一起更新。
- 如果 Agent Core 未来提供正式恢复命令或恢复状态，App 应优先接入引擎能力，并保留“继续完成本章”的产品化入口。
- 第一版实现范围保持窄切片，避免在多个 NarraCat command 之间提前抽象恢复框架。
