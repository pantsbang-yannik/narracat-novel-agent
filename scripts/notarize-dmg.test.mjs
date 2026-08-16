import { describe, expect, test } from 'bun:test'

import { notarizeDmg, parseNotarytoolSubmitOutput, pickLatestDmg, resolveDmgPath } from './notarize-dmg.mjs'

// xcrun notarytool submit --wait <dmg>（2026-08-10 对 dist/NarraCat-0.1.1869-mac-arm64.dmg 实测，逐字拷贝——
// 部分行含具体路径/耗时，为脱敏与稳定性去掉了时间戳细节，字段结构与真实输出一致；
// 家目录路径统一替换成 /tmp/narracat-decktop 占位，其余内容原样保留）。
const NOTARYTOOL_ACCEPTED = `Conducting pre-submission checks for NarraCat-0.1.1869-mac-arm64.dmg and initiating connection to the Apple notary service...
Submission ID received
  id: 563ee3d8-2158-42e2-9add-58e987a35028
Upload progress: 100.00% (300.5 MB of 300.5 MB)
Successfully uploaded file
  id: 563ee3d8-2158-42e2-9add-58e987a35028
  path: /tmp/narracat-decktop/dist/NarraCat-0.1.1869-mac-arm64.dmg
Waiting for processing to complete.
Processing complete
  id: 563ee3d8-2158-42e2-9add-58e987a35028
  status: Accepted
`

const NOTARYTOOL_INVALID = `Conducting pre-submission checks for NarraCat-test.dmg and initiating connection to the Apple notary service...
Submission ID received
  id: 11111111-2222-3333-4444-555555555555
Successfully uploaded file
  id: 11111111-2222-3333-4444-555555555555
Waiting for processing to complete.
Processing complete
  id: 11111111-2222-3333-4444-555555555555
  status: Invalid
`

describe('pickLatestDmg', () => {
  test('按 mtimeMs 挑最新，不按文件名字典序（版本号是提交数，1868 vs 1869 跨位数字典序会出错的场景）', () => {
    const entries = [
      { name: 'dist/NarraCat-0.1.1869-mac-arm64.dmg', mtimeMs: 200 },
      { name: 'dist/NarraCat-0.1.1868-mac-arm64.dmg', mtimeMs: 300 },
      { name: 'dist/NarraCat-0.1.9-mac-arm64.dmg', mtimeMs: 100 },
    ]
    expect(pickLatestDmg(entries).name).toBe('dist/NarraCat-0.1.1868-mac-arm64.dmg')
  })

  test('空数组时 fail-loud', () => {
    expect(() => pickLatestDmg([])).toThrow(/未找到任何 \.dmg 文件/)
    expect(() => pickLatestDmg(undefined)).toThrow(/未找到任何 \.dmg 文件/)
  })
})

describe('parseNotarytoolSubmitOutput', () => {
  test('从 Accepted 输出中解出 submissionId 与 status', () => {
    expect(parseNotarytoolSubmitOutput(NOTARYTOOL_ACCEPTED)).toEqual({
      submissionId: '563ee3d8-2158-42e2-9add-58e987a35028',
      status: 'Accepted',
    })
  })

  test('从 Invalid 输出中解出 status（用于判定失败）', () => {
    expect(parseNotarytoolSubmitOutput(NOTARYTOOL_INVALID)).toEqual({
      submissionId: '11111111-2222-3333-4444-555555555555',
      status: 'Invalid',
    })
  })

  test('空输出不抛错，字段落空', () => {
    expect(parseNotarytoolSubmitOutput('')).toEqual({ submissionId: null, status: null })
    expect(parseNotarytoolSubmitOutput(undefined)).toEqual({ submissionId: null, status: null })
  })
})

describe('resolveDmgPath', () => {
  test('传了 dmgArg 时直接用它（不扫描目录）', () => {
    expect(resolveDmgPath('/tmp/foo.dmg', '/should/not/be/read')).toBe('/tmp/foo.dmg')
  })
})

