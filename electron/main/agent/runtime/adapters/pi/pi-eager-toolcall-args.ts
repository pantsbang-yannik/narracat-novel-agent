/**
 * eager 工具参数救回扩展（issue #16）：Anthropic 兼容端点把完整工具参数直接放在
 * `content_block_start.input`、之后不发任何 `input_json_delta` 时，pi 会在流收尾处把已经收到的
 * 参数覆盖成 `{}`，工具因此收到空参数并撞 schema 校验。本扩展在 pi 官方扩展点上把它救回来。
 *
 * ## 上游根因（@mariozechner/pi-ai@0.73.1）
 *
 * - `dist/providers/anthropic.js` L383：`arguments: event.content_block.input ?? {}`
 *   —— eager input 是正确收下的。
 * - `dist/providers/anthropic.js` L463：`content_block_stop` 分支**无条件**执行
 *   `block.arguments = parseStreamingJson(block.partialJson)`。
 * - `dist/utils/json-parse.js` L91：`parseStreamingJson("")` 直接 `return {}`。
 *
 * 没有 delta 时 `partialJson` 恒为空串，于是收尾这一步把完整参数抹成空对象。官方 Anthropic
 * 端点走增量 delta，不受影响；受影响的是自建/第三方兼容端点。这不是边角场景——
 * `pi-model.ts` 把 `api` 恒定写成 `'anthropic-messages'`，本 App 的所有 provider 都走这段解析。
 *
 * ## 为什么落在这里
 *
 * 试过且不可行的更早落点：
 * - **注入自定义 streamFn**：`pi-coding-agent` 的 `sdk.js` 内部硬编码构造 streamFn，
 *   `createAgentSession` 的 options 不透传，注入不进去。
 * - **`ToolDefinition.prepareArguments`**（上游自称 "compatibility shim"）：它在校验前跑，
 *   但签名只收 `args`、拿不到 toolCallId，也拿不到被覆盖前的 eager 值，救不了本场景。
 * - **`tool_call` 扩展事件**：`pi-agent-core/dist/agent-loop.js` L340-341 是
 *   `prepareToolCallArguments` → `validateToolArguments` → 之后才 `beforeToolCall`。
 *   参数为空时校验已经先抛错，钩子根本不会被调用。
 *
 * 可行的是这一对官方扩展事件，时序由上游保证：
 * - `message_update` 携带 pi-ai 原始流事件（`assistantMessageEvent`），`toolcall_start` 那一拍
 *   读得到尚未被覆盖的 eager 参数。
 * - `message_end` 在 `agent-loop.js` L96 emit、L111 才提取 toolCalls、L115 才执行工具，
 *   且 `agent-session.js` 的 `_emitExtensionEvent` 是在通知普通监听者**之前** await 扩展的。
 *   返回 `{ message }` 由上游 `_replaceMessageInPlace` 原地写回（官方替换通道，会同步到
 *   agent 状态、后续事件与会话持久化），比自行 mutate 事件对象规范。
 *
 * ## 拆除说明书
 *
 * 这是给上游 bug 打的桥，不是本仓要长期持有的能力。
 * - 钉死版本：`@mariozechner/pi-ai@0.73.1`（`package.json` 精确版本，非 range）。
 * - 上游修复后如何确认：读 `dist/providers/anthropic.js` 的 `content_block_stop` 分支，
 *   若覆盖前已判空（形如 `if (block.partialJson) block.arguments = ...`），本扩展即可摘除。
 * - 怎么复测：`pi-eager-toolcall-args.test.ts` 覆盖三种事件序列（eager 无 delta / 标准增量 /
 *   截断）。摘除时整份删掉即可，不与其他模块耦合；装配处见 `index.ts` 的 extensions 数组。
 * - 注意本扩展**不**处理截断场景（见测试第三例）：截断时 pi 会静默交出半个对象，那是另一条
 *   路径（缺字段而非全空），救它需要的是「参数不完整」信号，上游目前没有，不在本扩展范围内。
 */
import { createSyntheticSourceInfo } from '@mariozechner/pi-coding-agent'
import type { Extension } from '@mariozechner/pi-coding-agent'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 空参数判定：非对象（含 null/undefined）或零键对象都算——两者模型都无法用于真实调用。 */
function isEmptyArguments(value: unknown): boolean {
  if (!isRecord(value)) return true
  return Object.keys(value).length === 0
}

