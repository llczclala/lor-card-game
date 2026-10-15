/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // [2026-10-14 莉莉子 · 触屏适配] hover 变体**只在真正支持 hover 的设备**上生效。
  //   背景：全库 `hover:` 类 664 处 / 77 文件；触屏上浏览器会**模拟 hover 并粘住**
  //   （点过的卡片一直放大着、按钮一直亮着、边框一直发光）⇒ 开启本项后触屏自动全部失效，**664 处一行不改**。
  //   附带好处：PC（鼠标）行为完全不变。
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      // [新增] 注册全息图鉴舱专属的科幻动画类
      animation: {
        'scanline': 'scanline-move 6s linear infinite',
        'shimmer': 'text-shimmer 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite',
      }
    },
  },
  plugins: [],
}