describe('notarizeDmg：组装逻辑（stub exec，不实际调用系统命令/消耗公证配额）', () => {
  const SIGNING_IDENTITY_OUTPUT = '1) A1B2C3D4E5F60718293A4B5C6D7E8F9012345678 "Developer ID Application: Example Developer (TEAM123456)"\n   1 valid identities found'
  const CREDS = { APPLE_API_KEY: '/k.p8', APPLE_API_KEY_ID: 'K1', APPLE_API_ISSUER: 'I1' }

  test('已装订则跳过（幂等），不触碰签名身份/凭证/notarytool', () => {
    const exec = (command, args) => {
      if (command === 'xcrun' && args[0] === 'stapler' && args[1] === 'validate') {
        return { status: 0, stdout: 'The validate action worked!\n', stderr: '' }
      }
      throw new Error(`unexpected exec call: ${command} ${args.join(' ')}`)
    }
    const result = notarizeDmg({ dmgPath: '/tmp/NarraCat.dmg', exec, env: {}, log: () => {} })
    expect(result).toEqual({ dmgPath: '/tmp/NarraCat.dmg', skipped: true })
  })

  test('未装订 + 缺公证凭证：fail-loud，不发起 codesign/notarytool', () => {
    const exec = (command, args) => {
      if (command === 'xcrun' && args[0] === 'stapler' && args[1] === 'validate') {
        return { status: 65, stdout: '', stderr: 'does not have a ticket stapled to it.' }
      }
      throw new Error(`unexpected exec call: ${command} ${args.join(' ')}`)
    }
    expect(() => notarizeDmg({ dmgPath: '/tmp/NarraCat.dmg', exec, env: {}, log: () => {} })).toThrow(
      /公证凭证缺失/,
    )
  })

  function fullStub({ codesignStatus = 0, notarytoolOutput = NOTARYTOOL_ACCEPTED, notarytoolStatus = 0, staplerStatus = 0, calls }) {
    return (command, args) => {
      calls?.push([command, ...args])
      if (command === 'xcrun' && args[0] === 'stapler' && args[1] === 'validate') {
        return { status: 65, stdout: '', stderr: 'does not have a ticket stapled to it.' }
      }
      if (command === 'security') {
        return { status: 0, stdout: SIGNING_IDENTITY_OUTPUT, stderr: '' }
      }
      if (command === 'codesign') {
        return { status: codesignStatus, stdout: '', stderr: codesignStatus === 0 ? '' : 'codesign failed' }
      }
      if (command === 'xcrun' && args[0] === 'notarytool') {
        return { status: notarytoolStatus, stdout: notarytoolOutput, stderr: '' }
      }
      if (command === 'xcrun' && args[0] === 'stapler' && args[1] === 'staple') {
        return { status: staplerStatus, stdout: '', stderr: staplerStatus === 0 ? '' : 'staple failed' }
      }
      throw new Error(`unexpected exec call: ${command} ${args.join(' ')}`)
    }
  }

  test('全链路成功：签名哈希来自 security 输出解析，三步依次执行', () => {
    const exec = fullStub({})
    const result = notarizeDmg({ dmgPath: '/tmp/NarraCat.dmg', exec, env: CREDS, log: () => {} })
    expect(result).toEqual({
      dmgPath: '/tmp/NarraCat.dmg',
      skipped: false,
      submissionId: '563ee3d8-2158-42e2-9add-58e987a35028',
      status: 'Accepted',
    })
  })

  test('全链路成功：codesign 与 notarytool 收到的关键 args 真的对——不是随便传三个字符串都能过', () => {
    const calls = []
    const exec = fullStub({ calls })
    notarizeDmg({ dmgPath: '/tmp/NarraCat.dmg', exec, env: CREDS, log: () => {} })

    const codesignCall = calls.find(([command]) => command === 'codesign')
    // 哈希须来自 security 输出解析（不是写死常量），且必须带 --force（重跑场景 dmg 已有旧签名，
    // 不带 --force 会报 is already signed）与 --timestamp（公证要求时间戳）。
    expect(codesignCall).toEqual([
      'codesign',
      '--sign',
      'A1B2C3D4E5F60718293A4B5C6D7E8F9012345678',
      '--force',
      '--timestamp',
      '/tmp/NarraCat.dmg',
    ])

    const submitCall = calls.find(([command, sub]) => command === 'xcrun' && sub === 'notarytool')
    // --key/--key-id/--issuer 须原样来自传入的 env（不是写死或串错键）。
    expect(submitCall).toEqual([
      'xcrun',
      'notarytool',
      'submit',
      '/tmp/NarraCat.dmg',
      '--key',
      CREDS.APPLE_API_KEY,
      '--key-id',
      CREDS.APPLE_API_KEY_ID,
      '--issuer',
      CREDS.APPLE_API_ISSUER,
      '--wait',
    ])

    const stapleActionCall = calls.find(([command, sub, action]) => command === 'xcrun' && sub === 'stapler' && action === 'staple')
    expect(stapleActionCall).toEqual(['xcrun', 'stapler', 'staple', '/tmp/NarraCat.dmg'])
  })

  test('多张 Developer ID 证书时告警并打印选中的是哪一张（只含证书名与哈希，不涉私钥）', () => {
    const MULTI_IDENTITY_OUTPUT = [
      SIGNING_IDENTITY_OUTPUT.split('\n')[0],
      '2) D4E5F6D4E5F6D4E5F6D4E5F6D4E5F6D4E5F6D4E5 "Developer ID Application: Second Cert (TEAM999999)"',
      '   2 valid identities found',
    ].join('\n')
    const exec = (command, args) => {
      if (command === 'xcrun' && args[0] === 'stapler' && args[1] === 'validate') {
        return { status: 65, stdout: '', stderr: 'does not have a ticket stapled to it.' }
      }
      if (command === 'security') return { status: 0, stdout: MULTI_IDENTITY_OUTPUT, stderr: '' }
      if (command === 'codesign') return { status: 0, stdout: '', stderr: '' }
      if (command === 'xcrun' && args[0] === 'notarytool') return { status: 0, stdout: NOTARYTOOL_ACCEPTED, stderr: '' }
      if (command === 'xcrun' && args[0] === 'stapler' && args[1] === 'staple') return { status: 0, stdout: '', stderr: '' }
      throw new Error(`unexpected exec call: ${command} ${args.join(' ')}`)
    }
    const logs = []
    notarizeDmg({ dmgPath: '/tmp/NarraCat.dmg', exec, env: CREDS, log: (msg) => logs.push(msg) })

    const warning = logs.find((line) => line.includes('⚠') && line.includes('2 个'))
    expect(warning).toBeDefined()
    expect(logs.some((line) => line.includes('A1B2C3D4E5F60718293A4B5C6D7E8F9012345678'))).toBe(true)
    expect(logs.some((line) => line.includes('D4E5F6D4E5F6D4E5F6D4E5F6D4E5F6D4E5F6D4E5'))).toBe(true)
    // 明确打印选中的是第一张（哈希用于 codesign --sign）
    expect(logs.some((line) => line.includes('✓ 签名身份：') && line.includes('A1B2C3D4E5F60718293A4B5C6D7E8F9012345678'))).toBe(
      true,
    )
  })

  test('codesign 失败时抛出说明性错误', () => {
    const exec = fullStub({ codesignStatus: 1 })
    expect(() => notarizeDmg({ dmgPath: '/tmp/NarraCat.dmg', exec, env: CREDS, log: () => {} })).toThrow(
      /dmg 签名失败/,
    )
  })

  test('公证被拒（status 非 Accepted）时抛出说明性错误，提示用 notarytool log 查详情', () => {
    const exec = fullStub({ notarytoolOutput: NOTARYTOOL_INVALID })
    expect(() => notarizeDmg({ dmgPath: '/tmp/NarraCat.dmg', exec, env: CREDS, log: () => {} })).toThrow(
      /公证未通过.*notarytool log/s,
    )
  })

  test('票据装订失败时抛出说明性错误', () => {
    const exec = fullStub({ staplerStatus: 65 })
    expect(() => notarizeDmg({ dmgPath: '/tmp/NarraCat.dmg', exec, env: CREDS, log: () => {} })).toThrow(
      /票据装订失败/,
    )
  })
})
