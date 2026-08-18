#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { listPackage } from '@electron/asar'
import {
  FORBIDDEN_RELATIVE_PATHS,
  hasPrunedMcpNodeModuleDirectory,
  resolveNativeTarget,
  shouldPruneForeignPlatformBinary,
  shouldPruneMcpDistFile,
  shouldPruneMcpNodeModuleFile,
} from './stage-narracat-agent-core.mjs'

const scriptDir = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(scriptDir, '..')

export const ALLOWED_ASAR_TOP_LEVEL = new Set(['out', 'node_modules', 'package.json'])
export const ALLOWED_ELECTRON_LOCALES = new Set(['en.lproj', 'zh_CN.lproj'])

export const FORBIDDEN_ASAR_PATHS = [
  '.agents',
  '.claude',
  '.env.example',
  '.nvmrc',
  'AGENTS.md',
  'CLAUDE.md',
  'CONTEXT.md',
  'README.md',
  'agent-core',
  'build',
  'components.json',
  'corpus-factory-data',
  'dist',
  'docs',
  'electron',
  'electron.vite.config.ts',
  'poc',
  'resources',
  'scripts',
  'src',
  'tsconfig.json',
  'tsconfig.node.json',
  'tsconfig.node.tsbuildinfo',
  'tsconfig.web.json',
  'tsconfig.web.tsbuildinfo',
  'workers',
]

// 仅在 staged Agent Core 资源树才需额外拦截的 MCP 开发型路径（不属于通用研发痕迹黑名单）。
const ADDITIONAL_FORBIDDEN_MCP_DEV_PATHS = [
  'mcp-server/package-lock.json',
  'mcp-server/src',
  'mcp-server/node_modules/.bin',
  'mcp-server/node_modules/typescript',
]

// 打包后审计的禁入清单 = stage 暂存阶段的研发痕迹黑名单（FORBIDDEN_RELATIVE_PATHS 为 SSOT，
// 避免两份手抄列表漂移）＋ MCP 开发型路径。stage 加新痕迹，审计自动同步拦截。
export const FORBIDDEN_AGENT_CORE_RESOURCE_PATHS = [
  ...FORBIDDEN_RELATIVE_PATHS,
  ...ADDITIONAL_FORBIDDEN_MCP_DEV_PATHS,
]

function readOption(args, name) {
  const equalsPrefix = `${name}=`
  const inline = args.find((arg) => arg.startsWith(equalsPrefix))
  if (inline) return inline.slice(equalsPrefix.length)

  const index = args.indexOf(name)
  if (index === -1) return undefined
  return args[index + 1]
}

function resolveFromRoot(root, path) {
  return path.startsWith('/') ? path : resolve(root, path)
}

// 打包产物的目录布局按平台不同。mac 是 .app bundle（Contents/Resources），
// Windows 是 win-unpacked 平铺目录（resources/ + 与 exe 平级的 locales/）。
export const PACKAGED_LAYOUTS = {
  darwin: {
    appPath: join('dist', 'mac-arm64', 'NarraCat.app'),
    resourcesDir: join('Contents', 'Resources'),
    // mac 的 locale.pak 不在 Contents/Resources，而在 Electron Framework 内部；
    // Contents/Resources 下的同名 .lproj 是 macOS 的语言声明标记目录，Electron 原生就空
    // （2026-08-18 在真实产物上实测确认），不能拿它当「locale 就绪」的判据。
    // 命名用下划线：mac 走 Apple 的 .lproj 惯例（zh_CN / en），不是 Chromium 的 pak 惯例。
    localesDir: join('Contents', 'Frameworks', 'Electron Framework.framework', 'Resources'),
    localeFiles: [join('zh_CN.lproj', 'locale.pak'), join('en.lproj', 'locale.pak')],
  },
  win32: {
    appPath: join('dist', 'win-unpacked'),
    resourcesDir: 'resources',
    // Windows 走 Chromium 的 pak 惯例：连字符命名，平铺在 exe 同级的 locales/ 下。
    localesDir: 'locales',
    localeFiles: ['zh-CN.pak', 'en-US.pak'],
  },
}

export function resolvePackagedLayout(platform = process.platform) {
  const layout = PACKAGED_LAYOUTS[platform]
  if (!layout) {
    throw new Error(`不支持的打包目标平台：${platform}（当前只分发 darwin/arm64 与 win32/x64）`)
  }
  return layout
}

/**
 * 读 `--platform`。语义与 stage-narracat-agent-core.mjs 的 resolveNativeTargetFromArgv 一致：
 * 不写 = 当前平台；写了却没给值 = 炸，绝不静默回落（那会拿 mac 布局去审 Windows 产物，
 * 结果是「找不到 Resources 目录」这种指错方向的报错，或更糟——误判通过）。
 */
function readPlatformOption(args) {
  if (!args.includes('--platform') && !args.some((arg) => arg.startsWith('--platform='))) return process.platform
  const value = readOption(args, '--platform')
  if (!value || value.startsWith('--')) {
    throw new Error('--platform 缺少取值（用法：--platform darwin|win32）')
  }
  return value
}

