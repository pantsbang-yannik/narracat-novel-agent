# ADR 0012: Character UID Is The Canonical Character Identity

## Status

Accepted

> 2026-06-19 current reading: the core decision remains that Character UID is the canonical character identity. The field inventory in the original Context / Decision text predates Agent Core 4.0 and must not be used as the current implementation spec. The current shape is the #197/#198 alignment recorded below: outline references use `CharacterReference` where applicable, `pov_character` is a planning-time `CharacterReference`, memory write tools may accept names and resolve UID through `aliasMap`, and read tools are UID-first.

> 2026-06-14 细化（不翻转决策，clarity gate #196）：① UID 生成机制 = Agent Core 经 NovelMemory MCP mint 工具铸造（见 Decision「生成机制」段）；② 身份注释字段统一为 `name`（弃 `display_name`），与 `CharacterReference` 一致；③ pre-release 无线上老项目，#196/#197 落地后一次性 backfill 本地 dogfood、不留 string fallback 作产品行为。

> 2026-06-14 再细化（不翻转决策，clarity gate #197）：本 ADR 角色字段清单（Context/Decision 段的 `characters_in_chapter[]`、`emotions.character`、`summary.characters[]` 等）写于 agent-core 4.0 重构之前，与 4.0 现状已漂移；#197/#198 按以下对齐落地——① `characters_in_chapter[]` 不单设，章级出场角色由 `commit_chapter.characters_appeared` 唯一承担（4.0 禁双命名）；② `emotions` 4.0 已删、并入章摘要 `emotional_tone`，本 ADR「emotion character UID 化」不再适用；③ extraction 的 `summary.characters[]` 实为 `commit_chapter.characters_appeared`，不在 `submit_extraction` 契约内；④ 新增 `pov_character`（单个 `CharacterReference`，必填）落 `outline-structure` 章级、由 outline-architect 产出，不进 `commit_chapter`（POV 是规划期叙事决策，非章末事实）；⑤ 切片边界按 agent 产物归属划：**#197 = outline 侧**（`scenes[].characters` 硬切 + 新增 `pov_character`，零 NovelMemory 入库；`writers.ts` 只动 outline handler 的机械渲染取 `name`，不碰 memory-keeper handler）；memory-keeper 侧三写工具（`commit_chapter` / `submit_extraction` / `consolidate`）的角色引用与 `chapter_summaries` / `facts` / `character_cards` 存储及 `aliasMap` 归一是连通子系统，整体归 **#198** 一次 UID 化，避免半切。

> 2026-06-14 三细化（不翻转决策，#198 实施）：memory-keeper 侧角色 UID 化采「写侧 name + 工具内解析、读侧 uid-first」非对称方案——① **写工具入参保持 name**（`commit_chapter.characters_appeared`、`submit_extraction` 的 `facts[].subject` / `relationship_updates`），弱模型零负担；工具入口扩展 `aliasMap` 为 `name→{canonical_name, character_uid}`（解析角色档案 `character_identity` 注释）补 uid 后存储（符合「代码能算的绝不让 LLM 填」，弃 ADR 原「写工具入参直收 CharacterReference」字面）。② **读工具 uid-first**：`novel_character_state` 收 `character_uid`、`novel_relationship` 收 `character_a_uid` / `character_b_uid`（App / Character chat 调用方持 uid）。③ **DDL**（SCHEMA_VERSION 6→7，4.0 不迁旧库）：`facts` 加 `subject_character_uid` + `subject_character_b_uid`（relationship 两端按字典序；角色 fact 仅前者、以 `subject_character_b_uid IS NULL` 与 relationship 区分；非角色 subject 两者 NULL），`chapter_summaries.characters` 存 `CharacterReference[]` JSON，`character_cards` 加 `character_uid` 改主键 `(novel_id, character_uid)`。`subject` / `character` name 列保留作展示与调试冗余。

## Context

NarraCat 当前角色身份主要由人读名称或文件名隐式承担：`bible/characters/{name}.md`、`characters_appeared[]`、`characters_in_chapter[].name`、NovelMemory 的 `facts.subject` / `emotions.character` / relationship 字段，以及 App 侧 `character-${fileStem}` 对象 ID 都会把“这个角色是谁”和“这个角色叫什么”混在一起。Character chat / 唠个嗑需要一个稳定联系人身份，并且对话时要按同一身份补查 NovelMemory；未来角色改名、同名角色、读者模式、角色头像复用和 Character ping 都会放大名称主键的风险。

