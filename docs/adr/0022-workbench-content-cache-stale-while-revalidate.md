# ADR 0022: 工作台内容产物切换走缓存 + stale-while-revalidate（秒回优先于绝对新鲜）

## Status

Accepted

## Context

工作台内频繁切菜单/tab 体感卡顿（用户实测）。根因不在渲染慢，而在 `useWorkbenchProject`（`src/lib/use-novel-project.ts`）的 `useEffect` 依赖 `[projectPath, selectedChapter, selectedObjectId, selectedSectionId, selectedTabId]`——每切一下整个 `load()` 重跑：

1. `prepareWorkbenchProjectLoad` 无条件 `setNovelLoading(true)` 并清空 `activeWorkbenchArtifacts`/`activeArtifacts` → 内容区先闪空；
2. `await getNovelWorkbenchArtifacts` → 主进程 `listWorkbenchMarkdownArtifacts`（`electron/main/novel/novel-artifacts.ts`）把该对象目录下**每个 markdown 文件重新读盘+解析**，零缓存；
3. 回填后 `MarkdownRenderer` 无 `memo`，全量重新 parse。

即「清空闪白 → 读盘 → 重 parse → 回填」每次切换整套重来。项目骨架 `detail` 已被 `resolveReusableWorkbenchProjectDetail` 复用缓存，唯独用户真正在看的内容产物没有任何缓存。

`docs/report/2026-06-19-runtime-performance-phase-1.md` 测出的「单次冷切 110ms healthy」未暴露此问题——反复切才卡，且伴随闪白与滚动跳顶。

## Decision

**为工作台内容产物引入按（项目, 对象, 卷）键控的内存缓存，切换采用 stale-while-revalidate：命中即秒显，后台静默重读，内容变了才无感替换。在「秒回」与「绝对新鲜」之间，选秒回优先。**

1. **缓存键** `${projectPath}::${objectId}::${volumeNumber ?? ''}`：含项目路径防串项目，含卷号因其影响 `getNovelWorkbenchArtifacts` 读取结果。
2. **命中快速路径**：同项目（detail 可复用）且内容已缓存时，**不** `setNovelLoading`、**不**清空，直接 set 缓存内容秒显；随后后台 `getNovelWorkbenchArtifacts` 重读，`JSON.stringify` 比对，内容不同才覆盖 store。**后台重读失败保留缓存内容，不报错、不清空。**
3. **缓存写入收口**：`useWorkbenchProject`（首次读盘）与 `loadWorkbenchProject`（run 结束 / 手动刷新，含 smooth 增量）两条写 store 的路径都同步写缓存，确保 Agent 改过文件后缓存不陈旧。
4. **缓存失效**：切到别的项目时清掉上一项目的全部缓存条目；删项目时清该项目条目——防泄漏、防串味。
5. **配套**：`MarkdownRenderer` 加 `React.memo`（命中缓存后父链重渲染不重复 parse）；`ArtifactDocumentShell` 的 `JSON.stringify(artifact.data)` 与 `countReadableUnits` 用 `useMemo`。切对象仍回到内容顶部（不做滚动位置记忆——评估后认为收益不足以承担其生命周期/时序复杂度）。

## Considered Options

- **每次切都等最新（拒绝）**：保证永不显示旧内容，但每次切换都得等读盘——正是当前卡顿。平时浏览切 tab 内容不会自变（仅用户触发 Agent run 才改，而 run 结束本就刷新一次），「显示陈旧」窗口极小，不值得用持续卡顿去换。
- **不缓存、只 smooth 化不闪空（拒绝）**：消除闪白但保留每次读盘的等待，治标不治本。

## Consequences

- 极小窗口可能先显示旧内容一瞬（如刚让 Agent 改过当前文件且 run 刷新尚未落地），随后台 revalidate 无感更新。对小说创作正确性影响可忽略：写入路径都会刷新缓存。
- 缓存为内存级、随会话存活，键含项目路径且切/删项目即清，无跨会话持久化、无磁盘占用。
- 后续若实测后台 revalidate 的读盘 I/O 成为瓶颈，可再加「文件 mtime 未变则跳过重读」短路——本 ADR 不预造该层（反过度工程）。
