import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { createStagedAgentCoreRuntimeProbePlan } from './probe-staged-agent-core-runtime.mjs'

describe('staged Agent Core runtime 探针的执行计划', () => {
  // 回归守卫：headless node 二进制随 claude-sdk 在 db18df09（拆旧刀5）退役，
  // 产出它的 prepare-headless-agent-runtime.mjs 已被删除。探针若还找它，
  // 在任何干净检出（= CI）上打包都会在这一步挂——本机只是因为 build/ 里
  // 躺着从未清理的旧产物才一直「过」。
  test('用当前 Node 可执行文件，不再依赖已退役的 headless runtime', () => {
    const plan = createStagedAgentCoreRuntimeProbePlan({ root: '/tmp/narracat-probe-plan' })
    expect(plan.nodePath).toBe(process.execPath)
    expect(JSON.stringify(plan)).not.toContain('NarraCatAgentRuntime')
    expect(JSON.stringify(plan)).not.toContain('agent-runtime')
  })

  test('其余三条路径仍指向暂存树与构建期模型目录', () => {
    const root = '/tmp/narracat-probe-plan'
    const plan = createStagedAgentCoreRuntimeProbePlan({ root })
    expect(plan.selftestPath).toBe(
      join(root, 'build', 'NarraCatAgentCore', 'mcp-server', 'dist', 'embedding-selftest.js'),
    )
    expect(plan.mcpServerPath).toBe(join(root, 'build', 'NarraCatAgentCore', 'mcp-server', 'dist', 'index.js'))
    expect(plan.modelPath).toBe(join(root, 'build', 'embedding-model'))
  })

  test('nodePath 可注入（打包链未来若换运行时不必再改探针）', () => {
    const plan = createStagedAgentCoreRuntimeProbePlan({ root: '/tmp/x', nodePath: '/custom/node' })
    expect(plan.nodePath).toBe('/custom/node')
  })
})
