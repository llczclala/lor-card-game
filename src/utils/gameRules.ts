import type { CardData, GameState } from '../types';
import { EFFECT_DB } from '../data/effectRegistry'; // [新增] 引入效果字典以读取前置条件
import { createCard } from '../data/cards'; // [2026-07-31] 安卡升级手牌替换

/** [2026-07-10 诗人] 检测凯特琳减费光环是否在场 */
export const hasPoetCaitlinAura = (bench: CardData[]): boolean => {
    return bench.some(c => c.key === 'Poet_Squad_Caitlin' && !c.isDead);
};

/** [2026-07-14 锻造者] 检测缇坦妮娅法术增伤光环是否在场（含交战区） */
export const hasForgerTatianaAura = (bench: CardData[], combatField?: any[]): boolean => {
    if (bench.some(c => c.key === 'The_Forger_Squad_Tatiana' && !c.isDead)) return true;
    if (combatField) {
        return combatField.some(fight => {
            const a = fight.attacker, b = fight.blocker;
            return (a?.key === 'The_Forger_Squad_Tatiana' && !a?.isDead) ||
                   (b?.key === 'The_Forger_Squad_Tatiana' && !b?.isDead);
        });
    }
    return false;
};

/** [2026-07-10 诗人] 获取法术卡的实际费用（扣除凯特琳减费 / 觉悟减费） */
export const getEffectiveSpellCost = (card: CardData, bench: CardData[], maxMana?: number): number => {
    // [2026-07-15 梵音] 觉悟减费：巨偶一瞥在法力上限≥10时费用为0
    if (maxMana !== undefined && maxMana >= 10 && card.key === 'Shalo_Golem_Glimpse') {
        return 0;
    }
    // 只有极速(burst)和快速(fast)法术受凯特琳减费影响
    if (card.type === 'spell-burst' || card.type === 'spell-fast') {
        if (hasPoetCaitlinAura(bench)) {
            return Math.max(0, card.cost - 1);
        }
    }
    return card.cost;
};

// ==========================================
// [2026-07-10 绿灵小队] 牌库BUFF辅助函数
// ==========================================

/** 从牌库顶部查找第一个单位卡牌（跳过法术） */
export const findTopUnitInDeck = (deck: CardData[]): CardData | null => {
    for (const card of deck) {
        if (card.type?.includes('unit')) return card;
    }
    return null;
};

/** 对牌库顶部的 N 个单位施加 buff，返回更新后的牌库和最后一个被 buff 的单位 */
export const buffTopUnitInDeck = (
    deck: CardData[],
    power: number,
    health: number,
    count: number = 1
): { deck: CardData[]; buffed: boolean; buffedUnit?: CardData } => {
    const newDeck = [...deck];
    let buffed = false;
    let buffedUnit: CardData | undefined;
    let found = 0;

    for (let i = 0; i < newDeck.length && found < count; i++) {
        if (newDeck[i].type?.includes('unit')) {
            newDeck[i] = {
                ...newDeck[i],
                buffs: {
                    power: (newDeck[i].buffs?.power || 0) + power,
                    health: (newDeck[i].buffs?.health || 0) + health,
                },
            };
            buffed = true;
            buffedUnit = newDeck[i];
            found++;
        }
    }
    return { deck: newDeck, buffed, buffedUnit };
};

/** 对牌库中所有单位施加 buff */
export const buffAllUnitsInDeck = (deck: CardData[], power: number, health: number): CardData[] => {
    return deck.map(card => {
        if (card.type?.includes('unit')) {
            return {
                ...card,
                buffs: {
                    power: (card.buffs?.power || 0) + power,
                    health: (card.buffs?.health || 0) + health,
                },
            };
        }
        return card;
    });
};

