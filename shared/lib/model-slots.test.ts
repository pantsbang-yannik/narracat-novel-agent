import { describe, expect, test } from 'bun:test'
import {
  buildPoolEntry,
  canSetPrimaryModel,
  findPoolEntry,
  isEntryVerified,
  modelEntryKey,
  parseModelKey,
  resolveLightModel,
  resolvePrimaryModel,
  type ModelSlotView,
} from './model-slots'
import { DEFAULT_PROVIDER_SETTINGS } from '@shared/types/config'

function makeView(overrides: Partial<ModelSlotView> = {}): ModelSlotView {
  return {
    providers: DEFAULT_PROVIDER_SETTINGS,
    modelPool: [
      {
        provider: 'deepseek',
        modelId: 'deepseek-v4-pro',
        verification: {
          verifiedAt: '2026-08-02T00:00:00.000Z',
          apiKeyUpdatedAt: '2026-08-01T00:00:00.000Z',
          baseUrl: 'https://api.deepseek.com/anthropic',
          wire: 'anthropic',
        },
      },
      { provider: 'glm', modelId: 'glm-4.5-air', verification: null },
    ],
    primaryModelKey: 'deepseek/deepseek-v4-pro',
    lightModelKey: null,
    apiKeyMetadata: { deepseek: { updatedAt: '2026-08-01T00:00:00.000Z' } },
    ...overrides,
  }
}

describe('model key', () => {
  test('modelEntryKey 与 parseModelKey 互逆，modelId 含斜杠按第一个 / 切分', () => {
    expect(modelEntryKey({ provider: 'glm', modelId: 'a/b' })).toBe('glm/a/b')
    expect(parseModelKey('glm/a/b')).toEqual({ provider: 'glm', modelId: 'a/b' })
  })

  test('parseModelKey 拒绝未知 provider 与空 modelId', () => {
    expect(parseModelKey('nope/model')).toBeNull()
    expect(parseModelKey('glm/')).toBeNull()
    expect(parseModelKey('glm')).toBeNull()
  })
})

describe('isEntryVerified', () => {
  test('快照与当前 Key 代际、端点一致 → true', () => {
    const view = makeView()
    expect(isEntryVerified(view, view.modelPool[0]!)).toBe(true)
  })

  test('Key 代际不一致 → false', () => {
    const view = makeView({ apiKeyMetadata: { deepseek: { updatedAt: '2026-08-02T09:00:00.000Z' } } })
    expect(isEntryVerified(view, view.modelPool[0]!)).toBe(false)
  })

  test('provider 端点变化 → false', () => {
    const view = makeView({
      providers: { ...DEFAULT_PROVIDER_SETTINGS, deepseek: { baseUrl: 'https://proxy.example.com', wire: 'anthropic' } },
    })
    expect(isEntryVerified(view, view.modelPool[0]!)).toBe(false)
  })

  test('provider wire 变化（anthropic → openai）→ false（切协议自动失效）', () => {
    const view = makeView({
      providers: { ...DEFAULT_PROVIDER_SETTINGS, deepseek: { baseUrl: 'https://proxy.example.com', wire: 'openai' } },
    })
    expect(isEntryVerified(view, view.modelPool[0]!)).toBe(false)
  })

  test('快照 wire 与当前一致（openai ↔ openai）→ true', () => {
    const view = makeView({
      providers: { ...DEFAULT_PROVIDER_SETTINGS, custom: { baseUrl: 'https://gw.example.com/v1', wire: 'openai' } },
      modelPool: [
        {
          provider: 'custom',
          modelId: 'some-model',
          verification: {
            verifiedAt: '2026-08-02T00:00:00.000Z',
            apiKeyUpdatedAt: '2026-08-01T00:00:00.000Z',
            baseUrl: 'https://gw.example.com/v1',
            wire: 'openai',
          },
        },
      ],
      primaryModelKey: 'custom/some-model',
      apiKeyMetadata: { custom: { updatedAt: '2026-08-01T00:00:00.000Z' } },
    })
    expect(isEntryVerified(view, view.modelPool[0]!)).toBe(true)
  })
})

describe('resolvePrimaryModel', () => {
  test('解析主力槽：key/provider/baseUrl/wire/modelId/verified 齐全', () => {
    expect(resolvePrimaryModel(makeView())).toEqual({
      key: 'deepseek/deepseek-v4-pro',
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/anthropic',
      wire: 'anthropic',
      modelId: 'deepseek-v4-pro',
      verified: true,
    })
  })

  test('primaryModelKey 失配时回落池首条', () => {
    const view = makeView({ primaryModelKey: 'glm/不存在' })
    expect(resolvePrimaryModel(view)?.modelId).toBe('deepseek-v4-pro')
  })

  test('池空 → null', () => {
    expect(resolvePrimaryModel(makeView({ modelPool: [], primaryModelKey: null }))).toBeNull()
  })
})

