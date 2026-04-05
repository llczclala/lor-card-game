import React from 'react';
import { motion } from 'framer-motion';
import type { Keyword } from '../types';
import { KEYWORD_DB } from '../data/keywords';

interface KeywordTrayProps {
    keywords: Keyword[];
    isAttacking?: boolean; // 核心状态：是否正在发起进攻
    isDefending?: boolean; // 核心状态：是否正在格挡
    sizeClass?: string;    // 自定义图标尺寸 (例如 'w-[18px] h-[18px]')
    className?: string;    // 外部容器的自定义样式
}

// 内部子组件：拥有独立特效大脑的“智能关键词图标”
const SmartKeywordIcon = ({ keyword, sizeClass, isAttacking, isDefending }: { keyword: Keyword, sizeClass: string, isAttacking?: boolean, isDefending?: boolean }) => {
    const config = KEYWORD_DB[keyword];
    if (!config) return null;

    // 1. 状态计算大脑：判断当前词条是否被“激活”
    let isActive = false;
    let glowColor = '';
    let animType: 'pulse' | 'flash' | 'none' = 'none';

    // 进攻类词条激活判断
    if (isAttacking) {
        switch (keyword) {
            case 'Overwhelm': // 碾压：血红色力量
                isActive = true; glowColor = 'rgba(220, 38, 38, 0.8)'; animType = 'pulse'; break;
            case 'QuickAttack': // 先攻：蓝色闪电
                isActive = true; glowColor = 'rgba(59, 130, 246, 0.8)'; animType = 'flash'; break;
            case 'Double Attack': // 连击：橙色爆发
                isActive = true; glowColor = 'rgba(249, 115, 22, 0.8)'; animType = 'flash'; break;
            case 'Challenger': // 挑战者：橙色脉冲
                isActive = true; glowColor = 'rgba(249, 115, 22, 0.8)'; animType = 'pulse'; break;
            case 'Sniper': // 狙击：青色锁定光
                isActive = true; glowColor = 'rgba(6, 182, 212, 0.8)'; animType = 'flash'; break;
            case 'Impact': // 冲击：深红爆破
                isActive = true; glowColor = 'rgba(225, 29, 72, 0.8)'; animType = 'pulse'; break;
        }
    }

    // 防御/常驻类词条激活判断 (后续可扩展)
    if (isDefending) {
        switch (keyword) {
            case 'Tough': // 坚韧：岩石色护甲
                isActive = true; glowColor = 'rgba(100, 116, 139, 0.8)'; animType = 'pulse'; break;
            case 'Thorns': // 反伤：毒绿色
                isActive = true; glowColor = 'rgba(132, 204, 22, 0.8)'; animType = 'flash'; break;
        }
    }

    // 2. Framer Motion 特效变体库
    const variants = {
        idle: {
            scale: 1,
            filter: 'drop-shadow(0px 2px 2px rgba(0,0,0,0.5))'
        },
        // 常驻脉冲：缓慢的呼吸灯，不刺眼
        active_pulse: {
            scale: [1, 1.15, 1],
            filter: [
                `drop-shadow(0px 0px 2px ${glowColor})`,
                `drop-shadow(0px 0px 8px ${glowColor})`,
                `drop-shadow(0px 0px 2px ${glowColor})`
            ],
            transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
        },
        // 瞬发爆闪：急促的光效，适合先攻/连击这种强调速度的词条
        active_flash: {
            scale: [1, 1.25, 1],
            filter: [
                `drop-shadow(0px 0px 2px ${glowColor})`,
                `drop-shadow(0px 0px 12px ${glowColor})`,
                `drop-shadow(0px 0px 2px ${glowColor})`
            ],
            transition: { duration: 0.6, repeat: Infinity, ease: "easeOut" }
        }
    };

    return (
        <div className={`relative flex items-center justify-center group cursor-help ${sizeClass}`} title={`${config.label}: ${config.description}`}>

            {/* 特效光环底底衬 (仅激活时渲染，避免性能浪费) */}
            {isActive && (
                <motion.div
                    className="absolute inset-0 rounded-full z-0"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 0.6, scale: 1 }}
                    style={{ backgroundColor: glowColor, filter: 'blur(4px)' }}
                />
            )}

            {/* 图标本体 (承载主要的动态光影) */}
            <motion.div
                variants={variants}
                animate={isActive ? `active_${animType}` : 'idle'}
                className="w-full h-full relative z-10 flex items-center justify-center"
            >
                {config.icon ? (
                    <img src={config.icon} alt={config.label} className="w-full h-full object-contain drop-shadow-md group-hover:brightness-125 transition-all" />
                ) : (
                    <span className={`text-[10px] font-bold text-${config.color}-400`}>{config.label.substring(0, 1)}</span>
                )}
            </motion.div>
        </div>
    );
};

// 暴露给外部 (Card.tsx) 调用的主体容器组件
export const KeywordTray: React.FC<KeywordTrayProps> = ({
    keywords,
    isAttacking = false,
    isDefending = false,
    sizeClass,
    className = ''
}) => {
    if (!keywords || keywords.length === 0) return null;

    // 智能自适应大小：如果词条太多，自动把图标变小防止溢出
    const finalSizeClass = sizeClass || (keywords.length > 6 ? 'w-3 h-3' : 'w-[18px] h-[18px]');

    return (
        <div
            className={`bg-black/90 backdrop-blur-sm px-3 py-1 flex flex-wrap justify-center items-center gap-[2px] max-w-[95%] transition-colors duration-300 ${className}`}
            // 完美的六边形切角设计
            style={{ clipPath: 'polygon(8px 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 8px 100%, 0 50%)' }}
        >
            {keywords.map(k => (
                <SmartKeywordIcon
                    key={k}
                    keyword={k}
                    sizeClass={finalSizeClass}
                    isAttacking={isAttacking}
                    isDefending={isDefending}
                />
            ))}
        </div>
    );
};