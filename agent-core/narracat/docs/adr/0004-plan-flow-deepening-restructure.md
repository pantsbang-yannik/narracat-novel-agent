# ADR-0004: /plan 流深化重构 — 单元层 + 场景 inline + 章对象重构 + 全书引擎 + 伏笔系统

**日期**: 2026-05-20
**状态**: 已确认（待实施；前置依赖 ADR-0003 阶段 1 落地）
**触发**: 用户反馈"系统产出小说剧情太平、密度不够、伏笔不密集"，grill-with-docs 复盘
**关联**: ADR-0001（Skill 注入分层搁置）、ADR-0002（墙钟优化方向调整）、ADR-0003（/write 流锚点驱动重构）

## 背景

ADR-0003 已经从写作端激活了"目标态驱动"基因——chapter-writer 阶段零强制从 `emotional_stakes / dramatic_focus / value_shift` 三字段合成锚点，下游审修以"锚点兑现度"为最上层判定维度。

但 ADR-0003 假设的前提是 **outline 中这三个字段被写得足够具体**。实测中暴露了反向问题：当 outline-architect 产出的章节级字段本身泛泛（"角色受到打击"、"高潮时刻"），ADR-0003 的拒写机制只能反复触发、把问题倒推给用户。**根本约束在大纲（Plan）层而非写作（Write）层**。

grill-with-docs 复盘把"剧情太平 + 三层都平 + 伏笔不密集"三个症状解耦后定位到**四个共同祖先**：

1. **章内场景层完全在 chapter-writer 内心**——OutlineStructure schema 没有 scene 对象，写手自由发挥时章内节奏控不住
2. **章间中观锚点缺失**——`novel-structure §8.1` 把"事件单元（3-8 章一弧）"作为 mental model，但 Schema 没落地，章与章成了并列而非"上章蓄压→本章释放"
3. **全书引擎弱**——master_outline 只有 `theme / premise / major_arcs`，缺一个贯穿 500 章的"读者凭什么追看到底"的统摄问题；每卷都成了独立小故事
4. **伏笔规划是 ad-hoc 字段**——`foreshadowing_actions[]` 是动作标签不是密度规划；`payoff_milestones[]` 只是 reveal 章号清单；没有跨卷追踪能力

更关键的是发现一个**链路定位**——`emotional_stakes / dramatic_focus` 当前在 outline-architect 的产出中常常停留在抽象描述层，因为缺少更上游和更下游的"具体度拉力"：
- 上游缺：全书引擎（central_dramatic_question）+ 单元 core_question 这种锚点提供"本章在追什么大问题/小问题"的语境
- 下游缺：场景层 pressure_point 让 dramatic_focus 必须指向具体场景，逼出具体度

ADR-0003 是激活已有基因；本 ADR 是补足基因本身。两者协同后，Plan/Write 边界才真正清晰。

## 评估的选项

| 选项 | 描述 | 评估 |
|---|---|---|
| A | 单元层（新增）+ 场景 inline + 章对象极致重构 + 全书 5 字段引擎 + 伏笔系统化 | **选中** |
| B | 仅扩章对象字段（加 scenes inline + characters_in_chapter + dramatic_tempo），不加单元层、不动全书层、不重构伏笔 | 解决章内但不解决章间/卷间太平；伏笔仍 ad-hoc |
| C | 仅在章对象上补缺漏（时间 / 地点 / 人物每章目标），结构和层级完全不动 | 解决用户预想清单的字段缺口，但不动结构 = 不解决"系统性平淡"根因 |
| D | 不动 Schema，仅在 `novel-structure` Skill 中补强 outline-architect 的规约指引（"写得更具体""每章至少 N 条事件"） | LLM 在长上下文中遵守密度规约的能力差；零程序杠杆 |

A 的核心论据：

- 用户反馈是**系统性平淡**（三层都平 + 伏笔不密），不是单点漏字段——单点补字段（B/C）能解决感官，但无法消除根因
- 章间太平的根因是**中观锚点缺失**：novel-structure §8.1 已经承认"事件单元"概念，但只作为 mental model；规约性结构必须落到 Schema 才能被 outline-architect 在阶段一一次性规划、被 chapter-writer 在阶段零一次性消费
- 全书引擎的缺失让每卷都成了"独立小故事"——补一个 `central_dramatic_question` 即让所有下层都被"大问题"贯穿，零件归位
- 伏笔规划做密度量化，把校验从 LLM 推理迁到程序端 SQL 查询（ADR-0002 哲学："把机械计算迁出 LLM"）
- ADR-0003 的拒写机制如果不补足上游，会变成"反复触发拒写但用户不知道怎么细化"——补全后拒写有了"按哪个维度细化"的明确指引

A 的代价：

