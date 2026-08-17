/**
 * eager 工具参数救回扩展单测（issue #16）。
 *
 * 纪律：事件序列**不手写**，而是驱动真实的 `streamAnthropic`（注入假 client 喂构造 SSE）拿到
 * 上游真正推送的 AssistantMessageEvent，再照 `agent-session.js` `_emitExtensionEvent` 的桥接
 * 形状包成 message_update / message_end 交给扩展。手写事件只能验证「代码符合我对事件形状的
 * 假设」，一旦假设错了测试照样绿——本仓吃过这种假绿的亏，这里用真实流事件把这条路堵死。
 *
 * 三条序列各锁一件事：
 * - eager 无 delta   → 参数被上游抹空，扩展必须救回（本 issue 的现场）
 * - 标准增量 delta   → 上游本来就对，扩展必须一个字节都不改（防回归）
 * - delta 中途截断   → 上游交出半个对象，扩展不介入（明确的范围外，见实现文件拆除说明书）
 */
import { describe, expect, test } from 'bun:test'
import { streamAnthropic } from '@mariozechner/pi-ai/anthropic'
import type { Model } from '@mariozechner/pi-ai'
import { createPiEagerToolArgsRestorer } from './pi-eager-toolcall-args.ts'

const TOOL_NAME = 'novel_submit_outline'
const FULL_ARGS = {
  phase: 1,
  scope: 'full',
  payload: { central_dramatic_question: '他能否夺回宗门？', volumes: [{ volume_no: 1 }] },
}
const FULL_ARGS_JSON = JSON.stringify(FULL_ARGS)

type SseEvent = { type: string } & Record<string, unknown>

function toSse(events: SseEvent[]): string {
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
}

function messageEnvelope(events: SseEvent[]): SseEvent[] {
  return [
    { type: 'message_start', message: { id: 'msg_1', usage: { input_tokens: 10, output_tokens: 0 } } },
    ...events,
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } },
    { type: 'message_stop' },
  ]
}

/** 服务端把完整参数塞进 content_block_start.input，之后不发任何 input_json_delta。 */
const EAGER_NO_DELTA = messageEnvelope([
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'tool_use', id: 'toolu_1', name: TOOL_NAME, input: FULL_ARGS },
  },
  { type: 'content_block_stop', index: 0 },
])

/** 官方 Anthropic 的标准增量形态。 */
const STANDARD_DELTA = messageEnvelope([
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'tool_use', id: 'toolu_1', name: TOOL_NAME, input: {} },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'input_json_delta', partial_json: FULL_ARGS_JSON.slice(0, 30) },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'input_json_delta', partial_json: FULL_ARGS_JSON.slice(30) },
  },
  { type: 'content_block_stop', index: 0 },
])

/**
 * eager input 之后跟一条把参数撤空的增量。最终的 `{}` 是模型自己算出来的真实意图，
 * 不是传输丢失——恢复旧值等于执行一个模型已经放弃的调用。
 */
const EAGER_THEN_EMPTY_DELTA = messageEnvelope([
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'tool_use', id: 'toolu_1', name: TOOL_NAME, input: FULL_ARGS },
  },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } },
  { type: 'content_block_stop', index: 0 },
])

/** 增量在 payload 的值开始之前断掉（max_tokens / 断流）。 */
const TRUNCATED_DELTA = messageEnvelope([
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'tool_use', id: 'toolu_1', name: TOOL_NAME, input: {} },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'input_json_delta', partial_json: '{"phase":1,"scope":"full","payload":' },
  },
  { type: 'content_block_stop', index: 0 },
])

const MODEL: Model<'anthropic-messages'> = {
  id: 'fake-anthropic-compatible',
  name: 'fake-anthropic-compatible',
  api: 'anthropic-messages',
  provider: 'anthropic',
  baseUrl: 'https://example.invalid',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 200_000,
  maxTokens: 8192,
}

