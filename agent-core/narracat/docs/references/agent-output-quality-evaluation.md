# AI Agent 输出质量验证：业界调研

> 日期：2026-02-20
> 用途：NarraCat Agent/Skill 质量验证方案设计的参考依据

## 核心结论

1. **无银弹**：业界共识是多层防线组合，没有单一方案能解决所有问题
2. **LLM-as-Judge 是主流**：53.3% 的团队采用，与人类一致性约 80%
3. **创意写作是最难自动化评估的领域**：推荐 AI + 人类混合评估
4. **评估基准数据（ground truth）是核心瓶颈**：没有基准就无法校准任何评估器
5. **生产监控不可替代**：预部署评估无法完全覆盖生产场景

## 一、主流方法论

### 1.1 LLM-as-Judge

用一个 LLM 评估另一个 LLM 的输出。

**做法：**
- 定义明确的评分标准（rubric），每个维度 0-3 或 Pass/Fail
- 用 chain-of-thought 让 judge 先推理再打分
- 提供好/坏示例（few-shot）校准评分尺度

**已知局限：**
- 位置偏见：倾向于给排在前面的答案更高分
- 冗长偏见：更长的回答容易获得更高评价
- 自我增强偏见：模型倾向于认可自己风格的输出
- 语义等价的 prompt 微调措辞后，评分结果会变化

**最佳实践：**
- 用二元或低分值（0-3）评分，不用 1-10
- 每个维度单独评估，不要一次评多个维度
- 必须用人类标注的 ground truth 校准