- 工程量中等（Schema + MCP server + 多 Agent prompt）
- 与 ADR-0003 阶段 1 在 chapter-writer 阶段零、continuity-editor 审修两处有交集，需要协调实施顺序
- outline-architect 阶段一输出量增加（全书引擎 + 单元层 + 全书伏笔系统）；阶段二派发粒度从"章号 segment"改为"单元 segment"

## 决策

**采纳选项 A，分 6 阶段实施。前置依赖 ADR-0003 阶段 1（write-flow-refactor）已落地。**

### 阶段总览

| # | 改动 | 收益 |
|---|---|---|
| ① | 引入**单元层**（卷与章之间，3-8 章一个微弧），新建 schema 字段 | 章间中观锚点 |
| ② | **场景对象 inline** 到章对象（6 字段：编号 / 功能 / 时空 / 角色 / 压力点 / 结果） | 章内节奏被规划锚定 |
| ③ | **章对象极致重构**：砍 `summary / key_events / characters_involved / tension_level`；新增 `characters_in_chapter[] / dramatic_tempo / scenes[]`；`dramatic_focus` 升必填 | 字段服务于 ADR-0003 锚点驱动 |
| ④ | **全书 5 字段引擎**：`central_dramatic_question / protagonist_core_desire / protagonist_core_lack / antagonistic_force / stakes_progression` | 卷间张力被统摄问题贯穿 |
| ⑤ | **伏笔系统结构化**：全书 `foreshadowing_system[]` 注册表 + 卷 `payoff_milestones[]` 升级带 type + 单元 `foreshadowing_density` 数字 + 章/场景层引用 id；MCP 加 `novel_foreshadowing_density` API | 密度可量化、跨卷可追踪、校验迁到程序端 |
| ⑥ | **chapter-writer 阶段零升级**（在 ADR-0003 之上）：锚点合成依据从 3 字段扩到 3+2 字段（+ dramatic_tempo + 单元 core_question）；heartbeat_moment 映射到具体 scene_number；新增"场景拒写"（任一场景 pressure_point 抽象即拒写） | 锚点更具体、密度更可控 |
| ⑦ | **plan 阶段二派发改为按单元派发**（3-8 章一 Task） + plan 阶段一不拆分但 prompt 强化结构化输出（全书引擎 + units[] + foreshadowing_system 一次性产出） | Agent 单 Task 输出质量提升、规划聚焦 |
| ⑧ | **continuity-editor 审修辅助检查升级**（在 ADR-0003 2 维度判定之上）：新增"场景兑现度"、"人物动线兑现度"、"伏笔密度"（程序端 SQL） | 闭环新结构的所有规划层 |
| ⑨ | **MCP 工具适配**：新增 3 工具（`novel_foreshadowing_density / novel_get_unit / novel_writing_context` 扩展返回 `current_unit + chapter_scenes + chapter_characters`） | 程序承担状态维护与密度统计 |

### 不在阶段 1 内的工作

- review / rewrite 命令的同步调整（保留下一轮 Epic）
- 命令拆分（plan 仍是单一命令；阶段一不拆 1a+1b）
- ADR-0003 阶段 2（antipattern 注入移除 A/B 实验）

## 理由

### 为什么单元层加而场景层 inline

**单元层加**：章间太平的根因是"3-8 章微弧线"在 Schema 缺失。novel-structure §8.1 已承认这是结构骨架，但只作 mental model 时 outline-architect 在阶段一只规划到卷、阶段二只规划到章，单元层永远"在头脑里"不落到字段。补一个轻量的 units[] 层（每单元 7 字段：unit_number / title / chapter_range / core_question / climax_chapter / irreversible_change / next_unit_seed），就把"上单元蓄压→本单元释放"的弧度刚性锚定。

**场景层 inline**：单元层加层是必要的（解决章间问题），但场景层独立成层是不必要的——500 章 × 4 场景 = 2000 个独立场景文件，管理灾难。场景作为章对象的子结构数组（`scenes[]`）既保留规划度，又不引入文件爆炸。

### 为什么章对象砍 summary / key_events

ADR-0003 的拒写机制依赖 outline 的 `emotional_stakes / dramatic_focus / value_shift` 三字段具体度。当章对象同时有 `summary` 和 `scenes[].outcome` 时，outline-architect 容易在 summary 里写一段含糊综述、把具体性留给场景或干脆不写——SSOT 不清导致 LLM 选择阻力最低的写法。

砍 `summary`，让 `scenes[]` 成为章节剧情的唯一描述源；砍 `key_events`，让事件信息分布到各场景的 outcome；砍 `characters_involved`，让 `characters_in_chapter[]` 既给参与者又给每章动线。一字段一职责，避免数据冗余引起 drift。

### 为什么全书层只补 5 字段而不补 8 字段

