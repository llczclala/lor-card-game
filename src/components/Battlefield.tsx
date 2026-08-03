import React from 'react';
import { Sword } from 'lucide-react';
import type { CardData } from '../types';
import { Card } from './Card';

interface BattlefieldProps {
    combatField: {attacker: CardData, blocker: CardData | null, owner: 'player' | 'enemy',isChallenged?: boolean,isGhostBlocked?: boolean}[];


    selectedBlockerId: string | null;
    onCombatClick: (fightIndex: number) => void;
    phase: string;
    turnOwner: 'player' | 'enemy';
    onCardClick: (card: CardData, location: string, owner: string) => void;
    onViewArt: (card: CardData) => void;
    speakingCardId: string | null;
    // [新增] 挑战者相关属性
    selectedChallengerId: string | null;
    onChallengerClick: (cardId: string) => void;
        // [新增] 接收卡背图片路径
    cardBackUrl?: string;
    // [新增] 战场卡牌拖拽入口 — 用于战场→备战席反向拖拽
    onCombatPointerDown?: (e: React.PointerEvent, card: CardData, index: number, role: 'attacker' | 'blocker') => void;

    // [新增] 预瞄系统雷达数据
    dragPreviewSlots?: number[];
    previewAttackerCount?: number;

    // [新增] 战场悬停预览
    cardGazeEvents?: (card: CardData) => { onMouseEnter: () => void; onMouseLeave: () => void; };
    skinOverrides?: Record<string, number>;

}

