# ADR 0017: 本地分发的 Agent Core 不是保密边界

## Status

Accepted

## Context

ADR-0007 cutover 后，NarraCat Agent Core 由产品内部维护于 `agent-core/narracat/`，打包时被复制进 Electron resources 作为运行适配器（`NarraCatAgentCore`）。这意味着 commands、agents、skills、schemas、prompt 与 MCP 代码都随桌面客户端本地分发。

ADR-0009 在确立 bundled headless runtime 时明确**不解决** Agent Core 的保密性（"This decision does not make locally distributed Agent Core resources confidential… that requires a separate Agent Core distribution or cloud-runtime decision"），把这条边界决策留给了本 ADR（对应 #129）。

需要拍板的问题：随客户端分发的 Agent Core 资源，是否被当作机密对待？若需要保密，什么必须移到服务端？

约束事实：

- 桌面客户端的本地资源在用户机器上本来就可读——Electron asar 可解包，本地分发的任何 prompt / 命令 / schema 都能被取出。在客户端做混淆或加密只是 security-by-obscurity，不提供真实 IP 保护。
- 产品当前是 privacy-first BYOK：用户自带 API Key（经 Keychain，永不落盘明文），创作数据留本地。这带来的是**隐私**收益，不是**IP 保护**收益——两者是不同的边界。
- 产品仍在 dogfood，无商业机密上线压力。

## Decision

本地分发的 NarraCat Agent Core 资源**被视为可被用户读取的产品资源，不是保密边界**。第一个商业版本接受本地可读的 Agent Core。

明确切分两类收益，避免混为一谈：

- **隐私 / BYOK**（本地架构能给）：创作数据与 API Key 不出本机，不经第三方服务端中转。
- **IP 保护**（本地架构给不了）：核心 prompt、编排策略、路由逻辑、商业策略一旦随客户端分发即可被读取，本地手段无法真正保护。

若未来需要保护上述核心 IP，**唯一有效路径是服务端边界**：把需要保护的编排 / prompt / 路由移到 NarraCat Cloud Agent runtime 或云端编排服务，客户端只通过产品化的 Agent 动作契约 + 事件流与之交互（见 #130），而不直接持有受保护资源。

## Considered Options

- **客户端混淆 / 加密 Agent Core 资源**：否决。asar 可解包，混淆是 security-by-obscurity，徒增构建与调试复杂度却不提供真实保护。
- **现在就建服务端边界保护核心 IP**：否决（过早）。dogfood / BYOK 阶段没有商业机密上线压力，过早上云会把架构成本压在收益之前。
- **接受本地可读、把 IP 保护推迟到未来的服务端边界**：采纳。诚实地承认本地分发的能力边界，不在客户端假装安全；需要保护时再开服务端决策。

## Consequences

- 第一个商业版本不把 Agent Core 当机密，release 流程不需要资源加密 / 混淆门。
- 隐私叙事与 IP 叙事分开表述：对用户讲 BYOK / 数据留本地（真），不暗示本地分发的 prompt 不可见（假）。
- #130（server-ready 动作契约）是本决策的下游实施：让 renderer 依赖产品化动作 + 稳定事件流，而非本地 command / runtime 细节，从而为未来把受保护部分迁到云 adapter 预留接口。本 ADR 是 #130 的前置（#130 硬依赖 #129）。
- `CONTEXT.md` 的「Agent Core distribution boundary / Agent Core 分发边界」术语（已存在）是本 ADR 的规范语言锚点，二者一致，无需改动。
- 决策可逆：当产品方向变为需要保护商业策略时，重开服务端边界决策、把对应资源迁到 server，本地仅保留运行适配器；本 ADR 记录的是"当前阶段不把本地分发当保密边界"，不是"永远不保护"。