export function resolvePackagedAppPath(args = process.argv.slice(2), root = repoRoot) {
  const appPath = readOption(args, '--app') ?? resolvePackagedLayout(readPlatformOption(args)).appPath
  return resolveFromRoot(root, appPath)
}

export function resolvePackagedAsarPath(args = process.argv.slice(2), root = repoRoot) {
  const explicitAsarPath = readOption(args, '--asar')
  if (explicitAsarPath) return resolveFromRoot(root, explicitAsarPath)

  const layout = resolvePackagedLayout(readPlatformOption(args))
  return join(resolvePackagedAppPath(args, root), layout.resourcesDir, 'app.asar')
}

/**
 * locale 资源存在性硬闸（issue #3）。
 *
 * build.electronLanguages 一旦对某个平台写成 electron-builder 匹配不到的格式（该字段两平台走两套
 * 命名惯例：mac 是 Apple 的 .lproj「zh_CN」，Windows 是 Chromium 的 pak「zh-CN」），
 * 打出的 locales 目录是**空的**，而打包全程 exit 0、看不出任何异常。Windows 上第一次渲染
 * 文本就崩在 blink::LCIDFromLocaleInternal；mac 侥幸不崩，于是这个缺陷在整个 mac 发版
 * 周期里静默存在。这条断言就是把「静默」变成「打包当场炸」。
 */
export async function assertPackagedLocalesPresent(appPath, layout = resolvePackagedLayout()) {
  const missing = layout.localeFiles.filter((rel) => !existsSync(join(appPath, layout.localesDir, rel)))
  if (missing.length === 0) return
  throw new Error(
    [
      `打包产物缺少 Electron locale 资源：${missing.join('、')}`,
      `查找位置：${join(appPath, layout.localesDir)}`,
      '几乎总是 package.json 的 electronLanguages 用错了平台的命名惯例：',
      '  mac  → Apple .lproj 惯例，下划线：["zh_CN", "en"]',
      '  win  → Chromium pak 惯例，连字符：["zh-CN", "en-US"]',
      '写反了就零匹配，该平台的 locale 目录会是空的。缺 locale 的包在 Windows 上',
      '第一次渲染文本即崩溃（issue #3）。',
    ].join('\n'),
  )
}

export function normalizeAsarEntry(entry) {
  return (
    entry
      .replace(/^(pack|unpack)\s*:\s*/, '')
      // @electron/asar 在 Windows 上返回反斜杠路径。不归一化的话，下面按 '/' 切分会把
      // 整条路径当成单个「顶层条目」，于是每一条都判违规——2026-08-18 Windows 战役 CI
      // 实撞 29246 条全红，而 mac 上完全正常。
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .trim()
  )
}

function hasForbiddenPathPrefix(entry, prefix) {
  return entry === prefix || entry.startsWith(`${prefix}/`)
}

export function classifyAsarEntry(entry) {
  const normalized = normalizeAsarEntry(entry)
  if (!normalized) return { ok: true, path: normalized }

  if (!normalized.startsWith('node_modules/') && normalized.endsWith('.tsbuildinfo')) {
    return { ok: false, path: normalized, reason: 'TypeScript incremental build cache must not be packaged' }
  }

  if (normalized.startsWith('out/') && normalized.endsWith('.map')) {
    return { ok: false, path: normalized, reason: 'renderer/main source maps must not be packaged in app.asar' }
  }

  const forbidden = FORBIDDEN_ASAR_PATHS.find((prefix) => hasForbiddenPathPrefix(normalized, prefix))
  if (forbidden) {
    return { ok: false, path: normalized, reason: `forbidden development artifact: ${forbidden}` }
  }

  const topLevel = normalized.split('/')[0]
  if (!ALLOWED_ASAR_TOP_LEVEL.has(topLevel)) {
    return { ok: false, path: normalized, reason: `unexpected top-level app.asar entry: ${topLevel}` }
  }

  return { ok: true, path: normalized }
}

