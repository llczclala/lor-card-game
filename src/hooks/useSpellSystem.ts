import { useState } from 'react';
import type { CardData } from '../types';
import { EFFECT_DB } from '../data/effectRegistry';
import type { TargetType } from '../data/effectRegistry';
// [新增] 引入事件总线
import { eventBus, GameEvents } from '../utils/eventBus';

interface SpellSystemProps {
    onComplete: (card: CardData, targets: any[]) => void; // 施法完成的回调
}

export const useSpellSystem = ({ onComplete }: SpellSystemProps) => {
    // 正在施放的卡牌
    const [castingCard, setCastingCard] = useState<CardData | null>(null);
    // 当前处于第几步 (从 0 开始)
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    // 已选定的目标列表
    const [selectedTargets, setSelectedTargets] = useState<any[]>([]);

    // 辅助：获取当前卡牌的效果定义
    const getEffectDef = (card: CardData) => {
        if (!card.effects || card.effects.length === 0) return null;
        return EFFECT_DB[card.effects[0]];
    };

    // --- 1. 开始施法 ---
    const startCasting = (card: CardData) => {
        const effect = getEffectDef(card);
        if (!effect) return;

        // 如果没有目标需求，直接完成 (自动施法)
        if (effect.targetRequirements.length === 0) {
            onComplete(card, []);
        } else {
            // 进入选择模式
            setCastingCard(card);
            setCurrentStepIndex(0);
            setSelectedTargets([]);
        }
    };

    // --- 2. 取消施法 ---
    const cancelCasting = () => {
        setCastingCard(null);
        setCurrentStepIndex(0);
        setSelectedTargets([]);
    };

    // --- 3. 核心：验证目标是否合法 ---
    // 这是一个纯逻辑判断，用于决定点击是否有效，以及是否显示高亮框
    const isValidTarget = (
        card: CardData | 'nexus',
        owner: 'player' | 'enemy',
        reqType: TargetType,
        filterKey?: string
    ): boolean => {
        if (card === 'nexus') {
            return (reqType === 'PLAYER_NEXUS' && owner === 'player') ||
                   (reqType === 'ENEMY_NEXUS' && owner === 'enemy') ||
                   reqType === 'ANY_TARGET';
        }

        const isAlly = owner === 'player';
        const isEnemy = owner === 'enemy';

        // 基础存活检查 (尸体不能作为目标)
        if (card.health <= 0) return false;

        switch (reqType) {
            case 'ALLY_UNIT': return isAlly;
            case 'ENEMY_UNIT': return isEnemy;
            case 'ANY_UNIT': return true;
            case 'ANY_TARGET': return true; // 单位也是 Target
            case 'ALLY_CHAMPION': return isAlly && card.isChampion && (!filterKey || card.key === filterKey);
            default: return false;
        }
    };

    // --- 4. 处理点击交互 ---
    const handleTargetClick = (target: CardData | 'nexus', owner: 'player' | 'enemy') => {
        if (!castingCard) return;

        const effect = getEffectDef(castingCard);
        if (!effect) return;

        // 获取当前步骤的需求
        const requirement = effect.targetRequirements[currentStepIndex];
        if (!requirement) return;

        // 验证合法性
        if (isValidTarget(target, owner, requirement.type, requirement.filterKey)) {
            // [新增] 目标合法，成功锁定！播放清脆的确认音
            eventBus.emit(GameEvents.SFX_SELECT_UNIT);

            // 构建目标数据结构 (标准化)
            const targetObj = target === 'nexus'
                ? { type: owner === 'player' ? 'player_nexus' : 'enemy_nexus' }
                : { type: owner === 'player' ? 'ally' : 'enemy', id: target.id };

            const newTargets = [...selectedTargets, targetObj];

            // 检查是否选完了
            if (currentStepIndex + 1 >= effect.targetRequirements.length) {
                // 全部完成 -> 触发回调并重置
                onComplete(castingCard, newTargets);
                cancelCasting();
            } else {
                // 还没完 -> 存入并进下一步
                setSelectedTargets(newTargets);
                setCurrentStepIndex(prev => prev + 1);
            }
        } else {
            // 点了不合法的目标 -> 可选：播放错误音效或提示
            console.log("Invalid target");
        }
    };

    // --- 5. 导出状态供 UI 使用 ---
    const currentRequirement = castingCard ? getEffectDef(castingCard)?.targetRequirements[currentStepIndex] : null;

    return {
        isCasting: !!castingCard,
        activeCard: castingCard, // 当前正在施放的卡

        selectedTargets,

        // 当前步骤的提示文字 (用于 GameAnnouncement)
        instruction: currentRequirement?.label,

        // 已选中的 ID 列表 (用于 Card 闪烁)
        selectedIds: selectedTargets.map(t => t.id).filter(Boolean),

        // 核心辅助函数：判断某张卡在当前步骤是否可选 (用于显示蓝/红描边)
        checkIsTargetable: (card: CardData | 'nexus', owner: 'player' | 'enemy') => {
            if (!currentRequirement) return false;
            return isValidTarget(card, owner, currentRequirement.type, currentRequirement.filterKey);
        },

        startCasting,
        cancelCasting,
        handleTargetClick
    };
};