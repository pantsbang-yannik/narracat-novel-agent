/**
 * memory 通道端到端冒烟：临时小说项目 fixture → electron 以 NARRACAT_MEMORY_SMOKE 模式启动 →
 * 校验 utilityProcess 真链路（Electron-ABI sqlite / core dist 动态加载 / RPC 往返）结果。
 * NARRACAT_SMOKE_ELECTRON_BIN 可覆盖 electron 二进制（打包链的 smoke packaged app 步骤用它
 * 指向刚打出来的 .app）。
 *
 * NARRACAT_SMOKE_REQUIRE_PACKAGED=1 时**必须**带 override，否则直接失败——因为 dev 态回落是
 * 静默的：dev electron 跑 out/ 时，resolveEmbeddingModelPath 同样会命中打包链刚 prepare 好的
 * build/embedding-model，于是 sqlite-vec / 离线模型 / selftest 四项的输出与跑真产物时**逐字
 * 相同**，肉眼与日志都分辨不出这一趟到底验没验产物。打包链靠这个开关把「env 没传到」从
 * 静默假绿变成硬失败。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const overrideBin = process.env.NARRACAT_SMOKE_ELECTRON_BIN

// 前置闸放在建 fixture 之前：配置错了不必先造一堆临时文件。
if (process.env.NARRACAT_SMOKE_REQUIRE_PACKAGED === '1' && !overrideBin) {
  console.error(
    '[smoke-memory] FAIL: NARRACAT_SMOKE_REQUIRE_PACKAGED=1 要求跑打包产物，但没收到 NARRACAT_SMOKE_ELECTRON_BIN。\n' +
      '  若从打包链触发，说明 step.env 没有真正传到子进程——这一趟会静默回落成 dev 态，\n' +
      '  输出与跑真产物逐字相同、看不出差别，故此处硬失败而不是继续。',
  )
  process.exit(1)
}
if (overrideBin && !existsSync(overrideBin)) {
  console.error(
    `[smoke-memory] FAIL: NARRACAT_SMOKE_ELECTRON_BIN 指向的可执行文件不存在：${overrideBin}\n` +
      '  常见原因：打包产物目录名变了（productName / arch / 目标平台改动），或这一步排在打包之前。',
  )
  process.exit(1)
}

const projectPath = mkdtempSync(join(tmpdir(), 'narracat-smoke-'))
mkdirSync(join(projectPath, '.narracat'), { recursive: true })
writeFileSync(
  join(projectPath, '.narracat', 'config.yaml'),
  'novel_id: "smoke-novel"\nestimated_total_chapters: 12\nwords_per_chapter: 3000\n',
)
const outPath = join(projectPath, 'smoke-result.json')
// dev 态无打包模型：指一个空目录让 embedding 快速失败→优雅降级纯 FTS，冒烟不联网不抖动。
// 打包态 host 的 buildEnv 会以真实 resources 模型路径覆盖此值（env 展开顺序 host 覆盖在后）。
const dummyModelDir = join(projectPath, 'no-model')
mkdirSync(dummyModelDir, { recursive: true })

const electronBin = overrideBin ?? join(root, 'node_modules/.bin/electron')
// 明写这一趟到底跑的是哪个二进制：dev 回落与真产物的后续输出完全一样，没有这行就无从事后判别。
console.log(`[smoke-memory] electron=${electronBin}${overrideBin ? '（打包产物）' : '（dev 回落）'}`)
// 传项目根目录（非直接指向 out/main/index.js 脚本文件）：Electron 对「脚本文件」参数取其所在目录
// 作为 app.getAppPath()，会把 appRoot 算成 out/main（不含 agent-core/narracat），产品代码里 appRoot
// 全线走 app.getAppPath() 的既有约定（同 electron-vite dev / 打包态）；传根目录让 Electron 读根
// package.json 的 main 字段展开，appPath 才等于项目根，与生产路径解析同构。
const electronArgs = overrideBin ? [] : ['.']

const result = spawnSync(electronBin, electronArgs, {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    NARRACAT_MEMORY_SMOKE: projectPath,
    NARRACAT_MEMORY_SMOKE_OUT: outPath,
    NARRACAT_EMBEDDING_MODEL_PATH: dummyModelDir,
  },
  timeout: 120_000,
})

// spawn 层的失败先报，再去读结果文件：app 起不来 / 崩在写文件之前 / 被 120s 超时 SIGTERM 时，
// outPath 根本不存在，直接 readFileSync 只会抛一个指向临时文件的 ENOENT，把真因盖掉。
if (result.error || result.signal || !existsSync(outPath)) {
  console.error(
    `[smoke-memory] FAIL: 应用未产出冒烟结果（electron=${electronBin}）\n` +
      `  exit=${result.status} signal=${result.signal ?? 'none'}\n` +
      `  spawn error: ${result.error ? (result.error.stack ?? result.error.message) : 'none'}\n` +
      '  典型原因：二进制起不来、启动即崩、或超过 120s 超时被杀。',
  )
  process.exit(1)
}

const report = JSON.parse(readFileSync(outPath, 'utf8'))
if (result.status !== 0 || report.ok !== true) {
  console.error('[smoke-memory] FAIL', JSON.stringify(report, null, 2), 'exit=', result.status)
  process.exit(1)
}
console.log('[smoke-memory] PASS', JSON.stringify(report))
