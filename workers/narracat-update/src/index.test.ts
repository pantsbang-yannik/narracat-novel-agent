import { afterEach, describe, expect, test } from 'bun:test'
import worker, {
  buildAliasAssetUrl,
  isManifestPath,
  parseManifestVersion,
  resolveDownloadAlias,
  resolveUpstreamUrl,
} from './index.ts'

const BASE = 'https://github.com/yannikzz/narracat-novel-agent/releases'

describe('resolveUpstreamUrl', () => {
  // 清单不带版本号，必须恒指「最新 release」——这是整套更新的入口。
  test('mac 清单指向 latest', () => {
    expect(resolveUpstreamUrl('/mac-arm64/latest-mac.yml')).toBe(`${BASE}/latest/download/latest-mac.yml`)
  })

  test('带版本号的包指向该版本的 tag', () => {
    expect(resolveUpstreamUrl('/mac-arm64/NarraCat-0.1.1880-mac-arm64.zip')).toBe(
      `${BASE}/download/v0.1.1880/NarraCat-0.1.1880-mac-arm64.zip`,
    )
  })

  test('blockmap 同样按版本号解析', () => {
    expect(resolveUpstreamUrl('/mac-arm64/NarraCat-0.1.1880-mac-arm64.zip.blockmap')).toBe(
      `${BASE}/download/v0.1.1880/NarraCat-0.1.1880-mac-arm64.zip.blockmap`,
    )
  })

  test('dmg 同样按版本号解析', () => {
    expect(resolveUpstreamUrl('/mac-arm64/NarraCat-0.1.1880-mac-arm64.dmg')).toBe(
      `${BASE}/download/v0.1.1880/NarraCat-0.1.1880-mac-arm64.dmg`,
    )
  })

  test('Windows 平台目录已预留可用', () => {
    expect(resolveUpstreamUrl('/win-x64/latest.yml')).toBe(`${BASE}/latest/download/latest.yml`)
  })

  // 下面都是必须拒绝的：Worker 是公网入口，不能被当成任意 URL 的转发器。
  test('未知平台目录拒绝', () => {
    expect(resolveUpstreamUrl('/linux-x64/latest.yml')).toBeNull()
  })

  test('路径穿越拒绝', () => {
    expect(resolveUpstreamUrl('/mac-arm64/../../etc/passwd')).toBeNull()
    expect(resolveUpstreamUrl('/mac-arm64/..%2Fsecret')).toBeNull()
    // 变异测试证实：以上两条、以及看起来像是「2 段 + 含 ..」的 '/mac-arm64/..'，
    // 全都先被别的检查拦下（前者段数 !== 2，后者文件名 '..' 本就不匹配
    // ASSET_NAME_PATTERN），根本走不到 `..` 检查这一行——删掉该行这些用例仍然
    // 全绿。真正命中该分支需要一个「文件名本身匹配 NarraCat 产物命名、但内部
    // 又含连续两个点」的路径：ASSET_NAME_PATTERN 的扩展名部分 [a-z0-9.]+ 本身
    // 允许出现点号，所以 'NarraCat-1.2.3-mac-arm64..zip' 能通过命名格式校验，
    // 全靠 `..` 检查单独拦截。删掉该行会让这一条真正变红。
    expect(resolveUpstreamUrl('/mac-arm64/NarraCat-1.2.3-mac-arm64..zip')).toBeNull()
  })

  test('层级不对的路径拒绝', () => {
    expect(resolveUpstreamUrl('/')).toBeNull()
    expect(resolveUpstreamUrl('/mac-arm64')).toBeNull()
    expect(resolveUpstreamUrl('/mac-arm64/sub/dir/file.zip')).toBeNull()
  })

  test('文件名不符合产物命名的拒绝', () => {
    expect(resolveUpstreamUrl('/mac-arm64/random.txt')).toBeNull()
    expect(resolveUpstreamUrl('/mac-arm64/NarraCat-notaversion-mac-arm64.zip')).toBeNull()
  })
})

describe('isManifestPath', () => {
  test('清单要认出来（它决定缓存策略）', () => {
    expect(isManifestPath('/mac-arm64/latest-mac.yml')).toBe(true)
    expect(isManifestPath('/win-x64/latest.yml')).toBe(true)
  })

  test('包不是清单', () => {
    expect(isManifestPath('/mac-arm64/NarraCat-0.1.1880-mac-arm64.zip')).toBe(false)
  })
})

