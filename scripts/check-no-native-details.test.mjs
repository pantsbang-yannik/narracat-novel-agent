import { describe, expect, test } from 'bun:test'
import { collectNativeDetailsViolations } from './check-no-native-details.mjs'

describe('collectNativeDetailsViolations（Windows asar 冻结守卫）', () => {
  test('JSX <details>/<summary> 判违规（含自闭合与属性形态）', () => {
    const violations = collectNativeDetailsViolations({
      files: [
        { path: 'a.tsx', content: 'export const X = () => (\n  <details className="x">\n    <summary>标题</summary>\n  </details>\n)' },
        { path: 'b.tsx', content: 'render(<details data-x="1">y</details>)' },
      ],
    })
    expect(violations.map((v) => v.file)).toEqual(['a.tsx', 'a.tsx', 'a.tsx', 'b.tsx'])
    expect(violations[0].line).toBe(2)
  })

  test('注释与字符串里的 details 字样不误报（JSDoc/行注释/JSX 注释/文案字符串）', () => {
    const violations = collectNativeDetailsViolations({
      files: [
        {
          path: 'c.tsx',
          content: [
            '/**',
            ' * 为什么不用原生 <details>：Windows asar 冻结。',
            ' */',
            '// <summary> 注释里的也不算',
            'const s = "文本里的 <details> 字样"',
            'const t = `模板串 <summary> 也不算`',
            'export const Ok = () => <div>safe</div>',
          ].join('\n'),
        },
      ],
    })
    expect(violations).toEqual([])
  })

  test('JSX 注释块 {/* <details> */} 不误报；真实 JSX 紧随其后仍能抓到', () => {
    const clean = collectNativeDetailsViolations({
      files: [{ path: 'd.tsx', content: '{/* <details> 注释 */}\n<div>ok</div>' }],
    })
    expect(clean).toEqual([])

    const dirty = collectNativeDetailsViolations({
      files: [{ path: 'e.tsx', content: '{/* 说明 */}\n<details open>x</details>' }],
    })
    expect(dirty).toHaveLength(1)
  })

  test('字符串内 // 不当成注释开头吞掉后续代码（URL 场景）', () => {
    const violations = collectNativeDetailsViolations({
      files: [
        {
          path: 'f.tsx',
          content: 'const url = "https://example.com/a"\nrender(<details>x</details>)',
        },
      ],
    })
    // 字符串里的 // 被正确跳过，第二行的 details（同行开+闭）报一处。
    expect(violations).toHaveLength(1)
    expect(violations[0].line).toBe(2)
  })
})
