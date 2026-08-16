import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'bun:test'

describe('main entry titlebar inset hardening', () => {
  test('measures the Windows caption width at runtime instead of trusting the 150px fallback', () => {
    // 125%/150% 缩放下原生 caption 按钮比 150px 宽，硬编码预留会让顶栏按钮被压住
    // （Windows 适配盲区，2026-08-16）。入口必须用 Window Controls Overlay 实测
    // caption 宽度写入内联 CSS 变量覆盖回退值，并跟随 geometrychange/resize 同步。
    const source = readFileSync(fileURLToPath(new URL('./main.tsx', import.meta.url)), 'utf-8')

    expect(source).toContain('function syncWin32TitlebarInset')
    expect(source).toContain('getTitlebarAreaRect()')
    expect(source).toContain("setProperty('--titlebar-inset-right'")
    expect(source).toContain("'geometrychange', syncWin32TitlebarInset")
    expect(source).toContain("'resize', syncWin32TitlebarInset")
  })
})
