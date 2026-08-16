# Command-Agent-Skill 链路契约审查

审查日期：2026-05-30

范围：`commands/`、`agents/`、`skills/novel-*`、`schemas/`、`docs/contracts/`、`mcp-server/src/handlers/validators.ts` 中与小说写作链路直接相关的 prompt、契约和 schema。

本次只做静态链路审查；未创建 `<eval 工作区>/command-agent-skill-chain/` 下的 benchmark 小说项目。

## 总结

当前最强的链路是 `/write`：它已经把 WritingContextPack v2.4、chapter-writer 最小任务 envelope、ChapterMetadata、ReviewReport JSON SSOT、`refine_count` 上限和 memory 回写串成了一个相对稳定的闭环。

主要风险集中在三处：

1. `/review` 有执行级权限缺口：prompt 要写报告和更新 `state.yaml`，但 frontmatter 没有 `Write/Edit`。
2. `/rewrite` 明显落后于 `/write` 新契约：仍保留已删除的写前预检、Markdown 审修路由、旧 retry 计数和重复的 writer envelope。
3. 若干 SSOT 被复制后漂移：参考作品照搬分级、outline 阶段二字段、ReviewReport schema 的 checks 覆盖范围、world 到 memory 的确认边界。

## 链路地图

| 链路 | 主要 producer | 主要 consumer | 结构契约 | 当前判断 |
| --- | --- | --- | --- | --- |
| `/plan` | `outline-architect` | `/write`、`chapter-writer`、`continuity-editor` | `OutlineStructure v4.4`、`docs/contracts/outline-planning.md` | 主链健康，但 contract §3.2 对 `scene_type` / `ending_hook_type` 滞后 |
| `/write` | 主会话聚合 WCP、`chapter-writer`、`continuity-editor`、`memory-keeper` | 下一章写作、review、memory | `WritingContextPack v2.4`、`ChapterMetadata v1.4`、`ReviewReport v1.3` | 最接近目标架构；仅有少量旧版本文案 |
| `/review` | `continuity-editor` | 人读报告、summary、`state.yaml` | Markdown + ReviewReport 概念契约 | 权限缺口和 JSON/Markdown 读取边界需要修 |
| `/rewrite` | `chapter-writer`、`continuity-editor` | 被重写章节、cascade impact、memory | 应复用 `/write` 契约 | 主要漂移点，建议优先修 |
| `/world` | `world-curator`、`memory-keeper` | bible、NovelMemory、后续写作 | 暂无强 schema | 能跑，但冲突处理和“建议 vs 确认事实”边界偏弱 |

## P0

### P0-1 `/review` 缺少写权限

证据：

- `commands/review.md:4` 的 `allowed-tools` 只有 `Agent, TaskCreate, TaskUpdate, Read, Glob, Grep, AskUserQuestion`。
- 同一文件要求写入 `reviews/ch-{NNN}-review.md`（`commands/review.md:79`）、保存 summary report（`commands/review.md:85` 附近）并更新 `state.yaml`（`commands/review.md:96`）。

影响：实际执行 `/review` 时，prompt 规划与工具权限不一致，报告落盘和状态更新可能直接失败。

建议：给 `/review` frontmatter 增加 `Write, Edit`；如果不希望 `/review` 改状态，则删除或降级步骤 5 的 state 更新责任。

## P1

### P1-1 `/rewrite` 仍调用已删除的写前预检

证据：

- `/rewrite` 模式 B 仍写着 `Task(continuity-editor) 写前预检（同 /write 步骤 1）`（`commands/rewrite.md:72`）。
- `/rewrite` 对比表仍称步骤 2 是“写前预检”（`commands/rewrite.md:255`）。
- `continuity-editor` 明确声明“写前预检模式已被砍掉”（`agents/continuity-editor.md:57`）。
- `/write` 明确采用 ADR-0003 路径 A，由主会话纯代码聚合 WritingContextPack（`commands/write.md:68`）。

影响：重写模式 B 会把一个已经不属于 continuity-editor 的职责重新交给 LLM 中介，导致字段推断、翻译损失和 `/write` 主链行为不一致。

建议：把 `/rewrite` 模式 B 的步骤 2 改成完全复用 `/write` 步骤 1 的主会话聚合流程，产出 WritingContextPack；不再 dispatch continuity-editor 做写前预检。

### P1-2 `/rewrite` 审修路由落后于 `/write`

证据：

- `/rewrite` 从 Markdown `**审修结果**` 读取路由（`commands/rewrite.md:165`），而 `/write` 已把 ReviewReport JSON 注释段作为 SSOT（`commands/write.md:298`、`commands/write.md:308`）。
- `/rewrite` 只有 `retry_count`（`commands/rewrite.md:85`、`commands/rewrite.md:174`），REVISE 不计入自动修订上限；`/write` 已使用 `refine_count = REVISE + FAIL` 合计上限 2（`commands/write.md:190`、`commands/write.md:314`）。

