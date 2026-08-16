#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  NOVEL_MEMORY_READY_PATTERN as mcpReadyPattern,
  appendCapturedOutput,
} from './lib/novel-memory-readiness.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')
const selftestSentinel = 'NARRACAT_EMBEDDING_SELFTEST_JSON:'

// 探针用「当前正在跑打包脚本的 Node」——引擎侧 mcp-server 的 better-sqlite3 本就是
// node-ABI 构建，plain node 正是它的目标运行时（实测 node v22 / ABI 127 下 selftest
// 四项全绿；换 Electron-as-node 反而会因 ABI 145≠127 在 sqliteVec 上炸）。原先指向的
// build/agent-runtime/.../bin/node 是 claude-sdk 时代随包分发的 headless node，已在
// db18df09（拆旧刀5）退役、产出脚本被删；继续找它会让任何干净检出（= CI）在打包这一步
// 直接挂——本机此前只是靠 build/ 里从未清理的旧产物才一直「过」。
// 顺带天然跨平台：Windows 档不必再为 node.exe 分叉。
export function createStagedAgentCoreRuntimeProbePlan({ root = repoRoot, nodePath = process.execPath } = {}) {
  return {
    nodePath,
    selftestPath: join(root, 'build', 'NarraCatAgentCore', 'mcp-server', 'dist', 'embedding-selftest.js'),
    mcpServerPath: join(root, 'build', 'NarraCatAgentCore', 'mcp-server', 'dist', 'index.js'),
    modelPath: join(root, 'build', 'embedding-model'),
  }
}

function assertExists(path, label) {
  if (!existsSync(path)) throw new Error(`${label} 不存在：${path}`)
}

export function runStagedEmbeddingSelfTest({ root = repoRoot } = {}) {
  const { nodePath, selftestPath, modelPath } = createStagedAgentCoreRuntimeProbePlan({ root })
  assertExists(selftestPath, 'Staged embedding selftest')
  assertExists(modelPath, 'Embedding model directory')

  const output = execFileSync(nodePath, [selftestPath], {
    cwd: root,
    encoding: 'utf-8',
    env: {
      ...process.env,
      NARRACAT_EMBEDDING_MODEL_PATH: modelPath,
    },
    maxBuffer: 1024 * 1024 * 10,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const sentinelLine = output
    .split(/\r?\n/)
    .find((line) => line.startsWith(selftestSentinel))
  if (!sentinelLine) throw new Error('Staged embedding selftest 未输出结构化结果')

  const report = JSON.parse(sentinelLine.slice(selftestSentinel.length))
  if (!report.ok) {
    throw new Error(`Staged embedding selftest failed: ${JSON.stringify(report)}`)
  }

  console.log(
    `Staged embedding selftest OK: ${report.embed?.dim ?? 'unknown'}d, ${report.embed?.durationMs ?? 'unknown'}ms`,
  )
  return report
}

export async function runStagedMcpStartupProbe({ root = repoRoot, timeoutMs = 10_000 } = {}) {
  const { nodePath, mcpServerPath, modelPath } = createStagedAgentCoreRuntimeProbePlan({ root })
  assertExists(mcpServerPath, 'Staged NovelMemory MCP server')
  assertExists(modelPath, 'Embedding model directory')

  const projectRoot = await mkdtemp(join(tmpdir(), 'narracat-staged-runtime-probe-'))
  const configDir = join(projectRoot, '.narracat')
  const configPath = join(configDir, 'config.yaml')
  await mkdir(configDir, { recursive: true })
  await writeFile(configPath, 'novel_id: staged-runtime-probe\n', 'utf8')

  try {
    await new Promise((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      let settled = false
      let child

      const settle = (error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (child && !child.killed) child.kill('SIGTERM')
        if (error) reject(error)
        else resolve()
      }

      const timeout = setTimeout(() => {
        settle(
          new Error(
            `Staged NovelMemory MCP server did not report readiness within ${timeoutMs}ms.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          ),
        )
      }, timeoutMs)

      child = spawn(nodePath, [mcpServerPath], {
        cwd: root,
        env: {
          ...process.env,
          NOVEL_CONFIG_PATH: configPath,
          NARRACAT_EMBEDDING_MODEL_PATH: modelPath,
        },
        shell: false,
        stdio: 'pipe',
        windowsHide: true,
      })

      child.stdout.on('data', (chunk) => {
        stdout = appendCapturedOutput(stdout, chunk)
      })
      child.stderr.on('data', (chunk) => {
        stderr = appendCapturedOutput(stderr, chunk)
        if (mcpReadyPattern.test(stderr)) settle()
      })
      child.once('error', (error) => {
        settle(error)
      })
      child.once('close', (exitCode, signal) => {
        if (!settled) {
          settle(
            new Error(
              `Staged NovelMemory MCP server exited before readiness (exit=${exitCode}, signal=${signal}).\nstdout:\n${stdout}\nstderr:\n${stderr}`,
            ),
          )
        }
      })
      child.stdin.end()
    })

    console.log('Staged NovelMemory MCP startup probe OK')
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
}

export async function runStagedAgentCoreRuntimeProbe({ root = repoRoot } = {}) {
  const selftestReport = runStagedEmbeddingSelfTest({ root })
  await runStagedMcpStartupProbe({ root })
  console.log('Staged Agent Core runtime probe OK')
  return selftestReport
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runStagedAgentCoreRuntimeProbe()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
