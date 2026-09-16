// ==========================================
// 悖论迷宫 · 关键词悬停大卡预览（浮层）
// [2026-09-10 莉莉子] 对局中悬停卡牌关键词图标 → 浮出关键词说明大卡。
//
// 背景：原先 KeywordTray 用的是原生 `title`（浏览器自带小白框黑字），
//   而右键详情 FullArtOverlay（Overlays.tsx）里早已有做好的自定义样式浮层 —— 两处观感割裂。
//   本次统一为 FullArtOverlay 那套观感（彩色标题 + 描述 + 图标），并按 ArmamentPreview 的模式实现。
//
// ⚠️ 为什么必须走 portal（不能直接在 KeywordTray 里写 CSS 浮层）：
//   1. KeywordTray 挂在卡体内部，卡体祖先有 overflow-hidden → 浮层会被裁掉出不去
//   2. 卡牌内部在缩放坐标系（手牌 scale 0.45）→ 浮层文字会跟着缩到看不清
//   故仿照 ArmamentPreview：createPortal 到 body，内部逻辑尺寸渲染 + 外层 scale(gameScale) 补偿
//   （见 技术手册/design-guide.md「分辨率适配铁律」）
//
// 用法：<div {...bindKeywordGaze('Overwhelm')}>...</div>；全局挂载一次 <KeywordPreview />
// ==========================================
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { KEYWORD_DB } from '../data/keywords';
import type { Keyword } from '../types';
import { eventBus, GameEvents } from '../utils/eventBus';
import { getGameScale } from '../utils/gameScale'; // [2026-09-10] 逃出 scale 容器后按 gameScale 补偿

// [2026-09-10] Tailwind 400 档色值 → hex（KEYWORD_DB.color 存的是 Tailwind 色名，浮层要用真色值做边框/发光）
const COLOR_HEX: Record<string, string> = {
    slate: '#94a3b8', gray: '#9ca3af', zinc: '#a1a1aa', neutral: '#a3a3a3', stone: '#a8a29e',
    red: '#f87171', orange: '#fb923c', amber: '#fbbf24', yellow: '#facc15', lime: '#a3e635',
    green: '#4ade80', emerald: '#34d399', teal: '#2dd4bf', cyan: '#22d3ee', blue: '#60a5fa',
    indigo: '#818cf8', violet: '#a78bfa', purple: '#c084fc', fuchsia: '#e879f9', rose: '#fb7185',
};

// [2026-09-10] 浮层逻辑尺寸（1680 坐标系；实际定位/尺寸按 gameScale 折算到屏幕）
const CARD_W = 300;
const CARD_H = 300; // 估算高度，仅供鼠标位置兜底判定用（与 ArmamentPreview 的 H 同用途）

/**
 * [2026-09-10 莉莉子] 绑定关键词图标的悬停广播事件（返回 props 展开到图标元素上）。
 * 用法：<div {...bindKeywordGaze('Overwhelm')}>...</div>
 */
export const bindKeywordGaze = (keyword: Keyword) => ({
    onMouseEnter: (e: React.MouseEvent) => {
        const el = e.currentTarget as HTMLElement;
        eventBus.emit(GameEvents.KEYWORD_GAZE_SHOW, { keyword, rect: el.getBoundingClientRect() });
    },
    onMouseLeave: () => {
        eventBus.emit(GameEvents.KEYWORD_GAZE_HIDE);
    },
});

interface GazePayload {
    keyword: Keyword;
    rect: DOMRect;
}

