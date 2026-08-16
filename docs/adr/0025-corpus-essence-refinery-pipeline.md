# ADR 0025: 网文精华提炼工厂——维护者层离线产线，本地模型粗筛 + Claude 精修，三轨喂引擎

## Status

Accepted

## Context

写作质量北极星的主杠杆是**喂真人范例**而非加规则（`agent-core/narracat/CLAUDE.md`：「提质量优先『拿掉噪声＋信任模型＋喂真人范例』，而非加规则/门禁」）。ADR-0024 已把"正向功底靠范例承载、不进生成端 prompt"定为契约。issue #335 要补番茄向画面感/爽感范例进库，是这条线的"最后一公里"。

但用户准备的不是几段素材，而是**一批公开网络小说文本、覆盖 20 个细分类型**（存放于本地语料源目录，男频 8 + 女频 12 类型）。目标随之升格：不是一次性补几段，而是建一条**可持续产线**，把真人网文持续提炼成可复用精华灌进引擎——#335 只是它的第一炉成品。

三个现实约束决定了产线形态：

1. **超长文本无法人工/单上下文处理**：单本几十万~几百万字、几千章，没法读完挑出最好的若干段。
2. **成本与版权**：用 Claude/API 扫全量原料成本爆炸；且把受版权保护的全文送上云端有风险。
3. **本地算力可用**：用户有 M3 Ultra（512GB），可跑本地大模型（ollama，Qwen 系）。

现有可复用件齐全：标准化脚本（`tmp-corpus-normalize.mjs`）、corpus 入库标准（`corpus/README.md` + `lint:corpus`）、去文本化方法论（`text-decomposition-methodology.md`）、A/B 评测壳、受控词表（8 手法 × 8 情感）。缺的核心只有一环：把全文"粗筛成候选"的本地计算。

## Decision

**建一条维护者层（`scripts/corpus-factory/`）的离线 map-reduce 产线，不进运行时引擎；本地模型管广度、Claude 管精度，产出按三轨喂既有载体。**

1. **管线（map-reduce）**：`① 标准化（复用，泛化到多格式全批）→ ② 启发式预筛 → ③ 本地模型 MAP 粗筛（M3 Ultra/ollama，逐章出 style/structure 候选，json schema 约束）→ ④ Claude REDUCE 精修（判断 + 合规，见 REDUCE-RECIPE.md）→ ⑤ lint 入库 → ⑥ 真稿验收`。本地模型免费、全文不出本机/局域网（版权安全）；Claude 只处理短候选。

2. **三轨产出映射既有载体**：**A 写作范例**→ `corpus/extracts/*.json` →`WritingContextPack.style_examples` / `novel_query_style_reference` MCP；**B 剧情/结构手法**→ `novel-structure`（注 outline-architect）/ `novel-web-craft`（注 chapter-writer）skill references，对接 #338-341；**C 方法规则**（写手/世界观/大纲规划）→ 对应 skill（世界观 home 待定）。

3. **分工铁律**：本地模型候选**不可直接入库**，必过 Claude 精修——这道关守住"不在于多在于精准"。沿用引擎既有纪律：无机制注解不入库、受控词表不造新 tag、生成端零负面、去文本化、出处中立、宁短勿长。

4. **版权与存储纪律**：原料全文 + 候选（含较长 excerpt）→ gitignored `corpus-factory-data/`，**永不入仓**；仓库只收**剪短(100-300字)+带机制注解**的范例（Track A，与现存已提交范例同质）和**去文本化无专名**的方法骨架（Track B/C）。

5. **覆盖策略**：原料题材分层完整，工厂以"频道×类型"为坐标按取向均衡补齐 corpus 现有的题材偏科（偏古风/耽美/文艺，缺番茄向快节奏）。#335 = 第一刀（番茄向切片）。

## Considered Options

- **本地模型粗筛 + Claude 精修（采纳）**：本地吃"扫全文"的脏活（免费、版权安全），Claude 吃"判断与合规"的精活。可持续、可规模化、成本可控；唯一代价是需维护一条维护者层产线，但与运行时引擎完全隔离。
- **纯 Claude/API 扫全文**：质量最高但全量原料成本爆炸、全文上云有版权风险、不可持续。否决。
- **纯人工拆解**：质量可控但全量原料 × 持续扩充不可行。否决（一手拆解仍是精修阶段的判断内核，但"找候选"这步必须自动化）。
- **把范例/手法直接塞进生成端 prompt**：违背"喂真人范例而非加规则"与弱模型 prompt 纪律（宁短勿长）。否决——范例走 corpus/MCP，手法走 skill 且 N≥2 精选。

## Consequences

- **新增**：`scripts/corpus-factory/`（normalize / mine / dashboard / serve + lib + schemas + REDUCE-RECIPE.md + README）维护者工具；产物在 gitignored `corpus-factory-data/`。
- **增量改既有资产**：corpus `extracts/*.json` + `index.json` + `query-index.md` + `novel-style-reference/SKILL.md`（Track A）；`novel-structure` / `novel-web-craft` references（Track B/C，少而精）。
- **不动**：引擎运行时契约、受控词表值域（用现有 8×8）、App 硬契约、schema（无漂移）。
- **#335** 成为产线第一炉（番茄向切片），收口时重生真稿基线 ch-008/009 验证 `style_examples` 含番茄向样本。
- **配套**：实时/静态看板（`serve.mjs` / `dashboard.mjs`）；世界观方法 home 在 Phase 3 定（新建 `novel-worldcraft` 或并入）；全量规模化精修可选 Workflow 多 agent（需另行 opt-in）。
- **同域关系**：落在写作质量北极星（喂真人范例）与 ADR-0024（正向能力靠范例承载）之内；沿用 corpus 入库标准（无机制注解不入库）、`agent-core` 一手拆解优先纪律、ADR-0011（reading-attraction-first）；与网文感修复线（issue #332-341）对接。
