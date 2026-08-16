# ADR-0010: 伏笔密度语义重定义——计划兑现度取代密度达标

## 状态

accepted（2026-05-29，#162 brainstorm 锁定）

## 背景

ADR-0004 S4/S7 引入伏笔密度程序端校验（`novel_foreshadowing_density`），把"密度够不够"从 LLM 推理迁到程序端 SQL（ADR-0002 哲学）。dogfood（11-Novel-test）暴露其实现有两处偏离原设计：

**根因 1 —— 章级 expected 硬编码常量 2。** `readers.ts` `DEFAULT_CHAPTER_EXPECTED = 2`，chapter scope 永远用此常量、不读 outline。但 ADR-0004 ⑤ 的密度规划是**单元级**（`unit.foreshadowing_density` 数字），章级从无规划真值。"每章应触及 2 条"是实现臆造——开篇章合理只规划 1 条伏笔，`actual=1 < 2×0.8` 必触发 `density_below_target` 误报。`tools.ts` 文档声称"expected 来自大纲规划值"，与实现矛盾。

**根因 2 —— actions_log 双写重复计数。** PK 含 `scene_number`；`/plan` 阶段二预登记动作（scene=NULL）+ `/write` 步骤 6 登记兑现动作（scene=具体值）双写。SQLite 中 `NULL` 与任何值都不相等，`INSERT OR IGNORE` 去不掉 planning(NULL) vs writing(非空) 的语义重复 → 章写完后该章 `COUNT(*)` 翻倍，density 整体失真。

**更深一层定性：** 章级套用"密度达标"语义本身就错——伏笔本应随剧情起伏埋设/回收，强求每章定额无意义。且 ADR-0004:104 原设计已预想 `status` 字段（`WHERE status='active'`），实现时漏了。修复方向不是"章级 expected 改从 outline 推导"，而是**改变 density 的语义**。

注：density 在审修端可触发 FAIL（continuity-editor `actual=0 且 expected≥1 → FAIL`），上述误报在特定时序（审修时 realized 尚未入库、actual=0）会误触发 FAIL 进 retry 主链，影响超出"WARNING 噪音"。

## 决策

`novel_foreshadowing_density` 全 scope（chapter / unit / volume）改为 **「计划兑现度」语义**：

- `expected` = 该范围内 outline **计划**的伏笔动作数（`status='planned'`）
- `actual` = 实际**兑现**的伏笔动作数（`status='realized'`）
- warning：`actual < expected×0.8` → `density_below_target`（语义："计划 N 条伏笔动作，仅兑现 M 条"）；`actual > expected×1.5` → `density_above_target`
- 审修端 FAIL 判定保留：`actual=0 且 expected≥1` → FAIL（计划的伏笔全没落地 = 真问题）

**存储改造：**

- `foreshadowing_actions_log` 加 `status TEXT`（`'planned'` | `'realized'`）
- PK 改为 `(novel_id, chapter, foreshadowing_id, action, status)`，**去掉 `scene_number`**
- `scene_number` 降为信息列（记录在哪个 scene 兑现，不参与密度计数）——按"动作"而非"scene"计兑现度，符合"该埋/该回收的有没有落地"语义，同时根除根因 2 的 NULL 去重失效
- `/plan` 阶段二预登记写 `status='planned'`；`/write` 步骤 6 兑现登记写 `status='realized'`

**字段角色变更：** `unit.foreshadowing_density` 降级为 outline-architect 规划时的密度目标参考（指导 plan 阶段二该登记多少 planned 动作），**不再进 density API 计算**。字段保留不删。

**migration：** 已有项目 `actions_log` 重建表回填——按 `scene_number IS NULL → planned` / 非空 → `realized` 回填 status，去重后换表。老项目无感升级，数据不丢。

## 理由

| # | 理由 |
|---|---|
| 1 | 章级"密度达标"语义本就错（伏笔随剧情起伏，无定额），"计划兑现度"检的是"该埋/该回收的有没有落地"，才是有意义的程序端校验 |
| 2 | 回归 ADR-0004:104 原始设计意图（已预想 status 字段），不是新增复杂度 |
| 3 | status 列 + PK 去 scene_number 同时根除两根因：expected 不再硬编码、planned/realized 不再混计翻倍 |
| 4 | 全 scope 统一一套语义，消除 chapter（硬编码 2）vs unit（foreshadowing_density）的语义割裂 |
| 5 | 延续 ADR-0002 哲学——机械计数留在程序端 SQL，LLM 不自己数伏笔 |

## 后果

**正向：**
- 开篇章/低密度章不再误报、不再误触发 FAIL
- density 数据可信（不再重复翻倍）
- planned/realized 双轨可分别量化"规划完整度"与"兑现完整度"

**风险与缓解：**
- migration 回填依赖"scene NULL=planned"启发式——老项目若有 scene=NULL 的 realized 行会误判为 planned。缓解：dogfood 阶段项目少，回填后人工抽查 11-Novel-test；启发式与当前唯一双写来源一致（plan 预登记必 NULL / write 兑现必带 scene），误判面极小
- PK 去 scene_number 后，同章同伏笔同动作跨多 scene 的多次兑现只计一次。这是**刻意设计**——兑现度按动作算，一个 develop 落地即达标，符合语义

## 修订（2026-05-29, #169）

本 ADR 决策表「FAIL 定位」一行原结论为「保留（`actual=0 且 expected≥1 → FAIL`，全 scope 适用）」，§背景注亦预警了审修时序隐患（审修时 realized 尚未入库、`actual=0` → 误触发 FAIL 进 retry 主链）。dogfood（11-Novel-test ch-003，2026-05-29）实证该隐患**系统性命中**——`/write` 步骤顺序固定为「步骤 4-5 审修 → 步骤 6 memory-keeper 入库 realized」，当前正审章的 `actual=COUNT(status='realized')` **结构性必然为 0**，与本章是否真写到伏笔无关。

**修订决策（#169 方向 C+D）：**

- **章级（chapter scope）density FAIL 取消**——降为 WARNING-only（`actual<expected → WARNING（计划 N·兑现 M）`），永不 FAIL。
- **FAIL 判定（`actual=0 且 expected≥1`）仅 unit/volume scope 适用**：这两个范围是「单元/卷写完后回顾」，actual 已稳定、且「计划伏笔到此都该兑现」语义成立。与本 ADR 理由①（章级伏笔随剧情起伏、不该定额）一致。
- **时序护栏（D）**：当前章 `actual=0` 但正文 `foreshadowing_touched`/`foreshadowing_actions` 在场 → continuity-editor 判入库时序滞后，记 WARNING + 提示补录，绝不 FAIL（从 LLM 自觉升为 prompt 明文）。

注：unit/volume scope 当前无 command 调用，FAIL 规则暂为「预留正确语义」，待 /review 卷级回顾或 /status 引入时生效。落地见 `agents/continuity-editor.md` density 维度 + `commands/write.md` FAIL→retry 路由清单。

## 关联

- 上游：**ADR-0004 S4/S7**（伏笔密度由其引入，本 ADR 修订其 density 实现语义）/ ADR-0002（机械计算迁程序端，本 ADR 延续）/ ADR-0005（dogfood 不兼容老项目——本 ADR 用重建表回填使老项目无感）
- B0 同步：§5.0 ADR 概览 + §5.3 ADR-0004 节需加注"density 语义已被 ADR-0010 重定义"
- spec：`docs/plans/2026-05-29-foreshadowing-density-semantic-redesign-design.md` / `docs/plans/2026-05-29-density-current-chapter-fail-exemption-implementation.md`（#169 落地）
- issue：#162 / #169
