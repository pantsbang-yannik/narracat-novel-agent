import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { MUTED_PILL_CLASS } from '@/design-system'
import { Disclosure } from '@/components/ui/disclosure'
import type { ChapterCapabilityReceiptData } from '@shared/types/capability-pack'

// 结果语言标签：回执按「产出的东西是什么语言」分类，而非包内部字段名（spec §4.4）。
const TYPE_LABELS: Record<string, string> = {
  persona: '写作声音',
  craft: '写作手法',
  structure: '剧作方法',
  benchmark: '对标标准',
}

// 折叠区排版对齐 ArtifactDocumentShell 既有「文件信息」/「本章总结」折叠区（同一套 details/summary 词汇）。
const DETAILS_PANEL_CLASS = 'group border-t border-border text-xs text-muted-foreground'
const DETAILS_SUMMARY_CLASS =
  'flex min-h-10 w-full cursor-pointer select-none items-center py-2 text-sm font-medium text-hint-foreground'
const DETAILS_BODY_CLASS = 'space-y-1.5 pb-3'
const ENTRY_ROW_CLASS =
  'flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 py-1.5 last:border-b-0'

/**
 * 章节正文视图正文区下方折叠区「本章使用的能力（N）」（B2 刀1 Task 9b，spec §4.4）。
 *
 * 默认收起；回执文件缺失（旧章/未跑过写作流）或条目与警告均为空 → 返回 null 什么都不渲染（克制无空态）。
 * 条目行只展示「用了哪张卡」的元信息（类型 / 卡名 / 来源包 / 入选原因），绝不展示卡正文（展示边界，spec §6）。
 */
export function ChapterCapabilityReceipt({
  projectPath,
  chapter,
}: {
  projectPath: string
  chapter: number
}) {
  const [receipt, setReceipt] = useState<ChapterCapabilityReceiptData | null>(null)

  useEffect(() => {
    let cancelled = false
    setReceipt(null)
    void window.electron.getChapterCapabilityReceipt({ projectPath, chapter }).then((next) => {
      if (!cancelled) setReceipt(next)
    })
    return () => {
      cancelled = true
    }
  }, [projectPath, chapter])

  if (!receipt || (receipt.entries.length === 0 && receipt.warnings.length === 0)) return null

  return (
    <Disclosure
      className={`${DETAILS_PANEL_CLASS} mt-8`}
      data-chapter-capability-receipt="true"
      summary={
        <span className={DETAILS_SUMMARY_CLASS}>
          <ChevronRight
            aria-hidden="true"
            className="mr-2 size-4 shrink-0 transition-transform group-open:rotate-90"
          />
          <span>本章使用的能力（{receipt.entries.length}）</span>
        </span>
      }
    >
      <div className={DETAILS_BODY_CLASS}>
        {receipt.entries.map((entry, index) => (
          <div
            key={`${entry.pack_id}-${entry.card_id}-${index}`}
            className={ENTRY_ROW_CLASS}
            data-chapter-capability-receipt-entry="true"
          >
            <span className={MUTED_PILL_CLASS}>{TYPE_LABELS[entry.type] ?? entry.type}</span>
            <span className="font-medium text-foreground">{entry.card_id}</span>
            <span className="text-muted-foreground">
              {entry.origin === 'official' ? entry.pack_id : `${entry.pack_id} @${entry.pack_version}`}
            </span>
            <span className="text-muted-foreground">{entry.reason}</span>
          </div>
        ))}
        {receipt.warnings.map((warning, index) => (
          <p
            key={`warning-${index}`}
            className="pt-1 text-hint-foreground"
            data-chapter-capability-receipt-warning="true"
          >
            {warning}
          </p>
        ))}
      </div>
    </Disclosure>
  )
}
