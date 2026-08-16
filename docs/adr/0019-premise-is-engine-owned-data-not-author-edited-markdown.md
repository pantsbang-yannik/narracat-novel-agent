# ADR 0019: 立项卡是引擎拥有的结构化数据，不再是作者直接编辑的 markdown

## Status

Accepted

> **2026-06-19 current reading**：以下 Decision 已按 2026-06-15(2)/(3) 修正收口。当前边界是：**内容只经 AI，App 直写只动信心标记**；App 程序化写入仅限 `canon` ⇄ `tentative` 互标。进入/离开 `open`、补白、地基卡内容修改都走 `/narracat:revise-premise`，并按需先出 CascadeImpactReport、确认后再落改。

> **2026-06-15 细化（不翻转决策，#276 写入路径 grill）**：把 Decision 3「经 IPC→`novel_submit_premise` 轻量路径」写实——**App 主进程起一次性 NovelMemory MCP client、无 LLM 程序化调用 `novel_submit_premise`（传 App 基于当前 cards 增量构造的完整 payload），用完即关**；不经 Agent 对话（这类无下游影响字段 App 已持有确定 payload，LLM 无判断可做、让其中转只增改写/格式错风险）、不直碰 `memory.db`、不 fork 渲染逻辑。此路径**经 MCP 工具写入，符合 ADR-0014 写权限模型与 Agent 侧 `MEMORY_MCP_GUARD`**（该守卫禁的是直碰 DB / 绕过工具，非「必须经 Agent」），且不扩展引擎写权限边界（仅把 `novel_submit_premise` 的调用方从 Agent 扩到 App 程序化调用）。**App 直接写的边界靠 App 层守**：可写 = 任意项确定度三态变更 + 原 `certainty=open` 项的补白（含连带升 certainty）；原 `canon`/`tentative` 项改 value = 内容修改，走步骤 2 级联（#277）。UI 只暴露这些编辑 + App 增量构造 payload，引擎不强制区分调用方。一致性由 `novel_submit_premise` 原子同步 `premise_cards` / `premise.md` / `premise-cards.json` 保证。精确字段边界与 UI 实现细节归 #276。

> **2026-06-15(2) 再修正（#276 走查反馈，收窄 App 直写边界）**：上条「open 项补白 App 直写」推翻——补白本质是**新增地基内容**，应与内容修改同样经 AI 引导（更稳、更合「立项卡是慎重地基」调性）。新原则：**内容只经 AI，App 直写只动信心标记**。① App 直写收窄为 **`canon` ⇄ `tentative` 互标**（纯信心、内容不变、无下游影响）；进入/离开 `open`（未确定）一律经 AI。② 状态与操作绑定，UI 不让裸切状态——列表项状态前置（已定/暂定/未确定），操作收进「更多」(⋯)：已定→{标记为暂定, 重新讨论}；暂定→{标记为已定, 重新讨论}；未确定→{讨论确定}。③ **重新讨论**（改已定/暂定内容）/**讨论确定**（给未确定定内容）发给 AI 引导——#276 先复用现有「交给 Agent」handoff 发指令，完整 CascadeImpactReport 级联归 #277 深化。④ certainty 中文标签 `open`→「未确定」（仅 App 标签层，schema enum 仍 `open`）。

