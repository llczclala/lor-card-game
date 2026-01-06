import type { CardData } from '../types';

/**
 * 战斗交互结果接口
 * 描述一次攻击/格挡中产生的数值变化
 */
export interface CombatInteractionResult {
    attackerDamage: number;
    blockerDamage: number;
    nexusDamage: number;
    // [新增] 标记是否消耗了屏障
    attackerBarrierPopped: boolean;
    blockerBarrierPopped: boolean;
}

/**
 * 处理回合开始时的关键词效果 (如 Regeneration)
 * @param cards 备战席上的卡牌数组
 * @returns 更新后的卡牌数组
 */
export const applyRoundStartKeywords = (cards: CardData[]): CardData[] => {
    return cards.map(card => {
        // --- 1. Regeneration (再生) ---
        // 效果：回合开始回复满血
        if (card.keywords.includes('Regeneration')) {
            // [逻辑优化] 只有当确实受过伤（当前血量 < 最大血量）时，才触发回复特效
            const needsHeal = card.health < card.maxHealth;

            if (needsHeal) {
                return {
                    ...card,
                    health: card.maxHealth,
                    damageTaken: 0,
                    // [新增] 标记为再生状态，触发前端特效
                    animState: 'regenerating'
                };
            }
        }

        // 未来可以在这里添加其他回合开始触发的关键词 (如 Volatile)
        // 记得重置其他卡牌的 animState 为 idle，防止状态残留
        return { ...card, animState: 'idle' };
    });
};

/**
 * 计算单次战斗的伤害交换结果
 * 处理 QuickAttack, Overwhelm 等战斗核心逻辑
 * @param attacker 进攻者
 * @param blocker 阻挡者 (可能为 null)
 */
export const calculateCombatInteraction = (
    attacker: CardData,
    blocker: CardData | null
): CombatInteractionResult => {
    let attackerDamage = 0;
    let blockerDamage = 0;
    let nexusDamage = 0;
    // [新增] 初始化屏障破碎标记
    let attackerBarrierPopped = false;
    let blockerBarrierPopped = false;

    if (!blocker) {
        // --- 情况 A: 直接攻击 (Direct Attack) ---
        // 伤害全部打在水晶上
        nexusDamage = attacker.power;
    } else {
        // --- 情况 B: 单位对抗 (Clash) ---

        // 基础伤害计算
        let damageToBlocker = attacker.power;

        // --- 1. Overwhelm (贯通/碾压) ---
        // 效果：超出阻挡者生命值的伤害打击水晶
        if (attacker.keywords.includes('Overwhelm')) {
            // 计算溢出伤害
            const overflow = Math.max(0, attacker.power - blocker.health);
            if (overflow > 0) {
                nexusDamage = overflow;
            }
            // 注意：在大多数 TCG (如 LoR) 中，即使有贯通，阻挡者依然承受全额攻击力伤害
            damageToBlocker = attacker.power;
        }

        // 记录阻挡者受到的最终伤害
        blockerDamage = damageToBlocker;

        // --- 2. QuickAttack (先攻) ---
        // 效果：若攻击者有先攻且能击杀阻挡者，则不受反击伤害
        const hasQuickAttack = attacker.keywords.includes('QuickAttack');
        // 预测阻挡者是否会在这次打击中死亡
        const willBlockerDie = blocker.health <= damageToBlocker;

        if (hasQuickAttack && willBlockerDie) {
            // 先攻生效且击杀：无损
            attackerDamage = 0;
        } else {
            // 正常反击：承受阻挡者的攻击力
            attackerDamage = blocker.power;
        }

        // --- 3. Barrier (屏障) ---
        // 效果：抵挡一次伤害，生效后移除
        if (attacker.keywords.includes('Barrier') && attackerDamage > 0) {
            attackerDamage = 0;
            attackerBarrierPopped = true;
        }
        if (blocker && blocker.keywords.includes('Barrier') && blockerDamage > 0) {
            blockerDamage = 0;
            blockerBarrierPopped = true;
        }
    }

    return { attackerDamage, blockerDamage, nexusDamage, attackerBarrierPopped, blockerBarrierPopped };
};