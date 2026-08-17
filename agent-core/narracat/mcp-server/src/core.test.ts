import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { TOOL_DEFINITIONS } from "./tools.js";
import {
  TOOL_HANDLERS,
  createToolContext,
  createLazyToolRunner,
  runTool,
  runStartupBackfills,
} from "./core.js";
import type { ToolContext } from "./types.js";

function makeProject(): { projectPath: string; configPath: string } {
  const projectPath = mkdtempSync(join(tmpdir(), "narracat-core-"));
  mkdirSync(join(projectPath, ".narracat"), { recursive: true });
  const configPath = join(projectPath, ".narracat", "config.yaml");
  writeFileSync(configPath, 'novel_id: "core-test-novel"\nestimated_total_chapters: 12\nwords_per_chapter: 3000\n');
  return { projectPath, configPath };
}

describe("core 入口", () => {
  it("TOOL_DEFINITIONS 与 TOOL_HANDLERS 双向一一对应", () => {
    const defNames = TOOL_DEFINITIONS.map((d) => d.name).sort();
    const handlerNames = Object.keys(TOOL_HANDLERS).sort();
    expect(handlerNames).toEqual(defNames);
  });

  // 公开 schema 的锁：handler 侧「省略即 1」只有在 phase 不是 required 时才对模型可见。
  // 只测 handler 会漏掉「有人把 phase 加回 required」——那时 handler 依旧全绿，模型却又被
  // 要求每次传它，改动等于白做。
  it("novel_submit_outline 的 phase 不在 required 中（payload 仍必填）", () => {
    const def = TOOL_DEFINITIONS.find((d) => d.name === "novel_submit_outline");
    expect(def).toBeDefined();
    const required = (def!.inputSchema as { required?: string[] }).required ?? [];
    expect(required).toEqual(["payload"]);
  });

  it("runTool 未知工具返回 ERR_TOOL_001 信封且不触发 getContext", async () => {
    const getContext = vi.fn();
    const result = await runTool("novel_nonexistent", {}, getContext, () => {});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.text)).toMatchObject({ status: "error", error_code: "ERR_TOOL_001" });
    expect(getContext).not.toHaveBeenCalled();
  });

  it("getContext 抛错返回 ERR_DB_001 信封", async () => {
    const result = await runTool(
      "novel_query",
      { query: "x" },
      async () => {
        throw new Error("no config");
      },
      () => {},
    );
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.text)).toMatchObject({ status: "error", error_code: "ERR_DB_001" });
  });

  it("驱动注入生效且真工具走通（novel_chapter_summary 空库非错误）", async () => {
    const { configPath } = makeProject();
    // 注意不能用 vi.fn 箭头函数当驱动——openDatabase 内部 new DriverCtor()，箭头函数不可构造。
    let driverCalls = 0;
    function DriverSpy(path: string) {
      driverCalls += 1;
      return new Database(path);
    }
    const ctx = await createToolContext({ configPath, sqliteDriver: DriverSpy as unknown as typeof Database });
    expect(driverCalls).toBe(1);
    expect(ctx.novelId).toBe("core-test-novel");
    const result = await runTool("novel_chapter_summary", {}, async () => ctx, () => {});
    expect(result.isError).toBe(false);
  });

  it("createLazyToolRunner：context 构建失败后可重试，成功后 memoize", async () => {
    const { configPath } = makeProject();
    let calls = 0;
    const runner = createLazyToolRunner({
      createContext: async () => {
        calls += 1;
        if (calls === 1) throw new Error("first fail");
        return createToolContext({ configPath });
      },
      log: () => {},
    });
    const first = await runner.runTool("novel_chapter_summary", {});
    expect(first.isError).toBe(true);
    const second = await runner.runTool("novel_chapter_summary", {});
    expect(second.isError).toBe(false);
    await runner.runTool("novel_chapter_summary", {});
    expect(calls).toBe(2);
  });

  it("runStartupBackfills 对新库不抛", async () => {
    const { configPath } = makeProject();
    const ctx: ToolContext = await createToolContext({ configPath });
    await expect(runStartupBackfills(ctx, () => {})).resolves.toBeUndefined();
  });
});
