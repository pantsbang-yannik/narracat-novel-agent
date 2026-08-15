// 全库禁用原生 <details>/<summary> JSX（Windows asar 冻结守卫）。
//
// 背景：Chromium 41 在 Windows 打包版（asar + file://）渲染原生 <details> 元素会把渲染主线程
// 挂死（无 CPU 同步阻塞；dev 非 asar 与 mac 均正常）。2026-08-15 二分定位（纯净 <details>
// 即可复现，与业务代码无关）。全库统一改走 src/components/ui/disclosure.tsx（div+useState，
// 外层展开时输出 open 属性兼容 group-open:* 样式）。
//
// 本脚本扫描 src/**/*.tsx 的 JSX <details / <summary（剥离注释后），出现即 fail——防止将来
// 合并上游代码把原生 details 再带进来，在 Windows 打包版静默复发（dev/mac 都测不出来）。
//
// 用法：node scripts/check-no-native-details.mjs（退出码 1 = 有违规）。

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC_DIR = 'src'
const DETAILS_RE = /<details[\s/>]|<\/details\s*>|<summary[\s/>]|<\/summary\s*>/

/** 剥离 // 行注释与块注释（含 JSDoc/JSX 注释），正确跳过字符串字面量；保留换行以便报行号。 */
function stripComments(content) {
  let out = ''
  let i = 0
  let state = 'code'
  let quote = '' // 字符串态进入时的引号字符
  while (i < content.length) {
    const ch = content[i]
    const two = content.slice(i, i + 2)
    if (state === 'code') {
      if (two === '//') {
        state = 'line'
        i += 2
        out += '  '
        continue
      }
      if (two === '/*') {
        state = 'block'
        i += 2
        out += '  '
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        state = 'string'
        quote = ch
        out += ch
        i += 1
        continue
      }
      out += ch
      i += 1
    } else if (state === 'line') {
      if (ch === '\n') {
        state = 'code'
        out += '\n'
      } else {
        out += ' '
      }
      i += 1
    } else if (state === 'block') {
      if (two === '*/') {
        state = 'code'
        i += 2
        out += '  '
        continue
      }
      out += ch === '\n' ? '\n' : ' '
      i += 1
    } else {
      // string：内容替换为空格（保留引号与换号——引号本身留在输出里、`//` 不会误启行注释，
      // 字符串里的 <details> 字样也不会误报）；遇到未转义的同类引号回到 code。
      if (ch === '\\') {
        out += '  '
        i += 2
        continue
      }
      if (ch === quote) {
        state = 'code'
        quote = ''
        out += ch
        i += 1
        continue
      }
      out += ch === '\n' ? '\n' : ' '
      i += 1
    }
  }
  return out
}

function collectTsxFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collectTsxFiles(full, out)
    else if (entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

/**
 * 收集违规（导出供测试）。
 * @param {{ files: Array<{ path: string, content: string }> }} input
 * @returns {Array<{ file: string, line: number, excerpt: string }>}
 */
export function collectNativeDetailsViolations({ files }) {
  const violations = []
  for (const file of files) {
    const stripped = stripComments(file.content)
    const sourceLines = file.content.split('\n')
    stripped.split('\n').forEach((line, index) => {
      if (DETAILS_RE.test(line)) {
        // 每行只报一次（同行开+闭标签算一处，报告可读）。
        violations.push({
          file: file.path,
          line: index + 1,
          excerpt: (sourceLines[index] ?? '').trim().slice(0, 90),
        })
      }
    })
  }
  return violations
}

function main() {
  const files = collectTsxFiles(SRC_DIR).map((path) => ({ path, content: readFileSync(path, 'utf-8') }))
  const violations = collectNativeDetailsViolations({ files })
  if (violations.length > 0) {
    console.error(`check-no-native-details: ${violations.length} 处 JSX 原生 <details>/<summary>（Windows asar 冻结风险）：`)
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}: ${v.excerpt}`)
    }
    console.error('改用 src/components/ui/disclosure.tsx（外层展开时输出 open 属性，group-open:* 样式兼容）。')
    process.exit(1)
  }
  console.log(`check-no-native-details: OK（${files.length} 个 tsx 零原生 details/summary）`)
}

if (process.argv[1] && process.argv[1].replaceAll('\\', '/').endsWith('check-no-native-details.mjs')) {
  main()
}
