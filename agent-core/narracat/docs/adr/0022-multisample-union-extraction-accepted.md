# ADR-0022: 写循环按章抽取改多采样并集，去重只去全等

**状态**: accepted（2026-06-18）

写循环（write.md 步骤 6）的按章事实抽取，从「memory-keeper 抽一次落库」改为「**并行抽 K=3 次独立采样 → 取并集 → 只落一次库**」。根因实测：弱抽取模型（DeepSeek）单轮召回被**方差**主导——同一章抽三次分别得 9/14/15 条、配角身份在第 1 次全漏第 3 次全中，不是不会抽而是每次随机漏不同的东西；漏抽 = 永久记忆空洞（章节过去无人回头重抽）。dogfood《十日终焉》8 章受控评测（K=3、78 条盲标金标）：单轮总召回 ~59% → **三轮并集 80.8%（+21.8pp）**，配角身份 81% → **100%**。这是抽取召回（"记得全"地基）最大的杠杆，远超 prompt 调整（实测 prompt 改动在噪声内）。并集偏向覆盖：宁可留近重复，也不冒"误并把同一角色的两条不同事实合掉、悄悄丢一条"的风险。

去重**只去完全相同**的 (subject_uid｜subject, predicate, object)，近重复照存，交由下游角色卡折叠（按 UID+谓词收敛）与检索排序消化。

落地：MCP server 是纯 SQLite 数据层不调 LLM、memory-keeper 工具集不含 Task 无法自 fan-out，故 K 次独立采样只能由持有 Agent 的编排层（write.md）并行派发；新增暂存表 + 两个工具 `novel_stage_extraction`（每轮校验+UID解析后入暂存，不进正式 facts）与 `novel_commit_extraction_union`（读 K 份暂存、全等去重、走现有落库逻辑写一次、清暂存）。`novel_submit_extraction` 保留给 /rewrite、新角色追溯回填等一次性场景，与并集落库共用同一段内部写函数。

## Considered Options

- **方案 A（采纳）多采样并集 + 全等去重**：唯一有实测背书把召回从 ~59% 抬到 ~81% 的方案。代价 = 3× 抽取调用（几分钱/章，相对写一章 ~$4 可忽略；且并行派发延迟≈一次），facts 表约 1.5-2× 行（被消费端折叠吸收）。
- **方案 B 调 prompt / 加盲区规则**：#304 dogfood 实测单轮在噪声内（总召回 -0.4pp）；且给 memory-keeper 加"新角色身份→抽 identity"类规则与既有架构冲突（新角色身份属候选角色流程 ADR-0015，不属抽取；未建档→UID 孤儿 fact 进不了角色卡），已回退。否决。
- **方案 C 向量相似度去重**：实测否决。即便换强的小中文模型（bge-small-zh-v1.5），"该合的对"与"同角色不同事实的硬负例"分布**重叠**、最佳阈值仍 ~13% 误并——结构性原因是 fact 串里主语占主导，同角色的不同事实天然高相似，压不下去。13% 误并 = 悄悄丢事实，正是并集要避免的。
- **方案 D 多数投票（≥2 轮出现才留）**：提升精度但丢"只一轮抽到的稀有真事实"，与召回目标反向。否决。
- **方案 E LLM 合并去重 / memory-keeper 自身多趟**：LLM 合并可靠但又引弱模型判断+额外调用+方差；memory-keeper 无 Task 工具无法自 fan-out，单次调用内"想 K 遍"是相关样本、复现不了方差互补增益。否决。

## Consequences

- 新增暂存表（additive migration，bump SCHEMA_VERSION）；`novel_stage_extraction` / `novel_commit_extraction_union` 两个新工具同步 `electron/main/orchestrator/sdk-runner.ts` 白名单、memory-keeper.md tools、write.md allowed-tools。
- memory-keeper.md 抽取段从「调 novel_submit_extraction」改为「调 novel_stage_extraction」（agent 仍只产一份；K 次独立由 write.md 并行派发）；scaffold 段（ADR 无、属 #304）保留。
- write.md 步骤 6 改为并行派发 memory-keeper ×3 → 各 stage → 一次 commit-union。
- change_type：去重折叠跨样本冲突取更强信号（invalidate > update > new）；落库仍走现有 findExisting，不新增确定性重判。
- 验收 gate：确定性测试（stage / 全等去重 / commit-union）+ 用真机制重跑并集 A/B 确认 +21pp 兑现（真机数字放行，与 G0/G1 同标准）。
- 关联但解耦：实测顺带发现生产 embedding 模型配置失效（`shibing624/text2vec-base-chinese` + dtype q8 找不到文件 / 仓库布局不符 transformers.js）→ 向量检索一直静默降级为纯 FTS，影响"查得通"。单独立 issue 修（换 `Xenova/bge-small-zh-v1.5` 或修好加载），与本 ADR 无关。