候选 8 字段方案里，`theme_question / ending_image / central_conflict_type` 与现有 `theme / premise` 语义有滑丝重叠。outline-architect 填字段时容易该二（把 theme 重复一遍）。砍掉这 3 个，剩下 5 个字段语义边界清晰：

- `central_dramatic_question` = 一个可结算的 yes/no 大问题（"他能在三十岁前找到杀父凶手吗?"）
- `protagonist_core_desire` = 主角想要什么（"想要洗清父亲冤名"）
- `protagonist_core_lack` = 主角的核心缺失/伤口（"不相信任何权威"）
- `antagonistic_force` = 对抗力量总览（"杀父仇人是朝廷重臣 + 整个司法体系"）
- `stakes_progression` = 赌注递增曲线（"卷1失去身份→卷2失去盟友→卷3失去信念→卷4面对真相"）

5 个字段都直接服务于"读者凭什么追看 500 章"。

### 为什么伏笔走结构化注册表 + MCP 密度 API

伏笔密度校验有两种实现路径：
- **Agent 端校验**（B 方案）：审修时让 continuity-editor 数本章触及伏笔数。开销：每章 +~300 token + ~5 秒推理；准确度受 LLM 数数能力影响。
- **程序端校验**（A 方案）：SQL 查询 `SELECT COUNT(*) FROM foreshadowing_actions WHERE chapter=N AND status='active'`。开销：<10ms；准确度 100%。

按 ADR-0002 哲学（"墙钟瓶颈在 LLM 推理本身"），把"机械计算"迁到程序端是负 LLM token、正速度。结构化注册表的额外字段开销（章/场景引用 id 而非 ad-hoc 描述）反而减少 outline-architect 阶段二的输出量。

### 为什么阶段二派发改单元

旧派发以"章号 segment"为单位（≤30 章一个 Task）。新结构下：
- 单 Task 章数过多 → 上下文 token 增加但 LLM 注意力打散，每章规划质量下降
- 单 Task 章数过少 → 调度开销大但单 Task 聚焦

单元（3-8 章）是天然的故事弧规划单位，一个 Task 一个单元正好让 LLM 把整个微弧线一次性想透。500 章 / 5 章每单元 = 100 个 Task 看似多，但每个 Task 独立、可并发（不同单元无依赖），墙钟实际可控。

### 为什么本 ADR 必须等 ADR-0003 阶段 1 落地

本 ADR 改动 chapter-writer 阶段零（锚点合成依据扩展）和 continuity-editor 审修（辅助检查升级），都是在 ADR-0003 已重写过的 prompt 上叠加。如果 ADR-0003 阶段 1 还没落地，本次改动会撞到旧 prompt 上、形成不一致 diff、增加 review 难度。

更重要的是：本 ADR 的拒写机制扩展（"场景拒写"）是 ADR-0003 章级拒写机制的延伸——必须先有章级拒写机制跑通，才能验证场景拒写的有效性。

## 何时重提

当下列任一条件成立时，应重新评估本 ADR：

- **单元层划分被实测发现僵化**：某些故事类型天然是连续推进、不分单元（如长篇编年史、流水账式日常）→ 单元层可能要从 required 降为 optional
- **场景对象 6 字段被实测发现冗余或缺失**：如 `purpose` 字段在实测中价值低、或 `emotional_trajectory` 不可或缺 → 调整字段集
- **全书 5 字段引擎包某字段实测无用**：如 `stakes_progression` 在实测中 outline-architect 总是填"递增"敷衍 → 砍掉
- **伏笔注册表 id 管理给 outline-architect 造成显著认知负担**：如 outline-architect 在阶段二经常忘记引用 id 反而写 ad-hoc 描述 → 简化注册表机制或回退到 ad-hoc + 后处理映射
- **按单元派发后 LLM 单 Task 质量未达预期**：调度次数增加但每 Task 输出质量没提升 → 回退派发粒度或调整 prompt
- **ADR-0003 的拒写机制因本 ADR 补足后仍频繁误触发**：说明拒写阈值需调整、不是上游字段不足问题

## 不在本 ADR 范围内的相关工作

- ADR-0001（Skill 注入分层搁置）继续维持
- ADR-0002（墙钟优化方向调整）继续维持；本 ADR 把伏笔密度校验从 LLM 端迁到程序端，是 ADR-0002 哲学的正向应用
- ADR-0003 阶段 1（/write 流锚点驱动重构）是本 ADR 的前置依赖
- ADR-0003 阶段 2（移除 antipattern 注入的 A/B 实验）继续按其触发条件独立推进
- review / rewrite 命令对新结构的适配（场景级 rewrite / 单元级 review）作为下一轮 Epic
- 命令拆分（如把 plan 拆成 plan-master / plan-units / plan-chapters）暂不考虑，保持单一 plan 命令
- 阶段二的"按单元 batch 询问"具体选项措辞作为实施阶段细节决定