/**
 * pi 包根 barrel 没导出 `MessageUpdateEvent` / `MessageEndEvent` / `MessageEndEventResult`
 * （只在内部 `core/extensions/types.d.ts`），照 `agent-session.js` `_emitExtensionEvent` 实际
 * 推送的形状在此本地声明等价结构（同 pi-engine-hooks.ts 的先例）。
 */
type PiMessageUpdateEvent = {
  message: unknown
  assistantMessageEvent: unknown
}
type PiMessageEndEvent = {
  message: unknown
}
type PiMessageEndEventResult = {
  message: unknown
}

/**
 * 单条 assistant 消息内的 eager 参数快照。键用 `contentIndex` 而非 toolCallId：部分 provider
 * 压根不回 tool call id（`pi-session.ts` 的 toolCallId 空串兜底就是为此而存在），用 id 做键
 * 会在那些 provider 上直接失效。索引在 `message_update.partial.content` 与
 * `message_end.message.content` 之间是同一个数组，天然对齐。
 */
type EagerSnapshot = { args: UnknownRecord; toolCallId: string | undefined }

export function createPiEagerToolArgsRestorer(): Extension {
  /** run 级、按 assistant 消息滚动清空：每条 message_end 收尾即清，不跨消息累积。 */
  let snapshots = new Map<number, EagerSnapshot>()

  function onMessageUpdate(event: PiMessageUpdateEvent): void {
    const streamEvent = event.assistantMessageEvent
    if (!isRecord(streamEvent) || streamEvent.type !== 'toolcall_start') return
    const contentIndex = streamEvent.contentIndex
    if (typeof contentIndex !== 'number') return

    // eager 参数只在 toolcall_start 这一拍可见；partial 与 message 指向同一 content 数组，
    // 优先读 partial（pi-ai 直接推送的那份），缺失时回落 message。
    const partial = isRecord(streamEvent.partial) ? streamEvent.partial : event.message
    if (!isRecord(partial) || !Array.isArray(partial.content)) return
    const block = partial.content[contentIndex]
    if (!isRecord(block) || block.type !== 'toolCall') return
    if (isEmptyArguments(block.arguments)) return

    snapshots.set(contentIndex, {
      // 存引用即可：上游收尾是把 block.arguments 整体**换成**新对象，不是就地改写这一份。
      args: block.arguments as UnknownRecord,
      toolCallId: typeof block.id === 'string' && block.id ? block.id : undefined,
    })
  }

  function onMessageEnd(event: PiMessageEndEvent): PiMessageEndEventResult | undefined {
    const captured = snapshots
    // 无论本条消息救没救到，收尾都要清空——快照只对产生它的那条 assistant 消息有效。
    snapshots = new Map()

    if (captured.size === 0) return undefined
    const message = event.message
    if (!isRecord(message) || message.role !== 'assistant' || !Array.isArray(message.content)) return undefined

    let restored = false
    const content = message.content.map((block, index) => {
      if (!isRecord(block) || block.type !== 'toolCall') return block
      if (!isEmptyArguments(block.arguments)) return block
      const snapshot = captured.get(index)
      if (!snapshot) return block
      // id 两端都在却对不上 = 索引语义与预期不符（上游改了 content 组装顺序之类），
      // 宁可让原本的空参数报错，也不能张冠李戴把参数塞给另一个工具调用。
      const blockId = typeof block.id === 'string' && block.id ? block.id : undefined
      if (snapshot.toolCallId && blockId && snapshot.toolCallId !== blockId) return block
      restored = true
      return { ...block, arguments: snapshot.args }
    })

    if (!restored) return undefined
    return { message: { ...message, content } }
  }

  const extensionPath = '<narracat:pi-eager-toolcall-args>'
  const handlers = new Map<string, Array<(...args: unknown[]) => Promise<unknown>>>()
  handlers.set('message_update', [
    async (event) => {
      onMessageUpdate(event as PiMessageUpdateEvent)
      return undefined
    },
  ])
  handlers.set('message_end', [async (event) => onMessageEnd(event as PiMessageEndEvent)])
  return {
    path: extensionPath,
    resolvedPath: extensionPath,
    sourceInfo: createSyntheticSourceInfo(extensionPath, { source: 'narracat' }),
    handlers,
    tools: new Map(),
    messageRenderers: new Map(),
    commands: new Map(),
    flags: new Map(),
    shortcuts: new Map(),
  }
}
