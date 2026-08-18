import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

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

describe('Windows 打包配置（Windows 战役 2026-08-16）', () => {
  test('只出 NSIS 安装包，架构只 x64', () => {
    // 不出便携 zip：electron-updater 在 Windows 的更新载体就是 nsis exe + latest.yml，
    // 便携 zip 不参与自动更新，多一种产物就多一条没人测的路径。
    expect(packageJson.build.win.target).toEqual([{ target: 'nsis', arch: ['x64'] }])
  })

  test('产物命名沿用顶层 ${os} 模板，与更新源 Worker 的 ASSET_NAME_PATTERN 对得上', () => {
    // 顶层模板一份服务两个平台：electron-builder 的 ${os} 取 Platform.buildConfigurationKey，
    // mac → "mac"、windows → "win"（app-builder-lib/out/core.js:46-48），因此
    // mac 出 NarraCat-<版本>-mac-arm64.dmg、win 出 NarraCat-<版本>-win-x64.exe。
    // 不下沉到各平台段：两份写死的字符串要同步维护，比一份宏更容易漂移。
    expect(packageJson.build.artifactName).toBe('NarraCat-${version}-${os}-${arch}.${ext}')
    expect(packageJson.build.win.artifactName).toBeUndefined()
    // Worker 侧正则：^NarraCat-(\d+\.\d+\.\d+)-[a-z0-9-]+\.[a-z0-9.]+$
    const assetNamePattern = /^NarraCat-(\d+\.\d+\.\d+)-[a-z0-9-]+\.[a-z0-9.]+$/
    expect(assetNamePattern.test('NarraCat-0.1.1880-win-x64.exe')).toBe(true)
    expect(assetNamePattern.test('NarraCat-0.1.1880-win-x64.exe.blockmap')).toBe(true)
  })

  test('装机器人式一键安装关掉：允许用户选安装目录、装当前用户（免 UAC）', () => {
    expect(packageJson.build.nsis.oneClick).toBe(false)
    expect(packageJson.build.nsis.perMachine).toBe(false)
    expect(packageJson.build.nsis.allowToChangeInstallationDirectory).toBe(true)
  })

  test('publish 分平台，各自指向自己的 feed 目录', () => {
    // 顶层那份写死 mac-arm64：Windows 包会拿到 mac 的 feed，更新时下载到 .dmg。
    expect(packageJson.build.publish).toBeUndefined()
    expect(packageJson.build.mac.publish).toEqual({ provider: 'generic', url: 'https://update.narracat.com/mac-arm64' })
    expect(packageJson.build.win.publish).toEqual({ provider: 'generic', url: 'https://update.narracat.com/win-x64' })
  })

  test('Windows 图标就位（electron-builder 据此生成 .ico）', () => {
    expect(packageJson.build.win.icon).toBe('build/icon.png')
    expect(existsSync('build/icon.png')).toBe(true)
  })

  test('package:win 脚本走同一套 package-rc，只是换目标平台', () => {
    expect(packageJson.scripts['package:win']).toBe('node scripts/package-rc.mjs --platform win32')
  })
})
