import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { npmBin } from './npm-bin.mjs'

const scriptsDir = import.meta.dirname

describe('npm 可执行文件名跨平台解析', () => {
  test('Windows 用 npm.cmd，其余平台用 npm', () => {
    expect(npmBin('win32')).toBe('npm.cmd')
    expect(npmBin('darwin')).toBe('npm')
    expect(npmBin('linux')).toBe('npm')
  })

  test('省略参数时跟随当前进程平台', () => {
    expect(npmBin()).toBe(process.platform === 'win32' ? 'npm.cmd' : 'npm')
  })

  // 回归守卫：execFile/spawn 不走 shell，任何一处漏用 npmBin() 都会在 Windows 上
  // 报 `spawn npm ENOENT`，而 mac/Linux 上全绿——本机跑测试永远发现不了。
  // 扫源码是唯一能在 mac 上拦住它的办法。
  test('打包链脚本不得直接把裸 npm 传给 execFile', () => {
    for (const fileName of ['prepare-narracat-agent-core.mjs', 'stage-narracat-agent-core.mjs']) {
      const source = readFileSync(join(scriptsDir, fileName), 'utf8')
      expect(source).not.toMatch(/execFileAsync\(\s*['"]npm['"]/)
      expect(source).not.toMatch(/execFileSync\(\s*['"]npm['"]/)
    }
  })
})
