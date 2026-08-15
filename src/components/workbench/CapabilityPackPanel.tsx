import { useCallback, useEffect, useMemo, useState } from 'react'
import { BadgeCheck, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Disclosure } from '@/components/ui/disclosure'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  PACK_DETAIL_DIALOG_BODY_CLASS,
  PACK_DETAIL_DIALOG_CONTENT_CLASS,
  PACK_DETAIL_DIALOG_HEADER_CLASS,
  PackDetailContent,
} from '@/components/packs/PackDetailContent'
import { MUTED_PILL_CLASS, WARNING_PILL_CLASS } from '@/design-system'
import { cn } from '@/lib/cn'
import { compareSemver, STRUCTURE_STAGES, STRUCTURE_STAGE_LABELS } from '@shared/types/capability-pack'
import type {
  CapabilityPackDetail,
  CapabilityPackSummary,
  LocalPackContent,
  NovelPacksEntry,
  PlanningCapabilityReceiptData,
} from '@shared/types/capability-pack'

// 方型圆角图标容器：与设置页 CapabilityPackLibraryPanel 共享的行图标词汇。
const PACK_ICON_TILE_CLASS = 'flex size-10 shrink-0 items-center justify-center rounded-row'

// 页头对齐工作台内容区既有规范（WorkbenchObjectHeader / WorkbenchStatusPanel）：h-14、纯标题、可拖拽窗口区。
const PANEL_HEADER_CLASS =
  'flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-workspace px-5 [-webkit-app-region:drag]'

const OFFICIAL_BASE_PACK_ID = 'official-base'
const OFFICIAL_BASE_WARNING = '关闭官方基础包会显著降低成稿质量下限，仅在你有替代能力包时使用。'

/**
 * 书详情「能力包」启用面板（B2 刀1，ADR-0034 v1.1，工作台 packs 板块）。
 *
 * 每个 pack id 一行开关：勾选状态 = enabled 含其 id，变更立即 setNovelPacks（写盘即生效，无保存按钮）。
 * 双轨版本制：勾选官方内置包写 `{ id }`（不锁版本，随引擎走）；勾选用户包写 `{ id, version: 已装最新版 }`（锁定）。
 * 已启用用户包三态（按 SemVer 优先级判定，`compareSemver`）：①锁点版本已装且落后于最新版 → 行内「有新版本
 * x.y.z」提示 + 升级按钮（点击才改锁点，绝不静默升级）；②锁点版本未安装（如已被卸载）→「当前锁定版本 x.y.z
 * 未安装」+「改用已装版本」按钮（显式改锁动作，不叫「升级」，因版本号可能是回退）；③其余无提示。
 * 关闭 official-base → 行下方常驻质量警告（允许关闭，花归用户，不做确认弹窗）。
 * 行主体（包名/署名区）可点开只读详情 Dialog（复用 PackDetailContent，无 actions——操作回设置页包库）；
 * Switch 与升级/改锁按钮点击区与行主体分离，不受详情弹窗影响。
 * 展示边界（刀3 §4.3）：非本机产物（导入包）不露卡正文；本机产物（created/learned-own/learned-external）
 * 经 `getLocalPackContent` 白名单通道读取正文展示——与设置页 `PackDetailView` 同一条边界，不因承载页面
 * 不同而漂移。
 */
