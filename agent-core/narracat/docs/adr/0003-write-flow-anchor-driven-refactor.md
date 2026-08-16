# ADR-0003: /write 流锚点驱动重构 — 砍写前预检 + chapter-writer 阶段零锚点 + 审修端 2 维度

**日期**: 2026-05-20
**状态**: 已确认（阶段 1 待实施）
**触发**: 用户反馈"流程编排过度复杂导致速度慢 + 上下文太长 AI 发挥不出能力"，grill-with-docs 复盘
**关联**: ADR-0001（Skill 注入分层搁置）、ADR-0002（墙钟优化方向调整）

## 背景

`/narracat:write` 是 NarraCat 的核心循环：写前预检 → 正文生成 → 写后审修 → 记忆更新。当前编排在用户实测中暴露两个症状：

1. **速度慢**：每章 3-5 分钟。ADR-0002 已确认墙钟瓶颈在 LLM 推理本身（MCP 调用层杠杆耗尽）
2. **质量像 AI**：成品读起来"指标都达标但没有令人难忘的镜头"。已迭代 2.1.0 / 2.2.0 / 3.0.0 三轮防 AI 化优化，撞墙

grill-with-docs 复盘把两个症状解耦后定位到**共同祖先**：

> **chapter-writer 的"创作启动条件"是「信息字段大杂烩 + 50+ 规则清单」，缺一组统摄性的创作锚点驱动整章。**

四个具体症状都从这个根派生：

- 评估端有 6 维度 + 9 维度 AI 量表 + evaluation_focus 三层细密标准；创作端拿到的是"短句排比 ≤2 组 / 回避 ≤2 次"这种**反向约束**
- chapter-writer 同时持守 50+ 条规则，单章 5000 字 = 30+ 次内部自检 round，注意力被打碎
- style_reference 是 2-3 个片段技法库，不足以建立"整章语感"
- chapter-writer 知道审修盯着，自带"过审思维"，退化为保守写法

更关键的是发现一条**链路断裂**：`emotional_stakes` / `dramatic_focus` / `value_shift` 三个"目标态字段"已经在 OutlineStructure schema 中被标记为 required，并由 outline-architect 在 plan 阶段写入 ch-NNN.md。但 WritingContextPack schema **没有把它们抽到顶层结构化字段**，chapter-writer prompt **也没有"优先消费这些作为锚点"的指令**——上游种下的"目标态驱动"基因，下游没激活。

## 评估的选项

| 选项 | 描述 | 评估 |
|---|---|---|
| A | 砍掉 continuity-editor 写前预检 + chapter-writer 自主消费数据 + 自主合成锚点 | **选中** |
| B | 保留写前预检但极度瘦身（只做数据聚合 + 跨章预警 + 核心体验合成） | 中介翻译损失仍在 |
| C | 不动预检 agent，仅修复链路断裂（WritingContextPack 加 emotional_stakes 字段 + chapter-writer prompt 改写） | 中介损失 + 过审思维仍在；改动小但杠杆弱 |

A 的核心论据：

- 写前预检 70% 工作是数据搬运（无需 sonnet）或有损耗的中介推断（chapter-writer 自己做更具体）
- evaluation_focus 是"给审修员看的"，但 prompt 让 chapter-writer 也看到了——直接强化"过审思维"
- 真人作家的工作方式是"自己拿大纲、自己消化、自己写"，不是"先有编辑给我准备一份上下文包"
- 砍掉省 1 个 sonnet round ≈ 20-40 秒/章（ADR-0002 后**唯一还剩的墙钟杠杆**）

## 决策

**采纳选项 A，分两阶段实施。**

### 阶段 1（本 ADR 范围内，可直接落地）

| # | 改动 | 收益 |
|---|---|---|
| ① | 砍 continuity-editor 写前预检模式 | 省 1 个 sonnet round |
| ② | 主会话纯代码做数据聚合（MCP `novel_writing_context` + Read，无 LLM） | 取消中介翻译损失 |
| ③ | chapter-writer 阶段零：显式锚点声明 + 拒写机制 | 锚点驱动整章，模糊锚点下游拦截 |
| ④ | 审修端重组为 2 维度判定：①锚点兑现度 ②高频陷阱（GATE 一级 + 主角回避） | 闭环锚点机制，rubric.md / blacklist.md 降为问题定位工具 |
| ⑤ | evaluation_focus 不再输出给 chapter-writer | 消除"过审思维"源头（H4） |
| ⑥ | 跨章预警物化为结构化字段（纯代码扫描 previous_chapter_briefs） | 不需要 LLM 评估，从 sonnet 中介迁出 |
| ⑦ | **保留 antipattern Skill 注入** | 0b0221b A/B 数据驱动（新版 0/27 命中 vs 旧版 5/27） |
| ⑧ | 删 chapter-writer prompt 内"每段写完扫 5 个宏观签名"指令 | 保留章末扫 GATE + 3 个高频陷阱潜意识预警；in-flight 30+ 次自检的注意力打碎被消除 |
| ⑨ | 锚点完整闭环：ChapterMetadata 加 `creative_anchor` 字段 + memory-keeper 入库 ChapterBrief 扩展列 + `novel_writing_context` 返回 `previous_chapter_anchors` | 支持锚点回溯诊断（连续 3 章锚点泛泛 → 提示 outline 整体质量低） |

