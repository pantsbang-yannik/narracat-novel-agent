import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'bun:test'

// AppShell 只被图书馆路由消费；这里锁的是顶栏平台感知 padding 的源码约定
// （win32 caption 让位 + 呼吸位 / mac 红绿灯让位），渲染断言在 library.test.tsx。
describe('AppShell titlebar insets', () => {
  test('reserves the Windows caption zone plus breathing room on the right', () => {
    // 只隔让位线时 navEnd 图标与 min/max/close 读成一团（视觉混排），加 0.75rem 呼吸位；
    // mac 不受影响（--titlebar-inset-right 为 0，max 退回 1rem 原值）。
    const source = readFileSync(fileURLToPath(new URL('./AppShell.tsx', import.meta.url)), 'utf-8')

    expect(source).toContain('pr-[max(1rem,calc(var(--titlebar-inset-right)+0.75rem))]')
    expect(source).toContain('pl-[max(1rem,var(--titlebar-inset-left))]')
    expect(source).not.toContain('pr-[max(1rem,var(--titlebar-inset-right))]')
  })
})
