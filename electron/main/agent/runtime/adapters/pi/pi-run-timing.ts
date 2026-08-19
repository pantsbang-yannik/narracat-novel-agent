/**
 * Pi run 耗时归因仪表（issue #28 刀 D，"没有度量就没有优化"的那把尺）。
 *
 * 把一次 run 的墙钟按 span 切开——主会话一条、每次子 agent 派发各一条——每条再拆成三份：
 * 等模型（连线 + 排队 + prefill）、解码（首 token → 收笔）、本地工具，配上 token 账与模型 id。
 * 主会话 span 的工具明细里 `Task` 调用的 toolCallId 即子 agent span 的 parentToolCallId，据此
 * 能事后重建一次 /write 的耗时瀑布：哪个子 agent 花了多久、烧了多少 token、慢在解码还是等模型。
 *
 * 三条纪律：
 * - **只进机器通道**：报告落 userData/pi-agent/timing 的独立文件，不映射成任何 AgentEvent，
 *   不进对话流也不进任务列表（ADR-0016 机器字段不入用户通道）。
 * - **只记标识与数字**：agentId / toolName / model / 时间戳 / token 数；prompt、正文、工具参数
 *   一律不记，落盘前标识串再过一遍 sanitizeDurableText。
 * - **恒不阻断**：观测只做属性读与计数，落盘吞掉一切异常——仪表坏了不许把 run 带下水。
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { sanitizeDurableText } from '@shared/lib/agent-durable-events'
import type { AgentTokenUsage } from '@shared/types/agent'
import { atomicWriteFile } from '../../../../atomic-write.ts'

/** 主会话 span 的分组键与 agentId 占位（引擎 agent id 里没有 main，不会撞名）。 */
const MAIN_SPAN_KEY = 'main'
/** 标识串落盘长度上限：agentId/toolName/model 都是短标识，超长即视为异常输入，截断。 */
const MAX_LABEL_LENGTH = 120
/** 单 span 工具明细条数上限：瀑布图够用即可，异常长的 run 不许把报告撑爆。 */
const MAX_TOOL_SPANS = 500

/** 耗时报告文件后缀（陈旧清扫按它筛，见 pi-session.ts resolveTimingDir）。 */
export const PI_TIMING_FILE_SUFFIX = '.json'

export interface PiTimingToolSpan {
  toolName: string
  /** 主会话里 Task 调用的 toolCallId = 对应子 agent span 的 parentToolCallId（瀑布拼接键）。 */
  toolCallId: string
  startedAt: string
  durationMs: number
}

export interface PiTimingSpan {
  /** 主会话恒为 main；子会话为引擎 agent id。 */
  agentId: string
  /** 子会话才有：派发它的 Task 工具调用号。 */
  parentToolCallId?: string
  /** 最后一次 assistant 回复用的模型 id（刀 A 验模型分层是否真的生效）。 */
  model?: string
  startedAt: string
  finishedAt: string
  wallMs: number
  /** 模型调用次数（assistant message 条数）。 */
  modelCalls: number
  /** 发出请求 → 首个 token：连线 + 排队 + prefill。 */
  prefillMs: number
  /** 首个 token → 收笔：纯解码。 */
  decodeMs: number
  /** 本地工具执行累计（子会话的工具记在子会话自己的 span 上）。 */
  toolMs: number
  usage: AgentTokenUsage
  tools: PiTimingToolSpan[]
}

export interface PiRunTimingReport {
  schemaVersion: 1
  /** pi 原生会话 id：拿它能对回 userData/pi-agent/sessions 下的那份完整会话 JSONL。 */
  sessionId?: string
  recordedAt: string
  wallMs: number
  main: PiTimingSpan
  subagents: PiTimingSpan[]
}

/** 子会话事件的归属（来自 PiSubagentEventMessage；此处不 import 以免与 pi-session 成环）。 */
export interface PiTimingSubagentScope {
  agentId: string
  parentToolCallId: string
}

export interface PiRunTimingRecorder {
  /** 观测一条会话事件；子会话事件传 scope 归到自己的 span。 */
  observe: (event: unknown, scope?: PiTimingSubagentScope) => void
  report: (sessionId?: string) => PiRunTimingReport
}

