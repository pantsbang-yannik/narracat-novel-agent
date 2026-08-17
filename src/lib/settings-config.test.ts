import { describe, expect, test } from 'bun:test'
import { applyConfigCommit, mergeProviderDraft, shouldWarnPrimaryModelDisabled } from './settings-config'
import { DEFAULT_MODEL_POOL, DEFAULT_PRIMARY_MODEL_KEY, DEFAULT_PROVIDER_SETTINGS } from '@shared/types/config'
import type { AppConfig } from '@shared/types/ipc'

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    providers: DEFAULT_PROVIDER_SETTINGS,
    modelPool: DEFAULT_MODEL_POOL,
    primaryModelKey: DEFAULT_PRIMARY_MODEL_KEY,
    lightModelKey: null,
    apiKeyMetadata: {},
    novelRootDir: '/novels',
    recentNovelPaths: [],
    systemNotificationsEnabled: true,
    introVersion: 0,
    ...overrides,
  }
}

describe('applyConfigCommit（F1：commitConfig 端点草稿隔离）', () => {
  test('toPersist 基于 persisted，半成品端点草稿不随池操作落盘', () => {
    const persisted = baseConfig()
    // 用户把 deepseek 端点删到剩半成品，尚未点“测试”提交——只活在本地 draft。
    const draft = baseConfig({
      providers: { ...DEFAULT_PROVIDER_SETTINGS, deepseek: { baseUrl: 'https://ap' } },
    })
    const mutate = (current: AppConfig): AppConfig => ({
      ...current,
      modelPool: [...current.modelPool, { provider: 'glm', modelId: 'glm-5.2', verification: null }],
    })

    const { toPersist } = applyConfigCommit(persisted, draft, mutate)

    // 落盘对象的 providers 必须原样来自 persisted，半成品草稿 'https://ap' 绝不出现。
    expect(toPersist.providers.deepseek.baseUrl).toBe(DEFAULT_PROVIDER_SETTINGS.deepseek.baseUrl)
    expect(toPersist.providers.deepseek.baseUrl).not.toBe('https://ap')
    // mutate 本身仍生效（池操作没被这次修复破坏）。
    expect(toPersist.modelPool).toHaveLength(2)
  })

  test('toDisplay 回护打字中的端点草稿，避免正在编辑的输入被回滚', () => {
    const persisted = baseConfig()
    const draft = baseConfig({
      providers: { ...DEFAULT_PROVIDER_SETTINGS, deepseek: { baseUrl: 'https://ap', wire: 'anthropic' } },
    })
    const mutate = (current: AppConfig): AppConfig => ({ ...current, primaryModelKey: DEFAULT_PRIMARY_MODEL_KEY })

    const { toPersist, toDisplay } = applyConfigCommit(persisted, draft, mutate)
    // 假设服务端落盘后原样回传（未做二次归一化改动）。
    const saved = toPersist
    const display = toDisplay(saved)

    expect(display.providers.deepseek.baseUrl).toBe('https://ap')
    expect(display.primaryModelKey).toBe(saved.primaryModelKey)
  })

  test('toDisplay 只回护 baseUrl：落盘后的 wire 透出，不被陈旧草稿回滚（PR #13 review 阻断项第一步）', () => {
    const persisted = baseConfig({
      providers: { ...DEFAULT_PROVIDER_SETTINGS, custom: { baseUrl: '', wire: 'anthropic' } },
    })
    // 草稿里 custom 的 wire 停在切换前的旧值（onModelWireChange 只落盘、不逐键同步草稿）。
    const draft = baseConfig({
      providers: { ...DEFAULT_PROVIDER_SETTINGS, custom: { baseUrl: 'https://gw.example.com/v1', wire: 'anthropic' } },
    })
    const mutate = (current: AppConfig): AppConfig => ({
      ...current,
      providers: { ...current.providers, custom: { ...current.providers.custom, wire: 'openai' } },
    })

    const { toPersist, toDisplay } = applyConfigCommit(persisted, draft, mutate)
    const display = toDisplay(toPersist)

    // 磁盘（toPersist）拿到 openai……
    expect(toPersist.providers.custom.wire).toBe('openai')
    // ……显示层也必须是 openai——陈旧草稿只允许回护 baseUrl，不许回滚 wire。
    expect(display.providers.custom.wire).toBe('openai')
    // 打字中的端点草稿仍受保护。
    expect(display.providers.custom.baseUrl).toBe('https://gw.example.com/v1')
  })

  test('mutate 不读 draft——即便 draft 池与 persisted 不同，toPersist 只继承 persisted 的池', () => {
    const persisted = baseConfig()
    const draft = baseConfig({
      modelPool: [{ provider: 'anthropic', modelId: 'claude-opus-4-7', verification: null }],
    })
    const mutate = (current: AppConfig): AppConfig => current

    const { toPersist } = applyConfigCommit(persisted, draft, mutate)

    expect(toPersist.modelPool).toEqual(persisted.modelPool)
  })
})

