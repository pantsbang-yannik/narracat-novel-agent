/**
 * 渠道模型清单拉取（双 wire）：
 * - anthropic wire：GET {base}/v1/models，x-api-key + anthropic-version 头；空 baseUrl 走官方端点。
 * - openai wire：GET {base}/models，Authorization Bearer 头；baseUrl 约定以 /v1 结尾原样拼接（不重复拼），
 *   且必须有 baseUrl（openai wire 无「官方默认端点」语义，custom 渠道必填）。
 * 各家兼容端点不保证支持——一切失败（网络/状态码/形态不符）都收敛为 ok:false，由 UI 静默回落
 * 内置目录，绝不抛出。fetchImpl 参数是测试注入点（DI 而非 mock.module，仓库惯例）。
 */
import type { WireId } from '@shared/types/config'
import type { ProviderModelListResult } from '@shared/types/ipc'
import { redactErrorMessage } from './redact.ts'

const ANTHROPIC_OFFICIAL_BASE_URL = 'https://api.anthropic.com'
const LIST_MODELS_TIMEOUT_MS = 10_000

export async function fetchProviderModels(
  input: { baseUrl: string; apiKey: string; wire?: WireId },
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderModelListResult> {
  if (input.wire === 'openai' && !input.baseUrl.trim()) {
    return { ok: false, message: 'OpenAI 协议需要先填写接口地址（以 /v1 结尾）再拉取模型清单。' }
  }
  const base = (input.baseUrl || ANTHROPIC_OFFICIAL_BASE_URL).replace(/\/$/, '')
  const isOpenAi = input.wire === 'openai'
  const url = isOpenAi ? `${base}/models` : `${base}/v1/models`
  const headers = isOpenAi
    ? { Authorization: `Bearer ${input.apiKey}` }
    : {
        'x-api-key': input.apiKey,
        'anthropic-version': '2023-06-01',
      }
  try {
    const response = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(LIST_MODELS_TIMEOUT_MS),
    })
    if (!response.ok) {
      return { ok: false, message: `该服务商暂不支持拉取模型清单（HTTP ${response.status}）。` }
    }
    const payload = (await response.json()) as { data?: Array<{ id?: unknown }> }
    if (!Array.isArray(payload?.data)) {
      return { ok: false, message: '该服务商返回的清单格式无法识别。' }
    }
    const seen = new Set<string>()
    const models: string[] = []
    for (const item of payload.data) {
      if (typeof item?.id !== 'string' || !item.id.trim() || seen.has(item.id)) continue
      seen.add(item.id)
      models.push(item.id)
    }
    return { ok: true, models }
  } catch (error) {
    return { ok: false, message: `拉取模型清单失败：${redactErrorMessage(error)}` }
  }
}
