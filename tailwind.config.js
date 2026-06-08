/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
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