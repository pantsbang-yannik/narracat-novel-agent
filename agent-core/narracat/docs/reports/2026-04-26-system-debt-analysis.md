# NarraCat 系统债务分析与改善建议

> 报告日期：2026-04-26
> 分析范围：MCP Server 代码质量、测试覆盖、容错机制、运维基础设施、Plugin 框架适配
> 分析触发：系统性架构审查
> 背景：系统已完成 3.0.0 功能迭代，架构设计趋于稳定，进入质量加固阶段

---

## 改善事项总览

| # | 事项 | 严重度 | 优先级 | 工作量估值 | 影响面 | 进度 |
|---|------|--------|--------|-----------|--------|------|
| 1 | 测试覆盖 | 极高 | **P0** | 3-5 天 | 全系统稳定性 | **✅ 已完成** |
| 2 | 事务安全 | 高 | **P0** | 0.5 天 | MCP Server 数据完整性 | **✅ 已完成** |
| 3 | 端到端数据管线校验 | 高 | **P1** | 2-3 天 | 写作流程可靠性 | ⏳ 待启动 |
| 4 | CI/CD 流水线 | 中 | **P1** | 1 天 | 团队协作与质量门禁 | ⏳ 待启动 |
| 5 | 系统监控与可观测性 | 中 | **P2** | 1-2 天 | 故障排查效率 | ⏳ 待启动 |
| 6 | plugin.json 合规完善 | 低 | **P2** | 0.5 天 | 框架集成度 | ⏳ 待启动 |

---

## 1. MCP Server 测试覆盖（P0 / 极高 — ✅ 已完成）

> 实施日期：2026-04-26
> 计划文档：`docs/plans/2026-04-26-phase-a-testing-transactions-design.md`
>                 `docs/plans/2026-04-26-phase-a-testing-transactions-implementation.md`
> 结果：40 测试用例（3 测试文件），TypeScript 编译零错误

### 实施总结

- **框架**：vitest v4.1.5，colocated `*.test.ts` 测试文件
- **数据库 CRUD**（database.test.ts—19 用例）：建表、章节摘要、事实三元组、情感状态、FTS5 全文检索、事务回滚
- **Writer Handler**（writers.test.ts—7 用例）：5 个写工具的集成测试（含数据库写入验证）、回滚验证
- **Reader Handler**（readers.test.ts—14 用例）：5 个读工具的集成测试（含边界情况如第 1 章无前文、空结果、不存在角色）
- **每次测试独立 `:memory:` SQLite 实例**，用例间零污染

### 当前状态

NovelMemory MCP Server（`mcp-server/src/`）共计 985 行 TypeScript，涵盖 15 个工具的路由、SQLite 数据库操作（7 张表）、混合语义搜索（sqlite-vec + FTS5 trigram）、以及工具参数验证逻辑——**零测试文件**。

关键风险模块：
- `database.ts`（160 行）：建表 DDL、7 张表的增删改查、FTS5 索引维护。**无 schema 迁移测试。**
- `tools.ts`（343 行）：15 个工具的 inputSchema 定义和路由。**无参数校验测试。**
- `corpus-loader.ts`（177 行）：语料库加载与向量化。**无数据完整性测试。**
- `handlers/readers.ts` + `writers.ts` + `style-reference.ts`：所有工具的业务逻辑。**无集成测试。**

### 具体风险事例

1. **数据库 schema 迁移无保护**：目前 `database.ts` 每次启动执行建表 DDL（`CREATE TABLE IF NOT EXISTS`）。如果后续版本修改了表结构（加列、改索引），无法安全迁移。没有测试意味着无法在开发阶段发现 schema 不兼容。
2. **mixed search 结果准确性**：FTS5 trigram + sqlite-vec 向量检索的混合排名算法，没有回归测试来保证一个修改不破坏搜索质量。
3. **写工具幂等性**：`novel_store_summary`、`novel_store_fact` 等写工具是否支持重复调用？无测试覆盖意味着无法确认幂等行为。
4. **边界情况**：空查询、超长文本、特殊 Unicode（CJK 含生僻字）、并发写入等场景均无覆盖。

### 建议方案

**阶段一（P0，2 天）：核心数据库操作测试**
- 使用 `better-sqlite3` 的 `:memory:` 模式，每次测试独立数据库实例
- 为 `database.ts` 中每个 CRUD 操作写单元测试
- 重点覆盖：建表、写摘要、写事实、写情感、事实失效、FTS5 查询
- 测试框架建议：vitest（零配置、ESM 原生支持、与当前 `"type": "module"` 兼容）

**阶段二（P1，1 天）：工具处理函数集成测试**
- 为 readers.ts / writers.ts 中每个处理函数写集成测试
- 验证 inputSchema 校验、错误返回格式、边界参数

**阶段三（P1，0.5 天）：索引测试**
- FTS5 + sqlite-vec 的混合检索正确性验证
- 确保 CJK 子串匹配（≥3 字符）行为符合预期