## Decision

Character UID 成为 NarraCat Agent Core 与 NarraCat-app 之间的 canonical character identity。角色设定契约下沉并持有 `character_uid`；角色显示名和角色文件名继续服务于人读、展示和文件组织，但不能作为跨文件、记忆或聊天记录的长期主键。

NarraCat Agent Core 拥有 Character UID 的生成和保留责任：创建新角色设定时生成 UID，更新既有角色设定时保留 UID。`character_uid` 使用 lowercase canonical UUID v4 字符串，不加 `char_` 等类型前缀，也不从角色名、文件名或显示名派生。NarraCat-app 只读取和使用角色设定中的 UID，不在 renderer 或 App 本机存储里临时发明角色身份。

**生成机制**：UID 由 Agent Core 的确定性代码路径铸造——具体为 NovelMemory MCP 提供的 mint 能力（`novel_mint_character_uid`，返回 lowercase UUID v4），因为角色设定由 LLM 主会话写 Markdown、prompt 内没有可靠的 UUID 生成环境。不由 LLM 在 prompt 里编造 UUID，也不由 App 生成（理由见 Considered Options）。`world` 命令 create 分支落盘前为每个新角色铸 UID 写入 `character_identity`，update 分支先读取旧文件保留既有 UID。当前 NarraCat-app 无线上老项目；#196/#197 落地后对本地 dogfood 现有角色设定做一次性 backfill，正式 schema 不保留 string fallback 作为产品行为。

角色设定文件用顶部一行 HTML 注释 JSON 承载身份元数据，保持 Markdown 正文仍以人读设定为主，例如 `<!-- character_identity: {"character_uid":"...","name":"林衍"} -->`。该注释应紧跟角色标题附近写入，由程序解析并在 Workbench 人读展示中隐藏；不使用 YAML frontmatter，也不把 UID 作为“基本信息”展示项。

新写入或新归一化的角色引用应携带 UID，并在需要给模型或用户阅读时同时保留显示名。NovelMemory 的角色事实、情感、关系、出场和角色状态查询应向 UID 收敛；App 的 `CharacterContact` 与 `CharacterChatTranscript` 也应以 Novel project identity + Character UID + user mode 归属。Character chat runner 接收 Character UID 并负责 UID-based NovelMemory lookup；renderer 不做角色名匹配或记忆路由。

跨契约的角色引用统一使用 `CharacterReference` 最小形状：`{ "character_uid": "<uuid-v4>", "name": "<display name>" }`。其中 `character_uid` 是机器主键，`name` 是显示和 LLM 可读冗余；新 schema 不再新增只有角色名字符串的引用字段。适用范围包括 `pov_character`、`characters_appeared[]`、`characters_in_chapter[]`、`characters_in_scene[]`、memory extraction 的 `summary.characters[]`、relationship 两端和 emotion character。旧 string 读取保留 fallback，新写入走 `CharacterReference`。

NarraCat-app 尚未正式上线，pre-release / internal dogfood 期间产生的 name-only 项目和记忆不属于公开兼容契约。实现可以用一次性 backfill、fixture 重建或手工重跑流程处理内部 dogfood 数据；公开产品契约从 Character UID 完整形态开始。实现过渡期可以在局部读取层保留 string fallback 以降低切片风险，但 fallback 不应成为产品行为或长期 Engine contract。

正式 schema 直接硬切到 `CharacterReference`：`chapter-metadata.json`、`outline-structure.json`、`memory-extraction.json` 和相关 validators 对新产物缺 `character_uid` 报错。实现期如需读取 name-only dogfood fixture，可以在局部 builder / test helper 做临时 normalize，但不能把 `string | CharacterReference` union 写进公开 schema。

