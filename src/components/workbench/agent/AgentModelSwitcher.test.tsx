// SSR 只覆盖触发器 chip 本身：DropdownMenuContent 是 Radix Portal，只在 open 时渲染，
// renderToStaticMarkup 摸不到菜单内容（不摸 window.electron 的 getConfig effect 也不会跑，
// chip 恒是挂载前默认态）；分组逻辑走 groupPoolByProvider 纯函数直测，菜单交互留真机走查。
import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { AgentModelSwitcher, groupPoolByProvider, isStaleConfigResponse } from './AgentModelSwitcher'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DEFAULT_PROVIDER_SETTINGS, type ModelPoolEntry } from '@shared/types/config'
import type { ModelSlotView } from '@shared/lib/model-slots'

function makeView(overrides: Partial<ModelSlotView> = {}): ModelSlotView {
  return {
    providers: DEFAULT_PROVIDER_SETTINGS,
    modelPool: [],
    primaryModelKey: null,
    lightModelKey: null,
    apiKeyMetadata: {},
    ...overrides,
  }
}

function verifiedEntry(overrides: Partial<ModelPoolEntry> = {}): ModelPoolEntry {
  return {
    provider: 'deepseek',
    modelId: 'deepseek-v4-pro',
    verification: {
      verifiedAt: '2026-08-02T00:00:00.000Z',
      apiKeyUpdatedAt: '2026-08-01T00:00:00.000Z',
      baseUrl: 'https://api.deepseek.com/anthropic',
      wire: 'anthropic',
    },
    ...overrides,
  }
}

function renderSwitcher(disabled?: boolean): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <MemoryRouter>
        <AgentModelSwitcher disabled={disabled} />
      </MemoryRouter>
    </TooltipProvider>,
  )
}

describe('groupPoolByProvider', () => {
  test('多渠道分组按 MODEL_PROVIDERS 顺序，不按池内出现顺序', () => {
    // 池内 glm 排在 deepseek 前，分组结果仍要按 MODEL_PROVIDERS 声明顺序（deepseek → glm → …）。
    const view = makeView({
      modelPool: [
        verifiedEntry({ provider: 'glm', modelId: 'glm-4.5-air', verification: null }),
        verifiedEntry({ provider: 'deepseek', modelId: 'deepseek-v4-pro' }),
      ],
      apiKeyMetadata: { deepseek: { updatedAt: '2026-08-01T00:00:00.000Z' } },
    })

    const groups = groupPoolByProvider(view)

    expect(groups.map((group) => group.provider)).toEqual(['deepseek', 'glm'])
    expect(groups[0]?.label).toBe('DeepSeek')
    expect(groups[1]?.label).toBe('智谱 GLM')
  })

  test('空渠道不出现在结果中', () => {
    const view = makeView({
      modelPool: [verifiedEntry({ provider: 'deepseek' })],
      apiKeyMetadata: { deepseek: { updatedAt: '2026-08-01T00:00:00.000Z' } },
    })

    const groups = groupPoolByProvider(view)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.provider).toBe('deepseek')
  })

  test('verified 标记正确：已验证 true，未验证（无 Key 代际）false', () => {
    const view = makeView({
      modelPool: [
        verifiedEntry({ provider: 'deepseek', modelId: 'deepseek-v4-pro' }),
        verifiedEntry({ provider: 'deepseek', modelId: 'deepseek-lite', verification: null }),
      ],
      apiKeyMetadata: { deepseek: { updatedAt: '2026-08-01T00:00:00.000Z' } },
    })

    const [group] = groupPoolByProvider(view)

    expect(group?.entries).toEqual([
      { key: 'deepseek/deepseek-v4-pro', modelId: 'deepseek-v4-pro', verified: true },
      { key: 'deepseek/deepseek-lite', modelId: 'deepseek-lite', verified: false },
    ])
  })

  test('池空 → 空数组', () => {
    expect(groupPoolByProvider(makeView())).toEqual([])
  })
})

describe('isStaleConfigResponse（F1 竞态守卫）', () => {
  test('代际未变（回包时没有更新请求介入）→ 不陈旧，可应用', () => {
    expect(isStaleConfigResponse(1, 1)).toBe(false)
  })

  test('代际已推进（回包落地前有更新请求介入）→ 陈旧，应丢弃', () => {
    expect(isStaleConfigResponse(2, 1)).toBe(true)
  })

  test('还原 F1 竞态时序：打开菜单发起 refresh 后，用户抢先点选切换完成，姗姗来迟的 refresh 回包判陈旧', () => {
    let epoch = 0
    // 打开菜单 → refresh 发起，占代际 1，回包尚未落地
    const refreshRequestEpoch = ++epoch
    // refresh 结果落地前，用户点选模型；setPrimaryModel 成功后写入前推进代际到 2，宣告在途 refresh 作废
    ++epoch
    // refresh 的回包这时才姗姗来迟——用当前代际（2）与它发起时的代际（1）比对
    expect(isStaleConfigResponse(epoch, refreshRequestEpoch)).toBe(true)
    // onSelect 自己落地时用的正是当前代际，不受影响
    expect(isStaleConfigResponse(epoch, epoch)).toBe(false)
  })
})

describe('AgentModelSwitcher · SSR', () => {
  test('挂载前默认态：chip 带触发器钩子，显示「未配置模型」', () => {
    const html = renderSwitcher()

    expect(html).toContain('data-agent-model-switcher-trigger="true"')
    expect(html).toContain('未配置模型')
  })

  test('disabled=true 时按钮 disabled', () => {
    const html = renderSwitcher(true)

    expect(html).toContain('data-agent-model-switcher-trigger="true"')
    expect(html).toContain('disabled=""')
  })

  test('disabled 未传时按钮不带 disabled', () => {
    const html = renderSwitcher()

    expect(html).not.toContain('disabled=""')
  })
})
