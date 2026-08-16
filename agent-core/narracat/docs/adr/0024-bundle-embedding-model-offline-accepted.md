# ADR-0024: embedding 模型打包进客户端（离线 / 免下载），打包档用 q8

**状态**: accepted（2026-06-19）

把本地 embedding 模型（`Xenova/bge-base-zh-v1.5`）**随安装包打包进客户端**，首次使用离线、免下载；打包档由 ADR-0023 的 fp32 细化为 **q8 量化**。

ADR-0023 修好了加载并选定 bge-base，但模型仍按 transformers.js 默认在首次 `embed()` 时联网从 HuggingFace 下载（fp32 ~388MB）到 `~/.narracat/models`。对桌面应用，首跑要联网 + 等几百 MB 是糟糕体验。本 ADR 让模型随安装包分发、纯本地加载。

## dtype：打包档用 q8（就 dtype 维度细化 ADR-0023）

打包对**安装包体积**敏感，故重测 bge-base 量化质量（eval/embedding/，同一真实语料）：

| 档位 | onnx 体积 | Recall@5 | Recall@10 | MRR@10 |
|---|---|---|---|---|
| fp32（ADR-0023 选） | 388MB | 72.1% | 80.3% | 82.7 |
| **q8（本 ADR 选）** | **98MB** | 69.2% | 77.3% | 77.4 |
| bge-small fp32（对照） | 90MB | 62.1% | 75.6% | 69.0 |

q8 仅比 fp32 低约 3pp recall / 5pp MRR，但体积省 290MB；且 98MB ≈ bge-small 体积却高 7pp——是打包性价比甜点。dev 与 prod 统一 q8（维度仍 768，向量表/迁移逻辑不变）。

## 加载来源切换

`embedding.ts`：若环境变量 `NARRACAT_EMBEDDING_MODEL_PATH` 指向客户端内置模型根目录，则 `env.localModelPath = <路径>` + `env.allowRemoteModels = false`（纯本地、禁联网）；否则回退 `env.cacheDir` 按需下载（开发态未打包时友好）。该路径下按 transformers.js 约定的 `{root}/Xenova/bge-base-zh-v1.5/...` 布局。

## 分发管线（App 层，仓库根）

- `scripts/prepare-embedding-model.mjs`：构建期把 q8 四件套（config.json / tokenizer_config.json / tokenizer.json / onnx/model_quantized.onnx）下载到 `build/embedding-model/Xenova/bge-base-zh-v1.5/`，各文件 SHA256 锁定、幂等跳过。**模型二进制不进 git 仓库**（`build/` 已 gitignore），与 `prepare-headless-agent-runtime.mjs`（内嵌 Node）同套路。
- `package.json` `build.extraResources` 加 `{ from: build/embedding-model, to: NarraCatEmbeddingModel }`；`scripts/package-rc.mjs` 在 electron-vite build 前加 prepare 步骤。
- `electron/main/narracat/embedding-model.ts` `resolveEmbeddingModelPath`：打包态解析 `<resourcesPath>/NarraCatEmbeddingModel`、开发态 `<appRoot>/build/embedding-model`，仅当权重 `model_quantized.onnx` 实际存在时返回（否则 undefined → 回退下载）。`sdk-runner.ts` `createNovelMemoryMcpServers` 据此注入 `NARRACAT_EMBEDDING_MODEL_PATH`。

## Considered Options

- **方案 A（采纳）构建期下载到 build/ + extraResources 打包**：与现有内嵌 Node runtime 完全同套路；仓库不背二进制；安装包自带模型。
- **方案 B 模型二进制提交进 git**：仓库永久膨胀近百 MB，否决。
- **方案 C 维持运行时下载**：零打包改动，但首跑需联网 + 388MB（或 98MB）下载，桌面体验差，正是本 ADR 要消除的。
- **打包 fp32 而非 q8**：质量 +3pp 但安装包 +388MB（vs +98MB）。桌面端体积优先，q8 性价比胜出；future 若要更高质量可换 fp32（仅改 prepare 文件清单 + embedding.ts dtype）。

## Consequences

- 安装包体积 +~98MB；首次 /write 秒出、全程离线（不再触发 HF 下载）。
- dev 态未跑 prepare 脚本时 `resolveEmbeddingModelPath` 返回 undefined → MCP server 回退按需下载，开发体验不变。
- 维度仍 768，不影响 ADR-0023 的向量表/`backfillVectors` 迁移逻辑。
- 打包 `.app` 真机 smoke（确认从 `resources/NarraCatEmbeddingModel` 离线加载、无联网下载）列为 release-gate，与 #127「Run Packaged Agent Runtime Smoke」同级。
- 新增 `embedding-model.test.ts` 覆盖 dev/packaged 路径解析与权重缺失判定。
