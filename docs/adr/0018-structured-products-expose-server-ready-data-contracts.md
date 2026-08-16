# ADR 0018: 结构化创作产物对外暴露 server-ready 数据契约

## Status

Accepted

## Context

App 要在 Workbench 结构化浏览创作产物（审校报告、大纲家族、立项卡、叙述者腔调等），把机器字段渲染成人读 UI（ADR-0016）。这些产物的结构化真相在 NovelMemory `memory.db`——引擎内部存储，只有 NovelMemory MCP 工具能读写，App 主进程不触达它（写权限模型 + 分发边界 ADR-0017）。

于是反复出现两种取数倾向，都已被实践证否：

1. **App 解析人读 markdown 反推结构。** 叙述者腔调走过这条路（#141 统一 parser 解析 `## 叙述者腔调` 文本），随即发现是有损往返、需要 #142 还债。ADR-0014 已给出判据——「坏格式只杀程序化读取方」：Agent 自读文本能"看懂"，炸的只有程序化解析的 App，且 agent-core 一改渲染格式 App 就静默崩。
2. **结构化真相只入 memory.db。** 审校报告即如此——`novel_submit_review` 把 verdict + issues 入 `chapter_reviews` 表，App 够不着，结果 `/status` 只能 grep `审修结果: FAIL` 文本锚点凑未过审清单（同样是「程序化读取方解析文本」）。

同时产品方向明确走向服务端（ADR-0017 服务端边界、#130 server-ready 动作契约）：未来引擎与数据可能在服务器，App 通过 API 取数。任何「App 解析本地 markdown 文件」的设计届时连渲染层都要重写。

## Decision

**结构化创作产物的 App 契约面是「机械写入的结构化数据契约」；App 消费契约、绝不解析人读 markdown 反推结构。**

三层分离，各自独立演进：

- **真相**：`memory.db`（今本地 SQLite → 未来服务器 DB），引擎内部，App 不直接触达。
- **数据契约（DTO / schema）**：稳定层。复用引擎既有读契约（如审校 = `novel_get_review` 的 `{ chapter, verdict, issues[] }` 形态），不为 App 另造格式。
- **传输**：实现细节，可插拔。今天本地以独立结构化文件（如 `reviews/ch-NNN-review.json`）承载；未来换服务端 API。App 侧以 data-source 抽象隔离传输，渲染层只面向契约。

推论：

- **人读视图由消费方从 DTO 渲染**，不作为 App 取数的数据源。当人读 markdown 本体不再有程序化消费者时应废除（如审校报告废 `ch-NNN-review.md`），让 App 渲染层 server-ready——不依赖会随服务端化消失的本地文件。
- **机械同源的「双写」不违反零双形态纪律**：由同一工具一次生成结构化与（如需的）人读形态，不存在 LLM 双写或人工同步的漂移——零双形态纪律防的正是后者。
- **真相在库即可重灌契约**：存量迁移从 `memory.db` 重新导出结构化文件，不靠解析旧 markdown。

## Considered Options

- **App 解析人读 markdown 本体**：否决。有损往返、渲染层耦合文本格式、服务端化时连渲染层一起报废（ADR-0014 反模式的 App 版）。
- **结构化真相只入 memory.db、App 不可达**：否决。逼出 `/status` grep 文本锚点这类绕路，App 拿不到结构化浏览所需数据。
- **结构化契约 + 可插拔传输**：采纳。契约与渲染层跨本地→服务端不变，仅传输适配可换；与 ADR-0014 / 0016、#130 同向。

## Consequences

- **审校报告是首个落地**：`novel_submit_review` 改为落 `reviews/ch-NNN-review.json`（DTO）并废除 markdown 本体；`/status` 未过审清单改走结构化 MCP 查询（取代 grep 锚点）；agent-core 硬契约清单移除 `审修结果: PASS|FAIL` 锚点；App 经 data-source 读 `.json`、ReviewReportView 从 DTO 渲染（复用 #243 映射）；存量从 `chapter_reviews` 重灌 `.json`。
- **大纲（#248）、立项卡（#249）、叙述者腔调（#142）收编同一模式**：各自定 DTO 契约 + 结构化文件传输 + App 渲染层，逐步替换 markdown 解析。
- **agent-core 增「落结构化契约文件」职责**：写产物时除引擎入库外，机械落一份 App 契约面文件。
- **CONTEXT「ReviewReport JSON 孪生」词条作废重写**：旧的「文件末尾注释孪生 + Workbench 剥离、不二次结构化」立场（基于旧版审校模型）被本 ADR 取代。
