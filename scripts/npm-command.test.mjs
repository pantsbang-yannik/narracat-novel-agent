import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { npmCommand } from './npm-command.mjs'

const scriptsDir = import.meta.dirname

describe('npm 调用形态跨平台解析', () => {
  // Node 官方文档：.bat/.cmd 不能用 execFile 启动。传裸 npm 是 ENOENT，
  // 传 npm.cmd 是 EINVAL——必须由 cmd.exe 代为执行。
  test('Windows 走 cmd.exe /c，参数保持数组形态', () => {
    expect(npmCommand(['ci', '--omit=dev'], 'win32')).toEqual({
      command: 'cmd.exe',
      args: ['/c', 'npm', 'ci', '--omit=dev'],
    })
  })

  test('其余平台直接调 npm，参数原样', () => {
    expect(npmCommand(['ci', '--omit=dev'], 'darwin')).toEqual({ command: 'npm', args: ['ci', '--omit=dev'] })
    expect(npmCommand(['prune'], 'linux')).toEqual({ command: 'npm', args: ['prune'] })
  })

  test('省略平台参数时跟随当前进程', () => {
    const { command } = npmCommand(['ci'])
    expect(command).toBe(process.platform === 'win32' ? 'cmd.exe' : 'npm')
  })

  test('不修改传入的参数数组', () => {
    const args = ['ci']
    npmCommand(args, 'win32')
    expect(args).toEqual(['ci'])
  })

  // 回归守卫：这个坑 mac/Linux 上永远全绿，本机跑测试发现不了，只能靠扫源码拦。
  test('打包链脚本不得把 npm 或 npm.cmd 直接传给 execFile', () => {
    for (const fileName of ['prepare-narracat-agent-core.mjs', 'stage-narracat-agent-core.mjs']) {
      const source = readFileSync(join(scriptsDir, fileName), 'utf8')
      expect(source).not.toMatch(/execFileAsync\(\s*['"]npm(\.cmd)?['"]/)
      expect(source).not.toMatch(/execFileSync\(\s*['"]npm(\.cmd)?['"]/)
    }
  })
})