### 阶段 2（独立 A/B 实验，本 ADR 不强制）

```
移除 chapter-writer 的 antipattern 注入
A/B 验证路径 A 阶段 1 的锚点驱动 + 审修端重组 是否能替代 antipattern 注入的防御作用
```

阶段 2 触发条件：阶段 1 落地后实测锚点机制有效（chapter-writer 输出的锚点声明具体、审修端能稳定判定锚点兑现），单独跑 A/B 测试。

## 理由

### 为什么砍预检而不是瘦身

写前预检 7 项工作的真实需求重新归类：

- 数据搬运（30%）→ 主会话纯代码可做
- 有损耗的字段推断（30%）→ chapter-writer 写到那一段时知道得更具体，**LLM 中介翻译必然损耗**
- 跨章预警（30%）→ 可以物化为结构化字段（字符串相似度 / 关键词重合度 / MCP 直接返回），纯代码可做
- evaluation_focus 生成（10%）→ **结构性错误**，应该删除而不是保留

70% 工作不需要 sonnet 中介。瘦身预检 = 留着一个空壳 agent，路径 B 的中介翻译损失依然在。砍掉是更彻底的解药。

### 为什么保留 antipattern 注入

0b0221b 提交带有明确 A/B 数据：

```
新版（含 antipattern + 自检节）：0/27 AI 模式命中
旧版（仅 novel-craft）：5/27 AI 模式命中
旧版命中：A6 章末伪文学 / C1 信息倾倒 / D3 通用环境 / F1 叙述者代位 / H1 伪深沉
```

这个数据是在**旧架构下**测得——没有锚点驱动、没有审修端重组。路径 A 阶段 1 是否能替代 antipattern 注入的防御作用是**未经验证的假设**，不能跟主架构改动绑定。把"移除 antipattern 注入"作为独立的阶段 2 实验，是数据驱动而非直觉驱动的做法。

### 为什么删"每段扫 5 个宏观签名"但保留 antipattern Skill 注入

两件事独立：

- **Skill 注入**是给 LLM 提供"知识"——5 个宏观签名 + 26 反模式 + GATE + blacklist 词表都在 chapter-writer 的上下文里"备用"
- **prompt 内"每段扫描"指令**是要求 LLM "做 30+ 次自我审查"——这是 H2（规则过载）和 H4（过审思维）在 prompt 层的直接体现

删 prompt 内显式扫描指令 = 创作流不被打碎；保留 Skill 注入 = LLM 仍知道反模式存在。两者结合：心理预警 + 章末检查 + 审修扫描三层兜底，不需要 in-flight 扫描。

### 为什么锚点要完整闭环 D4

锚点的长期价值不仅是当章创作驱动，更是**跨章诊断信号**：

- 审修端读到前 3 章锚点都"角色受到打击 / 内心震动"这种模糊描述 → 不是单章问题，是 outline 整体质量低 → 升级提示用户回 /plan 整体细化
- chapter-writer 合成本章锚点时看到前 3 章锚点 → 主动选择不同的视角（不是又一个"信任崩塌"）

D4 改动面相对大（schema + MCP 工具 + migration），但下游能力的乘数效应明显。

## 何时重提

当下列任一条件成立时，应重新评估本 ADR：

- **锚点机制效果未达预期**：chapter-writer 阶段零输出的锚点声明在实测中持续泛泛、拒写率过高、或锚点声明无法可靠对应整章产出 → 路径 A 假设失效，需重新设计
- **审修端 2 维度过简导致质量下限松动**：评估"锚点兑现"过于主观，AI 化章节通过率反升 → 需补强审修维度
- **阶段 2 A/B 实验显示 antipattern 注入仍然必要**：路径 A 阶段 1 落地后跑 A/B，移除 antipattern 后 AI 化反弹 → 锁定保留注入并记入版本
- **新的目标态字段被发现**：除 emotional_stakes / dramatic_focus / value_shift 外，发现其他更能驱动创作的字段 → 扩展锚点合成依赖

## 不在本 ADR 范围内的相关工作

- ADR-0001（Skill 注入分层搁置）继续维持
- ADR-0002（墙钟优化方向调整）继续维持；本 ADR 的速度收益（省 1 个 sonnet round）是阶段 1 的副作用，不构成对 ADR-0002 的反驳
- 步骤 5.5 轻审复查的去留作为实施阶段细节决定（默认删除，REVISE 频率下降后多余）
- 主会话纯代码数据聚合的具体形态（内嵌 write.md 还是抽 helper）作为实施阶段细节决定
- 跨章预警纯代码扫描的具体规则（相似度阈值、伏笔间隔）作为实施阶段细节决定
