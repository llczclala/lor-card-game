// ==========================================
// 悖论迷宫 · 节点事件弹窗
// enhance 迷宫强化：**校准式全屏开放式**（参考 CalibratePanel：无方形窗口，
//   卡片并排带角度升入 + 选中上浮/金色光晕 + 底部确定，三态动画 enter→select→exit）
// rest 可回血 30%；shop/event/treasure 暂为占位提示
// [2026-08-05 莉莉子] enhance 节点接入迷宫强化 3 选 1
// [2026-08-10 莉莉子] enhance 界面改版 v2：对齐校准呈现方式（程拍板：走通的路不重走）
// ==========================================
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Flame, ShoppingBag, HelpCircle, Gem, Flag, Sparkles } from 'lucide-react';
import type { RogueNodeType } from '../../../data/roguelike/mapLayout';
import type { MazeEnhancement } from '../../../data/roguelike/enhancements';
import { EnhancementCard } from './EnhancementCard';

interface NodeEventModalProps {
    type: Exclude<RogueNodeType, 'battle' | 'elite' | 'boss'>;
    hp: number;
    maxHp: number;
    onRest: () => void; // 休息回血回调
    onClose: () => void;
    enhanceOptions?: MazeEnhancement[]; // [2026-08-05] 强化节点：可选的迷宫强化
    onEnhance?: (key: string) => void;  // [2026-08-05] 选择强化回调
}

const TITLES: Record<NodeEventModalProps['type'], { title: string; icon: React.ReactNode; desc: string }> = {
    start: { title: '起点 · 战旗', icon: <Flag size={32} className="text-green-400" />, desc: '旅程的起点，从这里踏入迷宫。' },
    enhance: { title: '迷宫强化', icon: <Sparkles size={32} className="text-violet-400" />, desc: '选择一项迷宫强化，获得永久的增益。' },
    rest: { title: '篝火 · 休整', icon: <Flame size={32} className="text-amber-400" />, desc: '在此停留，恢复 30% 生命值。' },
    shop: { title: '商店', icon: <ShoppingBag size={32} className="text-emerald-400" />, desc: '此地暂未开放，后续可购买卡牌 / 强化 / 删卡。' },
    event: { title: '未知事件', icon: <HelpCircle size={32} className="text-cyan-400" />, desc: '此地暂未开放，后续将提供随机事件选择。' },
    treasure: { title: '宝箱', icon: <Gem size={32} className="text-yellow-400" />, desc: '此地暂未开放，后续可获得免费强化 / 金币。' },
};