> **2026-06-15(3) 细化（不翻转决策，#277 级联设计 grill 定案）**：把 Decision 4「复用 `/rewrite` 的 CascadeImpactReport」与「分两步落地」步骤 2 的级联部分写实。① **级联接入新建独立命令 `/narracat:revise-premise`**——非扩展 `/rewrite`（章节级、回滚章记忆、diff 章正文，语义错配）、非复用 `/setup`（全量立项、无级联步骤、粒度太重）；「复用 CascadeImpactReport」指复用其**结构与呈现**（key_changes + affected_chapters{chapter, impact_level, issues, suggested_fix}），锚点是被改地基字段而非重写章，报告不入任何工具、不校验该 schema（schema 的 `rewritten_chapter` 章相对约束不适配 premise）。② **交互：先报告后确认**——主会话直接执行（不派 agent）：定位单条 → 讨论新值 → 扫已写章产出级联报告 → AskUserQuestion 确认（**确认前不写**，比 /rewrite 的事后报告更安全，因新值在讨论步已知）→ `novel_submit_premise` 落改，**不自动改章节**（critical 章建议作者逐章 `/narracat:rewrite`）。③ **facts sync 边界**：四项重叠「全书」字段（`central_dramatic_question` / `protagonist_core_desire` ← `protagonist_desire.surface_want` / `protagonist_core_lack` ← `deep_need` / `antagonistic_force`）由 `novel_submit_premise` **原子同步**（新增 `sync_engine_facts` 参数，默认 `false`；仅 revise 流程传 `true`，setup 全量立项与 App 信心标记不传，保持 facts 由 `novel_submit_outline` 拥有）。重叠真相落在**三处**——`facts`（subject='全书'）、`outline/outline-structure.json`、`outline/master-outline.md`——sync 须三处一致：facts 套 submit_outline「删旧索引→插新 + embedding」模式；并**回灌已渲染的大纲产物**（patch outline-structure.json 同名字段 + 按更新后 payload 重渲 master-outline.md，提取 `renderMasterOutlineMarkdown` 复用），否则 App 从 outline-structure.json 渲染/复制的全书大纲仍是旧值（走查 P1）。**open/空值字段跳过**，不用占位覆盖既有真相；无 outline（DTO 不存在）时只写 facts、跳过回灌，待 /plan 写出一致大纲。仍 sync 维持一致、不做完整 dedup（与 Considered Options 末条一致）。④ **防漏卡**：`novel_submit_premise` 加 `merge_cards` 参数（默认 false=整体覆盖；revise 传 true）——按 card key 把提交的目标卡并入现有 cards_json、未提交的卡原样保留，避免弱模型只提交目标卡时丢失其余立项卡（走查 P1）。⑤ 连带修 `/setup` 篇幅/风格/genre 步骤幂等（config 已有值则保留不重问），消除定点流程接入前旧 handoff 复用 setup 重问章节字数的 bug。⑥ #275/#278 走查二轮收口（App 直写路径硬化）：**App「标记为已定」加乐观锁**——IPC 带渲染时该字段的 key/value/确定度，main 读盘最新 cards 后 fieldIndex 处不符（Agent 并发改过同卡顺序/内容）即拒绝并要求刷新，不误改另一条暂定项；**公开 IPC 类型收窄**到 `certainty:'canon'`、删 `value`（内容修改只经 Agent，类型层杜绝「能编译、运行时必拒」的误用）；schema `cards` 描述澄清「默认整体覆盖、增量改卡须 `merge_cards=true`」。

## Context

立项卡（Premise）是 Novel project 的九张创作地基卡，由 `/narracat:setup` 立项对话产出，被 `/plan`、`/world`、叙述者腔调渲染与每章写作共同消费——它是写作地基，不是孤立文档。

现状：立项卡的唯一真相是作者直接编辑的 `bible/premise.md`，无 schema、无 SQLite，确定度以 `[canon]` / `[暂定]` / `[留白]` 行内文本标注；#243 因 premise 当时无 schema，把三态确定度在 App 硬编码（`schema-field-labels.ts`，注释标源、不进对照测试）。

#249 要把确定度渲染成徽标、对留白项给视觉提示与补充入口。沿 ADR-0016（机器字段不入用户通道）/ ADR-0018（结构化产物暴露 server-ready 数据契约），App 不应解析 `premise.md` 行内 `[canon]` 反推结构——那是 ADR-0014/0018 已证否的有损往返。ADR-0018 已点名立项卡为收编对象之一。

但立项卡与大纲（#248）、审校（#250）有一处本质不同，使它不能简单套用同一模式：**outline/review 一直是引擎 / 工具生成的产物，立项卡却是作者直接编辑的文档**。把它纳入数据契约 = 一次数据所有权转移，必须同时回答「作者今后怎么改」与「改了之后下游怎么办」：

- 立项卡的地基卡（中心问题、金手指、主角欲望、对抗力量、叙述声音）是写作每章都依赖的；改它等于动地基，已写章节可能脱节。
- 其中四项（中心问题、主角欲望、主角缺失、对抗力量）与大纲引擎字段重叠，`novel_submit_outline` 已把它们写入 `memory.db` facts（subject='全书'）。改立项卡这些字段会让大纲那份变旧。

## Decision

**立项卡的结构化真相归 NarraCat Agent Core 引擎所有；`bible/premise.md` 降为引擎机械渲染的只读视图，不再是作者直接编辑的源头。**

