import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Bookmark, ChevronRight, SendHorizontal } from 'lucide-react'
import { MarkdownRenderer } from '../MarkdownRenderer'
import type { NovelArtifact } from '@shared/types/novel'
import { READING_BODY_FONT_CLASS, WORKBENCH_READING_CANVAS_CLASS } from '@/design-system'
import { Button } from '@/components/ui/button'
import { Disclosure } from '@/components/ui/disclosure'
import { countBodyChars } from '@/lib/word-count'

const DETAILS_SUMMARY_CLASS =
  'flex min-h-10 w-full cursor-pointer select-none items-center py-2 text-sm font-medium text-hint-foreground'
const DETAILS_BODY_CLASS = 'pb-3'
const DETAILS_PANEL_CLASS = 'group border-t border-border text-xs text-muted-foreground'
const DETAIL_ROW_CLASS =
  'grid gap-x-3 border-b border-border/60 py-2.5 last:border-b-0 sm:grid-cols-[6rem_minmax(0,1fr)]'
const SELECTION_TOOLBAR_INSET = 8
const SELECTION_TOOLBAR_GAP = 8
/** 单个浮层按钮的实测最大宽度（含 icon + padding） */
const SELECTION_TOOLBAR_BUTTON_WIDTH = 124
/** 按钮间距，对应浮层里额外按钮的 `ml-1` */
const SELECTION_TOOLBAR_BUTTON_GAP = 4
const SELECTION_TOOLBAR_HEIGHT = 32

/** 钳位宽度须反映实际按钮数——主按钮之外每多一个 extraActions 就多占一份按钮宽 + 间距，
 *  否则「设为本书样章」这类第二按钮会被按单按钮场景算出的钳位挤出正文容器右边缘。 */
function resolveSelectionToolbarWidth(buttonCount: number): number {
  return (
    buttonCount * SELECTION_TOOLBAR_BUTTON_WIDTH +
    Math.max(0, buttonCount - 1) * SELECTION_TOOLBAR_BUTTON_GAP
  )
}

export function ArtifactDocumentShell({
  artifact,
  chapterSummary,
  children,
  fileInfoHidden,
  title,
}: {
  artifact: NovelArtifact
  chapterSummary?: unknown
  children: ReactNode
  /** true 时不渲染「文件信息」块（角色页状态 tab：状态卡自成阅读单元，文件信息属画像语境） */
  fileInfoHidden?: boolean
  title: string
}) {
  // 每次 render 重新 JSON.stringify DTO / 数字统计是无谓开销；按输入引用 memo（ADR-0022）。
  const content = useMemo(
    () => (artifact.data === undefined ? artifact.content ?? '' : JSON.stringify(artifact.data, null, 2)),
    [artifact.data, artifact.content],
  )
  const readableUnits = useMemo(() => countReadableUnits(content), [content])

  return (
    <section
      aria-label={title}
      className={WORKBENCH_READING_CANVAS_CLASS}
      data-reading-canvas="true"
    >
      {children}
      {chapterSummary !== undefined && (
        <Disclosure className={`${DETAILS_PANEL_CLASS} mt-8`} data-chapter-summary="true" summary={<DetailSummary>本章总结</DetailSummary>}>
          <div className={DETAILS_BODY_CLASS}>
            <StructuredMetadataValue value={chapterSummary} />
          </div>
        </Disclosure>
      )}
      {!fileInfoHidden && (
        <Disclosure
          className={`${DETAILS_PANEL_CLASS} ${chapterSummary === undefined ? 'mt-8' : ''}`}
          data-reading-metadata="true"
          summary={<DetailSummary>文件信息</DetailSummary>}
        >
          <dl className={DETAILS_BODY_CLASS}>
            <DetailRow label="来源" type="file">
              NarraCat 输出
            </DetailRow>
            <DetailRow label="路径" type="file">
              <span className="break-all font-mono [overflow-wrap:anywhere]">{artifact.path || '未记录'}</span>
            </DetailRow>
            <DetailRow label="字数" type="file">
              <span className="tabular">{readableUnits}</span>
            </DetailRow>
            <DetailRow label="生成状态" type="file">
              已生成
            </DetailRow>
          </dl>
        </Disclosure>
      )}
    </section>
  )
}

export interface MarkdownSelectionHandoff {
  enabled: boolean
  label?: string
  onHandoff: (selectedText: string) => void
  /** 主动作之外的附加动作（正文页的「设为本书样章」）；不传则浮层与从前完全一致 */
  extraActions?: Array<{ label: string; onAction: (selectedText: string) => void }>
}

