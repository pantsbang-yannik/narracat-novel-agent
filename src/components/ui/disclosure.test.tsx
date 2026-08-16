import { test, expect } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Disclosure } from './disclosure'

test('展开态输出 open 属性，group-open:* 样式才能命中', () => {
  const html = renderToStaticMarkup(
    <Disclosure defaultOpen summary={<span>头</span>}>
      <div>体</div>
    </Disclosure>,
  )
  expect(html).toContain('open=""')
})

test('折叠态不输出 open 属性', () => {
  const html = renderToStaticMarkup(
    <Disclosure summary={<span>头</span>}>
      <div>体</div>
    </Disclosure>,
  )
  expect(html).not.toContain('open=""')
})
