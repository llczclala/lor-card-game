import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from './Card';
import type { CardData } from '../types';

// ─── GazeTarget 类型 ────────────────────────────────────────────
// 与 useCardGaze 返回的 gazeTarget 结构一致，避免循环依赖
interface GazeTarget {
    card: CardData;
    cardRect: DOMRect; // [修改] 接收真实的 DOM 矩形
}

interface FloatingCardPreviewProps {
    /** @deprecated 使用 gazeTarget.card 代替 */
    card?: CardData | null;
    /** follow 模式下传入的复合目标（包卡牌 + 坐标） */
    gazeTarget?: GazeTarget | null;
    /** 定位模式 */
    mode?: 'fixed' | 'follow';
    /** fixed 模式专用：定位样式类，默认在左侧居中 */
    position?: string;
    /** 缩放倍率，默认 1.25 */
    scale?: number;
    /** 是否可交互（允许鼠标移入预览图保持显示），默认 false */
    interactive?: boolean;
    /** 鼠标进入预览图回调（interactive 时使用） */
    onMouseEnter?: () => void;
    /** 鼠标离开预览图回调（interactive 时使用） */
    onMouseLeave?: () => void;
    /** 查看原画回调 */
    onViewArt?: (card: CardData) => void;
    /** [皮肤] 当前应渲染的皮肤 ID */
    skinId?: number; // [新增]
    /** 透传给 Card 的英雄升级进度判断用 */
    playerNexusHealth?: number;
    enemyNexusHealth?: number;
}

// ─── 常量 ───────────────────────────────────────────────────────
const BASE_WIDTH = 288;       // 卡牌的基础物理宽度
const BASE_HEIGHT = 448;      // 卡牌的基础物理高度
const OFFSET = 8;             // 与实体卡牌的贴合间距 (越小越紧密)

/**
 * FloatingCardPreview
 *
 * 纯展示层——浮动卡牌大图预览。
 * 淡入淡出 + 弹性缩放动画，渲染在屏幕指定位置。
 *
 * 两种模式：
 * - fixed（默认）：由 position prop 控制位置，适合列表/编辑器场景
 * - follow：createPortal 到 document.body，随鼠标坐标动态定位，自带碰撞检测
 */
export const FloatingCardPreview: React.FC<FloatingCardPreviewProps> = ({
    card,
    gazeTarget,
    mode = 'fixed',
    position = 'fixed left-[5%] top-1/2 -translate-y-1/2',
    scale = 1,
    interactive = false,
    skinId = 0, // [新增] 解构皮肤 ID，默认为 0
    onMouseEnter,
    onMouseLeave,
    onViewArt,
    playerNexusHealth,
    enemyNexusHealth,
}) => {
    // 与 ScaleWrapper 一致的缩放比（仅 follow 模式使用，该模式通过 portal 在 ScaleWrapper 外）
    const [gameScale, setGameScale] = useState(1);
    useEffect(() => {
        const handleResize = () => {
            setGameScale(Math.min(window.innerWidth / 1680, window.innerHeight / 1050));
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // ── follow 模式 ─────────────────────────────────────────
    if (mode === 'follow') {
        // [修改] 兼容无目标的假 rect 兜底
        const target = gazeTarget ?? (card ? { card, cardRect: new DOMRect(0,0,0,0) } : null);
        if (!target) return null;

        const { card: followCard, cardRect } = target;

        // follow 模式通过 portal 在 ScaleWrapper 外，叠加游戏缩放
        const displayScale = scale * gameScale;

        // 计算缩放后的视觉尺寸
        const scaledWidth = BASE_WIDTH * displayScale;
        const scaledHeight = BASE_HEIGHT * displayScale;

        // [核心修改] 碰撞检测：默认放卡牌左侧，空间不足则翻转到右侧
        const leftSpace = cardRect.left;
        let left = 0;
        let isFlippedToRight = false; // 记录是否翻转

        // 使用缩放后的宽度判断是否会碰壁
        if (leftSpace > scaledWidth + OFFSET * gameScale) {
            // 放左边：因为后续设置了 transformOrigin: 'right'，元素的未缩放右边缘会死死锚定在原地。
            // 我们只需要算出它【未缩放时】的左边缘在哪即可。
            left = cardRect.left - BASE_WIDTH - OFFSET * gameScale;
        } else {
            // 放右边：因为设置了 transformOrigin: 'left'，元素的未缩放左边缘贴脸即可。
            left = cardRect.right + OFFSET * gameScale;
            isFlippedToRight = true;
        }

        // [新增] 纵向锚定与视口截断防御 (Viewport Clamping)
        let top = cardRect.top + (cardRect.height / 2);
        const halfVisualHeight = scaledHeight / 2;

        // 限制不要越过顶部屏幕边界 (留 20px 安全边距)
        if (top - halfVisualHeight < 20) {
            top = halfVisualHeight + 20;
        }
        // 限制不要越过底部屏幕边界
        else if (top + halfVisualHeight > window.innerHeight - 20) {
            top = window.innerHeight - halfVisualHeight - 20;
        }

        return createPortal(
            <motion.div
                key={followCard.key}
                style={{
                    position: 'fixed',
                    left,
                    top,
                    zIndex: 10001,
                    pointerEvents: interactive ? 'auto' : 'none',
                    // [核心法门] 动态更改缩放原点！彻底消灭“缩放空气墙”！
                    // 在左侧就以右边缘为基准向左膨胀，在右侧就以左边缘为基准向右膨胀
                    transformOrigin: isFlippedToRight ? 'left center' : 'right center'
                }}
                onMouseEnter={interactive ? onMouseEnter : undefined}
                onMouseLeave={interactive ? onMouseLeave : undefined}
                // [细节优化] 使用 y: '-50%' 让投影仪在Y轴完美对准计算好的安全 Top 点
                initial={{ opacity: 0, x: isFlippedToRight ? -20 : 20, y: '-50%', scale: 1.1 * gameScale }}
                animate={{ opacity: 1, x: 0, y: '-50%', scale: displayScale }}
                exit={{ opacity: 0, x: isFlippedToRight ? -10 : 10, y: '-50%', transition: { duration: 0.1 } }}
                transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 25,
                    opacity: { duration: 0.2 },
                }}
            >
                <div className="drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
                    <Card
                        data={followCard}
                        location="preview"
                        skinId={skinId}
                        isFaceUp={true}
                        onViewArt={onViewArt}
                        playerNexusHealth={playerNexusHealth}
                        enemyNexusHealth={enemyNexusHealth}
                    />
                </div>
            </motion.div>,
            document.body
        );
    }

    // ── fixed 模式（原有逻辑，保持不变）─────────────────────
    return (
        <AnimatePresence mode="wait">
            {card && (
                <motion.div
                    key={card.key}
                    className={`${position} z-[300] pointer-events-auto`}
                    onMouseEnter={interactive ? onMouseEnter : undefined}
                    onMouseLeave={interactive ? onMouseLeave : undefined}
                    initial={{ opacity: 0, x: 20, scale: 1.1 }}
                    animate={{ opacity: 1, x: 0, scale }}
                    exit={{ opacity: 0, x: 10, transition: { duration: 0.1 } }}
                    transition={{
                        type: 'spring',
                        stiffness: 300,
                        damping: 25,
                        opacity: { duration: 0.2 },
                    }}
                >
                    <div className="drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
                        <Card
                            data={card}
                            location="preview"
                            skinId={skinId}
                            isFaceUp={true}
                            onViewArt={onViewArt}
                            playerNexusHealth={playerNexusHealth}
                            enemyNexusHealth={enemyNexusHealth}
                        />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