export function ArtifactDocumentBody({
  children,
  mono = false,
  selectionHandoff,
}: {
  children: ReactNode
  mono?: boolean
  selectionHandoff?: MarkdownSelectionHandoff | null
}) {
  if (!mono && typeof children === 'string') {
    return (
      <MarkdownSelectionSurface handoff={selectionHandoff}>
        <MarkdownRenderer text={children} variant="document" />
      </MarkdownSelectionSurface>
    )
  }

  return (
    <div className="min-w-0">
      <div
        className={
          mono
            ? 'max-w-full overflow-auto whitespace-pre-wrap break-words rounded-row border border-border bg-active p-4 font-mono text-xs leading-6 text-body-foreground [overflow-wrap:anywhere]'
            : `whitespace-pre-wrap break-words ${READING_BODY_FONT_CLASS} leading-8 text-body-foreground [overflow-wrap:anywhere]`
        }
      >
        {children}
      </div>
    </div>
  )
}

function MarkdownSelectionSurface({
  children,
  handoff,
}: {
  children: ReactNode
  handoff?: MarkdownSelectionHandoff | null
}) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<{ text: string; left: number; top: number } | null>(null)
  const enabled = handoff?.enabled === true

  const clearSelectionWhenInvalid = useCallback(() => {
    if (!enabled) {
      setSelection(null)
      return
    }

    const surface = surfaceRef.current
    const browserSelection = typeof window === 'undefined' ? null : window.getSelection()

    if (!surface || !browserSelection || !isSelectionInsideElement(browserSelection, surface)) {
      setSelection(null)
      return
    }

    if (!browserSelection.toString().trim()) {
      setSelection(null)
    }
  }, [enabled])

  const updateSelection = useCallback(() => {
    if (!enabled) {
      setSelection(null)
      return
    }

    const surface = surfaceRef.current
    const browserSelection = typeof window === 'undefined' ? null : window.getSelection()

    if (!surface || !browserSelection || !isSelectionInsideElement(browserSelection, surface)) {
      setSelection(null)
      return
    }

    const selectedText = browserSelection.toString().trim()
    if (!selectedText) {
      setSelection(null)
      return
    }

    const buttonCount = 1 + (handoff?.extraActions?.length ?? 0)
    setSelection({
      text: selectedText,
      ...resolveSelectionToolbarAnchor(browserSelection, surface, resolveSelectionToolbarWidth(buttonCount)),
    })
  }, [enabled, handoff?.extraActions?.length])

  useEffect(() => {
    if (!enabled) {
      setSelection(null)
      return
    }

    document.addEventListener('selectionchange', clearSelectionWhenInvalid)
    window.addEventListener('resize', updateSelection)
    window.addEventListener('scroll', updateSelection, true)

    return () => {
      document.removeEventListener('selectionchange', clearSelectionWhenInvalid)
      window.removeEventListener('resize', updateSelection)
      window.removeEventListener('scroll', updateSelection, true)
    }
  }, [clearSelectionWhenInvalid, enabled, updateSelection])

  function handleHandoff() {
    if (!selection) return
    handoff?.onHandoff(selection.text)
    setSelection(null)
  }

  return (
    <div
      ref={surfaceRef}
      className="relative min-w-0"
      data-markdown-selection-surface={enabled ? 'true' : 'disabled'}
      onMouseDown={(event) => {
        if (event.target instanceof Element && event.target.closest('[data-markdown-selection-handoff="true"]')) {
          return
        }

        setSelection(null)
      }}
      onMouseUp={updateSelection}
      onKeyUp={updateSelection}
    >
      {children}
      {selection && (
        <div
          className="pointer-events-none absolute z-20 flex -translate-y-1/2"
          data-markdown-selection-toolbar="true"
          style={{ left: selection.left, top: selection.top }}
        >
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="pointer-events-auto h-8 rounded-full border border-border bg-surface/95 px-3 text-xs font-medium shadow-[var(--shadow-selection-toolbar)] backdrop-blur hover:bg-hover"
            data-markdown-selection-handoff="true"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleHandoff}
          >
            <SendHorizontal className="size-3.5" />
            {handoff?.label ?? '交给 Agent'}
          </Button>
          {handoff?.extraActions?.map((action) => (
            <Button
              key={action.label}
              type="button"
              size="sm"
              variant="secondary"
              className="pointer-events-auto ml-1 h-8 rounded-full border border-border bg-surface/95 px-3 text-xs font-medium shadow-[var(--shadow-selection-toolbar)] backdrop-blur hover:bg-hover"
              data-markdown-selection-handoff="true"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                action.onAction(selection.text)
                setSelection(null)
              }}
            >
              <Bookmark className="size-3.5" />
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

export function isSelectionInsideElement(selection: Selection, element: HTMLElement): boolean {
  if (selection.rangeCount === 0 || selection.isCollapsed) return false

  const range = selection.getRangeAt(0)
  return elementContainsNode(element, range.startContainer) && elementContainsNode(element, range.endContainer)
}

function elementContainsNode(element: HTMLElement, node: Node): boolean {
  return node === element || element.contains(node)
}

function resolveSelectionToolbarAnchor(
  selection: Selection,
  surface: HTMLElement,
  toolbarWidth: number,
): { left: number; top: number } {
  const surfaceRect = surface.getBoundingClientRect()
  const range = selection.getRangeAt(0)
  const selectionRects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0)
  const fallbackRect = range.getBoundingClientRect()

  return resolveSelectionToolbarAnchorFromRects({
    selectionRects: selectionRects.length > 0 ? selectionRects : [fallbackRect],
    surfaceRect,
    toolbarWidth,
  })
}

export function resolveSelectionToolbarAnchorFromRects({
  selectionRects,
  surfaceRect,
  toolbarWidth = SELECTION_TOOLBAR_BUTTON_WIDTH,
}: {
  selectionRects: Array<Pick<DOMRect, 'height' | 'left' | 'right' | 'top' | 'width'>>
  surfaceRect: Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>
  /** 浮层实际宽度（按钮数决定）；不传按单按钮场景计算，与从前行为一致 */
  toolbarWidth?: number
}): { left: number; top: number } {
  const lastRect = selectionRects[selectionRects.length - 1]
  const minLeft = SELECTION_TOOLBAR_INSET
  const maxLeft = Math.max(minLeft, surfaceRect.width - toolbarWidth - SELECTION_TOOLBAR_INSET)
  const selectionEnd = lastRect.right - surfaceRect.left + SELECTION_TOOLBAR_GAP
  const left = Math.max(minLeft, Math.min(selectionEnd, maxLeft))
  const halfToolbarHeight = SELECTION_TOOLBAR_HEIGHT / 2
  const minTop = SELECTION_TOOLBAR_INSET + halfToolbarHeight
  const maxTop = Math.max(minTop, surfaceRect.height - halfToolbarHeight - SELECTION_TOOLBAR_INSET)
  const selectionMiddle = lastRect.top + lastRect.height / 2 - surfaceRect.top
  const top = Math.max(minTop, Math.min(selectionMiddle, maxTop))

  return { left, top }
}

function countReadableUnits(content: string): string {
  return `${new Intl.NumberFormat('zh-CN').format(countBodyChars(content))}`
}

function DetailSummary({ children }: { children: ReactNode }) {
  return (
    <span className={DETAILS_SUMMARY_CLASS}>
      <ChevronRight
        aria-hidden="true"
        className="mr-2 size-4 shrink-0 transition-transform group-open:rotate-90"
        data-details-chevron="true"
      />
      <span>{children}</span>
    </span>
  )
}

function DetailRow({
  children,
  label,
  type,
}: {
  children: ReactNode
  label: string
  type: 'file' | 'metadata'
}) {
  return (
    <div
      className={DETAIL_ROW_CLASS}
      data-file-info-row={type === 'file' ? 'true' : undefined}
      data-metadata-row={type === 'metadata' ? 'true' : undefined}
    >
      <dt className="text-hint-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-muted-foreground [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

function StructuredMetadataValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">无</span>

    return (
      <ul className="list-disc pl-4">
        {value.map((item, index) => (
          <li className="border-b border-border/60 py-1.5 pl-1 last:border-b-0" key={index}>
            <StructuredMetadataValue value={item} />
          </li>
        ))}
      </ul>
    )
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) return <span className="text-muted-foreground">无</span>

    return (
      <dl>
        {entries.map(([key, item]) => (
          <DetailRow key={key} label={formatMetadataLabel(key)} type="metadata">
            <StructuredMetadataValue value={item} />
          </DetailRow>
        ))}
      </dl>
    )
  }

  return <span className="text-muted-foreground">{formatMetadataPrimitive(value)}</span>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatMetadataLabel(key: string): string {
  const labels: Record<string, string> = {
    chapter: '章节',
    chapter_num: '章节',
    chapter_summary: '摘要',
    chapter_title: '标题',
    characters_appeared: '出场角色',
    characters: '角色',
    cliffhanger: '悬念结尾',
    emotional_arc: '情绪弧线',
    emotional_tone: '情感基调',
    events: '事件',
    foreshadowing_touched: '触及伏笔',
    key_events: '关键事件',
    name: '姓名',
    new_characters: '新登场角色',
    pov_character: '视角角色',
    state: '状态',
    summary: '摘要',
    timeline: '时间线',
    title: '标题',
    value_shift: '价值转换',
    vol_num: '卷',
    word_count: '字数',
  }

  return labels[key] ?? key.replace(/[_-]+/g, ' ')
}

function formatMetadataPrimitive(value: unknown): string {
  if (value === null) return '未记录'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return new Intl.NumberFormat('zh-CN').format(value)
  if (typeof value === 'string') return value
  return String(value)
}
