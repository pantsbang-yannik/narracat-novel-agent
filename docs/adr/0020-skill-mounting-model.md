# Skill 挂载是 (Skill × Agent) 绑定的四类模型，官方 Skill 对作者黑盒

## Status

Accepted, partially superseded

> 2026-08-07 current reading: 挂/卸整套机制已整体退役——四类模型中两条已作废，「官方 Skill 挂/卸」
> 三类也一并退役，见下方「2026-08-07 补记」。官方 Skill 现全面只读；原第四类「用户自定义 Skill」的
> 文件夹挂载通道由「作者对它的要求」自由文本机制取代。本 ADR 的决策记录（四类模型划分、黑盒/锁定
> 约束的推演过程）保留作历史，不代表当前实现。

## Context

NarraCat 的 Agent profile inspector 让作者给写作 Agent 挂载 Skill（领域知识包）。需要确定 Skill 与 Agent 的关系、哪些 Skill 对作者可见 / 可挂 / 可看正文，以及作者能否挂载自己的 Skill。早期实现（#287 / A 阶段）做了"任意可挂载 Skill 挂任意 Agent"的扁平模型；审核发现现有 6 个官方 Skill 没有一个是为"挂载到写作 subagent"设计的，扁平模型会给弱模型塞无消费方的噪声，违背 agent-core「宁短勿长」北极星。

## Decision

Skill 与 Agent 的关系是 **(Skill, Agent) 绑定**——同一 Skill 对不同 Agent 可呈现为不同类别、或根本不出现，而非一个全局开关。官方 Skill 按绑定分三类，另加用户自定义：

- **内部 Skill**：不绑定任何 Agent，仅供命令 / 主会话内部调用；不出现在任何 Agent 配置页。
- **Agent 默认 Skill（锁定）**：随某 Agent 出厂（agent frontmatter `skills:`）；在该 Agent 配置页可见但锁定——不可卸载、不可改 mode。
- **可挂载 Skill**：SKILL.md frontmatter `mount-agents: [...]` 声明适配的 Agent；只在那些 Agent 的挂载入口出现，作者可挂可卸。
- **用户自定义 Skill**：作者从本地复制快照挂载到某 Agent（全局、预加载、完整 Claude Code skill）；可随时卸载。

三条关键约束：

1. **官方 Skill 对作者黑盒**：作者可见简介（description），不可查看正文（SKILL.md body）；仅用户自定义 Skill 可查看正文。官方 Skill 是产品质量护栏，正文透明会诱导改写 / 困惑。
2. **Agent 默认 Skill 完全锁定**（不可卸、不可改 mode）：除"出厂配置不动"的语义，这让 `effective.preload` 永远 ⊇ 默认集（只增不减），`agents` option 只做"默认 + 用户新增"叠加，在 SDK 覆盖 / 合并两种语义下都成立，**不依赖未经真机验证的 SDK 覆盖语义**（#287 走查 F2 命门由此从设计上消解）。
3. **并非所有 Agent 开放挂载**：纯机械入库的 memory-keeper 不开放挂载入口。

## Considered Options

- **全局 Skill 开关（不绑定 Agent）**：否决。Skill 为特定写作角色设计，挂给不相关 Agent 给弱模型塞噪声。
- **官方 Skill 让作者查看 / 编辑正文**：否决。官方 Skill 是质量护栏，正文透明诱导改写、徒增困惑。
- **允许卸载 Agent 默认 Skill**：否决。卸空后需依赖未验证的 SDK 覆盖语义清空 plugin 默认；锁定从设计上绕开。
- **用户 Skill 引用原路径**：否决。原文件夹移动 / 删除会让 Agent run 崩；复制快照换稳定。
- **用户 Skill inline 拼正文进 prompt（绕开 SDK 外部 skill 解析）**：否决。会丢失 references 按需加载与 scripts，阉割完整 Claude Code skill 能力。

## Consequences

- 现有官方 Skill 中**可挂载（c）类当前为空**：novel-structure 是 Agent 默认（outline-architect），其余为内部；novel-style-analysis-method 删除，novel-style-reference 降为内部（留作未来蒸馏源）。挂载功能本期主要服务用户自定义 Skill；官方 c 类待将来有真正面向写作 subagent 的能力单元再补。`mount-agents` 机制先搭好、零数据；UI 视觉只打磨本期用得到的路径。
- 用户自定义 Skill 走 SDK 原生 skill 机制（保完整能力 references + scripts），其外部 skill 注入需带 key 真机 spike 验证；spike 失败则降级为"纯 SKILL.md inline、含 references/scripts 的复杂 skill 暂不支持"。

## 2026-07-31 补记（阶段2切片④）

真机 dogfood 与真打复核确认：SDK `agents` option 的 `definition.skills` eager 预加载，在「App 全量组装覆盖 + 与 plugin 同名 agent 共存」场景下**实测不触发**（#295 已发现，退路 A inline 一直是唯一确定性生效通道）；而把用户 Skill 复制进 `<project>/.claude/skills/` 供 SDK 发现，只是为了让那条从未生效的 eager 通道理论上"有路可走"——pi 路线的运行时本就没有 `.claude/skills/` 目录发现机制，文件搬运是纯死重（写入 + 清理两套逻辑、四处清理链、崩溃残留标记文件，全部服务一个不存在的读者）。spec 2026-07-30 §6 拍板：整链删除，inline 唯一化。行为收敛点：

