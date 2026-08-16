# ADR-0036: 架构分层与依赖纪律

Date: 2026-07-30

Status: Accepted

## Context

NarraCat-app（Electron + React）自主进程与渲染进程分工确立后，两侧的代码耦合日益加重，
反映在四个方面：

1. **主进程反向 import 渲染层**：87 个主进程文件直接 import `src/lib` 实现代码，包括
   状态管理、工具函数、校验逻辑，造成两侧代码牢牢绑定在一起。例如 `DurableEventV1` 
   只在 `src/types` 定义一次，主进程却直接 `import` 使用。若需调整渲染层结构或
   导出形式，主进程改动波及面广。

2. **跨进程类型手工双定义**：`AgentRunRequest`、`premise-field-tier`、`chapter-outline-field-tier` 
   等三组类型分别在 `src/types` 和主进程定义，手工保持同步。任何改动须两处改，易出现漂移；
   无强制手段保证单一真相源。

3. **IPC 路由层充斥业务编排**：`ipc.ts` 2129 行、116 个 handler，不仅做「入参校验 → 
   调用域模块 → 返回结果」这类路由职责，还内嵌了涉及多个子域的条件分支、状态管理、
   工具权限等业务逻辑。大幅提高了理解和维护成本。

4. **主进程子域混住不分**：`orchestrator/` 49 个文件混合了 Agent 运行编排、角色聊天、
   Skills 装配、权限管理等 4 个内聚度低的子域，边界不清。

5. **Runtime 依赖散布全仓**：除了局部专用的 SDK adapter，主进程多处直接 import
   当时的 SDK runtime 包，为后续换成 Pi 等其它 runtime 设置了障碍。

## Decision

### 1. 新增 `shared/` 层作跨进程契约唯一住所

- 创建 `shared/types/` 和 `shared/lib/`，存放两侧都需要的类型与纯函数：
  - `AgentRunRequest`、`AgentEvent`、`AgentEventEnvelopeV1` 等业务类型
  - `field-tier`、`durable-events` 等跨进程纯函数
  - IPC 协议定义、config Provider 类型、NoticeItem、RunSessionRecord 等 schema
- `shared/` 自身禁止 import `electron/`、`src/` 的任何代码（含类型），也不得依赖 Electron/DOM API。
  严格做为两侧的中立契约。
- 已有类型逐步从 `src/types` 和主进程迁往 `shared/types`；新增跨进程类型直接在
  `shared/types` 定义。

### 2. 单向依赖：`electron/` 与 `src/` 互不 import

- `electron/` 与 `src/` 互不 import（含 `import type`，不豁免）；两侧只能 import `shared/`。
- 具体措施：
  - 渲染层需要的主进程功能，通过 IPC 和 context bridge 消费。
  - 主进程需要的业务逻辑，抽象为纯函数存放在 `shared/lib/`，两侧各自 import。

### 3. IPC 只做路由与校验，禁止内嵌业务编排

- IPC handler 职责严格定义为三步：
  1. 入参校验与反序列化（入参来自 IPC，不可信）
  2. 调用该功能所属域的业务模块
  3. 返回结果或错误
- 禁止在 handler 内：
  - 条件分支决策哪个子域应该执行
  - 跨多个子域的状态管理
  - 工具权限、预算校验等业务逻辑（这些属于 agent/ 或 engine/ 域）
- 业务编排由各域内的模块承担；IPC 只是消息通道，handler 是薄适配层。

### 4. Runtime 收口：Agent SDK/Pi 依赖只在 adapters/ 内

- 全仓禁止 import `pi-ai`、`pi-agent-core` 等 Agent runtime 包（以及已退役的旧 SDK runtime
  包），**除了** `electron/main/agent/runtime/adapters/`。
- 这个目录内：
  - `adapters/<旧 SDK>/`：决策当时的 SDK 实现，作为过渡 adapter；包含 `event-mapper.ts`、
    `sdk-runner.ts` 等相关全部代码。
  - `adapters/pi/`：未来 Pi adapter 的住所。
  - 其它所有子域（runs/、events/、permissions/ 等）与 runtime 无关。
- 这样做的好处：未来 runtime 替换时，只需替换 adapters/ 内代码，其它业务层无感知。

> 后记（2026-08-16 补记，事件发生在 2026-08-02）：拆旧完成后旧 SDK adapter 目录已整体删除，
> `adapters/pi/` 是唯一 adapter，旧 runtime 包被 `check:architecture` 列为全仓零容忍。
> 上面这条收口纪律本身不变——它恰好是这次替换只动 adapters/ 就完成的原因。

### 5. 架构纪律由脚本硬校验

