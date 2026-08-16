# ADR-0006: chapter-writer 不注入 novel-antipattern（accepted）

**日期**: 2026-05-22
**状态**: accepted —— 与 R1 改造同次提交落地
**触发**: `/zoom-out` 评审 v2「关键发现 1」—— main 上 chapter-writer 注入 novel-antipattern 与业界共识及学术证据**相反**
**关联**:
- 评审过程与第二轮 4 路调研材料（商业产品 prompt 反向工程 / 头部网文作家工作流 / 开源项目调研 / 学术界 long-form generation）
- 与 ADR-0003（写作流锚点驱动重构）相容：阶段零锚点声明是生成端的**正向约束**机制，本 ADR 进一步移除生成端的**负向约束**
- 与历史 3.0.0 分支决策一致——MEMORY.md 顶部澄清"3.0.0 是分支代号未发布，commit 0b0221b 部分回退使 antipattern 移除决策在 main 上失效"。本 ADR 正式落地该决策并把"不可重开"写进议程

## 背景

NarraCat 的 `novel-antipattern` Skill 是一份系统化的"反 AI 化"知识库：8 类 26 子项反模式（A 句式 / B 信息控制 / C 角色 / D 修辞 / E 情绪 / F 描写 / G 行为模式 / H 章末 / I 跨章 ⟳ 模式）+ blacklist.md 禁词词表 + rubric.md 9 维度评分表。

2.4.x 之前，`novel-antipattern` 同时注入到 **chapter-writer（生成端）** 与 **continuity-editor（审修端）**。3.0.0 分支项目曾决定把 chapter-writer 的 skills 列表精简为只保留 novel-craft（即"craft-first 再平衡"），但分支合并时 commit `0b0221b` 部分回退使该决策未在 main 上生效——这一回退本身没有立 ADR，导致 2.5.x 期间的多次评审反复提"是否要做"。

`/zoom-out` 评审 v2 第二轮调研给出了** 6 条独立的反向证据**（详见下节），且任务 3 实测确认 main 上 `agents/chapter-writer.md` frontmatter `skills:` 仍含 `novel-antipattern`，prompt body 中 GATE-3/4/5 自检章节 + "写作中高频陷阱预警"章节强耦合 antipattern 编号引用（A1 / A4 / A6 / E1 / E2 / G1 / H1 / H2）。

## 评估的选项

1. **方案 A：chapter-writer 移除 novel-antipattern + 清理 antipattern 编号引用（采纳）**
   - frontmatter `skills:` 删除 `novel-antipattern` 一行
   - prompt body 删除"章末自检 GATE"和"写作中高频陷阱预警"两节
   - "内嵌门禁（2 道）"中 GATE-2 / GATE-5 改写成正向引用 novel-craft §1.3 / §6.5
   - 锚点优先原则中"antipattern Skill 红线"提及移除
   - novel-antipattern Skill 文件本身不动，continuity-editor 仍注入
   - 优：与 6 条反向证据全部对齐；与 ADR-0003 阶段零锚点声明的"正向约束"哲学一致
   - 劣：失去 chapter-writer 的"事后 GATE 自检"能力，但该能力本就是粉色大象问题的源头

2. **方案 B：保留生成端注入，但把 antipattern 内容改写为正向版本**
   - novel-antipattern Skill 全面改写为"do X instead of Y"的正向句式
   - chapter-writer 仍注入
   - 优：保留"反 AI 化"维度的细颗粒
   - 劣：novel-craft §1-8 已经从正向角度覆盖等价内容（A1/A4/A6 → §6.2/§8.3 + 铁律 3；E1/E2 → §4.1/§4.4；H1/H2 → §6.5；G1 → §1.3）——重写 antipattern 为正向版本是 novel-craft 的复制品，违反 SSOT
   - 劣：审修端仍需要"识别已生成文本是否命中负面模式"的能力，等价的负面知识无法消除，只是搬到了 craft 里反而模糊职责

3. **方案 C：保持现状**
   - chapter-writer 继续注入 antipattern
   - 优：零改动
   - 劣：与 6 条反向证据全部冲突；MEMORY.md 已记录的"3.0.0 决策"长期处于"已决定但未生效"的灰色状态

## 决策

实施 **方案 A**。

### 决策范围

- **生效**：chapter-writer 不注入 novel-antipattern Skill，prompt body 不引用 antipattern 编号
- **不动**：continuity-editor 仍注入 novel-antipattern——审修端是判定已生成文本是否命中负面模式（识别任务），与生成端"指示创作时回避负面模式"（条件生成任务）是两类不同的 LLM 工作，粉色大象问题只发生在后者
- **不动**：novel-antipattern Skill 文件本身（含 references/blacklist.md / references/rubric.md）作为审修端 SSOT 保留
- **副产品**：README 的 Skill 知识库表格"novel-antipattern 注入到 chapter-writer, continuity-editor"行同步改为"注入到 continuity-editor"

### 不可重开议题

未来架构 review 若提出"是否给 chapter-writer 加回 novel-antipattern"，本 ADR 是直接挡回的依据，**无需重新讨论**。重开条件仅限于：

