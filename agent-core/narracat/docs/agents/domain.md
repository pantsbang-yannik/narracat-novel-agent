# Domain Docs

工程类 skill 在探索代码前如何消费本仓库的领域文档。

## Before exploring, read these

- **`CONTEXT.md`** at the repo root（项目术语表）
- **`docs/adr/`** — 阅读与你即将改动的领域相关的 ADR

文件不存在时**静默继续**——不要提示缺失、不要主动建议创建。生产者 skill（`/grill-with-docs`）会在术语或决策真正需要被锁定时懒惰地创建它们。

## NarraCat 特化

本仓库有独立 `CONTEXT.md` 作为术语表；`CLAUDE.md` 顶部章节仍承担架构说明：

- `## 项目概述` — 项目定位（Claude Code Plugin、覆盖范围、命名空间）
- `## 三层架构` — 用户层 / Agent 层 / 引擎层
- `## 组件清单` — Commands / Agents / Skills / Schemas 列表 + Agent-Skill 依赖表
- `## 关键目录规则` — 各目录的职责与 SSOT 划分（特别是 `docs/contracts/` 和本目录 `docs/agents/`）
- `## 文件命名规范` — 用户侧小说项目的文件命名约定
- `## 核心设计规则` — 写权限隔离 / Prompt 语言 / 数据管线一致性 / SSOT 边界等强约束

`docs/adr/` 当前含：

- `0001-skill-injection-layering-deferred.md` — Skill 注入分层 / Subagent 拆分（已搁置）
- `0002-wallclock-optimization-direction-shifted.md` — 墙钟优化方向调整：MCP 调用层已饱和
- `0003-write-flow-anchor-driven-refactor.md` — /write 流锚点驱动重构（砍写前预检 + 阶段零锚点 + 审修端 2 维度）
- `0004-plan-flow-deepening-restructure.md` — /plan 流深化重构（单元层 + 场景 inline + 章对象重构 + 全书引擎 + 伏笔系统）
- `0005-novel-scale-decision-timing-completed.md` — 小说规模决策时机错位（completed）
- `0006-antipattern-injection-position-accepted.md` — chapter-writer 不注入 novel-antipattern（accepted）
- `0007-agent-prompt-ballpark-no-hard-target-accepted.md` — 全 Agent prompt 用 ballpark indicative，不设 hard target（accepted）
- `0008-schema-soft-gate-user-dir-frozen-accepted.md` — Goal B 期间 schema 软门槛 + 用户项目目录冻结（accepted）
- `0009-audit-craft-first-reading-desire-accepted.md` — 审修端 craft-first，reading_desire 取代高频陷阱主维度（accepted）
- `0010-foreshadowing-density-planned-vs-realized-accepted.md` — 伏笔密度语义重定义，计划兑现度取代密度达标（accepted）
- `0011-write-generation-reading-attraction-first-accepted.md` — /write 生成端以第一稿阅读吸引力优先（accepted）

## File structure

NarraCat 是 single-context layout：

```
/
├── CLAUDE.md                              ← 事实上的 CONTEXT
├── docs/adr/                              ← 架构决策记录（0001–0010）
├── docs/contracts/                        ← 跨命令共享逻辑契约
├── docs/plans/                            ← 设计文档与实施计划
├── docs/agents/                           ← 本目录（skill 消费规则）
├── commands/ agents/ skills/ schemas/     ← Plugin 组件
└── mcp-server/                            ← NovelMemory MCP Server
```

Multi-context layout（仓库根存在 `CONTEXT-MAP.md`）不适用本仓库。

## Use the glossary's vocabulary

输出涉及领域概念（issue 标题、重构提案、假设、测试名）时使用 `CLAUDE.md` 中定义的术语：ChapterBrief / CharacterBrief / WritingContextPack / 写权限隔离 / SSOT 权衡 / earliest missing / estimated_total_chapters 等。**不要漂移到 glossary 明确避开的近义词**。

如果你要用的概念还未被 glossary 收录——这是一个信号：要么你在发明项目不使用的语言（重新考虑），要么真有缺口（记下来给 `/grill-with-docs`）。

## Flag ADR conflicts

若输出与现有 ADR 冲突，显式指出而非默默覆盖：

> _Contradicts ADR-0001 (skill 注入分层 deferred) — 但值得重开因为……_

## Schema drift lint

`scripts/schema-drift-lint.mjs` 检测 prompt 文件中与 `schemas/*.json` 真值不一致的版本号引用、以及已弃用字段名残留。CI workflow `.github/workflows/schema-drift-lint.yml` 在 push / pull_request 自动跑。

**本地运行：**

```bash
node scripts/schema-drift-lint.mjs        # 仓库根目录直接调
npm run lint:schema-drift                 # 通过根 package.json scripts 入口
```

**检测项：**

- **A 版本号漂移**：扫描形如 `WritingContextPack v1.0` / `OutlineStructure v4.0` 的引用——左侧词若是已知 schema title（CascadeImpactReport / ChapterMetadata / ForeshadowingSystem / MemoryExtraction / OutlineStructure / ReviewReport / WritingContextPack），则与该 schema 的 `version` 字段对比，不匹配则报告
- **B 已弃用字段引用**：白名单维护 `ending_type` / `evaluation_focus` / `style_guidance` / `style_reference` / `recent_techniques` 5 个已废弃字段；prompt 中仍引用则报告

**典型输出：**

```
=== A. 版本号漂移 ===
agents/chapter-writer.md:122:3  [A:version-drift] 引用 "WritingContextPack v1.0" 与 schema 真值不一致（schemas/writing-context-pack.json version=2.1.0）。建议改为 WritingContextPack v2.1

=== B. 已弃用字段引用 ===
agents/chapter-writer.md:48:133  [B:deprecated-field] 引用已弃用字段 "style_guidance"（已从 WritingContextPack 移除，被 sentence_rhythm 等具体字段替代）

=== Summary ===
扫描文件数: 40
已知 schema 数: 7（...）
版本号漂移: 4
已弃用字段引用: 32
漂移总数: 36
```

**退出码：** 发现漂移 → 1（CI 阻断）；否则 → 0。

**扩展新弃用字段：** 编辑 `scripts/schema-drift-lint.mjs` 中的 `DEPRECATED_FIELDS` 数组，加 `{name, reason}`。schema 名 / 版本无需手动维护——脚本运行时直接读 `schemas/*.json` 真值。