- 新增 `scripts/check-architecture.mjs`，正则扫描 `electron/`、`src/`、`shared/` 三层下
  所有源文件里字面量 import specifier（四类语法：静态 `import ... from`、
  `export ... from`、动态 `import()`、`require()`），校验：
  - 禁止 `src/` ↔ `electron/` 互 import（含 `import type`，不豁免）
  - 禁止 `shared/` import `electron/` 或 `src/` 的代码
  - 禁止非 `adapters/` 目录 import Agent runtime 包（含 `import type`，不豁免）
  - 测试文件（`*.test.ts(x)`）豁免，允许跨层拿 fixture
- 脚本经 `bun --no-cache run check:architecture`（`--enforce` 模式，违规即非零退出）
  手动触发，并作为 `bun run test` 的前置门（见验证命令集）；当前**不是** CI/git hook 自动触发，
  依赖开发者按验证清单手动跑或被 `test` 脚本捎带触发。
- **未实现，留作 follow-up**（当前脚本用正则扫字面量 specifier，不做以下几类）：
  1. AST 级解析（正则无法穷尽所有 JS/TS import 语法变体，如条件表达式内嵌 specifier）
  2. 字符串拼接路径检测（`path.join(...)` 等运行时拼出的动态路径不可静态扫描到）
  3. 循环依赖检测（当前只查跨层方向，不查同层内的环）
  4. IPC handler 超行数（如 50 行）自动预警拆分——handler 拆分纪律目前只靠 review 人工把关，
     无脚本强制

## Consequences

### 迁移计划

- **Phase 0（当前）**：
  - 写好本 ADR 与 runtime 替换决策文档
  - 实现 `check-architecture.mjs` 脚本并接入 `bun run test` 前置门（本仓 App 层暂无 CI，
    见验证命令集）
  
- **Phase 1**：
  - 建立 `shared/types/` 和 `shared/lib/` 目录
  - 迁移已有跨进程类型：`AgentRunRequest`、`AgentEvent` 等从 `src/types` 和主进程定义
    中合一到 `shared/types`
  - 迁移纯函数：`field-tier`、`durable-events` 等到 `shared/lib/`
  - 调整渲染层 `src/` 的 import，改指 `shared/`
  - 调整主进程 `electron/` 的 import，改指 `shared/`；主进程对 `src/lib` 的依赖逐步
    抽象为 `shared/lib/` 中的纯函数
  - 拆分 `ipc.ts`：保留路由与校验，把业务编排挪入各域模块（`agent/runs/`、
    `engine/`、`chat/` 等）

- **Phase 2**：
  - 将现有 SDK 相关代码（`event-mapper.ts`、`sdk-runner.ts`）挪入 
    `electron/main/agent/runtime/adapters/claude-sdk/`
  - 明确 `AgentRuntime` 接口契约
  - 为 Pi adapter 预留空间

### 验证命令集

添加到 `bun run` 验证命令：

```bash
bun run check:architecture    # 架构纪律硬检查
bun run typecheck              # TypeScript 类型检查
bun run test                   # 单元测试
```

验证通过的标志：
- `check:architecture` 无违规输出
- `typecheck` 无错误
- `test` 全绿
- 打包测试（`bun run build`）成功

### 设计原理

这套分层设计的核心是三条边界：

1. **进程边界**：`shared/` 是中立区，`src/` 与 `electron/` 分居两侧，通过 IPC 通信。
2. **职责边界**：IPC handler 只做「校验 → 调用 → 返回」，业务逻辑住在各域模块。
3. **运行时边界**：Agent SDK/Pi 等 runtime 只在 adapters/ 内，便于更换，其它代码对
   runtime 选择无关。

这样做避免了：
- 两侧代码紧耦合，影响可维护性
- 类型双定义漂移，难以同步
- IPC 层充斥业务，混淆职责
- Runtime 替换时全仓改动

支撑了：
- 后续 runtime 替换（从 Claude SDK 换成 Pi）能相对独立
- 两侧代码各自演进，通过契约隔离
- 新增功能能清晰地落在某个域内

## Verification Gate

本 ADR 的架构纪律在以下条件全部满足时视为成功落地：

1. `scripts/check-architecture.mjs` 脚本编写完毕，接入 `bun run test` 前置门。
2. `shared/` 层建立，存放初版跨进程契约（AgentRunRequest 等）。
3. 第一批迁移完成：主进程对 `src/lib` 的依赖逐步转向 `shared/lib`；编译和测试通过；
   `check:architecture` 无违规。
4. 验证命令集（`check:architecture` + `typecheck` + `test` + 打包）全绿。
5. 真机冒烟：创建新项目、写作一章、Agent 对话、各功能正常工作。

不成功的标志：脚本无法有效检查某类绕过、或检查准确率低于 95%；则需修改脚本或重新
设计约束。
