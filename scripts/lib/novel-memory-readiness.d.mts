// 运行时实现见同名 .mjs（单一来源）；本声明仅供 App 主进程 TS 解析类型。
export declare const MAX_CAPTURED_OUTPUT_LENGTH: number
export declare function appendCapturedOutput(current: string, chunk: Buffer): string
export declare const NOVEL_MEMORY_READY_PATTERN: RegExp
export declare function readNovelMemoryStartupState(stderr: string): { started: boolean; warning?: string }
