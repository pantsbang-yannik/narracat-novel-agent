# ADR-0007: 全 Agent prompt 用 ballpark indicative，不设 hard target（accepted）

**日期**: 2026-05-23
**状态**: accepted —— 与 B0 spec commit ba82821 同期落地
**触发**: Goal B B0 spec brainstorm Q5 用户修订（原选 "chapter-writer hard ≤150 + 其他 indicative"，遇到 §4.1 阶段零 48 行 trade-off 时拍板"我不关心多少行，我关心质量"）
**关联**:
- `docs/plans/2026-05-23-prompt-layering-architecture-design.md`（B0 spec，commit ba82821）§1.4 O5 / §2.2 Agent prompt 核心约束 / §4 5 Agent 迁移映射表
- `docs/plans/2026-05-23-goal-b-direction-redirection-design.md` §3.2 chapter-writer 激进重构 "100-150 行"原表述（B1 v2 spec）
- ADR-0006（生成端正向约束哲学的延续——本 ADR 也是把"机械约束"换成"质量驱动"的同方向修正）

## 背景

NarraCat 现有 5 个 Agent prompt 行数（参考起点）：chapter-writer 296 / continuity-editor 237 / outline-architect 237 / memory-keeper 225 / world-curator 164（总 1159 行）。

Goal B B1 v2 spec §3.2 提议 chapter-writer 按下沉决策树激进重构，spec 中 "100-150 行" 是 ballpark 估算，但表述中含 "hard target" 暗示，给"行数即合同"的印象。

B0 spec brainstorm Q5 提出"5 个 Agent 都给 indicative target + chapter-writer hard（推荐）"方案，被用户拍板修订为"全 Agent done 标准是决策树正确执行，行数只是 ballpark 参考"。

修订发生在具体决策点：B0 §4.1 把 chapter-writer 阶段零（锚定 + 5 项自检 + 拒写报告）瘦身映射的参考行数从 58 压到 40 后，用户提出"阶段零压到 40 太激进，调到 48"。这暴露出"机械行数预算"与"质量保留"之间的潜在冲突——为了凑 hard ≤150 而砍核心约束细节是反向逻辑。

## 评估的选项

1. **方案 A：全 Agent done 标准是决策树正确执行 + 行数仅作 ballpark 参考（采纳）**
   - 5 个 Agent 的迁移映射执行决策树后，瘦身效果参考 ballpark（chapter-writer ~158 / continuity-editor ~250 / outline-architect ~210 / memory-keeper ~200 / world-curator ~95）
   - PR review 的 done 标准 = (a) §3.1 决策树正确执行（每节内容走对了路，**首要判定**）+ (b) 瘦身效果落在 ballpark ±10% 参考区间（可超可低，但偏差需 PR 描述说明原因）
   - 偏差 ±10% 不是 bug；偏差 ±15% 触发 B0 ballpark 重审（B0 §7.1 R4）
   - 优：与 Karpathy 准则"目标驱动执行"一致——成功标准是"决策树正确执行"而不是"行数达标"；避免"为凑行数砍核心"反向逻辑
   - 劣：spec 缺乏精确的可量化 done 检测点；依赖 PR review 把关 ballpark drift

2. **方案 B：保留 chapter-writer hard ≤150 + 其他 Agent indicative**
   - chapter-writer 设 hard target ≤150 行，超出需重新 B0 review
   - 其他 4 Agent 用 indicative
   - 优：spec 有强可量化 done 检测点
   - 劣：触发反向逻辑——为凑 ≤150 必须从阶段零的瘦身参考行数 48（保留 5 项自检的具体例子）继续压缩 8 行；这 8 行只能从 §4.1 表中"风格锚点优先级 / 输入规范 / 输出规范"等节继续挤；每一处都涉及 chapter-writer 启动时的必看核心逻辑——压它就是"为行数砍质量"

3. **方案 C：不设任何行数预算，只用 §2 职责定义 + §3 决策树管理瘦身**
   - 完全不提行数
   - 优：纯职责驱动，最干净
   - 劣：spec 完全无可量化的 done 检测点；B2-B4 PR drift 风险高；用户在 review 时无 reference 锚点

## 决策

实施 **方案 A**。

### 决策范围

