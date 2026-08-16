# ADR 0029: 用户编辑创作信息的两档交互原则（直接保存 vs Agent 评估后保存）

## Status

Accepted（partially supersedes [0019](0019-premise-is-engine-owned-data-not-author-edited-markdown.md)）

## Context

产品要支持用户自由编辑创作信息（设定集 / 大纲 / 将来的角色等）。但这些信息的真相源结构不同、改动后果深浅不同：

- **真相源不同**：立项卡（premise）、大纲（outline）是 DB / json 结构化真相源，md 只是机械渲染的只读视图；世界观、角色档案是 Agent 用 Write 写的自由 markdown，文件本身即真相。
- **后果深浅不同**：改一句卖点措辞，后果确定、不牵连别处；改"中心戏剧问题"或叙述基调，会牵连全书 facts、风格指令、已写章节、伏笔链——乱改会让记忆与正文失真。

需要一个**统一的产品原则**，既给用户自由编辑，又不让记忆 / 一致性失控。同时它要能容纳"不同信息底层同步路径不止两种"这个事实，而不在用户面前暴露这种复杂度。

本 ADR 与既有边界的关系：[0019](0019-premise-is-engine-owned-data-not-author-edited-markdown.md) 规定"立项卡内容只能通过 AI 改、App 只写确定度标记"。本 ADR **放宽** 0019：立项卡中**经审计确认无下游依赖的纯描述字段**，允许 App 直接编辑保存；有下游依赖的字段仍只能经 Agent 评估改。[0014](0014-novelmemory-mechanically-writes-structure-state.md)（结构状态只经 MCP 工具机械写）、[0016](0016-machine-fields-stay-out-of-user-channels.md)（机器字段不入用户通道）、[0021](0021-narrator-address-is-controlled-required-premise-field.md)（叙述人称受控）、[0024](0024-style-directive-carries-positive-craft-not-restraint-calibration.md)（风格指令正向化）作为约束保留，不被本 ADR 放宽。

## Decision

### 一、产品层固定两档编辑交互

| | 第一档·直接保存 | 第二档·评估后保存 |
|---|---|---|
| 交互 | 编辑后直接保存即生效 | 编辑后页面底部浮现"保存并评估影响"组件，用户点击后由 Agent 评估级联影响，**先把影响清单（CascadeImpactReport）摆给用户二次确认，确认后才同步** |
| 适用 | 后果**确定、可机械同步**、不牵连其他内容 | 后果**不确定、牵连已写章节 / 伏笔链 / 记忆 facts / 全局风格**、需判断 |
| 谁处理后果 | 代码确定性同步（经 MCP 工具机械写 + 机械重渲，不动 Agent） | Agent 评估级联 + 用户确认 + 同步记忆 + 回灌渲染 |
| 北极星 | 代码能算的后果 → 机械同步 | 算不清的后果 → 才动用 Agent |

两档是**稳定的 UX 契约**；其下封装**多种底层实现**（见第四节），实现可渐进扩展，用户面前永远只有这两种交互。

### 二、走哪档由确定性规则判定（不靠用户自选、不每次问 Agent）

一个编辑进**第二档** ⟺ 它触及的字段属于"**有下游依赖字段集**"：被映射成全书 facts、被风格指令 / WritingContextPack / 大纲编排消费、是受控枚举、或会驱动结构规划。否则进第一档。

该字段集**按内容类型显式登记、确定性可判**。现有 `collectPremiseEngineOverlap()` 是其中"引擎字段"子集的现成实现，可扩展到其余下游。

**Fail-safe 方向**：新增可编辑字段**默认归第二档**；只有经下游依赖审计、显式证明无依赖的字段才登记进第一档。避免将来加字段漏归档导致直改破坏依赖。

### 三、立项卡字段分档（放宽 0019 的精确边界）

这是本 ADR 放宽 0019 的硬边界——立项卡 27 个叶子字段按下游依赖审计分档：

**第一档·可直接编辑保存（12 项，纯描述、零下游依赖）**

