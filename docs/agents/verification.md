# Verification Matrix

> 只运行能证明当前改动的必要验证；但在声称完成前必须有新鲜验证证据。

## Command Rules

- bun 命令必须带 `--no-cache`。
- 验证失败时先读完整输出，再判断是实现问题、环境问题还是测试本身过期。
- 不要用旧的命令结果证明当前改动。

## Docs Only

适用：只改 Markdown、ADR、计划、交接文档。

```bash
git diff --check
rg -n "[ \t]+$" AGENTS.md CONTEXT.md docs
```

## TypeScript Or Shared Logic

适用：主进程、preload、renderer 共享逻辑、状态管理、工具函数。跨 `electron` / `src` / `shared` 边界的改动必跑 `check:architecture`。

```bash
bun --no-cache run typecheck
bun --no-cache run test
bun --no-cache run check:architecture
```

## Renderer UI

适用：页面结构、组件、Tailwind 样式、交互状态。

```bash
bun --no-cache run typecheck
bun --no-cache run check:design
```

如改动影响核心路径，还需要：

```bash
bun --no-cache run test
bun --no-cache run dev
```

并用浏览器或截图验证关键视口。

### Electron-only Renderer Flows

Workbench、Agent 面板和任何调用 `window.electron` / IPC 的页面不能只用普通浏览器验证。Vite localhost 页面没有 Electron preload，直接打开可能出现 `window.electron` 为空；这只能证明浏览器环境不完整，不能证明 Electron UI 行为。

这类改动需要优先用真实 Electron 窗口做 smoke：

```bash
bun --no-cache run dev
```

重点验证：

- 页面能在 Electron 中完整加载，没有 preload / IPC 缺失错误。
- titlebar、tab、sidebar、Agent composer 等高频交互没有闪动或布局跳动。
- Tooltip + Dropdown / Popover 等复合浮层在打开、outside click 关闭、再次 hover 后都符合预期。

如果普通 Browser 工具因 preload 缺失无法覆盖目标路径，可以改用 Computer Use、Electron remote debugging / DevTools Protocol 或人工截图验证，并在最终说明中写清替代验证方式和覆盖到的交互。

## Main Process / IPC / Agent Runtime

适用：Electron 主进程、IPC handler、pi agent runtime 装配、资源路径解析。

如果涉及 NarraCat Agent Core 的 subagent / Agent tool：

- 按整类契约验证，不只修复当前报错的单个 agent 名称。
- 引擎的唯一契约清单是 `agent-core/narracat/narracat.manifest.json`：新增/删除 commands·agents·skills·schemas·templates 必须同步改它，否则 `agent-core/narracat/scripts/manifest-sync-lint.mjs` 变红（已随 `bun --no-cache run test` 一起跑）。
- App 侧的契约底线在 `electron/main/engine/agent-core-contract.ts`，五个 Agent（`outline-architect`、`world-curator`、`chapter-writer`、`continuity-editor`、`memory-keeper`）缺一即诊断报错；内联 command、保护性 prompt 和测试 fixture 都要整类覆盖。
- 子 agent 名带不带 `narracat:` 前缀都认（pi adapter 在 `pi-subagent.ts` 归一前缀），改命令文本时不必为前缀单独适配，但同一处别混着写。
- 章节正文路径要按整类兼容处理：读取前检查 `manuscript/vol-{VV}/ch-{NNN}.md`、`manuscript/ch-{NNN}.md` 和非补零候选，后续审修 / memory-keeper 使用实际存在或实际写入的路径。

```bash
bun --no-cache run typecheck
bun --no-cache run test
bun --no-cache run check:architecture
```

如果影响运行资源，还需要启动开发环境做 smoke test：

```bash
bun --no-cache run dev
```

## Agent Core 契约与版本

适用：`scripts/prepare-narracat-agent-core.mjs`、`agent-core/narracat`、`narracat.manifest.json` 解析、Agent Core 版本。

```bash
bun --no-cache run verify:narracat-agent-core
bun --no-cache run audit:narracat-prompts -- --source <path-to-NarraCat>
node scripts/prepare-narracat-agent-core.mjs --if-missing --optional
bun --no-cache run test
bun --no-cache run typecheck
```

完整开发、更新和打包资源流程见 `resources/README.md`。

## Packaged Agent Runtime

适用：内置 headless Agent runtime 启动、NovelMemory MCP 启动、运行时 binary/helper、Electron 打包资源路径、`ELECTRON_RUN_AS_NODE` 替换或移除。

```bash
bun --no-cache run test
bun --no-cache run typecheck
bun --no-cache run build
bun --no-cache run package
```

然后按 `docs/agents/release-checklist.md` 执行 Packaged Agent Runtime Smoke。这个验证必须从 packaged `.app` 运行；`bun --no-cache run dev` 不能证明 Terminal / Dock 行为符合商业化安装包要求。

## Build / Release Risk

适用：构建配置、Electron 打包相关、资源复制、依赖升级。

```bash
bun --no-cache run test
bun --no-cache run typecheck
bun --no-cache run check:design
bun --no-cache run build
```

如果构建依赖打包进 `resources/` 的 NarraCat Agent Core 运行资源，先按 `resources/README.md` 跑 packaging acceptance。

## When Verification Is Not Possible

如果因为环境、密钥、外部服务或用户设备限制无法验证，要在最终说明中写清：

- 没跑哪个命令。
- 为什么无法运行。
- 已经用什么替代检查降低风险。
- 用户下一步如何验证。
