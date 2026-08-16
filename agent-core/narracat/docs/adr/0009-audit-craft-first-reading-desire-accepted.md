# ADR-0009: 审修端 craft-first——reading_desire 取代高频陷阱主维度

## 状态

accepted（2026-05-28，Goal B B5 #98 brainstorm 锁定）

## 背景

continuity-editor 模式二历史上以 **2 主维度**判定章节质量：①锚点兑现度（正向，ADR-0003）②高频陷阱（负向，GATE-3/4/5/7 反模式触发即 FAIL）。

Goal B B2/B3/B4 各自往 ReviewReport 加了独立的正向兑现度字段（narrator_voice_fulfillment / dramatic_richness_score / ending_hook_fulfillment），但审修的**最上层判定**仍是「锚点 + 陷阱」，正向兑现度只是辅助维度。

三条独立证据指向审修端应转向 craft-first：

1. **ADR-0006**（生成端零负面注入）：已确立生成端不注入负面 antipattern。审修端仍以负向陷阱为主维度，与生成端方向不一致。
2. **R2 产品定位**（80 分草稿，2.5.5 落地）：审修被重定义为「辅助人改的工具」，不应以「抓反模式」为最上层判定。
3. **R1 口子**（2.5.5 落地后用户发现）：审修负向回流污染——修订指令引用 antipattern 编号（A1/E1/H1），chapter-writer 重试时已无 antipattern 上下文 → 拍脑袋猜 → 可能误改正确内容。GOAT 论文亦证多 pass refine 循环可能把好内容退化为平均版本。

## 决策

continuity-editor 模式二主维度从「高频陷阱」改为 **reading_desire「是否让读者继续读下去」**（正向主维度，含 5 sub_scores：hook_strength / conflict_tension / new_information / narrator_appeal / richness_service）。

高频陷阱（GATE / antipattern）**降为辅助参照**——触发拉低对应 sub_score 或作 finding，不再独立触发 FAIL 主门禁。E2 / A1 / G 等重级反模式保留为辅助 checkpoint。

配套（详见 spec `docs/plans/2026-05-28-goal-b-b5-positive-reading-desire-design.md`）：
- 修订指令禁引 antipattern 编号，必须正向重述（缓解 R1 口子）
- REVISE + FAIL 合计 ≤ 2（防多 pass 发散）

## 理由

| # | 理由 |
|---|---|
| 1 | 与 ADR-0006 一致——生成端零负面 → 审修端正向优先，方向统一 |
| 2 | 对齐 R2「80 分草稿」——审修辅助人改，不以抓错为最上层 |
| 3 | 缓解 R1 负向回流污染——正向 framing + 修订指令禁引编号，chapter-writer 重试拿到的是可执行的正向描述而非空洞编号 |
| 4 | 5 sub_scores 可精准归因（failure_attribution sub<6 归 B2/B3/B4），直接对接 B6 dogfood judge 9 维度 |
| 5 | reading_desire 主维度可量化「阅读欲望」，比「有无反模式」更贴近产品目标（读者是否读得下去） |

## 后果

**正向：**
- 审修判定对齐 craft-first，与生成端 + 产品定位一致
- 修订归因清晰（sub_score → sub-goal），B6 dogfood 可精准回滚
- 缓解审修反向回流污染

**风险与缓解：**
- 陷阱降级可能漏检真实 AI 味 → E2/A1/G 保留为辅助参照拉低 sub_score；mini-dogfood + B6 观察漏检率
- reading_desire 均值可能掩盖单维低分 → failure_attribution 对 sub<6 单独标记，不被 total 均值掩盖

## 不可重开条款

未来架构 review **不再讨论**「是否恢复高频陷阱为审修主维度 / 是否把反模式 GATE 升回独立 FAIL 门禁」。

重开条件仅限：**dogfood（B6 或后续）出现「陷阱降级导致 AI 味系统性漏检」的具体退化数据**——届时凭数据重新评估辅助参照是否需要升级，而非凭直觉重提。

## 关联

- 上游：ADR-0006（生成端零负面）/ ADR-0008（schema 软门槛）/ 2.5.5 R1+R2（产品定位 + R1 口子）
- spec：`docs/plans/2026-05-28-goal-b-b5-positive-reading-desire-design.md`
- issue：#98（Goal B B5）
