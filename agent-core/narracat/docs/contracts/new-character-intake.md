# 契约：写作期新角色处置 + 角色档案渐进深化

> 共享契约 SSOT（角色随剧情渐进生长，不在立项期一次产全）。消费方（引用须带 `${CLAUDE_PLUGIN_ROOT}/` 前缀）：
> - `commands/plan.md`：大纲规划期 outline-architect 引用未建档角色时处置
> - `commands/write.md`：写作期 chapter-writer 引用未建档角色时处置
> - `commands/world.md` / `agents/world-curator.md`：建档 / 深化角色时标注完善度阶段

当 subagent 在大纲 / 正文里引用一个**已建档角色清单与候选清单都没有**的名字时，主会话按本契约处置——不打断创作流、不强制完整设定。

## 〇、角色档案完善度阶段（stub→sketch→full）

每份角色档案在身份注释里带 `profile_stage`，标注当前完善度——作者随时可让 `/narracat:world` 深化一级：

| 阶段 | 含义 | 至少覆盖 |
|---|---|---|
| `stub` | 写作期就地拉起的轻量建档 | 身份注释 + 名字 + 一两句已知信息，其余维度「（留白）」 |
| `sketch` | 关键维度成形、可支撑出场 | 身份 / 欲望 / 核心矛盾 / 与主角关系（world-guided.md 角色 6 维度过半） |
| `full` | 全维度完整 | world-guided.md 角色 6 维度全覆盖，无「（留白）」 |

身份注释形如 `<!-- character_identity: {"character_uid":"...","name":"角色名","profile_stage":"stub"} -->`。缺 `profile_stage` 按 `full` 兼容（立项期既有档案）。深化只升不降，UID 与 name 原样保留。

## 一、识别新角色

判定一个被引用的名字属于哪一类：

1. `bible/characters/*.md` 已有同名档案（或档案内 `别名:` 行声明了该名）→ **已建档**，直接放行，无需处置。
2. `novel_list_candidate_characters(status="all")` 清单里已有同名候选 → **已是候选**，直接放行（出场时再建档）。
3. 都不在 → **新角色**，进入第二节处置。

## 二、新角色处置（先判重要度 → 龙套跳过 / 其余入候选或建档）

### 先判重要度

每个新名字先归一档，看两点：①是否在本章 / 本卷大纲被规划过（被规划=有意安排，至少「次要」，多半「重要」）；②正文里的戏份——推动剧情、与主角形成持续关系、明显还会回来 → **重要**；会再出现但不牵动主线 → **次要**；只在背景里报个名 / 办个功能就退场 → **龙套**。

`write` 来源才做龙套判定；`plan` 来源的新角色是有意写进大纲的，不当龙套，至少「次要」。

三种归宿：

- **龙套** —— 一次性、纯功能性背景。**不登记、不建档**，正文里照常写（无需 UID）；下次再出现会作为新名字重新判定。
- **次要 / 重要** —— 调 `novel_register_candidate_character(name="{名字}", proposed_chapter={章号，如有}, source="{plan|write}", importance="{minor 次要 | major 重要}")` 入候选池，本次不建档、不写正文设定。

### 提问方式

`automation_level == "auto"`：按上面自动判定并执行——龙套跳过、其余入候选，不提问。

否则（手动）：**明显龙套自动跳过、不问**；其余每个新名字逐个 AskUserQuestion（重要度仍由你按上面自动判，不作为提问选项）：

- 问题：「『{名字}』尚未建档。」
- 选项：
  - **现在建档（stub）**（默认）—— 轻量建档：先 `novel_mint_character_uid` 铸 UID，再 Write `bible/characters/{名字}.md`，顶部身份注释含 `character_uid` / `name` / `profile_stage: "stub"`，正文写已知信息、未知维度写「（留白）」。需要完整设定时另跑 `/narracat:world` 深化（见第〇节阶梯）。
  - **留作候选** —— 入候选池（importance 用上面判定的 minor / major），本次不建档、不写正文设定。
  - **这是别名** —— 让用户指出归属的已建档角色，在该角色档案 `别名:` 行补登这个名字；不新建角色、不进候选池。

## 三、建档后的级联分析（按时间插入点路由）

选「现在建档（stub）」并落盘后，按角色相对**已写章**（state.yaml `progress.completed_chapters`）的时间插入点判定级联深度，组织成 CascadeImpactReport（`change_kind=character_added`）：

- **forward（纯前向）**：proposed_chapter 在 last_completed 之后、且角色此前不涉及任何已写章 → 仅建档，无级联（`insertion_point=forward`，`has_impact=false`，不读已写章）。
- **backward（向后出场）**：角色从某未来章起出场，已写章无需回溯 → 后续大纲与写作自然纳入，不动已写章（`insertion_point=backward`，已写章无 affected）。
- **retroactive（追溯）**：角色其实早该在某些已写章出现 → `insertion_point=retroactive`，逐章 Read 相关已写章，affected_chapters 列出需 memory-keeper 回填 facts/关系的章；正文有硬冲突的标 `impact_level=critical` 并建议 `/narracat:rewrite <章号>`，软冲突标 continuity 提示。回填不自动改正文。

无级联（forward/backward）一行带过；retroactive 有 affected 时按 `change_kind=chapter_rewrite` 同款表格呈现 | 章节 | 影响级别 | 问题 | 建议 |，由作者决定回填/重写时机。

## 四、纪律

- 候选角色不入 facts / character_cards（无设定可入），只在候选池登记，与已出场角色的记忆体系隔离。
- 龙套不进候选池、不铸 UID，只作为正文文字存在；重要度只在「次要 / 重要」两档区分，决定写完正文是否提醒建档——写完只提醒「重要」候选。
- stub 建档复用 `novel_mint_character_uid` 与 `bible/characters/{name}.md` 既有契约（身份锚点 = 顶部 `character_identity` 注释）。
- 一名一处置，不在一次提问里堆多个名字；指向不明（疑似别名又疑似新人）时优先按「这是别名」追问。
