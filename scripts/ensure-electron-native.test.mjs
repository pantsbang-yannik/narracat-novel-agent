import { describe, expect, test } from 'bun:test'

import { shouldSkipElectronRebuild } from './ensure-electron-native.mjs'

describe('better-sqlite3 Electron 重建判定', () => {
  // better-sqlite3 13 是 N-API：同一份 prebuild 二进制 plain node 与 Electron 都能加载。
  // Windows CI 上强行 rebuild 要拉 node-gyp + MSVC，慢且脆——命中 prebuild 就跳过。
  test('Windows 上命中对应平台 prebuild 即跳过重建', () => {
    expect(shouldSkipElectronRebuild({ platform: 'win32', arch: 'x64', prebuildExists: true })).toBe(true)
  })

  test('Windows 上没有 prebuild 时仍然重建（不能静默放过缺二进制）', () => {
    expect(shouldSkipElectronRebuild({ platform: 'win32', arch: 'x64', prebuildExists: false })).toBe(false)
  })

  // mac 路径刻意不动：那条链路刚过真机验收（2026-08 签名+公证战役），不顺手改。
  test('macOS 无论有没有 prebuild 都照旧重建', () => {
    expect(shouldSkipElectronRebuild({ platform: 'darwin', arch: 'arm64', prebuildExists: true })).toBe(false)
    expect(shouldSkipElectronRebuild({ platform: 'darwin', arch: 'arm64', prebuildExists: false })).toBe(false)
  })

  // 不做 Windows ARM（战役决策 8b）：即使 prebuilds/ 里备着 win32-arm64.node 也照旧重建，
  // 不给未验收的平台开半扇门。
  test('Windows ARM 不在目标矩阵内，照旧重建', () => {
    expect(shouldSkipElectronRebuild({ platform: 'win32', arch: 'arm64', prebuildExists: true })).toBe(false)
  })
})
