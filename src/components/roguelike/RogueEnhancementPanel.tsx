// ==========================================
// 悖论迷宫 · 战斗内敌我强化总览
// [2026-08-28 莉莉子] 程要求：战斗中加入「敌我强化查看」按钮（画面左侧中部）。
//   点击弹出总览面板，**上下分栏**展示 我方强化 / 敌方强化（EnhancementCard 图鉴卡，
//   与逻辑研习/敌人详情一致）。敌方强化完整展示（含生命强化，与地图预览一致，信息透明）。
//   关闭：ESC（capture 拦截，不触发生成战斗返回）/ 点空白 / 点 X。
// [2026-09-25 莉莉子 三线任务化框架] 新增「🎯 任务进度」区：
//   三线任务化条目（武装整局任务 / 装备单场条件 / 强化解锁门）的当前进度。
//   设计依据：炉石任务牌的坑 #1「进度必须公开可见」—— 没有进度显示，"任务引导玩家"就无从谈起。
//   进度由 useGameState（单场）与 useRoguelikeRun（整局）经事件总线广播 ——
//   面板**不新增 props**，因此也**不必改动 GameSession / Card 这两个红线文件**。
// ==========================================
import React, { useEffect, useState } from 'react';
import { Hexagon, X } from 'lucide-react';
import { getBuffById, type MazeBuff } from '../../data/roguelike/buffs';
import { EnhancementCard } from './EnhancementCard';
import { eventBus, GameEvents } from '../../utils/eventBus';

/** 任务进度行（广播 payload 的约定结构） */
interface QuestRow {
    key: string;
    name: string;
    sub?: string;      // 归属说明：武装 / 迷宫强化 / 挂在哪张卡上
    current: number;
    threshold: number;
    done: boolean;
}

interface RogueEnhancementPanelProps {
    playerEnhancements?: string[]; // 我方强化 id（game.rogueEnhancements，含即时型+战斗型）
    enemyEnhancements?: string[];  // 敌方强化 id（game.enemyEnhancements，含生命强化）
}

export const RogueEnhancementPanel: React.FC<RogueEnhancementPanelProps> = ({ playerEnhancements, enemyEnhancements }) => {
    const [open, setOpen] = useState(false);
    // [2026-09-25 莉莉子 三线任务化框架] 任务进度：按作用域分别接收（整局 / 单场）
    const [quests, setQuests] = useState<{ battle: QuestRow[]; run: QuestRow[] }>({ battle: [], run: [] });

    const playerDefs: MazeBuff[] = (playerEnhancements ?? [])
        .map(id => getBuffById(id))
        .filter((b): b is MazeBuff => !!b);
    const enemyDefs: MazeBuff[] = (enemyEnhancements ?? [])
        .map(id => getBuffById(id))
        .filter((b): b is MazeBuff => !!b);

    useEffect(() => {
        const onQuestUi = (payload?: { scope?: 'battle' | 'run'; rows?: QuestRow[] }) => {
            const scope = payload?.scope;
            if (!scope) return;
            setQuests(prev => ({ ...prev, [scope]: payload?.rows ?? [] }));
        };
        eventBus.on(GameEvents.ROGUE_QUEST_UI, onQuestUi);
        return () => eventBus.off(GameEvents.ROGUE_QUEST_UI, onQuestUi);
    }, []);

    // 整局任务在前（更长期的目标优先展示），单场任务在后
    const questRows = [...quests.run, ...quests.battle];

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
                title="敌我强化"
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
                            {questRows.length > 0 && (
                                <>
                                    <QuestSection rows={questRows} />
                                    <div className="shrink-0 border-t border-white/10" />
                                </>
                            )}
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

/** [2026-09-25 莉莉子 三线任务化框架] 任务进度区：一条一行 + 进度条；达成的整条转金 */
const QuestSection: React.FC<{ rows: QuestRow[] }> = ({ rows }) => (
    <div className="flex flex-col gap-3">
        <h4 className="text-sm font-bold tracking-widest flex items-center gap-2 text-amber-300">
            🎯 任务进度
            <span className="text-xs font-mono text-gray-500">×{rows.length}</span>
        </h4>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
            {rows.map(r => {
                const pct = r.threshold > 0 ? Math.min(100, Math.round((r.current / r.threshold) * 100)) : 100;
                return (
                    <div key={r.key}
                        className={`rounded-xl border px-3 py-2 ${r.done ? 'border-amber-400/50 bg-amber-400/10' : 'border-white/10 bg-white/[0.03]'}`}>
                        <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold truncate ${r.done ? 'text-amber-300' : 'text-gray-200'}`}>{r.name}</span>
                            {r.sub && <span className="shrink-0 text-[10px] text-gray-500 truncate max-w-[110px]">{r.sub}</span>}
                            <div className="flex-1" />
                            <span className={`shrink-0 text-xs font-mono ${r.done ? 'text-amber-300' : 'text-gray-400'}`}>
                                {r.done ? '已达成' : `${r.current}/${r.threshold}`}
                            </span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-300"
                                style={{ width: `${pct}%`, background: r.done ? '#fbbf24' : '#a78bfa' }} />
                        </div>
                    </div>
                );
            })}
        </div>
    </div>
);

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
