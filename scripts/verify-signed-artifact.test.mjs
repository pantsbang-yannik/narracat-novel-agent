import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { DEFAULT_APP_PATH, parseCodesignOutput, parseSpctlOutput, verifySignedArtifact } from './verify-signed-artifact.mjs'

// 以下夹具是 2026-08-10 在本机对真实打包产物实测抓取的逐字拷贝（codesign/spctl 均打到 stderr）。
// 教训：手编夹具曾经掩盖了 parseCodesignOutput 的行首锚定 bug（真实输出里 flags= 不在行首）
// 和 parseSpctlOutput 的大小写侥幸 bug（Unnotarized 恰好没被 /Notarized/ 命中纯属运气）。
// 改动这几个函数前，请用下面同样的命令对一份已知状态（已签名/未公证）的产物重新实测，
// 不要凭记忆手编——手编夹具测不出真实解析 bug。
// 家目录绝对路径统一替换成 /tmp/narracat-decktop 占位（避免真实本机路径随公开镜像仓外发），
// 其余内容——包括证书哈希/Team ID/签名人姓名，这些随签名本就公开——原样保留真实输出。

// codesign -dv --verbose=4 <已签名产物>
const CODESIGN_DV_OK = `Executable=/tmp/narracat-decktop/dist/mac-arm64/NarraCat.app/Contents/MacOS/NarraCat
Identifier=app.narracat.desktop
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20500 size=448 flags=0x10000(runtime) hashes=3+7 location=embedded
Executable Segment flags=0x1
Signature size=8975
Authority=Developer ID Application: Example Developer (TEAM123456)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
Sealed Resources version=2 rules=13 files=0
`

// 手编：CodeDirectory 行里没有 runtime flag（用于证明 hasRuntimeFlag 判定不是恒真）。
const CODESIGN_DV_NO_RUNTIME = `Executable=/tmp/NarraCat.app/Contents/MacOS/NarraCat
Identifier=app.narracat.desktop
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20500 size=448 flags=0x0(none) hashes=3+7 location=embedded
Executable Segment flags=0x1
Signature size=8975
Authority=Developer ID Application: Example Developer (TEAM123456)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
Sealed Resources version=2 rules=13 files=0
`

const CODESIGN_DV_AD_HOC = `Executable=/tmp/NarraCat.app/Contents/MacOS/NarraCat
Identifier=app.narracat.desktop
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20500 size=1234 flags=0x2(adhoc) hashes=1+2 location=embedded
Signature=adhoc
`

// 手编陷阱夹具：故意让「非 CodeDirectory 行」也带上 runtime 字样，
// 用来证明解析只认 CodeDirectory 行的 flags，不会被其他行诱导误判。
const CODESIGN_DV_TRAP_NON_CODEDIRECTORY_RUNTIME = `Executable=/tmp/NarraCat.app/Contents/MacOS/NarraCat
Identifier=app.narracat.desktop
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20500 size=448 flags=0x0(none) hashes=3+7 location=embedded
Executable Segment flags=0x10000(runtime)
Authority=Developer ID Application: Example Developer (TEAM123456)
`

// spctl -a -vvv -t install <未公证产物>（本机 dist/mac-arm64/NarraCat.app 实测，2026-08-10）
const SPCTL_UNNOTARIZED = `dist/mac-arm64/NarraCat.app: rejected
source=Unnotarized Developer ID
origin=Developer ID Application: Example Developer (TEAM123456)
`

// spctl -a -vvv -t exec <app>（已公证+已装订产物实测，2026-08-10，逐字拷贝）
const SPCTL_ACCEPTED_NOTARIZED = `/tmp/gk-test/NarraCat.app: accepted
source=Notarized Developer ID
origin=Developer ID Application: Example Developer (TEAM123456)
`

// 手编：因其他原因被拒（非 Unnotarized），用于验证 rejected 时 accepted/notarized 都应为 false。
const SPCTL_REJECTED = `/tmp/NarraCat.app: rejected
source=no usable signature
`

// xcrun stapler validate <已装订 dmg>（实测，2026-08-10，逐字拷贝）
const STAPLER_VALIDATE_STAPLED = `Processing: /tmp/narracat-decktop/dist/NarraCat-0.1.1869-mac-arm64.dmg
The validate action worked!
`

