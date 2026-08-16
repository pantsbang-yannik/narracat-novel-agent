# ADR-0025: facts 轻量双时间轴（event/ingestion + invalidated_by），不强迫弱模型填 event

**状态**: accepted（2026-06-19）

G4b（#308）要把 facts 时序模型升级以支持时点回溯。读码发现现状已比 issue 设想的高：`from_chapter`（NOT NULL，写入口**代码**从抽取 envelope 取当前章填入，弱模型不碰章号）+ `invalidated_at_chapter` + 折叠判定 `from_chapter <= at AND (invalidated_at_chapter IS NULL OR invalidated_at_chapter > at)` —— **已支持按 `at` 章做时点回溯**（见 `novel_character_state` 的 `at_chapter`）。

完整双时间轴（Graphiti）的增量价值**只在 event ≠ ingestion 时**才有：倒叙 / 补叙 / 预叙（第 8 章揭示「其实第 1 章就是卧底」：event=1、ingestion=8）。而要表达这种分离，若让弱模型在抽取时判断「事件发生章」，直接违反弱模型纪律（「代码能算的绝不让 LLM」+ 多判断字段→漂移，G0② 实测铁证）。

## 决策（轻量双轴）

1. **双轴字段**：facts 加 `event_chapter`（事件在故事世界发生的章）。现 `from_chapter` 正名为 **ingestion 语义**（事实被记录 / 抽取章，代码填）——列名保留，避免牵动 rollback / 折叠 / G3 图构建 / G4a 一大片代码。`event_chapter` 默认 = `from_chapter`。
2. **不碰抽取入口、弱模型零新负担**：`event_chapter` 由写入口代码默认填 = 当前抽取章（= `from_chapter`）。`memory-extraction` schema **不变**，弱模型仍只填 `change_type`、不填任何章号。event ≠ ingestion 的填充（倒叙 / 补叙）留作者修订工具 / 后续增量；本切片把列与查询语义立为**接口**。
3. **`invalidated_by` 指针**：facts 加 `invalidated_by`（指向使其失效的 fact id），与 `invalidated_at_chapter` **并存**（后者仍是折叠 / rollback 的章号依据）。`update` 失效旧值时代码填新 fact id——确定性、即时可用的失效溯源（"被哪条新事实取代"）。
4. **时点回溯改按 `event_chapter`**：折叠 / 回溯查询的生效判定从 `from_chapter <= at` 改用 `event_chapter <= at`。默认相等 → **零回归**；倒叙事实（event < ingestion）时按 event 回溯才语义正确（"故事世界第 X 章的真实状态"）。
5. **rollback 保持 ingestion 视角**：rollback 是回滚**写作进度**，按 `from_chapter`（记录章）/ `invalidated_at_chapter` 删除与恢复**不变**；恢复曾失效的旧事实时，连同清 `invalidated_by = NULL`。
6. **迁移**：additive 加 `event_chapter`（回填 = `from_chapter`）+ `invalidated_by`（NULL），bump `SCHEMA_VERSION` 12→13，逐版本幂等加列、零数据丢失。

## Considered Options

- **方案 A（采纳）轻量双轴**：低弱模型负担（零新判断字段）、确定性、零回归、立刻拿到 `invalidated_by` 失效溯源、双轴 schema + 查询语义接口就位。代价 = 倒叙填充入口留后续，在有人填非默认 `event_chapter` 前 event 恒等 ingestion。
- **方案 B 完整双轴（弱模型 / 规则判 event）**：表达力最强，但弱模型判倒叙补叙的可靠性低、漂移风险高，与弱模型纪律正面冲突。否决。
- **方案 C 仅 `invalidated_by`**：现状单轴已够 ingestion 回溯，但不预留 event 轴 = 将来要做倒叙得再迁移一次 schema。轻量双轴只多一个 additive 列就把接口立好，增量极小。否决（不如 A 留余地）。
- **方案 D 暂缓 / 关闭 #308**：现状够用，但 `invalidated_by` 溯源 + event 轴接口是低成本的长期价值，且为 epic #302 收官。否决。

## Consequences

- facts 表 +`event_chapter` +`invalidated_by`（additive，bump SCHEMA_VERSION 13）。
- 写入口 `commitResolvedFacts`：新 fact `event_chapter = from_chapter`；`update` 旧值 `invalidated_by = 新 fact id`（与 `invalidated_at_chapter` 一并写）。
- 折叠 / 回溯（`novel_character_state`、`character_statuses`、`relationship`、角色卡折叠）：生效判定改 `event_chapter`（默认相等 → 零回归，需回归测试护航）。
- rollback（`novel_rollback_chapter`）：按 `from_chapter` / `invalidated_at_chapter` 不变；恢复旧事实时清 `invalidated_by`。
- `memory-extraction` schema 不变；弱模型零新负担。
- 下游影响评估（ADR-0008）：G3 PPR 图构建、G4a 冲突检测用 `subject_character_uid` / `invalidated_at_chapter IS NULL`，不受 event_chapter 影响；唯一行为面是折叠改判定列，由零回归测试覆盖。
- 是否暴露「双视角时点回溯」查询参数（event vs ingestion）：本切片折叠默认 event 视角即可，不新增工具参数（留接口，按需再加）。
- 验收 gate：schema 迁移幂等测试 + 折叠 / rollback 零回归 + event 视角时点回溯确定性测试 + `invalidated_by` 溯源测试；mcp build + 全量 test + 5 lint + App 版本闸门。

## 关联

- 上游：epic #302（选项 B）· #308（G4b）· 承接 G1~G4a（#303-#307）
- 机制来源：Graphiti 双时间轴（借机制不借栈，ADR-0007 精神）
- 纪律：弱模型 prompt 纪律（代码能算的不让 LLM）· 下游影响评估 ADR-0008
