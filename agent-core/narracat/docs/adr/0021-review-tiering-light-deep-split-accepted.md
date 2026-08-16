# ADR-0021: 审校档位化——轻审/深审双 agent 拆分（accepted）

**日期**: 2026-06-06
**状态**: accepted —— 实施排程在 #212 整链终判 verdict 归档之后（避免污染链终点新臂）
**触发**: 对比报告 `docs/report/2026-06-06-prompt-reference-comparison.md` §3.2 + 注入实测：continuity-editor 启动注入 ≈196KB（agent 本体 74.7KB + 5 skill 121KB），为写手端 2.3 倍；11 个辅助维度多为 finding-only（不触发任何路由动作），每章全量评估的注意力成本与产出不成比

## 背景

审校端经多轮加法（reading_desire 5 sub 评分机器、钩子机制细查、叙述者腔调兑现度、服务性丰盛度、四结构节点兑现、反模式 GATE checkpoint）后，默认每章全量运转一套以 finding-only 产出为主的评估机器。与 reading_desire「80 分草稿定位、风格层不让 LLM 反复 retry」哲学相比，评估投入与路由产出失衡。外部参考佐证：废柴框架的 4 类检查全部为用户按需触发命令，无默认全量审。

框架约束：Claude Code agent 的 `skills:` 为 frontmatter 静态声明、Subagent 启动时全量注入——「按档位注入」无法靠 prompt 分支实现，prompt 写「轻审模式跳过 X」只省注意力不省注入；且单项最大的是 agent 本体本身，评分方法论全在本体里。

## 决策

1. **两档术语**：**轻审**（Light review）= 写作主流程每章默认档，管「别断、别错」；**深审**（Deep review）= 按需专项档，管「更好看」。废除原「轻审复查」名称（其 /review 完整复查语义由深审吸收）。术语已登记仓库根 CONTEXT.md。
2. **切分线**：
   - 轻审保留：锚点兑现度（唯一 FAIL 主维度，含 ② heartbeat 放写地板）、③ 章末零设计地板（客观二元）、Still-revise 硬合同全套（硬连续性 / 照搬 BLOCKING / 字数 / 场面可执行性 / Metadata）、辅助维度中的角色一致性 / 时间线 / 伏笔动作合规 / 伏笔密度（MCP 纯读数）/ 字数 / 场景兑现度（大纲 scenes[] 契约对账）、读者理解性 finding（ADR-0019）。
   - 深审承载：**reading_desire 评分整层**（total_score + 5 sub_scores + failure_attribution——评分机器依赖的腔调兑现度 / 服务性丰盛度 / 钩子机制细查知识随评分走）、反模式全套 + GATE checkpoint、风格分析（原模式四）、人物动线、名场面 / 中点翻转 / 困境层级 / 转折类型四条件维度、爽点设计 finding。
3. **双 agent 拆分**：continuity-editor 瘦身为轻审门禁 agent（保留级联影响分析——连续性本职，/rewrite 依赖）；新增 **craft-reviewer** 承载深审（评分机器 + 反模式 + 风格分析）。两 agent 各自静态声明所需 skills，本体与注入双重真减法。共享语义（WCP 加载合同、Protect 清单）经 docs/contracts/ 复用。
4. **触发机制**：深审仅用户命令触发；`/review <章号|范围|卷>` 成为深审唯一入口，默认全套，首版不做维度菜单、不做每 N 章自动抽查（范围参数天然覆盖抽查用法）。
5. **产物与 schema**：深审报告落 `reviews/ch-NNN-deep-review.md`（新文件，App Workbench 契约扩展），**不产 JSON 孪生**——孪生按 ADR-0012 是路由 SSOT，深审 finding-only 无路由即无孪生；轻审报告与孪生格式不变，仅 `checks.required` 移除 `style_adherence`（字段保留为可选，向后兼容；已核实零程序消费方）。不加档位标记字段。

## 被否决的候选

- **单 agent + 深审知识下沉 references/ 按需 Read**：维护面更小，但 74.7KB 本体的评分方法论残留靠「这段只有深审才看」的标记纪律维持，易腐；且失去 skill 注入机制的 compaction 保护。本体是最大单项，不拆瘦不下来。
- **轻审保留 total_score 粗评**：没有方法论支撑的分数会漂移、与历史分不可比，比没有更误导。评分与评分机器是连体决策。
- **每 N 章自动抽查**：需 state.yaml 计数器，把成本按周期请回主流程；产出 finding-only 无人当场消费。
- **schema 档位标记字段**：深审无孪生后只有轻审产孪生，无歧义可标，属过度设计。
- **深审覆盖写 `ch-NNN-review.md`**：零 App 改动，但门禁审计记录与路由孪生被无 verdict 的深审报告顶掉。

## 与既有决策的关系

- **ADR-0011（阅读吸引力优先）**：不回退——守门的两道地板（heartbeat 放写 / 章末零设计）留在轻审硬拦截；移出的只是 finding-only 评分层，与「80 分草稿、风格层不 retry」哲学一致。
- **ADR-0012（孪生 = 路由 SSOT 非质量 SSOT）**：本 ADR 是其推论——无路由的深审不产孪生。
- **ADR-0018（章末设计存在性）/ ADR-0019（读者知情契约）**：两者的审校端落点均留在轻审，不受档位化影响。
- **ADR-0002（性能方向）**：验收不设成本硬阈值，跑批时记录墙钟 / 成本对比即可——本决策主驱动是注意力与注入减法，成本下降是预期副产物。
- **#186（钩子机制系统）**：其审校端「钩子机制细查」随评分层移入深审——前提是 #212 整链终判先以现状归档 verdict，本拆分不参与该链验收。

## 不可重开议题

- 「reading_desire 评分是否回流轻审（哪怕简化版）」——被否：评分 = 评分机器 = 注入，连体决策不可拆半。想要分数跑 `/review`。
