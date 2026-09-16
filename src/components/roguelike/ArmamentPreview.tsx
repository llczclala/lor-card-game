// ==========================================
// 悖论迷宫 · 武装悬停大卡预览（浮层）
// [2026-08-26 莉莉子] 悬停武装图标时浮出武装信息大卡（样式对齐逻辑研习装备块），
// 便于玩家理解该武装的作用。通过 eventBus 跨组件广播（各处武装图标都生效）：
//   - bindArmamentGaze(equipId)：绑定到武装图标，onMouseEnter/Leave 自动广播
//   - ArmamentPreview：监听广播，createPortal 到 body 显示武装大卡（定位碰撞 + 防抖手感）
// ==========================================
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getEquipmentById, type EquipmentDef } from '../../data/equipment';
import { RARITY_META } from './RarityIcon';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { getGameScale } from '../../utils/gameScale'; // [2026-09-01] 分辨率适配：逃出 scale 容器后按 gameScale 补偿

const HEXAGON = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

/** [2026-08-26 莉莉子] 装备静态修饰/效果 → 标签列表（武装卡底部展示，对齐逻辑研习 getEquipBadges） */
export function getEquipBadges(e: EquipmentDef): string[] {
    const tags: string[] = [];
    if (e.costMod) tags.push(`费用${e.costMod > 0 ? '+' : ''}${e.costMod}`);
    if (e.powerMod || e.healthMod) tags.push(`+${e.powerMod ?? 0}/${e.healthMod ?? 0}`);
    if (e.keywords?.length) tags.push(e.keywords.join('·'));
    if (e.onPlay) tags.push('打出');
    if (e.onRoundStart) tags.push('回合开始');
    if (e.onTrigger) tags.push('成长');
    return tags;
}

/**
 * [2026-08-26 莉莉子] 绑定武装图标的悬停广播事件（返回 props 展开到武装图标元素上）。
 * 用法：<div {...bindArmamentGaze(equipId)}>...</div> 或 <div {...bindArmamentGaze([id1, id2, id3])}>（多武装同时展示多张大卡）
 */
export const bindArmamentGaze = (equipIds: string | string[]) => {
    const ids = Array.isArray(equipIds) ? equipIds : [equipIds];
    return {
        onMouseEnter: (e: React.MouseEvent) => {
            const el = e.currentTarget as HTMLElement;
            eventBus.emit(GameEvents.ARMAMENT_GAZE_SHOW, { equipIds: ids, rect: el.getBoundingClientRect() });
        },
        onMouseLeave: () => {
            eventBus.emit(GameEvents.ARMAMENT_GAZE_HIDE);
        },
    };
};

interface GazePayload {
    equipIds: string[];
    rect: DOMRect;
}

export const ArmamentPreview: React.FC = () => {
    const [hover, setHover] = useState<GazePayload | null>(null);
    const enterTimer = useRef<number | null>(null);
    const leaveTimer = useRef<number | null>(null);
    // [2026-08-28 莉莉子 修复] 兜底：关闭不能只依赖 pips 的 mouseleave。
    // 根因：手牌悬停大图（location="preview" 卡）上也渲染武装 pips，鼠标 hover 它触发本大图后，
    // 手牌大图被卸载（React 移除 DOM 不派发 mouseleave）→ ARMAMENT_GAZE_HIDE 丢失 → 本大图卡死。
    const hoverRef = useRef<GazePayload | null>(null);
    hoverRef.current = hover;

    useEffect(() => {
        const show = (payload: GazePayload) => {
            if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
            if (enterTimer.current) clearTimeout(enterTimer.current);
            enterTimer.current = window.setTimeout(() => setHover(payload), 300); // 悬停 300ms 浮现
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
        // [2026-08-28 莉莉子 修复] 鼠标位置兜底：鼠标离开 [触发图标 ∪ 武装大卡] 区域 → 立即关闭，
        // 不依赖 mouseleave（触发源被卸载/遮挡/事件穿透时 mouseleave 会丢失，导致大卡卡在画面）。
        // 定位公式与 ArmamentCards 保持一致（W=320/GAP=12/H≈430），保证"鼠标移到大卡上查看"时不误关。
        const onMove = (e: MouseEvent) => {
            const cur = hoverRef.current;
            if (!cur) return;
            const r = cur.rect;
            const inTrigger = e.clientX >= r.left - 12 && e.clientX <= r.right + 12
                && e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12;
            if (inTrigger) return;
            // [2026-09-01] 与 ArmamentCards 一致的屏幕尺寸（×gameScale），保证"鼠标移到大卡上查看"判断不误关
            const gameScale = getGameScale();
            const W = 320 * gameScale, GAP = 12 * gameScale, H = 430 * gameScale;
            const totalW = cur.equipIds.length * W + (cur.equipIds.length - 1) * GAP;
            const left = r.right + 14 + totalW <= window.innerWidth - 14 ? r.right + 14 : Math.max(14, r.left - totalW - 14);
            const top = Math.max(12, Math.min(r.top, window.innerHeight - H));
            const inCard = e.clientX >= left - 12 && e.clientX <= left + totalW + 12
                && e.clientY >= top - 12 && e.clientY <= top + H + 12;
            if (inCard) return;
            forceClose();
        };
        const onDocClick = () => { if (hoverRef.current) forceClose(); }; // 点击任意处兜底关闭
        window.addEventListener('mousemove', onMove);
        window.addEventListener('click', onDocClick);
        eventBus.on(GameEvents.ARMAMENT_GAZE_SHOW, show);
        eventBus.on(GameEvents.ARMAMENT_GAZE_HIDE, hide);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('click', onDocClick);
            eventBus.off(GameEvents.ARMAMENT_GAZE_SHOW, show);
            eventBus.off(GameEvents.ARMAMENT_GAZE_HIDE, hide);
            if (enterTimer.current) clearTimeout(enterTimer.current);
            if (leaveTimer.current) clearTimeout(leaveTimer.current);
        };
    }, []);

    if (typeof document === 'undefined') return null;
    return createPortal(
        <AnimatePresence>
            {hover && <ArmamentCards key={hover.equipIds.join('-')} equipIds={hover.equipIds} rect={hover.rect} />}
        </AnimatePresence>,
        document.body,
    );
};