export const NodeEventModal: React.FC<NodeEventModalProps> = ({ type, hp, maxHp, onRest, onClose, enhanceOptions, onEnhance }) => {
    const meta = TITLES[type];
    // [2026-08-10] 单选选中态：点击卡牌选中，底部确定生效
    const [selectedEnhanceId, setSelectedEnhanceId] = useState<string | null>(null);
    // [2026-08-10] 对齐校准三态动画：enter（升入）→ select（可交互）→ exit（确认后退出）
    const [animPhase, setAnimPhase] = useState<'enter' | 'select' | 'exit'>('enter');

    useEffect(() => {
        const t = setTimeout(() => setAnimPhase('select'), 600);
        return () => clearTimeout(t);
    }, []);

    const handleConfirmEnhance = () => {
        if (!selectedEnhanceId) return;
        setAnimPhase('exit');
        setTimeout(() => {
            onEnhance?.(selectedEnhanceId);
            onClose();
        }, 500);
    };

    // ═══════════════════════════════════════════════
    //  迷宫强化 · 校准式全屏开放式（参考 CalibratePanel）
    // ═══════════════════════════════════════════════
    if (type === 'enhance') {
        const opts = enhanceOptions ?? [];
        return (
            <AnimatePresence>
                <div className="fixed inset-0 z-[700] flex flex-col items-center justify-center">
                    {/* 全屏点击拦截层 */}
                    <div className="absolute inset-0 bg-black/70 pointer-events-auto" onClick={(e) => e.stopPropagation()} />

                    {/* 顶部标题 */}
                    {animPhase === 'select' && (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                            className="absolute top-[16%] left-0 right-0 w-full text-center pointer-events-auto"
                        >
                            <div className="flex items-center justify-center gap-3 mb-1">
                                <Sparkles size={34} className="text-violet-400" />
                                <h2 className="text-5xl font-black text-white drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] tracking-widest">迷宫强化</h2>
                            </div>
                            <p className="text-violet-200 mt-2 font-mono text-lg tracking-[0.2em] opacity-80">CHOOSE A MAZE ENHANCEMENT</p>
                        </motion.div>
                    )}

                    {/* 卡牌区域：并排 + 每张带角度 + 从下方升入 */}
                    <div className="relative flex items-center justify-center pointer-events-auto" style={{ marginTop: '6vh' }}>
                        <div className="flex gap-6">
                            {opts.length > 0 ? (
                                <AnimatePresence>
                                    {opts.map((opt, index) => {
                                        const isSelected = selectedEnhanceId === opt.id;
                                        const angle = (index - (opts.length - 1) / 2) * 9; // 中心向两侧倾斜（程要求调大）
                                        const variants: Variants = {
                                            enter: {
                                                x: 0, y: 60, scale: 0.4, rotate: angle, opacity: 0,
                                                transition: { delay: index * 0.1, duration: 0.6, type: 'spring', damping: 18 },
                                            },
                                            select: {
                                                x: 0, y: isSelected ? -50 : 0,
                                                scale: isSelected ? 1.0 : 0.88,
                                                rotate: isSelected ? 0 : angle,
                                                opacity: 1,
                                                transition: { type: 'spring', stiffness: 300 },
                                            },
                                            exit: {
                                                x: 0, y: 80, scale: 0.3, opacity: 0, rotate: angle * 2,
                                                transition: { duration: 0.5, ease: 'easeInOut', delay: index * 0.06 },
                                            },
                                        };
                                        return (
                                            <motion.div
                                                key={opt.id}
                                                className="relative flex flex-col items-center cursor-pointer"
                                                variants={variants}
                                                initial="enter"
                                                animate={animPhase}
                                                exit="exit"
                                                onClick={() => { if (animPhase === 'select') setSelectedEnhanceId(opt.id); }}
                                            >
                                                {/* 选中光晕（不用 layoutId：切换时旧的直接卸载、新的原地出现，不再"飞过去"） */}
                                                {isSelected && animPhase === 'select' && (
                                                    <div className="absolute -inset-2 rounded-xl border-4 border-yellow-400 shadow-[0_0_25px_#eab308] z-0" />
                                                )}
                                                <div className="relative z-10 origin-bottom">
                                                    <EnhancementCard enhancement={opt} isSelected={isSelected} onClick={() => {}} />
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            ) : (
                                <button onClick={onClose}
                                    className="px-8 py-2 rounded-lg bg-white/10 hover:bg-white/20 font-bold transition-colors">
                                    返回地图
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 底部确定按钮：flex 容器居中（不用 translate，避免被 framer-motion 的 transform 覆盖导致右偏） */}
                    {animPhase === 'select' && opts.length > 0 && (
                        <div className="absolute bottom-[10%] left-0 right-0 z-30 flex justify-center">
                            <motion.button
                                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                onClick={(e) => { e.stopPropagation(); handleConfirmEnhance(); }}
                                disabled={!selectedEnhanceId}
                                className={`px-12 py-3 rounded-xl font-black text-lg tracking-widest transition-all
                                    ${selectedEnhanceId
                                        ? 'bg-gradient-to-r from-violet-600 to-purple-400 hover:scale-105 hover:shadow-[0_0_30px_rgba(168,85,247,0.6)]'
                                        : 'bg-white/10 text-gray-500 cursor-not-allowed'}`}
                            >
                                确定
                            </motion.button>
                        </div>
                    )}
                </div>
            </AnimatePresence>
        );
    }

    // ═══════════════════════════════════════════════
    //  其余节点 · 保留原小窗布局
    // ═══════════════════════════════════════════════
    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="rounded-2xl bg-slate-900/95 border border-white/10 p-8 flex flex-col items-center gap-4 text-white min-w-[420px]"
                >
                    {meta.icon}
                    <h3 className="text-2xl font-black">{meta.title}</h3>
                    <p className="text-sm text-gray-300 text-center">{meta.desc}</p>

                    {type === 'rest' ? (
                        <>
                            <p className="text-xs font-mono text-gray-400">
                                HP: <span className="text-green-400">{hp}</span> / {maxHp}
                                <span className="text-gray-500"> (+{Math.floor(maxHp * 0.3)})</span>
                            </p>
                            <div className="flex gap-3">
                                <button onClick={() => { onRest(); onClose(); }}
                                    className="px-6 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 font-bold transition-colors">
                                    休整
                                </button>
                                <button onClick={onClose}
                                    className="px-6 py-2 rounded-lg bg-white/10 hover:bg-white/20 font-bold transition-colors">
                                    离开
                                </button>
                            </div>
                        </>
                    ) : (
                        <button onClick={onClose}
                            className="px-8 py-2 rounded-lg bg-white/10 hover:bg-white/20 font-bold transition-colors">
                            返回地图
                        </button>
                    )}
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