export const KeywordPreview: React.FC = () => {
    const [hover, setHover] = useState<GazePayload | null>(null);
    const enterTimer = useRef<number | null>(null);
    const leaveTimer = useRef<number | null>(null);
    // [2026-09-10] 兜底：关闭不能只依赖 mouseleave（触发源被卸载/遮挡时 mouseleave 会丢失 → 大卡卡在画面）
    const hoverRef = useRef<GazePayload | null>(null);
    hoverRef.current = hover;

    useEffect(() => {
        const show = (payload: GazePayload) => {
            if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
            if (enterTimer.current) clearTimeout(enterTimer.current);
            enterTimer.current = window.setTimeout(() => setHover(payload), 300); // 悬停 300ms 浮现（同武装大卡手感）
        };
        const hide = () => {
            if (enterTimer.current) { clearTimeout(enterTimer.current); enterTimer.current = null; }
            if (leaveTimer.current) clearTimeout(leaveTimer.current);
            leaveTimer.current = window.setTimeout(() => setHover(null), 150); // 离开缓冲
        };
        const forceClose = () => {
            if (enterTimer.current) { clearTimeout(enterTimer.current); enterTimer.current = null; }
            if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
            setHover(null);
        };
        // 鼠标位置兜底：鼠标离开 [触发图标 ∪ 大卡] 区域 → 立即关闭。
        // 定位公式与 KeywordCard 保持一致，保证"鼠标移到大卡上查看"时不误关。
        const onMove = (e: MouseEvent) => {
            const cur = hoverRef.current;
            if (!cur) return;
            const r = cur.rect;
            const inTrigger = e.clientX >= r.left - 12 && e.clientX <= r.right + 12
                && e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12;
            if (inTrigger) return;
            const gameScale = getGameScale();
            const W = CARD_W * gameScale, H = CARD_H * gameScale;
            const left = r.right + 14 + W <= window.innerWidth - 14 ? r.right + 14 : Math.max(14, r.left - W - 14);
            const top = Math.max(12, Math.min(r.top, window.innerHeight - H));
            const inCard = e.clientX >= left - 12 && e.clientX <= left + W + 12
                && e.clientY >= top - 12 && e.clientY <= top + H + 12;
            if (inCard) return;
            forceClose();
        };
        const onDocClick = () => { if (hoverRef.current) forceClose(); }; // 点击任意处兜底关闭
        window.addEventListener('mousemove', onMove);
        window.addEventListener('click', onDocClick);
        eventBus.on(GameEvents.KEYWORD_GAZE_SHOW, show);
        eventBus.on(GameEvents.KEYWORD_GAZE_HIDE, hide);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('click', onDocClick);
            eventBus.off(GameEvents.KEYWORD_GAZE_SHOW, show);
            eventBus.off(GameEvents.KEYWORD_GAZE_HIDE, hide);
            if (enterTimer.current) clearTimeout(enterTimer.current);
            if (leaveTimer.current) clearTimeout(leaveTimer.current);
        };
    }, []);

    if (typeof document === 'undefined') return null;
    return createPortal(
        <AnimatePresence>
            {hover && <KeywordCard key={hover.keyword} keyword={hover.keyword} rect={hover.rect} />}
        </AnimatePresence>,
        document.body,
    );
};

/** 关键词大卡：彩色标题 + 图标 + 描述（观感对齐 FullArtOverlay 的关键词浮层）。定位碰撞 + 越界钳制 */
const KeywordCard: React.FC<{ keyword: Keyword; rect: DOMRect }> = ({ keyword, rect }) => {
    const config = KEYWORD_DB[keyword];
    // [2026-09-10] createPortal 到 body（逃出 scale 容器）：定位用屏幕尺寸，内容以逻辑尺寸渲染 + 外层 scale 缩放到屏幕
    const gameScale = getGameScale();
    const W = CARD_W * gameScale;
    const H = CARD_H * gameScale;
    // 放触发行右侧；右侧空间不足（贴近右缘）翻到左侧
    const left = rect.right + 14 + W <= window.innerWidth - 14 ? rect.right + 14 : Math.max(14, rect.left - W - 14);
    // 纵向对齐触发行顶部，越界钳制到屏幕内
    const top = Math.max(12, Math.min(rect.top, window.innerHeight - H));

    if (!config) return null;
    const color = COLOR_HEX[config.color] ?? '#e5e7eb';

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.92, x: -10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            style={{ position: 'fixed', left, top, zIndex: 10001, pointerEvents: 'none' }}
            className="text-white font-sans select-none"
        >
            {/* 内层按 gameScale 缩放到屏幕：内部以逻辑尺寸（300px）渲染，随分辨率一起缩放 */}
            <div style={{ transform: `scale(${gameScale})`, transformOrigin: 'top left' }}>
                <div
                    className="w-[300px] rounded-2xl border p-5 flex flex-col items-center gap-3.5 drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
                    style={{ background: 'linear-gradient(165deg, #13161c 0%, #1a1f2b 48%, #13161c 100%)', borderColor: `${color}55`, boxShadow: `0 0 20px ${color}22` }}
                >
                    {/* 关键词图标 */}
                    <div className="w-20 h-20 flex items-center justify-center rounded-xl p-2"
                        style={{ background: `${color}18`, border: `1px solid ${color}66` }}>
                        {config.icon
                            ? <img src={config.icon} alt={config.label} className="w-full h-full object-contain drop-shadow-md" draggable={false} />
                            : <span className="text-3xl font-black" style={{ color }}>{config.label.substring(0, 1)}</span>}
                    </div>
                    {/* 名称 */}
                    <div className="text-center text-lg font-bold tracking-wide" style={{ color, textShadow: `0 0 10px ${color}66` }}>
                        {config.label}
                    </div>
                    {/* 「关键词」标签 */}
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded font-mono"
                        style={{ color, border: `1px solid ${color}44`, background: `${color}11` }}>
                        关键词
                    </span>
                    {/* 描述 */}
                    <p className="text-gray-300 text-sm leading-relaxed text-center">{config.description}</p>
                </div>
            </div>
        </motion.div>
    );
};
