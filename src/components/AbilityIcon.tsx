import React from 'react';
import { motion, type Variants } from 'framer-motion';
import type { AbilityConfig, AbilityRuntimeState } from '../types';
import abilityIconImg from '../image/keyword/00.png';

interface AbilityIconProps {
    ability: AbilityConfig;
    state: AbilityRuntimeState;
    sizeClass?: string;
}

/**
 * 能力图标组件
 *
 * 通用状态机驱动，不针对某个能力写死逻辑：
 *   breathing → 常亮呼吸（可发动）
 *   flashing  → 发动瞬间爆闪
 *   dimmed    → 永久黯淡（用尽）
 *
 * 只应在备战席/战场上渲染，手牌中不显示。
 */
const AbilityIcon: React.FC<AbilityIconProps> = ({ ability, state, sizeClass = 'w-[22px] h-[22px]' }) => {
    if (state === 'hidden') return null;

    const glowColor = 'rgba(255, 215, 0, 0.7)'; // 金色统一光效，区别于关键词

    const variants: Variants = {
        // 常亮呼吸：沉稳的明暗+缩放循环
        breathing: {
            scale: [0.75, 0.95, 0.75],
            filter: [
                `brightness(0.6) drop-shadow(0px 0px 3px ${glowColor})`,
                `brightness(1.1) drop-shadow(0px 0px 10px ${glowColor})`,
                `brightness(0.6) drop-shadow(0px 0px 3px ${glowColor})`,
            ],
            transition: { duration: 2.5, repeat: Infinity, ease: "easeInOut" }
        },
        // 触发爆闪：短暂高强度亮光
        flashing: {
            scale: [0.5, 1.6, 0.8],
            filter: [
                `brightness(2.5) drop-shadow(0px 0px 25px rgba(255,255,255,0.9))`,
                `brightness(3.5) drop-shadow(0px 0px 40px rgba(255,255,255,1))`,
                `brightness(0.6) drop-shadow(0px 0px 3px ${glowColor})`,
            ],
            transition: { duration: 0.5, ease: "easeOut" }
        },
        // 永久黯淡：灰阶+半透明
        dimmed: {
            scale: 0.7,
            filter: 'grayscale(1) opacity(0.3) brightness(0.4)',
            transition: { duration: 0.4 }
        }
    };

    return (
        <div className={`relative flex items-center justify-center ${sizeClass} group`}
             title={`${ability.label}: ${ability.description}`}>

            {/* 特效光环底衬（仅 breathing/flashing 时） */}
            {(state === 'breathing' || state === 'flashing') && (
                <motion.div
                    className="absolute inset-0 rounded-full z-0"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 0.5, scale: 1 }}
                    style={{ backgroundColor: glowColor, filter: 'blur(5px)' }}
                />
            )}

            {/* 图标本体 */}
            <motion.div
                variants={variants}
                animate={state}
                className="w-full h-full relative z-10 flex items-center justify-center"
            >
                <img
                    src={abilityIconImg}
                    alt={ability.label}
                    className="w-full h-full object-contain drop-shadow-md"
                />
            </motion.div>
        </div>
    );
};

export default AbilityIcon;
