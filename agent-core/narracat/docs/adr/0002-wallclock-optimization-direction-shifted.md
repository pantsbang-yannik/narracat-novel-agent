# ADR-0002: 墙钟优化方向调整 —— MCP 调用层已饱和

**日期**: 2026-05-19
**状态**: 已确认（基于 2.2.0 实施数据）
**触发**: 用户在真实项目 07-Novel 上 e2e 测试 PR #9 后反馈"速度没有明显的提升"
**关联**: PR #9, issue #3 #8, ADR-0001

## 背景

issue #3 把 NarraCat 的"墙钟优化"等价于"减少串行 MCP 调用 + 减少文件 Read"。PR #9 完整实施了 5 个 vertical slice：

| 改动 | 数据层指标 |
|---|---|
| `chapter_summaries` 表加 4 列 + `novel_store_chapter_brief` 写工具 | ✓ migration 幂等 |
| `novel_writing_context` 2 项 → 5 项聚合 | ✓ 单次调用覆盖 5 项 |
| continuity-editor 预检从 4 个原子调用 + 1 个语义查询 → 1 个聚合调用 | **回合数 ~10 → 1** |
| 移除前 3 章 manuscript + bible/characters 文件 Read | ✓ 新数据路径下 Read=0 |

数据层指标**全部超额达成**（目标回合 ≤3，实际 = 1）。

但用户在真实项目实测**总墙钟无明显提升**，与 issue #3 设定的"≥30% 下降"门槛不符。

## 已走完的优化路径（饱和判定）

| 路径 | 状态 | 收益 |
|---|---|---|
| MCP 调用串行性精简 | ✓ 已做到极致（10→1） | 数据层显著，墙钟不显著 |
| 文件 Read 次数精简 | ✓ 主路径已 0 | 数据层显著，墙钟不显著 |
| 聚合工具字段扩展 | ✓ 已实现 5 项一次返回 | 同上 |

**判断**：MCP 调用层的墙钟杠杆**已基本耗尽**。再继续往这个方向加聚合字段、并合调用、精简 Read，预期边际收益接近零。

## 决策

**今后 NarraCat 的墙钟优化工作不再优先投入 MCP 调用层**。新方向按以下优先级评估：

1. **LLM 推理时间**（最大嫌疑，未量化）
   - chapter-writer 写 5000 字章节单次推理 30-60 秒
   - continuity-editor 写后审修单次推理 20-40 秒
   - 这两项加起来占 `/write` 总墙钟主体
2. **Skill 注入量影响推理 prefill 时间**
   - chapter-writer 当前注入 novel-craft + novel-antipattern + novel-style-reference 三个 Skill
   - 注入量大可能拖慢推理启动；可考虑 references/ 按需加载（受 ADR-0001 约束，需慎重）
3. **Subagent 并行度**
   - 当前 chapter-writer → continuity-editor → memory-keeper 严格串行
   - memory-keeper 入库可与下一章预检并行（前提：用户不会立即看下一章状态）
4. **embedding 模型加载失败**（独立 environment 问题）
   - 真实项目实测 `text2vec-base-chinese` ONNX 加载失败，semantic_context 降级到纯 FTS 后命中 0
   - 修复后 semantic_context 应有实际命中，但**不影响总墙钟**（hybrid search 只是质量提升，不缩时）
5. **降级路径的隐性成本**
   - 老项目（已有 N 章但 ChapterBrief / CharacterBrief 字段全 null）走降级分支仍读 manuscript / bible/characters
   - 新写章节起逐步累积新字段，2.2.0 收益对**老项目**天然受限
   - 不是优化方向，是事实约束

## 理由

数据层 100% 达成、墙钟 0% 达成的反差说明：**MCP 调用回合数和文件 Read 次数都不是 NarraCat /write 墙钟的主导成因**。这个判断颠覆了 issue #3 设计阶段的隐含假设（"减少串行调用→缩时"）。

LLM 推理时间在 `/write` 总耗时中占据主导是合理推断：

- 每章 5000 字正文 + 几百字审修反馈 + 章节元数据 ≈ 6000 token 输出
- 以 Opus 4.7 50 tok/s 估算，单次正文生成 ~120 秒
- chapter-writer + continuity-editor 两次完整 LLM round ≈ 200 秒
- continuity-editor 预检的聚合数据获取（数据层）原本 ~5-10 秒，优化到 ~1 秒，**节约的 9 秒 / 200 秒 ≈ 4.5%**
- 4.5% 在用户体感下确实"无明显提升"

## 何时重提

当下列任一条件成立时，应重新评估本 ADR：

- **新增聚合需求**：若未来 Subagent 需要新的查询字段（如 P3-B 的 tone_passage / narrative_note），可继续扩 `novel_writing_context`。本 ADR 不阻止字段扩展，只反对"为了降墙钟而扩字段"
- **MCP 调用本身变贵**：若 better-sqlite3 替换为远程 DB 或 MCP 走网络（不再 stdio + 进程内 SQLite），单次调用成本会上升，串行性精简又会变成杠杆
- **批量场景**：本 ADR 基于"用户单次 `/write N`"的体验。若引入 `/write N..M` 批写多章场景，预检调用次数 ×M，MCP 调用层重新成为瓶颈
- **量化 LLM 推理占比后发现 < 50%**：若用户实测显示 chapter-writer 推理只占总墙钟少数，本 ADR 的核心论据失效

## 推荐的下次优化起点

新性能 issue 立项前必须先做的事：

1. **测墙钟分布**：在 `/write` 完整流程中标记关键时间点（预检完成、写正文完成、审修完成、memory-keeper 完成、整体完成）。让数据驱动方向，不再凭直觉
2. **对比 Sonnet vs Opus**：把 chapter-writer 从 Opus 临时切到 Sonnet（更快但质量降级）跑一次，量化"LLM 推理时间"在总墙钟的占比
3. **基于实测数据再选方向**：避免再次重复 issue #3 "MCP 层猜测式优化"的路径

## 不在本 ADR 范围内的相关工作

- ADR-0001 评估的 Skill 注入分层 / Subagent 拆分仍搁置；本 ADR 不改变 ADR-0001 决策
- 内容质量类优化（P2-A 场景质感、P3-A 质检标准、P4 声音覆盖）不受本 ADR 约束
- embedding 模型加载失败的修复是独立 environment 问题