NovelMemory 的角色相关存储使用可索引 UID 列，而不是把 `CharacterReference` JSON 塞进既有字符串字段。`chapter_summaries.characters` 可以保存 `CharacterReference[]` JSON 供回放和展示；`facts` 保留人读 `subject`，但角色状态事实应新增 `subject_character_uid` / `subject_character_name`；`emotions` 使用 `character_uid` + `character_name`；角色关系应是一等结构，至少持有 `character_a_uid/name` 与 `character_b_uid/name`，不再依赖 `subject = A-B` 组合字符串查询。Character chat 和角色状态工具按 UID 查询，名称只做展示和调试冗余。

NovelMemory MCP tool 接口也硬切为 UID-first，不新增平行的 `*_by_uid` 工具，也不保留旧 name 参数作为正式调用契约。`novel_character_state` 接收 `character_uid`；`novel_relationship` 接收 `character_a_uid` / `character_b_uid`；`novel_store_emotion` 接收 `character_uid` + `character_name`；`novel_store_summary.characters` 接收 `CharacterReference[]`；`novel_store_fact` 的角色事实入口接收 `subject_character_uid` / `subject_character_name`。工具返回可以包含 name 供展示，但查询和约束以 UID 为准。

Appeared character 判定归 Agent Core / NovelMemory reader，不由 App renderer 或主进程通过扫描文件和章节正文临时拼联系人列表。Character chat 需要的联系人列表应由契约化 reader 返回，至少包含 `character_uid`、`name`、`first_appeared_chapter`、`last_seen_chapter` 和 `setting_path`。App 只消费该结果来展示 Character contact，并用 `character_uid` 发起对话；已出场判定必须尊重 Chapter completed、章节元数据、NovelMemory 和角色设定完整性。

## Considered Options

- **继续使用角色显示名或文件名作为身份**：否决。改名、重名、别名、文件重命名都会破坏 Character chat transcript、NovelMemory 查询和未来头像/来信关联。
- **只在引用里保存 UID**：否决。UID 能保证机器关联，但对 LLM prompt、人读调试、Workbench 展示和迁移排错都不够友好；保留 `name` 冗余是可接受的反规范化。
- **把 `CharacterReference` JSON 塞进 NovelMemory 字符串字段**：否决。JSON 字符串能保留信息，但会让角色状态、情绪、关系和 Character chat 的 UID 查询退回全文/字符串解析，丢失索引和清晰约束。
- **新增一套 `*_by_uid` MCP tools 并保留旧 name tools**：否决。平行工具会让 Agent Core prompt、tests 和 Character chat runner 长期分叉；在未公开上线前，直接硬切现有工具接口更清晰。
- **由 App 扫描文件和正文判定 Appeared character**：否决。已出场是 Engine contract 语义，依赖 Chapter completed、章节元数据、NovelMemory 和角色设定完整性；放在 App 文件扫描里会让 Character chat 的知识边界变成 UI 推断。
- **只在 App 层生成联系人 ID**：否决。它能稳定 UI 和聊天记录，但无法成为 Agent Core、章节元数据和 NovelMemory 的共同身份锚点。
- **采用外部 Character Card ID 作为主身份**：否决。外部角色卡适合未来导入导出，不应取代 NarraCat 自己的角色设定和记忆契约。
- **用 YAML frontmatter 承载角色身份**：否决。NarraCat 的内容产物正文当前保持普通 Markdown，机器结构已有 HTML 注释 JSON 先例；frontmatter 更容易被用户误当作可编辑设定头，且会让 App 读取路径额外引入一套解析形态。
- **在角色设定契约中持有 Character UID**：采纳。它把身份源放在 NarraCat 已有的角色设定边界内，同时允许 App 和 NovelMemory 以同一主键协作。

## Consequences

实现应按垂直切片推进：先让角色设定模板和新角色创建/更新保留 UID，再硬切章节元数据、大纲角色引用、memory extraction、NovelMemory DDL / tools / readers，以及 App Character chat runner 改为 UID-aware。内部 dogfood 数据可通过一次性 backfill 或重建处理；最终查询路径应优先使用 Character UID，不把 name fallback 当作公开兼容承诺。NovelMemory DDL 变更应配套索引和查询工具参数更新，避免 Character chat 运行时依赖字符串匹配。Character chat 联系人列表应消费 Agent Core / NovelMemory reader 的 Appeared character 结果，而不是复制一套 App 侧判定。
