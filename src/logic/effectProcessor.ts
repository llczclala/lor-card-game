import type { CardData, GameState } from '../types';
// [关键修复] 将值导入和类型导入分开
import { EFFECT_DB } from '../data/effectRegistry';
import type { EffectDefinition, TargetType } from '../data/effectRegistry';
import { createCard } from '../data/cards';

/**
 * 上下文接口：描述执行法术时所需的全部游戏状态
 */
export interface EffectContext {
    game: GameState;
    playerBench: CardData[];
    enemyBench: CardData[];
    playerHand: CardData[];
    enemyHand: CardData[];
    owner: 'player' | 'enemy'; // 施法者是谁
}

/**
 * 结果接口：描述法术执行后产生的状态变更
 */
export interface EffectResult {
    game: GameState;
    playerBench: CardData[];
    enemyBench: CardData[];
    playerHand: CardData[];
    enemyHand: CardData[];
    events: { type: string, payload?: any }[]; // 需要触发的副作用事件 (如特效、音效)
}

/**
 * 辅助函数：根据 ID 在列表中查找并更新卡牌
 */
const updateCardInList = (list: CardData[], targetId: string, updater: (c: CardData) => CardData): CardData[] => {
    return list.map(c => c.id === targetId ? updater(c) : c);
};

/**
 * 目标验证器 (Validator)
 * 检查选定的目标是否符合 Effect 定义的要求
 */
export const validateTargets = (effectId: string, targets: any[]): boolean => {
    const effect = EFFECT_DB[effectId];
    if (!effect) return false;

    // 计算需要手动选择的目标总数
    // 排除掉 'ALL' (全体), 'SELF' (自身), 'NEXUS' (水晶) 等自动目标
    const requiredCount = effect.targetRequirements.reduce((sum, req) => {
        if (req.count === 'ALL') return sum;
        if (['SELF', 'PLAYER_NEXUS', 'ENEMY_NEXUS', 'PLAYER_DECK', 'ENEMY_DECK'].includes(req.type)) return sum;
        return sum + req.count;
    }, 0);

    // 如果不需要目标，targets 应该为空 (或忽略)
    if (requiredCount === 0) return true;

    // 检查数量是否匹配
    if (targets.length !== requiredCount) return false;

    return true;
};

/**
 * 核心处理函数 (The Engine)
 */
