// ==========================================
// 悖论迷宫 · 节点进入方形面板
// [2026-08-27 莉莉子] 点击节点 → 节点正上方弹出方形面板：
//   dialogue 背景图（编辑器指定 or 随机）+ 节点名称 + 简介 + 前往按钮。
//   只有点「前往」才真正走进节点（头像移动 + 进入互动）。
//   定位：fixed 锚定节点屏幕坐标正上方，画布平移/缩放时由地图层同步 pos。
// ==========================================
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

interface NodeEntryModalProps {
    pos: { x: number; y: number }; // 节点屏幕中心坐标（面板锚点，绘制在其正上方）
    bg: string; // [2026-08-27] 背景图（父级打开时确定：编辑器指定 or 一局内固定随机）
    title: string;
    desc: string;
    onEnter: () => void;
}

/** [2026-08-27] 面板宽高常量（程可微调） */
export const NODE_ENTRY_PANEL = {
    width: 420,    // 面板宽 px
    height: 300,   // 面板高 px
};

export const NodeEntryModal: React.FC<NodeEntryModalProps> = ({ pos, bg, title, desc, onEnter }) => {
    return (
        <AnimatePresence>
            <motion.div
                key="entry"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[620] bg-black/40 pointer-events-none" // [2026-08-27] 不拦地图拖拽/节点点击；空白关闭交给地图层
            >
                {/* 面板：锚定节点屏幕坐标正上方 */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.92, x: '-50%', y: '-100%' }}
                    animate={{ opacity: 1, scale: 1, x: '-50%', y: '-100%' }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                    className="fixed z-[625] pointer-events-auto"
                    style={{
                        left: pos.x,
                        top: pos.y,
                        width: NODE_ENTRY_PANEL.width,
                        height: NODE_ENTRY_PANEL.height,
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="relative w-full h-full rounded-2xl overflow-hidden border-2 border-white/20 shadow-[0_0_60px_rgba(0,0,0,0.7)]">
                        {/* dialogue 背景图（cover 裁切） */}
                        <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
                        {/* 可读性遮罩 */}
                        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/30 to-black/90" />

                        {/* 内容（[2026-08-27] 已移除右上角关闭按钮——点不到且空白点击可关闭） */}
                        <div className="relative h-full p-5 flex flex-col">
                            <h2 className="text-2xl font-black text-white tracking-wider drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">{title}</h2>

                            <div className="flex-1 flex items-center">
                                <p className="text-sm text-gray-100 leading-relaxed drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] line-clamp-4">{desc}</p>
                            </div>

                            <button
                                onClick={onEnter}
                                className="mt-2 w-full py-3 rounded-xl font-black tracking-widest text-white transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
                                style={{ background: 'linear-gradient(to right, #6366f1, #8b5cf6)' }}
                            >
                                前往 <ArrowRight size={18} />
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
