# ADR-0005: 小说规模决策时机错位（completed）

**日期**: 2026-05-21（识别）/ 2026-05-22（unblocked → implementing → completed，一日内完成立项 + 实施）
**状态**: completed——A1 方案三 slice 全部 merged（PRs #69 / #70 / #71，2026-05-22）
**触发**: Epic #21 E2E 验证 `/narracat:plan` 时，主会话发现 `bible/premise.md` 与 `.narracat/config.yaml` 在小说规模上矛盾
**关联**:
- 同类根因（LLM 编排契约失效）→ `docs/plans/2026-05-22-schema-field-decompose-validate-design.md`（B+F 字段拆解 + 入口硬校验，独立 PR 处理）
- 实施细节 → `docs/plans/2026-05-22-novel-scale-decision-timing-design.md`
- 决策落地 → PR #68（ADR 推进 implementing + design plan）/ PR #69（slice 1 init）/ PR #70（slice 2 setup）/ PR #71（slice 3 plan）

## 实施摘要（2026-05-22 完成）

| Slice | 文件 | 改动 | PR | Issue |
|---|---|---|---|---|
| 1 | `commands/init.md` | 删步骤 2 章数/字数两题；config.yaml 模板两字段改 null | #69 | #65 |
| 2 | `commands/setup.md` | 三要素「阅读节奏」改「情绪基调」；新增禁数字硬约束；反模板表追加规模反例行 | #70 | #66 |
| 3 | `commands/plan.md` | 步骤 1 拆分为 1/1.5/1.6；新增 1.5 规模兜底收集（4 regex + 主路径 4×3 预设 + 边界路径 AskUserQuestion + 维度不全 fallback + 单向写回） | #71 | #67 |

总改动：3 文件，+97/-21 行；零 schema/MCP/handlers 改动。dogfood 阶段不兼容老项目。

**手测验证状态**：3 个 PR 的 acceptance criteria 中手测剧本待用户在实际新小说项目上跑通后勾选；A1 主路径 + 边界路径 + dogfood 兼容三剧本（详见 design plan § Verification）。

## 背景

NarraCat 在两个独立位置记录"小说规模"，两端无强一致性约束、写完不互验：

| 字段 | 位置 | 收集时机 | 收集方式 |
|---|---|---|---|
| `estimated_total_chapters` / `target_chapter_words` | `.narracat/config.yaml` | `/narracat:init` 步骤 2 | AskUserQuestion，固定预设（含"推荐网文 [2000,2500]"标签） |
| 自由文本"全书规模 X 章 / Y 字" | `bible/premise.md`「目标读者」段 | `/narracat:setup` 步骤 1.4 | LLM 推理 options 含「阅读节奏」要素，用户在 options 或 Other 中决定 |

### 实例

Epic #21 E2E 验证项目（`09-Novel-test-2.5.0`）：

- config.yaml：`estimated_total_chapters: [50, 100]`、`target_chapter_words: [2000, 2500]`
- premise.md：「全书规模 200-300 章，每章 3000-4000 字，总字数约 80-100 万字」

数字差 3-4 倍。`/plan` 步骤 1 分别读取两源、未做对账——靠主会话的 Plan skill 才发现，无系统级 check。

### 根因（三层）

1. **核心**：「小说规模」存在两个并存的 SSOT（config.yaml 数值字段 + premise.md 自由文本），无强一致性约束
2. **直接触发**：
   - `/init` 让用户在"只有书名、未构思故事"时强制报章数/字数 → 用户必然按默认；预设标签还诱导选最小值
   - `/setup` 让用户在"故事成型、参考作品已锚定"时谈阅读节奏 → LLM/用户基于参考作品（《剑来》《雪中悍刀行》类）自然涌出真实意图
   - 中间**无同步**：setup 不读 config.yaml 作为 anchor，也不回写 config.yaml
3. **次要**：
   - `templates/premise-template.md` 无显式"规模"字段位 → 数字混入自由文本，不便机器解析
   - `commands/setup.md` 步骤 1.4 options 生成规则未将 config.yaml 章数作为约束
   - `commands/plan.md` 步骤 1 未做一致性对账，把矛盾甩给主会话

### 更深的认识

**章数/字数不是技术参数，是创作参数**。真实作者认知是渐进收敛的——init 时只有题材，根本无法精准回答；plan 时才真正需要数字（卷数 × 每卷章数 = 总章数，伏笔系统覆盖范围、复仇弧长度需要字数承载）。`/init` 把"技术性占位"包装成"创作性决策"，强迫用户在认知未达时定终生，是本问题的设计层根源。

## 评估的选项

1. **方案 A：分阶段渐进收敛（倾向）**
   - `/init` 完全不收集这两个字段（config.yaml 中省略或 null）
   - `/setup` 完成 5 题后新增 1.7 步：基于已成型的故事概念问粗体量感（短篇 30-50 章 / 中长篇 100-150 章 / 长篇 200-300 章 / 超长篇 400+ 章），4 选 1，回写 config.yaml
   - `/reference` 末尾（可选加强）根据参考作品体量提示对齐
   - `/world` 末尾（可选加强）根据角色与世界复杂度提示重新校准
   - `/plan` 步骤 1 兜底一致性对账（纯代码扫描 premise.md 自由文本 vs config.yaml）
   - 优：决策时机匹配认知状态；每节点可修订上一次估计
   - 劣：流程变长（至少多一题）；改动面涉及 4 个命令 + premise-template