export const processEffect = (
    effectId: string,
    targets: any[],
    context: EffectContext
): EffectResult => {
    const effect = EFFECT_DB[effectId];

    // 1. 初始化结果副本
    let nextGame = { ...context.game };
    let nextPlayerBench = [...context.playerBench];
    let nextEnemyBench = [...context.enemyBench];
    let nextPlayerHand = [...context.playerHand];
    let nextEnemyHand = [...context.enemyHand];
    const events: { type: string, payload?: any }[] = [];

    if (!effect) {
        console.warn(`[EffectProcessor] Effect [${effectId}] not found in registry.`);
        return { game: nextGame, playerBench: nextPlayerBench, enemyBench: nextEnemyBench, playerHand: nextPlayerHand, enemyHand: nextEnemyHand, events };
    }

    // [新增] 智能目标填充 (Implicit Target Handling)
    // 如果没有传入目标，但法术配置了自动目标 (如 NEXUS/SELF)，则自动构建目标对象
    const finalTargets = [...targets];
    if (finalTargets.length === 0 && effect.targetRequirements.length > 0) {
        effect.targetRequirements.forEach(req => {
            // 自动填充敌方水晶
            if (req.type === 'ENEMY_NEXUS') {
                finalTargets.push({ type: context.owner === 'player' ? 'enemy_nexus' : 'player_nexus' });
            }
            // 自动填充我方水晶
            else if (req.type === 'PLAYER_NEXUS') {
                finalTargets.push({ type: context.owner === 'player' ? 'player_nexus' : 'enemy_nexus' });
            }
            // SELF 目标
            else if (req.type === 'SELF') {
                // 寻找持有该效果的卡牌 ID (需要在 context 中传递 sourceId，这里暂时略过或由调用方处理)
            }
        });
    }

    // --- 根据效能类型 (Class) 分发逻辑 ---

    switch (effect.class) {
        case 'STRIKE': {
            // 法术打击逻辑

            // A. 直接数值打击 (如: 暗箭, 破坏, 秘术射击)
            if (effect.params.value) {
                const target = finalTargets[0];
                if (!target) break;

                const dmg = effect.params.value;
                const isHittingEnemyNexus = (context.owner === 'player' && target.type === 'enemy_nexus') ||
                                          (context.owner === 'enemy' && target.type === 'player_nexus');
                const isHittingPlayerNexus = (context.owner === 'player' && target.type === 'player_nexus') ||
                                           (context.owner === 'enemy' && target.type === 'enemy_nexus');

                if (isHittingEnemyNexus) {
                    nextGame.enemyNexus -= dmg;
                    events.push({ type: 'nexus_damage', payload: { target: 'enemy', amount: dmg } });
                } else if (isHittingPlayerNexus) {
                    nextGame.playerNexus -= dmg;
                    events.push({ type: 'nexus_damage', payload: { target: 'player', amount: dmg } });
                } else if (target.id) {
                    // 打击单位 (ANY_TARGET)
                    const applyDmg = (c: CardData) => {
                        const newHealth = c.health - dmg;
                        if (dmg > 0) events.push({ type: 'unit_damage', payload: { id: c.id, amount: dmg } });
                        return { ...c, health: newHealth, damageTaken: (c.damageTaken||0) + dmg, animState: 'hit' as const };
                    };
                    nextPlayerBench = updateCardInList(nextPlayerBench, target.id, applyDmg);
                    nextEnemyBench = updateCardInList(nextEnemyBench, target.id, applyDmg);
                }
            }
            // B. 单位相互打击 (如: 单挑)
            else {
                const attackerId = finalTargets.find(t => t.type?.includes('ally'))?.id;
                const defenderId = finalTargets.find(t => t.type?.includes('enemy'))?.id;

                const findUnit = (id: string) =>
                    nextPlayerBench.find(c => c.id === id) || nextEnemyBench.find(c => c.id === id);

                if (attackerId && defenderId) {
                    const attacker = findUnit(attackerId);
                    const defender = findUnit(defenderId);

                    if (attacker && defender) {
                        const damageToDef = attacker.power;
                        const damageToAtk = defender.power;

                        const applyDamage = (c: CardData, dmg: number) => {
                            const newHealth = c.health - dmg;
                            const newDamageTaken = (c.damageTaken || 0) + dmg;
                            if (dmg > 0) events.push({ type: 'unit_damage', payload: { id: c.id, amount: dmg } });
                            return { ...c, health: newHealth, damageTaken: newDamageTaken, animState: 'hit' as const };
                        };

                        nextPlayerBench = updateCardInList(nextPlayerBench, attackerId, c => applyDamage(c, damageToAtk));
                        nextEnemyBench = updateCardInList(nextEnemyBench, attackerId, c => applyDamage(c, damageToAtk));

                        nextPlayerBench = updateCardInList(nextPlayerBench, defenderId, c => applyDamage(c, damageToDef));
                        nextEnemyBench = updateCardInList(nextEnemyBench, defenderId, c => applyDamage(c, damageToDef));

                        events.push({ type: 'sfx_strike', payload: null });
                    }
                }
            }
            break;
        }

        // [新增] 处理备战效果 (Rally)
        case 'RALLY': {
            // [修正] 核心逻辑：赋予施法者独立的备战标识 (Rally Token)
            // 使用对象展开，确保不影响对手的 Token 状态
            nextGame.attackToken = {
                ...nextGame.attackToken,
                [context.owner]: 'rally' // 将自己的状态设为 'rally' (蓝色)
            };

            // 触发特殊事件，供 UI 层显示蓝色宝剑特效
            events.push({ type: 'gain_token_rally', payload: { owner: context.owner } });
            break;
        }

        case 'SUMMON': {
            const cardKey = effect.params.relatedCardKey;
            if (cardKey) {
                const newCard = createCard(cardKey, context.owner);
                if (context.owner === 'player') {
                    if (nextPlayerBench.length < 6) nextPlayerBench.push(newCard);
                } else {
                    if (nextEnemyBench.length < 6) nextEnemyBench.push(newCard);
                }
                events.push({ type: 'summon', payload: newCard });
            }
            break;
        }

        default:
            console.warn(`[EffectProcessor] Unknown effect class: ${effect.class}`);
    }

    return {
        game: nextGame,
        playerBench: nextPlayerBench,
        enemyBench: nextEnemyBench,
        playerHand: nextPlayerHand,
        enemyHand: nextEnemyHand,
        events
    };
};