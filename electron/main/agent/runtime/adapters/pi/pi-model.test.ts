/**
 * Provider 装配测试（模型池化切片①）：AppConfig → Pi Model 描述的映射规则，主力/轻量槽驱动
 * （shared/lib/model-slots）。[1m] 上下文按实际选中模型 id 判，不再是「三档任一带即全局 1M」。
 */
import { describe, expect, test } from 'bun:test'
import type { AppConfig, ModelPoolEntry } from '@shared/types/config'
import { DEFAULT_PROVIDER_SETTINGS, POOL_DEFAULT_FIELDS } from '@shared/types/config'
import { TARGET_MAX_OUTPUT_TOKENS, createPiModel, effectivePiMaxTokens, resolvePiModelAlias } from './pi-model.ts'

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...POOL_DEFAULT_FIELDS,
    apiKeyMetadata: {},
    novelRootDir: '/tmp/novels',
    recentNovelPaths: [],
    systemNotificationsEnabled: true,
    introVersion: 0,
    ...overrides,
  }
}

/** 已验证条目：verification 快照须与 apiKeyMetadata/providers[].baseUrl/wire 匹配才算 verified。 */
function verifiedEntry(provider: ModelPoolEntry['provider'], modelId: string): ModelPoolEntry {
  return {
    provider,
    modelId,
    verification: {
      verifiedAt: '2026-08-02T00:00:00.000Z',
      apiKeyUpdatedAt: '2026-08-01T00:00:00.000Z',
      baseUrl: DEFAULT_PROVIDER_SETTINGS[provider].baseUrl,
      wire: DEFAULT_PROVIDER_SETTINGS[provider].wire,
    },
  }
}

describe('createPiModel', () => {
  test('deepseek 默认配置 → anthropic-messages 自定义端点模型', () => {
    const model = createPiModel(makeConfig())
    expect(model.id).toBe('deepseek-v4-pro')
    expect(model.provider).toBe('deepseek')
    expect(model.api).toBe('anthropic-messages')
    expect(model.baseUrl).toBe('https://api.deepseek.com/anthropic')
    expect(model.contextWindow).toBe(200_000)
    // 断言**实发值**而不是 Model 上的存值：上游 pi-ai 会先除以 3（issue #35），
    // 原来这里只盯存值 32000，于是「意图 32000、实发 10666」悄悄跑了很久都没人发现。
    expect(effectivePiMaxTokens(model.maxTokens)).toBe(TARGET_MAX_OUTPUT_TOKENS)
    expect(TARGET_MAX_OUTPUT_TOKENS).toBe(32_000)
  })

  test('实发 max_tokens 补偿上游除以 3（issue #35 的唯一护栏）', () => {
    const model = createPiModel(makeConfig())
    // 复刻 pi-ai@0.73.1 dist/providers/anthropic.js:663 的算式：
    //   max_tokens: options?.maxTokens || (model.maxTokens / 3) | 0
    // sdk.js 与 agent-loop.js 都不透传 options.maxTokens，所以恒走右边这支。
    const actuallySent = (model.maxTokens / 3) | 0
    expect(actuallySent).toBe(TARGET_MAX_OUTPUT_TOKENS)
    // 上游哪天不再除 3，这条会红——那就是该按 pi-model.ts 的拆除说明书改回去的信号。
    expect(effectivePiMaxTokens(model.maxTokens)).toBe(actuallySent)
  })

  test('createPiModel 从主力槽解析 id/provider/baseUrl', () => {
    const config = makeConfig({
      modelPool: [{ provider: 'glm', modelId: 'glm-5.2', verification: null }],
      primaryModelKey: 'glm/glm-5.2',
      providers: { ...DEFAULT_PROVIDER_SETTINGS },
    })
    const model = createPiModel(config)
    expect(model.id).toBe('glm-5.2')
    expect(model.provider).toBe('glm')
    expect(model.baseUrl).toBe('https://open.bigmodel.cn/api/anthropic')
  })

  test('explicitId 覆盖模型 id（子 agent 别名映射用），空串回落主力槽', () => {
    expect(createPiModel(makeConfig(), 'model-x').id).toBe('model-x')
    expect(createPiModel(makeConfig(), '').id).toBe('deepseek-v4-pro')
  })

  test('[1m] 判定按实际选中模型：主力不带 [1m] 就是 200k，即使池里有 [1m] 条目', () => {
    const config = makeConfig({
      modelPool: [
        { provider: 'glm', modelId: 'glm-5.2', verification: null },
        { provider: 'glm', modelId: 'glm-5.2[1m]', verification: null },
      ],
      primaryModelKey: 'glm/glm-5.2',
    })
    expect(createPiModel(config).contextWindow).toBe(200_000)
    expect(createPiModel(config, 'glm-5.2[1m]').contextWindow).toBe(1_000_000)
  })

  test('baseUrl 为空（anthropic 官方）→ 回落官方端点', () => {
    const config = makeConfig({
      modelPool: [{ provider: 'anthropic', modelId: 'claude-opus-4-7', verification: null }],
      primaryModelKey: 'anthropic/claude-opus-4-7',
    })
    expect(createPiModel(config).baseUrl).toBe('https://api.anthropic.com')
  })

  test('模型池为空（主力槽无法解析）→ 抛明确错误', () => {
    expect(() => createPiModel(makeConfig({ modelPool: [], primaryModelKey: null }))).toThrow('未配置')
  })

  test('custom 渠道 openai wire → api 推导为 openai-completions', () => {
    const config = makeConfig({
      providers: { ...DEFAULT_PROVIDER_SETTINGS, custom: { baseUrl: 'https://gw.example.com/v1', wire: 'openai' } },
      modelPool: [{ provider: 'custom', modelId: 'some-model', verification: null }],
      primaryModelKey: 'custom/some-model',
    })
    const model = createPiModel(config)
    expect(model.api).toBe('openai-completions')
    expect(model.baseUrl).toBe('https://gw.example.com/v1')
  })

  test('openai wire 缺 baseUrl → 提前抛可操作错误（不打到 anthropic 官方端点得 404）', () => {
    const config = makeConfig({
      providers: { ...DEFAULT_PROVIDER_SETTINGS, custom: { baseUrl: '', wire: 'openai' } },
      modelPool: [{ provider: 'custom', modelId: 'some-model', verification: null }],
      primaryModelKey: 'custom/some-model',
    })
    expect(() => createPiModel(config)).toThrow('OpenAI 协议渠道需要先在设置中填写接口地址')
  })

  test('custom 渠道默认仍为 anthropic wire（anthropic-messages）', () => {
    const config = makeConfig({
      providers: { ...DEFAULT_PROVIDER_SETTINGS },
      modelPool: [{ provider: 'custom', modelId: 'some-model', verification: null }],
      primaryModelKey: 'custom/some-model',
    })
    expect(createPiModel(config).api).toBe('anthropic-messages')
  })
})

