# NarraCat Prompt 质量评估报告

**评估时间**: 2026-02-20
**评估范围**: 5 个 Agent Prompt + 5 个 Skill + 6 个 Schema
**总体评分**: 7/10 —— 架构一流，关键 Prompt 执行力不足

---

## 一、做得好的部分

### 1. 系统架构设计（9/10）

- 5 个 Agent 职责边界清晰，不踩对方地盘
- Schema 驱动的契约传递（WritingContextPack、ReviewReport）是专业级做法
- Skill SSOT 避免了知识碎片化
- 每个 Agent 的"约束与禁忌"明确画了红线

### 2. continuity-editor 是全系统最好的 Prompt（8.5/10）

- 3 种模式明确分离
- 判定逻辑是硬规则，不可主观覆盖
- 有自检环节（PASS/REVISE/FAIL 一致性校验）
- 审修报告模板精确到字段级

### 3. memory-keeper 简洁高效（8/10）

- 角色单一、工具丰富、流程清晰
- 有好/坏示例对比（事实三元组的好坏例子）
- haiku 模型 + 纯提取任务 = 成本最优

---

## 二、核心问题

### 问题 1：chapter-writer 上下文过载（严重）

这是全系统最致命的问题。chapter-writer 启动时的上下文构成：

```
Agent prompt:           213 行
+ novel-antipattern:    185 行（自动注入）
+ novel-craft:          196 行（自动注入）
+ novel-structure:      201 行（自动注入）
= 约 795 行指令 ← 还没开始写小说
+ WritingContextPack JSON（几百行）
+ 系统 prompt / 框架说明（几百行）
```

**A1 短句排比屡禁不止，根因就在这里。** 那条 ⚠️ 警示位于第 144 行——在 795 行指令中仅占 0.3%。LLM 研究已证实"lost in the middle"现象：开头和结尾的指令遵循率最高，中间段的指令最容易被忽略。

### 问题 2：最关键的写作指导埋在中间

chapter-writer 的信息排列：

```
第 40-46 行   角色定位（读了就忘）
第 56-67 行   输入字段说明（机械化，不需要在前面）
第 71-97 行   工作流程（4 阶段）
第 101-129 行 输出格式（元数据模板）
第 131-164 行 ★ 质量标准 ← 最重要的内容
第 166-173 行 反模式自检
第 175-188 行 Skill 摘要（冗余）
第 190-213 行 约束、记忆、工具（次要）
```

"怎么把小说写好"被夹在"怎么格式化输出"和"禁止做什么"之间。这是 Prompt 工程中典型的**优先级倒置**。

### 问题 3：Skill 摘要与注入内容冗余

chapter-writer 中有 12 行 Skill 摘要（"写作技艺"和"叙事结构"段），但 novel-craft 和 novel-structure 已完整注入上下文。

**摘要不提供新信息，只增加噪声。** 更糟的是，如果摘要的措辞与 Skill 原文有微妙差异，模型要花注意力去"调和"两种表述。

### 问题 4：自检是伪保障

```
## 反模式自检（产出前必须执行）
1. 扫描 blacklist.md 中的高风险词
2. 对照 6 条门禁逐项检查
3. 逐条检查 evaluation_focus high 维度
4. 修正
5. 再确认
```

要求生成内容的同一个模型来客观审查自己的产出——研究表明这极不可靠。模型对自己刚生成的文本有强烈的确认偏误。这 5 步看似严谨，实际效果远不如外部审校（continuity-editor）。把它写在 Prompt 里给了一种虚假的安全感。

### 问题 5：没有优先级栈

chapter-writer 里充斥着"严格"、"必须"、"不可"：

- `chapter_outline`——**不可偏离**
- `style_guidance`——**严格遵循**
- `continuity_warnings`——**必须回应**
- `evaluation_focus`——**主动关注**
- 反模式——**产出前必须执行**

