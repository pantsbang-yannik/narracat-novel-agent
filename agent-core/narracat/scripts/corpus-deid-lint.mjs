#!/usr/bin/env node
/**
 * corpus-deid-lint — 真人范例检索库「去标识化」回归护栏
 *
 * 语料本体（extracts / index.json / query-index.md）已迁往官方只读语料服务
 * 语料服务私有仓（2026-08-05），不再随本仓分发，故其去标识化校验一并迁走。
 * 本脚本收窄为守两处仍随包分发的内容，防原书名/作者再渗入。error 级（退出码 1）：
 *   - 能力 packs（novel-web-craft / novel-structure）evidence 残留来源署名
 *   - novel-style-reference skill 文档（SKILL.md / references 下，corpus/ 除外）渗入
 *     原始语料路径(.txt) / 本地语料库目录名 / 来源署名(作者：)——堵住建库研究产物再混入随包
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

// 随包 skill 文档不得携带的来源标记（结构性强信号，不硬编码书名清单——书名会变、结构不变）。
export function detectSourceSignatures(text) {
  const hits = []
  const RULES = [
    [/小说知识库/g, '本地语料库目录名'],
    [/\S*\.txt/g, '原始语料文件路径(.txt)'],
    [/作者[：:]\s*\S+/g, '来源署名(作者：)'],
  ]
  for (const [re, label] of RULES) {
    for (const m of text.matchAll(re)) hits.push(`${label}「${m[0].trim()}」`)
  }
  return hits
}

function walkMarkdown(dir, skipDirName) {
  const out = []
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === skipDirName) continue
      out.push(...walkMarkdown(full, skipDirName))
    } else if (ent.name.endsWith('.md')) {
      out.push(full)
    }
  }
  return out
}

export function lintCorpusDeid(root) {
  const errors = []

  // packs 去标识化：evidence 不得标来源书名/作者署名（PR#387 去标识化校准）
  const PACKS_DIRS = [
    'skills/novel-web-craft/references/packs',
    'skills/novel-structure/references/packs',
  ]
  for (const rel of PACKS_DIRS) {
    const dir = path.join(root, rel)
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
      const md = readFileSync(path.join(dir, f), 'utf8')
      for (const m of md.matchAll(/（?来源[：:]\s*[^）\n]+/g)) {
        errors.push(`${rel}/${f}: evidence 残留来源署名「${m[0].trim()}」（pack 须去标识化、不标书名作者）`)
      }
    }
  }

  // novel-style-reference skill 文档（SKILL.md + references/）不得渗入原始语料路径 /
  // 本地库目录名 / 来源署名——profiles 研究产物泄漏即由此堵住。语料本体已迁
  // 语料服务私有仓，本脚本只守随包 packs 与 skill 文档；skipDirName 仍传
  // 'corpus' 无害（本仓已无该目录，纯防御——万一本地残留不误扫）。
  const SKILL_ROOT = path.join(root, 'skills/novel-style-reference')
  if (existsSync(SKILL_ROOT)) {
    for (const f of walkMarkdown(SKILL_ROOT, 'corpus')) {
      for (const h of detectSourceSignatures(readFileSync(f, 'utf8'))) {
        errors.push(`${path.relative(root, f)}: ${h}`)
      }
    }
  }

  return { ok: errors.length === 0, errors }
}

// 主模块判断用 pathToFileURL 而非裸 file://+argv[1]：后者在脚本路径含空格/需转义字符时
// 与已 %20 转义的 import.meta.url 不等，会让 CLI 分支静默不执行、exit 0（护栏无声失效）。
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const { ok, errors } = lintCorpusDeid(root)
  if (!ok) {
    console.error('corpus-deid-lint 失败:\n' + errors.map((x) => '  ✗ ' + x).join('\n'))
    process.exit(1)
  }
  console.log('✓ corpus-deid-lint: 随包检索库无书名/作者渗透')
}