function fakeClient(events: SseEvent[]) {
  return {
    messages: {
      create: () => ({
        asResponse: async () =>
          new Response(toSse(events), { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      }),
    },
  }
}

/**
 * 跑真实上游解析，把流事件按 agent-session 的桥接形状交给扩展，返回扩展收工后的 assistant 消息
 * （扩展返回替换消息则用替换后的那份，与 `_replaceMessageInPlace` 的效果等价）。
 */
async function runThroughExtension(events: SseEvent[]): Promise<{
  beforeExtension: unknown
  afterExtension: unknown
}> {
  const extension = createPiEagerToolArgsRestorer()
  const onUpdate = extension.handlers.get('message_update')?.[0]
  const onEnd = extension.handlers.get('message_end')?.[0]
  if (!onUpdate || !onEnd) throw new Error('扩展未注册 message_update / message_end 处理器')

  const stream = streamAnthropic(MODEL, {
    messages: [{ role: 'user', content: '提交大纲' }],
    tools: [{ name: TOOL_NAME, description: '提交全书大纲', parameters: { type: 'object', properties: {} } }],
    // biome-ignore lint/suspicious/noExplicitAny: 测试替身，只需满足 streamAnthropic 的运行时形状
  } as any, { client: fakeClient(events) as any, apiKey: 'test' })

  let finalMessage: unknown
  for await (const streamEvent of stream) {
    if (streamEvent.type === 'done' || streamEvent.type === 'error') {
      finalMessage = streamEvent.partial ?? streamEvent.message
      continue
    }
    // agent-loop 对每个流事件都发一次 message_update，message 是当轮 partial 的浅拷贝。
    const partial = (streamEvent as { partial?: unknown }).partial
    if (partial) {
      await onUpdate({ message: { ...(partial as object) }, assistantMessageEvent: streamEvent })
    }
  }

  const beforeExtension = structuredClone(finalMessage)
  const result = (await onEnd({ message: finalMessage })) as { message?: unknown } | undefined
  return { beforeExtension, afterExtension: result?.message ?? finalMessage }
}

function toolCallArgs(message: unknown): unknown {
  const content = (message as { content?: unknown[] })?.content ?? []
  const block = content.find((entry) => (entry as { type?: string })?.type === 'toolCall')
  return (block as { arguments?: unknown })?.arguments
}

describe('createPiEagerToolArgsRestorer', () => {
  test('eager input 且无 delta：上游抹成空对象，扩展救回完整参数', async () => {
    const { beforeExtension, afterExtension } = await runThroughExtension(EAGER_NO_DELTA)
    // 先钉住上游确实有这个 bug——这条断言失败就说明上游修了，本扩展该按拆除说明书摘除。
    expect(toolCallArgs(beforeExtension)).toEqual({})
    expect(toolCallArgs(afterExtension)).toEqual(FULL_ARGS)
  })

  test('标准增量 delta：上游本就正确，扩展不改动', async () => {
    const { beforeExtension, afterExtension } = await runThroughExtension(STANDARD_DELTA)
    expect(toolCallArgs(beforeExtension)).toEqual(FULL_ARGS)
    expect(toolCallArgs(afterExtension)).toEqual(FULL_ARGS)
  })

  test('eager 之后来了把参数撤空的增量：那是模型的真实意图，不许恢复', async () => {
    const { beforeExtension, afterExtension } = await runThroughExtension(EAGER_THEN_EMPTY_DELTA)
    // 最终参数同样是 {}，但这次是模型自己撤销的，与「无 delta 被抹空」必须区别对待——
    // 判据是「有没有来过 toolcall_delta」，不是「最终是不是空」。
    expect(toolCallArgs(beforeExtension)).toEqual({})
    expect(toolCallArgs(afterExtension)).toEqual({})
  })

  test('delta 中途截断：非本扩展职责，不介入、不误救', async () => {
    const { beforeExtension, afterExtension } = await runThroughExtension(TRUNCATED_DELTA)
    // 上游对截断的 JSON 做部分解析，交出缺 payload 的半个对象；它非空，扩展不该碰。
    expect(toolCallArgs(beforeExtension)).toEqual({ phase: 1, scope: 'full' })
    expect(toolCallArgs(afterExtension)).toEqual({ phase: 1, scope: 'full' })
  })

  test('快照不跨消息残留：上一条消息的 eager 参数不会污染下一条', async () => {
    const extension = createPiEagerToolArgsRestorer()
    const onUpdate = extension.handlers.get('message_update')?.[0]
    const onEnd = extension.handlers.get('message_end')?.[0]
    if (!onUpdate || !onEnd) throw new Error('扩展未注册处理器')

    await onUpdate({
      message: {},
      assistantMessageEvent: {
        type: 'toolcall_start',
        contentIndex: 0,
        partial: { content: [{ type: 'toolCall', id: 'toolu_1', name: TOOL_NAME, arguments: FULL_ARGS }] },
      },
    })
    await onEnd({
      message: { role: 'assistant', content: [{ type: 'toolCall', id: 'toolu_1', name: TOOL_NAME, arguments: {} }] },
    })

    // 第二条消息没有任何 toolcall_start，空参数就该保持空——不能拿上一条的快照顶上。
    const second = (await onEnd({
      message: { role: 'assistant', content: [{ type: 'toolCall', id: 'toolu_2', name: TOOL_NAME, arguments: {} }] },
    })) as { message?: unknown } | undefined
    expect(second).toBeUndefined()
  })

  test('toolCallId 对不上时不张冠李戴', async () => {
    const extension = createPiEagerToolArgsRestorer()
    const onUpdate = extension.handlers.get('message_update')?.[0]
    const onEnd = extension.handlers.get('message_end')?.[0]
    if (!onUpdate || !onEnd) throw new Error('扩展未注册处理器')

    await onUpdate({
      message: {},
      assistantMessageEvent: {
        type: 'toolcall_start',
        contentIndex: 0,
        partial: { content: [{ type: 'toolCall', id: 'toolu_1', name: TOOL_NAME, arguments: FULL_ARGS }] },
      },
    })
    const result = (await onEnd({
      message: { role: 'assistant', content: [{ type: 'toolCall', id: 'toolu_OTHER', name: TOOL_NAME, arguments: {} }] },
    })) as { message?: unknown } | undefined
    expect(result).toBeUndefined()
  })
})
