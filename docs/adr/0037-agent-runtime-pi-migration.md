# ADR-0037: Agent Runtime 从 Claude Code SDK 迁移至 Pi（方案 A：先立骨架再换心脏）

Status: Accepted

Date: 2026-07-30

## Context

NarraCat-app 当时的 Agent Runtime 是 Anthropic 官方 Agent SDK 运行时（0.2.112，由 ADR-0027 锁版；该 ADR 未随本仓公开）。
用户确认的四个核心痛点（评估尺子）：

| 痛点 | 现状 | 换 Pi 后 |
|---|---|---|
| 性能/冷启动 | 每次 run spawn 子进程跑 SDK cli.js（2-5s） | in-process agent loop，spawn 消失 |
| 打包分发重 | headless Node 22 + SDK asarUnpack + 探针脚本链 | 整条链可删 |
| 黑盒不可控 | 被迫锁 0.2.112；skills 注入靠「退路 A」绕未文档化行为 | MIT 源码在手，任何层可改 |
| 依赖锁定 | GLM/DeepSeek 靠 ANTHROPIC_BASE_URL 伪装 | pi-ai 30+ Provider，国内端点一等公民 |

目标 runtime 定为 [Pi](https://github.com/earendil-works/pi)（earendil-works/pi，MIT，Mario
Zechner 主导 + Armin Ronacher 共同维护，纯 TS/ESM，活跃周更）。调研结论（有条件可行）：

- 分层：`pi-ai`（30+ Provider 统一 LLM API）→ `pi-agent-core`（loop）→ `pi-coding-agent`
  （SDK 层，`createAgentSession()`）→ `pi-tui`（仅交互模式用）；核心 loop 与 UI 严格分层，
  官方支持 in-process 嵌入。
- 原生覆盖（零/低成本迁移）：流式事件、systemPrompt 定制、工具白名单 + `tool_call` 拦截
  （canUseTool 等价物且可改参）、resume/会话树、compaction、hooks（口子更多）、abort、
  usage/cost 分项、skills（Agent Skills 标准同源）、slash commands 等价物。
- **两个真缺口**：**MCP 不内建**（生态有 pi-mcp-adapter，或 1-3 天自建桥；本仓走
  NovelMemory 原生工具化绕开）；**子 agent 不内建**——评审修正：官方 subagent 示例是
  **spawn 独立 pi 子进程**的架构，在打包后的 Electron 里不可用（会把 headless node
  链带回来），本仓子 agent 必须**弃 spawn 示例架构，自研为主进程内嵌套
  `createAgentSession` 会话**，工期按「自研」而非「改示例」算。
- 评审补充的三个非缺口但需重建的行为面：maxTurns/预算护栏 Pi 无内建（回合计数、超限
  中止、错误 subtype 语义全部 adapter 层自研）；文件权限基线 Pi 无内建（Pi 工具无目录
  圈禁，SDK 的 additionalDirectories 基线要在 tool_call guard 重建）；TodoWrite/任务卡
  无等价物（需自研 todo 工具或明确砍功能）。
- 硬性风险已排除：Pi 要求 node ≥22.19，本仓 Electron 41.2.1 内置 Node v24.14.1（实测）。

事实来源与更多细节见 spec：`docs/superpowers/specs/2026-07-30-arch-refactor-pi-runtime-design.md`
（v2 评审修订版）。

## Decision

1. **目标 runtime**：Pi（earendil-works/pi）in-process 嵌入主进程，exact-pin 版本，升级
   是显式决策（沿 ADR-0027 纪律，但源码在手被动性小）。
2. **迁移路线**：方案 A 五阶段（立规 → 立骨架 → 换心脏 → A/B 验收门 → 拆旧）；阶段 2
   （换心脏）开头设 1-2 天 spike go/no-go 门（Electron 主进程 `createAgentSession` +
   自定 ResourceLoader + GLM 兼容端点真打一发 + bash 工具一次调用）。
3. **关键技术决策（评审修订后立论）**：
   - 子 agent **弃官方 spawn 示例架构**，自研主进程内嵌套 `createAgentSession` 会话，
     对齐 `agents/*.md` 的 model/tools/skills 语义 + abort 传播 + usage 汇总 +
     SubagentStop 质量门等价重建；
   - Provider **默认保留各家 Anthropic 兼容端点**（pi-ai models.json 自定义模型：
     anthropic-messages api + 自定 baseUrl），保住 P1B 在 anthropic wire 上的全部调优与
     前缀缓存；换 pi-ai 原生 openai-completions wire 是 A/B 质量门通过后的**显式决策**，
     不默认做；
   - Pi 无 maxTurns/目录圈禁/TodoWrite——预算护栏（订阅 turn_end 计数 + `session.abort()`
     合成 `error_max_turns` 等错误语义）、权限基线（read/write/edit 每次调用 realpath
     圈禁到 agentCore/novelRoot/project）、任务卡（自研 todo 自定义工具 + 映射）三块
     adapter 层重建；
   - NovelMemory 核心逻辑抽 `memory-core` 纯库，跑 Electron utilityProcess（**每项目一个
     进程**，随项目打开/关闭生命周期），Pi 工具经内部轻量 RPC 直调；better-sqlite3 ABI
     反转（现按系统 node ABI 构建 → 迁 utilityProcess 后反转为 Electron ABI）另计为专项；
   - 用户 Skill 继续 inline 正文进 agent prompt（「退路 A」语义平移：Pi 的 skills 机制
     本身也是 lazy 登记，系统提示只登 name/description，与当年被证不可靠的模式相同，
     inline 正文仍是弱模型确定性生效的唯一路径；改善点在于这次 prompt 组装完全归我们
     掌控，不再绕未文档化行为）；
   - runtime 标识掺进 sessionFingerprint：A/B 期切 runtime 自动触发
     `onSessionInvalidated`（用户面 = 换引擎后开始新对话），杜绝把 SDK session id 喂给
     Pi。
4. **验收**：阶段 3 设三道门——功能门（8 个引擎命令 + 写作流含中断恢复 + 造包 + 学习 +
   向导全链真机跑通）、质量门（同书同章纲，SDK 臂 vs Pi 臂各写 3-5 章，用户盲评「更想读」
   + 既有量化尺不回退，最重要）、性能门（run 启动延迟对比入档）。**质量门不过，不切
   Pi 为默认**；Pi 硬伤修不动则停在双 runtime 态或回退（阶段 1 的架构收益不受影响）。

## Consequences

- **周期**：现实预期 8-10 周（原 5-6 周估计未计子 agent 换架构、权限基线/预算护栏
  重建、ABI 反转三块，评审后重估上调）。最可能爆的点依次：子 agent 自研、质量门盲评、
  memory-core 打包。
- **故障隔离代价**：SDK 子进程崩溃原本不伤 App；in-process 后扩展/工具未捕获异常会
  升级为 App 级故障——adapter 层须立「扩展全链 try/catch + run 级隔离」纪律，质量门
  加长跑内存观测（1M 上下文字符串驻留 + 并发子 agent 会话）。
- **自养维护面扩大**：子 agent 嵌套会话架构、权限基线、预算护栏、Pi 版本跟进（0.x
  周更，exact-pin + 显式升级决策）均从「SDK 内建」转为本仓自研自养。
- **成稿质量漂移风险**：有两个独立来源——① 旧 SDK 运行时的系统提示词/上下文组装
  是创作 prompt 调优的隐性底色（P1B 战役在其上调优），换底色必然变量；② wire 协议——
  已通过「默认保留 anthropic 兼容端点」决策冻结为单变量，A/B 质量门只验①。功能跑通
  不等于验收通过。
- **ADR 继承关系**：ADR-0009（打包 Agent run 使用内置 headless runtime）、ADR-0027
  （维持旧 SDK 运行时 0.2.112 锁版）在阶段 4（拆旧）完成后由本 ADR supersede。
