# ADR-0001: Skill 注入分层 / Subagent 拆分（已搁置）

**日期**: 2026-05-18
**状态**: 已评估，搁置
**触发**: `/improve-codebase-architecture` 候选 1
**关联**: `docs/plans/2026-05-18-writing-context-aggregation-design.md`

## 背景

continuity-editor 启动时全量注入 4 个 Skill（novel-antipattern + novel-craft + novel-structure + novel-style-reference）共约 78 KB，是其他 Subagent 注入量的 2-9 倍。该 Agent 在 /write 中被调度两次（写前预检 + 写后审修），在 /rewrite 中再被调度一次（级联分析）。三种模式实际上只用到 Skill 集合的不同子集。

| 模式 | 实际需要的 Skill |
|---|---|
| 写前预检 | novel-structure + novel-style-reference（部分） |
| 写后审修 | novel-antipattern + novel-craft |
| 级联分析 | （较少 Skill 知识） |

当前 Subagent interface 把"最大需求集"作为静态注入，三种 caller 都为最重的模式买单。

## 评估的选项

1. **拆三个独立 Agent**（continuity-editor-precheck / -review / -cascade）
   - 优：每个注入按需，启动更轻
   - 劣：失去 `memory: project` 跨模式积累；Agent 数量从 5 增至 7
2. **Skill 改成 references/ 按需 Read 模式**
   - 优：注入量大幅下降
   - 劣：违反 CLAUDE.md 已沉淀的"Subagent-Skill 注入机制"约定；每次都要 Read 加载
3. **条件化 Skill 注入**
   - 不可行：Claude Code 的 `skills:` 字段是静态的
4. **保持现状**
   - 接受 78 KB 注入

## 决策

**搁置**（不拆 Agent、不改 Skill 注入模式）。

## 理由

在 `/improve-codebase-architecture` grilling loop 中，用户确认了两个钉死的约束：

- **优化目标 = 墙钟时间**（不是 token 成本）
- **`memory: project` 跨模式积累未观察到实际价值**

在这两个约束下：

1. continuity-editor 的三个模式**在时间上不并行**——预检发生在写之前、审修发生在写之后、级联只在 rewrite 时触发。拆 Agent 不能并发，**对墙钟时间无正收益**。
2. Skill 注入是一次性 prefill，单次 Subagent 调用的注入耗时远低于多次 LLM↔MCP 串行回合。**优化注入大小不是墙钟瓶颈**。
3. 真正的墙钟瓶颈在串行 MCP 工具调用密度（候选 2）和重复文件读取（候选 3），由 `docs/plans/2026-05-18-writing-context-aggregation-design.md` 处理。

## 何时重提

当下列任一条件成立时，应重新评估本决策：

- **Token 成本成为约束**：如果 Anthropic 账单或 context window 限制变成实际痛点，注入分层会带来直接收益
- **观察到注入本身拖慢启动**：如果 sonnet Subagent 启动的 prefill 阶段（注入解析）耗时占总耗时显著比例（>20%），值得动
- **`memory: project` 价值变明显**：如果未来观察到 continuity-editor 在长篇后期比早期"更懂这本书"，则不能拆 Agent，但可考虑 Skill 注入瘦身
- **新增 Skill 让总注入再次膨胀**：如果 continuity-editor 的 skills 列表再扩展（如增加 §9 场景质感指导后挂载新 Skill），需重新评估总量

## 不在本 ADR 范围内的相关工作

- 候选 2（聚合工具不够 deep）和候选 3（前 N 章 / 角色档案重复读）见 `docs/plans/2026-05-18-writing-context-aggregation-design.md`
- 候选 7（开/结手法由生产者自报）作为候选 3 的副产品在同一设计文档中处理