// xcrun stapler validate <未装订 dmg>（实测，2026-08-10，逐字拷贝；进程退出码非 0）
const STAPLER_VALIDATE_MISSING = `Processing: /tmp/narracat-decktop/dist/NarraCat-0.1.1868-mac-arm64.dmg
NarraCat-0.1.1868-mac-arm64.dmg does not have a ticket stapled to it.
`

describe('parseCodesignOutput', () => {
  test('真实已签名产物：从 CodeDirectory 行解出 hasRuntimeFlag=true，且 Authority 正确（回归：flags= 不在行首）', () => {
    expect(parseCodesignOutput(CODESIGN_DV_OK)).toEqual({
      authority: 'Developer ID Application: Example Developer (TEAM123456)',
      hasRuntimeFlag: true,
    })
  })

  test('ad-hoc 签名解析不出 Developer ID Authority', () => {
    expect(parseCodesignOutput(CODESIGN_DV_AD_HOC).authority).toBeNull()
  })

  test('CodeDirectory 行的 flags 不含 runtime 时 hasRuntimeFlag 为 false（证明判定不是恒真）', () => {
    expect(parseCodesignOutput(CODESIGN_DV_NO_RUNTIME)).toEqual({
      authority: 'Developer ID Application: Example Developer (TEAM123456)',
      hasRuntimeFlag: false,
    })
  })

  test('不会被 CodeDirectory 之外的行诱导误判（Executable Segment 等行即便带 runtime 字样也不算数）', () => {
    expect(parseCodesignOutput(CODESIGN_DV_TRAP_NON_CODEDIRECTORY_RUNTIME)).toEqual({
      authority: 'Developer ID Application: Example Developer (TEAM123456)',
      hasRuntimeFlag: false,
    })
  })

  test('空输出不抛错，字段落空', () => {
    expect(parseCodesignOutput('')).toEqual({ authority: null, hasRuntimeFlag: false })
    expect(parseCodesignOutput(undefined)).toEqual({ authority: null, hasRuntimeFlag: false })
  })
})

describe('parseSpctlOutput', () => {
  test('已公证：accepted + source=Notarized Developer ID 都满足', () => {
    expect(parseSpctlOutput(SPCTL_ACCEPTED_NOTARIZED)).toEqual({ accepted: true, notarized: true })
  })

  test('真实未公证产物：rejected + source=Unnotarized Developer ID，两项皆 false（钉死 Unnotarized 不得被误判为 Notarized——旧正则只因大小写不同才侥幸没把它当成已公证）', () => {
    expect(parseSpctlOutput(SPCTL_UNNOTARIZED)).toEqual({ accepted: false, notarized: false })
  })

  test('rejected（其他原因，如签名本身无效）时两项皆 false', () => {
    expect(parseSpctlOutput(SPCTL_REJECTED)).toEqual({ accepted: false, notarized: false })
  })
})

