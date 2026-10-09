// ==========================================
// 悖论迷宫 · 局内反馈层（顶部居中堆叠横幅）
// [2026-08-29 莉莉子] 经验重构后局内过节点渐进发经验：
//   用顶部居中堆叠轻量横幅提示（+经验 / Lv 提升），不弹全屏 LevelUpToast、不覆盖 expToast。
//   逐条 2.5s 自动消失（App 层 expFeed state + drain effect 驱动）。
//
// [2026-10-08 莉莉子 · 交互回响层 批次0] 从「只报经验」升级为**全类型局内反馈通道**：
//   ── 病根（程 2026-10-08 反馈）：休整/商店/宝箱/强化/奖励等节点交互**做完什么都不说**，
//      玩家只能靠盯血条/金币猜自己拿到了什么；而唯一通用的横幅通道层级只有 z-[300]，
//      被所有节点弹窗（z-[700~900]）压在遮罩底下 —— 等于**补了也看不见**。
//   ── 本次两件事：
//      ① tone 扩展：exp / level（沿用）· **gain 获得 · cost 付出 · info 一般**（节点交互回执用）
//      ② 层级分流：交互回执（gain/cost/info）⇒ **z-[950]**，盖过节点弹窗/复活窗/暂离窗；
//         经验与升级（exp/level）保持 **z-[300]**，避免压到过场影片（z-500）与结算浮层（z-1150）。
//         容器层级按"队列里有没有交互回执"动态取，两条通道共用一条队列。
//   ⚠️ 文案一律在**执行点**（App 的 handler）产出 —— 提示与执行同源，不再两处各写一遍。
// ==========================================
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/** 反馈语气：决定配色与层级（gain/cost/info = 节点交互回执，须浮在弹窗之上） */
export type FeedbackTone = 'exp' | 'level' | 'gain' | 'cost' | 'info';

export interface ExpFeedItem {
    id: number;
    text: string;
    tone: FeedbackTone;
}

/** 交互回执三种语气（需要盖过弹窗） */
const ABOVE_MODAL_TONES: FeedbackTone[] = ['gain', 'cost', 'info'];

const TONE_CLASS: Record<FeedbackTone, string> = {
    exp: 'bg-slate-900/90 border-amber-400/50 text-amber-300',
    level: 'bg-purple-900/90 border-purple-400/60 text-purple-200',
    gain: 'bg-emerald-950/92 border-emerald-400/60 text-emerald-200',
    cost: 'bg-amber-950/92 border-amber-400/60 text-amber-200',
    info: 'bg-slate-900/92 border-white/25 text-gray-200',
};

interface RogueExpFeedProps {
    feed: ExpFeedItem[];
}

export const RogueExpFeed: React.FC<RogueExpFeedProps> = ({ feed }) => {
    // 队列里有交互回执 ⇒ 整层抬到弹窗之上（z-950）；只有经验/升级 ⇒ 保持 z-300
    const aboveModal = feed.some(f => ABOVE_MODAL_TONES.includes(f.tone));
    return (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 ${aboveModal ? 'z-[950]' : 'z-[300]'} flex flex-col items-center gap-2 pointer-events-none`}>
            <AnimatePresence>
                {feed.map(item => (
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: -12, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.95 }}
                        transition={{ duration: 0.25 }}
                        className={`px-4 py-1.5 rounded-full font-black text-sm tracking-widest shadow-lg backdrop-blur-sm border ${TONE_CLASS[item.tone]}`}
                    >
                        {item.text}
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};