export const canAffordCard = (card: CardData, mana: number, spellMana: number, bench?: CardData[]): boolean => {
  // [修正] 防御性检查：防止因"幽灵卡牌"（数据缺失）导致的崩溃
  if (!card || !card.type) {
      return false;
  }

  const cost = bench ? getEffectiveSpellCost(card, bench) : card.cost;

  if (card.type.includes('unit')) {
    return mana >= cost;
  } else {
    return (mana + spellMana) >= cost;
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

    // [2026-07-22 莉莉子] 保险钳制：法力值不允许低于 0
    return {
        newMana: Math.max(0, newMana),
        newSpellMana: Math.max(0, newSpellMana),
    };
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

    // [新增] 猫汐尔莲驱：我方召唤者和召唤物累计造成 30 点伤害（customProgress 追踪）
    if (card.key === 'mauxir_lotus_drive' && (card.customProgress || 0) >= 30) return true;

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
            effects: ['effect_lyfe_rally_passive'],
            ability: { id: 'lyfe_lv2_rally', label: '里芙的压制', description: '回合开始时：进行备战。', trigger: 'round_start', maxCharges: -1, postTriggerState: 'recharge' },
            abilityState: 'breathing' as const,
            abilityCharges: -1,
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
            effects: ['effect_fenny_attack_lv2'],
            ability: { id: 'fenny_lv2_first_strike', label: '绝对主角', description: '进攻：首次进攻时，永久赋予自己 +5/+0。', trigger: 'on_attack_declare', maxCharges: 1, postTriggerState: 'dim', isLevelAbility: true },
            abilityState: 'breathing' as const,
            abilityCharges: 1,
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
            effects: ['effect_pupu_level2_attack'],
            ability: { id: 'pupu_lv2_clone_summon', label: '镜爻·复刻', description: '进攻时：召唤一个完全复制自身的”镜爻 卜卜”参与进攻。', trigger: 'on_attack_declare', maxCharges: -1, postTriggerState: 'recharge', isLevelAbility: true },
            abilityState: 'breathing' as const,
            abilityCharges: -1,
        } as CardData;
    }

    // [新增] 猫汐尔莲驱 Lv2：感知补全+
    if (card.key === 'mauxir_lotus_drive') {
        return {
            ...card,
            level: 2,
            power: card.power,
            health: card.health + 1,
            maxHealth: card.maxHealth + 1,
            level2ImageUrl: card.level2ImageUrl,
            description: '【库效】回合开始时，若己方备战席没有“臆莲基座”，则召唤一个。回合结束：对我方所有“臆莲基座”造成1点伤害，之后赋予其+0 +2，“臆莲基座”可以以敌方水晶为目标。',
            keywords: [],
            effects: ['effect_mauxir_lotus_drive_lv2'],
            ability: { id: 'mauxir_lv2_aura', label: '莲华庇佑', description: '【库效】回合开始时，若己方备战席没有“臆莲基座”，则召唤一个。回合结束：对我方所有“臆莲基座”造成1点伤害，之后赋予其+0 +3，“臆莲基座”可以以敌方水晶为目标。', trigger: 'round_start', maxCharges: -1, postTriggerState: 'recharge', isLevelAbility: true },
            abilityState: 'breathing' as const,
            abilityCharges: -1,
        } as CardData;
    }

    // [2026-07-29 安卡希雅 时之重奏] 升级：飞剑强化（所有飞剑→大飞剑2/1碾压）
    if (card.key === 'acacia_chrono_echo') {
        return {
            ...card,
            level: 2,
            power: card.power + 1,
            health: card.health + 1,
            maxHealth: card.maxHealth + 1,
            level2ImageUrl: card.level2ImageUrl,
            description: '【库效】若我方手牌中没有，则在我方手牌中生成一张“安卡希雅的重锋”。\n入场及获得进攻标识时：生成一张易逝的“月镰剑势”。\n参战：变化为“安卡希雅的剑舞”。\n【飞剑强化】“飞剑”升级为“大飞剑”（2/1碾压）。',
            keywords: ['QuickAttack', 'Aura', 'Ability'],
            associatedSpellKey: 'acacia_chrono_echo_heavy', // [2026-07-31] 升级后关联法术切换为重锋
            effects: ['effect_acacia_chrono_echo_lv2', 'effect_acacia_chrono_echo_token_lv2'],
        } as CardData;
    }

    return card;
};

/**
 * [2026-07-31 安卡希雅] 升级后的手牌替换：剑舞→重锋、扩散/集束→月镰剑势
 * 供所有安卡升级路径（朔望之期 / 战斗升级扫描器）统一调用
 */