1. **PremiseCards schema + 确定度枚举**：九卡，每条 prose 值 + 每条 Premise certainty（ajv 枚举 `canon` / `tentative` / `open`，App 渲染为「已定 / 暂定 / 未确定」，未标注视为 canon）；第 9 卡「留白声明」由各条确定度自动汇总、不单独手写。确定度成为 schema SSOT，**supersede #243 定案 3**——App 不再硬编码三态，改由 `schema-field-labels` 枚举映射 + 对照测试守护（同其它枚举）。
2. **单一结构化写入口 `novel_submit_premise`**：写引擎真相 + 机械渲染 `premise.md` + 落 App 数据契约文件，与 `novel_submit_outline` / `novel_submit_review` 同形。`premise.md` 不再被任何环节当源头编辑。
3. **作者混合编辑模型**：
   - **App 直接写**——仅 `canon` ⇄ `tentative` 互标这类纯信心标记变化，经 IPC→`novel_submit_premise` 轻量路径，不触发级联。
   - **Agent 对话写**——进入/离开 `open`、补白、地基卡内容的实质修改，因为只有 Agent 能顺带讨论新值、同步记忆、跑级联、提示作者。
4. **改地基卡内容 = 级联事件**：通过独立 `/narracat:revise-premise` 流程复用 CascadeImpactReport 的结构与呈现，先出受影响章节报告、作者确认后再动（不自动改章节），并同步大纲重叠的「全书」facts。
5. **App 从契约渲染**：经 data-source 读立项卡数据契约渲染九卡 + 确定度徽标 + 未确定项高亮 + 未确定项「讨论确定」入口（交给 Agent），不解析 `premise.md`。

**分两步落地**：步骤 1「能看」= schema + `novel_submit_premise` + setup 改造 + 徽标渲染 + 未确定项引导 + 只读（落地 #249 原始验收）；步骤 2「能改 + 级联」= 信心标记就地写回 + open/补白/地基卡内容走 `/narracat:revise-premise` + 完整 CascadeImpactReport。

## Considered Options

- **立项卡留作者直接编辑的 markdown + App 解析行内 `[canon]`**：否决。ADR-0014/0016/0018 反模式的立项卡版——有损往返、渲染层耦合文本格式、服务端化时连渲染层报废。
- **只把确定度抽成结构、prose 仍留 `premise.md` 作者编辑**：否决。App 仍要把确定度 attach 回 prose → 仍解析 markdown；且作者改 .md 与工具写结构化会双写入口竞争。
- **立项卡全量迁入引擎 + 混合编辑 + 级联**：采纳。与 outline（#248）/ review（#250）同模式，一并解决徽标、留白引导与改动一致性；代价是放弃「直接编辑 `premise.md`」的直觉，换来 server-ready 契约 + 级联保护。
- **重叠字段彻底去重（立项卡独家拥有「全书」字段，大纲不再写）**：暂缓。会动刚落地的 #248 大纲提交链；#249 先「sync 不 dedup」（改立项卡同步那份大纲 facts），完整去重留后续评估。

## Consequences

- **agent-core**：新增 PremiseCards schema + `novel_submit_premise`（+ 可能 `novel_get_premise`）+ setup.md 改造（对话→工具入库，不再 `Edit premise.md`）+ `premise.md` 改由工具渲染 + 级联接入（步骤 2）。`plan` / `world` / 叙述者腔调渲染继续读渲染出的 `premise.md`（人读视图保留，同 #248 大纲 md）。
- **App**：`schema-field-labels` 把确定度三态从硬编码改为 schema 枚举映射（进对照测试）；新增立项卡 data-source + 渲染（九卡 + 徽标 + 未确定项引导）；仅信心标记写回 IPC（步骤 2），内容修改与补白经 Agent。
- **supersede #243 定案 3**（premise 三态 App 硬编码）；与 ADR-0018 同模式、机器字段沿 ADR-0016。
- **重叠的「全书」facts** 暂以 sync 维持一致，完整 dedup 留后续。
- **存量迁移**：立项卡是唯一一处「旧真相只在作者 markdown 里」的产物——不同于 outline/review（真相已在 `memory.db`，backfill 直接重导）。旧项目 `premise.md` 需一次性 best-effort 解析迁入结构化（**一次性迁移解析，非运行时解析**，不违反本 ADR / 0018 的运行时禁解析），或由作者重跑 setup；细节随步骤 1 实现定。
- **作者直接编辑 `premise.md` 的工作流终止**，改经 App（轻量字段）/ Agent（内容）。
