declare module '*.mp3' {
  const src: string;
  export default src;
}

// [新增] 图片资源声明
declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.mp4' {
  const src: string;
  export default src;
}

// [2026-08-09] vite define 注入的版本号常量（公告系统使用，值来自 package.json）
interface ImportMetaEnv {
  readonly PACKAGE_VERSION: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