1. 用户 Skill 不再落 `<project>/.claude/skills/`；正文 inline 进 agent prompt 是唯一生效通道。
2. 用户 skill 名**不再进** `definition.skills`（SDK 侧无文件背书的名字不登记；登记面 = user-skills.json 存量店）。
3. 与作者项目级同名 skill 的"让位"语义随搬运退役——目录碰撞的根源（复制进同一个 `.claude/skills/<name>/`）已消失，inline 与作者自己的项目级 skill 天然并存、互不干扰。存量老项目里上次 run 崩溃残留的带标记副本（原搬运链自带的自愈现已消失，但 SDK 仍会扫 `settingSources:['project']` 发现它们、与挂载/卸载状态脱钩）由一次性惰性清扫处理（`sweep-stale-user-skill-copies.ts`，评审 task-6-review.md Important#2）：只删带 `.narracat-user-skill` 标记的目录，无标记的作者资产绝不触碰。
4. references/scripts 的确定性不可用：本文档「Considered Options」与「Consequences」两处预记的损失（"纯 SKILL.md inline、含 references/scripts 的复杂 skill 暂不支持"）就此落定为现状，非新增退步。挂载 UI 对含 scripts 的 Skill 改为如实告知——不再暗示"运行时可能执行代码"，而是说明脚本与 references 不会随写作运行注入或执行。

## 2026-08-06 补记（作者可编辑写作指令设计，issue #510）

约束 1「官方 Skill 对作者黑盒：作者可见简介，不可查看正文；仅用户自定义 Skill 可查看正文」原文保留在上方（决策演进痕迹不删）。本补记把这半条拆开重新裁定，出处为 `docs/superpowers/specs/2026-08-06-agent-prose-user-editing-design.md` §2.3 / §2.4。

**「不可查看」半条被推翻。** 该约束建立在闭源假设上：产品还没开源时，「作者看不到官方 Skill 正文」确实能挡住围观改写。开源后 `agent-core/narracat/skills/*/SKILL.md` 在 GitHub 上人人可读，App 内继续隐藏**只剩害处**——作者在产品里看不到、去仓库反而能看到，体验上更困惑，且白白削弱「引擎透明」这一开源卖点。落地：`AgentSkillMountPanel` 的详情弹窗对官方 Skill 行开放同款只读正文展示（原仅用户自定义 Skill 可用）。

**「不可编辑」半条继续成立，但支撑理由整体更换**——从原来的「官方 Skill 是产品质量护栏，正文透明会诱导改写」，换成**「技术上做不到」**：在 pi 底座下，官方 Skill 正文不经 runtime 注入到达模型；它到达模型的唯一确证途径是 command 正文指示 Agent 用 Read 工具直接读磁盘文件（例：`commands/write.md` 读 `novel-web-craft`）。App 在内存里做的文本覆盖不会出现在 Agent 实际读到的磁盘文件里，要生效只能落盘改写，而这条搬运链在拆旧阶段已被整链删除，重建是明确的架构倒车。**如实记录：这是技术限制，不是产品选择**——若未来 runtime 注入路径改变（见 spec §12 调查线的后续结论），「不可编辑」需要重新评估，不能想当然继续援引「护栏」这个已经不成立的旧理由。

对照：Agent 自身写作指令（`agents/*.md` 正文）走的是完全不同的另一条路——由 `assembleAgentSkills()` 全量组装进 prompt，注入点确定，因此本设计对 Agent 正文做了「散文块」分级编辑（判据与已实证反例见 `agent-core/narracat/CLAUDE.md`「散文块（作者可编辑区）」节），与官方 Skill 正文的技术限制不是同一件事、不冲突。

## 补记（2026-08-07，设计见 `docs/superpowers/specs/2026-08-07-agent-capability-config-design.md`）

本 ADR 的四类模型中，两条已作废：

- **第四类「用户自定义 Skill」的形态作废**。它的实现从来不是 skill——正文被 inline 拼进 agent prompt，
  没有渐进式加载、没有模型按需调用，而 `references/` 与 `scripts/` 从不注入也不执行。「选本地文件夹
  挂载」这条通道因此是「粘贴一段正文」的复杂版，且承诺了不存在的能力。现改为作者在 App 内直接写一条
  自由文本要求（产品面叫「我对它的要求」），实质注入通道不变。
- **约束 3「memory-keeper 不开放挂载」作废**。五个 Agent 一律开放——作者说「多记录人物情绪变化」对
  记忆管理员是有意义的，且少一条例外分支。

「官方 Skill 挂/卸」这套（一、二、三类）也已整体退役：官方 Skill 在 App 内改为纯只读，且只展示
**确定到达模型**的那些（当前仅 `chapter-writer → novel-web-craft`，有 `commands/write.md` 的显式 Read
路径为证）。pi 底座下 `definition.skills` 无消费者，其余官方 skill 是否生效见 issue #510。
