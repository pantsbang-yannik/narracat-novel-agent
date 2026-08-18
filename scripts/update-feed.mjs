/**
 * 更新源单一事实来源（SSOT）：App 侧 feed URL 与发版脚本的 GitHub Release 目标共用这里，
 * 避免两处各写一份写歪——写歪的后果是「打包成功、发布成功、用户永远收不到更新」。
 * feed 域名前面是 Cloudflare Worker（workers/narracat-update/），真正的安装包存在
 * GitHub Release 里，Worker 按 <平台>/<文件名> 反代到对应 tag 的资产。
 */
export const UPDATE_FEED_BASE_URL = 'https://update.narracat.com'
/** 安装包发布到的 GitHub 仓库；与开发主仓不同，gh 调用必须显式 --repo。 */
export const RELEASE_REPO = 'yannikzz/narracat-novel-agent'
/** 当前只发 macOS arm64；Windows 战役落位时新增 'win-x64'。 */
export const MAC_PLATFORM_DIR = 'mac-arm64'

/**
 * 对外分发用的永久下载地址（不带版本号，自动跟随 latest）。发给人的链接一律用它，
 * 发新版不必换链接。**这个文件名必须与 Worker 的 DOWNLOAD_ALIASES 白名单一致**
 * （`workers/narracat-update/src/index.ts`）——Worker 是独立部署单元、不 import 本仓代码，
 * 所以这是一处刻意的重复：改一边必须同时改另一边，否则这条链接直接 404。
 */
export const MAC_LATEST_DOWNLOAD_FILE = 'latest.dmg'

export function macFeedUrl() {
  return `${UPDATE_FEED_BASE_URL}/${MAC_PLATFORM_DIR}`
}

export function macDownloadUrl() {
  return `${macFeedUrl()}/${MAC_LATEST_DOWNLOAD_FILE}`
}

export function releaseTag(version) {
  return `v${version}`
}

/**
 * 一次发版要上传的全部资产文件名，顺序即上传顺序（清单最后）。
 * 五件缺一不可：少 zip 自动更新装不上，少 blockmap 退化成每次全量下载 275MB，
 * 少 latest-mac.yml 客户端根本发现不了新版本。
 */
export function releaseAssetFileNames(version) {
  return [
    `NarraCat-${version}-mac-arm64.zip`,
    `NarraCat-${version}-mac-arm64.zip.blockmap`,
    `NarraCat-${version}-mac-arm64.dmg`,
    `NarraCat-${version}-mac-arm64.dmg.blockmap`,
    'latest-mac.yml',
  ]
}
