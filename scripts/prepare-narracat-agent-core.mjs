#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { npmCommand } from './npm-command.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')
const defaultDestination = join(repoRoot, 'agent-core', 'narracat')
const versionLockPath = join(repoRoot, 'agent-core', 'narracat-agent-core.lock.json')
const execFileAsync = promisify(execFile)
const requiredMcpRuntimePackages = [
  join('@modelcontextprotocol', 'sdk'),
  'better-sqlite3',
  'sqlite-vec',
  join('@huggingface', 'transformers'),
]

function readOption(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function readFlag(name) {
  return process.argv.includes(name)
}

function uniquePaths(paths) {
  return [...new Set(paths.filter((path) => typeof path === 'string' && path.trim().length > 0))]
}

function normalizeSourcePath(path) {
  return typeof path === 'string' && path.trim().length > 0 ? resolve(path) : undefined
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function hasManifest(agentCorePath) {
  return isFile(join(agentCorePath, 'narracat.manifest.json'))
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf-8'))
}

async function readManifest(agentCorePath) {
  return readJson(join(agentCorePath, 'narracat.manifest.json'))
}


async function normalizeGitignoreForFinalImport(agentCorePath) {
  const gitignorePath = join(agentCorePath, '.gitignore')
  if (!(await isFile(gitignorePath))) return

  const content = await readFile(gitignorePath, 'utf-8')
  if (content.includes('!mcp-server/dist/**')) return

  const nextContent = [
    content.trimEnd(),
    '',
    '# NarraCat-app keeps the built MCP server entrypoint as an Agent Core runtime adapter artifact.',
    '!mcp-server/dist/',
    '!mcp-server/dist/**',
    '',
  ].join('\n')
  await writeFile(gitignorePath, nextContent, 'utf-8')
}

async function readVersionLock() {
  return readJson(versionLockPath)
}

function candidateSources(explicitSource) {
  return uniquePaths([
    normalizeSourcePath(explicitSource),
    normalizeSourcePath(process.env.NARRACAT_AGENT_CORE_SOURCE_PATH),
  ])
}

async function resolveSource(explicitSource) {
  const candidates = candidateSources(explicitSource)

  for (const candidate of candidates) {
    if (await hasManifest(candidate)) return candidate
  }

  throw new Error(
    [
      '无法定位 NarraCat Agent Core source 目录。',
      '请设置 NARRACAT_AGENT_CORE_SOURCE_PATH，或通过 --source 指定包含 narracat.manifest.json 的目录。',
      `已检查：${candidates.join(', ') || '无候选路径'}`,
    ].join('\n'),
  )
}

async function agentCoreVersion(agentCorePath) {
  try {
    const manifest = await readManifest(agentCorePath)
    return typeof manifest.version === 'string' ? manifest.version : 'missing'
  } catch {
    return 'missing'
  }
}

async function hasMcpServer(agentCorePath) {
  return isFile(join(agentCorePath, 'mcp-server', 'package.json'))
}

async function hasMcpServerBuild(agentCorePath) {
  return isFile(join(agentCorePath, 'mcp-server', 'dist', 'index.js'))
}

async function runNpmCommand({ args, cwd, label }) {
  console.log(`${label}：npm ${args.join(' ')} (${cwd})`)
  // 必须走 npmCommand()：Windows 上 npm 是 npm.cmd，execFile 启动不了 .cmd（见该模块注释）。
  const npm = npmCommand(args)
  await execFileAsync(npm.command, npm.args, {
    cwd,
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 10,
  })
}

function versionReport({ destination, destinationVersion, lock, source, sourceVersion }) {
  return [
    'NarraCat Agent Core 版本差异',
    `锁定: ${lock.version} (${lock.path})`,
    `来源: ${sourceVersion} (${join(source, lock.manifestPath)})`,
    `本地: ${destinationVersion} (${join(destination, lock.manifestPath)})`,
    `检查: ${lock.checkCommand}`,
    `更新: ${lock.updateCommand}`,
  ].join('\n')
}

async function assertVersionsMatchLock({ destination, source }) {
  const lock = await readVersionLock()
  const sourceVersion = await agentCoreVersion(source)
  const destinationVersion = await agentCoreVersion(destination)
  const matches = sourceVersion === lock.version

  if (matches) return

  throw new Error(versionReport({ destination, destinationVersion, lock, source, sourceVersion }))
}

async function checkVersions({ destination, source }) {
  const lock = await readVersionLock()
  const sourceVersion = await agentCoreVersion(source)
  const destinationVersion = await agentCoreVersion(destination)
  const matches = sourceVersion === lock.version && destinationVersion === lock.version

  if (!matches) throw new Error(versionReport({ destination, destinationVersion, lock, source, sourceVersion }))

  // 版本闸门：narracat.manifest.json（自有契约 SSOT）与 lock 的一致性：`verify:narracat-agent-core`
  // 走的正是这条 --check-version 分支，不接进来的话这条新增校验永远不会被这条发布检查单命令触发。

  console.log(`NarraCat Agent Core 版本一致：${lock.version}`)
}

async function hasMcpRuntimeDependencies(agentCorePath) {
  const mcpRoot = join(agentCorePath, 'mcp-server')
  if (!(await isFile(join(mcpRoot, 'package.json')))) return true

  for (const packagePath of requiredMcpRuntimePackages) {
    if (!(await isFile(join(mcpRoot, 'node_modules', packagePath, 'package.json')))) return false
  }

  return true
}

async function installMcpRuntimeDependencies(agentCorePath) {
  const mcpRoot = join(agentCorePath, 'mcp-server')
  if (!(await hasMcpServer(agentCorePath))) return
  if (await hasMcpRuntimeDependencies(agentCorePath)) return

  const hasPackageLock = await isFile(join(mcpRoot, 'package-lock.json'))
  const args = hasPackageLock ? ['ci', '--omit=dev'] : ['install', '--omit=dev']
  await runNpmCommand({ args, cwd: mcpRoot, label: '安装 NarraCat MCP server 运行依赖' })

  if (!(await hasMcpRuntimeDependencies(agentCorePath))) {
    throw new Error(`NarraCat MCP server 运行依赖安装后仍不完整：${mcpRoot}`)
  }
}

async function prepareMcpServer(agentCorePath) {
  if (!(await hasMcpServer(agentCorePath))) return

  const mcpRoot = join(agentCorePath, 'mcp-server')
  if (!(await hasMcpServerBuild(agentCorePath))) {
    const hasPackageLock = await isFile(join(mcpRoot, 'package-lock.json'))
    const installArgs = hasPackageLock ? ['ci'] : ['install']
    await runNpmCommand({ args: installArgs, cwd: mcpRoot, label: '安装 NarraCat MCP server 构建依赖' })
    await runNpmCommand({ args: ['run', 'build'], cwd: mcpRoot, label: '构建 NarraCat MCP server' })
    await runNpmCommand({ args: ['prune', '--omit=dev'], cwd: mcpRoot, label: '裁剪 NarraCat MCP server 运行依赖' })
  } else {
    await installMcpRuntimeDependencies(agentCorePath)
  }

  if (!(await hasMcpServerBuild(agentCorePath))) {
    throw new Error(`NarraCat MCP server 构建产物缺失：${join(mcpRoot, 'dist', 'index.js')}`)
  }

  if (!(await hasMcpRuntimeDependencies(agentCorePath))) {
    await installMcpRuntimeDependencies(agentCorePath)
  }
}

function shouldCopy(sourceRoot, sourcePath) {
  const relativePath = relative(sourceRoot, sourcePath)
  if (!relativePath) return true
  const segments = relativePath.split(sep)
  const fileName = segments[segments.length - 1] ?? ''

  return (
    !segments.includes('.git') &&
    !segments.includes('node_modules') &&
    !segments.includes('__tests__') &&
    fileName !== '.DS_Store' &&
    !fileName.endsWith('.test.ts') &&
    !fileName.endsWith('.test.tsx') &&
    !fileName.endsWith('.spec.ts') &&
    !fileName.endsWith('.spec.tsx')
  )
}

async function prepareNarraCatAgentCore() {
  const destination = resolve(readOption('--destination') ?? defaultDestination)
  const ifMissing = readFlag('--if-missing')
  const optional = readFlag('--optional')
  const checkVersion = readFlag('--check-version')
  const finalImport = readFlag('--final-import')
  const actionLabel = finalImport ? 'NarraCat Agent Core source import' : 'NarraCat Agent Core'

  if (ifMissing && (await hasManifest(destination))) {
    console.log(`${actionLabel} 已存在：${destination}`)
    if (finalImport) await normalizeGitignoreForFinalImport(destination)
    await prepareMcpServer(destination)
    return
  }

  let source
  try {
    source = checkVersion && !readOption('--source') ? destination : await resolveSource(readOption('--source'))
  } catch (error) {
    if (optional) {
      console.warn(error instanceof Error ? error.message : error)
      console.warn(`跳过 NarraCat Agent Core 准备，应用会通过诊断页提示缺失资源：${destination}`)
      return
    }

    throw error
  }

  if (checkVersion) {
    await checkVersions({ destination, source })
    return
  }

  try {
    await assertVersionsMatchLock({ destination, source })
  } catch (error) {
      if (optional) {
        console.warn(error instanceof Error ? error.message : error)
        console.warn(`跳过 NarraCat Agent Core 导入，应用会通过诊断页提示版本或资源问题：${destination}`)
        return
    }

    throw error
  }

  if (source === destination) {
    console.log(`${actionLabel} 已在目标目录：${destination}`)
    if (finalImport) await normalizeGitignoreForFinalImport(destination)
    await prepareMcpServer(destination)
    return
  }

  await rm(destination, { recursive: true, force: true })
  await mkdir(dirname(destination), { recursive: true })
  await cp(source, destination, {
    recursive: true,
    filter: (sourcePath) => shouldCopy(source, sourcePath),
  })

  if (!(await hasManifest(destination))) {
    throw new Error(`导入后仍缺少 NarraCat Agent Core 自有清单：${join(destination, 'narracat.manifest.json')}`)
  }

  if (finalImport) await normalizeGitignoreForFinalImport(destination)
  await prepareMcpServer(destination)

  console.log(`${actionLabel} 已导入：${source} -> ${destination}`)
}

prepareNarraCatAgentCore().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