export function CapabilityPackPanel({ projectPath }: { projectPath: string }) {
  const [packs, setPacks] = useState<CapabilityPackSummary[]>([])
  const [enabled, setEnabled] = useState<NovelPacksEntry[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [detailTarget, setDetailTarget] = useState<{ id: string; version: string } | null>(null)
  const [detail, setDetail] = useState<CapabilityPackDetail | null>(null)
  // 本机产物正文（刀3 §4.3，与设置页 PackDetailView 同一条边界）：只在 origin='user' 时拉取，
  // null（imported/官方）不传给 PackDetailContent，维持导入包不露正文的展示降维。
  const [localContent, setLocalContent] = useState<LocalPackContent | null>(null)
  // 规划期装载回执（B2 刀3 Task 13）：候选池全量装载记录，按 stage 分组展示，空则整区不渲染。
  const [planningReceipts, setPlanningReceipts] = useState<PlanningCapabilityReceiptData[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [nextPacks, novelPacks, receipts] = await Promise.all([
          window.electron.listCapabilityPacks(),
          window.electron.getNovelPacks({ projectPath }),
          window.electron.getPlanningCapabilityReceipts({ projectPath }),
        ])
        if (cancelled) return
        setPacks(nextPacks)
        setEnabled(novelPacks.enabled)
        setPlanningReceipts(receipts)
        setLoadError(null)
      } catch {
        if (!cancelled) setLoadError('加载能力包失败，请重试。')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectPath])

  // 按 STRUCTURE_STAGES 固定顺序排列，只保留有装载记录的阶段（克制：无候选池全量装载时整区不渲染）。
  const stagedReceipts = useMemo(
    () =>
      STRUCTURE_STAGES.map((stage) => planningReceipts.find((receipt) => receipt.stage === stage)).filter(
        (receipt): receipt is PlanningCapabilityReceiptData => receipt !== undefined && receipt.entries.length > 0,
      ),
    [planningReceipts],
  )

  // 行点开详情：按 detailTarget（id+version）拉取，not-found（如详情打开期间被卸载）时关弹窗。
  // alive 标志防竞态：切换目标/关闭弹窗后，旧请求的迟到结果不得覆盖新状态。
  useEffect(() => {
    if (!detailTarget) return
    let alive = true
    window.electron
      .getCapabilityPackDetail({ id: detailTarget.id, version: detailTarget.version })
      .then((result) => {
        if (!alive) return
        if (result.status === 'ok') setDetail(result.detail)
        else {
          setDetailTarget(null)
          setDetail(null)
        }
      })
      .catch(() => {
        if (alive) {
          setDetailTarget(null)
          setDetail(null)
        }
      })
    return () => {
      alive = false
    }
  }, [detailTarget])

  // 本机正文拉取（同 PackDetailView 先例）：随 detail 更新（含版本切换）重新拉，alive 标志防竞态。
  useEffect(() => {
    if (!detail || detail.origin !== 'user') {
      setLocalContent(null)
      return
    }
    let alive = true
    window.electron
      .getLocalPackContent({ id: detail.manifest.id, version: detail.manifest.version })
      .then((result) => {
        if (alive) setLocalContent(result)
      })
      .catch(() => {
        if (alive) setLocalContent(null)
      })
    return () => {
      alive = false
    }
  }, [detail])

  // 按 id 分组全部已装版本；用户包多版本并存时该行按「已装最新版」展示（numeric 版本号比较）。
  const versionsById = useMemo(() => {
    const map = new Map<string, CapabilityPackSummary[]>()
    for (const pack of packs) map.set(pack.id, [...(map.get(pack.id) ?? []), pack])
    return map
  }, [packs])

  // 每个 pack id 一行：去重取首次出现顺序（listCapabilityPacks 先返回官方目录再用户目录，天然官方在前）。
  const packIds = useMemo(() => {
    const seen = new Set<string>()
    const ids: string[] = []
    for (const pack of packs) {
      if (seen.has(pack.id)) continue
      seen.add(pack.id)
      ids.push(pack.id)
    }
    return ids
  }, [packs])

  const newestOf = useCallback(
    (id: string) => [...(versionsById.get(id) ?? [])].sort((a, b) => compareSemver(a.version, b.version)).at(-1),
    [versionsById],
  )

  const persist = useCallback(
    async (next: NovelPacksEntry[]) => {
      setEnabled(next)
      await window.electron.setNovelPacks({ projectPath, enabled: next })
    },
    [projectPath],
  )

  // 写回基线：只保留当前仍已安装的 id——enabled 里存在但未安装的条目（如包已在设置页被卸载）
  // 在下一次任意写回时随之自然丢弃，无需额外清理动作（引擎侧本就 fail-soft 兜底）。
  const sanitizedEnabled = useMemo(
    () => enabled.filter((entry) => packIds.includes(entry.id)),
    [enabled, packIds],
  )

  const toggle = useCallback(
    async (id: string) => {
      if (busyId) return
      setBusyId(id)
      try {
        if (sanitizedEnabled.some((entry) => entry.id === id)) {
          await persist(sanitizedEnabled.filter((entry) => entry.id !== id))
          return
        }
        const isOfficial = (versionsById.get(id) ?? []).some((pack) => pack.origin === 'official')
        await persist([
          ...sanitizedEnabled,
          isOfficial ? { id } : { id, version: newestOf(id)?.version ?? '' },
        ])
      } finally {
        setBusyId(null)
      }
    },
    [busyId, sanitizedEnabled, persist, versionsById, newestOf],
  )

  const upgradePin = useCallback(
    async (id: string, version: string) => {
      if (busyId) return
      setBusyId(id)
      try {
        await persist(sanitizedEnabled.map((entry) => (entry.id === id ? { id, version } : entry)))
      } finally {
        setBusyId(null)
      }
    },
    [busyId, sanitizedEnabled, persist],
  )

  return (
    <div className="flex h-full min-h-0 flex-col" data-capability-pack-panel="true">
      <header className={PANEL_HEADER_CLASS} data-workbench-titlebar="true">
        <h1 className="truncate text-sm font-semibold text-foreground">能力包</h1>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 px-6 py-5 sm:px-8 sm:py-6">
          <p className="text-xs leading-5 text-muted-foreground">
            为本书启用的能力包会在写作时提供文风、手法与结构支持，改动立即生效，无需保存。
          </p>

          {loadError ? (
            <p className="text-xs leading-5 text-destructive" data-capability-pack-panel-error="true">
              {loadError}
            </p>
          ) : null}

          <div className="space-y-2">
            {packIds.map((id) => {
              const pack = newestOf(id)
              if (!pack) return null

              const entry = sanitizedEnabled.find((candidate) => candidate.id === id)
              const isEnabled = Boolean(entry)
              const isOfficial = pack.origin === 'official'
              const installedVersions = versionsById.get(id) ?? []
              // 三态（非官方且勾选时才判定）：锁点版本已装且落后于最新版 → 升级；
              // 锁点版本未安装（如包已被卸载）→ 提示改用已装版本（明确动作，非「升级」）；否则无提示。
              const pinnedInstalled = Boolean(
                entry?.version && installedVersions.some((p) => p.version === entry.version),
              )
              const hasUpgrade = !isOfficial && pinnedInstalled && compareSemver(pack.version, entry!.version!) > 0
              const pinnedMissing = !isOfficial && Boolean(entry?.version) && !pinnedInstalled

              return (
                <div key={id} data-capability-pack-panel-row={id}>
                  <div
                    className="flex items-center gap-3 rounded-row border border-border bg-surface px-3 py-2.5"
                    data-capability-pack-panel-origin={pack.origin}
                  >
                    <div
                      className={cn(
                        PACK_ICON_TILE_CLASS,
                        isOfficial
                          ? 'border border-brand-border bg-brand-soft text-brand'
                          : 'border border-border bg-active text-muted-foreground',
                      )}
                      aria-hidden="true"
                    >
                      {isOfficial ? <BadgeCheck className="size-5" /> : <Package className="size-5" />}
                    </div>

                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      data-capability-pack-open-detail={pack.id}
                      onClick={() => setDetailTarget({ id: pack.id, version: pinnedMissing ? pack.version : (entry?.version ?? pack.version) })}
                    >
                      <div className="truncate text-sm font-medium leading-tight text-foreground">{pack.name}</div>
                      <div className="mt-0.5 truncate text-xs leading-5 text-muted-foreground">
                        {isOfficial ? pack.author : `${pack.author} · v${entry?.version ?? pack.version}`}
                      </div>
                    </button>

                    <div className="flex shrink-0 items-center gap-2">
                      <span className={MUTED_PILL_CLASS}>{isOfficial ? '官方' : '用户'}</span>

                      {hasUpgrade ? (
                        <>
                          <span className={WARNING_PILL_CLASS} data-capability-pack-panel-upgrade-hint={id}>
                            有新版本 {pack.version}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-capability-pack-panel-upgrade={id}
                            onClick={() => void upgradePin(id, pack.version)}
                          >
                            升级
                          </Button>
                        </>
                      ) : null}

                      {pinnedMissing ? (
                        <>
                          <span className={WARNING_PILL_CLASS} data-capability-pack-panel-pinned-missing-hint={id}>
                            当前锁定版本 {entry?.version} 未安装
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-capability-pack-panel-relock={id}
                            onClick={() => void upgradePin(id, pack.version)}
                          >
                            改用已装版本 {pack.version}
                          </Button>
                        </>
                      ) : null}

                      <Switch
                        aria-label={`启用${pack.name}`}
                        checked={isEnabled}
                        disabled={busyId === id}
                        data-capability-pack-panel-toggle={id}
                        onCheckedChange={() => void toggle(id)}
                      />
                    </div>
                  </div>

                  {id === OFFICIAL_BASE_PACK_ID && !isEnabled ? (
                    <p
                      className="mt-1.5 px-1 text-xs leading-5 text-destructive"
                      data-capability-pack-panel-official-base-warning="true"
                    >
                      {OFFICIAL_BASE_WARNING}
                    </p>
                  ) : null}
                </div>
              )
            })}

            {packIds.length === 0 ? (
              <div
                className="flex min-h-[56px] items-center rounded-row border border-dashed border-border px-3 py-3 text-sm leading-6 text-muted-foreground"
                data-capability-pack-panel-empty="true"
              >
                暂无可用能力包，请先在设置页导入。
              </div>
            ) : null}
          </div>

          {stagedReceipts.length > 0 ? (
            <Disclosure
              className="rounded-row border border-border bg-surface"
              data-capability-pack-panel-planning-receipts="true"
              summary={
                <span className="cursor-pointer px-3 py-2.5 text-sm font-medium leading-6 text-foreground">
                  规划期装载的剧作方法
                </span>
              }
            >
              <div className="space-y-3 border-t border-border px-3 py-3">
                {stagedReceipts.map((receipt) => (
                  <div key={receipt.stage} className="space-y-1.5" data-capability-pack-panel-planning-stage={receipt.stage}>
                    <p className="text-xs font-medium leading-5 text-muted-foreground">
                      {STRUCTURE_STAGE_LABELS[receipt.stage]}
                    </p>
                    <div className="space-y-1">
                      {receipt.entries.map((entry) => (
                        <div
                          key={entry.card_id}
                          className="rounded-row border border-border bg-active/40 px-3 py-2"
                        >
                          <div className="text-sm leading-6 text-foreground">{entry.one_line}</div>
                          <div className="mt-0.5 text-xs leading-5 text-muted-foreground">
                            来源：{entry.pack_id}@{entry.pack_version}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Disclosure>
          ) : null}
        </div>
      </ScrollArea>

      {detailTarget && detail ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setDetailTarget(null)
              setDetail(null)
            }
          }}
        >
          <DialogContent className={PACK_DETAIL_DIALOG_CONTENT_CLASS}>
            <DialogHeader className={PACK_DETAIL_DIALOG_HEADER_CLASS}>
              <DialogTitle className="text-lg leading-tight">能力包详情</DialogTitle>
              <DialogDescription className="sr-only">{detail.manifest.name} 的卡片清单与说明。</DialogDescription>
            </DialogHeader>
            <div className={PACK_DETAIL_DIALOG_BODY_CLASS}>
              <PackDetailContent
                detail={detail}
                selectedVersion={detail.manifest.version}
                onSelectVersion={(version) => setDetailTarget({ id: detailTarget.id, version })}
                localCards={localContent?.cards}
                localSource={detail.localSource}
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
