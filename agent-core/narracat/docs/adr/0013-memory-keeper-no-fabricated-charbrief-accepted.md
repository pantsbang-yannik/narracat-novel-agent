# ADR-0013: memory-keeper 不得编造未确认的 CharacterBrief 字段

**状态**: accepted（2026-05-31）

memory-keeper 模式三入库 CharacterBrief 三字段（`speech_pattern` / `inner_conflict` / `non_rational_tendency`）时，**只入用户已确认档案里存在的值，缺失即留空，不再"必须合理推断、禁止留空"**。原规则（`memory-keeper.md:113`）为避免空字段让"下一章写前预检走降级路径、降低聚合工具覆盖率"而强制 haiku 推断填充；但写前预检已被 ADR-0003 路径 A 删除——旧理由已失效。NovelMemory 是**权威记忆**（下游 agent 当作既定事实），由 haiku 基于单薄档案编造、且 `upsert_key="subject_predicate"` 跨章锁定的字段，会把虚构性格悄悄变成 canon 并驱动后续角色/剧情决策（`non_rational_tendency` 经 novel-craft §(SKILL.md:175) 指令真的"让角色展现误判"，污染路径最深）。缺失字段交由 opus chapter-writer 按当下语境即兴，质量优于 haiku 的永久薄推断，且与 ADR-0011 北极星（信任模型、减规则）同向。

本决策解决原审计 P1-7，靶子收窄为"memory-keeper 不编造"——world-curator 产出已过 `world.md` 步骤 4 用户确认门，无需结构化 confirmed/suggestion 三段传递格式。

## Considered Options

- **方案 A（推断 + 标低置信/待确认区）**：保留推断但标来源。NovelMemory 无 confidence 列 / 待确认表，须新增存储（facts 加列 / 新表 / bible 文件），blast radius 大；且 haiku 薄推断本身质量存疑，标了来源也不改善正文。否决。
- **方案 B/C（采纳，统一留空）**：取消强制推断，缺失留 null。readers handler 本就在字段缺失时返回 null、chapter-writer 按"如有"消费，系统早已优雅处理；唯一代价是"聚合工具覆盖率"下降——而覆盖率是虚荣指标，非正文质量。
- **更激进：删 `non_rational_tendency` 整条链**：足迹核查发现它经注入 chapter-writer 的 novel-craft Skill 被消费（非死字段），删除会砍掉真实信号并波及北极星层。否决，改为与另两字段同等留空处理。

## Consequences

- `memory-keeper.md:113` 规则反转为"只存已有、缺失留空"。
- `writing-context-pack.json`：`active_characters.required` 去掉 `speech_pattern`（无运行时 ajv 校验，纯文档一致性修正）；properties 补 `non_rational_tendency`（修复 schema 与 readers/novel-craft 运行时不一致）；x-sync-chain consumers 标注补全。
- `readers.ts` / `readers.test.ts` 不改（已返回 null，测试已覆盖缺失角色为 null 的用例）。
- chapter-writer + novel-craft §175 已条件化（"如有"/"如果带有"），无硬依赖，不改。
- "world.md 步骤 4 整体确认粒度过粗（world-curator 自补字段被一次性盖章）"与本决策解耦，归 #123（world 渐进式引导）处理。
- P2-5（world-curator 冲突检测结构化 `conflicts[]`）与本切片解耦，单独处理。
