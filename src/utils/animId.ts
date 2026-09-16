// ==========================================
// 全局动画 ID 生成器 — 保证 animId 永不重复
// [2026-09-04 莉莉子] 原实现用 Date.now()（毫秒粒度）拼 key：
//   并发/并行抽卡路径在同一毫秒对同一卡实例发 DRAW_START 时 key 撞车，
//   动画层 DrawAnimOverlay 列表里出现两个同 key 孩子 → React 重复键警告。
//   更糟的是 forEach 里同步算 Date.now()，整批事件全共用同一个毫秒值。
// 方案：模块级单调自增计数器（ES module 单例，跨模块共享），
//   保留可读前缀 + owner/cardId 便于调试，末尾序号保证全局唯一。
// 参考先例：logic/spells.ts 的 ++spellDrawCounter。
// ==========================================

let animIdSeq = 0;

/** 生成全局唯一动画 ID。用法：nextAnimId('draw', owner, card.id) → draw_enemy_xxx_5 */
export const nextAnimId = (...segments: (string | number)[]): string => {
    animIdSeq += 1;
    return `${segments.join('_')}_${animIdSeq}`;
};