describe('verifySignedArtifact 组装逻辑（注入 stub exec，不依赖本机真有打包产物）', () => {
  function stubExec(responses) {
    return (command, args) => {
      const key = `${command} ${args[0]}`
      const response = responses[key]
      if (!response) throw new Error(`unexpected exec call: ${key}`)
      return response
    }
  }

  test('默认档（不带 --notarized）：签名通过即返回，不跑 spctl/stapler', () => {
    let spctlCalled = false
    const exec = (command, args) => {
      if (command === 'spctl' || command === 'xcrun') spctlCalled = true
      if (command === 'codesign' && args[0] === '-dv') return { stdout: '', stderr: CODESIGN_DV_OK, status: 0 }
      if (command === 'codesign' && args[0] === '--verify') return { stdout: '', stderr: '', status: 0 }
      throw new Error(`unexpected exec call: ${command} ${args.join(' ')}`)
    }

    const result = verifySignedArtifact({ appPath: '/tmp/NarraCat.app', notarized: false, exec })
    expect(result).toEqual({
      authority: 'Developer ID Application: Example Developer (TEAM123456)',
      hasRuntimeFlag: true,
      notarized: false,
    })
    expect(spctlCalled).toBe(false)
  })

  test('Authority 不是 Developer ID 时抛出说明性错误', () => {
    const exec = stubExec({
      'codesign -dv': { stdout: '', stderr: CODESIGN_DV_AD_HOC, status: 0 },
    })
    expect(() => verifySignedArtifact({ appPath: '/tmp/NarraCat.app', exec })).toThrow(/Authority 不是 Developer ID Application/)
  })

  test('flags 不含 runtime 时抛出说明性错误（证明 hardened runtime 真生效）', () => {
    const exec = stubExec({
      'codesign -dv': { stdout: '', stderr: CODESIGN_DV_NO_RUNTIME, status: 0 },
    })
    expect(() => verifySignedArtifact({ appPath: '/tmp/NarraCat.app', exec })).toThrow(/Hardened Runtime 未生效/)
  })

  test('codesign --verify 非零退出时抛出说明性错误', () => {
    const exec = stubExec({
      'codesign -dv': { stdout: '', stderr: CODESIGN_DV_OK, status: 0 },
      'codesign --verify': { stdout: '', stderr: 'invalid signature', status: 1 },
    })
    expect(() => verifySignedArtifact({ appPath: '/tmp/NarraCat.app', exec })).toThrow(/签名完整性校验失败/)
  })

  test('--notarized：签名+公证+装订全过', () => {
    const exec = stubExec({
      'codesign -dv': { stdout: '', stderr: CODESIGN_DV_OK, status: 0 },
      'codesign --verify': { stdout: '', stderr: '', status: 0 },
      'spctl -a': { stdout: '', stderr: SPCTL_ACCEPTED_NOTARIZED, status: 0 },
      'xcrun stapler': { stdout: '', stderr: '', status: 0 },
    })
    // 必须显式传 dmgPath：不传会让 verifySignedArtifact 内部退到 resolveDmgPath 的自动扫描分支，
    // 那个分支会 readdirSync 真实 dist/ 目录——在没有 dist/ 的干净 clone / CI 里必挂。
    // 这里的 exec 已被 stub，具体路径值不影响断言，传假路径即可保持这条用例真正不依赖本机产物。
    const result = verifySignedArtifact({ appPath: '/tmp/NarraCat.app', dmgPath: '/tmp/NarraCat.dmg', notarized: true, exec })
    expect(result.notarized).toBe(true)
  })

  test('--notarized：spctl 未同时满足 accepted + Notarized 时抛出说明性错误', () => {
    const exec = stubExec({
      'codesign -dv': { stdout: '', stderr: CODESIGN_DV_OK, status: 0 },
      'codesign --verify': { stdout: '', stderr: '', status: 0 },
      'spctl -a': { stdout: '', stderr: SPCTL_REJECTED, status: 3 },
    })
    expect(() => verifySignedArtifact({ appPath: '/tmp/NarraCat.app', notarized: true, exec })).toThrow(/公证校验失败/)
  })

  test('--notarized：stapler 非零退出时抛出说明性错误（票据未装订）', () => {
    const exec = stubExec({
      'codesign -dv': { stdout: '', stderr: CODESIGN_DV_OK, status: 0 },
      'codesign --verify': { stdout: '', stderr: '', status: 0 },
      'spctl -a': { stdout: '', stderr: SPCTL_ACCEPTED_NOTARIZED, status: 0 },
      'xcrun stapler': { stdout: '', stderr: '', status: 65 },
    })
    expect(() => verifySignedArtifact({ appPath: '/tmp/NarraCat.app', notarized: true, exec })).toThrow(/票据装订校验失败/)
  })
})

describe('DEFAULT_APP_PATH', () => {
  test('默认验证目标是 dist/mac-arm64/NarraCat.app', () => {
    expect(DEFAULT_APP_PATH.endsWith('dist/mac-arm64/NarraCat.app')).toBe(true)
  })
})

