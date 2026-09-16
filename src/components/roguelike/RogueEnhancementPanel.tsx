// ==========================================
// 悖论迷宫 · 战斗内敌我强化总览
// [2026-08-28 莉莉子] 程要求：战斗中加入「敌我强化查看」按钮（画面左侧中部）。
//   点击弹出总览面板，**上下分栏**展示 我方强化 / 敌方强化（EnhancementCard 图鉴卡，
//   与逻辑研习/敌人详情一致）。敌方强化完整展示（含生命强化，与地图预览一致，信息透明）。
//   关闭：ESC（capture 拦截，不触发生成战斗返回）/ 点空白 / 点 X。
// ==========================================
import React, { useEffect, useState } from 'react';
import { Hexagon, X } from 'lucide-react';
import { getBuffById, type MazeBuff } from '../../data/roguelike/buffs';
import { EnhancementCard } from './EnhancementCard';

interface RogueEnhancementPanelProps {
    playerEnhancements?: string[]; // 我方强化 id（game.rogueEnhancements，含即时型+战斗型）
    enemyEnhancements?: string[];  // 敌方强化 id（game.enemyEnhancements，含生命强化）
}

export const RogueEnhancementPanel: React.FC<RogueEnhancementPanelProps> = ({ playerEnhancements, enemyEnhancements }) => {
    const [open, setOpen] = useState(false);

    const playerDefs: MazeBuff[] = (playerEnhancements ?? [])
        .map(id => getBuffById(id))
        .filter((b): b is MazeBuff => !!b);
    const enemyDefs: MazeBuff[] = (enemyEnhancements ?? [])
        .map(id => getBuffById(id))
        .filter((b): b is MazeBuff => !!b);

    // ESC 关闭（capture 阶段拦截，避免与战斗全局 ESC 返回冲突）
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopImmediatePropagation();
                setOpen(false);
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open]);

    return (
        <>
            {/* 左侧中部入口按钮（对称右侧「对局记录」） */}
            <button
                className="fixed left-0 top-1/2 -translate-y-1/2 z-[9998] w-9 h-24 bg-slate-800/80 hover:bg-slate-700/90 border border-white/10 border-l-0 rounded-r-xl flex items-center justify-center transition-all shadow-lg hover:shadow-violet-500/20 group"
                onClick={() => setOpen(true)}
                title="敌我强化总览"
            >
                <div className="flex flex-col items-center gap-1.5">
                    <Hexagon size={18} className="text-violet-400 group-hover:scale-110 transition-transform" />
                    <span className="text-[9px] text-gray-300 [writing-mode:vertical-rl] tracking-widest">敌我强化</span>
                </div>
            </button>

            {open && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
                    onClick={() => setOpen(false)}>
                    <div
                        className="w-[min(1000px,92vw)] max-h-[88vh] bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-pop-in"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* 头部 */}
                        <div className="shrink-0 flex items-center gap-2 px-5 py-3 border-b border-white/10">
                            <Hexagon size={18} className="text-violet-400" />
                            <h3 className="text-lg font-black tracking-widest text-white">敌我强化</h3>
                            <span className="text-xs text-gray-500">我方 {playerDefs.length} · 敌方 {enemyDefs.length}</span>
                            <div className="flex-1" />
                            <button onClick={() => setOpen(false)}
                                className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                title="关闭 (ESC)">
                                <X size={18} />
                            </button>
                        </div>

                        {/* 上下分栏内容区（可滚动） */}
                        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
                            <Section title="我方强化" color="#34d399" defs={playerDefs} emptyText="尚未获得强化" />
                            <div className="shrink-0 border-t border-white/10" />
                            <Section title="敌方强化" color="#f87171" defs={enemyDefs} emptyText="敌方未持有强化" />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

/** 上下分栏区块：标题 + EnhancementCard 图鉴卡网格 */
const Section: React.FC<{ title: string; color: string; defs: MazeBuff[]; emptyText: string }> = ({ title, color, defs, emptyText }) => (
    <div className="flex flex-col gap-3">
        <h4 className="text-sm font-bold tracking-widest flex items-center gap-2" style={{ color }}>
            {title}
            <span className="text-xs font-mono text-gray-500">×{defs.length}</span>
        </h4>
        {defs.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center border border-white/5 rounded-xl">{emptyText}</p>
        ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                {defs.map(b => <EnhancementCard key={b.id} e={b} />)}
            </div>
        )}
    </div>
);
