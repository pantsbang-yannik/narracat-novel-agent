/**
 * 不依赖外部二进制的文件检索工具（替换 pi 内置 find）。
 *
 * pi 的 find 走 fd：先查系统 PATH，找不到就去 GitHub Releases 下载。两条路在生产上都不通——
 * macOS 从 Finder 启动的 App 继承 launchd 的窄 PATH（`/usr/bin:/bin:/usr/sbin:/sbin`，不含
 * Homebrew），而目标用户（网文作者）机器上本来就不会装 fd 这类开发者工具，GitHub 下载对国内
 * 用户更是基本不可达。真机打包版实测：find 有一半调用直接报「fd is not available and could
 * not be downloaded」。dev 从终端启动继承了完整 PATH，所以这个缺陷一直没暴露。
 *
 * 做法是复用 pi 自己的 `createFindToolDefinition`，只把底层 FindOperations 换成 tinyglobby——
 * 工具名、schema、描述、输出格式与截断语义全部原样继承，零漂移。同名工具经 customTools 注入
 * 即可覆盖内置那个。
 *
 * 为什么不用 Node 内置 `fs.glob`：①它没有 `dot` 选项，`**` 不跨隐藏目录，而 `.narracat/staging/`
 * 正是任务书所在，搜不到任务书 agent 就会去猜文件名；②实测 Electron 的 Node 24 与 bun 对同一
 * pattern 结果不同（`**\/.narracat/**\/*.md` 在 Node 下命中、bun 下不命中），测试跑在 bun、
 * 生产跑在 Node，那样的测试根本代表不了生产。tinyglobby 在两个运行时结果逐字一致。
 *
 * 一处已知差异：fd 会读 `.gitignore`，本实现不读。pi 在 customOps 分支硬编码了
 * `ignore: ['**\/node_modules/**', '**\/.git/**']`，对小说项目足够——小说目录里没有需要靠
 * .gitignore 屏蔽的产物。
 *
 * grep 没有对应做法：它的 GrepOperations 只能替换 isDirectory/readFile，搜索本身无条件调用
 * ripgrep，绕不开。
 */
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { glob } from 'tinyglobby'
import { createFindToolDefinition } from '@mariozechner/pi-coding-agent'
import type { FindOperations, ToolDefinition } from '@mariozechner/pi-coding-agent'

async function pathExists(absolutePath: string): Promise<boolean> {
  try {
    await fs.access(absolutePath)
    return true
  } catch {
    return false
  }
}

const globOperations: FindOperations = {
  exists: pathExists,
  async glob(pattern, cwd, options) {
    // dot:true 是关键——`.narracat/` 是引擎工作区（任务书、暂存区都在里面），按「隐藏文件」
    // 跳过就等于让 agent 看不见自己的任务书。
    const matches = await glob(pattern, { cwd, dot: true, ignore: options.ignore })
    // 必须回绝对路径：pi 的 relativize 只认「以搜索根开头」的绝对路径，拿到相对路径会
    // 走 path.relative(searchPath, 相对路径)，那是按进程 cwd 解析的，算出来是错的。
    return matches.slice(0, options.limit).map((entry) => join(cwd, entry))
  },
}

/** 与内置 find 同名同形，只是不需要 fd。 */
export function createPortableFindTool(cwd: string): ToolDefinition {
  return createFindToolDefinition(cwd, { operations: globOperations }) as ToolDefinition
}