export const Battlefield: React.FC<BattlefieldProps> = ({
    combatField, selectedBlockerId, onCombatClick, onCardClick, onViewArt,
    speakingCardId,
    // [新增] 解构
    selectedChallengerId, onChallengerClick,
        // [新增] 解构
    cardBackUrl,
    onCombatPointerDown, // [新增] 战场拖拽
    dragPreviewSlots,
    previewAttackerCount,
    // [新增] 战场悬停预览
    cardGazeEvents,
    skinOverrides = {}
}) => {
    return (
        // [微调点 1：全局居中对齐] 将 items-end 改为 items-center，将 pb-[80px] 改为 pb-0，让整个战场区域在画面中绝对垂直居中。
        <div className="flex-1 w-full max-w-[1080px] mx-auto h-full flex justify-center items-center gap-2 relative bg-transparent pb-0">

            {(() => {
                // [新增] 将预示进攻的额外槽位算入总宽度
                const totalSlots = combatField.length + (previewAttackerCount || 0);
                const columnsCount = Math.max(3, totalSlots);
                const dynamicWidth = `calc(${100 / columnsCount}% - 8px)`;

                return (
                    <>
                        {combatField.map((fight, i) => (
                            <div key={i} className="flex flex-col justify-between items-center h-full pt-40 pb-28 group relative transition-all duration-500 ease-out" style={{ width: dynamicWidth }}>

                                {/* 敌方槽位 */}
                            <div
                                className="w-full h-[162px] border-2 border-dashed border-white/10 rounded-xl flex justify-center items-center bg-transparent transition-colors hover:bg-red-500/10 cursor-pointer"
                                onClick={() => onCombatClick(i)}
                                data-drop-zone="enemy"
                                data-combat-index={i}
                            >
                         {fight.owner === 'enemy' ?
                            <div className="contents" {...cardGazeEvents?.(fight.attacker) ?? {}}>
                            <Card
                                data={fight.attacker}
                                location="combat"
                                skinId={skinOverrides[fight.attacker.key] || 0} // [核心修复] f 改为 fight
                                isEnemyCombatant={true}
                                isSelected={selectedBlockerId !== null}
                                attackType={fight.blocker ? 'clash' : 'direct'}
                                onViewArt={onViewArt}
                                isSpeaking={fight.attacker.id === speakingCardId}
                                // [新增] 为敌方攻击者绑定点击事件与挑战者事件，确保沙盒中"扮演敌方"时能够正常操作！
                                onClick={() => onCardClick(fight.attacker, 'combat', 'enemy')}
                                onChallengerClick={!fight.blocker ? () => onChallengerClick(fight.attacker.id) : undefined}
                                isChallengerActive={fight.attacker.id === selectedChallengerId}
                            />
                            </div> :
                         fight.blocker ?
                            <div className="contents" {...cardGazeEvents?.(fight.blocker) ?? {}}>
                            <Card
                                data={fight.blocker}
                                location="combat"
                                skinId={skinOverrides[fight.blocker.key] || 0} // [核心修复] f 改为 fight，并且取 blocker 的 key
                                isBlocker
                                isEnemyCombatant={true}
                                onClick={() => onCardClick(fight.blocker!, 'combat', fight.owner === 'player' ? 'enemy' : 'player')}
                                onViewArt={onViewArt}
                                isSpeaking={fight.blocker.id === speakingCardId}
                                isFacingQuickAttack={fight.attacker.keywords.includes('QuickAttack')}
                                // [新增] 补全：告诉这张卡"你被挑战了"，它才会显示橙色特效
                                isChallengedTarget={fight.isChallenged}
                                cardBackUrl={cardBackUrl}
                            />
                            </div> :
                         null}
                    </div>

                    {/* 我方槽位 - [修改] 宽度改为 w-full 填满弹性容器，高度统一为 162px */}
                    <div
                        // [新增] 格挡预瞄系统：如果该槽位在 dragPreviewSlots 中，亮起剧烈的蓝色脉冲底座！
                        className={`w-full h-[162px] border-2 rounded-xl flex justify-center items-center transition-colors ${
                            dragPreviewSlots?.includes(i)
                                // [表现力提升] 换用极高亮的 cyan-400，背景浓度提升至 30%，外发光半径翻倍至 30px，不透明度提升至 0.8
                                ? 'border-cyan-400 bg-cyan-500/30 shadow-[0_0_30px_rgba(34,211,238,0.8)] animate-pulse'
                                : 'border-dashed border-white/10 bg-transparent hover:bg-cyan-500/20'
                        }`}
                        data-drop-zone="player"
                        data-combat-index={i}
                    >
                         {fight.owner === 'player' ?
                            <div className="contents" {...cardGazeEvents?.(fight.attacker) ?? {}}>
                            <Card
                                data={fight.attacker}
                                location="combat"
                                skinId={skinOverrides[fight.attacker.key] || 0} // [补全缺漏] 为我方攻击者穿上皮肤
                                attackType={fight.blocker ? 'clash' : 'direct'}
                                onClick={() => onCardClick(fight.attacker, 'combat', 'player')}
                                // ...略过中间 props
                                cardBackUrl={cardBackUrl}
                                onViewArt={onViewArt}
                                isSpeaking={fight.attacker.id === speakingCardId} // [修正] 拼写错误
                                // [新增] 如果已有阻挡者，不再传递点击回调 -> 从而隐藏挑战者图标
                                onChallengerClick={!fight.blocker ? () => onChallengerClick(fight.attacker.id) : undefined}
                                isChallengerActive={fight.attacker.id === selectedChallengerId}
                                onPointerDown={onCombatPointerDown ? (e) => onCombatPointerDown(e, fight.attacker, i, 'attacker') : undefined}
                            />
                            </div> :
                         fight.blocker ?
                            <div className="contents" {...cardGazeEvents?.(fight.blocker) ?? {}}>
                            <Card
                                data={fight.blocker}
                                location="combat"
                                skinId={skinOverrides[fight.blocker.key] || 0} // [补全缺漏] 为敌方阻挡者穿上皮肤
                                isBlocker
                                // [关键修复] 补回丢失的 isEnemyCombatant={true}，确保敌方阻挡者向下攻击
                                onClick={() => onCardClick(fight.blocker!, 'combat', fight.owner === 'player' ? 'enemy' : 'player')}
                                onViewArt={onViewArt}
                                isSpeaking={fight.blocker.id === speakingCardId}
                                cardBackUrl={cardBackUrl}
                                isFacingQuickAttack={fight.attacker.keywords.includes('QuickAttack')}
                                isChallengedTarget={fight.isChallenged}
                                onPointerDown={onCombatPointerDown ? (e) => onCombatPointerDown(e, fight.blocker!, i, 'blocker') : undefined}
                            />
                            </div> :
                         fight.isGhostBlocked ? // [核心修复] 如果是空气墙，渲染半透明的灵体护盾占位！
                            <div className="w-[120px] h-[162px] border-2 border-blue-400/50 bg-blue-400/20 rounded-md flex items-center justify-center backdrop-blur-sm animate-pulse shadow-[0_0_15px_rgba(96,165,250,0.5)]">
                                <span className="text-blue-200 font-bold tracking-widest text-sm drop-shadow-md">灵体阻挡</span>
                            </div> :
                         null}
                    </div>
                </div>
            ))}

            {/* [新增] 进攻预瞄系统：当我方向上拖拽时，战区凭空生成闪烁的蓝色进攻全息槽位 */}
                        {Array.from({ length: previewAttackerCount || 0 }).map((_, extraIdx) => (
                            <div key={`preview-atk-${extraIdx}`} className="flex flex-col justify-between items-center h-full pt-40 pb-28 group relative transition-all duration-500 ease-out" style={{ width: dynamicWidth }}>
                                <div className="w-full h-[162px] border-2 border-dashed border-white/10 rounded-xl"></div>
                                <div className="my-auto relative z-0"><Sword size={20} className="text-red-500/50 opacity-50" /></div>
                                {/* [表现力提升] 与格挡槽位保持统一的青蓝霓虹级高光 */}
                                <div className="w-full h-[162px] border-2 border-cyan-400 bg-cyan-500/30 shadow-[0_0_30px_rgba(34,211,238,0.8)] rounded-xl flex justify-center items-center animate-pulse"></div>
                            </div>
                        ))}
                    </>
                );
            })()}

            {combatField.length === 0 && !previewAttackerCount && (
                <div className="text-white/5 text-5xl font-black tracking-[0.5em] select-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                    BATTLEFIELD
                </div>
            )}
        </div>
    );
};