影响：同一篇正文在 `/write` 和 `/rewrite` 下可能走不同的通过/修订/失败路径，尤其是多轮轻修可能退化文本。

建议：把 `/write` 的 D 方案 JSON 解析和方案 E `refine_count` 迁移到 `/rewrite`；Markdown 只做人读，不参与程序路由。

### P1-3 参考作品照搬分级在命令间漂移

证据：

- `/review` 和 `/rewrite` 都写“命中专名/桥段/关系原型 → [MAJOR]”（`commands/review.md:48`、`commands/rewrite.md:127`）。
- `continuity-editor` 的 L3 分级是：原文 >=10 字 / 人名地名为 BLOCKING/CRITICAL，意象 / 桥段 / 金句机制 / 关系原型为 MINOR finding-only（`agents/continuity-editor.md:283`、`agents/continuity-editor.md:289`、`agents/continuity-editor.md:290`）。
- `/write` 也按 continuity-editor L3 执行（`commands/write.md:251` 附近）。

影响：版权/参考安全边界不一致。专名应更重，桥段和关系原型不应与专名混成同一级。

建议：删除 `/review`、`/rewrite` 中复制的分级文字，改为引用 `continuity-editor` L3 分级；只在一个 SSOT 维护严重度。

### P1-4 outline 阶段二 contract 滞后于命令

证据：

- `docs/contracts/outline-planning.md §3.2` 的阶段二 Task 模板只提到 9 个必填字段和 `iconic_payoff_for[]`（`docs/contracts/outline-planning.md:95`、`docs/contracts/outline-planning.md:114`）。
- `/plan` 步骤 4 已要求阶段二强烈推荐 `scene_type` 和 `ending_hook_type`，且说明它们会透传到 chapter-writer / continuity-editor（`commands/plan.md:404`、`commands/plan.md:406`）。

影响：`docs/contracts/outline-planning.md` 被声明为共享契约，但实际最新字段只存在命令侧，后续维护容易漏掉章场景类型和章末钩子类型。

建议：把 `scene_type`、`ending_hook_type`、`volume_ending_rhythm` 的阶段二 dispatch 规则补进 `docs/contracts/outline-planning.md §3.2`，让 contract 重新成为 SSOT。

### P1-5 ReviewReport schema 与 continuity-editor 输出覆盖范围不一致

证据：

- `continuity-editor` 要求输出 2 主维度 + 11 辅助维度（`agents/continuity-editor.md:62`、`agents/continuity-editor.md:431`）。
- `schemas/review-report.json` 的 `checks.required` 仍只有 5 个旧维度：character consistency、timeline、foreshadowing、style、word count（`schemas/review-report.json:25`）。
- `continuity-editor` 同时要求新产出必须包含 `reading_desire`（`agents/continuity-editor.md:450`），但 schema 为兼容老报告仍把 `reading_desire` 设为 optional（`schemas/review-report.json:217`）。

影响：未来即使接入 `validateReviewReport`，validator 也只能守住旧 5 维，无法验证新 11 辅助维度是否被遗漏。JSON SSOT 会比 Markdown 弱。

建议：明确二选一：

- 若 JSON 真是程序 SSOT，把 11 辅助维度纳入 schema，并为新产出增加 stricter profile。
- 若 Markdown 才承载完整审校维度，则在命令中明确 JSON 只负责路由字段，不宣称完整质量报告 SSOT。

### P1-6 `/rewrite` 的 chapter-writer envelope 与 ADR-0011 漂移

证据：

- `/write` 已明确 chapter-writer 接收最小 envelope，只给 WCP 路径、正文路径、目标字数和必要指令（`commands/write.md:197` 附近）。
- `/rewrite` 仍在 Task 中重复注入风格、开头、场景、参考作品处理等 writer 内部规则（`commands/rewrite.md:87` 到 `commands/rewrite.md:103`）。

影响：chapter-writer 的真实优先级可能被命令侧重复规则覆盖，后续改 writer prompt 时 rewrite 链路继续使用旧规则。

建议：把 `/rewrite` 的 writer Task 缩到和 `/write` 一样的最小 envelope；重写特有信息只包括原文路径、重写目标、WCP 路径和用户要求。

### P1-7 `/world` 到 `memory-keeper` 的确认边界偏弱

> ✅ **已解决（2026-05-31，ADR-0013 / #210）**：靶子收窄为「memory-keeper 不编造未确认字段」——模式 3 缺字段留空不推断，不再强制填充。world-curator 产出已过 `world.md` 步骤 4 用户确认门，原建议的「confirmed/suggestions/conflicts 三段传递格式」不需要、已解耦。详见 ADR-0013。

证据：

- `world-curator` 要求“不编造用户未确认的关键设定”（`agents/world-curator.md:155`）。
- `/world` 把“新增/修改的设定内容”交给 `memory-keeper` 入库（`commands/world.md:94`）。
- `memory-keeper` 模式 3 要求 CharacterBrief 的 `speech_pattern` / `inner_conflict` / `non_rational_tendency` 缺失时必须合理推断，禁止留空（`agents/memory-keeper.md:113` 到 `agents/memory-keeper.md:118`）。