export const upgradeAcaciaHand = (hand: CardData[]): CardData[] => {
    return hand.map(c => {
        if (c.key === 'acacia_chrono_echo_spell') return { ...createCard('acacia_chrono_echo_heavy'), id: c.id };
        if (c.key === 'acacia_sword_rain' || c.key === 'acacia_moon_focus') return { ...createCard('acacia_sword_rain_alt'), id: c.id };
        // [2026-07-31] 手牌安卡英雄副本：保持 Lv1（显示升级进度、打出后由升级扫描器升到 Lv2），
        // 但标记升级条件已达成（customProgress=1）并让关联法术指向重锋（变形系统不依赖此字段，为防御）
        if (c.key === 'acacia_chrono_echo') {
            return { ...c, customProgress: Math.max(c.customProgress || 0, 1), associatedSpellKey: 'acacia_chrono_echo_heavy' };
        }
        return c;
    });
};

/**
 * [2026-08-01 莉莉子] 安卡退级后的手牌替换：重锋→剑舞、月镰剑势→扩散
 * 供剑痕时空退级路径统一调用（与 upgradeAcaciaHand 走相同逻辑层、反向执行）
 */
export const demoteAcaciaHand = (hand: CardData[]): CardData[] => {
    return hand.map(c => {
        if (c.key === 'acacia_chrono_echo_heavy') return { ...createCard('acacia_chrono_echo_spell'), id: c.id };
        if (c.key === 'acacia_sword_rain_alt') return { ...createCard('acacia_sword_rain'), id: c.id };
        // 手牌/牌库里的 Lv2 安卡副本：降回 Lv1（退级后抽到/打出为 Lv1），升级进度与关联法术一并回退
        if (c.key === 'acacia_chrono_echo' && c.level === 2) {
            return { ...c, level: 1, customProgress: 0, associatedSpellKey: 'acacia_chrono_echo_spell' };
        }
        return c;
    });
};

// --- 以下为新增代码 ---

// [新增] 命运抉择选项的通用安检机制
export const evaluateChoiceCondition = (
    choiceCardData: CardData,
    playerMana: number,
    playerSpellMana: number,
    isHeroLeveled: boolean = false,
    gamePhase?: string // [2026-07-27 莉莉子] 阶段检查（慢速法术拦截）
): { canPlay: boolean; lockedMessage: string } => {

    // 防御性检查
    if (!choiceCardData) {
        return { canPlay: false, lockedMessage: "数据异常" };
    }

    // [枷锁判定 1：英雄等级限制]
    // 兼容处理：检查卡牌数据是否要求 2 级，或通过 key 识别大招
    const requiresLevel2 = choiceCardData.isLevel2Choice ||
        (choiceCardData.key.includes('ultimate') && choiceCardData.key !== 'acacia_chrono_echo_ultimate');
    if (requiresLevel2 && !isHeroLeveled) {
        return { canPlay: false, lockedMessage: "升级以解锁" };
    }

    // [枷锁判定 2：法力值限制]
    if (!canAffordCard(choiceCardData, playerMana, playerSpellMana)) {
        return { canPlay: false, lockedMessage: "法力值不足" };
    }

    // [枷锁判定 3：战斗阶段不能选慢速法术]
    if (gamePhase) {
        const isCombatPhase = gamePhase === 'attack_declare' || gamePhase === 'block_declare' || gamePhase === 'react_to_block';
        if (isCombatPhase && choiceCardData.type === 'spell-slow') {
            return { canPlay: false, lockedMessage: "此时无法使用慢速法术" };
        }
    }

    // 校验通过，绿灯放行
    return { canPlay: true, lockedMessage: "" };
};

