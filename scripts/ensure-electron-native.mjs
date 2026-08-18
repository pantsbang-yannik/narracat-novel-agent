/**
 * 确保根 node_modules/better-sqlite3 是 Electron-ABI 构建（utilityProcess memory worker 专用）。
 * 幂等：stamp 文件记录已重建的 Electron 版本，命中即秒退；bun install 重装依赖会抹掉 stamp，
 * 下次自动触发重建。引擎 agent-core/narracat/mcp-server/node_modules 那份保持 node-ABI，勿动。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * better-sqlite3 13 是 N-API（node-addon-api ^8）：prebuilds/<platform>-<arch>.node
 * 单份二进制同时被 plain node 与 Electron 加载，无需按 Electron ABI 重编。
 * Windows 上强行 rebuild 要拉起 node-gyp + MSVC（CI 上慢且脆），命中 prebuild 就跳过。
 *
 * macOS 刻意维持原有的无条件重建：那条打包链刚过真机验收（2026-08 签名+公证战役），
 * 不在 Windows 战役里顺手改动已验收的路径。
 * Windows ARM 同样照旧重建：不在目标平台矩阵内（战役决策 8b），不给未验收的平台开半扇门。
 */
export function shouldSkipElectronRebuild({ platform, arch, prebuildExists }) {
  return platform === 'win32' && arch === 'x64' && prebuildExists === true
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd()
  const electronVersion = JSON.parse(readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8')).version
  const stampPath = join(root, 'node_modules/better-sqlite3/.narracat-electron-rebuild')

  if (existsSync(stampPath) && readFileSync(stampPath, 'utf8').trim() === electronVersion) {
    process.exit(0)
  }

  const prebuildPath = join(
    root,
    'node_modules/better-sqlite3/prebuilds',
    `${process.platform}-${process.arch}.node`,
  )
  if (
    shouldSkipElectronRebuild({
      platform: process.platform,
      arch: process.arch,
      prebuildExists: existsSync(prebuildPath),
    })
  ) {
    console.log(`[ensure-electron-native] 命中 N-API prebuild ${process.platform}-${process.arch}.node，跳过重建`)
    process.exit(0)
  }

  console.log(`[ensure-electron-native] rebuilding better-sqlite3 for Electron ${electronVersion}…`)
  const { rebuild } = await import('@electron/rebuild')
  await rebuild({ buildPath: root, electronVersion, onlyModules: ['better-sqlite3'], force: true })
  writeFileSync(stampPath, electronVersion)
  console.log('[ensure-electron-native] done')
}
