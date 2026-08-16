# ADR-0008: Goal B 期间 schema 软门槛 + 用户项目目录冻结（accepted）

**日期**: 2026-05-23
**状态**: accepted —— 与 B0 spec commit ba82821 同期落地
**触发**: Goal B B0 spec brainstorm 阶段用户披露"基于本 plugin 已构建客户端，schema 和文件夹调整可能影响下游"
**关联**:
- `docs/plans/2026-05-23-prompt-layering-architecture-design.md`（B0 spec，commit ba82821）§1.3 / §3.1 P1 / §6.1 T3+T9 / §6.2 step 4 / §6.3 场景 2 / §7.3 不可逆操作护栏
- ADR-0004（/plan 流深化重构）—— 上一次 schema 变动落地时用过的"全新字段 optional + 老项目降级 + 启动时数据迁移"策略
- ADR-0005（小说规模决策时机后移）—— "dogfood 阶段不兼容老项目"先例（本 ADR 反向：客户端兼容优先）

## 背景

NarraCat 是 Claude Code Plugin，用户基于本 plugin 已构建独立的客户端（用途未在 spec 中明示）。该客户端依赖以下两类资源：

1. **schemas/*.json 文件**：可能用于 outline / chapter metadata / review report 等的渲染、编辑、序列化校验
2. **用户项目目录结构**：`manuscript/vol-VV/ch-NNN.md` / `outline/vol-VV/ch-NNN.md` / `bible/characters/{name}.md` / `bible/reference-guidance/*.md` / `.narracat/memory.db` / `.narracat/state.yaml` 等路径与命名规范

Goal B B1 v2 spec §3.3 计划 5 个 schema 字段扩展（WritingContextPack / OutlineStructure / ChapterMetadata / MemoryExtraction / ReviewReport），§3.5 涉及 `bible/reference-guidance/style.md` 子节扩展。这些变动如果不加约束，可能在 B2-B6 期间 silent breaking change 客户端。

B0 spec brainstorm 阶段用户原话："过去的 ADR 可能有时效性，特别是我们最新的决策是要做重构了，schema 尽量不要动，因为我基于这套 plugin 是做了一个客户端的，schema 和文件夹调整可能影响下游。"

随后两道澄清拍板：
- Schema 字段扩展态度：**A 软门槛**——schema 可动但需 PR review 中评估下游影响 + 全部新字段 optional + 老项目降级
- "文件夹不动"范围：**仅用户项目目录不动**（manuscript / outline / bible / .narracat）；plugin 内目录（commands/ / agents/ / skills/ / templates/ / docs/contracts/）可调整

## 评估的选项

1. **方案 A：schema 软门槛 + 用户项目目录冻结（采纳）**
   - schema 字段扩展可做，但每个 schema 改动 PR 必须 (a) 评估下游客户端影响 (b) 全部新字段 optional (c) 老项目降级处理（同 ADR-0004 策略）
   - 用户项目目录冻结，任何调整都需用户显式授权
   - Plugin 内目录可调整
   - 优：保留 B1 v2 spec §3.3 字段扩展计划的可行性；客户端兼容性有强 PR review 保障
   - 劣：每个 schema PR 增加 review 工作量

2. **方案 B：严禁动 schema + 用户项目目录冻结**
   - Goal B 期间 schema 字段一律不动；新功能改用 prompt 层模拟（narrator_voice 从 bible/reference-guidance/style.md 子节读取 / scene_type 由 chapter-writer 阶段零从 outline 推断 等）
   - 优：客户端兼容性 100% 保证
   - 劣：prompt 层逻辑复杂度增加；ajv 入口校验无法约束新字段；字段一致性容易 drift；与 B1 v2 spec §3.3 计划冲突需大改

3. **方案 C：推迟所有 schema 变动到 Goal D dogfood 合流**
   - Goal B B2-B5 期间不做 schema 变动；留到 Goal D 一次性动
   - 优：客户端兼容性短期内不影响
   - 劣：Goal B B2-B5 期间无法验证 schema 扩展效果；Goal D 风险集中化（多个字段同时落地易出错）

## 决策

实施 **方案 A**。

### 决策范围

- **生效**：B0 spec §1.3 / §3.1 P1 / §6.2 step 4 / §6.1 T3+T9 / §7.3 中"软门槛"+"用户项目目录不动"条款
- **生效**：每个 schema 改动 PR 必须包含 "下游影响：..." section（或等价描述）
- **生效**：用户项目目录调整（如重命名 manuscript/ → chapters/ 等）默认拒绝，需用户显式 issue / 直接对话授权
- **不动**：Plugin 内目录（commands/ / agents/ / skills/ / templates/ / docs/contracts/）的内部结构调整不受本 ADR 约束——Goal A S1 改名 novel-memory → novel-memory-integration 即为合法操作；S2-S4 拆 Skill 同理
- **不动**：用户的客户端实施细节（用途 / 架构 / 依赖具体哪些 schema 字段）—— 本 ADR 是默认护栏，不假设客户端具体形态

### 重开条件

1. 用户客户端废弃或重写，不再依赖 NarraCat schema / 用户项目目录
2. Goal B + Goal C + Goal D 全部完成后，可能进入下一个大型版本周期时重新审视

## 理由

### Goal B B1 v2 spec §3.3 计划的 schema 变动清单（受影响）

| Schema | 拟增字段 | 客户端影响 |
|---|---|---|
| OutlineStructure v4.0→v4.1 | `master_outline.narrator_voice` / `volumes[].chapter_ending_rhythm` / `chapters[].scene_type` / `chapters[].ending_hook_type` | 客户端 outline 渲染 + 编辑器需要支持新字段，不支持则降级显示 |
| WritingContextPack v2.1→v2.2 | `narrator_voice` / `scene_type` / `chapter_ending_rhythm` | 客户端不直接消费（运行时数据），影响小 |
| ChapterMetadata v1.3→v1.4 | `ending_hook_type` | 客户端如果展示章节元数据需扩展，否则降级 |
| MemoryExtraction | `narrator_voice_actual` / `ending_hook_type_actual` predicate | 客户端不直接消费，影响小 |
| ReviewReport | `reading_desire_score` / `narrator_voice_fulfillment` / `ending_hook_fulfillment` / `dramatic_richness_score` | 客户端如果展示审校报告需扩展，否则降级 |

按方案 A 全部走软门槛：B2-B5 实施时每个 schema PR 评估这些影响 + 字段全 optional + 老项目降级处理。

### 用户项目目录冻结的具体边界

| 资源 | 状态 | 备注 |
|---|---|---|
| `manuscript/vol-VV/ch-NNN.md` | 冻结 | 路径与命名规范不动 |
| `outline/vol-VV/ch-NNN.md` / `vol-outline.md` | 冻结 | 同上 |
| `bible/characters/{name}.md` | 冻结 | 用户填写自由命名 |
| `bible/references/{自由命名}.md` / `.txt` | 冻结 | 同上 |
| `bible/reference-guidance/{premise\|world\|characters\|structure\|style}.md` / `index.md` | **半冻结** | 5 个文件名 + index.md 路径冻结；**文件内章节结构可扩展**（如 style.md 加"叙述者腔调"子节，符合 Goal B B2 计划）|
| `.narracat/memory.db` | 冻结 | 数据库文件名与路径不动 |
| `.narracat/state.yaml` | 冻结 | 同上 |
| `.narracat/config.yaml` | 冻结 | 同上 |

`bible/reference-guidance/` 的"半冻结"是关键边界——文件名 + 路径冻结（客户端可以 list 这些文件），但文件**内容章节**可扩展（plugin 自由演化）。

### 与 ADR-0004 / ADR-0005 的策略对比

| ADR | 策略 | 方向 |
|---|---|---|
| ADR-0004 | 全新字段 optional + 老项目降级 + 启动时数据迁移 | 兼容（实战可行性已证）|
| ADR-0005 | dogfood 阶段不兼容老项目 | 不兼容（dogfood 优先）|
| **本 ADR (0008)** | schema 软门槛 + 用户项目目录冻结 + 全字段 optional + 降级 | **客户端兼容优先**（与 0005 反向）|

本 ADR 沿用 0004 的字段策略，但在 0005 之后明确把"客户端兼容"放回优先级——不是 dogfood 优先级降低，而是承认在 Goal B 期间用户已构建客户端这一新事实。

## 实施状态

2026-05-23 与 B0 spec commit ba82821 同期落地。改动面：

| 文件 | 改动 |
|---|---|
| `docs/plans/2026-05-23-prompt-layering-architecture-design.md` | §1.3 下游兼容性硬约束 / §3.1 P1 客户端兼容性软门槛 / §6.1 T3+T9 / §6.2 step 4 / §6.3 场景 2 / §7.3 不可逆操作护栏 |
| `docs/adr/0008-schema-soft-gate-user-dir-frozen-accepted.md` | 本 ADR 立项 |

## 不在本 ADR 范围内的相关工作

- 立 hook 检查 `schemas/*.json` 改动 PR description 含"下游影响：..."关键字（B0 §7.1 R6 候选项）—— 独立 issue 跟踪
- 客户端具体形态、用途、依赖详细列表 —— 用户私有信息，不进 ADR
- Goal D dogfood 合流后是否重新审视 schema 字段拆分 / 改名等"重型变动" —— Goal D 启动时另议
- 与 ADR-0005 "dogfood 阶段不兼容老项目" 的潜在冲突 —— 两 ADR 都 accepted，本 ADR 在 0005 之后明示客户端兼容优先于 dogfood 简洁，未来 grill 时按时间顺序解读
