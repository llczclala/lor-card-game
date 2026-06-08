import type { CardData } from '../types';
import { EFFECT_DB } from '../data/effectRegistry'; // [新增] 引入效果字典以读取前置条件

export const canAffordCard = (card: CardData, mana: number, spellMana: number): boolean => {
  // [修正] 防御性检查：防止因"幽灵卡牌"（数据缺失）导致的崩溃
  if (!card || !card.type) {
      return false;
  }

  if (card.type.includes('unit')) {
    return mana >= card.cost;
  } else {
    return (mana + spellMana) >= card.cost;
  }
};

export const calculateNewMana = (
    cost: number,
    currentMana: number,
    currentSpellMana: number,
    isUnit: boolean
) => {
    let newMana = currentMana;
    let newSpellMana = currentSpellMana;

    if (isUnit) {
        newMana -= cost;
    } else {
        const spellManaUsed = Math.min(cost, newSpellMana);
        newSpellMana -= spellManaUsed;
        const remainingCost = cost - spellManaUsed;
        newMana -= remainingCost;
    }

    return { newMana, newSpellMana };
};

export const checkCardLevelUp = (card: CardData, playerNexusHealth: number, enemyNexusHealth: number): boolean => {
    if (card.level >= 2 || !card.isChampion) return false;

    if (card.key === 'lyfe' && card.strikeCount >= 2) return true;

    // 芬妮升级：敌方水晶血量 <= 10 (这里简化为任意水晶)
    if (card.key === 'fenny') {
        if (playerNexusHealth <= 10 || enemyNexusHealth <= 10) return true;
    }
    // [修改] 卜卜的升级条件：场上目睹攻击敌方水晶 3 次
    if (card.key === 'pupu_specular_soul' && (card.customProgress || 0) >= 3) return true;
//     if (card.key === 'pupu_specular_soul' && card.strikeCount >= 2) return true;

    return false;
};

// [新增] 获取卡牌通用银价格
export const getCardPrice = (cost: number): number => {
    if (cost >= 0 && cost <= 2) return 400;
    if (cost >= 3 && cost <= 5) return 800;
    if (cost >= 6 && cost <= 8) return 1200;
    return 2400; // 9+ 费
};

export const getLeveledUpCard = (card: CardData): CardData => {
    if (card.key === 'lyfe') {
        return {
            ...card,
            level: 2,
            power: card.power + 1, // 假设升级+1/+1
            health: card.health + 1,
            maxHealth: card.maxHealth + 1,
            level2ImageUrl: card.level2ImageUrl,
            description: '回合开始时：进行备战。',
            // [新增] 动态添加被动技能
            effects: ['effect_lyfe_rally_passive']
        } as CardData;
    }

    // 芬妮升级特性：永久获得 +3/+0
    if (card.key === 'fenny') {
        return {
            ...card,
            level: 2,
            power: card.power + 1,
            health: card.health +1,
            maxHealth: card.maxHealth +1,
            level2ImageUrl: card.level2ImageUrl,
            description: '进攻：首次进攻时，永久赋予自己 +5/+0。',
            effects: ['effect_fenny_attack_lv2'] // 假设有顺劈效果
        } as CardData;
    }

    if (card.key === 'pupu_specular_soul') {
        return {
            ...card,
            level: 2,
            power: card.power + 1, // 假设升级+1/+1
            health: card.health + 1,
            maxHealth: card.maxHealth + 1,
            level2ImageUrl: card.level2ImageUrl,
            description: '进攻时：召唤一个进攻状态的 “镜爻 卜卜” ',
            effects: ['effect_pupu_level2_attack']
        } as CardData;
    }

    return card;
};

// --- 以下为新增代码 ---

// [新增] 命运抉择选项的通用安检机制
export const evaluateChoiceCondition = (
    choiceCardData: CardData,
    playerMana: number,
    playerSpellMana: number,
    isHeroLeveled: boolean = false
): { canPlay: boolean; lockedMessage: string } => {

    // 防御性检查
    if (!choiceCardData) {
        return { canPlay: false, lockedMessage: "数据异常" };
    }

    // [枷锁判定 1：英雄等级限制]
    // 兼容处理：检查卡牌数据是否要求 2 级，或通过 key 识别大招
    const requiresLevel2 = choiceCardData.isLevel2Choice || choiceCardData.key.includes('ultimate');
    if (requiresLevel2 && !isHeroLeveled) {
        return { canPlay: false, lockedMessage: "升级以解锁" };
    }

    // [枷锁判定 2：法力值限制]
    if (!canAffordCard(choiceCardData, playerMana, playerSpellMana)) {
        return { canPlay: false, lockedMessage: "法力值不足" };
    }

    // 校验通过，绿灯放行
    return { canPlay: true, lockedMessage: "" };
};

// ==========================================
// [新增] 状态快照与完美复印机 (Deep Clone Engine)
// ==========================================
export const cloneUnitState = (sourceCard: CardData, targetTemplate: CardData): CardData => {
    // 1. 计算源卡牌此时此刻的“真实身材” (包含受到的伤害和法术 Buff)
    const currentPower = sourceCard.power + (sourceCard.buffs?.power || 0);
    const currentHealth = sourceCard.health + (sourceCard.buffs?.health || 0) - (sourceCard.damageTaken || 0);

    // 2. 合并关键词：保留模板自带的词条（如'Ephemeral'），并加上源卡牌此刻的词条，最后去重
    const mergedKeywords = Array.from(new Set([...targetTemplate.keywords, ...sourceCard.keywords]));

    // 3. 返回完美复刻的新卡牌
    return {
        ...targetTemplate,
        power: currentPower,
        health: currentHealth,
        maxHealth: currentHealth, // 快照后的最大生命值即为当前真实生命值
        keywords: mergedKeywords,
        // [关键] 清空克隆体的受击与增益记录，因为它已经把这些历史记录固化为了基础身材
        damageTaken: 0,
        buffs: { power: 0, health: 0 },
        roundBuffs: { power: 0, health: 0 }
    };
};

// ==========================================
// [新增] UI 前置侦察兵：检测卡牌的前置在场条件是否满足
// ==========================================
export const checkCardConditionActive = (card: CardData, playerBench: CardData[], combatField: any[]): boolean => {
    if (!card.effects || card.effects.length === 0) return false;

    // 遍历该卡牌挂载的所有效果
    for (const effId of card.effects) {
        const def = EFFECT_DB[effId];
        // 如果发现需要特定单位在场的暗号名单
        if (def && def.params && def.params.presenceRequirement && def.params.presenceRequirement.length > 0) {
            const requiredKeys = def.params.presenceRequirement;

            const isValidUnit = (c: CardData | null | undefined) =>
                c && requiredKeys.some(reqKey => c.key.includes(reqKey));

            // 1. 查备战席 (增加防御性空值判断)
            let hasRequiredUnit = (playerBench || []).some(isValidUnit);

            // 2. 查交战区 (增加防御性空值判断)
            if (!hasRequiredUnit && combatField) {
                hasRequiredUnit = (combatField || []).some(fight => {
                    const myUnit = fight.owner === 'player' ? fight.attacker : fight.blocker;
                    return isValidUnit(myUnit);
                });
            }

            if (hasRequiredUnit) return true; // 条件满足，拉响橙色警报！
        }
    }
    return false;
};