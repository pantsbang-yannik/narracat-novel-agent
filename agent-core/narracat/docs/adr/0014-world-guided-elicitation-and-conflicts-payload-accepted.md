# ADR-0014: world 高 stakes create 引导式采集 + conflicts[] 用 payload 约定

**状态**: accepted（2026-05-31）

`/world` 长期是「固定模板 + world-curator 一次性产出 + 用户审改」，与 setup（5 步引导）/ plan 阶段一（双路 fallback）模式反差。#123 提议引入渐进式引导，#217 提议 world-curator 冲突检测结构化输出 `conflicts[]`，两者在 `world.md` 步骤 4「确认门」硬耦合（ADR-0013 已把「步骤 4 确认粒度过粗」delegate 给 #123）。本 ADR 记录这次合并 grill 的两个反直觉决策：**(1) 引导式采集只对高 stakes create 操作开放；(2) conflicts[] 用返回 payload 约定承载，不新建 schema 文件。**

## 背景

- **反流程纪律压力**：CLAUDE.md「提质量优先拿掉噪声 + 信任模型，而非加规则 / 门禁 / 流程」、MEMORY.md「提质量靠产出不靠流程」。给一个低频命令全程加多步引导，是反流程纪律第一刀该砍的地方。
- **代码层事实**：`agents/world-curator.md` frontmatter 的 `tools:` 只有 `Read/Grep/Glob` + 3 个 MCP 读工具，**没有 AskUserQuestion**——world-curator 在本仓库 literally 无法向用户提问，其自称「采用引导式对话方式工作」名实不符。引导只能由主会话承担。
- **数据契约惯例压力**：CLAUDE.md「数据契约 SSOT 在 `schemas/`」。`conflicts[]` 是 world-curator→主会话的结构化输出，惯例上「应该」立 schema。但它只有主会话步骤 4 一个消费者，且 `/world` 本就标注「暂无强 schema」。

## 决策

### 决策 A：引导式采集只对高 stakes create 操作开放

- **范围**：仅 `create_character` / `create_setting` 在开场用单个 AskUserQuestion 问「深度引导 / 快速产出」；`update_character` / `update_setting` / `view` 维持现状一次产出（「快速产出」= 现状路径）。
- **gating 机制**：操作类型轴 + 开场单问定深浅——**不让 LLM 静默判断「是不是主角 / 复杂世界」**，把深浅选择权交还用户，避免误判无掌控。
- **引导维度（固定 6 步完整，不跳过）**：character 6 步（身份 / 欲望 / 缺失与致命缺陷 / 核心矛盾 / 关系 / 弧线）；setting 与之同构（6 步：核心规则 / 代价与限制 / 势力或冲突轴 / 文化或社会层 / 与主角欲望勾连 / 独特性）。深度引导一旦选定即走完 6 步——`$ARGUMENTS` 已提供信息作为该维度 AskUserQuestion 的预填 / 推荐 option，而非跳过该步（保证用户对每个高价值维度都有确认机会）。低价值字段（基本信息 / 语言指纹 / 概述）不进引导，交 world-curator 二次整合合成。
- **分工**：主会话驱动引导问答（引导式采集），world-curator 在采集结束后被调用**一次**做合成 + 冲突检测（不拆 prompt 为分步模式）。
- **reference-guidance 消费**：作为每步 AskUserQuestion options 的推导源（对齐 setup 步骤 0.5）。

### 决策 B：conflicts[] 用返回 payload 约定承载，不新建 schema 文件

- `conflicts[]` 结构定义写进 `agents/world-curator.md`（生产端规范）+ `docs/contracts/world-guided.md`（结构 SSOT），**不新建 `schemas/world-conflicts.json`**。
- 每条 conflict 字段：`severity`（blocking / warning / info）、`existing_fact`、`new_claim`、`source`、`recommended_action`。
- **确认门吸收**：步骤 4 维持单一确认门——展示合成内容 + conflicts[] 分级列表；有 blocking → 逐条 AskUser（改这项 / 强行覆盖 canon / 取消）；无 blocking → 现状「确认保存 / 调整」二选项。warning / info 随用户整体确认一并落盘，无独立 auto_merge 字段。

## Considered Options

**决策 A 的备选：**
- **全量引导（所有 create + update）**：与 setup 最一致，但 update / 次要角色 / 简单设定被迫走多步流程，正是反流程纪律要砍的过度工程。否决。
- **只 create_character 引导**：最保守，但复杂世界 setting 同样高 stakes，剥夺引导会偏窄。否决（用户明确反对排除 setting）。
- **LLM 静默复杂度分支**：主会话自动判断深浅，无用户选择。不透明、误判无掌控。否决。
- **（采纳）操作类型轴 + 开场单问定深浅**：高 stakes create 给选择权，update/view 不变。克制且可预测。

**决策 B 的备选：**
- **新建 `schemas/world-conflicts.json`**：符合「数据契约 SSOT 在 schemas/」惯例，但 conflicts[] 只有一个消费者，独立 schema 过重，且触发 schema-pr-check CI「下游影响」评估流程，blast radius 反而更大。否决。
- **（采纳）payload 约定 + 写进契约文档**：守住 #123「不碰 schema」边界，不触发 CI 下游影响门，结构定义集中在 world-curator.md + 契约文件。

## Consequences

- `commands/world.md`：步骤 1 后新增「create 操作开场单问深浅」分支；深度引导分支用 AskUserQuestion 逐维度采集；步骤 4 确认门吸收 conflicts[] 分级与 blocking 逐条处理。
- `agents/world-curator.md`：删除「采用引导式对话方式工作 / 通过结构化问题引导补充信息」等名实不符的自我描述，重定位为「接收已确认创作意图 → 合成 bible + 冲突检测」；新增 `conflicts[]` 输出规范；frontmatter tools 不变（已有 `novel_query` 足够查冲突）。
- 新增 `docs/contracts/world-guided.md`：承载引导维度模板 + 每步 options 生成规则 + conflicts[] 结构 SSOT，`world.md` / `world-curator.md` 按引用指针消费。
- **不动** `schemas/*`、不动 MCP server、不动其他 command/agent——无 schema-pr-check / build 影响。
- ADR-0013 delegate 给 #123 的「步骤 4 确认粒度过粗」在此闭环（blocking 冲突逐条回流即细化粒度）。
- CONTEXT.md 新增术语：引导式采集 / 世界观策展人 / 设定冲突。
- 与 ADR-0011 北极星「信任模型、减规则」同向：引导只在高 stakes 处开，不普遍加门禁。
