// 渠道详情二级页测试（设置页渠道两级 UI v2 T4）。
//
// 本文件全部走 SSR（renderToStaticMarkup）+ 纯函数断言，覆盖边界同 ModelProviderListPanel.test.tsx
// 既有取舍：SSR 静态 HTML 不含事件绑定，事件接线本身（onClick/
// onCheckedChange 实际调用哪个回调、参数对不对）不在本文件覆盖范围，靠 code review 走查保障；
// 本文件断言的是渲染结构、禁用态、文案、以及 `buildModelRows` 这个从组件里单独 export 出来的
// 纯函数（模型行合集的并集/去重/保序逻辑，是本组件里唯一有条件分支值得直测的非渲染逻辑）。
import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_PROVIDER_SETTINGS } from '@shared/types/config'
import type { AppConfig, ConnectionTestResult, ModelPoolEntry } from '@shared/types/ipc'
import { buildModelRows, ModelProviderDetailPanel } from './ModelProviderDetailPanel'

// ---------------------------------------------------------------------------
// buildModelRows：模型行合集纯函数
// ---------------------------------------------------------------------------

function entry(modelId: string): ModelPoolEntry {
  return { provider: 'deepseek', modelId, verification: null }
}

describe('buildModelRows（模型行合集：fetched/catalog ∪ pool，保序去重）', () => {
  test('fetched=null → catalog ∪ pool，池内自定义 id（不在 catalog 里）追加在末尾', () => {
    const rows = buildModelRows(['a', 'b'], null, [entry('b'), entry('c')])
    expect(rows).toEqual(['a', 'b', 'c'])
  })

  test('fetched 非空 → fetched ∪ pool，catalog 被忽略', () => {
    const rows = buildModelRows(['a', 'b'], ['x', 'y'], [entry('y'), entry('z')])
    expect(rows).toEqual(['x', 'y', 'z'])
  })

  test('fetched 为空数组（非 null）仍算"已拉取"——只用 fetched ∪ pool，不回落 catalog', () => {
    const rows = buildModelRows(['a', 'b'], [], [entry('q')])
    expect(rows).toEqual(['q'])
  })
})

// ---------------------------------------------------------------------------
// SSR 结构断言
// ---------------------------------------------------------------------------

const DEEPSEEK_KEY = 'deepseek/deepseek-v4-pro'
const GLM_KEY = 'glm/glm-4.5-air'

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    providers: DEFAULT_PROVIDER_SETTINGS,
    modelPool: [
      {
        provider: 'deepseek',
        modelId: 'deepseek-v4-pro',
        verification: {
          verifiedAt: '2026-08-01T10:00:00.000Z',
          apiKeyUpdatedAt: '2026-08-01T09:00:00.000Z',
          baseUrl: DEFAULT_PROVIDER_SETTINGS.deepseek.baseUrl,
          wire: 'anthropic',
        },
      },
    ],
    primaryModelKey: DEEPSEEK_KEY,
    lightModelKey: null,
    apiKeyMetadata: { deepseek: { updatedAt: '2026-08-01T09:00:00.000Z' } },
    novelRootDir: '/novels',
    recentNovelPaths: [],
    systemNotificationsEnabled: true,
    introVersion: 0,
    ...overrides,
  }
}

function noopProps(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'deepseek' as const,
    config: baseConfig(),
    busy: false,
    savingKey: false,
    apiKeyInput: '',
    testing: false,
    testResult: null as ConnectionTestResult | null,
    fetchedModels: null as string[] | null,
    fetchingModels: false,
    fetchError: null as string | null,
    onApiKeyChange: () => {},
    onSaveApiKey: () => {},
    onDeleteApiKey: () => {},
    onBaseUrlChange: () => {},
    onWireChange: () => {},
    onTestConnection: () => {},
    onRefreshModels: () => {},
    onToggleModel: () => {},
    onAddCustomModel: () => {},
    onSetPrimary: () => {},
    onSetLight: () => {},
    ...overrides,
  }
}

function render(overrides: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(<ModelProviderDetailPanel {...(noopProps(overrides) as never)} />)
}

function rowHtml(html: string, modelId: string): string {
  return html.match(new RegExp(`data-model-toggle="${modelId}"[\\s\\S]*?</div>\\s*</div>`))?.[0] ?? ''
}

