import { afterEach, describe, expect, test } from 'bun:test'

import {
  __resetCharacterChatSubscriptionForTest,
  __setBubbleScheduleForTest,
  bubbleDelayMs,
  ensureCharacterChatSubscription,
  useCharacterChatStore,
} from './character-chat-store'
import type { CharacterChatStreamEvent, CharacterContact, CharacterContactList } from '@shared/types/character-chat'

const originalWindow = globalThis.window

function contact(uid: string, name: string, first = 1, last = 1): CharacterContact {
  return { characterUid: uid, name, firstAppearedChapter: first, lastSeenChapter: last, settingPath: `bible/characters/${name}.md` }
}

function mockElectron(electron: Record<string, unknown>): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { electron },
  })
}

// 验证语义已随模型池化迁到「主力槽条目的验证快照与当前 Key 代际/端点/wire 一致」（resolvePrimaryModel
// + isEntryVerified，见 shared/lib/model-slots.ts），不再是全局 modelServiceVerification 字段。
function verifiedConfigPayload(verified: boolean) {
  const baseUrl = 'https://api.deepseek.com/anthropic'
  const apiKeyUpdatedAt = '2026-01-01T00:00:00.000Z'
  return {
    config: {
      providers: { deepseek: { baseUrl, wire: 'anthropic' } },
      modelPool: [
        {
          provider: 'deepseek',
          modelId: 'deepseek-v4-pro',
          verification: verified ? { verifiedAt: 'now', apiKeyUpdatedAt, baseUrl, wire: 'anthropic' } : null,
        },
      ],
      primaryModelKey: 'deepseek/deepseek-v4-pro',
      lightModelKey: null,
      apiKeyMetadata: verified ? { deepseek: { updatedAt: apiKeyUpdatedAt } } : {},
    },
    hasApiKey: true,
  }
}

afterEach(() => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
  useCharacterChatStore.getState().reset()
  __resetCharacterChatSubscriptionForTest()
  __setBubbleScheduleForTest(null)
})

