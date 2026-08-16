# Design Artifact Handoff

> UI / 产品讨论中产生视觉资产时，用本流程把“探索产物”整理成后续 Agent 可执行的交接材料。

## Core Rule

Visual companion 和 prototype 输出用于探索，不是交付源。

- `.superpowers/` 永远是 scratch workspace。
- PRD / issue 不依赖 `.superpowers/` 下的 raw HTML。
- 后续 Agent 不需要读取 `.superpowers/` 才能执行。
- 有价值的视觉资产必须整理到可追踪目录，并在 PRD issue 中链接。

一句话：**Visual companion 负责探索，`docs/design-assets/<feature>/` 负责交接。**

## When Required

满足任一条件时，进入 PRD、issue 或实现计划前必须执行 Design Artifact Sweep：

- 使用过 visual companion、HTML mockup、浏览器原型或截图。
- 使用过 image generation / image editing 生成设计素材。
- 讨论中产生了对后续实现有指导意义的布局、视觉方向、图片或资源。
- 用户明确说某个视觉结果“按这个来”“保留”“后续要用”。

纯文字产品讨论不强制执行。

## Sweep Checklist

从探索目录中挑出少量有交接价值的内容：

- 最终确认的 mockup。
- 关键 A/B/C 对比图。
- 最终截图或导出的 PNG。
- 生成并裁剪后的可复用素材。
- 能解释重要取舍的短说明。

不要保留：

- 等待页。
- 被否掉的早期草稿。
- 重复版本。
- 只为提问存在的过程页。
- 无法独立说明结论的 raw HTML。

## Export Location

默认导出到：

```text
docs/design-assets/<feature>/
```

推荐结构：

```text
docs/design-assets/<feature>/
  README.md
  mockups/
    final-layout.png
    final-layout.html
  assets/
    asset-01.png
    asset-02.png
```

规则：

- PNG / JPG / WebP 比 HTML 更适合做稳定视觉参考。
- HTML 只有在布局结构本身有复用价值时才保留。
- 生产候选资源可以先放在 `docs/design-assets/<feature>/assets/`，实现时再迁移到 renderer 正式 asset 目录。
- image generation 默认输出在 Codex 用户目录时，必须复制到仓库中的 handoff 目录；不要只引用本机临时路径。

## README Requirements

每个 handoff 目录必须有 `README.md`，至少写清：

- 来源：本次讨论或 visual companion session。
- 稳定参考：哪些文件代表最终方向。
- 决策：采用什么，不采用什么。
- 用途：reference、production candidate、final asset。
- 执行规则：后续 Agent 应看 PRD 和 curated assets，不依赖 `.superpowers/`。

示例：

```md
# Library Cover Preset References

Source:
- Visual companion session produced temporary HTML under `.superpowers/`.
- Raw session files are not execution dependencies.

Durable references:
- `assets/cover-01.png` to `assets/cover-12.png` are 2:3 production candidates.

Decision:
- Use the B+ book-card grid direction.
- Do not use the hero featured-book layout.

Usage:
- Implementation should follow the PRD and these curated assets.
- Raw `.superpowers` HTML should not be treated as source of truth.
```

## PRD / Issue Handoff

PRD 或 GitHub issue 必须包含 `Design Assets / References` 信息：

- 资产目录路径。
- 哪些文件是最终参考。
- 哪些文件是生产候选。
- 哪些内容明确 out of scope。
- 如果使用过 visual companion，说明 raw `.superpowers` 文件只是探索来源。

如果 PRD 已经创建后才整理资产，用 issue comment 补充 handoff。

## Git Rule

如果后续 Agent 需要使用这些资产，必须把 `docs/design-assets/<feature>/` 提交到 Git。

不要提交整个 `.superpowers/`。
