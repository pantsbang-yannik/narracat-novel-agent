// src/lib/settings-config.ts
// settings.tsx 的 commitConfig 核心落盘逻辑（纯函数，抽出以便直测——组件层是 SSR-only，测不了交互）。
import { modelEntryKey } from '@shared/lib/model-slots'
import { PROVIDER_IDS, type ProviderSettings } from '@shared/types/config'
import type { AppConfig, ProviderId } from '@shared/types/ipc'

/**
 * 字段级草稿保护（PR #13 review 阻断项修法）：只把 draft 的 baseUrl（打字字段）覆回
 * saved，其余字段（wire 等离散落盘字段）一律以 saved 为准——否则「切换协议」这类即时
 * 落盘操作会被本地陈旧草稿回滚显示。providers 是 PROVIDER_IDS 静态闭集，两边键恒齐。
 */
function withDraftBaseUrls(
  saved: Record<ProviderId, ProviderSettings>,
  draft: Record<ProviderId, ProviderSettings>,
): Record<ProviderId, ProviderSettings> {
  const merged = {} as Record<ProviderId, ProviderSettings>
  for (const provider of PROVIDER_IDS) {
    const draftSettings = draft[provider]
    merged[provider] = draftSettings
      ? { ...saved[provider], baseUrl: draftSettings.baseUrl }
      : saved[provider]
  }
  return merged
}

/**
 * 池 / 槽位落盘（F1 终审修复）：mutate 基线用最近已持久化态（persisted，来自 getConfig()），
 * 不用本地 draft（configRef.current）——draft.providers 可能含用户正在编辑但没提交的半成品端点
 * （如删到剩 "https://ap"）。用 persisted 兜底后，「设为主力」「添加模型」这类池操作落盘的
 * providers 字段恒等于服务端已确认状态，不会把半成品端点带下去。
 *
 * toDisplay：落盘成功后只回护打字中的 baseUrl（用户正在编辑的输入框不被这次落盘结果回滚），
 * wire 等离散字段透出落盘结果——字段级保护，见 withDraftBaseUrls。
 */
export function applyConfigCommit(
  persisted: AppConfig,
  draft: AppConfig,
  mutate: (current: AppConfig) => AppConfig,
): { toPersist: AppConfig; toDisplay: (saved: AppConfig) => AppConfig } {
  return {
    toPersist: mutate(persisted),
    toDisplay: (saved) => ({ ...saved, providers: withDraftBaseUrls(saved.providers, draft.providers) }),
  }
}

/**
 * 「测试连接」落盘前的草稿合并（终审修复 F1②，PR #13 改字段级）：只把当前渠道的端点草稿
 * （baseUrl）并入 persisted，wire 等其余字段一律取 persisted——既避免用户在渠道 A 留下的
 * 半成品端点被渠道 B 的「测试连接」带下盘，也避免本地陈旧 wire 把磁盘上已落盘的正确值
 * 覆盖回去。persisted 须来自调用方紧邻这次落盘前的 getConfig()，不用本地旧缓存。
 */
export function mergeProviderDraft(
  persisted: AppConfig,
  draft: AppConfig,
  provider: ProviderId,
): AppConfig {
  return {
    ...persisted,
    providers: {
      ...persisted.providers,
      [provider]: { ...persisted.providers[provider], baseUrl: draft.providers[provider].baseUrl },
    },
  }
}

/**
 * 停用模型时"是否该提示主力已自动切换"的纯判定（渠道两级 UI v2 T4 复审 F1）：`onToggleModel` 在
 * 调用 `commitConfig`（异步、有落盘副作用）之前用它同步做一次快照判定，落盘成功（拿到非 null
 * 结果）后才据此决定要不要 toast——不能在 mutate 回调里提前发通知：mutate 同步跑在 saveConfig
 * 之前，落盘失败时会出现"先看到「已自动切换」提示、UI 实际没变"的时序错配。
 */
export function shouldWarnPrimaryModelDisabled(
  config: Pick<AppConfig, 'primaryModelKey'>,
  provider: ProviderId,
  modelId: string,
  enabled: boolean,
): boolean {
  return !enabled && config.primaryModelKey === modelEntryKey({ provider, modelId })
}
