/**
 * 耗时归因仪表测试（issue #28 刀 D）：时钟经 DI 注入，逐毫秒钉死 prefill/decode 切分、
 * 子 agent 分组、工具明细与落盘形态。
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createPiRunTimingRecorder,
  isEmptyPiRunTimingReport,
  piRunTimingFileName,
  writePiRunTimingReport,
} from './pi-run-timing.ts'
import type { PiRunTimingReport } from './pi-run-timing.ts'

/** 可手拨的假时钟：每个 observe 前把 t 拨到该事件发生的时刻。 */
function makeClock(start = 1_000) {
  let t = start
  return {
    now: () => t,
    at(next: number) {
      t = next
    },
  }
}

function assistantMessageEnd(
  overrides: { model?: string; usage?: Record<string, number>; stopReason?: string } = {},
): Record<string, unknown> {
  return {
    type: 'message_end',
    message: {
      role: 'assistant',
      model: overrides.model ?? 'deepseek-v4-pro',
      stopReason: overrides.stopReason ?? 'stop',
      usage: overrides.usage ?? { input: 100, output: 20, cacheRead: 5, cacheWrite: 1 },
    },
  }
}

const assistantMessageStart = { type: 'message_start', message: { role: 'assistant' } }
const textDelta = { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '正' } }

describe('createPiRunTimingRecorder 主会话计账', () => {
  test('一次模型调用切成 prefill（请求发出→首 token）与 decode（首 token→收笔）', () => {
    const clock = makeClock()
    const recorder = createPiRunTimingRecorder({ now: clock.now })

    recorder.observe({ type: 'agent_start' })
    clock.at(1_010)
    recorder.observe(assistantMessageStart)
    clock.at(1_050)
    recorder.observe(textDelta)
    clock.at(1_060)
    recorder.observe(textDelta)
    clock.at(1_200)
    recorder.observe(assistantMessageEnd())
    clock.at(1_300)

    const report = recorder.report('sess-1')
    expect(report.main.modelCalls).toBe(1)
    // 请求发出时刻取「上一条事件」（agent_start@1000），不是 message_start@1010——否则连线与排队算漏
    expect(report.main.prefillMs).toBe(50)
    expect(report.main.decodeMs).toBe(150)
    expect(report.main.model).toBe('deepseek-v4-pro')
    expect(report.main.usage).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 5,
      cacheCreationTokens: 1,
    })
    expect(report.main.wallMs).toBe(300)
    expect(report.wallMs).toBe(300)
    expect(report.sessionId).toBe('sess-1')
    expect(report.subagents).toEqual([])
  })

  test('用户 prompt / 工具结果的 message_start·message_end 不算模型调用', () => {
    const clock = makeClock()
    const recorder = createPiRunTimingRecorder({ now: clock.now })

    recorder.observe({ type: 'message_start', message: { role: 'user' } })
    recorder.observe({ type: 'message_end', message: { role: 'user' } })
    recorder.observe({ type: 'message_end', message: { role: 'toolResult', toolName: 'Read' } })
    clock.at(2_000)

    expect(recorder.report().main.modelCalls).toBe(0)
  })

  test('无 delta 的模型调用（未流式/秒错）不产出负数，decode 记 0', () => {
    const clock = makeClock()
    const recorder = createPiRunTimingRecorder({ now: clock.now })

    recorder.observe({ type: 'agent_start' })
    clock.at(1_100)
    recorder.observe(assistantMessageStart)
    clock.at(1_400)
    recorder.observe(assistantMessageEnd({ stopReason: 'error' }))

    const report = recorder.report()
    expect(report.main.prefillMs).toBe(400)
    expect(report.main.decodeMs).toBe(0)
  })

  test('工具明细：start/end 配对出 durationMs 与 toolMs，孤儿 end 忽略', () => {
    const clock = makeClock()
    const recorder = createPiRunTimingRecorder({ now: clock.now })

    recorder.observe({ type: 'tool_execution_start', toolCallId: 'tc-1', toolName: 'Read' })
    clock.at(1_400)
    recorder.observe({ type: 'tool_execution_end', toolCallId: 'tc-1', toolName: 'Read' })
    recorder.observe({ type: 'tool_execution_end', toolCallId: 'tc-unknown', toolName: 'Write' })
    clock.at(1_500)

    const report = recorder.report()
    expect(report.main.toolMs).toBe(400)
    expect(report.main.tools).toEqual([
      { toolName: 'Read', toolCallId: 'tc-1', startedAt: new Date(1_000).toISOString(), durationMs: 400 },
    ])
  })
})

