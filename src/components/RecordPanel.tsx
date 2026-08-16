import { useRef, useEffect, useCallback, useMemo } from 'react';
import type { GameRecord, CardData, RecordEntity } from '../types';
import { CARD_DB } from '../data/cards';
import { Card } from './Card';
import { useCardGaze } from '../hooks/useCardGaze';
import { FloatingCardPreview } from './FloatingCardPreview';

// ==========================================
// 📜 对局记录面板
// 层级: z-[9999] 确保在所有 UI 之上
// 宽度: 屏幕一半，最大 640px
// ==========================================

interface RecordPanelProps {
    records: GameRecord[];
    isOpen: boolean;
    onClose: () => void;
    onViewCard?: (card: CardData) => void;
}

export const RecordPanel: React.FC<RecordPanelProps> = ({ records, isOpen, onClose, onViewCard }) => {
    const listRef = useRef<HTMLDivElement>(null);

    // [2026-07-23] 悬停大图检视
    const { gazeTarget, bindGazeEvents, keepAlive, scheduleDismiss } = useCardGaze({ delay: 600 });

    // 新记录时自动滚到底部
    useEffect(() => {
        if (isOpen && listRef.current) {
            requestAnimationFrame(() => {
                if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
            });
        }
    }, [records.length, isOpen]);

    if (!isOpen) return null;

    // 按回合分组（从旧到新）
    const turnMap = new Map<number, GameRecord[]>();
    for (const r of records) {
        const list = turnMap.get(r.turn) || [];
        list.push(r);
        turnMap.set(r.turn, list);
    }
    const sortedTurns = Array.from(turnMap.keys()).sort((a, b) => a - b);

    // 点击卡牌缩略图 -> 查看卡牌详情
    const handleViewCard = (cardKey: string) => {
        if (!onViewCard) return;
        const card = CARD_DB[cardKey] as CardData | undefined;
        if (card) onViewCard({ ...card, id: `record-${cardKey}` } as CardData);
    };

    return (
        <div className="fixed inset-0 z-[9999] pointer-events-auto">
            {/* 半透明遮罩 —— 点击关闭 */}
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />

            {/* 侧边面板 — 占屏幕一半宽度 */}
            <div className="absolute right-0 top-0 h-full w-1/2 max-w-[640px] bg-slate-900/95 border-l border-white/10 shadow-2xl shadow-black/50 flex flex-col">
                {/* 头部 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
                    <h2 className="text-xl font-bold text-white tracking-wider">📜 对局记录</h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all text-lg"
                    >✕</button>
                </div>

                {/* 记录列表 */}
                <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
                    {sortedTurns.length === 0 ? (
                        <div className="text-white/30 text-center py-16 text-sm tracking-wider">
                            暂无操作记录
                        </div>
                    ) : sortedTurns.map(turn => {
                        const turnRecords = turnMap.get(turn)!;
                        return (
                            <div key={turn}>
                                {/* ─── 回合分隔线 ─── */}
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="flex-1 h-px bg-white/10" />
                                    <span className="text-white/30 text-sm font-mono tracking-[0.2em]">第 {turn} 回合</span>
                                    <div className="flex-1 h-px bg-white/10" />
                                </div>

                                {/* 该回合的操作 */}
                                <div className="space-y-1">
                                    {turnRecords.map(r => (
                                        <RecordEntry
                                            key={r.id}
                                            record={r}
                                            onCardClick={handleViewCard}
                                            bindGazeEvents={bindGazeEvents}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 悬停大图检视 — Portal 越狱跟随鼠标 */}
            <FloatingCardPreview
                mode="follow"
                gazeTarget={gazeTarget}
                onMouseEnter={keepAlive}
                onMouseLeave={scheduleDismiss}
            />
        </div>
    );
};

// ==========================================
// 阵营色
// ==========================================
const OWNER_COLOR = {
    player: { ring: 'rgba(34,211,238,0.6)', text: 'text-cyan-400', label: '你' },
    enemy: { ring: 'rgba(251,146,60,0.6)', text: 'text-orange-400', label: '敌方' },
} as const;

// ==========================================
// 组装完整的 CardData（补全运行时字段 + 应用快照）
// ==========================================
const toCardData = (cardKey: string, entity?: RecordEntity): CardData | null => {
    const base = CARD_DB[cardKey] as CardData | undefined;
    if (!base) return null;
    const s = entity?.snapshot;
    return {
        ...base,
        id: `record-${cardKey}`,
        strikeCount: 0,
        animState: 'idle' as const, // [2026-07-21] 记录面板不触发死亡动画，由外部 ☠️ 蒙层指示
        // [2026-07-21] 应用快照数值，定格那一刻的真实状态
        ...(s ? {
            power: s.power,
            health: s.health,
            maxHealth: s.maxHealth,
            damageTaken: s.damageTaken,
            buffs: s.buffs,
            roundBuffs: s.roundBuffs,
        } : {
            damageTaken: 0,
            buffs: undefined,
            roundBuffs: undefined,
        }),
    } as CardData; // [2026-08-16] base 为 Omit<CardData>，合并快照后断言为完整 CardData
};

// ==========================================
// 记录面板中的手牌卡 — 直接复用 <Card> 组件
// ==========================================
const RecordCard: React.FC<{
    entity: RecordEntity;
    onClickCard: (key: string) => void;
    onViewArt: (card: CardData) => void;
    bindGazeEvents?: (card: CardData) => { onMouseEnter: (e: React.MouseEvent) => void; onMouseLeave: () => void };
}> = ({ entity, onClickCard, onViewArt, bindGazeEvents }) => {
    const fullCard = toCardData(entity.cardKey, entity);
    const color = OWNER_COLOR[entity.owner];

    // [2026-07-23] 悬停大图检视事件
    const gazeHandlers = useMemo(() => {
        if (!fullCard || !bindGazeEvents) return null;
        return bindGazeEvents(fullCard);
    }, [fullCard, bindGazeEvents]);

    if (!fullCard) {
        return (
            <div className="w-[90px] h-[140px] shrink-0 flex items-center justify-center rounded-lg bg-slate-800/80 border border-white/10">
                <span className={color.text}>?</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center gap-1.5">
            {/* 卡牌 + 阵营色边框 + 阵亡蒙层 */}
            <div
                className="relative rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-105 hover:-translate-y-1"
                style={{ boxShadow: `0 0 0 1.5px ${color.ring}, 0 4px 12px rgba(0,0,0,0.5)` }}
                onClick={() => onClickCard(entity.cardKey)}
                onMouseEnter={gazeHandlers?.onMouseEnter as React.MouseEventHandler<HTMLDivElement> | undefined}
                onMouseLeave={gazeHandlers?.onMouseLeave as React.MouseEventHandler<HTMLDivElement> | undefined}
            >
                {/* 直接复用 Card 组件，location="hand" 渲染手牌样式 */}
                <Card
                    data={fullCard}
                    location="hand"
                    isFaceUp={true}
                    skinId={0}
                    onViewArt={onViewArt}
                />

                {/* 阵亡蒙层 */}
                {entity.died && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 rounded-lg pointer-events-none">
                        <span className="text-red-400 text-3xl drop-shadow-[0_0_10px_rgba(255,0,0,0.9)]">☠️</span>
                    </div>
                )}
            </div>

            {/* 变化标签（伤害/治疗/BUFF/DEBUFF/关键词） */}
            <div className="flex items-center gap-1.5 min-h-[18px] flex-wrap justify-center">
                {entity.changes && entity.changes.length > 0 ? (
                    entity.changes.map((c, i) => {
                        switch (c.type) {
                            case 'damage':
                                return <span key={i} className="text-red-400 text-sm font-mono font-bold">❤️-{c.value}</span>;
                            case 'heal':
                                return <span key={i} className="text-green-400 text-sm font-mono font-bold">💚+{c.value}</span>;
                            case 'buff_health':
                                return <span key={i} className="text-green-400 text-sm font-mono font-bold">🌿+{c.value}</span>;
                            case 'buff_power':
                                return <span key={i} className="text-orange-400 text-sm font-mono font-bold">⚔️+{c.value}</span>;
                            case 'debuff_power':
                                return <span key={i} className="text-gray-400 text-sm font-mono font-bold">⚔️-{c.value}</span>;
                            case 'gain_keyword':
                                return <span key={i} className="text-cyan-400 text-xs font-mono font-bold">+{c.keyword}</span>;
                            default:
                                return null;
                        }
                    })
                ) : (
                    <>
                        {entity.damageTaken != null && entity.damageTaken > 0 && (
                            <span className="text-red-400 text-sm font-mono font-bold">❤️-{entity.damageTaken}</span>
                        )}
                    </>
                )}
                {entity.died && (
                    <span className="text-red-400/80 text-xs whitespace-nowrap tracking-wider font-bold">阵亡</span>
                )}
            </div>
        </div>
    );
};

// ==========================================
// 单条操作记录
// ==========================================
const RecordEntry: React.FC<{ record: GameRecord; onCardClick: (key: string) => void; bindGazeEvents: (card: CardData) => { onMouseEnter: (e: React.MouseEvent) => void; onMouseLeave: () => void } }> = ({ record, onCardClick, bindGazeEvents }) => {
    const isPlayer = record.owner === 'player';
    const dotColor = isPlayer ? 'text-cyan-400' : 'text-red-400';
    const label = isPlayer ? '你' : '敌方';

    // Card 的 onViewArt 回调，触发查看卡牌详情
    const handleViewArt = useCallback((card: CardData) => {
        if (record.entities) {
            // 从 entities 里找到对应 key 触发 onCardClick
            const entity = record.entities.find(e => e.cardKey === card.key);
            if (entity) onCardClick(entity.cardKey);
        } else if (record.cardKey) {
            onCardClick(record.cardKey);
        }
    }, [record, onCardClick]);

    // ─── 战斗宣告（进攻/格挡）— 一排手牌卡面 ───
    if (record.category === 'combat_declare' && record.entities && record.entities.length > 0) {
        return (
            <div className="flex items-start gap-2 py-2 px-3 rounded-xl hover:bg-white/5 transition-colors group">
                <span className={`${dotColor} text-sm font-mono shrink-0 mt-2`}>{label}</span>
                <span className="text-white/50 text-sm shrink-0 mt-2">
                    {record.summary === '派出进攻' ? '⚔️' : '🛡️'}
                </span>
                <div className="flex items-center gap-3 flex-wrap">
                    {record.entities!.map((entity, i) => (
                        <RecordCard
                            key={i}
                            entity={entity}
                            onClickCard={onCardClick}
                            onViewArt={handleViewArt}
                            bindGazeEvents={bindGazeEvents}
                        />
                    ))}
                </div>
                <span className="text-white/50 text-xs ml-auto mt-2 whitespace-nowrap">{record.summary}</span>
            </div>
        );
    }

    // ─── 单路战斗结算 — 攻 vs 守 ───
    if (record.category === 'combat_fight' && record.entities && record.entities.length > 0) {
        const [attacker, blocker] = record.entities;
        return (
            <div className="py-2 px-3 rounded-xl hover:bg-white/5 transition-colors group">
                <div className="flex items-center gap-3">
                    {/* ⚔️ 标识 */}
                    <span className="text-white/40 text-sm shrink-0 self-center">⚔️</span>

                    {/* 进攻方 */}
                    {attacker && (
                        <RecordCard
                            entity={attacker}
                            onClickCard={onCardClick}
                            onViewArt={handleViewArt}
                            bindGazeEvents={bindGazeEvents}
                        />
                    )}

                    {/* vs 分割 */}
                    <span className="text-white/20 text-sm shrink-0 self-center font-bold">VS</span>

                    {/* 防守方（格挡者）或直击水晶 */}
                    {blocker ? (
                        <RecordCard
                            entity={blocker}
                            onClickCard={onCardClick}
                            onViewArt={handleViewArt}
                            bindGazeEvents={bindGazeEvents}
                        />
                    ) : (
                        <div className="flex items-center gap-2 self-center">
                            <span className="text-amber-400/80 text-2xl drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]">🏰</span>
                        </div>
                    )}
                </div>

                {/* 补充细节（水晶伤害等） */}
                {record.detail && (
                    <div className="text-white/30 text-xs mt-1.5 ml-7 leading-relaxed">{record.detail}</div>
                )}
            </div>
        );
    }

    // ─── 法术效果（伤害/治疗等）— 展示目标卡面 ───
    if (record.category === 'spell_effect' && record.entities && record.entities.length > 0) {
        return (
            <div className="flex items-start gap-2 py-2 px-3 rounded-xl hover:bg-white/5 transition-colors group">
                <span className={`${dotColor} text-sm font-mono shrink-0 mt-2`}>{label}</span>
                <div className="flex items-center gap-3 flex-wrap">
                    {record.entities!.map((entity, i) => (
                        <RecordCard key={i} entity={entity} onClickCard={onCardClick} onViewArt={handleViewArt} bindGazeEvents={bindGazeEvents} />
                    ))}
                </div>
                <span className="text-white/60 text-sm ml-auto mt-2">{record.summary}</span>
            </div>
        );
    }

    // ─── 单卡记录（打出/施放等）— 带手牌样式 ───
    if (record.entities && record.entities.length === 1) {
        const entity = record.entities[0];
        return (
            <div className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-white/5 transition-colors group">
                <span className={`${dotColor} text-sm font-mono shrink-0`}>{label}</span>
                <RecordCard entity={entity} onClickCard={onCardClick} onViewArt={handleViewArt} bindGazeEvents={bindGazeEvents} />
                <span className="text-white/90 text-base font-medium flex-1">{record.summary}</span>
            </div>
        );
    }

    // ─── 默认渲染（纯文本记录） ───
    return (
        <div className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-white/5 transition-colors group">
            <span className={`${dotColor} text-sm leading-[60px] w-[44px] text-center shrink-0`}>●</span>
            <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                    <span className="text-white/40 text-sm font-mono shrink-0">{label}</span>
                    <span className="text-white/90 text-base leading-tight font-medium">
                        {record.summary}
                    </span>
                </div>
                {record.detail && (
                    <div className="text-white/25 text-sm mt-0.5 leading-relaxed">{record.detail}</div>
                )}
            </div>
        </div>
    );
};