describe('resolveDownloadAlias', () => {
  test('mac 的永久下载链接已登记', () => {
    const alias = resolveDownloadAlias('/mac-arm64/latest.dmg')
    expect(alias).not.toBeNull()
    expect(alias?.manifestName).toBe('latest-mac.yml')
  })

  // 别名是白名单精确匹配：没登记的一律不认，免得凭空拼出不存在的产物名。
  test('未登记的别名拒绝', () => {
    expect(resolveDownloadAlias('/mac-arm64/latest.zip')).toBeNull()
    expect(resolveDownloadAlias('/mac-arm64/latest.dmg/extra')).toBeNull()
    expect(resolveDownloadAlias('/mac-arm64/%2E%2E/latest.dmg')).toBeNull()
  })

  test('别名不会被主路径当成产物名解析', () => {
    expect(resolveUpstreamUrl('/mac-arm64/latest.dmg')).toBeNull()
  })
})

describe('Windows 永久下载链接（Windows 战役 2026-08-16）', () => {
  test('/win-x64/latest.exe 走清单定版本再转发', () => {
    const alias = resolveDownloadAlias('/win-x64/latest.exe')
    expect(alias).toEqual({ manifestName: 'latest.yml', assetSuffix: '-win-x64.exe' })
  })

  test('按清单里的版本号拼出该版本的 exe', () => {
    const alias = resolveDownloadAlias('/win-x64/latest.exe')!
    expect(buildAliasAssetUrl(alias, '0.1.1880')).toBe(
      'https://github.com/yannikzz/narracat-novel-agent/releases/download/v0.1.1880/NarraCat-0.1.1880-win-x64.exe',
    )
  })

  test('未登记的 Windows 别名一律不认（白名单精确匹配）', () => {
    expect(resolveDownloadAlias('/win-x64/latest.msi')).toBeNull()
    expect(resolveDownloadAlias('/win-x64/latest.zip')).toBeNull()
  })

  // 自动更新链（清单 + 产物翻译）本来就已支持 win-x64，这里是回归确认，不是新功能。
  test('Windows 自动更新清单与产物本来就能翻译', () => {
    expect(resolveUpstreamUrl('/win-x64/latest.yml')).toBe(
      'https://github.com/yannikzz/narracat-novel-agent/releases/latest/download/latest.yml',
    )
    expect(resolveUpstreamUrl('/win-x64/NarraCat-0.1.1880-win-x64.exe')).toBe(
      'https://github.com/yannikzz/narracat-novel-agent/releases/download/v0.1.1880/NarraCat-0.1.1880-win-x64.exe',
    )
    expect(resolveUpstreamUrl('/win-x64/NarraCat-0.1.1880-win-x64.exe.blockmap')).toBe(
      'https://github.com/yannikzz/narracat-novel-agent/releases/download/v0.1.1880/NarraCat-0.1.1880-win-x64.exe.blockmap',
    )
  })
})

describe('parseManifestVersion', () => {
  test('从清单首行取版本号', () => {
    expect(parseManifestVersion('version: 0.1.1925\nfiles:\n  - url: x.zip\n')).toBe('0.1.1925')
  })

  // 版本号会被拼进上游 URL，必须严格三段数字，不能把清单里的任意内容当版本用。
  test('非三段数字的版本一律拒绝', () => {
    expect(parseManifestVersion('version: latest\n')).toBeNull()
    expect(parseManifestVersion('version: ../../../etc/passwd\n')).toBeNull()
    expect(parseManifestVersion('files:\n  - url: x.zip\n')).toBeNull()
    expect(parseManifestVersion('')).toBeNull()
  })

  test('版本号不在首行也能取到', () => {
    expect(parseManifestVersion('files:\n  - url: x.zip\nversion: 1.2.3\n')).toBe('1.2.3')
  })
})

describe('buildAliasAssetUrl', () => {
  test('拼成该版本 tag 下的产物地址', () => {
    const alias = resolveDownloadAlias('/mac-arm64/latest.dmg')!
    expect(buildAliasAssetUrl(alias, '0.1.1925')).toBe(
      `${BASE}/download/v0.1.1925/NarraCat-0.1.1925-mac-arm64.dmg`,
    )
  })
})