describe('mergeProviderDraft（终审修复 F1②：onTestConnection 落盘前只合并当前渠道草稿）', () => {
  test('A 渠道的半成品端点草稿不会被 B 渠道的「测试连接」带下盘', () => {
    const persisted = baseConfig()
    // 用户在 deepseek（A）留了半成品端点后切到 glm（B），本地 draft 仍带着 A 的半成品。
    const draft = baseConfig({
      providers: { ...DEFAULT_PROVIDER_SETTINGS, deepseek: { baseUrl: 'https://ap', wire: 'anthropic' } },
    })

    const toSave = mergeProviderDraft(persisted, draft, 'glm')

    // B 渠道（glm）的端点草稿被合并进去；wire 等其余字段取 persisted（字段级合并）。
    expect(toSave.providers.glm.baseUrl).toBe(draft.providers.glm.baseUrl)
    expect(toSave.providers.glm.wire).toBe(persisted.providers.glm.wire)
    // A 渠道（deepseek）的半成品草稿绝不出现，落盘对象里仍是 persisted 的值。
    expect(toSave.providers.deepseek.baseUrl).toBe(DEFAULT_PROVIDER_SETTINGS.deepseek.baseUrl)
    expect(toSave.providers.deepseek.baseUrl).not.toBe('https://ap')
  })

  test('当前渠道自身的端点草稿会被正确合并进落盘对象', () => {
    const persisted = baseConfig()
    const draft = baseConfig({
      providers: { ...DEFAULT_PROVIDER_SETTINGS, glm: { baseUrl: 'https://custom.glm.example', wire: 'anthropic' } },
    })

    const toSave = mergeProviderDraft(persisted, draft, 'glm')

    expect(toSave.providers.glm.baseUrl).toBe('https://custom.glm.example')
    expect(toSave.providers.glm.wire).toBe(persisted.providers.glm.wire)
  })

  test('只取草稿 baseUrl：磁盘上已落盘的 wire 不被陈旧草稿覆盖（PR #13 review 阻断项第二步）', () => {
    // 切换协议落盘成功后磁盘是 openai，但 UI 草稿里 wire 还停在旧值 anthropic。
    const persisted = baseConfig({
      providers: { ...DEFAULT_PROVIDER_SETTINGS, custom: { baseUrl: 'https://gw.example.com/v1', wire: 'openai' } },
    })
    const draft = baseConfig({
      providers: { ...DEFAULT_PROVIDER_SETTINGS, custom: { baseUrl: 'https://gw.example.com/v1', wire: 'anthropic' } },
    })

    const toSave = mergeProviderDraft(persisted, draft, 'custom')

    // 端点草稿（baseUrl）照常带入……
    expect(toSave.providers.custom.baseUrl).toBe('https://gw.example.com/v1')
    // ……但 wire 只认磁盘：陈旧的 anthropic 不许把 openai 覆盖回去。
    expect(toSave.providers.custom.wire).toBe('openai')
  })

  test('其余字段（modelPool 等）原样继承 persisted，不受 draft 影响', () => {
    const persisted = baseConfig()
    const draft = baseConfig({
      modelPool: [{ provider: 'anthropic', modelId: 'claude-opus-4-7', verification: null }],
    })

    const toSave = mergeProviderDraft(persisted, draft, 'deepseek')

    expect(toSave.modelPool).toEqual(persisted.modelPool)
  })
})

describe('shouldWarnPrimaryModelDisabled（T4 复审 F1：停用主力时"是否该 toast"的纯判定）', () => {
  test('停用（enabled=false）且目标条目正是当前主力 → true', () => {
    const config = baseConfig({ primaryModelKey: 'deepseek/deepseek-v4-pro' })
    expect(shouldWarnPrimaryModelDisabled(config, 'deepseek', 'deepseek-v4-pro', false)).toBe(true)
  })

  test('停用但目标条目不是当前主力 → false（不误报）', () => {
    const config = baseConfig({ primaryModelKey: 'deepseek/deepseek-v4-pro' })
    expect(shouldWarnPrimaryModelDisabled(config, 'glm', 'glm-4.5-air', false)).toBe(false)
  })

  test('enabled=true（启用/添加模型场景）恒 false，即便 modelId 碰巧等于当前主力键的模型名', () => {
    const config = baseConfig({ primaryModelKey: 'deepseek/deepseek-v4-pro' })
    expect(shouldWarnPrimaryModelDisabled(config, 'deepseek', 'deepseek-v4-pro', true)).toBe(false)
  })

  test('primaryModelKey 为 null（空池）时恒 false', () => {
    const config = baseConfig({ primaryModelKey: null })
    expect(shouldWarnPrimaryModelDisabled(config, 'deepseek', 'deepseek-v4-pro', false)).toBe(false)
  })
})
