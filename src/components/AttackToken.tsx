import React, { useEffect } from 'react';
import { motion, useAnimate } from 'framer-motion';
import { UI_IMAGES } from '../data/imageData';

export interface AttackTokenProps {
    type: 'normal' | 'rally';
    isEnemy?: boolean;
}

export const AttackToken: React.FC<AttackTokenProps> = ({ type, isEnemy = false }) => {
    // 引入 Framer Motion 强大的命令式动画 Hook
    const [scope, animate] = useAnimate();

    useEffect(() => {
        let isCancelled = false; // 防止组件卸载后继续执行动画抛出异常

        const playEntryAnimation = async () => {
            if (!scope.current) return;

            // 基础光晕颜色预设
            const glowBase = type === 'rally' ? 'rgba(59,130,246,0.5)' : 'rgba(249,115,22,0.5)';
            const glowPeak = type === 'rally' ? 'rgba(59,130,246,1)' : 'rgba(249,115,22,1)';
            const baseRotate = isEnemy ? 180 : 0;

            // ----------------------------------------------------
            // 分支 A: 橙色宝剑 (常规获得) - 力量感重砸
            // ----------------------------------------------------
            if (type === 'normal') {
                // 1. 砸落入场
                await animate(scope.current, {
                    y: [-400, 0], // 从高空坠落
                    scale: [2, 1], // 从巨大的比例砸向底座
                    opacity: [0, 1],
                    rotate: [baseRotate - 15, baseRotate] // 附带一点倾斜砍下的角度
                }, {
                    duration: 2,
                    type: 'spring',
                    bounce: 0.6 // 强烈的回弹感
                });
            }

            // ----------------------------------------------------
            // 分支 B: 蓝色宝剑 (里芙专属) - 极速残影与音爆
            // ----------------------------------------------------
            else if (type === 'rally') {
                const flickers = [0.25, 0.5, 0.75, 1];

                // 1. 4次极速闪烁蓄力
                for (const baseScale of flickers) {
                    if (isCancelled) return;

                    // 随机极小幅度的偏移，模拟高速残影的不稳定性
                    const offsetX = (Math.random() - 0.5) * 60;
                    const offsetY = (Math.random() - 0.5) * 60 - 20; // 稍微偏上一点
                    const targetScale = baseScale + 2.0; // 核心设计: 透明归零时瞬间膨胀至 (200+X)%

                    // 瞬间出现 (opacity 0.8)
                    await animate(scope.current, {
                        opacity: 0.8,
                        scale: baseScale,
                        x: offsetX,
                        y: offsetY,
                        rotate: baseRotate
                    }, { duration: 0.125 });

                    // 音爆膨胀与消散 (Shockwave)
                    await animate(scope.current, {
                        opacity: 0,
                        scale: targetScale,
                    }, { duration: 0.4, ease: "easeOut" });
                }

                if (isCancelled) return;

                // 2. 终结重砸
                await animate(scope.current, {
                    x: 0,
                    y: [-300, 0],
                    scale: [1.5, 1], // 以 150% 的姿态入场并恢复 100%
                    opacity: [1, 1],
                    rotate: [baseRotate - 10, baseRotate]
                }, {
                    duration: 0.4,
                    type: 'spring',
                    bounce: 0.5
                });
            }

            if (isCancelled) return;

            // ----------------------------------------------------
            // 共同阶段: 无缝切入常驻的“悬浮与呼吸”循环
            // ----------------------------------------------------
            animate(scope.current, {
                y: [-5, 5, -5], // Y轴微微浮动
                rotate: isEnemy ? [178, 182, 178] : [-2, 2, -2], // 伴随细微的角度来回旋转
                filter: [
                    `brightness(1) drop-shadow(0px 0px 15px ${glowBase})`,
                    `brightness(1.4) drop-shadow(0px 0px 30px ${glowPeak})`, // 自身亮度和背后光晕同时放大
                    `brightness(1) drop-shadow(0px 0px 15px ${glowBase})`
                ]
            }, {
                duration: 3, // 一次完整的呼吸周期
                repeat: Infinity,
                ease: "easeInOut"
            });
        };

        playEntryAnimation();

        return () => {
            isCancelled = true;
        };
    }, [type, isEnemy, animate, scope]);

    // UI 资源映射
    const imgSrc = type === 'rally' ? UI_IMAGES.swordGain : UI_IMAGES.sword;

    // 继承之前的完美坐标定位
    const positionClasses = isEnemy
        ? "top-[22.5%] right-[13%]"
        : "bottom-[27.5%] right-[13%]";

    return (
        // AnimatePresence 的 exit 退场动画，处理回合结束令牌消失的平滑度
        <motion.div
            className={`absolute z-40 ${positionClasses}`}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5, filter: 'brightness(2)' }}
            transition={{ duration: 0.3 }}
        >
            {/* 挂载 scope，受 useAnimate 完全控制的物理层 */}
            <motion.div ref={scope} className="w-[80px] h-[80px] flex items-center justify-center">
                <img
                    src={imgSrc}
                    alt="Attack Token"
                    className="w-full h-auto object-contain"
                />
            </motion.div>
        </motion.div>
    );
};