当一切都是"最高优先级"，就等于没有优先级。模型在 795 行中看到 10+ 个"必须/严格"，无法判断哪个真正最重要。

### 问题 6：outline-architect 和 world-curator 偏弱

| Agent | 行数 | 问题 |
|---|---|---|
| outline-architect | 170 | 工作流程手法模糊（"分析核心冲突"——怎么分析？用什么框架？） |
| world-curator | 164 | 缺乏矛盾检测的具体步骤（"检测矛盾"——检测什么？怎么检测？） |

对比 continuity-editor 的具体程度（"novel_chapter_summary(from=N-3, to=N-1)"、"总分 ≥7 → WARNING"），这两个 Agent 的流程描述更像是需求文档而不是操作手册。

---

## 三、上下文统计

### Agent Prompt 行数

| Agent | 行数 | 模型 | 注入 Skill 行数 | 总上下文 |
|---|---|---|---|---|
| chapter-writer | 213 | opus | 582（3 Skills） | ~795 |
| continuity-editor | 285 | sonnet | 582（3 Skills） | ~867 |
| outline-architect | 170 | opus | 201（1 Skill） | ~371 |
| world-curator | 164 | sonnet | 196（1 Skill） | ~360 |
| memory-keeper | 153 | haiku | 0 | ~153 |

### Skill 内容行数

| Skill | SKILL.md | references/ | 总计 |
|---|---|---|---|
| novel-antipattern | 185 | 112 | 297 |
| novel-craft | 196 | 0 | 196 |
| novel-structure | 201 | 0 | 201 |
| novel-memory | 46 | 110 | 156 |
| novel-style | 74 | 113 | 187 |

---

## 四、改进方向建议

| 优先级 | 方向 | 具体措施 | 预期效果 |
|---|---|---|---|
| **P0** | 重构 chapter-writer 信息排列 | 把 3 条最关键指令放到 Prompt 最顶部（角色定位之后、其他一切之前） | 直接提升写作质量，缓解 A1 等问题 |
| **P0** | 删除冗余 Skill 摘要 | 删除 chapter-writer 中"写作技艺"和"叙事结构"摘要段（12 行） | 减少噪声 |
| **P1** | 评估 Skill 注入必要性 | novel-structure 是否真的需要注入 chapter-writer？写手需要理解 tension_level，但不需要大纲规划规则 | 减少 ~200 行上下文 |
| **P1** | 弱化自检、强化审校 | 自检改为"写作时意识"而非"产出后检查"；明确审校才是质量关卡 | 认知诚实，减少无效步骤 |
| **P1** | 建立优先级栈 | 在 chapter-writer 顶部设置 3 条"铁律"，其余指令降级为参考 | 解决"一切都重要=什么都不重要"问题 |
| **P2** | 补强 outline-architect | 增加具体的分析框架和决策步骤 | 提升大纲规划一致性 |
| **P2** | 补强 world-curator | 增加矛盾检测的具体步骤和判定标准 | 提升世界观一致性 |

---

## 五、关键认知

1. **信噪比比总量更重要。** 795 行指令中，真正影响写作质量的不超过 30 行。其余都是格式、流程、约束——重要但不紧急。
2. **"lost in the middle" 是 LLM 的已知弱点。** 最关键的指令应该在 Prompt 的最前面或最后面，不能埋在中间。
3. **同模型自检不可靠。** 同一个 LLM 对自己产出的文本有确认偏误。外部审校（不同 Agent、不同模型实例）才是真正的质量关卡。
4. **Skill 全量注入有副作用。** Skill 设计为渐进式加载（SKILL.md 核心 + references/ 按需），但 Agent 的 skills: 声明会全量注入 SKILL.md，使参考文档变成了前置指令。
5. **"必须"通胀。** 当 Prompt 中有 10+ 个"必须/严格/不可"时，每个的实际权重都在下降。需要明确的优先级分层。