type UnknownRecord = Record<string, unknown>

interface UsageTotals {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

interface SpanState {
  agentId: string
  parentToolCallId?: string
  model?: string
  startedAtMs: number
  lastEventAtMs: number
  modelCalls: number
  prefillMs: number
  decodeMs: number
  toolMs: number
  usage: UsageTotals
  tools: PiTimingToolSpan[]
  /** 本次模型调用的游标：请求发出时刻 / 首个 token 时刻。 */
  requestedAtMs?: number
  firstTokenAtMs?: number
  pendingTools: Map<string, { toolName: string; startedAtMs: number }>
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function label(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined
  return sanitizeDurableText(value, '', MAX_LABEL_LENGTH) || undefined
}

/** assistant 之外的 message_start/message_end（用户 prompt、工具结果回填）不是模型调用，不计账。 */
function isAssistantMessage(event: UnknownRecord): boolean {
  return isRecord(event.message) && event.message.role === 'assistant'
}

function hasDelta(event: UnknownRecord): boolean {
  const sub = event.assistantMessageEvent
  return isRecord(sub) && typeof sub.delta === 'string'
}

function addUsage(totals: UsageTotals, value: unknown): void {
  if (!isRecord(value)) return
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) {
    const amount = value[key]
    if (typeof amount === 'number') totals[key] += amount
  }
}

function toTokenUsage(totals: UsageTotals): AgentTokenUsage {
  return {
    inputTokens: totals.input,
    outputTokens: totals.output,
    cacheReadTokens: totals.cacheRead,
    cacheCreationTokens: totals.cacheWrite,
  }
}

/**
 * 记录器：全部状态是 run 级闭包，观测只做属性读、计数与 Map 存取，不抛。
 * 时钟经 now 注入（单测要确定性的毫秒切分）。
 */
export function createPiRunTimingRecorder({ now = Date.now }: { now?: () => number } = {}): PiRunTimingRecorder {
  const runStartedAtMs = now()
  const spans = new Map<string, SpanState>()

  function ensureSpan(key: string, at: number, scope?: PiTimingSubagentScope): SpanState {
    const existing = spans.get(key)
    if (existing) return existing
    const span: SpanState = {
      agentId: scope ? (label(scope.agentId) ?? 'unknown') : MAIN_SPAN_KEY,
      ...(scope ? { parentToolCallId: scope.parentToolCallId } : {}),
      // 主会话 span 从 run 起点算（建会话/装配也是墙钟的一部分）；子会话从首条事件算。
      startedAtMs: scope ? at : runStartedAtMs,
      lastEventAtMs: at,
      modelCalls: 0,
      prefillMs: 0,
      decodeMs: 0,
      toolMs: 0,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      tools: [],
      pendingTools: new Map(),
    }
    spans.set(key, span)
    return span
  }

  function observe(event: unknown, scope?: PiTimingSubagentScope): void {
    if (!isRecord(event)) return
    const at = now()
    const span = ensureSpan(scope?.parentToolCallId ?? MAIN_SPAN_KEY, at, scope)
    // 请求发出的时刻取「上一条事件」：pi 的 message_start 由 provider 首个响应事件触发（见
    // pi-agent-core agent-loop.js 的 stream "start" 分支），拿它当起点会把连线与排队时间算漏。
    const previousEventAtMs = span.lastEventAtMs
    span.lastEventAtMs = at

    if (event.type === 'message_start') {
      if (!isAssistantMessage(event)) return
      span.requestedAtMs = previousEventAtMs
      span.firstTokenAtMs = undefined
      return
    }

    if (event.type === 'message_update') {
      if (span.firstTokenAtMs === undefined && hasDelta(event)) span.firstTokenAtMs = at
      return
    }

    if (event.type === 'message_end') {
      if (!isAssistantMessage(event)) return
      const message = event.message as UnknownRecord
      const firstTokenAtMs = span.firstTokenAtMs ?? at
      const requestedAtMs = span.requestedAtMs ?? firstTokenAtMs
      span.modelCalls += 1
      span.prefillMs += Math.max(0, firstTokenAtMs - requestedAtMs)
      span.decodeMs += Math.max(0, at - firstTokenAtMs)
      span.requestedAtMs = undefined
      span.firstTokenAtMs = undefined
      span.model = label(message.model) ?? span.model
      addUsage(span.usage, message.usage)
      return
    }

    if (event.type === 'tool_execution_start') {
      const toolCallId = event.toolCallId
      if (typeof toolCallId !== 'string' || !toolCallId) return
      span.pendingTools.set(toolCallId, { toolName: label(event.toolName) ?? 'unknown', startedAtMs: at })
      return
    }

    if (event.type === 'tool_execution_end') {
      const toolCallId = event.toolCallId
      if (typeof toolCallId !== 'string' || !toolCallId) return
      const pending = span.pendingTools.get(toolCallId)
      if (!pending) return
      span.pendingTools.delete(toolCallId)
      const durationMs = Math.max(0, at - pending.startedAtMs)
      span.toolMs += durationMs
      if (span.tools.length < MAX_TOOL_SPANS) {
        span.tools.push({
          toolName: pending.toolName,
          toolCallId,
          startedAt: new Date(pending.startedAtMs).toISOString(),
          durationMs,
        })
      }
    }
  }

  function finalize(span: SpanState, finishedAtMs: number): PiTimingSpan {
    return {
      agentId: span.agentId,
      ...(span.parentToolCallId ? { parentToolCallId: span.parentToolCallId } : {}),
      ...(span.model ? { model: span.model } : {}),
      startedAt: new Date(span.startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      wallMs: Math.max(0, finishedAtMs - span.startedAtMs),
      modelCalls: span.modelCalls,
      prefillMs: span.prefillMs,
      decodeMs: span.decodeMs,
      toolMs: span.toolMs,
      usage: toTokenUsage(span.usage),
      tools: span.tools,
    }
  }

  function report(sessionId?: string): PiRunTimingReport {
    const finishedAtMs = now()
    const main = spans.get(MAIN_SPAN_KEY) ?? ensureSpan(MAIN_SPAN_KEY, finishedAtMs)
    const subagents = [...spans.entries()]
      .filter(([key]) => key !== MAIN_SPAN_KEY)
      .map(([, span]) => finalize(span, span.lastEventAtMs))
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    return {
      schemaVersion: 1,
      ...(sessionId ? { sessionId } : {}),
      recordedAt: new Date(finishedAtMs).toISOString(),
      wallMs: Math.max(0, finishedAtMs - runStartedAtMs),
      // 主会话 span 的墙钟就是整个 run 的墙钟（子 agent 派发是它的一次工具调用）。
      main: finalize(main, finishedAtMs),
      subagents,
    }
  }

  return { observe, report }
}

/**
 * 空报告：一次模型调用与工具调用都没发生（建会话即被取消、连通性探活之类）。这种报告只有墙钟
 * 没有归因，落盘只会把 timing 目录淹掉，不写。
 */
export function isEmptyPiRunTimingReport(report: PiRunTimingReport): boolean {
  return report.main.modelCalls === 0 && report.main.tools.length === 0 && report.subagents.length === 0
}

/** 报告文件名：对齐 pi 原生会话文件的 `${timestamp}_${sessionId}` 命名，好一眼对上同一次 run。 */
export function piRunTimingFileName(report: PiRunTimingReport): string {
  const stamp = report.recordedAt.replace(/[:.]/g, '-')
  const sessionId = (report.sessionId ?? '').replace(/[^A-Za-z0-9-]/g, '') || 'unknown'
  return `${stamp}_${sessionId}${PI_TIMING_FILE_SUFFIX}`
}

export interface WritePiRunTimingReportArgs {
  dir: string
  report: PiRunTimingReport
  writeFile?: typeof atomicWriteFile
}

/**
 * 落盘：尽力而为——目录建不了/写不进只留一行警告，绝不冒泡进 run（仪表不是正确性前提）。
 * 返回写成的路径，失败返回 undefined。
 */
export async function writePiRunTimingReport({
  dir,
  report,
  writeFile = atomicWriteFile,
}: WritePiRunTimingReportArgs): Promise<string | undefined> {
  const path = join(dir, piRunTimingFileName(report))
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`)
    return path
  } catch (error) {
    console.warn('[narracat] pi 耗时报告落盘失败（不阻断 run）', error)
    return undefined
  }
}