2. **方案 B：SSOT 收敛到 config.yaml**
   - premise.md 自由文本中禁止具体章数/字数
   - setup 1.4 options 生成规则强制读 config.yaml 章数作为约束，在选项中复述「全书约 X-Y 章」
   - 优：最小侵入
   - 劣：`/init` "未构思就报数" 的体验未变；用户仍会按默认值——根因未解

3. **方案 C：仅加 /plan 兜底对账**
   - 保留双源，只在 `/plan` 步骤 1 增加纯代码扫描 + AskUserQuestion 同步
   - 优：零创作流改动
   - 劣：本质是给两个 SSOT 打补丁，根因未解

4. **方案 D：保持现状**
   - 接受当前矛盾，靠主会话发现
   - 劣：依赖运气；非 Plan skill 调用时矛盾会沉默写入

## 决策

实施 **方案 A1：分阶段渐进收敛 · 精简版**（grill-with-docs 会话 2026-05-22 收敛）。核心三点：

1. **`/init` 不收集规模字段**——删除步骤 2 中章数/字数两题；config.yaml 模板字段保留为 `null`
2. **`/setup` 1.4 options 禁数字**——options 生成规则移除「阅读节奏」要素，新增禁数字自检条款，从源头阻止 LLM 在 `bible/premise.md` 涌出规模数字
3. **`/plan` 步骤 1 兜底收集**——仅在 `config.yaml.estimated_total_chapters` 为 `null` 时触发：
   - 主路径：沿用 init 当前的预设两题形态（4 档 × 2 题），删除"推荐网文"诱导标签
   - A1 边界路径：plan 步骤 1 用 regex 扫描 `bible/premise.md`（3 个模式：`\d+\s*[-至到~～—–]?\s*\d*\s*章` / `\d+\s*[-至到~～—–]?\s*\d*\s*万\s*字` / 含「每章/单章」近邻词的 `\d+\s*字`）。命中则 AskUserQuestion 让用户在「采用提取数字」/「重新选预设」二选一；维度不全则部分采用 + 缺失维度走预设
   - 单向同步：仅 premise.md → config.yaml，不写回 premise.md
4. **dogfood 阶段不兼容老项目**——config.yaml 已有数字（A1 部署前已跑过 init 旧版本）→ plan 直接采用，不重新询问、不对账、不警告。"对账"语义退化为"兜底收集"

**关键退化**：原 ADR 描述的"双源对账"在 dogfood 阶段不存在——A1 主路径下 premise.md 无规模数字（setup 1.4 防御）+ config.yaml 由 plan 唯一写入，自然单源。

## 理由

1. Epic #21（demand-driven outline planning）E2E 验证完成（2026-05-22）→ 不再有扰动验证基线的顾虑
2. 本问题在 Epic #21 中通过主会话 Plan skill 主动发现，**有运行时降级路径**（不导致数据损坏，只是数字不准；下游 estimated_total_chapters 仅是提示性参数，不参与 earliest/batch 计算——见 CLAUDE.md "estimated_total_chapters 的角色"段）→ A1 实施过程中即使存在残余双源场景，主会话仍能识别并提示
3. **决策时机匹配认知状态**——init 阶段用户只有题材，被迫填数字必然按默认；plan 阶段已走完 setup/world，可基于具体故事概念做有信息的选择
4. **dogfood 阶段不兼容老项目** → 跳过"双向同步 / 自动改写 premise.md / 派生量重算"的复杂分支，方案改动面收敛到 3 个 .md 文件，零 schema/MCP/handlers 改动
5. 不扩展 `templates/premise-template.md` 加显式"规模"字段位——A1 走"禁数字"而非"结构化字段"，避免引入新字段又需要新校验链路

## 实施状态

2026-05-22 grill-with-docs 会话完成决策收敛 → design plan 立项：

- 实施细节文档：`docs/plans/2026-05-22-novel-scale-decision-timing-design.md`
- 改动面：3 个命令文件（init / setup / plan）+ 1 个 design plan + 本 ADR 状态推进；零 schema/MCP/handlers 改动
- 评估过但已否决的方向：方案 A 全量（中间 reference/world 修订节点）/ 扩展 premise-template 加规模字段位 / 自动改写 premise.md 与派生量重算

## 不在本 ADR 范围内的相关工作

- `/setup` 步骤 1.4 中 LLM options 推理质量本身（如"反模板自检"）属于 commit `f8bd96d` 已交付改动，不在此 ADR 讨论
- `/plan` 步骤 1 的 `progress.chapters_outlined` 状态同步由 `docs/contracts/outline-planning.md §1` 处理，与本 ADR 的"规模字段对账"互不冲突
