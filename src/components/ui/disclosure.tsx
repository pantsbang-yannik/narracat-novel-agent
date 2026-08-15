import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * 通用折叠面板（div + useState 实现，**不用原生 `<details>/<summary>`**）。
 *
 * 为什么禁用原生 details：Windows 打包版（asar + file://）实测渲染原生 `<details>` 元素会把
 * 渲染主线程挂死（无 CPU 的同步阻塞；dev 的非 asar 与 mac 均正常）——Chromium 41 引擎级
 * 问题，纯净 `<details>` 即可复现（2026-08-15 二分定位，见 settings.tsx 历史注释）。
 * 全库统一走本组件；`scripts/check-no-native-details.mjs` 守卫防回归。
 *
 * 语义对齐原生 details 的部分：
 * - 内容常驻 DOM，折叠仅 `hidden`（display:none）——SSR 测试可断言内部内容；
 * - 外层容器上仍渲染调用方传入的 data-*（测试锚点不变）。
 * 差异部分：`group-open:` 变体类不可用（无 open 属性），展开态箭头请用 render-prop 的
 * `open` 参数条件拼类（如 `open && 'rotate-90'`）。
 */
export function Disclosure({
  summary,
  children,
  className,
  defaultOpen = false,
  ...props
}: {
  /** 折叠头内容；render-prop 形式拿到 open 态做箭头旋转等条件样式。 */
  summary: ReactNode | ((open: boolean) => ReactNode)
  children: ReactNode
  className?: string
  defaultOpen?: boolean
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'className'>) {
  const [open, setOpen] = useState(defaultOpen)
  const summaryContent = typeof summary === 'function' ? summary(open) : summary
  return (
    // 外层在展开时显式输出 open 属性（div 上的非标准属性，React 原样透传）：CSS 属性选择器按
    // 「存在性」命中，存量 `group-open:*` 变体类（chevron 旋转等）因此原样生效，调用点零视觉
    // 回归。折叠时刻意不输出（值 "false" 也会被 [open] 误匹配）。
    <div
      className={cn('group', className)}
      {...props}
      {...(open ? ({ open: '' } as Record<string, unknown>) : {})}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-pointer select-none items-center text-left [&::-webkit-details-marker]:hidden"
      >
        {summaryContent}
      </button>
      <div className={cn(!open && 'hidden')}>{children}</div>
    </div>
  )
}
