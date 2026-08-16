# ADR 0004: Workbench Titlebar Actions Use Composer Handoff For Existing Content

## Status

Accepted

## Context

Workbench 的中间内容区既承担 Markdown 浏览，也承载当前对象的操作入口。#35 之前，已有内容页的操作更接近“点击即运行 Agent”，这对空文档生成是合理的，但对已有内容调整不够稳妥：用户通常需要说明要改什么、保留什么、避免什么。

同时，titlebar 位于高频切换区域。章节正文、章节大纲、审修等 tab 切换时，如果 titlebar 动作和内容区分别从不同状态推导，按钮区会短暂显示旧动作，造成闪动。右侧更多菜单还暴露了一个组合浮层问题：Tooltip 和 DropdownMenu 共用同一个 trigger 时，菜单关闭后的 focus return 可能让 tooltip 残留。

## Decision

Workbench titlebar 的动作采用稳定 slot 模型：

- `primary`：当前内容最主要的上下文动作，允许显示为带文字的小型按钮。
- `refresh`：客户端刷新动作，显示为独立 icon button。
- `more`：低频或次级动作，进入更多菜单。

titlebar 动作和中间内容区必须由同一份 active object / active tab 状态推导。章节 tab 状态应提升到共同父层，由 titlebar 和内容区共享，避免切换 tab 时出现旧按钮闪回。

已有内容的调整类动作使用 Composer handoff，而不是直接启动 Agent run：

- App 预填 NarraCat command chip。
- App 预填目标文件、当前对象和安全边界明确的 draft。
- 用户补充具体要求并主动发送后，才启动 Agent run。
- 空文档生成、缺失审修、恢复写作等目标明确且流程化的动作仍可直接启动 Agent run。

Composer chip 的视觉角色是输入语法提示，不是状态卡片。它可以独立放在输入框上方的轻量区域，但尺寸和视觉重量应接近正文输入文字，不占满整列，不成为新的内容卡片。

更多菜单这类复合 trigger 必须协调 Tooltip 和 DropdownMenu 的 open 状态：菜单打开和关闭时同步关闭 tooltip；菜单关闭后的 focus return 不能立刻重新打开 tooltip；下一次真实 hover 仍应正常显示 tooltip。

## Consequences

- 用户调整已有内容前能补充明确要求，减少误触后 Agent 直接改写内容的风险。
- titlebar 按钮位置和类型更稳定，切换章节 tab 时不会因为局部状态不同步而闪动。
- 右侧 Agent composer 成为“确认并补充意图”的入口，而不只是自由聊天输入框。
- 更多菜单和 tooltip 的交互规则可复用于未来其他 icon menu，不需要每次重新诊断 focus return 问题。
- 实现上需要把部分 Workbench 状态提升到共同父层，并为复合浮层增加受控状态；这比局部组件自治更啰嗦，但行为更可预测。
