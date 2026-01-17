import type { CardData } from '../types';

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
            power: card.power + 3,
            health: card.health,
            maxHealth: card.maxHealth,
            level2ImageUrl: card.level2ImageUrl,
            description: '进攻：对我前方的阻挡者造成 3 点伤害。',
            effects: ['effect_fenny_cleave'] // 假设有顺劈效果
        } as CardData;
    }

    return card;
};