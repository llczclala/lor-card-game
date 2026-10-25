// ==========================================
// 悖论迷宫 · 「NEW!!」图鉴首收录提示（右上角）
// [2026-10-20 莉莉子 · 肉鸽图鉴 NEW 提示]
//
// 👤 程的口径：「我们应该在**右上角**挂一个 'NEW！！' 什么的之类的提示」
//
// ── 为什么不复用 `RogueExpFeed`（顶部居中的通用回执通道）───────────────
//   · 位置不同：程指定**右上角**；而那一条是顶部居中，用于"操作回执"（已买/已删/已刷新）
//   · 语义不同：那是**流水账**，这是**收藏里程碑**（"你第一次见到这个东西"）
//     ⇒ 必须有辨识度（金色缎带 + NEW!! 大字），否则混在回执里等于没提示
//   · 层级同档：`z-[960]`，一样要盖过节点弹窗（z-700~900）
//
// ⚠️ 队列与自动消失由调用方（`App.tsx` 的 `pushNewUnlock`）驱动：
//   App 里 push → 3.2s 后自己从这个数组里摘掉 ⇒ 本组件是纯展示。
//   与 `RogueExpFeed` 保持同一套"state + setTimeout"约定，不引入新的定时器体系。
// ==========================================
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/** 一条「首次收录」记录 */
export interface NewUnlockItem {
    id: number;
    /** 强化的「🧬」还是武装/装备的「⚔️」 */
    kind: 'enhancement' | 'equipment';
    /** 展示名（查不到东西时退化成 id 原文，与 App 里 nameOfEnh/nameOfEquip 同口径） */
    name: string;
}

interface RogueNewUnlockFeedProps {
    items: NewUnlockItem[];
}

export const RogueNewUnlockFeed: React.FC<RogueNewUnlockFeedProps> = ({ items }) => {
    if (items.length === 0) return null;

    return (
        // 右上角：`top-16` 避开顶栏；`items-end` 让新条目从右往左生长。
        // ⚠️ [2026-10-20 独立审查修复] 层级由 `z-[960]` 抬到 `z-[1100]`：
        //   `z-960` 盖得住节点弹窗（700~900），但盖不住 **`EventBattleRewardModal` 的 z-[1000]**
        //   （`EventBattleRewardModal.tsx:27`，迎战胜利奖励弹窗）—— 而迎战胜利的强化恰好是
        //   "同一 tick 先发 NEW 提示、再开那个弹窗"（App 的结算处）⇒ 整段 3.2s 生命期被黑幕吞掉。
        //   1100 仍在 ChestOpenModal(1300) / PackOpenModal(1500) 之下，不会盖住不该盖的东西。
        <div className="fixed top-16 right-6 z-[1100] flex flex-col items-end gap-2 pointer-events-none">
            <AnimatePresence>
                {items.map(item => (
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: 48, scale: 0.88 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 32, scale: 0.94 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                        className="relative overflow-hidden rounded-xl border-2 border-amber-200/90 px-4 py-2
                                   bg-gradient-to-br from-amber-400 via-yellow-300 to-amber-500
                                   text-black shadow-[0_0_28px_rgba(251,191,36,0.75)]"
                    >
                        {/* 扫光：一条白色斜带缓慢掠过，制造"新货上架"的反射感 */}
                        <motion.div
                            className="pointer-events-none absolute inset-y-0 w-16 bg-white/45 blur-md"
                            initial={{ x: -80 }}
                            animate={{ x: 260 }}
                            transition={{ duration: 1.1, repeat: 2, repeatDelay: 0.35, ease: 'easeInOut' }}
                        />
                        <div className="relative flex items-center gap-2.5">
                            <span className="font-black italic text-[22px] leading-none tracking-tighter drop-shadow-sm">
                                NEW!!
                            </span>
                            <span className="text-[20px] leading-none">
                                {item.kind === 'enhancement' ? '🧬' : '⚔️'}
                            </span>
                            <span className="font-black text-[18px] leading-none tracking-wide">
                                {item.name}
                            </span>
                        </div>
                        <div className="relative mt-1 text-[11px] font-bold tracking-widest opacity-75">
                            已收录「逻辑研习」图鉴
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};
