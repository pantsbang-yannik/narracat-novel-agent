# ADR-0023: 横向对比后将生产 embedding 换为 bge-base-zh-v1.5，修复向量检索静默降级

**状态**: accepted（2026-06-19）

本地 embedding 从 `shibing624/text2vec-base-chinese`（768 维、`dtype:q8`）换为 `Xenova/bge-base-zh-v1.5`（768 维、`dtype:fp32`、CLS pooling）。根因实测：text2vec 仓库在 transformers.js 下加载必败——`dtype:q8` 找的 `model_quantized.onnx` 该仓库不存在，且文件布局不符 transformers.js（`tokenizer.json` 在 `onnx/` 子目录、root 缺）。结果 `getExtractor()` 每次 catch、`initFailed=true`、`embed()` 恒返回 null、`memory_vec` 永不写入，hybrid 检索一直静默降级为纯 FTS——「查得通」的语义召回（semantic_context / 相似度路）实际从未上线。佐证：缓存 `~/.narracat/models/shibing624/...` 只有 config、无 onnx 权重；真实 dogfood 库 novel-3615 的 `memory_vec` 行数实测为 0。

选型不凭口碑，而是**在真实小说记忆语料上横向实测三个候选再定**。

## 横向对比（真实数据驱动）

语料：dogfood 武侠小说 novel-3615 的 83 篇记忆（76 facts + 7 chapter_summaries），22 条手工标注金标查询（含刻意构造的「关键词不重叠、只有向量能命中」的 semantic 桶）。每个模型按其**正确用法**跑（bge=CLS 池化无 instruction；Qwen3=last-token 池化 + 查询加 `Instruct:…\nQuery:…`）。harness 与金标见 `eval/embedding/`。

| 模型 | 维度 | Recall@5 | Recall@10 | MRR@10 | 语义桶 R@5 | 体积 | embed |
|---|---|---|---|---|---|---|---|
| FTS5-trigram（降级现状基线） | — | 14.7% | 19.0% | 24.8 | 25.0% | 0 | — |
| bge-small-zh-v1.5 | 512 | 62.1% | 75.6% | 69.0 | 71.7% | 91MB | 8.4ms/篇 |
| **bge-base-zh-v1.5（采纳）** | **768** | **72.1%** | **80.3%** | **82.7** | **80.8%** | 389MB | 49ms/篇 |
| Qwen3-Embedding-0.6B（q8） | 1024 | 49.8% | 63.5% | 64.4 | 40.8% | 596MB | 84ms/篇 |

结论：bge-base 全维度最优，且 768 维 = 既有 `memory_vec` 维度，免维度重建。Qwen3 反而垫底——已排除 harness 因素（补 EOS 的正确 last-token 用法、升 fp16 精度均未翻盘，最佳 R@5≈50%），结构性原因是 LLM 式 last-token embedding 强在长文本/指令检索，而本场景是**短中文事实三元组**，bge-zh 这类专训中文句相似度的编码器更对路；且 Qwen3 最重最慢、对桌面端内嵌 MCP 不友好。FTS-only 仅 14.7% 印证降级之害。

## Considered Options

- **方案 A（采纳）`Xenova/bge-base-zh-v1.5`**：实测查准最高，且 768 维免迁移重建。代价 = 389MB 下载、49ms/篇（写入侧每章约 +2s，可接受）。
- **方案 B `bge-small-zh-v1.5`**：体积/速度最优（91MB、8ms），但查准 −10pp 且需 512 维迁移。桌面端资源极敏感时的退路。
- **方案 C `Qwen3-Embedding-0.6B`**：MTEB 高分模型，但在我们真实数据 + 桌面约束下查准垫底且最重，否决。佐证「凭口碑选型不可靠，必须实测」。
- **方案 D 修好 text2vec 加载**：对非 transformers.js 打包的仓库强行指定 dtype/文件名 + subfolder 绕过布局不符——脆弱 hack 且质量未必如 bge。否决。
- **`dtype` 选 fp32 而非量化**：fp32（389MB）权重确定存在、质量无损；bge-base q8（约 100MB）可作后续下载体积优化，但需一次快速 re-eval 确认量化不掉点，本次不引入。
- **pooling 保持 mean / 查询加 bge 检索指令前缀**：bge 原生池化是 CLS，改 CLS；查询指令对 v1.5 收益边际且破坏 `embed()` 单入口对称性，不加。

## Consequences

- `embedding.ts`：`MODEL_NAME`/`EMBEDDING_DIM`(768)/`dtype:fp32`/pooling:cls 改动；`getEmbeddingDim()` 契约不变（消费端只读它，不硬编码维度）。
- `vec.ts`：`initVecTable(db, dim=getEmbeddingDim())` 维度单一来源 + 旧维度检测整表重建（本次 768→768 不触发，但保留以防未来换维度模型）；新增 `backfillVectors(db, novelId)`（幂等、缺口门控、逐条插入不持有跨 await 事务、可后台与工具调用并行）。
- `index.ts`：`main()` 在 `server.connect` 后 fire-and-forget 调 `backfillVectors`，不阻塞 MCP 握手；无缺口时内部直接返回、不加载模型，故健康库与新项目启动零额外开销。
- `eval/embedding/`：保留可复现 embedding 选型 harness（build-corpus / run / gold）；私有小说语料 `corpus.json` 不入库（gitignore）。换维度模型或新增候选时重跑即可。
- 模型仍按 transformers.js 默认在首次 `embed()` 时从 HF 下载到 `~/.narracat/models`（`env.cacheDir`）；生产首次使用需联网下载（bge-base fp32 约 389MB）。离线/预打包模型不在本 ADR 范围。
- 不改任何 schema、不改 SCHEMA_VERSION（memory_vec 不在 migrate.ts DDL，维度逻辑在 `initVecTable` 内自洽）；不改运行时 prompt（agents/skills/commands），无 provenance 影响。
- 解除 ADR-0022 §Consequences 末记录的「生产 embedding 配置失效」遗留项。
