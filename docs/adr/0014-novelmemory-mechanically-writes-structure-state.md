# ADR 0014: NovelMemory Mechanically Writes Structure State

## Status

Accepted

## Context

`state.yaml.structure`（总卷数、总章数、章到卷归属）此前由创作 Agent 用 Edit 直写，没有任何机械守卫。2026-06-07 dogfood 撞上 YAML flow map 序列化陷阱：LLM 把 72 条映射写成无空格紧凑形态 `{1:1,2:1,...}`，按 YAML 规范这解析为「键 `"1:1"`、值 `null`」的合法 YAML——写入不报错，App 读取端逐条校验失败后静默过滤，Workbench 渲染出空卷章树，而磁盘上卷大纲、章节大纲文件全部完好。

两个结构性事实使该问题无法靠现状自愈：

1. **坏格式只杀程序化读取方。** Agent 自己读 `{1:1,...}` 时是 LLM 在读，反而能"看懂"，所以 Agent 侧自测永远不会发现；炸的只有 App 这类程序化解析方。
2. **Structure state 不可从文件系统重建。** 未细化章节的卷归属只存在于 master-outline 内容和 NovelMemory unit_meta facts 中，无法像 `progress.chapters_outlined` 那样靠扫描 `outline/vol-*/ch-*.md` 对账修复（outline-planning.md §1 的既有自愈模式对它不适用，契约也明文「阶段二不再回填此映射」）。

## Decision

**写侧机械化（主保证）：** NovelMemory MCP 新增 `novel_sync_structure` 工具，成为 `state.yaml.structure` 节的唯一写入通道。MCP 的写权限边界由「只拥有 memory.db」扩展为「memory.db + state.yaml 的 structure 节」——最小口子，state.yaml 其余节维持 LLM 直写加对账自愈。

**工具契约（冗余声明 + 交叉校验）：** LLM 传入展开后的成品 `chapter_to_volume` map（JSON 工具参数，序列化陷阱死在 JSON 层），并冗余声明 `total_volumes` 与 `total_chapters_planned`，三者交叉互证：章号键恰好覆盖 `1..total_chapters_planned` 无缺口无多余；卷号值落在 `1..total_volumes` 且每卷至少一章；章到卷单调不减（卷是连续区间）。任一不过整体拒写，错误按既有 validator 惯例返回 `errors[]`（`field / expected / actual / hint` 四字段）；失败路径循 fail-fast 惯例（Agent 自修正重调，累计失败 ≥2 次上报用户）。

**写盘机制：** 工具做 read-modify-write——解析整份 state.yaml、只替换 structure 节、原样保留其他节。为此 mcp-server 引入 `yaml` 包依赖；`config.ts` 当年「零 YAML 依赖」立场是为单字段正则提取设计的，保结构往返时让位。

**读侧收尾（矛盾检测，不容错）：** App 解析后若「章卷映射为空或不完整但 `total_volumes > 0`」，走既有 `problem` 通道显式报「结构数据损坏」，不再静默渲染空树。不为退化形态 `"N:M": null` 做容错恢复——写侧机械化后该形态不再产生，存量损坏项目可数且可手工修复。

**改动面：** `commands/plan.md` 步骤 3 是唯一 structure 写入点，改为调用工具（章卷展开规则仍由 LLM 执行，产物从 Edit 改为工具参数）；`init.md` 脚手架的空 `{}` 合法无陷阱不动；`rewrite.md` / `review.md` / `write.md` 的读取场景不受影响。Agent Core 侧改动走 z-bump、CHANGELOG、lock 同步与 mcp-server 重新 build 的既有纪律。

## Considered Options

- **写侧 prompt 钉格式**：只在 plan.md 钉死序列化格式。否决——仍是 LLM 执行，弱保证，Engine contract 的脊柱数据不该靠提示词措辞守卫。
- **state.yaml 全文件机械化**：所有写入下沉为 MCP 工具组。否决——checkpoint 在每章写作热路径上高频更新，全机械化把工具调用开销塞进热循环，迁移面积与增量保护不成比例（平铺标量本来写不坏）。
- **按形状划线（map 节全下沉）**：structure + `word_count.by_chapter` 一起机械化。否决（暂缓）——by_chapter 今天没有程序化读取方；记为观察项，待 App 读取它时再并入同一通道。
- **零输入派生**：工具从 memory.db unit_meta facts 自行推导 structure，LLM 什么都不传。否决——让 state.yaml 写入耦合 db 可用性与入库时序，选择契约自包含的直传方案。
- **读侧退化形态容错**：App 自动识别 `"N:M": null` 并恢复。否决——机械写入落地后是死代码。

## Consequences

- `chapters_outlined` 与 Structure state 形成两种明确的状态治理模式：前者是文件系统的索引缓存（对账自愈），后者是经校验的机械写入物（工具拒写防损）。新增 state 字段时应先归类再选通道。
- `word_count.by_chapter` 与 structure 同属 map 形状、同陷阱，目前无程序化读取方，是已登记的观察项。
- App 对 structure 的矛盾检测是兜底信号位：未来任何未知损坏从「无声空白」变为「可见可行动」。
