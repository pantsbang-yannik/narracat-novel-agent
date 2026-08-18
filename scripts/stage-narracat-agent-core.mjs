#!/usr/bin/env node
// 把已 prepare 好的 NarraCat Agent Core 按「默认拒绝白名单」过滤进 build/NarraCatAgentCore，
// 供 electron-builder 的 extraResources 打包。根因修复：原 extraResources 直指 agent-core/narracat
// 源目录、把 eval/CHANGELOG/docs/CLAUDE.md/CONTEXT.md/测试/mcp-server 源码等研发痕迹一并外发
// （明文、可"显示包内容"读取）。白名单只放运行时真正引用的资源（见 ADR-0026 / CONTEXT 分发资产分级）。
import { execFile } from 'node:child_process'
import { cp, mkdir, readdir, readFile, readlink, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { npmCommand } from './npm-command.mjs'

const execFileAsync = promisify(execFile)
const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')

export const STAGED_AGENT_CORE_DIR = join('build', 'NarraCatAgentCore')
export const PRUNED_MCP_NODE_MODULE_DIR_NAMES = new Set([
  '__tests__',
  'benchmark',
  'benchmarks',
  'doc',
  'docs',
  'example',
  'examples',
  'test',
  'tests',
])

// 运行时真正引用的内部目录（白名单根）。审计来源：
// - 引擎诊断：narracat.manifest.json（自有契约 SSOT，App 发现探针）
//   + agents / commands / skills / schemas / templates
// - 运行时 prompt `${CLAUDE_PLUGIN_ROOT}/` 引用：docs/contracts、templates、skills/*/references
//   （真人范例语料已迁往官方只读语料服务（私有仓），不再随包分发，2026-08-05）
//   （引擎 hooks/ 已随 claude-sdk 退役整目录删除：钩子判据 TS 化住在 App 侧 electron/main/engine/，
//   经 pi 扩展挂载，不再有随包分发的 shell 钩子）
// - NovelMemory MCP 运行：mcp-server/dist + mcp-server/node_modules（生产依赖，prepare 已 prune）
// - 能力包发现：pack-resolver 按 dist/packs/pack-resolver.js 的相对路径回溯到 agent-core/narracat/packs
//   （官方基础包 packs/official-base/pack.json，B2 第一刀，ADR-0034）
// - 造包中心预览资产：authoring.js 按 dist/packs/authoring.js 的相对路径回溯到 mcp-server/authoring
//   （典型情境/声音画像集，故意不放进 agent-core/narracat/packs/——那是 pack-resolver 扫描根，无 pack.json
//   的子目录会被当「能力包读取失败」污染 notes，T1 评审修复波已迁移，刀3）
const ALLOW_DIR_PREFIXES = [
  'agents',
  'commands',
  'schemas',
  'templates',
  'skills',
  'packs',
  'docs/contracts',
  'mcp-server/dist',
  'mcp-server/node_modules',
  'mcp-server/authoring',
]

// 白名单根目录之外、仍需保留的零散文件。
const ALLOW_FILES = new Set(['narracat.manifest.json', 'package.json', 'mcp-server/package.json'])

// 打包产物绝不该出现的研发痕迹（回归守卫的黑名单锚点；与白名单互为校验）。
export const FORBIDDEN_RELATIVE_PATHS = [
  'CHANGELOG.md',
  'CLAUDE.md',
  'CONTEXT.md',
  'README.md',
  'eval',
  'docs/adr',
  'docs/plans',
  'docs/agents',
  'scripts',
]

function toPosix(relPath) {
  return relPath.split(sep).join('/').replace(/^\.\//, '').replace(/^\/+/, '')
}

function basenameOf(relPath) {
  const segments = toPosix(relPath).split('/')
  return segments[segments.length - 1] ?? ''
}

// 许可 / 版权 / 归属类文件名（含 .md 形态）：属合规义务文件，须随包保留，不得当作普通 .md 误删。
// 覆盖 LICENSE/LICENCE、COPYING、COPYRIGHT、NOTICE、PATENTS、UNLICENSE、AUTHORS，及 third-party-license 这类
// 「许可」不在词首的命名。
function isLicenseLikeFileName(fileName) {
  const stem = basenameOf(fileName).replace(/\.[^.]*$/, '')
  return /licen[cs]e|copying|copyright|notice|patents|unlicense|authors|third[-_]?party/i.test(stem)
}

export function shouldPruneMcpDistFile(relPath) {
  const base = basenameOf(relPath)
  // dist 运行时只需 .js；.d.ts 声明与 .map 源映射（.js.map / .d.ts.map）都是开发型产物，
  // 后者还会把 TS 源路径/内容明文带进分发包，须一并剪掉。
  return base.endsWith('.d.ts') || base.endsWith('.map')
}

export function hasPrunedMcpNodeModuleDirectory(relPath) {
  const segments = toPosix(relPath).split('/').filter(Boolean)
  const packageRelativeSegments = getNodeModulePackageRelativeSegments(segments)
  return packageRelativeSegments.length >= 1 && PRUNED_MCP_NODE_MODULE_DIR_NAMES.has(packageRelativeSegments[0])
}

export function shouldPruneMcpNodeModuleDirectory(relPath) {
  const segments = toPosix(relPath).split('/').filter(Boolean)
  const packageRelativeSegments = getNodeModulePackageRelativeSegments(segments)
  return packageRelativeSegments.length === 1 && PRUNED_MCP_NODE_MODULE_DIR_NAMES.has(packageRelativeSegments[0])
}

export function shouldPruneMcpNodeModuleFile(relPath) {
  const base = basenameOf(relPath)
  if (base === '') return false
  if (/^readme/i.test(base)) return true
  if (/^changelog/i.test(base)) return true
  if (base.endsWith('.d.ts.map')) return true
  if (base.endsWith('.map')) return true
  if (base.endsWith('.d.ts')) return true
  if (base.endsWith('.ts')) return true
  if (base.endsWith('.tsx')) return true
  if (base.endsWith('.tsbuildinfo')) return true
  if (base.endsWith('.md') && !isLicenseLikeFileName(base)) return true
  return false
}

function getNodeModulePackageRelativeSegments(segments) {
  if (segments.length === 0) return []
  const packageRootLength = segments[0]?.startsWith('@') ? 2 : 1
  return segments.slice(packageRootLength)
}

// onnxruntime-node 随包携带 5 个平台的预编译二进制（darwin/linux/win32 × x64/arm64），实测共 208MB。
// 本产品每个平台只发一个架构：裁掉其余的，同时缩小 mac 公证需上传给 Apple 扫描的 Mach-O 面。
// 裁剪正确性由「设置页向量健康诊断体检卡」直接证伪——裁坏则 embedding 必然失败。
//
// sharedLibExt 必须跟着平台走：darwin 是 .dylib、win32 是 .dll。只改目录名不改扩展名，
// 下面的正向断言会在 Windows 上永远失败（Windows 战役 2026-08-16）。
export const NATIVE_TARGETS = {
  darwin: { platform: 'darwin', arch: 'arm64', sharedLibExt: '.dylib' },
  win32: { platform: 'win32', arch: 'x64', sharedLibExt: '.dll' },
}

/** 解析打包目标；不认识的平台 fail-loud，绝不静默按 darwin 处理（那会裁光目标平台的二进制）。 */
export function resolveNativeTarget(platform = process.platform) {
  const target = NATIVE_TARGETS[platform]
  if (!target) {
    throw new Error(
      `不支持的打包目标平台：${platform}（当前只分发 darwin/arm64 与 win32/x64，见 Windows 战役决策 8b）`,
    )
  }
  return target
}

/**
 * 从命令行参数解析打包目标。Task 5/7/8 的脚本共用同一套 `--platform` 语义。
 *
 * `--platform` 出现但没跟值必须炸：CI 里写的是 `--platform $TARGET`，变量拼空时 argv 只剩
 * 一个裸 flag，若此时回落到「当前进程平台」，就会静默打出 darwin 包再当 Windows 包发出去——
 * embedding 在用户机上无声失效，且打包全程 exit 0（前科：issue #312/#316/#320）。
 */
export function resolveNativeTargetFromArgv(argv = process.argv) {
  const platformIndex = argv.indexOf('--platform')
  if (platformIndex === -1) return resolveNativeTarget()

  const value = argv[platformIndex + 1]
  if (!value || value.startsWith('--')) {
    throw new Error('--platform 缺少取值（用法：--platform darwin|win32；留空会静默按当前平台打包，已禁止）')
  }
  return resolveNativeTarget(value)
}

export function shouldPruneForeignPlatformBinary(relPath, target = resolveNativeTarget()) {
  const segments = toPosix(relPath).split('/').filter(Boolean)
  const packageIndex = segments.indexOf('onnxruntime-node')
  if (packageIndex === -1) return false

  const [binDir, abiDir, platform, arch] = segments.slice(packageIndex + 1)
  if (binDir !== 'bin' || abiDir !== 'napi-v3' || !platform) return false
  if (platform !== target.platform) return true
  // 目标平台目录自身放行，以便 fs.cp 递归进去后再逐个架构判定
  if (!arch) return false
  return arch !== target.arch
}

/**
 * 默认拒绝白名单谓词：给定相对 agent-core 根的路径，决定是否进入打包产物。
 * 设计为可被 fs.cp 的 filter 直接调用——对「白名单路径的祖先目录」返回 true 以允许递归。
 */
export function shouldBundleAgentCorePath(relPath, target = resolveNativeTarget()) {
  const rel = toPosix(relPath)
  if (rel === '') return true

  const segments = rel.split('/')
  const base = segments[segments.length - 1]

  // 硬丢弃（任何位置）
  if (segments.includes('.git')) return false
  if (base === '.DS_Store') return false

  // 非目标平台的预编译二进制（在 node_modules 不透明照搬之前拦下）
  if (shouldPruneForeignPlatformBinary(rel, target)) return false

  // node_modules 内部视为不透明：生产依赖已 prune，照搬，不对其套 test/__tests__ 剔除
  // （以免误删某个包运行期真需要的 test 命名文件）。
  const underNodeModules = rel === 'mcp-server/node_modules' || rel.startsWith('mcp-server/node_modules/')
  if (!underNodeModules) {
    if (/\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(base)) return false
    if (segments.includes('__tests__')) return false
  }

  // 显式白名单文件
  if (ALLOW_FILES.has(rel)) return true

  // 白名单目录自身或其后代
  for (const prefix of ALLOW_DIR_PREFIXES) {
    if (rel === prefix || rel.startsWith(`${prefix}/`)) return true
  }

  // 白名单路径的祖先目录 → 放行以便 fs.cp 递归进去（如 docs → docs/contracts、mcp-server → mcp-server/dist）
  for (const allowed of [...ALLOW_DIR_PREFIXES, ...ALLOW_FILES]) {
    if (allowed.startsWith(`${rel}/`)) return true
  }

  return false
}

// shouldPruneForeignPlatformBinary 硬编码了 `bin/napi-v3/<平台>/<架构>` 这条 ABI/平台目录路径。若 onnxruntime-node 未来
// 升级改了 ABI 目录名（如 napi-v4）：裁剪谓词全线不匹配 → 静默失效 → 5 个平台的二进制照单全收，
// 只是包变胖，无害。但若改了平台目录名，则会误裁我们需要的那份 → 静默裁过头 → embedding 在加固
// 运行时下无声失效、且无任何报错（本项目前科：issue #312/#316/#320）。这条正向断言就是防「误裁」的：
// 暂存树里必须真的还留着目标平台的 .node 与共享库（mac .dylib / win .dll），缺了就在打包这一步直接炸，
// 而不是留到用户设置页「向量健康诊断」体检卡才发现。
export async function assertBundledOnnxRuntimeNativeBinaryPresent(destination, target = resolveNativeTarget()) {
  const binaryDir = join(
    destination,
    'mcp-server',
    'node_modules',
    'onnxruntime-node',
    'bin',
    'napi-v3',
    target.platform,
    target.arch,
  )
  if (!(await pathExists(binaryDir))) {
    throw new Error(
      `暂存产物缺少 onnxruntime-node 的 ${target.platform}/${target.arch} 二进制目录：${binaryDir}` +
        '（裁剪可能裁过头，embedding 会静默失效——检查 shouldPruneForeignPlatformBinary 是否还匹配当前 onnxruntime-node 版本的目录结构）',
    )
  }
  const entries = await readdir(binaryDir)
  const hasNativeModule = entries.some((name) => name.endsWith('.node'))
  const hasSharedLib = entries.some((name) => name.endsWith(target.sharedLibExt))
  if (!hasNativeModule || !hasSharedLib) {
    throw new Error(
      `暂存产物的 onnxruntime-node ${target.platform}/${target.arch} 目录不完整（.node 存在=${hasNativeModule}，${target.sharedLibExt} 存在=${hasSharedLib}）：${binaryDir}` +
        '（裁剪可能裁过头，embedding 会静默失效）',
    )
  }
}

async function pathExists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** 回归守卫：暂存目录必须含运行时关键资产、且不含任何研发痕迹，否则 throw 中断打包。 */
export async function verifyStagedAgentCore(destination, target = resolveNativeTarget()) {
  const required = [
    'narracat.manifest.json',
    join('mcp-server', 'dist', 'index.js'),
    join('docs', 'contracts', 'world-guided.md'),
    join('templates', 'premise-template.md'),
    join('packs', 'official-base', 'pack.json'),
    join('mcp-server', 'authoring', 'typical-scenarios.json'),
    join('mcp-server', 'authoring', 'typical-voices.json'),
  ]
  for (const rel of required) {
    if (!(await pathExists(join(destination, rel)))) {
      throw new Error(`暂存后缺少运行时关键资产：${rel}（白名单或 prepare 步骤有误）`)
    }
  }

  for (const rel of FORBIDDEN_RELATIVE_PATHS) {
    if (await pathExists(join(destination, rel))) {
      throw new Error(`暂存产物混入研发痕迹：${rel}（白名单回归，禁止随包外发）`)
    }
  }

  // 运行时依赖完好 + devDependency 已剔除（prune 回归守卫）
  if (!(await pathExists(join(destination, 'mcp-server', 'node_modules', 'better-sqlite3')))) {
    throw new Error('暂存后缺少 MCP 运行时依赖 better-sqlite3（prune 误删或拷贝不全）')
  }
  if (await pathExists(join(destination, 'mcp-server', 'node_modules', 'typescript'))) {
    throw new Error('暂存产物仍含 devDependency typescript（npm prune --omit=dev 未生效，~60M 冗余随包外发）')
  }
  if (await pathExists(join(destination, 'mcp-server', 'node_modules', 'onnxruntime-web'))) {
    throw new Error('暂存产物仍含 onnxruntime-web（packaged MCP 使用 Node backend，应禁止 Web backend 随包外发）')
  }
  await assertBundledOnnxRuntimeNativeBinaryPresent(destination, target)
  const runtimePayloadViolation = await findFirstStagedRuntimePayloadViolation(destination)
  if (runtimePayloadViolation) {
    throw new Error(`暂存产物仍含 MCP runtime 开发型文件：${runtimePayloadViolation}`)
  }
  // dev 元数据绝迹：prune 回写的 lockfile 与 package.json devDependencies 字段均不得随包外发
  if (await pathExists(join(destination, 'mcp-server', 'package-lock.json'))) {
    throw new Error('暂存产物含 mcp-server/package-lock.json（列着 dev 包的 dev 痕迹，应禁止随包外发）')
  }
  const stagedManifest = JSON.parse(await readFile(join(destination, 'mcp-server', 'package.json'), 'utf-8'))
  if (stagedManifest.devDependencies) {
    throw new Error('暂存 mcp-server/package.json 仍含 devDependencies 字段（dev 痕迹未剥除）')
  }

  await assertNoAbsoluteSymlinks(destination)
}

// prepare 的 --if-missing 分支在 dist 已存在时不跑 prune，devDependencies（typescript/vitest/@types）
// 会留在 node_modules 里随包外发（约 60M）。在暂存副本里按生产依赖 prune，不碰源 dev 环境。
// 同时清除 dev 元数据：npm prune 默认会回写一份仍列着 typescript/vitest 的 package-lock.json，
// 且 package.json 的 devDependencies 字段亦属 dev 痕迹——一并剥除，使打包产物口径一致。
async function pruneStagedMcpServerDevDependencies(destination) {
  const mcpRoot = join(destination, 'mcp-server')
  const manifestPath = join(mcpRoot, 'package.json')
  if (!(await pathExists(manifestPath))) return

  // 必须走 npmCommand()：Windows 上 npm 是 npm.cmd，execFile 启动不了 .cmd（见该模块注释）。
  const npm = npmCommand(['prune', '--omit=dev', '--package-lock=false'])
  await execFileAsync(npm.command, npm.args, {
    cwd: mcpRoot,
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 10,
  })

  // 防御性删除任何 lockfile（白名单本就不收，但 npm 可能写出）
  await rm(join(mcpRoot, 'package-lock.json'), { force: true })

  // 剥掉 devDependencies 字段（运行时不读）
  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))
  if (manifest.devDependencies) {
    delete manifest.devDependencies
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
  }

  // 删除 node_modules/.bin：安装期 CLI 符号链接，bun/npm 写成指回源树的【绝对】路径，
  // 会 ① 破坏 codesign 封印致 ad-hoc 签名打包失败 ② 把本地路径泄漏进分发包
  // ③ 在用户机器上断链。运行时只 `node dist/index.js`、不调这些 CLI，故安全删除。
  // prune 在前可能重建 .bin，故此步置于 prune 之后。
  await rm(join(mcpRoot, 'node_modules', '.bin'), { recursive: true, force: true })
}