**参考来源：**
- [LLM as a Judge: 2026 Guide](https://labelyourdata.com/articles/llm-as-a-judge)
- [LLM-as-Judge Best Practices (Monte Carlo)](https://www.montecarlodata.com/blog-llm-as-judge/)
- [Evaluating LLM Evaluators (Eugene Yan)](https://eugeneyan.com/writing/llm-evaluators/)

### 1.2 Agent-as-Judge

不只看最终输出，让一个 Agent 审查另一个 Agent 的完整行动链——每一步的工具选择、推理过程、决策依据。

传统评估把 Agent 当黑盒只看结果，无法定位"为什么失败"。Agent-as-Judge 审查整个决策轨迹。

**参考来源：**
- [When AIs Judge AIs: Agent-as-a-Judge (arxiv)](https://arxiv.org/html/2508.02994v1)

### 1.3 Trace-Level 评估

两层评估：
- **End-to-end**：最终任务是否完成？
- **Step-by-step**：每一步工具选择对不对？检索结果相关吗？子 Agent 分流正确吗？

生产环境中捕获完整 trace（每个 LLM 调用、工具调用、耗时、token 数），失败时可从任务级钻到具体步骤。

关键实践：生产中低于阈值的 trace 自动回流为回归测试用例。

**参考来源：**
- [AI Agent Evaluation Framework (Braintrust)](https://www.braintrust.dev/articles/ai-agent-evaluation-framework)
- [Evaluating Agents with Trace-Driven Insights (Braintrust)](https://medium.com/@braintrustdata/evaluating-agents-with-trace-driven-insights-9ad3bfed820e)

### 1.4 Amazon 三层评估模型

| 层级 | 评估对象 | 方法 |
|---|---|---|
| 最终输出 | Agent 的最终答案/产出 | 任务完成率、准确率 |
| 组件级 | 每个组件（检索、工具调用） | 工具选择准确率、检索相关性 |
| 底层模型 | 驱动 Agent 的 LLM 本身 | 指令遵循率、推理能力 |

核心经验：
- 预部署评估无法完全覆盖生产场景，必须有持续的生产监控
- 分析失败时，可视化 Agent 的完整轨迹并逐步标注 PASS/FAIL 是最有效的方法

**参考来源：**
- [Amazon Agentic AI Evaluation Lessons](https://aws.amazon.com/blogs/machine-learning/evaluating-ai-agents-real-world-lessons-from-building-agentic-systems-at-amazon/)

## 二、创意写作专项评估

### 2.1 WritingBench（2025）

目前最全面的写作评估基准：
- 覆盖 6 大写作域、100 个子域
- 提出**查询依赖评估**：不用固定标准，而是根据写作任务动态生成评估维度
- 训练了专门的 critic model 做 criteria-aware 打分

**对 NarraCat 的启示：** 评估维度不应固定，应根据每章的上下文（场景类型、张力级别、角色数量）动态调整评估重点。

**参考来源：**
- [WritingBench (arxiv)](https://arxiv.org/html/2503.05244v2)

### 2.2 EQ-Bench Creative Writing

专门评估长篇小说写作：
- 评估维度：主题连贯、文本清晰度、解读深度、美学质量
- 结论：AI 评估创意写作存在固有局限，推荐 AI + 人类混合评估

**参考来源：**
- [EQ-Bench Creative Writing Leaderboard](https://eqbench.com/creative_writing_longform.html)

### 2.3 Creative Writing v3

专注于压力测试创意小说写作，寻找模型的断裂点并排名其稳健性。Judgemark v2 测量模型对短篇小说输出的数值评分能力，使用正/负标准的详细 rubric。

**参考来源：**
- [Creative Writing v3 (AI Wiki)](https://aiwiki.ai/wiki/Creative_Writing_v3)

## 三、工具生态

| 工具 | 定位 | 特点 | 适用场景 |
|---|---|---|---|
| DeepEval | 开发阶段 | 类 pytest 的 LLM 单元测试框架，可写语义断言 | CI/CD 集成 |
| Braintrust | 开发+生产 | Trace 级评估 + 生产监控 + 失败用例自动回流 | 全生命周期 |
| Evidently AI | 生产监控 | 数据漂移检测，输出质量持续监控 | 上线后监控 |
| Inspect AI | 研究级 | UK AI Safety Institute 开发，支持 Agent 级评估 | 安全评估 |

**参考来源：**
- [DeepEval (GitHub)](https://github.com/confident-ai/deepeval)
- [Braintrust](https://www.braintrust.dev)
- [LLM Evaluation Framework (Evidently AI)](https://www.evidentlyai.com/blog/llm-evaluation-framework)
- [LLM Evaluation Tools 2026](https://research.aimultiple.com/llm-eval-tools/)

## 四、对 NarraCat 的映射分析

### 现有架构与业界方法的对应

| 业界方法 | NarraCat 对应 | 现状 | 差距 |
|---|---|---|---|
| LLM-as-Judge | continuity-editor 审校 | 已有 | 缺乏与人类标注的校准 |
| Agent-as-Judge | — | 无 | 无独立的全链路审查者 |
| Trace-Level 评估 | — | 无 | 无 Agent 执行 trace 记录 |
| 确定性规则检查 | Hook（部分） | 有框架无实现 | blacklist/GATE 可脚本化 |
| 生产监控 | — | 无 | 无跨章节质量趋势追踪 |
| 人类校准 | 用户反馈 | 隐式 | 无结构化反馈收集 |

### 可行的分层验证策略

**第一层：确定性规则检查（脚本/Hook）**

Skill 中约 30-40% 的规则可确定性检测：
- novel-antipattern GATE-6："X的，Y的"格式 → 正则匹配
- novel-antipattern blacklist.md 高风险词 → 关键词扫描
- ChapterMetadata 9 个必填字段 → JSON Schema 校验
- 字数范围 → 数值检查
- opening_type 相邻 3 章不重复 → 结构化数据比对
- tension_level 连续 3 章 ≤2 → 数值模式检测

实现方式：PostToolUse Hook on Write 或独立校验脚本。

**第二层：现有审校循环（已有，可强化）**

continuity-editor 对 chapter-writer 的五维度审校。强化方向：
- 审校报告引用具体 Skill 编号（如 "novel-antipattern A1"）
- 确保审校维度与 Skill 条目一一对应

**第三层：AI-as-Judge 抽检（可新建）**

独立评估 prompt，不在生产流程中，专门用于质量抽检：
- 输入：章节正文 + Skill 内容
- 输出：逐条 Skill 规则的符合度打分（0-3）
- WritingBench 启示：评估维度可根据章节上下文动态调整

**第四层：人类校准 + 反馈闭环**

- 结构化收集用户修改反馈
- 用户修改过的内容 vs 原始输出 = 隐式 ground truth
- 反馈回流到 Skill/Agent prompt 改进

## 五、WritingBench 动态评估维度适配 NarraCat

### 5.1 WritingBench 核心机制

WritingBench（2025，阿里 X-PLUG）是目前最全面的写作评估基准，核心创新：

```
写作任务（query）→ LLM 动态生成 5 条评估标准（name + description + scoring rubric）→ Critic Model 逐条打分（1-10）+ 理由 → 汇总
```

- 覆盖 6 大写作域、100 个子域
- 动态标准达 83% 人类一致性，远超固定标准（65%/59%）
- 训练了专门的 Critic Model（Qwen-7B fine-tuned）做 criteria-aware 打分

核心洞察：**评一章对峙场景和一章独处旅途，侧重点本来就不同。** 固定标准要么太泛（无区分度），要么太细（不相关维度干扰判断）。

参考来源：
- [WritingBench (arxiv)](https://arxiv.org/html/2503.05244v2)
- [WritingBench (GitHub)](https://github.com/X-PLUG/WritingBench)

### 5.2 NarraCat 的上下文优势

WritingBench 的 query 是一段写作指令。NarraCat 的 WritingContextPack 包含远更丰富的结构化上下文：

| 上下文信号 | 提取自 | 驱动的评估重点 |
|---|---|---|
| 场景人数 | active_characters 数量 | 多人→对话差异化权重↑；独处→行动叙事权重↑ |
| 场景类型 | chapter_outline 关键词 | 对峙→冲突对话+潜台词；行动→节奏+动作描写 |
| tension_level | 大纲标注 | ≤2→铺垫质量+伏笔埋设；≥4→事件密度+情感冲击 |
| 伏笔指令 | active_foreshadowing.instruction | 有"本章应揭示"→伏笔处理成为独立评估维度 |
| 角色矛盾 | active_characters.inner_conflict | 有矛盾角色出场→矛盾体现成为评估维度 |
| 位置 | 卷首/卷中/卷末 | 卷首→钩子；卷末→收束+悬念 |

### 5.3 适配设计：evaluation_focus

在 WritingContextPack 中新增 `evaluation_focus` 字段，由 continuity-editor 预检时根据上下文信号动态生成 3-5 条评估标准。

每条标准包含：
- `dimension`：评估维度名
- `weight`：权重（high/standard）
- `criteria`：具体判定标准和阈值
- `skill_ref`：对应 Skill 章节引用（如 novel-craft §1.3），替代 WritingBench 的内联 scoring rubric，遵循 Skill SSOT 原则

> **与 WritingBench 的差异：** WritingBench 每条标准含 1-10 分的内联评分量表。NarraCat 采用 `skill_ref` 引用已有 Skill 中的标准，避免重复定义。判定粒度为二元（达标/未达标）+ weight 映射严重级别（high→MAJOR, standard→MINOR），而非 1-10 打分。当前阶段这一简化足以驱动写手关注 + 审校检查的闭环。

**写手看到 evaluation_focus → 知道本章会被重点评什么 → 主动关注**
**审校用 evaluation_focus → 固定 5 维度 + 动态 3-5 维度 = 更精准的审校**

### 5.4 动态标准生成示例

**多人对峙，tension_level=4，有伏笔揭示：**
1. 对话差异化（高权重）
2. 冲突升级/不可逆选择（高权重）
3. 伏笔揭示完成度（高权重）
4. 信息控制（标准权重）
5. 剧情密度（标准权重）

**独处旅途，tension_level=2，无伏笔指令：**
1. 行动叙事（高权重）
2. 环境描写负重（高权重）
3. 铺垫质量（标准权重）
4. 对话控制 ≤10%（标准权重）
5. 章尾钩子（标准权重）

### 5.5 常驻维度

无论章节类型，以下维度始终包含在 evaluation_focus 中：
- **句式多样性**（novel-antipattern A1）：短句排比是最高频的 AI 写作痕迹，必须每章检查
