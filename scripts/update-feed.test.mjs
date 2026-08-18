import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MAC_LATEST_DOWNLOAD_FILE,
  MAC_PLATFORM_DIR,
  RELEASE_REPO,
  UPDATE_FEED_BASE_URL,
  macDownloadUrl,
  macFeedUrl,
  releaseAssetFileNames,
  releaseTag,
  winDownloadUrl,
  winFeedUrl,
  winReleaseAssetFileNames,
} from './update-feed.mjs'

const repoRoot = join(import.meta.dirname, '..')

describe('update feed 契约', () => {
  test('feed 基址固定', () => {
    expect(UPDATE_FEED_BASE_URL).toBe('https://update.narracat.com')
  })

  test('mac feed 指向 mac-arm64 子目录', () => {
    expect(macFeedUrl()).toBe('https://update.narracat.com/mac-arm64')
  })

  test('对外分发用的永久链接不带版本号', () => {
    expect(macDownloadUrl()).toBe('https://update.narracat.com/mac-arm64/latest.dmg')
    // 带版本号就不叫永久链接了——这是它存在的全部理由。
    expect(macDownloadUrl()).not.toMatch(/\d+\.\d+\.\d+/)
  })

  // 与上面 resolveFeedUrl 那条同款的跨源守卫：Worker 独立部署、不 import 本仓代码，
  // 白名单里没有这条 key 时它一律 404。漂移的后果是「发出去的永久链接打不开」，
  // 而本仓这边全绿、毫无察觉，所以在这里 grep Worker 源码钉住。
  test('Worker 的别名白名单里登记了这条永久链接', () => {
    const source = readFileSync(join(repoRoot, 'workers/narracat-update/src/index.ts'), 'utf8')
    expect(source).toContain(`'/${MAC_PLATFORM_DIR}/${MAC_LATEST_DOWNLOAD_FILE}'`)
  })

  test('发布仓是那个已 public 的新仓', () => {
    expect(RELEASE_REPO).toBe('yannikzz/narracat-novel-agent')
  })

  test('tag 是版本号前加 v', () => {
    expect(releaseTag('0.1.1880')).toBe('v0.1.1880')
  })

  // 五件齐是硬要求：少 zip 自动更新装不上，少 blockmap 退化成全量下载，
  // 少 latest-mac.yml 客户端根本发现不了新版本。
  test('一次发版的五个资产文件名', () => {
    expect(releaseAssetFileNames('0.1.1880')).toEqual([
      'NarraCat-0.1.1880-mac-arm64.zip',
      'NarraCat-0.1.1880-mac-arm64.zip.blockmap',
      'NarraCat-0.1.1880-mac-arm64.dmg',
      'NarraCat-0.1.1880-mac-arm64.dmg.blockmap',
      'latest-mac.yml',
    ])
  })

  // publish 配置缺失 → electron-builder 不生成 latest-mac.yml → 自动更新永远查不到新版本，
  // 且打包依旧「成功」。这是典型静默失效，故用测试钉住。
  test('package.json 的 publish 配置与 feed 基址一致', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
    // publish 按平台分设（Windows 战役）：顶层那份写死 mac-arm64 会让 Windows 包
    // 拿到 mac 的 feed，更新时下到 .dmg。两个平台各自指向自己的目录。
    expect(pkg.build.publish).toBeUndefined()
    expect(pkg.build.mac.publish).toEqual({ provider: 'generic', url: 'https://update.narracat.com/mac-arm64' })
    expect(pkg.build.win.publish).toEqual({ provider: 'generic', url: 'https://update.narracat.com/win-x64' })
    expect(pkg.dependencies['electron-updater']).toBeDefined()
  })

  // I5：feed URL 三处同值（这里 / scripts/update-feed.mjs / package.json build.publish.url），
  // 但只有主进程 electron/main/updater/updater-runtime.ts 的 resolveFeedUrl() 那份才是真正
  // 生效的（setFeedURL 覆盖 app-update.yml）——此前只有后两处被本文件钉住，主进程那份
  // 漂移的后果是打包成功、上传成功、用户永远收不到更新、全链无一处报错。
  //
  // resolveFeedUrl() 按平台派生目录（不是拼一整条固定 URL），故这里不断言完整字符串匹配，
  // 而是跨语言 grep 断言源码文本里含 feed 基址与 mac 平台目录常量——M1 把 URL 从写死改成
  // 按平台派生后，这条断言也同步改成断言 MAC_PLATFORM_DIR 这个字面量出现在源码里。
  test('主进程 updater-runtime.ts 的 resolveFeedUrl 源码含 feed 基址与 mac 平台目录常量', () => {
    const source = readFileSync(join(repoRoot, 'electron/main/updater/updater-runtime.ts'), 'utf8')
    expect(source).toContain(UPDATE_FEED_BASE_URL)
    expect(source).toContain(MAC_PLATFORM_DIR)
  })
})

describe('Windows 更新源（Windows 战役 2026-08-16）', () => {
  test('win feed 指向 win-x64 子目录', () => {
    expect(winFeedUrl()).toBe('https://update.narracat.com/win-x64')
  })

  test('对外永久下载链接是 latest.exe', () => {
    expect(winDownloadUrl()).toBe('https://update.narracat.com/win-x64/latest.exe')
  })

  test('一次 Windows 发版三件缺一不可', () => {
    expect(winReleaseAssetFileNames('0.1.1880')).toEqual([
      'NarraCat-0.1.1880-win-x64.exe',
      'NarraCat-0.1.1880-win-x64.exe.blockmap',
      'latest.yml',
    ])
  })

  // Worker 是独立部署单元、不 import 本仓代码，两处白名单是刻意的重复。
  // 这条断言把「改一边忘了另一边 → 永久下载链接 404」变成红灯。
  test('永久下载文件名与 Worker 的 alias 白名单一致', () => {
    const workerSource = readFileSync(join(repoRoot, 'workers', 'narracat-update', 'src', 'index.ts'), 'utf8')
    expect(workerSource).toContain('latest.exe')
  })
})
