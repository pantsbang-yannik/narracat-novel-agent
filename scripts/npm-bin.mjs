/**
 * npm 可执行文件名。Windows 上 npm 是批处理文件 `npm.cmd`，而 child_process 的
 * execFile/spawn 不经过 shell，传裸 'npm' 会直接 `spawn npm ENOENT`。
 *
 * 这个坑只在 Windows 上现形（mac/Linux 全绿），而且症状是打包链最前面几步就崩，
 * 看起来像「Agent Core 准备失败」这类完全无关的错误——2026-08-18 Windows 战役
 * 首次 CI 出包就栽在这里。所以给它一个有名字的地方，别再散落在各脚本里各写一遍。
 */
export function npmBin(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm'
}
