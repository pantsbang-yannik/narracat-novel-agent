import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const appIconSvg = readFileSync('build/icon.svg', 'utf8')

describe('RC package configuration', () => {
  test('uses the NarraCat app identity for packaged builds', () => {
    expect(packageJson.productName).toBe('NarraCat')
    expect(packageJson.build.appId).toBe('app.narracat.desktop')
  })

  test('targets Developer ID signed + notarized macOS arm64 DMG/ZIP artifacts', () => {
    expect(packageJson.scripts.package).toBe('node scripts/package-rc.mjs')
    expect(packageJson.scripts['package:release']).toBe('node scripts/package-rc.mjs --notarize')
    expect(packageJson.build.artifactName).toBe('NarraCat-${version}-${os}-${arch}.${ext}')
    // 不再硬编码 identity：由 electron-builder 从 Keychain 解析 Developer ID Application。
    // 缺证书时 electron-builder 只警告不报错，故打包链另设 check-signing-identity 硬闸（Task 2）。
    expect(packageJson.build.mac.identity).toBeUndefined()
    // 公证硬要求 hardened runtime；随之而来的 library validation 由 entitlements 关闭。
    expect(packageJson.build.mac.hardenedRuntime).toBe(true)
    // 主 bundle 与 helper 子进程共用同一份：非沙盒分发中二者所需豁免完全一致，
    // 分成两个逐字节相同的文件只会漂移。helper 同样要 disable-library-validation——
    // NovelMemory MCP 正是在子进程里 dlopen better_sqlite3.node 与 vec0.dylib。
    expect(packageJson.build.mac.entitlements).toBe('build/entitlements.mac.plist')
    expect(packageJson.build.mac.entitlementsInherit).toBe('build/entitlements.mac.plist')
    // zip 是 electron-updater 在 macOS 上的更新载体（开源路线图④的前置）。
    expect(packageJson.build.mac.target).toEqual([
      { target: 'dmg', arch: ['arm64'] },
      { target: 'zip', arch: ['arm64'] },
    ])
  })

  test('entitlements 授予四项加固运行时豁免（缺一则原生库静默失效）', () => {
    const required = [
      // V8 JIT：Electron 20+ 在 arm64 上缺此项直接崩
      'com.apple.security.cs.allow-jit',
      'com.apple.security.cs.allow-unsigned-executable-memory',
      // 关键项：放行 vec0.dylib / better_sqlite3.node / onnxruntime / sharp 的运行时加载
      'com.apple.security.cs.disable-library-validation',
      // 子进程以 ELECTRON_RUN_AS_NODE 启动 NovelMemory MCP 时需要
      'com.apple.security.cs.allow-dyld-environment-variables',
    ]

    // 解析成 plist 结构而非字符串匹配 `<key>xxx</key>` 是否存在：字符串匹配抓不住值被误写成
    // `<false/>` 的情况——而这恰恰是「静默降级」本身，是这条测试要守住的东西。
    // 不用 `plutil`：它是 macOS 专有命令，本仓无 CI，但会单向同步到公开镜像仓，
    // 那边 GitHub Actions 跑在 Linux 上，`plutil` 不存在会直接把这条测试打挂。
    // entitlements plist 只是极简的 <key>/<true|false/> 对列表，用纯 JS 正则解析即可，
    // 无需依赖任何平台专有工具。
    const plistXml = readFileSync('build/entitlements.mac.plist', 'utf8')
    const entitlements = {}
    for (const match of plistXml.matchAll(/<key>([^<]+)<\/key>\s*<(true|false)\/>/g)) {
      entitlements[match[1]] = match[2] === 'true'
    }
    for (const key of required) {
      expect(entitlements[key]).toBe(true)
    }
    // 补一道 macOS-only 的 plutil -lint，兜住 plist 语法本身合法（非 darwin 显式跳过，
    // 不在 Linux CI 上抛错）。
    if (process.platform === 'darwin') {
      execFileSync('plutil', ['-lint', 'build/entitlements.mac.plist'], { encoding: 'utf8' })
    }
    // 非 MAS 分发，不启用 App Sandbox（启用会连带需要一整套文件访问 entitlements）
    expect(Object.keys(entitlements)).not.toContain('com.apple.security.app-sandbox')
  })

  test('uses a pure white DMG installer background', () => {
    expect(packageJson.build.dmg.backgroundColor).toBe('#ffffff')
  })

  test('uses a pure white rounded app icon background', () => {
    expect(appIconSvg).toContain('<rect width="512" height="512" rx="96" fill="#FFFFFF"/>')
  })

  test('keeps only the Electron locales used by the RC app (per-platform)', () => {
    // mac lproj 用下划线命名（zh_CN.lproj），win pak 用连字符命名（zh-CN.pak）——
    // electron-builder 按平台精确匹配，两套命名各对一半，必须分设（#3）。
    expect(packageJson.build.electronLanguages).toBeUndefined()
    expect(packageJson.build.mac.electronLanguages).toEqual(['zh_CN', 'en'])
    expect(packageJson.build.win.electronLanguages).toEqual(['zh-CN', 'en-US'])
  })

  test('packages only built runtime output into app.asar', () => {
    expect(packageJson.build.files).toEqual(['out/**', '!out/**/*.map'])
    expect(packageJson.build.files).not.toContain('node_modules/**')
    expect(packageJson.build.files).not.toContain('src/**')
    expect(packageJson.build.files).not.toContain('electron/**')
  })

  test('拆旧刀5：claude-sdk 打包资产全退役（无 SDK unpack、无 headless runtime 资源）', () => {
    expect(packageJson.build.asarUnpack).not.toContain('node_modules/@anthropic-ai/claude-agent-sdk/**')
    expect(JSON.stringify(packageJson.build.extraResources)).not.toContain('NarraCatAgentRuntime')
    expect(JSON.stringify(packageJson.dependencies)).not.toContain('claude-agent-sdk')
    // 原生模块仍需 unpack（N-API better-sqlite3）
    expect(packageJson.build.asarUnpack).toContain('node_modules/better-sqlite3/**')
  })

  test('bundles the whitelisted Agent Core stage, not the raw source dir', () => {
    // 根因修复（ADR-0026）：从过滤后的 build/NarraCatAgentCore 打包，
    // 不再直指 agent-core/narracat 源目录（那会外发 eval/CHANGELOG/docs/测试等研发痕迹）。
    expect(packageJson.build.extraResources).toContainEqual({
      from: 'build/NarraCatAgentCore',
      to: 'NarraCatAgentCore',
    })
    expect(packageJson.build.extraResources).not.toContainEqual({
      from: 'agent-core/narracat',
      to: 'NarraCatAgentCore',
    })
  })
})