**阶段四（P2，0.5 天）：端到端工具调用测试**
- 模拟 MCP Server 调用流程，验证 routing → handler → response 的完整链路

### 验收标准

- `npm test` 通过率 100%
- 核心 CRUD 操作测试覆盖率 > 85%
- 每个 merge 前必须运行测试

---

## 2. MCP Server 写入事务安全（P0 / 高 — ✅ 已完成）

### 实施总结

- 在 `database.ts` 中新增 `withTransaction<T>(db, fn)` 导出函数，基于 `better-sqlite3` 的 `db.transaction()` 原生实现
- `novelReinforce` 作为**唯一**缺少事务包装的 writer handler，已用 `withTransaction` 包裹其核心逻辑
- 测试覆盖事务成功提交和异常回滚两个路径
- 其余 6 个 writer handler（`novelStoreSummary`、`novelStoreFact`、`novelStoreSetting`、`novelStoreEmotion`、`novelInvalidateFact`、`novelRollbackChapter`）之前已使用 `ctx.db.transaction()`，无需改造

### 当前状态`better-sqlite3` 默认每个 `db.prepare().run()` 是自动提交的隐式事务。这意味着：

1. **部分写失败无回滚**：例如一个 writer handler 需要先查后写或跨表写，中间步骤失败会导致数据处于不一致状态（部分写入、部分未写入）。
2. **无写入顺序保护**：不保证数据按章节顺序写入，可能先写 ch-10 再写 ch-5（正常情况下 memory-keeper 不会这么做，但引擎层不应依赖上层调用的顺序正确性）。
3. **并发无隔离**：虽然单进程场景下并发概率低，但多个工具调用可能在同一个 session 中交织执行。

### 建议方案

在 `database.ts` 中暴露事务包装函数：

```typescript
// database.ts
export function withTransaction<T>(db: Database, fn: () => T): T {
  const transaction = db.transaction(fn);
  return transaction();
}
```

在 `writers.ts` 中的每个写操作外层调用 `withTransaction`，确保多个写步骤要么全部成功、要么全部回滚。

### 验收标准

- 所有写工具（7 个）的处理函数都在事务中执行
- 注入模拟失败时，数据库状态不变（回滚验证）

---

## 3. 端到端数据管线校验（P1 / 高）

### 当前状态

写作数据管线流程：
```
continuity-editor (预检) → 构建 WCP → chapter-writer (消费) → 输出成文
                                                     ↘ continuity-editor (审校)
```

这个链路的每个环节依赖 JSON Schema 契约。当前风险：

1. **continuity-editor 预检遗漏字段**：如果 WCP 的某个字段在 preflight 阶段没有被提取，chapter-writer 不会感知到"我缺信息了"——它会正常启动，只是 WCP 里那个字段为空。
2. **Schema 与消费端不同步**：如果 WritingContextPack 新增了字段，但 chapter-writer prompt 中没有对应的执行规则（CLAUDE.md 要求的三步检查），该字段在消费端形同虚设。
3. **无消费端确认机制**：chapter-writer 完成写作后，没有任何环节验证它是否真的读取了 WCP 中的所有关键字段。

### 建议方案

**方案 A（轻量，P1，0.5 天）：WCP 完整性断言**
在 chapter-writer 的 output 中加入一个隐式字段，或者在审校阶段由 continuity-editor 校验 WCP 字段的使用情况。CLAUDE.md 中已经要求了"扩展 WCP 字段时的检查清单"，但缺少自动化检查手段。可以加一个 hook 或审校步骤：

- continuity-editor 审校时额外检查 WCP 中各字段是否在成文中有体现
- 字段覆盖率不足时标记 Warning

**方案 B（较重，P2，1 天）：Schema 驱动校验**
为 WCP 的 JSON Schema 增加 `required` 约束，并在 chapter-writer 启动前做一次 schema validation。但这样做需要在 Agent prompt 中引入 validation 步骤，对 token 有额外开销。

### 验收标准

- 审校报告新增"WCP 字段使用率"检查项
- 字段使用率低于 60% 的章节标记为需人工复查

---

## 4. CI/CD 流水线（P1 / 中）

### 当前状态

完全无自动化流水线。目前的验证手段是本地手动运行 `tsc`（`npm run build`）。对于 985 行 TypeScript + 6 个 JSON Schema + 9 个 Markdown Command/Agent + 6 个 SKILL，缺少以下门禁：

1. **TypeScript 编译检查**（自动化）
2. **测试运行**（如果测试不到位，这个门禁也无法发挥作用）
3. **JSON Schema 校验**（验证 schema 文件自身是否合法）
4. **Markdown frontmatter 校验**（验证 Command/Agent/Skill 的 YAML frontmatter 是否符合 Plugin 规范）

### 建议方案

