/**
 * Provider 装配（模型池化切片①）：AppConfig → Pi 自定义 Model 描述，主力/轻量槽驱动
 * （shared/lib/model-slots 的 resolvePrimaryModel/resolveLightModel）。
 * wire 推导（spec §5.2 演进）：anthropic wire 恒为 anthropic-messages + 自定 baseUrl，保住
 * P1B 在 anthropic wire 上的全部调优与前缀缓存；custom 渠道可显式选 openai wire
 * （Chat Completions /chat/completions，pi-ai 的 openai-completions 实现直取 model.baseUrl）。
 * 不写 models.json 文件——Model 对象直接传 createAgentSession（spike 报告实测形态）。
 */
import type { Model } from '@mariozechner/pi-ai'
import type { AppConfig } from '@shared/types/config'
import { resolveLightModel, resolvePrimaryModel } from '@shared/lib/model-slots'

/** 窗口值与 SDK 侧 CLAUDE_CODE_MAX_CONTEXT_TOKENS 对齐。 */
const ONE_M_CONTEXT_WINDOW = 1_000_000
const DEFAULT_CONTEXT_WINDOW = 200_000
/** 对齐 SDK 路径的实际输出上限（sdk-runner 未设输出 env，走 Claude CLI 默认 32000）——A/B 单变量
 * 纪律：8192 会截断章节写作长输出，是 SDK 路径没有的新变量；超限仍触发 stopReason='length'，
 * 由事件映射 fail-loud（生产接线门前项①）。 */
export const TARGET_MAX_OUTPUT_TOKENS = 32_000

/**
 * 上游补偿系数（issue #35）：`@mariozechner/pi-ai@0.73.1` 的 `buildParams`
 * （`dist/providers/anthropic.js:663`）是
 *
 *     max_tokens: options?.maxTokens || (model.maxTokens / 3) | 0
 *
 * 而 `pi-coding-agent` 的 `sdk.js` 与 `pi-agent-core` 的 `agent-loop.js` **都不透传**
 * `options.maxTokens`（两处 grep 零命中），于是实发恒等于 `model.maxTokens / 3`。
 * 上面那句「对齐 32000」因此一直只兑现了 10666——比它想躲开的 8192 高不了多少，
 * 冷改整章（正文 + thinking + 收尾说明）稳定贴顶，就是 #29 高频截断的根因。
 *
 * 这里存 3 倍，让**实发**等于 TARGET。这是给上游行为打的桥，不是本仓要长期持有的能力。
 *
 * ## 拆除说明书
 *
 * - 钉死版本：`@mariozechner/pi-ai@0.73.1`（package.json 精确版本，非 range）
 * - 上游修复后如何确认：读 `dist/providers/anthropic.js` 的 `buildParams`，若 `/ 3` 消失，
 *   或 sdk / agent-loop 开始透传 `options.maxTokens`——**必须立刻改回直接用 TARGET**，
 *   否则 96000 会被原样发给 provider，可能直接被拒。
 * - 怎么复测：`pi-model.test.ts` 里「实发 max_tokens」那条用例复刻了上游算式，改坏即红。
 */
const PI_UPSTREAM_MAX_TOKENS_DIVISOR = 3
const DEFAULT_MAX_TOKENS = TARGET_MAX_OUTPUT_TOKENS * PI_UPSTREAM_MAX_TOKENS_DIVISOR

/** 复刻 pi-ai@0.73.1 `buildParams` 的算式，供测试与排查核对「配置值 → 实发值」。 */
export function effectivePiMaxTokens(modelMaxTokens: number): number {
  return (modelMaxTokens / PI_UPSTREAM_MAX_TOKENS_DIVISOR) | 0
}
const ANTHROPIC_OFFICIAL_BASE_URL = 'https://api.anthropic.com'

/** 可选 wire 支持的 Model 泛型：anthropic-messages（默认）或 openai-completions（custom 渠道可选）。 */
export type PiModelWire = 'anthropic-messages' | 'openai-completions'

/**
 * 子 agent frontmatter 的 model 别名 → 槽位（模型池化）：opus/sonnet 继承 run 模型（主力槽），
 * haiku 映射轻量槽。子会话共用 run 的 provider/apiKey，故轻量槽跨 provider 时回落主力
 * （返回 undefined = 继承）；直调轻活路径无此约束。非法别名一律 undefined，不做透传旁路。
 */
export function resolvePiModelAlias(config: AppConfig, alias: string | undefined): string | undefined {
  if (alias !== 'haiku') return undefined
  const primary = resolvePrimaryModel(config)
  const light = resolveLightModel(config)
  if (!primary || !light) return undefined
  if (light.provider !== primary.provider) return undefined
  return light.modelId === primary.modelId ? undefined : light.modelId
}

export function createPiModel(config: AppConfig, explicitId?: string): Model<PiModelWire> {
  const primary = resolvePrimaryModel(config)
  if (!primary) throw new Error('未配置任何模型，无法构造 Pi 模型描述')
  // openai wire 没有「官方默认端点」语义（custom 渠道必填 baseUrl）；空着打到 anthropic 官方端点
  // 会得到一堆难懂的 404，提前拦下给出可操作提示。
  if (primary.wire === 'openai' && !primary.baseUrl) {
    throw new Error('OpenAI 协议渠道需要先在设置中填写接口地址（以 /v1 结尾，如 https://example.com/v1）。')
  }
  const id = explicitId || primary.modelId
  return {
    id,
    name: id,
    api: primary.wire === 'openai' ? 'openai-completions' : 'anthropic-messages',
    provider: primary.provider,
    baseUrl: primary.baseUrl || ANTHROPIC_OFFICIAL_BASE_URL,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    // [1m] 按实际选中模型判（修掉旧「三档任一带即全局 1M」怪味）
    contextWindow: id.includes('[1m]') ? ONE_M_CONTEXT_WINDOW : DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
  }
}
