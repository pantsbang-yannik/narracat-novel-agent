import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const requiredFiles = {
  'docs/design.md': readFileSync('docs/design.md', 'utf8'),
  'docs/agents/workflow.md': readFileSync('docs/agents/workflow.md', 'utf8'),
  'src/styles/globals.css': readFileSync('src/styles/globals.css', 'utf8'),
  'src/design-system/surfaces.ts': readFileSync('src/design-system/surfaces.ts', 'utf8'),
  'src/design-system/typography.ts': readFileSync('src/design-system/typography.ts', 'utf8'),
  'src/components/workbench/WorkbenchEmptyState.tsx': readFileSync(
    'src/components/workbench/WorkbenchEmptyState.tsx',
    'utf8',
  ),
  'src/components/workbench/WorkbenchEmptyGuide.tsx': readFileSync(
    'src/components/workbench/WorkbenchEmptyGuide.tsx',
    'utf8',
  ),
  'src/components/workbench/MarkdownRenderer.tsx': readFileSync(
    'src/components/workbench/MarkdownRenderer.tsx',
    'utf8',
  ),
  'src/components/workbench/agent/AgentQuestionCard.tsx': readFileSync(
    'src/components/workbench/agent/AgentQuestionCard.tsx',
    'utf8',
  ),
  'src/components/ui/button.tsx': readFileSync('src/components/ui/button.tsx', 'utf8'),
  'src/components/AppShell.tsx': readFileSync('src/components/AppShell.tsx', 'utf8'),
  'src/components/brand/BrandMark.tsx': readFileSync(
    'src/components/brand/BrandMark.tsx',
    'utf8',
  ),
  'src/components/brand/BrandLockup.tsx': readFileSync(
    'src/components/brand/BrandLockup.tsx',
    'utf8',
  ),
  'src/components/brand/BrandIllustration.tsx': readFileSync(
    'src/components/brand/BrandIllustration.tsx',
    'utf8',
  ),
  'src/components/brand/BrandStoryBanner.tsx': readFileSync(
    'src/components/brand/BrandStoryBanner.tsx',
    'utf8',
  ),
  'src/components/brand/brand-illustrations.ts': readFileSync(
    'src/components/brand/brand-illustrations.ts',
    'utf8',
  ),
  'src/components/brand/index.ts': readFileSync('src/components/brand/index.ts', 'utf8'),
  'src/components/brand/README.md': readFileSync('src/components/brand/README.md', 'utf8'),
}

const requiredContracts = [
  ['docs/design.md', '浮动工作台，而不是平铺后台'],
  ['docs/design.md', 'Active 不被 Hover 覆盖'],
  ['docs/design.md', 'Logo 通过 `BrandMark` 以原始图片直接展示'],
  ['docs/design.md', '不额外包裹装饰容器'],
  ['docs/design.md', '浅色和暗色模式使用同一张 `narracat-mark.webp`'],
  ['docs/design.md', 'Workbench 使用固定 px 侧栏 + 流式内容区'],
  ['docs/design.md', 'Workbench 内容生命周期'],
  ['docs/design.md', '生成类 Markdown 产物统一进入 reading canvas'],
  ['docs/design.md', '文本框选色'],
  ['docs/design.md', '拖动过程中只更新 grid style'],
  ['docs/design.md', '透明轨道、`10px` 视觉占位'],
  ['docs/agents/workflow.md', '品牌资产'],
  ['docs/agents/workflow.md', 'src/components/brand/README.md'],
  ['src/styles/globals.css', '--color-workspace'],
  ['src/styles/globals.css', '--color-hover'],
  ['src/styles/globals.css', '--color-active'],
  ['src/styles/globals.css', '--color-text-selection'],
  ['src/styles/globals.css', '--text-selection'],
  ['src/styles/globals.css', '--shadow-selection-toolbar'],
  ['src/styles/globals.css', 'background: var(--text-selection)'],
  ['src/styles/globals.css', '--color-brand'],
  ['src/styles/globals.css', '--brand: #04c853'],
  ['src/styles/globals.css', '--brand-soft'],
  ['src/styles/globals.css', 'slide-up-fade'],
  ['src/styles/globals.css', 'scrollbar-color: var(--border) transparent'],
  ['src/styles/globals.css', '::-webkit-scrollbar-thumb:hover'],
  ['src/design-system/surfaces.ts', 'WORKSPACE_SHELL_CLASS'],
  ['src/design-system/surfaces.ts', 'WORKBENCH_GUIDE_ACTION_CLASS'],
  ['src/design-system/surfaces.ts', 'WORKBENCH_READING_CANVAS_CLASS'],
  ['src/design-system/surfaces.ts', 'SIDEBAR_ROW_CLASS'],
  ['src/design-system/surfaces.ts', 'WORKBENCH_RESIZE_HANDLE_CLASS'],
  ['src/design-system/surfaces.ts', 'data-[active=true]:hover:bg-active'],
  ['docs/design.md', '字号角色契约'],
  ['docs/design.md', 'Typography 漂移治理'],
  ['docs/design.md', '剩余可接受债务'],
  ['src/design-system/typography.ts', 'EMPTY_PRIMARY_TITLE_CLASS'],
  ['src/design-system/typography.ts', 'AGENT_BODY_CLASS'],
  ['src/design-system/typography.ts', 'text-[15px]'],
  ['src/components/workbench/WorkbenchEmptyState.tsx', 'EMPTY_PRIMARY_TITLE_CLASS'],
  ['src/components/workbench/WorkbenchEmptyGuide.tsx', 'EMPTY_PRIMARY_TITLE_CLASS'],
  ['src/components/workbench/MarkdownRenderer.tsx', 'AGENT_BODY_CLASS'],
  ['src/components/workbench/agent/AgentQuestionCard.tsx', 'AGENT_QUESTION_OPTION_CLASS'],
  ['src/components/ui/button.tsx', 'active:scale-[0.97]'],
  ['src/components/AppShell.tsx', 'APP_HEADER_CLASS'],
  ['src/components/brand/BrandMark.tsx', 'narracat-mark.webp'],
  ['src/components/brand/BrandMark.tsx', 'data-brand-mark="true"'],
  ['src/components/brand/BrandLockup.tsx', 'BrandMark'],
  ['src/components/brand/BrandLockup.tsx', 'data-brand-lockup="true"'],
  ['src/components/brand/BrandIllustration.tsx', 'getBrandIllustration'],
  ['src/components/brand/BrandIllustration.tsx', 'data-brand-illustration'],
  ['src/components/brand/BrandStoryBanner.tsx', 'narracat-about-banner.webp'],
  ['src/components/brand/BrandStoryBanner.tsx', 'data-brand-story-banner'],
  ['src/components/brand/brand-illustrations.ts', 'BRAND_ILLUSTRATION_PURPOSES'],
  [
    'src/components/brand/brand-illustrations.ts',
    'Record<BrandIllustrationPurpose, BrandIllustrationAsset>',
  ],
  ['src/components/brand/index.ts', 'export { BrandMark }'],
  ['src/components/brand/index.ts', 'export { BrandLockup }'],
  ['src/components/brand/index.ts', 'export { BrandIllustration }'],
  ['src/components/brand/index.ts', 'export { BrandStoryBanner }'],
  ['src/components/brand/README.md', '不要直接 import'],
  ['src/components/brand/README.md', 'docs/design.md'],
]

