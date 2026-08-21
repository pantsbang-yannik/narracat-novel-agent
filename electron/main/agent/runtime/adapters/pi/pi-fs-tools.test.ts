import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPortableFindTool } from './pi-fs-tools.ts'

/**
 * pi 内置 find 依赖 fd 二进制：先查系统 PATH，找不到就去 GitHub Releases 下载。
 * 两条路在生产上都不通——macOS 从 Finder 启动的 App 继承 launchd 的窄 PATH（不含
 * /opt/homebrew/bin），而目标用户（网文作者）机器上本来就没有 fd，GitHub 下载对
 * 国内用户更是基本不可达。真机打包版实测 find 一半调用直接报
 * 「fd is not available and could not be downloaded」。
 *
 * 本模块用 Node 内置 fs.glob 提供 FindOperations，复用 pi 自己的
 * createFindToolDefinition，只换底层实现——schema / 描述 / 输出格式全部不动，零漂移。
 */

let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'narracat-find-'))
  mkdirSync(join(root, 'manuscript', 'vol-01'), { recursive: true })
  mkdirSync(join(root, 'bible', 'characters'), { recursive: true })
  mkdirSync(join(root, '.narracat', 'staging'), { recursive: true })
  mkdirSync(join(root, 'node_modules', 'junk'), { recursive: true })
  writeFileSync(join(root, 'manuscript', 'vol-01', 'ch-001.md'), '第一章')
  writeFileSync(join(root, 'manuscript', 'vol-01', 'ch-002.md'), '第二章')
  writeFileSync(join(root, 'bible', 'characters', 'su-jian.md'), '苏见')
  writeFileSync(join(root, '.narracat', 'staging', 'ch-021.md'), '任务书')
  writeFileSync(join(root, 'node_modules', 'junk', 'noise.md'), '不该出现')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

async function runFind(pattern: string, path?: string): Promise<string> {
  const tool = createPortableFindTool(root)
  const result = await tool.execute(
    'call-1',
    { pattern, ...(path === undefined ? {} : { path }) } as never,
    undefined,
    undefined,
    undefined,
  )
  const first = result.content[0]
  return first && first.type === 'text' ? first.text : ''
}

describe('createPortableFindTool（不依赖 fd 的 find）', () => {
  test('工具名与内置 find 一致——同名才能覆盖掉依赖 fd 的那个', () => {
    expect(createPortableFindTool(root).name).toBe('find')
  })

  test('递归匹配章节文件', async () => {
    const text = await runFind('**/ch-*.md')
    expect(text).toContain('manuscript/vol-01/ch-001.md')
    expect(text).toContain('manuscript/vol-01/ch-002.md')
  })

  test('返回相对搜索根的路径，不泄露本机绝对路径', async () => {
    const text = await runFind('**/ch-*.md')
    expect(text).not.toContain(root)
    expect(text).not.toContain(tmpdir())
    for (const line of text.split('\n').filter(Boolean)) {
      expect(line.startsWith('/')).toBe(false)
    }
  })

  test('能搜到隐藏目录里的任务书（.narracat 是引擎的工作区，不能被当成隐藏文件跳过）', async () => {
    const text = await runFind('**/staging/*.md')
    expect(text).toContain('.narracat/staging/ch-021.md')
  })

  test('限定子目录搜索时，路径相对该子目录', async () => {
    const text = await runFind('*.md', 'bible/characters')
    expect(text).toContain('su-jian.md')
    expect(text).not.toContain('bible/characters/su-jian.md')
  })

  test('排除 node_modules', async () => {
    const text = await runFind('**/*.md')
    expect(text).not.toContain('noise.md')
  })

  test('无匹配时给出明确结果，不是报错', async () => {
    const text = await runFind('**/*.does-not-exist')
    expect(text).toContain('No files found')
  })

  test('搜索路径不存在时报错，而不是静默返回空', async () => {
    await expect(runFind('*.md', 'no/such/dir')).rejects.toThrow()
  })
})
