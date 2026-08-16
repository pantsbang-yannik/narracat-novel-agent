import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'bun:test'

describe('WorkbenchRoute', () => {
  test('does not render the checkpoint resume banner above the workbench stage', () => {
    const source = readFileSync(fileURLToPath(new URL('./workbench.tsx', import.meta.url)), 'utf-8')

    expect(source).not.toContain('CheckpointResumeBanner')
    expect(source).not.toContain('<CheckpointResumeBanner')
  })

  test('keeps the stale-load recovery banner clear of the Windows caption buttons', () => {
    // stale 横幅 absolute 悬浮在舞台上（含 Agent 栏顶部），右端若只退 right-4 会伸进
    // min/max/close 的 caption 区——再进入项目刷新失败时横幅被窗口按钮压住（Windows 适配盲区）。
    const source = readFileSync(fileURLToPath(new URL('./workbench.tsx', import.meta.url)), 'utf-8')

    expect(source).toContain('right-[max(1rem,var(--titlebar-inset-right))]')
    expect(source).not.toContain('absolute left-4 right-4 top-4')
  })

  test('uses one pixel-based resizable workbench grid for sidebar content and Agent widths', () => {
    const source = readFileSync(fileURLToPath(new URL('./workbench.tsx', import.meta.url)), 'utf-8')

    expect(source).not.toContain('react-resizable-panels')
    expect(source).toContain('useWorkbenchPanelLayout')
    expect(source).toContain('workbenchPanelGridTemplates(layout)')
    expect(source).toContain('createWorkbenchPanelDragSession')
    expect(source).toContain('applyWorkbenchPanelLayoutToDom(container, nextLayout)')
    expect(source).toContain('gridTemplateRows: WORKBENCH_GRID_TEMPLATE_ROWS')
    expect(source).toContain('data-workbench-layout-grid="true"')
    expect(source).toContain('data-workbench-sidebar-panel="true"')
    expect(source).toContain('data-workbench-sidebar-resize-handle="true"')
    expect(source).toContain('data-workbench-content-panel="true"')
    expect(source).toContain('agentWidth={layout.agent}')
    expect(source).toContain('onAgentResizeStart={startAgentResize}')
  })

  test('does not let resize sync restore the Agent columns for full-width sections', () => {
    // 拖拽同步是舞台布局的第二条写入路径（直接改 style），漏了它会在用户拖分隔条时
    // 把满宽板块的 Agent 栏塞回来。判定统一走 isFullWidthWorkbenchSection，不再各写字面量。
    const source = readFileSync(fileURLToPath(new URL('./workbench.tsx', import.meta.url)), 'utf-8')

    expect(source).toContain('isFullWidthWorkbenchSection(stage?.dataset.sectionId)')
    expect(source).toContain('WORKBENCH_STAGE_SINGLE_COLUMN_TEMPLATE')
    expect(source).toContain('fullWidthSection ? WORKBENCH_STAGE_SINGLE_COLUMN_TEMPLATE : templates.stage')
  })

  test('persists the resolved work location and routes chapter subviews through the URL', () => {
    const source = readFileSync(fileURLToPath(new URL('./workbench.tsx', import.meta.url)), 'utf-8')

    expect(source).toContain('readWorkbenchChapterView(searchParams)')
    expect(source).toContain('createWorkbenchLocation({')
    expect(source).toContain('writeWorkLocation(')
    expect(source).toContain("next.set('view', view)")
    expect(source).toContain('selectedChapterView={resolvedChapterView}')
  })
})
