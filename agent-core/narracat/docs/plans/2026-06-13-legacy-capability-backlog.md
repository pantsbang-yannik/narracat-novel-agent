# 遗留能力 backlog —— 从 legacy 逐项重建写作能力

> 日期：2026-06-13 · 基线：Agent Core 4.0（大爆炸重构后的极简基座）
> 旧版精华锚点：tag `legacy/v3.10.41`（指向旧 main `7cbde66`，写作能力丰富版）

## 背景

4.0 把 Agent Core 砍成极简基座（相对旧 main 净删约 3256 行写作知识/审校/反模式），换来墙钟优势与可控的弱模型契约。代价是写作能力暂时低于旧版。本清单登记**旧版砍掉、但有重建价值**的能力，作为后续 `codex/<issue>` 切片的源。

**取用方式**：`git show legacy/v3.10.41:<path>` 看旧版实现；`git diff legacy/v3.10.41..main -- <area>` 看砍了什么。当前仓库只保留 corpus 语料与 blacklist 离线词表；`novel-craft` 主体、`principles/` 8 篇分册、`narrator-archetypes.md`、`novel-antipattern` 全套、continuity-editor 诊断视角均需从 tag 恢复。

## 重建工作流（每项一个 issue）

1. 用 `/to-issues` 把一项能力拆成 vertical slice。
2. `codex/<issue>-<slug>` 分支实现：从 `legacy/v3.10.41` 挖机制 → **极简重建**（不照搬旧版体量，提炼机制而非堆处方）。
3. eval 真稿 A/B：`4.0+本能力 vs legacy`（或 vs 上一版）盲评，验收双指标——**真稿不退步 + 墙钟可控**。
4. 单切片验收，禁止整链合并（#212 教训：累积小改进 ≠ 净改进）。
5. PR → main。

## 清单

| 能力 | 旧版可挖来源 | 价值 | 4.0 现状 | 极简重建方向 | 优先级 |
|---|---|---|---|---|---|
| 范例补热 + 范例驱动注入 | corpus（现存）+ `legacy:skills/novel-craft` | 文风冷底色的**最治本**一层，且唯一没做的 | corpus 仍 67% 克制系、`novel-craft` 已删除 | 补热向真书（爽/甜/搞笑）→ builder 按体裁选段注入，学机制不抄句 | **P0** |
| 写作机制正向知识 | `legacy:skills/novel-craft/references/principles/` + `legacy:skills/novel-craft/SKILL.md` | 真人拆解的 beat/钩子/情绪曲线机制 | 已删除，当前零注入、零人读 reference | 高价值机制以极简范例驱动**选择性**回注写手，绝不全量教学 | P1 |
| 审校真错误的机械检测 | `legacy:skills/novel-antipattern` + blacklist（现存离线种子） | ≥10 字原文照搬、专名误用等是**可机械检测的真错误** | 全退役，仅留 5 类 LLM 客观错误 | 可机械化子集下沉 L0 代码扫描（接 cross-chapter-warnings 既有先例） | P1 |
| 读者体验诊断视角 | `legacy:agents/continuity-editor`（reading_desire/章末钩子三机制/判断同步律） | 评分机器砍对了，但**诊断视角**经真稿验证有效 | 全删 | 做成 `/review` 深审的**只读标注**（不评分、不回流、不进主链） | P2 |
| 多线/伏笔密度结构洞察 | `legacy:skills/novel-structure` | 长篇支线编织、高潮分层、伏笔兑现节奏 | 瘦身保留约一半 | 按需回注 outline-architect，配合篇幅结构预算 | P2 |
| 中文 slop 统计词表 | `blacklist.md`（现存离线种子）+ 自家产出语料 | 调研指出中文 slop 无现成词表、需自建统计基线 | 离线参考、未接入 | 用 4.0 真稿 vs 真人语料统计自建，再决定是否做 L0 扫描 | P3 |

## 守住的双指标

任何一项重建合入前必须证明：(1) eval 真稿盲评不输 legacy；(2) 墙钟不显著回退。把「加字默认有害」作为纪律——新增任何 prompt 段落需通过「删掉它真稿会变差吗」的反向论证。
