// Disclosure 真实 DOM 交互测试（点击展开/折叠）。
//
// 为什么单独一个文件、且不与 disclosure.test.tsx 合并：那份走 renderToStaticMarkup，不需要
// DOM；而全局挂载必须发生在 @testing-library/react 被 import 之前，ES import 又会提升到模块
// 顶部——只能靠「先同步挂全局，再顶层 await 动态 import」，这条纪律会污染同文件里的普通用例。
//
// 为什么不用 GlobalRegistrator：本仓同进程安全共存上限 = 4（已被 ChapterManuscriptView.interactions /
// StateChangesLedger / AgentThreadView.interactions / BookVoiceAnchors 占满），追加会让它们集体
// 失败。改走 UpdateRow.test.tsx / WizardView.mount.test.tsx 的先例：手动把 happy-dom 的
// Window/Document 挂到 globalThis，afterAll 恢复。
//
// 为什么查询一律走 container.querySelector：@testing-library/dom 的 screen 是进程级单例，模块
// 首次求值时把查询函数焊死在当时的 document.body 上，同进程多个 DOM 测试文件会互相打空。
import { Window } from 'happy-dom'

const happyWindow = new Window()
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
Object.defineProperty(globalThis, 'window', { configurable: true, value: happyWindow })
Object.defineProperty(globalThis, 'document', { configurable: true, value: happyWindow.document })
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { afterAll, afterEach, describe, expect, test } = await import('bun:test')
const { cleanup, fireEvent, render } = await import('@testing-library/react')
const { Disclosure } = await import('./disclosure.tsx')

afterEach(() => {
  cleanup()
})

afterAll(async () => {
  if (originalWindowDescriptor) Object.defineProperty(globalThis, 'window', originalWindowDescriptor)
  else Reflect.deleteProperty(globalThis, 'window')
  if (originalDocumentDescriptor) Object.defineProperty(globalThis, 'document', originalDocumentDescriptor)
  else Reflect.deleteProperty(globalThis, 'document')
  await happyWindow.happyDOM.close()
})

describe('Disclosure 交互', () => {
  test('点击切换：open 属性、内容 hidden、aria-expanded 三者同步', () => {
    const { container } = render(
      <Disclosure summary={<span>头</span>} data-test-anchor="true">
        <div data-test-body="true">体</div>
      </Disclosure>,
    )
    const root = container.querySelector('[data-test-anchor]') as HTMLElement
    const body = container.querySelector('[data-test-body]')?.parentElement as HTMLElement
    const button = container.querySelector('button') as HTMLElement

    // 折叠态：group-open:* 靠 open 属性存在性命中，所以折叠时必须没有该属性。
    expect(root.hasAttribute('open')).toBe(false)
    expect(body.className).toContain('hidden')
    expect(button.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(button)
    expect(root.getAttribute('open')).toBe('')
    expect(body.className).not.toContain('hidden')
    expect(button.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(button)
    expect(root.hasAttribute('open')).toBe(false)
    expect(body.className).toContain('hidden')
  })

  test('defaultOpen 直接进展开态', () => {
    const { container } = render(
      <Disclosure defaultOpen summary={<span>头</span>} data-test-anchor="true">
        <div>体</div>
      </Disclosure>,
    )
    expect((container.querySelector('[data-test-anchor]') as HTMLElement).getAttribute('open')).toBe('')
  })

  test('summary 传函数时拿得到 open 态（关于页「展开/收起」文案靠它）', () => {
    const { container } = render(
      <Disclosure summary={(open) => <span>{open ? '收起' : '展开'}</span>}>
        <div>体</div>
      </Disclosure>,
    )
    const button = container.querySelector('button') as HTMLElement
    expect(button.textContent).toBe('展开')
    fireEvent.click(button)
    expect(button.textContent).toBe('收起')
  })

  test('调用方的 className 与 data-* 锚点保留在外层，group 类不丢', () => {
    const { container } = render(
      <Disclosure className="my-panel" summary={<span>头</span>} data-test-anchor="true">
        <div>体</div>
      </Disclosure>,
    )
    const root = container.querySelector('[data-test-anchor]') as HTMLElement
    expect(root.className).toContain('group')
    expect(root.className).toContain('my-panel')
  })
})
