# ADR 0021: 叙述人称是立项卡的受控必填字段，值域校验不被任何写入路径架空

## Status

Accepted

## Context

叙述人称（第一人称 / 第三人称限知 / 第三人称全知 / 多视角切换）对网文是关键设定：它决定读者代入方式与平台阅读习惯（番茄多数第三人称，第一人称也是成立赛道），且**必须全书一致**——中途漂移是明显的连续性事故。

现状缺口（#297）：人称此前只作为立项第 8 卡「叙述声音」（`narrator_voice`）的一个**可选英文 key 字段 `address`** 存在——自由文本、无枚举、不强制、不校验。`/setup` 立项对话若没专门聊到，它就**静默留空**，导致一部小说在立项结束时叙述人称根本没被明确定下来。

**调研结论（#297 AC 要求记录——address 缺失时写手的实际人称逻辑）**：腔调渲染 `renderStyleDirective`（`mcp-server/src/handlers/readers.ts`）以 `if (address) dims.push(\`以${narratorAddressPhrase(address)}叙述\`)` 守卫——**address 缺失时，根本不向写手的 `style_directive` 注入任何人称维度**。即没有隐式兜底：写手拿到的风格指令里完全没有人称约束，全凭模型自由决定，各章之间也无锚点保证一致。**确认「真有漂移风险、无兜底」，而非「已有隐式兜底」**——这是本决策的直接动机。

立项卡已是引擎拥有的结构化数据契约（ADR-0019）；本 ADR 是在该契约**内**把一个原本可选的自由文本字段提升为受控必填字段，并补上对应的入库校验。

## Decision

**采纳 #297 方向 A：把叙述人称提为受控值域的一等必填字段，全书强制一致。**

1. **受控值域 SSOT**：`schemas/premise-cards.json` 新增 `$defs.narrator_address` 枚举四值 `first_person` / `third_limited` / `third_omniscient` / `multi_pov`，作为 `narrator_voice` 卡 `address` 字段 value 的取值。enum 英文 snake_case，中文展示归渲染层（沿 ADR-0016）。

2. **入库校验两层分离（`checkNarratorAddress`）——关键设计，防止「受控值域」被任何写入路径架空**：
   - **值域合法性【无条件】**：只要本次提交的 `narrator_voice` 卡含 `address`，其 value 必须属受控值域（`certainty=open` 有意留白除外）。**任何写入路径都校验**，包括定点修订（`merge_cards=true`）——因为 `/revise-premise` 正是改人称的预期路径，绝不能成为绕过受控值域、写入「第三人称」等自由文本的口子。
   - **存在性【仅全量立项要求】**：`narrator_voice` 卡 + `address` 字段必须存在，仅 `novel_submit_premise` 的全量立项（`merge_cards !== true`）强制。定点修订只提交目标卡、payload 不带 `narrator_voice` 属正常 → 豁免，**不惩罚存量未填人称的小说**。

3. **prompt 同步**：`/setup` 用 AskUserQuestion 专门确认人称（标题人读中文、选定写入英文枚举）；`chapter-writer` 加「风格指令里的叙述人称是全书硬约束、不中途切换」；`premise-template.md` 第 8 卡补人称位。

4. **渲染层翻译（`handlers/narrator-address.ts`）**：`narratorAddressPhrase` 把枚举翻成中文短语，喂写手 `style_directive` 与 architect 腔调节；`premise.md` / `premise-cards.json` 数据态保持英文枚举，翻译统一在出口。

5. **App 同步**：`schema-field-labels.ts` 加枚举徽标 + 对照测试绑定 schema；`premise-cards.ts` value 翻人读徽标、字段标签「叙述人称」；`electron/main/novel/premise-client.ts` 程序化写入补 `merge_cards: true`（走存在性豁免，不被新校验拦）。

## Considered Options

- **方向 A：受控值域的一等必填字段（采纳）**：源头定死、下游强制消费，从根上消除漂移。代价是 `/setup` 多一步确认、全量立项多一条硬约束——但这正是要补的缺口。
- **方向 B：按 `subgenre` 给默认人称、作者可覆盖**：暂缓。番茄第三/第一人称都是成立赛道，按题材猜默认易错配，且仍需作者确认才稳，不如直接问。可作未来增强（AskUserQuestion 按题材预选高亮项），不改本 ADR 的「必填 + 受控」内核。
- **方向 C：维持现状 + 显式写手兜底逻辑**：否决。把「缺失时按某规则决定人称并锁全书」的兜底规则写进 `chapter-writer` prompt，违反弱模型 prompt 纪律（删一条规则优于加一条豁免，生成端不堆判断分支）；且兜底发生在写作端、缺立项源头锚点，仍可能各章不一，治标不治本。
- **校验「无条件 + 仅存在性可选」拆分 vs 整体按 merge 豁免**：初版（#297 首提交）把「值域合法」与「必须存在」捆在一起、整体按 `merge_cards` 豁免，被 PR #309 审核指出 `/revise-premise`（merge 路径）能写自由文本、架空受控值域。改为本 Decision 第 2 点的两层分离——值域无条件、存在性可选，是正确形态。

## Consequences

- **agent-core**：`schemas/premise-cards.json` 加 `$defs.narrator_address`；`checkNarratorAddress` + `writers.ts` 接入；`setup.md` / `chapter-writer.md` / `premise-template.md` prompt；新增 `handlers/narrator-address.ts` 渲染模块。
- **App**：`schema-field-labels.ts` 徽标 + 对照测试；`premise-cards.ts` 翻译与标签；`premise-client.ts` 补 `merge_cards`。
- **行为变更（仅全量立项路径）**：`novel_submit_premise` 全量立项现强制含合法 `narrator_voice.address`。新立项经 `/setup` 已会专门确认，正常通过。
- **存量小说零影响**：定点修订 / App 信心标记走 `merge_cards=true`，豁免存在性，不会因老小说未填人称被拦。
- **数据格式向后兼容**：`address` 存英文枚举、`premise.md` / `premise-cards.json` 数据态不变，已有客户端读取路径不破坏（沿 ADR-0008 schema 软门槛评估，仅新增被 `address` 引用的 `$defs` 值域，非顶层结构变更）。
- **同域关系**：在 ADR-0019（立项卡是引擎拥有的数据契约）内新增受控字段；中文展示沿 ADR-0016（机器字段/数据态不入用户通道，翻译归渲染层）。
