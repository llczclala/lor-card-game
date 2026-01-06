import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CardData } from '../types';
import { Card } from './Card';
import { CARD_DB } from '../data/cards';
import { SkipForward } from 'lucide-react';


interface ChampionLevelUpProps {
    card: CardData;
    onPlayMovie: (heroKey: string, onEnd: () => void) => void;
    onComplete: () => void;
    // [新增] 停止视频回调，支持 immediate 参数
    onStopMovie?: (immediate?: boolean) => void;
}

/**
 * 英雄升级动画控制器
 * 负责调度：Phase 1 (旋转聚气) -> Phase 2 (播放影片) -> Phase 3 (爆发展示)
 */
export const ChampionLevelUp: React.FC<ChampionLevelUpProps> = ({ card, onPlayMovie, onComplete }) => {
    // 动画阶段：spin (旋转消失) -> video (播放视频) -> burst (爆发出现)
    const [phase, setPhase] = useState<'spin' | 'video' | 'burst'>('spin');
    // [新增] 跳过按钮显示状态
    const [showSkip, setShowSkip] = useState(false);

    // --- 英雄专属配置区 ---

    // [里芙] 专属动画配置
    const lyfeConfig = {
        // Phase 1: 高速旋转并收缩成光点
        spin: {
            rotateY: [0, 720, 1080], // 旋转 3 圈
            scale: [1, 0.8, 0],      // 缩小直至消失
            opacity: [1, 1, 0],
            filter: ["brightness(1)", "brightness(2)", "brightness(10)"], // 变亮成为光球
            transition: {
                duration: 1.5,
                ease: "easeIn",
                times: [0, 0.7, 1]
            }
        },
        // Phase 3: 从光芒中爆裂而出
        burst: {
            scale: [0, 1.5, 1.2],    // 放大过冲后回弹
            opacity: [0, 1, 1],
            filter: ["brightness(5)", "brightness(1)"], // 光芒消散
            rotateY: [180, 0],       // 稍微带一点旋转复位
            transition: {
                duration: 0.8,
                ease: "circOut",
                delay: 0.1 // 稍微延迟一点等待视频完全黑屏
            }
        }
    };

    // [通用/默认] 动画配置 (用于未配置专属动画的英雄)
    const defaultConfig = {
        spin: {
            scale: [1, 1.2, 0],
            opacity: [1, 1, 0],
            transition: { duration: 1.0, ease: "backIn" }
        },
        burst: {
            scale: [0, 1.2, 1],
            opacity: [0, 1, 1],
            transition: { duration: 0.6, ease: "backOut" }
        }
    };

    // 根据英雄 Key 选择配置
    const config = card.key === 'lyfe' ? lyfeConfig : defaultConfig;

    // --- 事件处理 ---

    // [新增] 监听阶段变化，控制跳过按钮
    useEffect(() => {
        if (phase === 'video') {
            // 视频开始 1 秒后显示跳过按钮
            const timer = setTimeout(() => setShowSkip(true), 1000);
            return () => clearTimeout(timer);
        } else {
            setShowSkip(false);
        }
    }, [phase]);

    // [修改] 跳过逻辑
    const handleSkip = (e: React.MouseEvent) => {
        e.stopPropagation();

        // 1. 发出信号：立即切断视频 (true = immediate)
        if (onStopMovie) onStopMovie(true);

        // 2. 强制进入下一阶段
        setPhase('burst');
    };

    // Phase 1 结束 -> 播放视频
    const handleSpinComplete = () => {
        setPhase('video');
        onPlayMovie(card.key, () => {
            // 视频播放结束回调 -> 进入 Phase 3
            setPhase('burst');
        });
    };

    // Phase 3 结束 -> 展示一会儿后关闭
    const handleBurstComplete = () => {
        // 让 Level 2 卡牌在屏幕上停留 2 秒，让玩家看清楚
        setTimeout(onComplete, 2000);
    };

    // [新增] 动态计算显示用的卡牌数据
    // 目的：在 Spin 阶段强制显示 Level 1 的样子 (防止还没升级完就看到 L2 立绘)
    const displayCard = (() => {
        if (phase === 'spin') {
            // 尝试从数据库获取原始的 Level 1 数据
            const baseL1 = CARD_DB[card.key];
            if (baseL1) {
                return {
                    ...card,          // 保留当前实例的动态属性 (id, damageTaken等)
                    ...baseL1,        // 覆盖为 L1 的静态属性 (power, health, imageUrl)
                    level: 1,         // [关键] 强制标记为 1 级，触发 Card 组件渲染 L1 逻辑

                    // 恢复 buffs (因为 ...baseL1 会覆盖掉实例的 buffs，如果是 undefined)
                    // 但通常我们希望升级动画展示的是"最原始"的变身，所以用 baseL1 的数值也许更好？
                    // 这里为了稳妥，我们手动保留 buffs
                    buffs: card.buffs
                } as CardData;
            }
            // 兜底
            return { ...card, level: 1 };
        }
        // Video 和 Burst 阶段显示真实的 Level 2
        return card;
    })();

    return (
        <div className="relative w-full h-full flex items-center justify-center pointer-events-none">
            {/* 注意：在 'video' 阶段，我们不渲染卡牌，
               因为 VideoPlayer 会在 Overlays/GameSession 层级全屏播放。
               这里只负责 Phase 1 和 Phase 3 的卡牌动画。
            */}
            {phase !== 'video' && (
                <motion.div
                    // 根据阶段应用不同的动画参数
                    initial={phase === 'spin' ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                    animate={phase === 'spin' ? config.spin : config.burst}
                    onAnimationComplete={() => {
                        if (phase === 'spin') handleSpinComplete();
                        if (phase === 'burst') handleBurstComplete();
                    }}
                    className="relative z-50"
                >
                    {/* 这里渲染的是 Level 2 的卡牌数据。
                       在 Spin 阶段，虽然逻辑上是 L1 变 L2，但视觉上旋转很快，直接用 L2 问题不大。
                       如果追求极致，可以在 Spin 阶段传 L1 数据，Burst 阶段传 L2 数据。
                    */}
                    <div className="scale-150"> {/* 基础放大 1.5 倍展示 */}
                        <Card
                            data={displayCard}
                            location="preview"
                            isFaceUp={true}
                            // 如果有专属的升级光效组件，也可以包裹在这里
                        />
                    </div>
                </motion.div>
            )}

            {/* 2. [新增] 跳过按钮层 (仅在 Video 阶段显示) */}
            <AnimatePresence>
                {phase === 'video' && showSkip && (
                    <motion.button
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        onClick={handleSkip}
                        className="fixed top-8 right-8 z-[9999] flex items-center gap-2 px-6 py-3 bg-black/60 hover:bg-white/20 border border-white/20 hover:border-white/50 rounded-full text-white font-mono tracking-widest text-sm backdrop-blur-md transition-all pointer-events-auto group"
                    >
                        <SkipForward size={16} className="group-hover:translate-x-1 transition-transform" />
                        SKIP MOVIE
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
};