/**
 * 跨平台的 npm 调用形态（给 execFile / execFileSync 用）。
 *
 * Windows 上 npm 是批处理文件 npm.cmd，而 Node 官方文档写死了：**.bat/.cmd 不能用
 * child_process.execFile() 启动**（无终端时它们本身不可执行）。硬来的症状分两级：
 *   - 传裸 'npm'     → spawn npm ENOENT（根本找不到）
 *   - 传 'npm.cmd'   → spawn EINVAL（找到了但拒绝执行）
 * 两个都是 Windows 独有，mac/Linux 全绿——2026-08-18 Windows 战役首次 CI 出包
 * 连撞两次，且症状伪装成「Agent Core 准备失败」这类无关错误。
 *
 * 官方给的三条路里选 spawn cmd.exe /c：`shell: true` 已被 DEP0190 标记为不推荐，
 * exec() 又要把参数拼成单个命令串（拼接就有引号与转义的坑）。cmd.exe /c 保持
 * 参数数组形态，最接近原来的写法。
 *
 * 注意：调用方的 cwd 走 options 传递、不进命令行，所以路径含空格不受影响。
 */
export function npmCommand(args, platform = process.platform) {
  return platform === 'win32'
    ? { command: 'cmd.exe', args: ['/c', 'npm', ...args] }
    : { command: 'npm', args }
}