describe('createPiRunTimingRecorder 子 agent 归因', () => {
  const alpha = { agentId: 'chapter-writer', parentToolCallId: 'task-1' }
  const beta = { agentId: 'memory-keeper', parentToolCallId: 'task-2' }

  test('按 parentToolCallId 分组：同名 agent 的两次派发各成一条 span，token 各记各的', () => {
    const clock = makeClock()
    const recorder = createPiRunTimingRecorder({ now: clock.now })

    // 主会话派发 Task（工具明细的 toolCallId 就是子 span 的 parentToolCallId，瀑布靠它拼）
    recorder.observe({ type: 'tool_execution_start', toolCallId: 'task-1', toolName: 'Task' })
    clock.at(1_100)
    recorder.observe(assistantMessageStart, alpha)
    clock.at(1_150)
    recorder.observe(textDelta, alpha)
    clock.at(1_450)
    recorder.observe(assistantMessageEnd({ model: 'deepseek-v4-pro', usage: { input: 10, output: 2 } }), alpha)
    clock.at(1_500)
    recorder.observe({ type: 'tool_execution_end', toolCallId: 'task-1', toolName: 'Task' })

    clock.at(1_600)
    recorder.observe(assistantMessageStart, beta)
    clock.at(1_700)
    recorder.observe(assistantMessageEnd({ model: 'deepseek-v4-lite', usage: { input: 7, output: 3 } }), beta)
    clock.at(2_000)

    const report = recorder.report()
    expect(report.subagents.map((span) => span.agentId)).toEqual(['chapter-writer', 'memory-keeper'])

    const [writer, keeper] = report.subagents
    expect(writer!.parentToolCallId).toBe('task-1')
    expect(writer!.prefillMs).toBe(50)
    expect(writer!.decodeMs).toBe(300)
    expect(writer!.wallMs).toBe(350)
    expect(writer!.usage).toEqual({ inputTokens: 10, outputTokens: 2, cacheReadTokens: 0, cacheCreationTokens: 0 })
    expect(keeper!.model).toBe('deepseek-v4-lite')
    expect(keeper!.usage.inputTokens).toBe(7)

    // 主会话的 Task 工具明细覆盖整段子会话墙钟，与子 span 的 parentToolCallId 对得上
    expect(report.main.tools).toEqual([
      { toolName: 'Task', toolCallId: 'task-1', startedAt: new Date(1_000).toISOString(), durationMs: 500 },
    ])
    // 子会话的账不并进主会话 span（并账口径归 pi-session 的 usageTotals）
    expect(report.main.modelCalls).toBe(0)
  })

  test('报告只装标识与数字：prompt、正文、工具参数一概不入账', () => {
    const clock = makeClock()
    const recorder = createPiRunTimingRecorder({ now: clock.now })

    recorder.observe({ type: 'tool_execution_start', toolCallId: 'tc-1', toolName: 'Write', args: { file_path: '/Users/me/novel/ch-001.md', content: '楚河抬起头。' } })
    clock.at(1_200)
    recorder.observe({ type: 'tool_execution_end', toolCallId: 'tc-1', toolName: 'Write', result: { content: [{ type: 'text', text: '楚河抬起头。' }] } })
    recorder.observe(
      { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '楚河抬起头。' } },
      alpha,
    )

    const serialized = JSON.stringify(recorder.report())
    expect(serialized).not.toContain('楚河抬起头')
    expect(serialized).not.toContain('/Users/me')
  })
})

describe('writePiRunTimingReport 落盘', () => {
  function makeReport(overrides: Partial<PiRunTimingReport> = {}): PiRunTimingReport {
    const recorder = createPiRunTimingRecorder({ now: () => 1_300 })
    return { ...recorder.report('sess-abc'), ...overrides }
  }

  test('文件名对齐 pi 会话文件的 ${timestamp}_${sessionId} 命名，内容是完整报告', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'narracat-pi-timing-')), 'timing')
    const report = makeReport()
    const path = await writePiRunTimingReport({ dir, report })

    expect(path).toBe(join(dir, piRunTimingFileName(report)))
    expect(piRunTimingFileName(report)).toBe('1970-01-01T00-00-01-300Z_sess-abc.json')
    expect(existsSync(path!)).toBe(true)
    expect(JSON.parse(readFileSync(path!, 'utf8'))).toEqual(report)
  })

  test('sessionId 里的路径分隔符不会带进文件名', () => {
    expect(piRunTimingFileName(makeReport({ sessionId: '../../escape' }))).toBe('1970-01-01T00-00-01-300Z_escape.json')
  })

  test('空报告（一次模型/工具调用都没有）被判空，调用方据此不落盘', () => {
    const empty = createPiRunTimingRecorder({ now: () => 1_300 }).report()
    expect(isEmptyPiRunTimingReport(empty)).toBe(true)

    const clock = makeClock()
    const recorder = createPiRunTimingRecorder({ now: clock.now })
    recorder.observe(assistantMessageStart)
    clock.at(1_200)
    recorder.observe(assistantMessageEnd())
    expect(isEmptyPiRunTimingReport(recorder.report())).toBe(false)
  })

  test('写失败只留警告不冒泡（仪表坏了不许把 run 带下水）', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'narracat-pi-timing-')), 'timing')
    const path = await writePiRunTimingReport({
      dir,
      report: makeReport(),
      writeFile: () => Promise.reject(new Error('磁盘满了')),
    })
    expect(path).toBeUndefined()
  })
})