describe('useCharacterChatStore', () => {
  // 气泡播放默认走 setTimeout；测试注入同步执行版，让 bubble 立即上屏可同步断言。
  function useSyncBubbleSchedule(): void {
    __setBubbleScheduleForTest((cb) => {
      cb()
    })
  }

  test('loadContacts 加载联系人并默认选中第一个', async () => {
    const list: CharacterContactList = {
      contacts: [contact('uid-a', '林衍', 1, 3), contact('uid-b', '苏暮', 3, 3)],
      knowledgeBoundaryChapter: 3,
    }
    mockElectron({ listAppearedCharacters: () => Promise.resolve(list) })

    await useCharacterChatStore.getState().loadContacts('/novels/p1')
    const state = useCharacterChatStore.getState()

    expect(state.contactsPhase).toBe('loaded')
    expect(state.contacts.map((c) => c.name)).toEqual(['林衍', '苏暮'])
    expect(state.knowledgeBoundaryChapter).toBe(3)
    expect(state.activeCharacterUid).toBe('uid-a')
  })

  test('loadContacts 列表来自无 status 的骨架，currentStatus 由 enrich 异步 merge（方案 B）', async () => {
    let enrichArgs: Record<string, unknown> | null = null
    let resolveEnrich!: (statusByUid: Record<string, string>) => void
    const enrichPending = new Promise<Record<string, string>>((resolve) => {
      resolveEnrich = resolve
    })
    mockElectron({
      listAppearedCharacters: () =>
        Promise.resolve({
          contacts: [contact('uid-a', '林衍', 1, 3), contact('uid-b', '苏暮', 3, 3)],
          knowledgeBoundaryChapter: 3,
        }),
      readCharacterChatTranscript: (identity: Record<string, unknown>) =>
        Promise.resolve({ projectPath: '/novels/p1', characterUid: identity.characterUid, userMode: 'author', messages: [] }),
      enrichCharacterStatuses: (input: Record<string, unknown>) => {
        enrichArgs = input
        return enrichPending
      },
    })

    await useCharacterChatStore.getState().loadContacts('/novels/p1')

    // 富化仍 pending（仿真机 spawn 引擎的 ~2s）：列表已就绪、可用，但 currentStatus 还是空。
    expect(useCharacterChatStore.getState().contactsPhase).toBe('loaded')
    expect(useCharacterChatStore.getState().contacts.every((c) => c.currentStatus == null)).toBe(true)
    expect(enrichArgs).toEqual({
      projectPath: '/novels/p1',
      characterUids: ['uid-a', 'uid-b'],
      knowledgeBoundaryChapter: 3,
    })

    // 富化回来后按 uid merge，状态渐显。
    resolveEnrich({ 'uid-a': '重伤潜逃', 'uid-b': '在京养病' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const contacts = useCharacterChatStore.getState().contacts
    expect(contacts.find((c) => c.characterUid === 'uid-a')?.currentStatus).toBe('重伤潜逃')
    expect(contacts.find((c) => c.characterUid === 'uid-b')?.currentStatus).toBe('在京养病')
  })

  test('同项目连续 loadContacts：旧 enrich 晚到被 seq 守卫丢弃，不覆盖新状态（review P3）', async () => {
    const enrichResolvers: Array<(statusByUid: Record<string, string>) => void> = []
    mockElectron({
      listAppearedCharacters: () =>
        Promise.resolve({ contacts: [contact('uid-a', '林衍', 1, 3)], knowledgeBoundaryChapter: 3 }),
      readCharacterChatTranscript: (identity: Record<string, unknown>) =>
        Promise.resolve({ projectPath: '/novels/p1', characterUid: identity.characterUid, userMode: 'author', messages: [] }),
      enrichCharacterStatuses: () =>
        new Promise<Record<string, string>>((resolve) => {
          enrichResolvers.push(resolve)
        }),
    })

    // 同一项目连刷两次（仿「刷新角色状态」），两次富化都在途。
    await useCharacterChatStore.getState().loadContacts('/novels/p1')
    await useCharacterChatStore.getState().loadContacts('/novels/p1')
    expect(enrichResolvers).toHaveLength(2)

    // 新一次（第二次）富化先回 → 正常 merge。
    enrichResolvers[1]({ 'uid-a': '最新状态' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(useCharacterChatStore.getState().contacts.find((c) => c.characterUid === 'uid-a')?.currentStatus).toBe('最新状态')

    // 旧一次（第一次）富化晚到 → seq 不匹配被丢弃，状态保持最新、不被旧值覆盖。
    enrichResolvers[0]({ 'uid-a': '过期状态' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(useCharacterChatStore.getState().contacts.find((c) => c.characterUid === 'uid-a')?.currentStatus).toBe('最新状态')
  })

  test('loadContacts 后默认选中联系人的历史被恢复（#202 回归）', async () => {
    let restoreCalls = 0
    mockElectron({
      listAppearedCharacters: () =>
        Promise.resolve({
          contacts: [contact('uid-a', '林衍', 1, 3), contact('uid-b', '苏暮', 3, 3)],
          knowledgeBoundaryChapter: 3,
        }),
      readCharacterChatTranscript: (identity: Record<string, unknown>) => {
        restoreCalls += 1
        return Promise.resolve({
          projectPath: '/novels/p1',
          characterUid: identity.characterUid,
          userMode: 'author',
          messages: [
            { id: 'm1', role: 'user', text: '上次聊到哪', status: 'complete', createdAt: 't' },
            { id: 'm2', role: 'character', text: '聊到剑法', status: 'complete', createdAt: 't' },
          ],
          updatedAt: 't',
        })
      },
    })

    await useCharacterChatStore.getState().loadContacts('/novels/p1')
    // restoreTranscript 是 void（fire-and-forget），等微任务回填完成。
    await new Promise((resolve) => setTimeout(resolve, 0))

    const state = useCharacterChatStore.getState()
    expect(state.activeCharacterUid).toBe('uid-a')
    // 默认角色历史被 restore，无需手动切换。
    expect(restoreCalls).toBe(1)
    expect(state.conversations['uid-a'].messages.map((m) => m.text)).toEqual(['上次聊到哪', '聊到剑法'])
    expect(state.hydratedUids).toContain('uid-a')
  })

  test('空联系人时 phase=loaded 且无选中（中性空态）', async () => {
    mockElectron({ listAppearedCharacters: () => Promise.resolve({ contacts: [], knowledgeBoundaryChapter: null }) })

    await useCharacterChatStore.getState().loadContacts('/novels/p1')
    const state = useCharacterChatStore.getState()

    expect(state.contactsPhase).toBe('loaded')
    expect(state.contacts).toEqual([])
    expect(state.activeCharacterUid).toBeNull()
  })

  test('loadContacts 失败时进入 failed 态并保留错误信息', async () => {
    mockElectron({ listAppearedCharacters: () => Promise.reject(new Error('reader 崩了')) })

    await useCharacterChatStore.getState().loadContacts('/novels/p1')
    const state = useCharacterChatStore.getState()

    expect(state.contactsPhase).toBe('failed')
    expect(state.contactsError).toContain('reader 崩了')
  })

  test('refreshModelServiceVerification 反映 config 验证状态', async () => {
    mockElectron({ getConfig: () => Promise.resolve(verifiedConfigPayload(false)) })
    await useCharacterChatStore.getState().refreshModelServiceVerification()
    expect(useCharacterChatStore.getState().modelServiceVerified).toBe(false)

    mockElectron({ getConfig: () => Promise.resolve(verifiedConfigPayload(true)) })
    await useCharacterChatStore.getState().refreshModelServiceVerification()
    expect(useCharacterChatStore.getState().modelServiceVerified).toBe(true)
  })

  test('getConfig 抛错时按未验证处理（闸门关闭，不放行）', async () => {
    mockElectron({ getConfig: () => Promise.reject(new Error('no config')) })
    await useCharacterChatStore.getState().refreshModelServiceVerification()
    expect(useCharacterChatStore.getState().modelServiceVerified).toBe(false)
  })

  test('setProjectPath 切项目会重置板块状态', () => {
    mockElectron({ flushCharacterChatProfile: () => Promise.resolve() })
    useCharacterChatStore.setState({ projectPath: '/a', activeCharacterUid: 'uid-a', contacts: [contact('uid-a', '林衍')] })
    useCharacterChatStore.getState().setProjectPath('/b')
    const state = useCharacterChatStore.getState()
    expect(state.projectPath).toBe('/b')
    expect(state.activeCharacterUid).toBeNull()
    expect(state.contacts).toEqual([])
  })

  test('切项目清掉排队气泡：旧项目在途回复不会泄漏进新项目的同 uid 会话', async () => {
    // 捕获式调度器：留住回调不执行，模拟延迟未到的 setTimeout。
    const pending: Array<() => void> = []
    __setBubbleScheduleForTest((cb) => {
      pending.push(cb)
    })
    mockElectron({
      sendCharacterChatMessage: (r: Record<string, unknown>) => Promise.resolve({ runId: r.runId }),
      saveCharacterChatTranscript: (input: Record<string, unknown>) => Promise.resolve(input),
      flushCharacterChatProfile: () => Promise.resolve(),
    })

    // 项目 A：与 uid-x 聊天，气泡入队但尚未上屏。
    useCharacterChatStore.setState({ projectPath: '/novels/A', activeCharacterUid: 'uid-x' })
    await useCharacterChatStore.getState().sendMessage('uid-x', '在吗')
    const runId = useCharacterChatStore.getState().conversations['uid-x'].activeRunId as string
    useCharacterChatStore
      .getState()
      .applyStreamEvent({ type: 'bubble', runId, bubbleIndex: 0, text: '旧项目的回复' })
    expect(pending.length).toBeGreaterThan(0)

    // 切到项目 B，且 B 里恰有同一个 uid-x 会话（复制项目极易触发）。
    useCharacterChatStore.getState().setProjectPath('/novels/B')
    useCharacterChatStore.setState({
      activeCharacterUid: 'uid-x',
      conversations: { 'uid-x': { messages: [], activeRunId: null, lastUserMessage: null } },
    })

    // 旧项目的延迟气泡回调此刻才触发——不得污染新项目会话。
    for (const cb of pending) cb()

    const messages = useCharacterChatStore.getState().conversations['uid-x'].messages
    expect(messages.some((m) => m.text === '旧项目的回复')).toBe(false)
    expect(messages).toHaveLength(0)
  })

  test('刷新联系人后旧选中若失效则回落到首个', async () => {
    useCharacterChatStore.setState({ projectPath: '/novels/p1', activeCharacterUid: 'uid-gone' })
    mockElectron({
      listAppearedCharacters: () => Promise.resolve({ contacts: [contact('uid-a', '林衍')], knowledgeBoundaryChapter: 1 }),
    })
    await useCharacterChatStore.getState().loadContacts('/novels/p1')
    expect(useCharacterChatStore.getState().activeCharacterUid).toBe('uid-a')
  })

  test('sendMessage 只追加用户气泡（不再预建占位角色气泡），并经 IPC 发送', async () => {
    const sent: Array<Record<string, unknown>> = []
    mockElectron({
      sendCharacterChatMessage: (request: Record<string, unknown>) => {
        sent.push(request)
        return Promise.resolve({ runId: request.runId })
      },
    })
    useCharacterChatStore.setState({ projectPath: '/novels/p1', activeCharacterUid: 'uid-a' })

    await useCharacterChatStore.getState().sendMessage('uid-a', '在吗')
    const conversation = useCharacterChatStore.getState().conversations['uid-a']

    expect(sent).toHaveLength(1)
    expect(sent[0].message).toBe('在吗')
    expect(conversation.messages.map((m) => m.role)).toEqual(['user'])
    expect(conversation.activeRunId).not.toBeNull()
  })

  test('applyStreamEvent bubble*N → 逐条 complete 角色气泡，completed 清空 activeRunId', async () => {
    useSyncBubbleSchedule()
    mockElectron({
      sendCharacterChatMessage: (r: Record<string, unknown>) => Promise.resolve({ runId: r.runId }),
      saveCharacterChatTranscript: (input: Record<string, unknown>) => Promise.resolve(input),
    })
    useCharacterChatStore.setState({ projectPath: '/novels/p1', activeCharacterUid: 'uid-a' })
    await useCharacterChatStore.getState().sendMessage('uid-a', '在吗')
    const runId = useCharacterChatStore.getState().conversations['uid-a'].activeRunId as string

    useCharacterChatStore.getState().applyStreamEvent({ type: 'bubble', runId, bubbleIndex: 0, text: '在。' })
    useCharacterChatStore.getState().applyStreamEvent({ type: 'bubble', runId, bubbleIndex: 1, text: '你猜' })
    useCharacterChatStore.getState().applyStreamEvent({ type: 'completed', runId, text: '在。你猜' })

    const conversation = useCharacterChatStore.getState().conversations['uid-a']
    expect(conversation.messages.map((m) => `${m.role}:${m.text}:${m.status}`)).toEqual([
      'user:在吗:complete',
      'character:在。:complete',
      'character:你猜:complete',
    ])
    expect(conversation.activeRunId).toBeNull()
  })

  test('applyStreamEvent failed 追加失败角色气泡，保留 lastUserMessage 供重试', async () => {
    useSyncBubbleSchedule()
    mockElectron({
      sendCharacterChatMessage: (r: Record<string, unknown>) => Promise.resolve({ runId: r.runId }),
      saveCharacterChatTranscript: (input: Record<string, unknown>) => Promise.resolve(input),
    })
    useCharacterChatStore.setState({ projectPath: '/novels/p1', activeCharacterUid: 'uid-a' })
    await useCharacterChatStore.getState().sendMessage('uid-a', '在吗')
    const runId = useCharacterChatStore.getState().conversations['uid-a'].activeRunId as string

    useCharacterChatStore.getState().applyStreamEvent({ type: 'failed', runId, message: '网络错误' })
    const conversation = useCharacterChatStore.getState().conversations['uid-a']
    const last = conversation.messages[conversation.messages.length - 1]
    expect(last.role).toBe('character')
    expect(last.status).toBe('failed')
    expect(last.text).toBe('网络错误')
    expect(conversation.activeRunId).toBeNull()
    expect(conversation.lastUserMessage).toBe('在吗')
  })

  test('retryLastMessage 丢弃失败回合并按原文重发', async () => {
    const sent: Array<Record<string, unknown>> = []
    mockElectron({
      sendCharacterChatMessage: (r: Record<string, unknown>) => {
        sent.push(r)
        return Promise.resolve({ runId: r.runId })
      },
    })
    useCharacterChatStore.setState({ projectPath: '/novels/p1', activeCharacterUid: 'uid-a' })
    await useCharacterChatStore.getState().sendMessage('uid-a', '在吗')
    const runId = useCharacterChatStore.getState().conversations['uid-a'].activeRunId as string
    useCharacterChatStore.getState().applyStreamEvent({ type: 'failed', runId, message: '网络错误' })

    await useCharacterChatStore.getState().retryLastMessage('uid-a')
    const conversation = useCharacterChatStore.getState().conversations['uid-a']

    expect(sent).toHaveLength(2)
    expect(sent[1].message).toBe('在吗')
    // 重发后只剩一条新的 user 气泡（失败回合已丢弃，不再预建占位 character）
    expect(conversation.messages.map((m) => m.role)).toEqual(['user'])
  })

  test('同一联系人在途回复时 sendMessage 不重复发送', async () => {
    const sent: unknown[] = []
    mockElectron({
      sendCharacterChatMessage: (r: Record<string, unknown>) => {
        sent.push(r)
        return Promise.resolve({ runId: r.runId })
      },
    })
    useCharacterChatStore.setState({ projectPath: '/novels/p1', activeCharacterUid: 'uid-a' })
    await useCharacterChatStore.getState().sendMessage('uid-a', '在吗')
    await useCharacterChatStore.getState().sendMessage('uid-a', '再问一句')
    expect(sent).toHaveLength(1)
  })

  test('restoreTranscript 从本机存档恢复历史消息', async () => {
    mockElectron({
      readCharacterChatTranscript: () =>
        Promise.resolve({
          projectPath: '/novels/p1',
          characterUid: 'uid-a',
          userMode: 'author',
          messages: [
            { id: 'm1', role: 'user', text: '上次聊到哪', status: 'complete', createdAt: 't' },
            { id: 'm2', role: 'character', text: '聊到剑法', status: 'complete', createdAt: 't' },
          ],
          updatedAt: 't',
        }),
    })
    useCharacterChatStore.setState({ projectPath: '/novels/p1' })

    await useCharacterChatStore.getState().restoreTranscript('uid-a')
    const conversation = useCharacterChatStore.getState().conversations['uid-a']
    expect(conversation.messages.map((m) => m.text)).toEqual(['上次聊到哪', '聊到剑法'])
    expect(useCharacterChatStore.getState().hydratedUids).toContain('uid-a')
  })

  test('restoreTranscript 不覆盖已有在途/本地消息', async () => {
    let readCalls = 0
    mockElectron({
      readCharacterChatTranscript: () => {
        readCalls += 1
        return Promise.resolve({ projectPath: '/novels/p1', characterUid: 'uid-a', userMode: 'author', messages: [], updatedAt: 't' })
      },
    })
    useCharacterChatStore.setState({
      projectPath: '/novels/p1',
      conversations: {
        'uid-a': {
          messages: [{ id: 'live', role: 'user', text: '刚发的', status: 'complete', createdAt: 't' }],
          activeRunId: null,
          lastUserMessage: '刚发的',
        },
      },
    })

    await useCharacterChatStore.getState().restoreTranscript('uid-a')
    expect(readCalls).toBe(0)
    expect(useCharacterChatStore.getState().conversations['uid-a'].messages[0].text).toBe('刚发的')
  })

  test('cancelActiveRuns 取消在途 run 并清空孤儿 activeRunId（避免重开后 composer 永久禁用）', async () => {
    const cancelled: string[] = []
    mockElectron({
      sendCharacterChatMessage: (r: Record<string, unknown>) => Promise.resolve({ runId: r.runId }),
      cancelCharacterChat: (runId: string) => {
        cancelled.push(runId)
        return Promise.resolve({ cancelled: true })
      },
    })
    useCharacterChatStore.setState({ projectPath: '/novels/p1', activeCharacterUid: 'uid-a' })
    await useCharacterChatStore.getState().sendMessage('uid-a', '在吗')
    const runId = useCharacterChatStore.getState().conversations['uid-a'].activeRunId as string
    expect(runId).not.toBeNull()

    // 模拟流式途中离开板块。
    useCharacterChatStore.getState().cancelActiveRuns()

    expect(cancelled).toEqual([runId])
    const conversation = useCharacterChatStore.getState().conversations['uid-a']
    expect(conversation.activeRunId).toBeNull()
    expect(useCharacterChatStore.getState().runRouting).toEqual({})
    // 不再有占位 streaming 气泡可折叠；本回合只有用户气泡，原样保留（取消是主动离开，非失败）。
    expect(conversation.messages.map((m) => m.role)).toEqual(['user'])
  })

  test('cancelActiveRuns 无在途 run 时不调用 IPC', () => {
    let called = 0
    mockElectron({
      cancelCharacterChat: () => {
        called += 1
        return Promise.resolve({ cancelled: false })
      },
    })
    useCharacterChatStore.getState().cancelActiveRuns()
    expect(called).toBe(0)
  })

  test('ensureCharacterChatSubscription 是模块级 once 守卫：多次调用只订阅一次', () => {
    let subscribeCount = 0
    const factory = (_callback: (event: CharacterChatStreamEvent) => void): (() => void) => {
      subscribeCount += 1
      return () => {}
    }

    ensureCharacterChatSubscription(factory)
    ensureCharacterChatSubscription(factory)
    ensureCharacterChatSubscription(factory)

    expect(subscribeCount).toBe(1)
  })

  test('常驻订阅：board 卸载后到达的 completed 流事件仍入档并清空 activeRunId（切场景不丢回复）', async () => {
    useSyncBubbleSchedule()
    const saved: Array<Record<string, unknown>> = []
    let emit: ((event: CharacterChatStreamEvent) => void) | null = null
    mockElectron({
      sendCharacterChatMessage: (r: Record<string, unknown>) => Promise.resolve({ runId: r.runId }),
      saveCharacterChatTranscript: (input: Record<string, unknown>) => {
        saved.push(input)
        return Promise.resolve(input)
      },
    })

    // 模拟「board 挂载即建立常驻订阅」：拿到 store 注入的回调，留到 board 卸载后再 emit。
    ensureCharacterChatSubscription((callback) => {
      emit = callback
      return () => {
        throw new Error('常驻订阅不应被取消')
      }
    })

    useCharacterChatStore.setState({ projectPath: '/novels/p1', activeCharacterUid: 'uid-a' })
    await useCharacterChatStore.getState().sendMessage('uid-a', '在吗')
    const runId = useCharacterChatStore.getState().conversations['uid-a'].activeRunId as string
    expect(runId).not.toBeNull()

    // 切场景：board 卸载（不 cancel、不 unsubscribe）。在途 run 之后才完成 —— 流事件经常驻订阅照常回填。
    expect(emit).not.toBeNull()
    emit!({ type: 'bubble', runId, bubbleIndex: 0, text: '在的' })
    emit!({ type: 'completed', runId, text: '在的' })

    const conversation = useCharacterChatStore.getState().conversations['uid-a']
    const characterMessage = conversation.messages[conversation.messages.length - 1]
    // 回复继续→完成入档→activeRunId 清空（composer 不卡），不出现「已离开对话，回复已取消」。
    expect(characterMessage.text).toBe('在的')
    expect(characterMessage.status).toBe('complete')
    expect(conversation.activeRunId).toBeNull()
    expect(characterMessage.text).not.toContain('已离开对话')
    expect(saved).toHaveLength(1)
  })

  test('completed 后持久化整段会话（不写 streaming）', async () => {
    useSyncBubbleSchedule()
    const saved: Array<Record<string, unknown>> = []
    mockElectron({
      sendCharacterChatMessage: (r: Record<string, unknown>) => Promise.resolve({ runId: r.runId }),
      saveCharacterChatTranscript: (input: Record<string, unknown>) => {
        saved.push(input)
        return Promise.resolve(input)
      },
    })
    useCharacterChatStore.setState({ projectPath: '/novels/p1', activeCharacterUid: 'uid-a' })
    await useCharacterChatStore.getState().sendMessage('uid-a', '在吗')
    const runId = useCharacterChatStore.getState().conversations['uid-a'].activeRunId as string
    useCharacterChatStore.getState().applyStreamEvent({ type: 'bubble', runId, bubbleIndex: 0, text: '在的' })
    useCharacterChatStore.getState().applyStreamEvent({ type: 'completed', runId, text: '在的' })

    expect(saved).toHaveLength(1)
    expect(saved[0].projectPath).toBe('/novels/p1')
    expect(saved[0].userMode).toBe('author')
    const messages = saved[0].messages as Array<{ status: string }>
    expect(messages.every((m) => m.status !== 'streaming')).toBe(true)
  })

  test('persistTranscript 只落 complete：failed 气泡不入档（恢复后不出现点不动的重试）', async () => {
    useSyncBubbleSchedule()
    const saved: Array<Record<string, unknown>> = []
    mockElectron({
      sendCharacterChatMessage: (r: Record<string, unknown>) => Promise.resolve({ runId: r.runId }),
      saveCharacterChatTranscript: (input: Record<string, unknown>) => {
        saved.push(input)
        return Promise.resolve(input)
      },
    })
    useCharacterChatStore.setState({ projectPath: '/novels/p1', activeCharacterUid: 'uid-a' })
    await useCharacterChatStore.getState().sendMessage('uid-a', '在吗')
    const runId = useCharacterChatStore.getState().conversations['uid-a'].activeRunId as string
    // 失败：内存里角色气泡标 failed、保留 lastUserMessage 供重试；但持久化只落 complete。
    useCharacterChatStore.getState().applyStreamEvent({ type: 'failed', runId, message: '网络错误' })

    // failed 时也会触发一次落盘，但写出去的 messages 里不含 failed（只剩成功的用户气泡）。
    expect(saved).toHaveLength(1)
    const persisted = saved[0].messages as Array<{ role: string; status: string }>
    expect(persisted.every((m) => m.status === 'complete')).toBe(true)
    expect(persisted.some((m) => m.status === 'failed')).toBe(false)
    // 失败气泡仍在内存（可重试），但不在落盘内容里。
    const conversation = useCharacterChatStore.getState().conversations['uid-a']
    expect(conversation.messages[conversation.messages.length - 1].status).toBe('failed')
    expect(conversation.lastUserMessage).toBe('在吗')
  })
})

describe('bubbleDelayMs（气泡播放节奏）', () => {
  test('首条走快通道：模型生成已让用户等过，短文本接近下限', () => {
    expect(bubbleDelayMs('在。', true)).toBeLessThanOrEqual(600)
  })

  test('后续条每条至少 ~0.85s「正在输入」，短气泡不再嗖嗖蹦', () => {
    expect(bubbleDelayMs('嗯。', false)).toBeGreaterThanOrEqual(850)
  })

  test('同一文本，后续条的「正在输入」停顿明显长于首条', () => {
    const text = '这事我得想想。'
    expect(bubbleDelayMs(text, false)).toBeGreaterThan(bubbleDelayMs(text, true))
  })

  test('后续条按字数放大但封顶', () => {
    const long = '一'.repeat(60)
    expect(bubbleDelayMs(long, false)).toBeLessThanOrEqual(2600)
    expect(bubbleDelayMs('一'.repeat(20), false)).toBeGreaterThan(bubbleDelayMs('一'.repeat(4), false))
  })
})