describe('resolvePiModelAlias', () => {
  test('opus/sonnet 一律继承 run 模型（undefined）', () => {
    const config = makeConfig()
    expect(resolvePiModelAlias(config, 'opus')).toBeUndefined()
    expect(resolvePiModelAlias(config, 'sonnet')).toBeUndefined()
  })

  test('非法/缺省别名一律 undefined，不做透传旁路', () => {
    const config = makeConfig()
    expect(resolvePiModelAlias(config, 'inherit')).toBeUndefined()
    expect(resolvePiModelAlias(config, 'deepseek-v4-pro')).toBeUndefined()
    expect(resolvePiModelAlias(config, undefined)).toBeUndefined()
  })

  test('haiku：同 provider 已验证轻量槽 → 返回轻量 modelId', () => {
    const config = makeConfig({
      modelPool: [
        { provider: 'deepseek', modelId: 'deepseek-v4-pro', verification: null },
        verifiedEntry('deepseek', 'deepseek-lite'),
      ],
      primaryModelKey: 'deepseek/deepseek-v4-pro',
      lightModelKey: 'deepseek/deepseek-lite',
      apiKeyMetadata: { deepseek: { updatedAt: '2026-08-01T00:00:00.000Z' } },
    })
    expect(resolvePiModelAlias(config, 'haiku')).toBe('deepseek-lite')
  })

  test('haiku：跨 provider 已验证轻量槽 → undefined（子会话共用 run 的 provider/apiKey，跨家不可用）', () => {
    const config = makeConfig({
      modelPool: [
        { provider: 'deepseek', modelId: 'deepseek-v4-pro', verification: null },
        verifiedEntry('glm', 'glm-4.5-air'),
      ],
      primaryModelKey: 'deepseek/deepseek-v4-pro',
      lightModelKey: 'glm/glm-4.5-air',
      apiKeyMetadata: {
        deepseek: { updatedAt: '2026-08-01T00:00:00.000Z' },
        glm: { updatedAt: '2026-08-01T00:00:00.000Z' },
      },
    })
    expect(resolvePiModelAlias(config, 'haiku')).toBeUndefined()
  })

  test('haiku：轻量槽未验证 → undefined（resolveLightModel 已回落主力，与主力同值时收敛为 undefined）', () => {
    const config = makeConfig({
      modelPool: [
        { provider: 'deepseek', modelId: 'deepseek-v4-pro', verification: null },
        { provider: 'deepseek', modelId: 'deepseek-lite', verification: null },
      ],
      primaryModelKey: 'deepseek/deepseek-v4-pro',
      lightModelKey: 'deepseek/deepseek-lite',
      apiKeyMetadata: { deepseek: { updatedAt: '2026-08-01T00:00:00.000Z' } },
    })
    expect(resolvePiModelAlias(config, 'haiku')).toBeUndefined()
  })
})
