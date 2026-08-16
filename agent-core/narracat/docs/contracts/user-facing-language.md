# 对作者说话的语言（user-facing language）

面向作者的写作产品里，引擎内部用精确的字段名 / 文件路径 / 工具名 / agent 名保证运行正确，但**这些都是引擎内部标识，不是给作者看的词汇**。本契约把「中文展示归渲染层」「控制状态不复述进面向作者文本」这条已有纪律，延伸到 command 在对话里对作者说的每一句话。

调用方：所有会向作者输出叙述、提问或报告的 command（setup / world / revise-premise / plan / write / rewrite / status / reference）。

## 一条原则

**内部用精确标识，对作者只用作者词汇——信息全保留，黑话全翻译。**

修复的不是"少说信息"，而是"换种说法"。例：

- 不说「本次 revise-premise 只改 `antagonistic_force.force`：炉鼎→药人，`bible/` 设定文件留待处理」
- 改说「这次只改了【对抗力量】这一条：炉鼎 → 药人。详细设定文档还没更新，需要再走一步」

信息一字没少，内部标识一个没漏。

## 适用面

下列内部标识**不得出现在任何作者会读到的文本里**——包括对话叙述、AskUserQuestion 的问题与选项标题 / 描述、状态报告与摘要正文：

1. schema 字段名（`antagonistic_force`、`world_rules`、`golden_finger`…）
2. 立项卡内部编号（`§5`、`§7` 等——直接说卡名）
3. 文件 / 目录名（`bible/`、`*.md`、`premise-cards.json`…）
4. 确定度英文枚举（`canon` / `tentative` / `open`）
5. 叙述人称等其它英文枚举（`first_person`、`payoff_beat`…）
6. agent 名（`world-curator`、`outline-architect`、`continuity-editor`、`memory-keeper`）
7. 工程 / 流程黑话（`落盘`、`入库`、`blocking conflict`、`builder`、`context pack`、`verdict`…）

**不在本契约约束范围**：命令 `/narracat:xxx`。它由 App 渲染为面向作者的动作按钮（如「写下一章」「大纲」），是既有约定，照常使用，无需翻译。

## 对照表（内部标识 → 对作者说）

### 立项卡九张（卡名是作者词汇，字段名 / 编号不外露）

| 内部 | 对作者说 |
|---|---|
| `genre_contract` / §1 | 题材读者契约 |
| `core_hook` / §2 | 核心钩子 |
| `golden_finger` / §3 | 金手指与爽点引擎 |
| `protagonist_desire`（`surface_want` / `deep_need` / `cost`）/ §4 | 主角欲望与代价（表层想要 / 深层需要 / 代价） |
| `antagonistic_force` / §5 | 对抗力量 |
| `central_dramatic_question` / §6 | 中心戏剧问题 |
| `world_rules` / §7 | 世界规则（可冲突性） |
| `narrator_voice`（`address`）/ §8 | 叙述声音（叙述人称） |
| §9 | 留白声明 |
| `premise` / `premise-cards.json` / `premise.md` | 立项卡 / 创作地基（不提文件名） |

### 文件与目录

| 内部 | 对作者说 |
|---|---|
| `bible/` | 设定文档 |
| `bible/characters/*.md` | 角色档案 |
| `bible/world/*.md` | 世界观设定 |
| `bible/relationships.md` | 角色关系 |
| `bible/reference-guidance/`（premise / world / characters / structure / style） | 参考指导（前提 / 世界观 / 角色 / 结构 / 文风参考） |
| `outline/`、`master-outline.md`、`ch-NNN.md` | 大纲 / 全书大纲 / 章纲 |
| `manuscript/` | 正文 |

### 确定度与枚举

| 内部 | 对作者说 |
|---|---|
| `canon` | 定稿（已定、不可违背） |
| `tentative` | 暂定（可后续修正） |
| `open` | 留白（有意未定） |
| `first_person` / `third_limited` / `third_omniscient` / `multi_pov` | 第一人称 / 第三人称·跟随主角 / 第三人称·上帝视角 / 多视角切换 |
| `payoff_beat` | 爽点兑现（节点） |
| `critical` / `moderate` / `minor`（级联影响级别） | 严重 / 中等 / 轻微 |

### Agent 与流程黑话

| 内部 | 对作者说 |
|---|---|
| `world-curator` | 「整理设定 / 生成设定」（不提 agent 名） |
| `outline-architect` | 「规划大纲」 |
| `continuity-editor` / `verdict` / `blockers` | 「审校 / 审校结论 / 待修问题」 |
| `memory-keeper` | （不提，并入「收尾保存」） |
| `落盘` / `入库` / `commit` | 保存 / 写入 / 记下来 |
| `blocking conflict` | 需先解决的设定冲突 |
| `warning`（冲突级别） | 提醒 |
| `builder` / `context pack` | 「整理本章资料」 |
| `arc` | 篇章（当前篇章） |
| `storyline` | 故事线 |

> 新增受控字段 / 枚举时，在对应小节补一行作者译名，保持本表是唯一出处。命令文档只引用本契约、不各自维护译名。
