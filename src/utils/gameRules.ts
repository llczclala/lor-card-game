import type { CardData } from '../types';

export const canAffordCard = (card: CardData, mana: number, spellMana: number): boolean => {
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

export const getLeveledUpCard = (card: CardData): CardData => {
    let powerBonus = 1;
    let healthBonus = 1;

    if (card.key === 'lyfe') {
        return {
            ...card,
            level: 2,
            power: card.power + 1, // 假设升级+1/+1
            health: card.health + 1,
            maxHealth: card.maxHealth + 1,
            level2ImageUrl: card.level2ImageUrl,
            // [新增] 动态添加被动技能
            effects: ['effect_lyfe_rally_passive']
        };
    }

    // 芬妮升级特性：永久获得 +3/+0
    if (card.key === 'fenny') {
        powerBonus = 3;
        healthBonus = 1;
    }

    return {
        ...card,
        level: 2,
        power: card.power + powerBonus,
        health: card.health + healthBonus,
        maxHealth: card.maxHealth + healthBonus,
        imageUrl: card.level2ImageUrl || card.imageUrl
    };
};