| 卡 | 字段 |
|---|---|
| genre_contract 题材读者契约 | subgenre / reader_expectation / surprise_point / emotional_tone |
| core_hook 核心钩子 | 单段内容 |
| golden_finger 金手指 | ability / limit / growth / sustains_conflict |
| protagonist_desire 主角欲望 | cost / bottom_line |
| world_rules 世界规则 | 冲突描述 note |

**第二档·必须走 Agent 评估级联（15 项，有下游依赖）**

| 字段 | 下游依赖 |
|---|---|
| central_dramatic_question.question | sync facts / 大纲回灌 / 架构师结构规划 |
| protagonist_desire.surface_want / deep_need | sync facts（主角欲望表层·深层）/ 大纲回灌 / 架构师规划 |
| antagonistic_force.force | sync facts / 大纲回灌 / 架构师规划 |
| golden_finger.feedback_loop | 驱动 arc payoff_beats 爽点编排 |
| world_rules 规则本身（value） | WritingContextPack 注入 / 权威约束 / 设定核对 |
| narrator_voice 全部 9 字段（archetype / tone / pacing / ornamentation / digression / address / style_keywords / reference_inspiration / reference_example） | 风格指令渲染 / 全局创作风格 / 受控枚举（address）/ 腔调节渲染 |

### 四、底层多态实现（同两档 UX，不同底层路径）

| 内容 | 第一档底层 | 第二档底层 |
|---|---|---|
| **立项卡** | 复用 `premise-client` 的 `novel_submit_premise(merge_cards=true)`（不传 sync_engine_facts），机械重渲 premise.md | 复用 `/revise-premise`：`sync_engine_facts=true` + CascadeImpactReport + 回灌大纲 |
| **大纲** | 章纲描述性字段直写 `ch-NNN.json` + 机械重渲 | 书级结构（arc 走向 / 伏笔埋兑章 / 卷章范围 / 增删排序）→ Agent 重规划 + 过 `checkStructureRhythm` 等门控 + CascadeImpactReport |
| **角色（路 A，单独大项）** | （演进后）作者直改无依赖结构字段 | 牵连关系 / 状态 / facts 的改动走 Agent 评估 |

立项卡两档底层**均已存在**，0029 对立项卡的增量主要是：明确字段分档、放宽 App 可直写第一档纯描述字段、补第一档编辑 UI。

## Considered Options

- **两档 UX + 确定性字段路由（采纳）**：用户体验一致可预期，记忆 / 一致性有护栏，底层可渐进扩展，复用现有 revise-premise / premise-client 两条路径。
- **不放宽 0019，立项卡内容一律走 Agent**：否决。立项卡有近半字段是纯描述、零依赖，强制走 Agent 评估徒增延迟与成本，且与"支持自由编辑"的产品目标相悖。
- **用户自己选小改 / 大改**：否决。靠用户判断哪些字段牵连记忆，易误判（用户未必知道 narrator.tone 会重写全书风格指令）。
- **每次保存都让 Agent 判级联**：否决。每次编辑都跑 Agent，慢、贵，违背"代码能算的绝不让 LLM 填"。

## Consequences

- **正**：编辑体验在所有内容上一致（永远两档）；记忆 / 一致性有确定性护栏；底层先落立项卡 / 大纲、后接角色（路 A），渐进无阻；复用既有两条路径，立项卡落地成本低。
- **成本**：需为每类可编辑内容维护一张"字段 → 档位"路由表（新增字段须审计登记，默认第二档）；第二档有 Agent 延迟与成本；第一档各内容需各自的确定性同步逻辑。
- **关系**：[0019](0019-premise-is-engine-owned-data-not-author-edited-markdown.md) partially superseded（立项卡纯描述字段可 App 直写，不再"一律 through AI"）；0014 / 0016 / 0021 / 0024 作为约束保留；角色结构化（项目记忆 `character-structured-entity-epic`）将来按本原则接入第二档。
