import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { auditNarraCatPromptDrift, formatPromptDriftReport } from './audit-narracat-prompts.mjs'

const lock = {
  upstream: {
    repo: 'upstream-org/NarraCat',
    commit: '7288b30ce6dc9e41d5efc0c81bb763cb945e3b22',
    manifestVersion: '3.10.22',
  },
}

async function makePluginRoot(version = '3.10.22') {
  const root = await mkdtemp(join(tmpdir(), 'narracat-prompt-audit-'))
  await mkdir(join(root, '.claude-plugin'), { recursive: true })
  await writeFile(
    join(root, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'narracat', version }),
    'utf-8',
  )
  // 阶段2切片④：readManifestVersion/hasManifest 判据切到自有清单，夹具须同步声明
  // narracat.manifest.json，否则测试环境下这两个函数永远落入 catch 分支返回 'missing'，
  // 对"读到真文件返回真版本号"这条路径失去区分力。
  await writeFile(
    join(root, 'narracat.manifest.json'),
    JSON.stringify({ name: 'narracat', version }),
    'utf-8',
  )
  return root
}

async function writePrompt(root, relativePath, content) {
  const path = join(root, relativePath)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf-8')
}

describe('audit-narracat-prompts', () => {
  test('reports prompt drift by resource root and separates runtime wrapper notes', async () => {
    const source = await makePluginRoot()
    const destination = await makePluginRoot()

    await writePrompt(source, 'commands/setup.md', 'upstream setup\n')
    await writePrompt(destination, 'commands/setup.md', 'client setup patch\n')
    await writePrompt(source, 'commands/world.md', 'world\n')
    await writePrompt(destination, 'commands/status.md', 'client-only status\n')
    await writePrompt(source, 'agents/chapter-writer.md', 'same\n')
    await writePrompt(destination, 'agents/chapter-writer.md', 'same\n')
    await writePrompt(source, 'skills/novel/SKILL.md', 'same skill\n')
    await writePrompt(destination, 'skills/novel/SKILL.md', 'same skill\n')

    const report = auditNarraCatPromptDrift({ source, destination, lock })
    const formatted = formatPromptDriftReport(report)

    // 锁死 readManifestVersion 真的读到了 narracat.manifest.json 里的版本号，
    // 而不是静默落入 catch 分支返回 'missing'（fixture 未跟判据切换更新时会退化成这样）。
    expect(report.sourceVersion).toBe('3.10.22')
    expect(report.destinationVersion).toBe('3.10.22')
    expect(formatted).toContain('Source: ')
    expect(formatted).toContain('(3.10.22)')

    expect(report.driftCount).toBe(3)
    expect(report.roots.find((root) => root.root === 'commands')).toMatchObject({
      changed: ['commands/setup.md'],
      missing: ['commands/world.md'],
      added: ['commands/status.md'],
      identical: false,
    })
    expect(report.roots.find((root) => root.root === 'agents')?.identical).toBe(true)
    expect(report.roots.find((root) => root.root === 'skills')?.identical).toBe(true)
    expect(formatted).toContain('changed: commands/setup.md')
    expect(formatted).toContain('missing in destination: commands/world.md')
    expect(formatted).toContain('added in destination: commands/status.md')
    expect(formatted).toContain('Runtime Wrapper Notes')
    expect(formatted).toContain('Task(...) agent names to narracat:*')
  })
})
