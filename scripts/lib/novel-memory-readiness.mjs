// NovelMemory MCP 启动就绪契约 + 子进程输出截断助手的单一来源。
// 同时被 App 运行时探针（electron/main/engine/packaged-runtime-probe.ts）与
// 打包期 staged 探针（scripts/probe-staged-agent-core-runtime.mjs）引用，
// 防止就绪 banner / 截断逻辑在两个 runtime 各写一份后悄悄漂移。
// 纯 ESM、零 Electron 依赖，故 node 脚本与 App 主进程皆可直接引用（类型见同名 .d.ts）。

export const MAX_CAPTURED_OUTPUT_LENGTH = 4_000

export function appendCapturedOutput(current, chunk) {
  return (current + chunk.toString('utf8')).slice(-MAX_CAPTURED_OUTPUT_LENGTH)
}

const READY_PATTERN = /\[NovelMemory\] MCP Server 就绪/
const STARTED_WITH_WARNING_PATTERN = /\[NovelMemory\] MCP Server 已启动（警告: ([\s\S]*?)）/

// 「就绪」或「已启动（带警告）」都算起来了——探针只需判断进程是否就绪。
export const NOVEL_MEMORY_READY_PATTERN = /\[NovelMemory\] MCP Server (?:就绪|已启动)/

export function readNovelMemoryStartupState(stderr) {
  const warningMatch = stderr.match(STARTED_WITH_WARNING_PATTERN)
  if (warningMatch) return { started: true, warning: warningMatch[1]?.trim() }
  if (READY_PATTERN.test(stderr)) return { started: true }
  return { started: false }
}
