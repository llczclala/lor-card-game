// ==========================================
// 全局缩放基准（对应 ScaleWrapper 的 contain 缩放）
// [2026-09-01 莉莉子] 统一游戏缩放比计算，供「逃出 scale 容器」的浮层做 scale 补偿：
//   - ScaleWrapper 用 transform: scale() 包住固定 1680×1050 内部，屏幕实际缩放 = min(w/1680, h/1050)
//   - 任何 createPortal 到 document.body 的跟手/悬浮元素（拖拽卡、检视大图），
//     坐标用屏幕坐标（rect/clientX），但内部内容必须以「逻辑尺寸」渲染 + scale(gameScale) 缩放到屏幕，
//     否则内部文字/元素（固定 Tailwind 字号）不会随分辨率缩放 → 不同分辨率下表现不一致。
// 历史教训：08-26 拖拽图标跟手慢（scale 打折）、09-01 拖拽卡内部文字/尺寸错乱 皆源于此。
// ==========================================

export const GAME_WIDTH = 1680;
export const GAME_HEIGHT = 1050;

/** 当前窗口下的游戏缩放比（与 ScaleWrapper 一致：contain 模式取较小比例） */
export const getGameScale = (): number =>
    Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT);
