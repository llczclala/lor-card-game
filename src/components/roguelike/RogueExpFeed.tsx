// ==========================================
// 悖论迷宫 · 局内经验/升级轻量横幅
// [2026-08-29 莉莉子] 经验重构后局内过节点渐进发经验：
//   用顶部居中堆叠轻量横幅提示（+经验 / Lv 提升），不弹全屏 LevelUpToast、不覆盖 expToast。
//   逐条 2.5s 自动消失（App 层 expFeed state + drain effect 驱动）。
// ==========================================
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface ExpFeedItem {
    id: number;
    text: string;
    tone: 'exp' | 'level';
}

interface RogueExpFeedProps {
    feed: ExpFeedItem[];
}

export const RogueExpFeed: React.FC<RogueExpFeedProps> = ({ feed }) => {
    return (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[300] flex flex-col items-center gap-2 pointer-events-none">
            <AnimatePresence>
                {feed.map(item => (
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: -12, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.95 }}
                        transition={{ duration: 0.25 }}
                        className={`px-4 py-1.5 rounded-full font-black text-sm tracking-widest shadow-lg backdrop-blur-sm border ${
                            item.tone === 'level'
                                ? 'bg-purple-900/90 border-purple-400/60 text-purple-200'
                                : 'bg-slate-900/90 border-amber-400/50 text-amber-300'
                        }`}
                    >
                        {item.text}
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};
