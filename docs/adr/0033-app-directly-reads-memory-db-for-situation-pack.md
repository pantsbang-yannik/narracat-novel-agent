# ADR 0033: 唠个嗑处境包由 App 主进程直读 memory.db 组装（引擎契约例外）

## Status

Accepted（2026-07-15 产品拍板；A4×D2 片4 随实施落定，总设计见
`docs/superpowers/specs/2026-07-15-a4d2-slice4-situation-pack-design.md` §3/§7）

## Context

「唠个嗑记忆消费缺口」（角色不记得相关人物/不知最近章）根因是召回**指望模型主动查**——
聊天 prompt 里有工具但模型不稳定调用。修法是把召回从"指望模型查"变成"永远在场"：每轮
聊天前确定性预注入一段结构化「当前处境包」（状态区/关系区/亲历区），零 LLM、零额外进程。

产生处境包有两条路：① 引擎出一个新 MCP 工具/契约，App 每轮调用；② App 主进程直接只读
`memory.db`（复用片1 状态卡通道已验证的 `MemoryDbReader` / `OpenMemoryDb` 接口），零
IPC-to-agent 往返。实测引擎 Agent 进程冷启动 2s+（headless runner spawn + SDK 初始化），
不可接受地拖慢每轮聊天延迟——处境包必须在用户发消息后立刻可用，不能等一次新的 agent run。

## Decision

**App 主进程直读 `memory.db` 组装处境包**，作为「App 只依赖引擎稳定契约」总原则
（见根 CLAUDE.md）的一次显式例外，理由：

- **决策**：`buildCharacterSituationPack`（`electron/main/orchestrator/character-chat-situation.ts`）
  在主进程零 LLM 直读 `facts` / `character_cards` / `chapter_summaries` 表，产出结构化文本
  注入聊天 prompt。否决「引擎出契约」方案——依据是引擎冷启动实测 2s+，不可能进每轮聊天的
  时延预算；直读复用片1（角色状态卡）已验证的只读通道先例，不是新开口子。
- **边界**：只经 `openMemoryDbReadonly`（`node:sqlite` `readOnly: true`）打开，App 对
  `memory.db` **零写权限**——所有写入（`facts` / `character_cards` / secret 打标）仍全经
  引擎工具入口（`novel_submit_extraction` / `novel_submit_authored_state` /
  `mark_secret_known`）。处境包产物只消费于聊天 prompt 注入与（未来）状态卡展示，不作为
  任何其它子系统的输入。
- **对齐机制**：App 侧的有效性/排序判据——纠错作废行判定（`invalidated_at_chapter` vs
  自身生效章）、`COALESCE(event_chapter, from_chapter)` 生效章口径、章内折叠 tiebreak
  （事件章 → authored 压 extracted → created_at → rowid）——与引擎侧 F3
  （`fact-temporal.ts` 的 `FACT_LATEST_ORDER_SQL`）同规，两处语义必须镜像；
  `character-chat-situation.test.ts` / `character-state.test.ts` 留有契约哨兵测试钉住，
  引擎侧判据变更需同步复核 App 侧拷贝。
- **替换接缝**：`buildCharacterSituationPack(input): Promise<string>` 是唯一入口，签名
  只依赖 `projectPath` / `characterUid` / `characterName` / `knowledgeBoundaryChapter` /
  `openMemoryDb`。将来引擎若出确定性处境包契约（如工具化或 SQL 视图下沉），整体替换本
  函数实现即可，调用方（`character-chat-runner.ts`）与签名不动。

## Consequences

- 处境包在用户发消息后立即可用，不吃 agent 冷启动延迟；降级颗粒度两区不同——状态区读取
  失败在 `readCharacterStateSnapshot` 快照层内部消化（DB 打开失败/SQL 异常均捕获后返回
  不可用空态，不上抛），关系区/亲历区共用同一 `MemoryDbReader`，异常时无分区 catch、整包
  组装失败，由 `character-chat-runner.ts` 降级为无处境包继续聊天——这是接受的设计，不阻断
  唠个嗑，但关系区/亲历区没有状态区那样的单区块韧性。
- App 侧多出一份「有效性/排序判据」的镜像拷贝，需要人工维护与引擎侧同步——契约哨兵测试
  是防漂移的唯一机械手段，引擎侧改 F3/`FACT_LATEST_ORDER_SQL` 时必须同看本 ADR 与
  `character-chat-situation.ts` 头部注释。
- **真机 dogfood 只读副本验证（片4 收尾）额外发现**：生产库的 `meta` 表实际从未写入过
  `novel_id`（引擎侧无写入口，只有测试手工补种），且部分存量库未跑过引擎 v17 迁移（缺
  `facts.source` 列）——`character-state.ts`（片2b）与本模块此前对这两种情况硬 bail/缺列
  探测不全，会让处境包与角色状态卡在所有真机数据上恒返回空。已在片4 收尾一并修复为与
  `appeared-characters.ts` / `candidate-characters.ts` / `novel-status-memory.ts` 一致的
  「novel_id 有则过滤、缺失全表读（单库单小说）」兜底 + `factsHasSource` 探列，回归测试见
  `character-state.test.ts` 与 `character-chat-situation.test.ts` 的
  `skipNovelId` / `PRE_SOURCE_LEGACY_DDL` 用例。
