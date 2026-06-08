import React from 'react';
import { Sword } from 'lucide-react';
import type { CardData } from '../types';
import { Card } from './Card';

interface BattlefieldProps {
    combatField: {attacker: CardData, blocker: CardData | null, owner: 'player' | 'enemy',isChallenged?: boolean}[];


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
}

export const Battlefield: React.FC<BattlefieldProps> = ({
    combatField, selectedBlockerId, onCombatClick, onCardClick, onViewArt,
    speakingCardId,
    // [新增] 解构
    selectedChallengerId, onChallengerClick,
        // [新增] 解构
    cardBackUrl
}) => {
    return (
        // [微调点 1：全局居中对齐] 将 items-end 改为 items-center，将 pb-[80px] 改为 pb-0，让整个战场区域在画面中绝对垂直居中。
        <div className="flex-1 w-full max-w-[1080px] mx-auto h-full flex justify-center items-center gap-2 relative bg-transparent pb-0">

            {combatField.map((fight, i) => {
                // [新增] 弹性宽度算法核心：最少按 3 列划分，超过 3 列则按实际列数平分
                const columnsCount = Math.max(3, combatField.length);
                const dynamicWidth = `calc(${100 / columnsCount}% - 8px)`;

                return (
                // [微调点 2：上下两张卡的间距] 将 gap-12 增大。例如改为 gap-20, gap-24 或 gap-32。数值越大，上下两张卡就离得越远（越靠近各自的备战席）。
                <div key={i} className="flex flex-col justify-between items-center h-full pt-40 pb-28 group relative transition-all duration-500 ease-out" style={{ width: dynamicWidth }}>

                    {/* 敌方槽位 - [修改] 宽度改为 w-full 填满弹性容器，高度统一为备战席的 162px */}
                    <div
                        className="w-full h-[162px] border-2 border-dashed border-white/10 rounded-xl flex justify-center items-center bg-transparent transition-colors hover:bg-red-500/10 cursor-pointer"
                        onClick={() => onCombatClick(i)}
                    >
                         {fight.owner === 'enemy' ?
                            <Card
                                data={fight.attacker}
                                location="combat"
                                isEnemyCombatant={true}
                                isSelected={selectedBlockerId !== null}
                                attackType={fight.blocker ? 'clash' : 'direct'}
                                onViewArt={onViewArt}
                                isSpeaking={fight.attacker.id === speakingCardId}
                                // [新增] 为敌方攻击者绑定点击事件与挑战者事件，确保沙盒中"扮演敌方"时能够正常操作！
                                onClick={() => onCardClick(fight.attacker, 'combat', 'enemy')}
                                onChallengerClick={!fight.blocker ? () => onChallengerClick(fight.attacker.id) : undefined}
                                isChallengerActive={fight.attacker.id === selectedChallengerId}
                            /> :
                         fight.blocker ?
                            <Card
                                data={fight.blocker}
                                location="combat"
                                isBlocker
                                isEnemyCombatant={true}
                                onClick={() => onCardClick(fight.blocker!, 'combat', fight.owner === 'player' ? 'enemy' : 'player')}
                                onViewArt={onViewArt}
                                isSpeaking={fight.blocker.id === speakingCardId}
                                isFacingQuickAttack={fight.attacker.keywords.includes('QuickAttack')}
                                // [新增] 补全：告诉这张卡“你被挑战了”，它才会显示橙色特效
                                isChallengedTarget={fight.isChallenged}
                                cardBackUrl={cardBackUrl}
                            /> :
                         <span className="text-xs text-gray-500 font-mono">未阻挡</span>}
                    </div>

                    {/* 战斗标识 */}
                    <div className="my-auto relative z-0">
                        <Sword size={20} className="text-red-500/50" />
                    </div>

                    {/* 我方槽位 - [修改] 宽度改为 w-full 填满弹性容器，高度统一为 162px */}
                    <div className="w-full h-[162px] border-2 border-dashed border-white/10 rounded-xl flex justify-center items-center bg-transparent transition-colors hover:bg-blue-500/10">
                         {fight.owner === 'player' ?
                            <Card
                                data={fight.attacker}
                                location="combat"
                                attackType={fight.blocker ? 'clash' : 'direct'}
                                onClick={() => onCardClick(fight.attacker, 'combat', 'player')}
                                cardBackUrl={cardBackUrl}
                                onViewArt={onViewArt}
                                isSpeaking={fight.attacker.id === speakingCardId} // [修正] 拼写错误
                                // [新增] 如果已有阻挡者，不再传递点击回调 -> 从而隐藏挑战者图标
                                onChallengerClick={!fight.blocker ? () => onChallengerClick(fight.attacker.id) : undefined}
                                isChallengerActive={fight.attacker.id === selectedChallengerId}
                            /> :
                         fight.blocker ?
                            <Card
                                data={fight.blocker}
                                location="combat"
                                isBlocker
                                // [关键修复] 补回丢失的 isEnemyCombatant={true}，确保敌方阻挡者向下攻击
                                onClick={() => onCardClick(fight.blocker!, 'combat', fight.owner === 'player' ? 'enemy' : 'player')}
                                onViewArt={onViewArt}
                                isSpeaking={fight.blocker.id === speakingCardId}
                                cardBackUrl={cardBackUrl}
                                isFacingQuickAttack={fight.attacker.keywords.includes('QuickAttack')}
                                isChallengedTarget={fight.isChallenged}
                            /> :
                         fight.isGhostBlocked ? // [核心修复] 如果是空气墙，渲染半透明的灵体护盾占位！
                            <div className="w-[120px] h-[162px] border-2 border-blue-400/50 bg-blue-400/20 rounded-md flex items-center justify-center backdrop-blur-sm animate-pulse shadow-[0_0_15px_rgba(96,165,250,0.5)]">
                                <span className="text-blue-200 font-bold tracking-widest text-sm drop-shadow-md">灵体阻挡</span>
                            </div> :
                         <span className="text-xs text-red-500/50 font-bold animate-pulse">直接打击</span>}
                    </div>
                </div>
                );
            })}

            {combatField.length === 0 && (
                <div className="text-white/5 text-5xl font-black tracking-[0.5em] select-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                    BATTLEFIELD
                </div>
            )}
        </div>
    );
};