- **生效**：B0 spec §1.4 O5 / §2.2 核心约束 / §4 全表 全部按 "done 标准 = 决策树正确执行；行数仅作 ballpark 参考" 表述；§4.0 概览表"决策树执行后 ballpark 估算（参考）"列；§4.1 chapter-writer 决策树执行后参考 ~158 / §4.2 continuity-editor 参考 ~250 / §4.3 outline-architect 参考 ~210 / §4.4 memory-keeper 参考 ~200 / §4.5 world-curator 参考 ~95
- **生效**：PR review 标准 = 决策树正确执行（首要） + 落地行数在 ballpark ±10% 参考区间；偏差 ±15% 触发 B0 ballpark 重审（B0 §7.1 R4 风险条款）
- **不动**：以下其他层级的硬约束/ballpark 不属于"Agent prompt 行数"范畴，本 ADR 不覆盖：
  - 单 Command ≤500 行（B0 §2.1）
  - 单 A 类 Skill 主体 ballpark 300-400 行（B0 §2.3）
  - B 类 Skill 体量 80-150 行（B0 §2.5）
  - 仓库根 CLAUDE.md ≤500 行（B0 §2.8）

### 不可重开议题

未来 grill 若提出"给 chapter-writer / 某 Agent 加回 hard target"，本 ADR 是直接挡回的依据。重开条件仅限于：

1. NarraCat 内部 dogfood 实测到"Agent prompt 行数实际造成显著质量/性能问题"的具体数据（不是直觉判断）
2. 5 个 Agent 中某一个出现"PR review 多次 drift 到 ballpark ±25% 以上"的趋势

## 理由

### 反向逻辑论证（B0 §4.1 阶段零案例）

**论证目标**：证明"为了凑 hard target 而砍核心决策树执行结果"是反向逻辑——决策树正确执行才是 done 标准，行数计算只是反推可行性的工具。

chapter-writer §4.1 假设给定 hard ≤150 + 阶段零保留 48 行后，剩余预算 102 行需分配到（以下行数为反推可行性的中间计算）：

- frontmatter + 描述 40
- 铁律 5
- 戏剧力准则 0（下沉）
- 质量标准正文 8
- 风格锚点优先级 18
- 输入规范 12
- 阶段一-四 8+10+4+4 = 26
- 输出规范 ChapterMetadata 6
- 约束与禁忌 6
- 持久记忆 + MCP 速查 6

40+5+8+18+12+26+6+6+6 = 127 > 102 → 需再砍 25 行。

可砍的节：风格锚点优先级（含 1-6 层加载顺序 + 加载与合并规则）/ 输入规范（含 style_reference 技法说明）/ 输出规范 ChapterMetadata（12 项名单）。**这些都是 chapter-writer 决策树正确执行的"必看核心逻辑"——砍它们就是为行数对抗决策树质量**。反向逻辑显形：spec 在表述上一旦以"行数"为主语，执行时就会出现"为凑数砍决策树落点"的倒置。

### 与 Karpathy 准则 §4 一致

Karpathy 准则 §4「目标驱动执行」：成功标准定义得强，就能独立循环推进。本 ADR 把 done 标准从"行数 ≤150"改为"决策树正确执行"——**决策树是更强的成功标准**，因为它直接对应 spec 的核心算法层（B0 §3），行数仅是决策树执行后的副产物参考。

### 与 brainstorming Skill "YAGNI ruthlessly" 一致

brainstorming Skill 原则"YAGNI ruthlessly: Remove unnecessary features from all designs"——hard target 是"不必要的额外约束"，去掉后 spec 仍可执行。

### 与 ADR-0006 哲学方向一致

ADR-0006 移除生成端负向约束（antipattern GATE 自检），用正向约束（锚点声明）取代。本 ADR 把"机械行数约束"换成"质量驱动 + 决策树正确执行"——同方向：远离 mechanical / negative constraint，靠近 semantic / quality constraint。

## 实施状态

2026-05-23 与 B0 spec commit ba82821 同期落地。改动面：

| 文件 | 改动 |
|---|---|
| `docs/plans/2026-05-23-prompt-layering-architecture-design.md` | §1.4 O5 / §2.2 Agent prompt 核心约束 / §4 全表 全部 "done 标准是决策树正确执行；行数仅作 ballpark 参考" 表述 |
| `docs/adr/0007-agent-prompt-ballpark-no-hard-target-accepted.md` | 本 ADR 立项 |

## 不在本 ADR 范围内的相关工作

- B0 §7.1 R4 "5 Agent 决策树执行后行数与 ballpark 参考区间长期 drift" 的风险监控机制（CLAUDE.md 加 PR review checklist 是否落地）—— 独立 issue 跟踪
- ballpark 参考数字本身是否准确（如 world-curator 决策树执行后参考 ~95 低于原 indicative 120 暗示参考值可能调到 ~100）—— B5 实施时观察后修订 spec
- B1 v2 spec §3.2 chapter-writer 激进重构表述（"297→100-150 行" 旧表述）的 spec 修订 —— B2 启动时同步更新 B1 v2 spec 描述（轻量修订，z 增 1）