// 单次遍历收集 MCP runtime 的开发型产物（dist 声明/源映射 + node_modules 开发文件/目录 + onnxruntime-web）。
// prune 据此删除、verify 据此确认无残留——两端共用同一遍历与同一组谓词，避免「检测」与「删除」逻辑分叉。
async function collectMcpRuntimePayload(destination) {
  const mcpRoot = join(destination, 'mcp-server')
  const distFiles = []
  const nodeModuleDirs = []
  const nodeModuleFiles = []
  let onnxWebDir = null

  const mcpDist = join(mcpRoot, 'dist')
  if (await pathExists(mcpDist)) {
    for (const entry of await readdir(mcpDist, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue
      const absPath = join(entry.parentPath, entry.name)
      if (shouldPruneMcpDistFile(relative(mcpDist, absPath))) distFiles.push(absPath)
    }
  }

  const nodeModules = join(mcpRoot, 'node_modules')
  if (await pathExists(nodeModules)) {
    const onnx = join(nodeModules, 'onnxruntime-web')
    if (await pathExists(onnx)) onnxWebDir = onnx
    for (const entry of await readdir(nodeModules, { recursive: true, withFileTypes: true })) {
      const absPath = join(entry.parentPath, entry.name)
      const rel = relative(nodeModules, absPath)
      if (entry.isDirectory()) {
        if (shouldPruneMcpNodeModuleDirectory(rel)) nodeModuleDirs.push(absPath)
      } else if (entry.isFile()) {
        // 已落在待删目录内的文件随父目录一并删除，无需单列
        if (hasPrunedMcpNodeModuleDirectory(rel)) continue
        if (shouldPruneMcpNodeModuleFile(rel)) nodeModuleFiles.push(absPath)
      }
    }
  }

  return { distFiles, nodeModuleDirs, nodeModuleFiles, onnxWebDir }
}

export async function findFirstStagedRuntimePayloadViolation(destination) {
  const { distFiles, nodeModuleDirs, nodeModuleFiles } = await collectMcpRuntimePayload(destination)
  const firstViolation = distFiles[0] ?? nodeModuleDirs[0] ?? nodeModuleFiles[0] ?? null
  return firstViolation ? relative(destination, firstViolation) : null
}

export async function pruneStagedMcpRuntimePayload(destination) {
  const { distFiles, nodeModuleDirs, nodeModuleFiles, onnxWebDir } = await collectMcpRuntimePayload(destination)

  await Promise.all(distFiles.map((path) => rm(path, { force: true })))

  if (onnxWebDir) await rm(onnxWebDir, { recursive: true, force: true })

  // 深目录先删，避免父目录先删后子路径失效；删目录已连带其内文件，故文件删除放在其后。
  for (const directory of [...nodeModuleDirs].sort((a, b) => b.length - a.length)) {
    await rm(directory, { recursive: true, force: true })
  }

  await Promise.all(nodeModuleFiles.map((path) => rm(path, { force: true })))
}

// 硬守卫：暂存产物内不得有任何【绝对】符号链接（破坏 codesign + 泄漏本地路径 + 用户机器断链）。
async function assertNoAbsoluteSymlinks(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isSymbolicLink()) continue
    const linkPath = join(entry.parentPath, entry.name)
    if (isAbsolute(await readlink(linkPath))) {
      throw new Error(`暂存产物含绝对符号链接（破坏 codesign 签名 + 泄漏本地路径）：${relative(root, linkPath)}`)
    }
  }
}