/** 武装大卡容器：多个武装横向排列（如黑六边形 Xn 悬停展示全部武装的大卡）；定位碰撞 + 越界钳制 */
const ArmamentCards: React.FC<{ equipIds: string[]; rect: DOMRect }> = ({ equipIds, rect }) => {
    // [2026-09-01 莉莉子 修复·分辨率适配] 武装大卡 createPortal 到 document.body（逃出 scale 容器），
    // 320px 是 1680 坐标系逻辑宽，直接当屏幕像素用会不随分辨率缩放（低分辨率下显得过大）。
    // 改为：定位用屏幕尺寸（W/GAP/H × gameScale），内容以逻辑尺寸渲染 + 外层 scale(gameScale) 缩放到屏幕。
    const gameScale = getGameScale();
    const W = 320 * gameScale;
    const GAP = 12 * gameScale;
    const H = 430 * gameScale;
    const totalW = equipIds.length * W + (equipIds.length - 1) * GAP;
    // 放触发行右侧；右侧空间不足（贴近右缘）翻到左侧
    const left = rect.right + 14 + totalW <= window.innerWidth - 14 ? rect.right + 14 : Math.max(14, rect.left - totalW - 14);
    // 纵向对齐触发行顶部，越界钳制到屏幕内
    const top = Math.max(12, Math.min(rect.top, window.innerHeight - H));

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9, x: -12 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            style={{ position: 'fixed', left, top, zIndex: 10001, pointerEvents: 'none' }}
            className="text-white font-sans select-none"
        >
            {/* 内层按 gameScale 缩放到屏幕：内部以逻辑尺寸（320px + gap 12）渲染，随分辨率一起缩放 */}
            <div style={{ transform: `scale(${gameScale})`, transformOrigin: 'top left' }}>
                <div style={{ display: 'flex', gap: 12 }}>
                    {equipIds.map(id => <ArmamentCardFace key={id} equipId={id} />)}
                </div>
            </div>
        </motion.div>
    );
};

/** 单张武装大卡（横向排列中的一张）：品质色边框 + cardBg + 六边形图标 + 名称 + 标签 + 描述 + 修饰标签 */
const ArmamentCardFace: React.FC<{ equipId: string }> = ({ equipId }) => {
    const def = getEquipmentById(equipId);
    if (!def) return null;
    const meta = RARITY_META[def.rarity];
    const badges = getEquipBadges(def);

    return (
        <div className="w-[320px] shrink-0 rounded-2xl border p-5 flex flex-col gap-3.5 drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
            style={{ background: meta.cardBg, borderColor: `${meta.color}55`, boxShadow: `0 0 20px ${meta.color}22` }}>
            {/* 六边形大图标 */}
            <div className="w-20 h-20 mx-auto flex items-center justify-center"
                style={{ clipPath: HEXAGON, background: `${meta.color}18`, border: `1px solid ${meta.color}66` }}>
                <img src={def.icon} alt={def.name} className="w-full h-full object-cover" draggable={false} />
            </div>
            {/* 名称 */}
            <div className="text-center text-lg font-bold tracking-wide"
                style={{ color: '#fff', textShadow: `0 0 10px ${meta.color}66` }}>{def.name}</div>
            {/* 标签行：品质 + 武装 */}
            <div className="flex flex-wrap justify-center gap-1.5">
                <span className="shrink-0 text-xs px-2 py-0.5 rounded font-mono"
                    style={{ color: meta.color, border: `1px solid ${meta.color}44`, background: `${meta.color}11` }}>
                    {meta.label}
                </span>
                {def.isArmament && (
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded font-mono text-amber-200 border border-amber-300/30 bg-amber-400/10">武装</span>
                )}
            </div>
            {/* 描述 */}
            <p className="text-gray-300 text-sm leading-relaxed">{def.description}</p>
            {/* 修饰标签 */}
            {badges.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5">
                    {badges.map(b => (
                        <span key={b} className="shrink-0 text-xs px-2.5 py-1 rounded-full font-mono text-cyan-200 border border-cyan-400/30 bg-cyan-500/10">{b}</span>
                    ))}
                </div>
            )}
        </div>
    );
};
