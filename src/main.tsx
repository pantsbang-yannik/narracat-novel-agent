import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { initTheme } from './lib/theme.ts'
import './styles/globals.css'

initTheme()

// 平台感知布局：把主进程平台写到 <html data-platform>，顶栏据此适配
// mac 红绿灯（左侧预留）/ Windows caption 按钮（右侧预留）。
// window.electron.platform 为准（preload 暴露），非 Electron 环境回退 navigator。
if (typeof document !== 'undefined') {
  const platform =
    typeof window !== 'undefined' && window.electron?.platform
      ? window.electron.platform
      : typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
        ? 'darwin'
        : 'win32'
  document.documentElement.dataset.platform = platform
}

// 非 mac 平台加载渐变 fallback 背景（mac 用 vibrancy 透到桌面）
if (typeof navigator !== 'undefined' && !/Mac/.test(navigator.platform)) {
  await import('./styles/fallback-bg.css')
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
