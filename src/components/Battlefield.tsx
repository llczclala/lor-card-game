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
        <div className="flex-1 w-full h-full flex justify-center items-end gap-1 relative bg-transparent pb-[80px]">
            {/* 这里的 Sword 只需要在这里导入... */}

            {combatField.map((fight, i) => (
                <div key={i} className="flex flex-col gap-12 items-center group relative">
                    {/* 敌方槽位 - 适配横向卡牌 (w-64 h-40) */}
                    <div
                        className="w-[180px] h-[230px] border-2 border-dashed border-white/10 rounded-xl flex justify-center items-center bg-transparent transition-colors hover:bg-red-500/10 cursor-pointer"
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
                                isSpeaking={fight.attacker.id === speakingCardId} // <--- 新增
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

                    {/* 我方槽位 - 适配横向卡牌 (w-64 h-40) */}
                    <div className="w-[180px] h-[230px] border-2 border-dashed border-white/10 rounded-xl flex justify-center items-center bg-transparent transition-colors hover:bg-blue-500/10">
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
                         <span className="text-xs text-red-500/50 font-bold animate-pulse">直接打击</span>}
                    </div>
                </div>
            ))}

            {combatField.length === 0 && (
                <div className="text-white/5 text-5xl font-black tracking-[0.5em] select-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                    BATTLEFIELD
                </div>
            )}
        </div>
    );
};