影响：world-curator 标注为建议或未确认的角色细节，可能在 memory-keeper 入库时被推断成事实，污染 NovelMemory。

建议：为 `/world` 增加“confirmed facts / suggestions / conflicts”三段传递格式；memory-keeper 模式 3 只允许 confirmed facts 入库，suggestions 只能写入待确认区或不上 NovelMemory。

## P2

### P2-1 `/write` 仍有 ChapterMetadata v1.3 文案

证据：`commands/write.md:210` 仍写“ChapterMetadata（v1.3，含 creative_anchor 必填）”，但 schema 和 chapter-writer 已是 v1.4（`schemas/chapter-metadata.json:5`、`agents/chapter-writer.md:290`）。

建议：改成 v1.4，避免 writer 或后续维护者误以为 `ending_hook_type` 不属于当前契约。

### P2-2 chapter-writer 引用了未注入的 `novel-structure`

证据：`chapter-writer` frontmatter skills 只列出 `novel-craft` 和 `novel-style-reference`（`agents/chapter-writer.md:36`），但硬边界引用 `novel-structure §3.3`（`agents/chapter-writer.md:53`）。

建议：要么把该规则改写为自包含文本，要么把 `novel-structure` 加入 skills。硬边界不应依赖未加载 skill。

### P2-3 （已过期：novel-antipattern 已于 4.0.147 退役，词表并入 mcp-server/src/data/prose-hygiene-lexicon.ts）

### P2-4 `ReviewReport` deprecated 字段说明仍带旧判定暗示

证据：`schemas/review-report.json` 中 `dramatic_richness_score` 等 deprecated 字段仍保留旧模板描述；当前 continuity-editor 已要求新产出不再写这些字段，分数迁移到 `reading_desire.sub_scores`（`agents/continuity-editor.md:451`）。

建议：保留兼容字段没问题，但把描述压缩为“legacy read only”，避免旧 `<4` / 单维判定语义被误读回主链。

### P2-5 `world-curator` 冲突检测没有结构化输出

证据：`world-curator` 职责包含“与既有设定冲突检测”，但没有要求冲突 severity、证据来源、是否需要 AskUser 或是否可自动合并。

建议：增加 `conflicts[]` 结构：`severity`、`existing_fact`、`new_claim`、`source`、`recommended_action`。`blocking` 冲突必须回到用户确认。

### P2-6 continuity-editor 的 finding-only 与 `## 问题` 一致性规则容易误导

证据：

- continuity-editor 说 reading_desire、高频陷阱、参考作品照搬 MINOR 多数是 finding-only，不进 REVISE（`agents/continuity-editor.md:99`、`agents/continuity-editor.md:478` 到 `agents/continuity-editor.md:485`）。
- 同时又说只要 `## 问题` 列了 `[MINOR/MAJOR/CRITICAL]` 就不能是 PASS（`agents/continuity-editor.md:309`）。

影响：模型可能把 finding-only MINOR 写进 `## 问题`，然后被迫给 REVISE，和“80 分草稿定位”冲突。

建议：把 finding-only 统一放入独立 `## 观察 / Warnings` 节，`## 问题` 只承载会影响 verdict 的项。

## 建议修复顺序

1. 先修 `/review` `allowed-tools`，这是最小且直接的执行阻塞。
2. 再修 `/rewrite`：去掉写前预检，复用 `/write` WCP 聚合、ReviewReport JSON 路由、`refine_count` 和最小 writer envelope。
3. 合并参考作品照搬分级 SSOT：`/review`、`/rewrite` 不再复制严重度表，只引用 continuity-editor L3。
4. 更新 `docs/contracts/outline-planning.md §3.2`，补齐 `scene_type` / `ending_hook_type` 等 v4.4 阶段二透传字段。
5. 决定 ReviewReport JSON 的真实边界：完整质量 SSOT 或仅路由 SSOT，然后同步 schema 和命令说明。
6. 收紧 `/world` → `memory-keeper`：只把 confirmed facts 入 NovelMemory，suggestions/conflicts 不自动事实化。

## Benchmark 后续建议

修完 P0/P1 后再跑 benchmark 小说项目更划算。否则链路跑出来的失败会混入 prompt 契约漂移，难以判断是 Agent 写作能力问题，还是命令/工具契约问题。

benchmark 项目建议放在：

`<eval 工作区>/command-agent-skill-chain/`

建议最小样本：

1. 新建 1 个短篇项目，跑 `/plan` 阶段一和一个单元阶段二，检查 outline v4.4 字段透传。
2. 跑 `/write` 连续 3 章，检查 WCP、ChapterMetadata、ReviewReport JSON、memory 回写是否闭环。
3. 对第 2 章跑 `/rewrite`，检查是否与 `/write` 使用同一审修路由。
4. 跑一次 `/review`，检查报告落盘、summary 和 state 更新。
5. 跑一次 `/world`，故意加入冲突设定，检查是否会自动污染 NovelMemory。
