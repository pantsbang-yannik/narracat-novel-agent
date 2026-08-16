# ADR-0017: 运行时 prompt 出处中立——dev-provenance 移出 agent·skill·command（accepted）

**日期**: 2026-06-01
**状态**: accepted
**触发**: agent / skill / command 的运行时 prompt 里积累了大量 `#NNN` / `ADR-NNNN` / 版本戳 `vX.Y` / 里程碑 `Goal B/C·B3·B4.1` 等**开发出处标记**——agents 76 处、skills 16 处、commands 55 处。这些标记在 subagent 启动 / 命令调用时被注入写作 agent 的上下文，是纯 token + 注意力噪音，写作 agent 不消费它们。

## 背景：旧约定主动鼓励面包屑

历史上每次功能性提交都习惯在 prompt 里就地标注「（B3 #131 新增）」「ADR-0009 后降为辅助参照」，把**开发决策轨迹**写进了**运行时执行指令**。两层被混淆了：

| 层 | 内容 | 谁消费 |
|---|---|---|
| 运行时 prompt | agents / skills（SKILL.md + references/）/ commands 正文 | 写作 agent（fresh context，执行当前任务） |
| 维护者层 | CLAUDE.md / docs/adr / docs/contracts / CHANGELOG / git / schemas | 人类维护者 + 主会话编排 |

出处标记属维护者层，却长在运行时 prompt 里。更糟的是它们常嵌进**时态叙述**——「历史上 X 是主维度，ADR-N 后降为 Y / 已迁入 / 不再单列」——让执行端的 LLM 还要消化"以前怎样、现在改成怎样"，而它只需要知道**现在该做什么**。

## 决策

**运行时 prompt（agents / skills / commands 正文）只读现在时执行指令，不携带开发出处标记。** issue 号、ADR 引用、prompt/schema 版本戳、内部里程碑标签全部移出；溯源归维护者层（git blame + docs/adr + CHANGELOG + CLAUDE.md）。

这**反转了旧"ADR 面包屑"约定，但仅限运行时 prompt 层**——维护者层（CLAUDE.md / ADR / contracts）继续保留 ADR 引用，那是溯源的正主。

## 删 / 留边界

| 处置 | 内容 |
|---|---|
| **删** | issue 号 `#NNN` · 版本戳 `vX.Y`（prompt/schema 版本，非「v3 数据」代际）· 里程碑 `Goal B/C·B3·B4.1·B5.1·dogfood` · 纯"X 新增"注解 · **ADR 引用** |
| **留（功能性，load-bearing）** | `§X.X` 章节交叉引用 · `GATE-N` · `W-N` · 反模式码 `A1/D6/F3/E1/H1` · MCP 工具名 · enum 值 |
| **留（运行时行为）** | "无字段→降级"判定机制（optional 字段在新项目也会缺失）· 用户项目数据代际标记（老项目/v3 数据）所对应的降级路径 |

## 深改原则（北极星：零行为变更）

- **时态叙述重述为现在时**：「历史上 X、已迁入、不再单列、后变更」→ 直接陈述当前规则。约束当前行为的字句（如锚点兑现度「不降级」）必须保留。
- **零行为变更铁律**：所有 PASS/FAIL/WARNING 条件、阈值、enum 路由在改前后**完全等价**。深改只动描述，不动判定逻辑。
- **条件分支按"开发态 vs 用户数据态"二分**：收敛已死的**开发协调**分支（如「如 B4.1 尚未合并 → 取 NO」，先核实对应 PR 已合并）；严格保留**用户项目降级**分支。
- **降级逻辑：机制留、出处包装删**——「（老项目 v4.3 及之前）无此字段时降级 null（走 §6.4）」→「无此字段时降级 null（走 §6.4）」。schema 显示 `scene_type` / `ending_hook_type` 等是 optional + 无 ajv 入口校验，新项目同样可能缺字段，故降级机制是活的。整删降级分支需先把 schema 字段升 required（触发 schema-pr-check 下游影响门禁），属另一项目，不在本次范围。

## 防回潮

- **CI grep-lint**：扫 `agents / skills / commands` 出现 `#\d{2,4}` / `ADR-\d{4}` / `Goal [BC]` 即 fail（零误报；`vN` 因「v3 数据」歧义不纳入自动拦截，留人工）。与现有 `lint:sync-chain` 同文化。
- **CLAUDE.md 约定**：写明运行时 prompt 出处中立规则，并调和「精简检查清单」（保留 §/GATE/W 功能码 + 新增禁 dev-provenance）。

## 不动的（边界）

维护者层（CLAUDE.md / docs/adr / docs/contracts / CHANGELOG）保留出处；schemas/*.json 非运行时注入、不在本次范围；功能码 / 降级机制 / 数据管线一致性 / 锚点同步链 / 写权限隔离 / 小说目录结构不动；不收紧任何 schema 字段。

## 可逆性

prompt / docs 改动可逆，但 20 文件重加几百处引用成本高、且需重新区分删/留边界——故立此 ADR 锚定决策与边界，防下次架构 review 重提"该不该把 ADR 引用写回 prompt"。