GitHub Actions 工作流（约 1 天配置）：

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: cd mcp-server && npm ci
      - run: cd mcp-server && npm run build   # tsc 编译检查
      - run: cd mcp-server && npm test         # 测试（待实现）
```

后续可扩展：
- `ajv-cli` 校验 JSON Schema 文件自身合法性（P2）
- `yaml-lint` 校验 Markdown frontmatter（P2）
- 集成 `textlint` 校验中文文案质量（P2，如果用户有需求）

### 验收标准

- push 到任意分支自动触发 CI
- CI 失败时不得 merge（在 GitHub 中设为 required check）
- CI 通过时间 < 2 分钟

---

## 5. 系统监控与可观测性（P2 / 中）

### 当前状态

`index.ts` 中只在启动和错误时向 stderr 输出一行 JSON。没有以下能力：

1. **工具调用计费/频率统计**：无法回答"写一章调了多少次 novel_query"这类问题。
2. **失败模式追踪**：工具调用失败时只返回 error message，没有结构化错误码和可检索的上下文。
3. **性能数据**：不知道各个 MCP 工具的平均延迟、FTS5 查询耗时、vector embedding 推理耗时。

### 建议方案

**阶段一（P2，0.5 天）：结构化日志**
在 `index.ts` 的工具调用 handler 中增加结构化 stderr 日志：

```typescript
console.error(JSON.stringify({
  event: "tool_call",
  tool: name,
  duration_ms: end - start,
  success: true,
  timestamp: new Date().toISOString(),
}));
```

所有 stderr 输出保持 JSON Lines 格式，便于事后 grep 和日志分析。

**阶段二（P2，0.5 天）：错误码体系**
为每个错误类型分配错误码前缀：
- `ERR_DB_001`：数据库连接失败
- `ERR_TOOL_001`：工具路由未找到
- `ERR_PARAM_001`：参数校验失败

使错误排查不再依赖阅读源代码。

### 验收标准

- 每个工具调用的开始/结束都输出结构化日志
- 错误日志包含错误码
- 日志格式统一为 JSON Lines

---

## 6. plugin.json 合规完善（P2 / 低）

### 当前状态

```json
{
  "name": "narracat",
  "version": "1.0.0",
  "description": "AI-assisted long-form novel writing plugin for Claude Code",
  "author": { "name": "Yannik" }
}
```

只有 4 个字段。而 Claude Code Plugin 框架支持更多能力：

1. **version 未跟进**：代码已经迭代到 3.0.0 功能级别，但 plugin.json `version` 仍为 `1.0.0`。
2. **无可声明的能力**：`capabilities` 字段未使用。虽然本 Plugin 的 Command/Skill 已经通过目录约定注册，但 `capabilities` 可以声明更多框架集成点。
3. **无 dependencies**：没有声明对 MCP Server 的依赖关系。

### 建议方案

```json
{
  "name": "narracat",
  "version": "3.0.0",
  "description": "AI-assisted long-form novel writing plugin for Claude Code",
  "author": { "name": "Yannik" }
}
```

至少将 version 更新为与当前迭代同步（最新 feature commit 在 3.0.0 分支上）。其余字段待 Claude Code Plugin 框架能力明确后补全。

### 验收标准

- `version` 字段反映当前迭代轮次

---

## 优先级排序说明

**P0（立即执行）**：直接影响数据安全或当前可用性，在继续新增功能前必须解决。
- 测试覆盖：无测试意味着每次修改都是盲改，边际风险随代码量线性增长。3.0.0 完成后是最佳切入时机。
- 事务安全：一行 `db.transaction()` 包装解决大部分问题，投入产出比极高。

**P1（近期执行）**：影响长期可维护性，建议在下一个迭代周期（3.1.0）内完成。
- 数据管线校验：随着 WCP 字段持续增加（2.0 → 3.0 已扩展多次），缺少校验的代价也持续增长。
- CI 流水线：在测试覆盖到位后，CI 是其发挥作用的必要条件。

**P2（按需执行）**：锦上添花型改善，可在项目遭遇具体问题时再推进。
- 可观测性：建议在遇到"无法排查的线上问题"之后再投入。
- plugin.json 完善：影响小，可在其他 PR 中顺手修改。

---

## 分阶段路线图

```
阶段 A（P0，约 3-5 天）— ✅ 已完成
  ├── ✅ 测试阶段一：数据库 CRUD 单元测试
  ├── ✅ 测试阶段二：工具处理函数集成测试
  └── ✅ 事务包装引入

阶段 B（P1，约 3-4 天）：
  ├── GitHub Actions CI 配置
  ├── 测试阶段三：索引/检索测试
  ├── 测试阶段四：端到端工具调用测试
  └── WCP 字段使用率审校检查项

阶段 C（P2，约 1.5-3 天）：
  ├── 结构化日志 + 错误码
  ├── plugin.json 版本更新
  └── 前端界面管线校验
```