describe('fetch：永久下载链接', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  /** 按 URL 逐条编排上游响应，同时记录实际请求，便于断言「先取清单、再取包」。 */
  function stubUpstream(routes: Record<string, Response>) {
    const calls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      calls.push(url)
      const hit = routes[url]
      if (!hit) throw new Error(`未编排的上游请求: ${url}`)
      return hit
    }) as typeof fetch
    return calls
  }

  const MANIFEST_URL = `${BASE}/latest/download/latest-mac.yml`
  const ASSET_URL = `${BASE}/download/v0.1.1925/NarraCat-0.1.1925-mac-arm64.dmg`

  test('转发到 latest 对应版本的 dmg', async () => {
    const calls = stubUpstream({
      [MANIFEST_URL]: new Response('version: 0.1.1925\n'),
      [ASSET_URL]: new Response('dmg-bytes', { headers: { 'content-type': 'application/octet-stream' } }),
    })

    const res = await worker.fetch(new Request('https://update.narracat.com/mac-arm64/latest.dmg'))

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('dmg-bytes')
    expect(calls).toEqual([MANIFEST_URL, ASSET_URL])
  })

  // 这条地址内容会随 latest 变。一旦被边缘缓存，网页上的回退开关就失效了。
  test('绝不能长缓存', async () => {
    stubUpstream({
      [MANIFEST_URL]: new Response('version: 0.1.1925\n'),
      [ASSET_URL]: new Response('dmg-bytes'),
    })

    const res = await worker.fetch(new Request('https://update.narracat.com/mac-arm64/latest.dmg'))

    expect(res.headers.get('cache-control')).toBe('no-cache, max-age=0')
    expect(res.headers.get('cache-control')).not.toContain('immutable')
  })

  // 用户存到本地的文件要带版本号，否则内测反馈说不清自己装的是哪版。
  test('下载文件名带上真实版本号', async () => {
    stubUpstream({
      [MANIFEST_URL]: new Response('version: 0.1.1925\n'),
      [ASSET_URL]: new Response('dmg-bytes'),
    })

    const res = await worker.fetch(new Request('https://update.narracat.com/mac-arm64/latest.dmg'))

    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="NarraCat-0.1.1925-mac-arm64.dmg"',
    )
  })

  test('Range 透传给上游（浏览器断点续传）', async () => {
    let assetRange: string | null = null
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url === MANIFEST_URL) return new Response('version: 0.1.1925\n')
      assetRange = new Headers(init?.headers).get('range')
      return new Response('bytes', { status: 206 })
    }) as typeof fetch

    const res = await worker.fetch(
      new Request('https://update.narracat.com/mac-arm64/latest.dmg', { headers: { range: 'bytes=100-200' } }),
    )

    expect(assetRange).toBe('bytes=100-200')
    expect(res.status).toBe(206)
  })

  // 清单坏了是服务端故障，不是「地址不存在」。回 404 会让人以为链接给错了。
  test('清单取不到时回 502', async () => {
    stubUpstream({ [MANIFEST_URL]: new Response('Not Found', { status: 404 }) })

    const res = await worker.fetch(new Request('https://update.narracat.com/mac-arm64/latest.dmg'))

    expect(res.status).toBe(502)
  })

  test('清单里版本号不合法时回 502', async () => {
    stubUpstream({ [MANIFEST_URL]: new Response('files:\n  - url: x.zip\n') })

    const res = await worker.fetch(new Request('https://update.narracat.com/mac-arm64/latest.dmg'))

    expect(res.status).toBe(502)
  })

  test('HEAD 也能用（浏览器/下载器会先探一次）', async () => {
    const calls = stubUpstream({
      [MANIFEST_URL]: new Response('version: 0.1.1925\n'),
      [ASSET_URL]: new Response(null, { headers: { 'content-length': '288789464' } }),
    })

    const res = await worker.fetch(
      new Request('https://update.narracat.com/mac-arm64/latest.dmg', { method: 'HEAD' }),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-length')).toBe('288789464')
    // 清单必须用 GET 取——HEAD 拿不到 body，就解析不出版本号。
    expect(calls[0]).toBe(MANIFEST_URL)
  })
})
