// ==========================================
// 悖论迷宫 · 「迷宫强化」图标列（可复用条）
//
// [2026-10-04 程拍板] 两个使用场景：
//   ① **结算界面**右侧、天启者手牌**下方**（程要求）
//   ② 将来任何"要展示一串强化 + 悬停看大图"的地方
//
// 🔧 收口说明：本文件把原先**各组件各抄一份**的 `bindBuffHover`
//   （`EvaluationPanel:93` · `NodePreviewPanel:59` 各一份）连同"图标列渲染"收成一个可复用件，
//   避免再出现第三份 —— 那正是本项目"同一语义多处实现 ⇒ 必漏一处"的老病。
//
// 交互：图标（圆形 + 品质色描边，与战斗内 ModPanel 同款语言）+ **悬停 400ms 浮出强化大卡**。
// ==========================================
import React, { useRef, useState } from 'react';
import { MAZE_BUFFS, type MazeBuff } from '../../data/roguelike/buffs';
import { RARITY_META } from './RarityIcon';
import { EnhancementPreview, type EnhancementPreviewHover } from './EnhancementPreview';

interface RunEnhancementStripProps {
    /** 强化 id 列表（= `run.enhancements`） */
    enhancements: string[];
    /** 图标边长（px，默认 56） */
    iconSize?: number;
    /** 追加到容器上的类名（间距 / 换行等由调用方决定） */
    className?: string;
}

export const RunEnhancementStrip: React.FC<RunEnhancementStripProps> = ({ enhancements, iconSize = 56, className }) => {
    const [hover, setHover] = useState<EnhancementPreviewHover | null>(null);
    const enterRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const leaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const defs = enhancements
        .map(id => MAZE_BUFFS.find(b => b.id === id))
        .filter((b): b is MazeBuff => !!b);
    if (defs.length === 0) return null;   // 没有强化 ⇒ 整块不占位

    /** 悬停绑定（400ms 浮现 + 150ms 离开缓冲；与 EvaluationPanel/NodePreviewPanel 手感一致） */
    const bind = (buff: MazeBuff) => ({
        onMouseEnter: (e: React.MouseEvent) => {
            if (leaveRef.current) { clearTimeout(leaveRef.current); leaveRef.current = null; }
            if (enterRef.current) clearTimeout(enterRef.current);
            // ⚠️ 必须**同步**取 rect：React 合成事件在异步回调里 currentTarget 会被置 null
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            enterRef.current = setTimeout(() => setHover({ buff, rect }), 400);
        },
        onMouseLeave: () => {
            if (enterRef.current) { clearTimeout(enterRef.current); enterRef.current = null; }
            if (leaveRef.current) clearTimeout(leaveRef.current);
            leaveRef.current = setTimeout(() => setHover(null), 150);
        },
    });

    return (
        <>
            <div className={`flex flex-wrap items-center justify-center gap-2.5 ${className ?? ''}`}>
                {defs.map(def => {
                    const meta = RARITY_META[def.rarity];
                    return (
                        <div
                            key={def.id}
                            className="relative shrink-0 cursor-help"
                            style={{ width: iconSize, height: iconSize }}
                            {...bind(def)}
                        >
                            <div
                                className="h-full w-full overflow-hidden rounded-full border-2 bg-black"
                                style={{ borderColor: meta.color, boxShadow: `0 0 10px ${meta.color}66` }}
                            >
                                <img src={def.icon} alt={def.name} className="h-full w-full object-cover" draggable={false} />
                            </div>
                        </div>
                    );
                })}
            </div>
            {/* 悬停大卡（portal 到 body，自带 gameScale 补偿与碰撞定位） */}
            <EnhancementPreview hover={hover} />
        </>
    );
};
