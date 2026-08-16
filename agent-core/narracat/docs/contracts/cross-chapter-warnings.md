# 契约：跨章预警纯代码扫描

> **定位：** 本文件是跨章预警纯代码扫描的算法 SSOT。扫描属于 `novel_build_writing_context_pack`（WCP builder）的代码逻辑：组装上下文包时执行，结果写入 WritingContextPack 的 `warnings` 数组（chapter-writer 按 WCP 契约逐条回应）。运行时 prompt 不执行、不复述本契约的规则与阈值。
>
> **当前实现两类客观连续性扫描**（见 §4.2 / §4.3，代码在 `mcp-server/src/handlers/readers.ts` 的 `getCrossChapterWarnings`）：伏笔无 reveal、锚点泛泛。两者都是确定性、与写法风格无关的连续性信号。
>
> **不做「语言模式重复 / 收尾手法轮换」类扫描**：网文靠模式重复建立节奏期待（每章打脸、每章钩），"避免重复近章手法"是错误诊断；防 AI 腔交给范例引力与体裁档位，不靠跨章轮换压制。原 §3 / §4.1 的 ⟳ 语言模式扫描已据此退役，仅保留 §2/§4.2/§4.3 的客观扫描。
>
> **修改纪律：** 任一规则的阈值或算法语义变更只改本契约；阈值微调（基于实测）只改 §1 阈值表。
>
> **设计原则：** "纯代码扫描"指确定性逻辑——字符串运算、字典查表、字段聚合，无 LLM 推断参与。

---

## §1 阈值表（顶部集中，可调）

| 参数 | 当前值 | 含义 | 调整方向 |
|---|---|---|---|
| `ABSTRACT_RATIO` | 0.5 | 锚点 core_experience 抽象词占比阈值（≥ 此值判定为"泛泛"） | 误报多→升；漏报多→降 |
| `NO_REVEAL_WINDOW` | 3 | 连续无伏笔 develop/reveal 章数（≥ 此值触发预警） | 故事节奏快→降；慢节奏小说→升 |
| `FORESHADOW_SETUP_WINDOW` | 8 | 伏笔兑现预警的铺设期免触发窗口（章号 ≤ 此值不触发） | 开局铺垫长→升；追更快节奏→降 |

阈值微调应基于实测数据。无实测数据时按默认值。

---

## §2 抽象词词典（锚点泛泛预警用）

判定锚点 `core_experience` 中抽象词占比时，**抽象词清单**：

**情感强度抽象词：** 震惊 / 打击 / 崩塌 / 动摇 / 震撼 / 觉醒 / 警醒 / 心境 / 起伏 / 波动

**转折/变化抽象词：** 转折 / 转机 / 转变 / 变化 / 改变 / 蜕变 / 跨越 / 突破

**程度抽象词：** 重大 / 关键 / 重要 / 深刻 / 根本 / 彻底 / 全面 / 巨大

**模糊指代抽象词：** 某种 / 某个 / 某些 / 一切 / 所有 / 整个 / 全部

**抽象词占比算法：**

1. 接收一段文本 `text`（一句话 `core_experience`，如 "主角第一次直面父辈的过往"）
2. 提取所有"有意义"的实词（去除虚词如 的/了/和/在/是/有/对/与 等连接性字符）
3. 在剩余字符序列中统计**与抽象词词典子串匹配**的字符数 `n_abstract`
4. 计算占比：`ratio = n_abstract / total_meaningful_chars`
5. 若 `total_meaningful_chars < 4`（极短）→ 返回 0（不判定为泛泛）

**示例：**

| core_experience | 抽象词占比 | 判定 |
|---|---|---|
| "主角第一次直面父辈的过往" | 0（无抽象词） | 具体 ✓ |
| "重大的转折与变化" | ~0.83（重大/转折/变化全是抽象词） | 泛泛 ❌ |
| "在书房抽屉里发现那封信" | 0 | 具体 ✓ |
| "震惊与警醒后的觉醒" | ~0.71 | 泛泛 ❌ |

---

## §4 预警规则汇总（2 类）

### 4.2 伏笔无 reveal

**数据源：** `getForeshadowingDue` 的 due-list（含 planted 过滤 + 白名单穿透）与伏笔动作日志（actions_log；状态可经 `novel_foreshadowing_status` 按最新动作导出：registered / planted / developing / revealed）

**算法（判据 = 「确有到期账」，spec §4.1 P2；非「随便有条活跃伏笔」）：**

1. 取 due-list 中 `target_reveal` 落在临期窗口内的条目（数字型 `target_reveal` 且 `≤ 本章 + 10`，与 due-list 既有临期规则同款阈值）——记为「到期账」`dueSoon`
2. 已种下但远期（`target_reveal` 超出临期窗口，含恒纳入 due 的远期 major）不计入 `dueSoon`：光有一条 major 挂在 due 里不构成「到期账」
3. `dueSoon` 非空且章号过铺设期（`chapter > FORESHADOW_SETUP_WINDOW`，=8：前 8 章是铺设期，不催结算）才继续判定
4. 检查最近 `NO_REVEAL_WINDOW`（=3）章内是否发生过任何伏笔的 `develop` 或 `reveal` 动作
5. 若无任何动作 → 触发

**触发条件：** `dueSoon.length > 0` 且 `chapter > FORESHADOW_SETUP_WINDOW`（=8）且连续 `NO_REVEAL_WINDOW`（=3）章无 develop/reveal 动作

**输出文本：** `"已连续 N 章无伏笔兑现，建议本章安排小结算"`

**缺数据降级：** 无「到期账」（`dueSoon` 为空，如全部活跃伏笔都是远期）→ 该规则跳过（没有真正临近的伏笔需要催结算）

### 4.3 锚点泛泛

**数据源：** 前 3 章 ChapterBrief 的锚点 `core_experience`（chapter_summaries.anchor_core，与 WCP `previous_chapter_briefs[].core_experience` 同源）

**算法：** 按 §2 抽象词占比算法对每章 `core_experience` 计算 `ratio`

**触发条件：** 前 3 章中**各章 ratio ≥ `ABSTRACT_RATIO`（=0.5）的章数 ≥ 2**（即多数章节锚点偏抽象）

**输出文本：** `"前 N 章锚点描述偏抽象（{抽象比例最高的 1-2 个 core_experience}），本章 outline 可能也需要细化"`

**缺数据降级：** 缺 `core_experience` 或为 null → 该章不计入分母；可用章 < 2 → 该规则跳过

---

## §5 整体执行约定

1. **顺序执行 2 类规则**，每类独立判定；同一次构建产出 0-2 条预警
2. **任一规则缺数据 → 跳过，不报错**
3. **写入 WritingContextPack 的 `warnings` 数组**（连贯性预警通道，随包喂写手；与预算截断/渲染降级诊断**分流**——后者只经工具返回值回主会话，不共用同一数组）
4. **缺数据情况下整个扫描可全跳过**（如新项目第 1-2 章，无前章 brief）

---

## §6 验收用例

- 构造连续 3 章无伏笔 develop/reveal → 触发 4.2 预警
- 构造前 3 章 core_experience 全含 "震惊/打击/崩塌/转折/变化" → 触发 4.3 预警
- 阈值调整（如 `ABSTRACT_RATIO` 0.5 → 0.6）后边界用例行为应可控变化
