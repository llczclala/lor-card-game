import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css' // 必须导入这个，否则 Tailwind 不生效
import { initPlatform } from './platform'

// 安卓壳：返回键 → Escape、window.close() → 退出 App。PC 版是空操作。
initPlatform()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)