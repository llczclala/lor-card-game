// ==========================================
// 悖论迷宫 · 迷宫BUFF 悬停大图预览（浮层）
// [2026-08-11 莉莉子] 复用 FloatingCardPreview 已验证的"portal + gameScale + 碰撞检测"套路，
// 但渲染的是 EnhancementCard（250×395）而非 Card（FloatingCardPreview 硬编码 CardData，泛化风险大，故自建轻量浮层）。
// 触发/消失手感（500ms delay + 150ms leaveBuffer）由 NodePreviewPanel 用 ref 定时器复刻，不碰 useCardGaze 本体。
// ==========================================
import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { EnhancementCard } from './modals/EnhancementCard';
import type { MazeEnhancement } from '../../data/roguelike/enhancements';

// BUFF 卡面需要的字段（EnemyBuff / MazeEnhancement 均天然满足）
export type BuffCardFace = Pick<MazeEnhancement, 'name' | 'description' | 'rarity' | 'icon'> & { id?: string };

export interface EnhancementPreviewHover {
    buff: BuffCardFace;
    rect: DOMRect; // 触发元素的屏幕矩形（用于定位）
    /**
     * [2026-10-20 莉莉子 · 图鉴 NEW 角标] 这个悬停大卡要不要**禁止**打 NEW 角标。
     *
     * 为什么需要：本浮层被三个入口共用，而只有一个是"候选/未见过的"：
     *   · `NodePreviewPanel` —— 展示的是**敌方**强化（`node.enemyBuffs`）⇒ 绝不能标 NEW
     *   · `RunEnhancementStrip` —— 展示**玩家本局已持有**的强化 ⇒ 标 NEW 最刺眼
     *   · `EvaluationPanel` —— 通行证等级奖励预览（还没拿到）⇒ 保留自动判定
     * 之前这三种情况一律走自动判定，导致"自己已有 / 敌人身上"的强化在悬停大卡上也顶着 NEW。
     */
    noNew?: boolean;
}

interface EnhancementPreviewProps {
    hover: EnhancementPreviewHover | null;
}

export const EnhancementPreview: React.FC<EnhancementPreviewProps> = ({ hover }) => {
    if (typeof document === 'undefined') return null;
    return createPortal(
        <AnimatePresence>
            {hover && <PreviewCard key={hover.buff.name} buff={hover.buff} rect={hover.rect} noNew={hover.noNew} />}
        </AnimatePresence>,
        document.body,
    );
};

const PreviewCard: React.FC<{ buff: BuffCardFace; rect: DOMRect; noNew?: boolean }> = ({ buff, rect, noNew }) => {
    // [2026-08-11] 与 FloatingCardPreview 同款缩放：基准 1680×1050
    const gameScale = Math.min(window.innerWidth / 1680, window.innerHeight / 1050);
    const s = 0.85 * gameScale;
    const W = 250 * s;
    const H = 395 * s;

    // 默认放触发行左侧；左侧空间不足（贴近左缘）翻到右侧
    const left = rect.left - W - 12 >= 12 ? rect.left - W - 12 : rect.right + 12;
    // 纵向居中于触发行，越界时钳制到屏幕内
    const top = Math.max(H / 2 + 12, Math.min(rect.top + rect.height / 2, window.innerHeight - H / 2 - 12));

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            style={{ position: 'fixed', left, top, zIndex: 10001, pointerEvents: 'none', transform: 'translateY(-50%)' }}
        >
            <div className="drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)]" style={{ transform: `scale(${s})`, transformOrigin: 'center' }}>
                <EnhancementCard enhancement={buff} isSelected={false} onClick={() => {}} forceNew={noNew ? false : undefined} />
            </div>
        </motion.div>
    );
};