export function classifyPackagedResourceEntry(entry, target = resolveNativeTarget()) {
  const normalized = normalizeAsarEntry(entry)
  if (!normalized) return { ok: true, path: normalized }

  const topLevel = normalized.split('/')[0]
  if (topLevel.endsWith('.lproj') && !ALLOWED_ELECTRON_LOCALES.has(topLevel)) {
    return { ok: false, path: normalized, reason: `unexpected Electron locale resource: ${topLevel}` }
  }

  if (!normalized.startsWith('NarraCatAgentCore/')) return { ok: true, path: normalized }

  const agentCorePath = normalized.slice('NarraCatAgentCore/'.length)
  if (shouldPruneForeignPlatformBinary(agentCorePath, target)) {
    return {
      ok: false,
      path: normalized,
      reason: `foreign-platform prebuilt binary must be pruned (only ${target.platform}/${target.arch} ships)`,
    }
  }

  const forbidden = FORBIDDEN_AGENT_CORE_RESOURCE_PATHS.find((prefix) =>
    hasForbiddenPathPrefix(agentCorePath, prefix),
  )
  if (forbidden) {
    return { ok: false, path: normalized, reason: `forbidden Agent Core development artifact: ${forbidden}` }
  }

  if (hasForbiddenPathPrefix(agentCorePath, 'mcp-server/node_modules/onnxruntime-web')) {
    return { ok: false, path: normalized, reason: 'onnxruntime-web must not be packaged for Node-only MCP runtime' }
  }

  const distPrefix = 'mcp-server/dist/'
  if (agentCorePath.startsWith(distPrefix) && shouldPruneMcpDistFile(agentCorePath.slice(distPrefix.length))) {
    return { ok: false, path: normalized, reason: 'MCP dist TypeScript declaration must not be packaged' }
  }

  const nodeModulesPrefix = 'mcp-server/node_modules/'
  if (agentCorePath.startsWith(nodeModulesPrefix)) {
    const nodeModulePath = agentCorePath.slice(nodeModulesPrefix.length)
    if (hasPrunedMcpNodeModuleDirectory(nodeModulePath)) {
      return { ok: false, path: normalized, reason: 'MCP dependency development directory must not be packaged' }
    }
    if (shouldPruneMcpNodeModuleFile(nodeModulePath)) {
      return { ok: false, path: normalized, reason: 'MCP dependency development file must not be packaged' }
    }
  }

  return { ok: true, path: normalized }
}

export function auditAsarEntries(entries) {
  const violations = []
  for (const entry of entries) {
    const result = classifyAsarEntry(entry)
    if (!result.ok) violations.push(result)
  }

  return {
    ok: violations.length === 0,
    entryCount: entries.length,
    violations,
  }
}

export function auditPackagedResourceEntries(entries, target = resolveNativeTarget()) {
  const violations = []
  for (const entry of entries) {
    const result = classifyPackagedResourceEntry(entry, target)
    if (!result.ok) violations.push(result)
  }

  return {
    ok: violations.length === 0,
    entryCount: entries.length,
    violations,
  }
}

export function auditPackagedAsar(asarPath) {
  if (!existsSync(asarPath)) {
    throw new Error(`找不到 packaged app.asar：${asarPath}`)
  }

  return auditAsarEntries(listPackage(asarPath, { isPack: false }))
}

function listDirectoryEntries(root) {
  if (!existsSync(root)) return []
  const entries = []

  function walk(absPath, relPath) {
    for (const dirent of readdirSync(absPath, { withFileTypes: true })) {
      const childRelPath = relPath ? `${relPath}/${dirent.name}` : dirent.name
      entries.push(childRelPath)
      if (dirent.isDirectory()) walk(join(absPath, dirent.name), childRelPath)
    }
  }

  walk(root, '')
  return entries
}

export function auditPackagedExtraResources(appPath, platform = process.platform) {
  const layout = resolvePackagedLayout(platform)
  const resourcesPath = join(appPath, layout.resourcesDir)
  if (!existsSync(resourcesPath)) {
    throw new Error(`找不到 packaged Resources 目录：${resourcesPath}`)
  }

  return auditPackagedResourceEntries(listDirectoryEntries(resourcesPath), resolveNativeTarget(platform))
}

export async function auditPackagedApp(appPath, platform = process.platform) {
  const layout = resolvePackagedLayout(platform)
  await assertPackagedLocalesPresent(appPath, layout)
  const asarReport = auditPackagedAsar(join(appPath, layout.resourcesDir, 'app.asar'))
  const resourcesReport = auditPackagedExtraResources(appPath, platform)
  const violations = [
    ...asarReport.violations.map((violation) => ({ ...violation, scope: 'app.asar' })),
    ...resourcesReport.violations.map((violation) => ({ ...violation, scope: 'extraResources' })),
  ]

  return {
    ok: violations.length === 0,
    asarEntryCount: asarReport.entryCount,
    resourceEntryCount: resourcesReport.entryCount,
    violations,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const explicitAsarPath = readOption(process.argv.slice(2), '--asar')

  try {
    const report = explicitAsarPath
      ? auditPackagedAsar(resolvePackagedAsarPath())
      : await auditPackagedApp(resolvePackagedAppPath(), readPlatformOption(process.argv.slice(2)))
    if (!report.ok) {
      console.error('Packaged app boundary audit failed')
      for (const violation of report.violations.slice(0, 80)) {
        const scope = violation.scope ? `[${violation.scope}] ` : ''
        console.error(`- ${scope}${violation.path}: ${violation.reason}`)
      }
      if (report.violations.length > 80) {
        console.error(`... ${report.violations.length - 80} more violations omitted`)
      }
      process.exitCode = 1
    } else {
      if (explicitAsarPath) {
        console.log(`Packaged app.asar boundary OK: ${report.entryCount} entries`)
      } else {
        console.log(
          `Packaged app boundary OK: ${report.asarEntryCount} asar entries, ${report.resourceEntryCount} resource entries`,
        )
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