for (const [file, needle] of requiredContracts) {
  if (!requiredFiles[file].includes(needle)) {
    console.error(`${file} is missing required design-system contract: ${needle}`)
    process.exit(1)
  }
}

// src/dev 是 dev-only 调试工具（生产不打包），不属于产品 UI，豁免设计系统守卫。
const sourceFiles = listFiles('src').filter(
  (file) => /\.(css|ts|tsx)$/.test(file) && !/^src[\\/]dev[\\/]/.test(file),
)
const forbidden = [
  [/text-(blue|purple|green|orange|red|gray|slate)-\d/, 'use semantic text tokens instead of hardcoded palette classes'],
  [/bg-(blue|purple|green|orange|red|gray|slate)-\d/, 'use semantic background tokens instead of hardcoded palette classes'],
  [/shadow-(sm|md|lg|xl|2xl)/, 'use approved low-opacity product shadow tokens'],
  [/active:translate-y-px/, 'pressed state must use scale, not vertical translation'],
  [/var\(--(bg-|fg-|control|sidebar|stage|app-chrome|border-subtle|border-hairline|accent-surface|color-accent)/, 'use design-system semantic tokens/classes instead of legacy visual variables'],
]

for (const file of sourceFiles) {
  const content = readFileSync(file, 'utf8')
  for (const [pattern, message] of forbidden) {
    if (pattern.test(content)) {
      console.error(`${file} violates design-system guard: ${message} (${pattern})`)
      process.exit(1)
    }
  }
}

const rawBrandAssetDirectories = ['assets/brand/', 'assets/illustrations/narracat/']
const directBrandAssetPattern = new RegExp(
  rawBrandAssetDirectories.map((directory) => escapeRegExp(directory)).join('|'),
)
const brandAssetAllowlist = new Set([
  'src/components/brand/BrandMark.tsx',
  'src/components/brand/BrandStoryBanner.tsx',
  'src/components/brand/brand-illustrations.ts',
])
const productionSourceFiles = sourceFiles.filter((file) => !/\.test\.(ts|tsx)$/.test(file))

for (const file of productionSourceFiles) {
  if (brandAssetAllowlist.has(file)) {
    continue
  }

  const content = readFileSync(file, 'utf8')
  if (directBrandAssetPattern.test(content)) {
    console.error(
      `${file} violates brand asset guard: use BrandMark/BrandLockup/BrandIllustration instead of importing raw brand assets`,
    )
    process.exit(1)
  }
}

const offScaleFontSizeGuards = [
  [/text-\[13px\]/, 'off-scale font size; use the typography scale or a registered typography role'],
  [/text-\[17px\]/, 'off-scale font size; use the typography scale or a registered typography role'],
]

for (const file of productionSourceFiles) {
  const content = readFileSync(file, 'utf8')
  for (const [pattern, message] of offScaleFontSizeGuards) {
    if (pattern.test(content)) {
      console.error(`${file} violates typography scale guard: ${message} (${pattern})`)
      process.exit(1)
    }
  }
}

console.log('Design-system contracts present.')

function listFiles(root) {
  const results = []
  for (const entry of readdirSync(root)) {
    const path = join(root, entry)
    const stats = statSync(path)
    if (stats.isDirectory()) {
      results.push(...listFiles(path))
    } else {
      results.push(relative('.', path))
    }
  }
  return results
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