export async function stageNarraCatAgentCore({ root = repoRoot, target = resolveNativeTarget() } = {}) {
  const source = join(root, 'agent-core', 'narracat')
  const destination = join(root, STAGED_AGENT_CORE_DIR)

  if (!(await pathExists(join(source, 'mcp-server', 'dist', 'index.js')))) {
    throw new Error('NarraCat MCP server 未构建：缺 mcp-server/dist/index.js（请先跑 prepare-narracat-agent-core.mjs）')
  }

  await rm(destination, { recursive: true, force: true })
  await mkdir(dirname(destination), { recursive: true })
  await cp(source, destination, {
    recursive: true,
    filter: (src) => shouldBundleAgentCorePath(relative(source, src), target),
  })

  await pruneStagedMcpServerDevDependencies(destination)
  await pruneStagedMcpRuntimePayload(destination)
  await verifyStagedAgentCore(destination, target)
  console.log(
    `NarraCat Agent Core 已按白名单暂存（目标 ${target.platform}/${target.arch}）：${source} -> ${destination}`,
  )
  return destination
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // 架构由平台唯一确定，不单独收 --arch：每个平台只发一个架构，少一个可以写歪的旋钮。
  // 参数解析放进 async 链里，让它和暂存过程共用同一个错误出口（干净一行 + exit 1），
  // 而不是在顶层同步 throw 出一坨 Node 堆栈。
  Promise.resolve()
    .then(() => stageNarraCatAgentCore({ target: resolveNativeTargetFromArgv() }))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
}
