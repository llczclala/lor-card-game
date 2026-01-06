import React, { useEffect, useState } from 'react';
import { MANA_IMAGES } from '../data/imageData';

interface ManaGemSystemProps {
    currentMana: number;
    maxMana: number;
    spellMana: number;
    previewManaCost: number;
    previewSpellManaCost: number;
    isPlayer: boolean;
    round: number;
}

export const ManaGemSystem: React.FC<ManaGemSystemProps> = ({
    currentMana, maxMana, spellMana,
    previewManaCost, previewSpellManaCost,
    isPlayer, round
}) => {
    const [prevRound, setPrevRound] = useState(round);
    const [isAnimating, setIsAnimating] = useState(false);

    // 监听回合变化，触发序列点亮动画
    useEffect(() => {
        if (round > prevRound) {
            setPrevRound(round);
            setIsAnimating(true);
            const timer = setTimeout(() => setIsAnimating(false), 2500);
            return () => clearTimeout(timer);
        }
    }, [round]);

    // --- 渲染核心函数：渲染单层水晶图层 ---
    const renderGemLayer = (
        type: 'mana' | 'spell',
        index: number,
        isActive: boolean,
        isPreviewing: boolean
    ) => {
        if (!isActive) return null;

        // 1. 获取图片资源
        let imgSrc = '';
        if (type === 'mana') {
            const imgArray = isPlayer ? MANA_IMAGES.player.mana : MANA_IMAGES.enemy.mana;
            // 安全获取，防止 index 越界
            imgSrc = imgArray[index] || '';
        } else {
            const imgArray = isPlayer ? MANA_IMAGES.player.spell : MANA_IMAGES.enemy.spell;
            imgSrc = imgArray[index] || '';
        }

        if (!imgSrc) return null;

        // 2. 动画状态
        let animClass = '';
        const style: React.CSSProperties = {
            // 确保层级顺序，虽然对于叠加图层影响不大，但保持逻辑清晰
            zIndex: index
        };

        // 回合开始：序列点亮
        if (isAnimating) {
            animClass = 'animate-gem-light-up';
            // 索引越大延迟越高，形成流光感
            style.animationDelay = `${index * 0.15}s`;
        }

        // 预览消耗：整体抬升
        if (isPreviewing) {
            animClass = 'animate-gem-raise';
            style.animationDelay = '0s'; // 立即抬升
        }

        // 3. 渲染全尺寸图层
        // [关键修正] 使用 absolute inset-0 w-full h-full
        // 这会让每一张水晶图片都铺满父容器（也就是那个按钮容器的大小）
        // 由于图片本身大部分是透明的，只有对应位置有水晶，所以它们会完美重叠
        return (
            <div
                key={`${type}-${index}`}
                className={`absolute inset-0 pointer-events-none transition-all duration-300 ${animClass}`}
                style={style}
            >
                <img
                    src={imgSrc}
                    alt={`${type} gem ${index + 1}`}
                    className="w-full h-full object-contain" // 保持原始比例铺满
                />
            </div>
        );
    };

    return (
        // 根容器：铺满父级 (GameSession 中的 relative 容器)
        <div className="absolute inset-0 pointer-events-none z-40">

            {/* 1. 法术法力层 (0-2) */}
            {Array.from({ length: 3 }).map((_, i) => {
                const hasGem = i < spellMana;
                // 预览逻辑：假设从最大的索引开始消耗
                const isPreviewing = hasGem && (i >= spellMana - previewSpellManaCost);

                return renderGemLayer('spell', i, hasGem, isPreviewing);
            })}

            {/* 2. 普通法力层 (0-9) */}
            {Array.from({ length: 10 }).map((_, i) => {
                const hasGem = i < currentMana;
                const isPreviewing = hasGem && (i >= currentMana - previewManaCost);

                return renderGemLayer('mana', i, hasGem, isPreviewing);
            })}

        </div>
    );
};