1. LLM 模型架构对负面 prompt 的响应发生本质变化（如未来出现专门 fine-tune 过的"对 NOT 指令也强遵循"的模型族），且有学术/工业级量化证据
2. NarraCat 内部 dogfood 出现**生成端缺负面知识**导致的具体质量退化数据（不是直觉判断），且证明 novel-craft 正向覆盖不足

## 理由

### 6 条反向证据（按证据等级）

| 等级 | 来源 | 关键数据 / 表述 |
|---|---|---|
| 学术 RCT | Semantic Gravity Wells, [arXiv 2601.08070](https://arxiv.org/pdf/2601.08070) | 负面指令在 **87.5% 启动失败案例中反而激活目标词**；失败案例的抑制信号比成功案例**弱 4.4 倍**（5.2pp vs 22.8pp） |
| 学术辅证 | Pink Elephant Problem ([eval.16x.engineer](https://eval.16x.engineer/blog/the-pink-elephant-negative-instructions-llms-effectiveness-analysis)) + KAIST 大模型负面指令研究 | 大模型在"don't do X"指令上反而比小模型表现更差 |
| 官方建议 | Anthropic Prompt Engineering Guide | "Tell Claude what to do instead of what not to do" |
| 官方建议 | OpenAI Community Docs | "Usually it is not recommended to use negative prompting"（文本模型不内建支持） |
| 商业产品 | Sudowrite ([blog](https://sudowrite.com/blog/what-is-sudowrite-muse-a-deep-dive-into-sudowrites-custom-ai-model/) + [best-story-writing](https://sudowrite.com/blog/best-story-writing-for-fiction-in-2026/)) | Muse 通过**训练数据 curation** 规避 cliche（"a tapestry of"、"azure orbs"），**不在 prompt 列禁词**；用户实测 2000 字"不要"指令仍被违反 |
| 商业产品 | NovelCrafter ([prompt-functions docs](https://www.novelcrafter.com/docs/ai/prompt-functions/)) | 不内置 blacklist，留给用户在 codex global 自配 |
| 行业现状 | 9 个开源小说 Agent 项目调研（含 AI_NovelGenerator 5000+ star / NovelForge / AIStoryWriter / GOAT / libriscribe / xindoo 等） | **只有 NarraCat 在生成端系统化注入负面清单**——其他项目要么不做（默认 LLM 自带文风），要么靠人工返工 |

### 正向覆盖度验证（任务 5）

被删除的 GATE 自检引用的 antipattern 编号，全部在 novel-craft 中已有等价正向覆盖：

| antipattern 编号 | novel-craft 正向覆盖 |
|---|---|
| A1 短句排比 / A4 同构句 / A6 伪文学短句 | §6.2 高潮段落短句排比的正确使用场景 + §8.3 不对称与不规则 + chapter-writer 铁律 3 "句式服务剧情与风格" |
| E1 / E2 情绪命名词 | §4.1 "读者应该从角色的行为变化中推断情绪，而非被告知" + §4.4 信息自足原则 |
| H1 / H2 章末点题升华 / 伪深沉短句收束 | §6.5 结尾技法（6 种正向选项） |
| G1 主角面对疑点的"按下不表" | §1.3 克制过度警告 + 重复行为模式的表达多样化 |

故移除生成端 antipattern 注入不会丢失关键写作约束。

### 与 ADR-0003 的哲学一致性

ADR-0003 路径 A 引入"阶段零锚点声明 + 锚点不具体则拒写"机制——这是**正向约束**：要求生成端在写作前显式承诺 emotional_stakes / dramatic_focus / value_shift / dramatic_tempo / scene.pressure_point 五项。本 ADR 移除生成端负向约束（antipattern GATE 自检），与 ADR-0003 在"生成端只用正向约束"这一哲学上一致。

## 实施状态

2026-05-22 与 R1 改造同次提交合并落地。改动面：

| 文件 | 改动 |
|---|---|
| `agents/chapter-writer.md` | frontmatter `skills:` 移除 `novel-antipattern`；删除"章末自检"+"写作中高频陷阱预警"两节；"内嵌门禁（2 道）"改写为引用 novel-craft §1.3/§6.5；锚点优先原则移除 antipattern Skill 提及 |
| `docs/adr/0006-antipattern-injection-position-accepted.md` | 本 ADR 立项 |
| `README.md` | Skill 知识库表格 novel-antipattern 注入列从 "chapter-writer, continuity-editor" 改为 "continuity-editor" |

## 不在本 ADR 范围内的相关工作

- continuity-editor 是否需要精简 9 维度审修（评审 v2 结论 4 提及"维度切换损失精度"）—— 独立议题
- novel-antipattern Skill 内部章节是否要合并精简（D5 修辞密度、B5 解释性追加等子项的颗粒度）—— 独立议题
- chapter-writer 关键约束是否要从 prompt 头部移到末尾（评审 v2 改造 R3，借鉴 AI Dungeon Author's Note / SillyTavern Post-History 的"位置即权重"机制）—— 独立改造，未来执行