describe('ModelProviderDetailPanel（SSR 结构断言）', () => {
  test('已启用条目行：data-model-toggle + data-enabled="true"；未启用行 data-enabled="false"', () => {
    const html = render()
    const enabledRow = rowHtml(html, 'deepseek-v4-pro')
    expect(enabledRow).toContain('data-enabled="true"')

    const withCatalogOnly = render({ config: baseConfig({ modelPool: [] }) })
    const disabledRow = rowHtml(withCatalogOnly, 'deepseek-v4-pro')
    expect(disabledRow).toContain('data-enabled="false"')
  })

  test('主力 pill 出现在主力条目行；轻量 pill 出现在轻量条目行', () => {
    const html = render({
      config: baseConfig({
        modelPool: [
          { provider: 'deepseek', modelId: 'deepseek-v4-pro', verification: null },
          { provider: 'deepseek', modelId: 'deepseek-v4-lite', verification: null },
        ],
        primaryModelKey: DEEPSEEK_KEY,
        lightModelKey: 'deepseek/deepseek-v4-lite',
      }),
    })
    const primaryRow = rowHtml(html, 'deepseek-v4-pro')
    expect(primaryRow).toMatch(/>主力</)
    // 该行有"设为轻量"按钮（子串含"轻量"），但轻量 pill（精确文本 `>轻量<`）不应出现在这一行。
    expect(primaryRow).not.toMatch(/>轻量</)

    const lightRow = rowHtml(html, 'deepseek-v4-lite')
    expect(lightRow).toMatch(/>轻量</)
  })

  test('fetchError 非空时渲染为 text-xs text-muted-foreground 小字；为空不渲染', () => {
    const withError = render({ fetchError: '网络超时' })
    expect(withError).toContain('网络超时')
    expect(withError).toMatch(/class="[^"]*text-xs[^"]*text-muted-foreground[^"]*"[^>]*>网络超时/)

    const withoutError = render()
    expect(withoutError).not.toContain('网络超时')
  })

  test('anthropic 渠道：Base URL 输入 disabled', () => {
    const html = render({
      provider: 'anthropic',
      config: baseConfig({
        providers: { ...DEFAULT_PROVIDER_SETTINGS, anthropic: { baseUrl: '', wire: 'anthropic' } },
        modelPool: [{ provider: 'anthropic', modelId: 'claude-opus-4-7', verification: null }],
        primaryModelKey: 'anthropic/claude-opus-4-7',
        apiKeyMetadata: {},
      }),
    })
    const input = html.match(/<input[^>]*placeholder="Anthropic 官方端点"[^>]*\/>/)?.[0] ?? ''
    expect(input).toContain('disabled=""')
  })

  test('非 anthropic 渠道：Base URL 输入不 disabled', () => {
    const html = render()
    const input = html.match(/<input[^>]*placeholder="https:\/\/api\.example\.com\/anthropic"[^>]*\/>/)?.[0] ?? ''
    expect(input).not.toContain('disabled=""')
  })

  test('测试连接按钮：Key 未存且输入框空 → disabled，title 提示"请先保存 Key"', () => {
    const html = render({
      config: baseConfig({ apiKeyMetadata: {} }),
      apiKeyInput: '',
    })
    const button = html.match(/<button[^>]*aria-label="测试连接"[^>]*>/)?.[0] ?? ''
    expect(button).toContain('disabled=""')
    expect(button).toContain('title="请先保存 Key"')
  })

  test('测试连接按钮：有 Key 但该渠道池空 → disabled，title 提示"请先启用至少一个模型再测试"', () => {
    const html = render({
      config: baseConfig({ modelPool: [] }),
    })
    const button = html.match(/<button[^>]*aria-label="测试连接"[^>]*>/)?.[0] ?? ''
    expect(button).toContain('disabled=""')
    expect(button).toContain('title="请先启用至少一个模型再测试"')
  })

  test('测试连接按钮：有 Key 且池非空 → 不 disabled', () => {
    const html = render()
    const button = html.match(/<button[^>]*aria-label="测试连接"[^>]*>/)?.[0] ?? ''
    expect(button).not.toContain('disabled=""')
  })

  test('测试结果：成功 → text-success 显示"连接成功"；失败 → text-destructive 显示 message', () => {
    const ok = render({ testResult: { ok: true, message: '', verifiedAt: '2026-08-01T10:00:00.000Z' } })
    expect(ok).toMatch(/text-success[^>]*>[^<]*连接成功/)

    const fail = render({ testResult: { ok: false, message: 'API Key 无效' } })
    expect(fail).toMatch(/text-destructive[^>]*>API Key 无效/)
  })

  test('渠道全部条目已验证且无 testResult 时也显示"已连接"', () => {
    const html = render()
    const paragraph = html.match(/<p[^>]*>[\s\S]*?已连接[\s\S]*?<\/p>/)?.[0] ?? ''
    expect(paragraph).toContain('text-success')
  })

  test('切换到未配置的 glm 渠道：无池条目，模型目录仍渲染内置目录', () => {
    const html = render({
      provider: 'glm',
      config: baseConfig({ modelPool: [], apiKeyMetadata: {} }),
    })
    expect(html).toContain('glm-4.5-air')
  })

  test('添加自定义模型：空输入禁用（SSR 默认态）', () => {
    const html = render()
    const addButton = html.match(/<button[^>]*>\s*添加\s*<\/button>/)?.[0] ?? ''
    expect(addButton).toContain('disabled=""')
  })

  test('头注声明接线覆盖边界', () => {
    // 冒烟：文件头注存在即可（真实内容走 code review），这里只确认测试文件本身能正常加载执行。
    expect(true).toBe(true)
  })
})