// ==========================================
// [新增] 状态快照与完美复印机 (Deep Clone Engine)
// ==========================================
export const cloneUnitState = (sourceCard: CardData, targetTemplate: CardData): CardData => {
    // 1. 计算源卡牌此时此刻的”真实身材” (包含永久 buffs、回合 buffs 和受到的伤害)
    const currentPower = sourceCard.power + (sourceCard.buffs?.power || 0) + (sourceCard.roundBuffs?.power || 0);
    const currentHealth = sourceCard.health + (sourceCard.buffs?.health || 0) + (sourceCard.roundBuffs?.health || 0) - (sourceCard.damageTaken || 0);

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
export const checkCardConditionActive = (card: CardData, playerBench: CardData[], combatField: any[], game?: GameState): boolean => {
    if (!card.effects || card.effects.length === 0) return false;

    // [2026-07-31 圣树·阿尔维娜] 能力触发条件：本回合已飞剑（满足 → 手牌高亮描边，与歌莉娅同款）
    if (card.key === 'Sacred_Tree_Squad_Alvina' && game?.playerRoundSwordUsed) {
        return true;
    }

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
// ==========================================
// [新增] UI 侦察兵：检测卡牌是否已满足升级条件但还未升级（用于手牌橙色高光）
// ==========================================

/**
 * 检查冠军卡是否已满经验（customProgress 达标），但仍是 Lv1 待升级状态。
 * 用于手牌橙色高光提示"蓄势待发"。
 */
export const checkCardReadyToLevelUp = (card: CardData, game?: GameState): boolean => {
    if (card.level >= 2 || !card.isChampion) return false;
    // 猫汐尔：customProgress ≥ 30 时满经验
    if (card.key === 'mauxir_lotus_drive' && (card.customProgress || 0) >= 30) return true;
    // [2026-07-31 安卡希雅] 场下升级：朔望之期已打出（全局标记）→ 手牌安卡橙色高亮"打出即升级"
    if (card.key === 'acacia_chrono_echo' && game?.leveledChampions?.includes('acacia_chrono_echo')) return true;
    // 未来其他以 customProgress 追踪升级的英雄可加在这里
    // if (card.key === 'xxx' && (card.customProgress || 0) >= N) return true;
    return false;
};

// ==========================================
// [新增] 猫汐尔专属：召唤体系伤害经验收集器
// ==========================================

/**
 * 验证单位是否具有召唤系血统
 */
export const isSummonerOrSummon = (card: CardData): boolean => {
    return card.race?.some(r => r === 'summoner' || r === 'summon') ?? false;
};

/**
 * 猫汐尔升级进度累加器（全域广播版）
 * 扫描玩家所有区域（牌库、手牌、备战席）的 Lv1 猫汐尔，为其注入召唤系造成的伤害经验。
 */
export const accumulateMauxirDamage = (
    bench: CardData[],
    _field: any[], // 兼容交战区数据类型
    amount: number,
    setBench: (b: CardData[]) => void,
    hand?: CardData[],
    setHand?: (h: CardData[]) => void,
    deck?: CardData[],
    setDeck?: (d: CardData[]) => void
): boolean => {
    if (amount <= 0) return false;

    let needsUpdate = false;

    // 辅助函数：扫描单个区域，更新 Lv1 猫汐尔的 customProgress
    const accumulateInZone = (zone: CardData[]): CardData[] => {
        return zone.map(card => {
            if (card.key === 'mauxir_lotus_drive' && card.level === 1) {
                const currentProgress = card.customProgress || 0;
                if (currentProgress < 30) {
                    needsUpdate = true;
                    return { ...card, customProgress: Math.min(30, currentProgress + amount) };
                }
            }
            return card;
        });
    };

    // 全域广播：扫描所有可访问的区域
    const nextBench = accumulateInZone(bench);
    if (hand && setHand) setHand(accumulateInZone(hand));
    if (deck && setDeck) setDeck(accumulateInZone(deck));

    // 提交进度
    if (needsUpdate) {
        setBench(nextBench);
    }

    return false; // 不越权触发升级
};

/** [2026-07-14 梵音] 检测觉悟状态（我方法力值上限是否达到10点） */
export const hasEnlightenment = (maxMana: number): boolean => {
    return maxMana >= 10;
};

/** [2026-07-15] 检测巨偶一瞥是否处于觉悟状态（手牌橙色高亮） */
export const checkShaloGlimpseEnlightened = (card: CardData, maxMana: number): boolean => {
    return card.key === 'Shalo_Golem_Glimpse' && hasEnlightenment(maxMana);
};