describe('resolveLightModel', () => {
  test('lightModelKey 为 null → 跟随主力', () => {
    expect(resolveLightModel(makeView())?.key).toBe('deepseek/deepseek-v4-pro')
  })

  test('轻量条目未验证 → fail-soft 回落主力', () => {
    const view = makeView({ lightModelKey: 'glm/glm-4.5-air' })
    expect(resolveLightModel(view)?.key).toBe('deepseek/deepseek-v4-pro')
  })

  test('轻量条目已验证 → 用轻量（跨 provider 也成立）', () => {
    const view = makeView({
      lightModelKey: 'glm/glm-4.5-air',
      apiKeyMetadata: {
        deepseek: { updatedAt: '2026-08-01T00:00:00.000Z' },
        glm: { updatedAt: '2026-08-01T00:00:00.000Z' },
      },
    })
    view.modelPool[1] = {
      provider: 'glm',
      modelId: 'glm-4.5-air',
      verification: {
        verifiedAt: '2026-08-02T00:00:00.000Z',
        apiKeyUpdatedAt: '2026-08-01T00:00:00.000Z',
        baseUrl: 'https://open.bigmodel.cn/api/anthropic',
        wire: 'anthropic',
      },
    }
    expect(resolveLightModel(view)?.key).toBe('glm/glm-4.5-air')
  })
})

describe('canSetPrimaryModel', () => {
  test('已验证条目 → true', () => {
    const view = makeView()
    expect(canSetPrimaryModel(view, 'deepseek/deepseek-v4-pro')).toBe(true)
  })

  test('未验证条目 → false', () => {
    const view = makeView()
    expect(canSetPrimaryModel(view, 'glm/glm-4.5-air')).toBe(false)
  })

  test('key 不在池中 → false', () => {
    const view = makeView()
    expect(canSetPrimaryModel(view, 'glm/不存在')).toBe(false)
  })
})

describe('buildPoolEntry', () => {
  test('同渠道存在有效验证 → 新条目继承快照', () => {
    const snapshot = {
      verifiedAt: '2026-08-02T00:00:00.000Z',
      apiKeyUpdatedAt: '2026-08-01T00:00:00.000Z',
      baseUrl: 'https://open.bigmodel.cn/api/anthropic',
      wire: 'anthropic' as const,
    }
    const view = makeView({
      modelPool: [{ provider: 'glm', modelId: 'glm-4.5-air', verification: snapshot }],
      apiKeyMetadata: { glm: { updatedAt: '2026-08-01T00:00:00.000Z' } },
    })

    const entry = buildPoolEntry(view, 'glm', 'glm-5.2[1m]')

    expect(entry.provider).toBe('glm')
    expect(entry.modelId).toBe('glm-5.2[1m]')
    expect(entry.verification).not.toBeNull()
    expect(entry.verification?.verifiedAt).toBe(snapshot.verifiedAt)
    expect(entry.verification?.apiKeyUpdatedAt).toBe(snapshot.apiKeyUpdatedAt)
    expect(entry.verification?.baseUrl).toBe(snapshot.baseUrl)
    // 继承的是拷贝，非同一引用。
    expect(entry.verification).not.toBe(snapshot)
  })

  test('同渠道验证已失效（Key 代际不符）→ 新条目 verification 为 null', () => {
    const view = makeView({
      modelPool: [
        {
          provider: 'glm',
          modelId: 'glm-4.5-air',
          verification: {
            verifiedAt: '2026-08-02T00:00:00.000Z',
            apiKeyUpdatedAt: '2026-07-01T00:00:00.000Z', // 陈旧代际
            baseUrl: 'https://open.bigmodel.cn/api/anthropic',
            wire: 'anthropic',
          },
        },
      ],
      apiKeyMetadata: { glm: { updatedAt: '2026-08-01T00:00:00.000Z' } },
    })

    const entry = buildPoolEntry(view, 'glm', 'glm-5.2[1m]')

    expect(entry).toEqual({ provider: 'glm', modelId: 'glm-5.2[1m]', verification: null })
  })

  test('无同渠道条目 → null', () => {
    const view = makeView()

    const entry = buildPoolEntry(view, 'minimax', 'MiniMax-M2.5')

    expect(entry).toEqual({ provider: 'minimax', modelId: 'MiniMax-M2.5', verification: null })
  })
})
