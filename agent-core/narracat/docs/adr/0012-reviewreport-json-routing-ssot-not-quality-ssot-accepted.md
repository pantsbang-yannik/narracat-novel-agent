---
status: accepted
---

# 0012 ReviewReport JSON 注释段是路由 SSOT，而非质量报告 SSOT

continuity-editor 模式二的产出 = ~64 行 Markdown 本体（人读）+ 末尾一行 `review_report_json` HTML 注释。本 ADR 钉死该 JSON 注释段的角色：它是**程序据以分支的 load-bearing 字段的 SSOT**（`verdict` 路由 / `revision_instructions[]` 修订派发 / `reading_desire` 人读展示 payload），**不是**整份审校质量报告的机器可读孪生。审校的人读判断维度（C1-C4 兑现度、`strengths`、各维度散文评价）以 **Markdown 本体为 SSOT**。

## 背景与权衡

静态链路审查 P1-5（#202）发现 schema 与 continuity-editor 输出口径不一致：`schemas/review-report.json` 的 `checks` 只建模 5 维、`reading_desire` 在 prompt 必填却 schema optional、`validateReviewReport` 仅有定义 + 单测、未接入任何分发链路（休眠）。两条路：

- **方案 A（否决）**：把 JSON 升格为全 13 维质量 SSOT——schema 纳入全维度 + stricter profile + 接入 `validateReviewReport` 做运行时门禁。
- **方案 B（采纳）**：JSON 只对 load-bearing 路由字段负责；完整质量维度由 Markdown 承载。

选 B 的依据：(1) ADR-0009 craft-first 已把 reading_desire / 辅助维度设成 finding-only，控制流本就只认 `verdict` + `revision_instructions`；(2) 写作质量北极星「提质量靠产出不靠流程、别加门禁/检查」与方案 A 的「13 维完备强制 + validator 门禁」正面冲突；(3) `validateReviewReport` 长期休眠 = 无人需要 JSON 当质量 SSOT。

## 三层字段模型

| 层 | 字段 | 程序怎么用 | SSOT |
|---|---|---|---|
| ① 控制流 load-bearing | `verdict`、`revision_instructions[]` | 路由 / 派发修订 | JSON |
| ② 结构化展示 payload | `reading_desire`（+ `word_count`） | 渲染人读表格，不驱动判定 | JSON（结构化） |
| ③ 人读 Markdown SSOT | C1-C4 兑现度、`strengths`、各维度散文、`checks` 的分析文字 | 不被结构化消费 | Markdown 本体 |

## 结果

- **checks**：维持 5 维（verdict-gating 连续性维度的自留记录——continuity-editor 据此算 verdict，主会话信任 verdict、不重读 checks）。finding-only 维度（reading_desire / C1-C4 / 伏笔密度章级 / 高频陷阱）按 ADR-0009 刻意不进 checks。已知小不完备：S7 场景兑现度 / 人物动线虽可 FAIL 但不在 checks——由 verdict + Markdown 承载，**不补字段**（避免 prompt/schema churn）。schema description 写清这点。
- **reading_desire**：schema 顶层维持 optional（消除「prompt 必填 vs schema optional」口径分歧靠 description 写「新产出必填、optional 仅兼容老报告」，不翻 `required` 数组——翻了对休眠 validator 无运行时收益，且会在将来校验老报告时炸）。保持结构化留在 JSON（展示表消费）。
- **validateReviewReport**：**删除**（函数 + `buildReviewReportHintFromAjvError` + `REVIEW_*_HINT` 常量 + `reviewReportValidator` + `REVIEW_REPORT_SCHEMA_PATH` + 单测 + fixtures）。它是休眠死代码，其「存在」正是 P1-5 困惑来源（「有完整质量 validator → JSON 是质量 SSOT？」）。契约由 `schemas/review-report.json`（文档型）承载；JSON 解析失败时主会话降级 Markdown 路由（既有机制，write.md 步骤 5）。
- 若未来方向改回方案 A，需重建 validator 并收紧 schema——成本可接受。
