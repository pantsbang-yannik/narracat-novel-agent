import { describe, expect, test } from 'bun:test'
import { assertSigningIdentity, findDeveloperIdIdentities, parseSigningIdentityHash } from './check-signing-identity.mjs'

const WITH_DEVELOPER_ID = `  1) A1B2C3 "Apple Development: someone (XYZ)"
  2) D4E5F6 "Developer ID Application: Some Name (TEAM123456)"
     2 valid identities found`

const WITHOUT_DEVELOPER_ID = `  1) A1B2C3 "Apple Development: someone (XYZ)"
     1 valid identities found`

describe('Developer ID 签名身份闸', () => {
  test('从 security 输出中挑出 Developer ID Application 身份', () => {
    expect(findDeveloperIdIdentities(WITH_DEVELOPER_ID)).toEqual([
      '2) D4E5F6 "Developer ID Application: Some Name (TEAM123456)"',
    ])
  })

  test('只有开发证书时不误判为可分发身份', () => {
    expect(findDeveloperIdIdentities(WITHOUT_DEVELOPER_ID)).toEqual([])
  })

  test('缺 Developer ID 证书时抛错并给出办证指引', () => {
    const exec = () => WITHOUT_DEVELOPER_ID
    expect(() => assertSigningIdentity({ exec })).toThrow(/Developer ID Application/)
    expect(() => assertSigningIdentity({ exec })).toThrow(/developer\.apple\.com/)
  })

  test('有 Developer ID 证书时返回身份列表', () => {
    const exec = () => WITH_DEVELOPER_ID
    expect(assertSigningIdentity({ exec })).toHaveLength(1)
  })
})

describe('parseSigningIdentityHash', () => {
  test('从真实身份行（40 位十六进制 SHA-1）解出哈希——实测 security find-identity 输出', () => {
    expect(
      parseSigningIdentityHash('1) A1B2C3D4E5F60718293A4B5C6D7E8F9012345678 "Developer ID Application: Example Developer (TEAM123456)"'),
    ).toBe('A1B2C3D4E5F60718293A4B5C6D7E8F9012345678')
  })

  test('序号为两位数时同样能解出（不依赖固定列宽）', () => {
    expect(
      parseSigningIdentityHash('12) D4E5F6D4E5F6D4E5F6D4E5F6D4E5F6D4E5F6D4E5 "Developer ID Application: Some Name (TEAM123456)"'),
    ).toBe('D4E5F6D4E5F6D4E5F6D4E5F6D4E5F6D4E5F6D4E5')
  })

  test('格式不符时抛出说明性错误而非返回 null/undefined（fail-loud）', () => {
    expect(() => parseSigningIdentityHash('not a valid identity line')).toThrow(/无法从签名身份行解析出证书哈希/)
    expect(() => parseSigningIdentityHash('')).toThrow(/无法从签名身份行解析出证书哈希/)
    expect(() => parseSigningIdentityHash(undefined)).toThrow(/无法从签名身份行解析出证书哈希/)
  })
})