describe('verifySignedArtifact：dmg 容器校验（electron-builder 不公证 dmg，须补验）', () => {
  function stubExecWithDmg({ dmgSpctlStderr, dmgSpctlStatus = 0, dmgStaplerStatus = 0, dmgStaplerStderr = '' }) {
    return (command, args) => {
      if (command === 'codesign' && args[0] === '-dv') return { stdout: '', stderr: CODESIGN_DV_OK, status: 0 }
      if (command === 'codesign' && args[0] === '--verify') return { stdout: '', stderr: '', status: 0 }
      if (command === 'spctl' && args.includes(DEFAULT_APP_PATH)) {
        return { stdout: '', stderr: SPCTL_ACCEPTED_NOTARIZED, status: 0 }
      }
      if (command === 'xcrun' && args[0] === 'stapler' && args.includes(DEFAULT_APP_PATH)) {
        return { stdout: '', stderr: '', status: 0 }
      }
      if (command === 'spctl' && args.includes('/tmp/NarraCat.dmg')) {
        return { stdout: '', stderr: dmgSpctlStderr, status: dmgSpctlStatus }
      }
      if (command === 'xcrun' && args[0] === 'stapler' && args.includes('/tmp/NarraCat.dmg')) {
        return { stdout: '', stderr: dmgStaplerStderr, status: dmgStaplerStatus }
      }
      throw new Error(`unexpected exec call: ${command} ${args.join(' ')}`)
    }
  }

  test('app + dmg 全过：返回结果里带上解析出的 dmgPath', () => {
    const exec = stubExecWithDmg({ dmgSpctlStderr: SPCTL_ACCEPTED_NOTARIZED, dmgStaplerStderr: STAPLER_VALIDATE_STAPLED })
    const result = verifySignedArtifact({ appPath: DEFAULT_APP_PATH, dmgPath: '/tmp/NarraCat.dmg', notarized: true, exec })
    expect(result).toEqual({
      authority: 'Developer ID Application: Example Developer (TEAM123456)',
      hasRuntimeFlag: true,
      notarized: true,
      dmgPath: '/tmp/NarraCat.dmg',
    })
  })

  test('dmg 未同时满足 accepted + Notarized 时抛出说明性错误（app 自身校验通过不能掩盖 dmg 未处理）', () => {
    const exec = stubExecWithDmg({ dmgSpctlStderr: SPCTL_REJECTED, dmgSpctlStatus: 3 })
    expect(() =>
      verifySignedArtifact({ appPath: DEFAULT_APP_PATH, dmgPath: '/tmp/NarraCat.dmg', notarized: true, exec }),
    ).toThrow(/dmg 容器公证校验失败/)
  })

  test('dmg 票据未装订时抛出说明性错误', () => {
    const exec = stubExecWithDmg({
      dmgSpctlStderr: SPCTL_ACCEPTED_NOTARIZED,
      dmgStaplerStatus: 65,
      dmgStaplerStderr: STAPLER_VALIDATE_MISSING,
    })
    expect(() =>
      verifySignedArtifact({ appPath: DEFAULT_APP_PATH, dmgPath: '/tmp/NarraCat.dmg', notarized: true, exec }),
    ).toThrow(/dmg 票据装订校验失败/)
  })

  test('找不到 dmg 时 fail-loud，不静默跳过（自动检测目录为空）', async () => {
    const emptyDistDir = await mkdtemp(join(tmpdir(), 'narracat-verify-dmg-empty-'))
    try {
      const exec = stubExecWithDmg({ dmgSpctlStderr: SPCTL_ACCEPTED_NOTARIZED, dmgStaplerStderr: STAPLER_VALIDATE_STAPLED })
      expect(() =>
        verifySignedArtifact({ appPath: DEFAULT_APP_PATH, distDir: emptyDistDir, notarized: true, exec }),
      ).toThrow(/未找到任何 \.dmg 文件/)
    } finally {
      await rm(emptyDistDir, { recursive: true, force: true })
    }
  })

  test('默认档（不带 --notarized）不校验 dmg，找不到 dmg 也不报错', () => {
    const exec = (command, args) => {
      if (command === 'codesign' && args[0] === '-dv') return { stdout: '', stderr: CODESIGN_DV_OK, status: 0 }
      if (command === 'codesign' && args[0] === '--verify') return { stdout: '', stderr: '', status: 0 }
      throw new Error(`unexpected exec call: ${command} ${args.join(' ')}`)
    }
    const result = verifySignedArtifact({ appPath: DEFAULT_APP_PATH, notarized: false, exec })
    expect(result.notarized).toBe(false)
    expect(result.dmgPath).toBeUndefined()
  })
})
