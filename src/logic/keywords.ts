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
    // [新增] 标记攻击者是否因先攻+幻象特效而在反击前死亡
    quickAttackEphemeralDeath: boolean;
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
            // [核心修复] 判断是否受伤，唯一标准是看身上有没有“欠条” (damageTaken > 0)
            const needsHeal = (card.damageTaken || 0) > 0;

            if (needsHeal) {
                return {
                    ...card,
                    // [致命 Bug 修复] 绝不去修改底层的 health，只负责把欠条清零！
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
// [新增] 辅助函数：获取包含 Buff 和损血计算在内的“真实面板数值”
const getPower = (c: CardData) => (c.power || 0) + (c.buffs?.power || 0);
const getHealth = (c: CardData) => (c.health || 0) + (c.buffs?.health || 0) - (c.damageTaken || 0);

/**
 * 处理回合结束时的关键词效果 (如 Ephemeral)
 * @param cards 备战席上的卡牌数组
 * @returns 更新后的卡牌数组
 */
export const applyRoundEndKeywords = (cards: CardData[]): CardData[] => {
    return cards.map(card => {
        // --- Ephemeral (幻象) ---
        // 效果：回合结束时自动死亡
        if (card.keywords.includes('Ephemeral')) {
            return {
                ...card,
                // 打上死亡标记，交由 useGameState 中的全局收尸系统 (黄金 1.1 秒法则) 处理特效和清理
                animState: 'ephemeral_dying'
            };
        }
        return card;
    });
};

// ==========================================
// [泰坦] 脉冲解析器 — 回合结束时调用
// ==========================================

export interface TitanPulseResult {
  playerBoard: CardData[];
  enemyBoard: CardData[];
  pulsedUnits: number;  // 本次脉冲了多少个单位
  pulseAmount: number;  // 本次脉冲的攻击力数值
}

/**
 * 处理泰坦脉冲：数场上泰坦总数 → 给未黯淡的泰坦加攻 → 标记黯淡
 * @param playerBoard 我方场上单位
 * @param enemyBoard 敌方场上单位
 * @returns 更新后的双方场上单位 + 脉冲信息
 */
export const resolveTitanPulse = (
  playerBoard: CardData[],
  enemyBoard: CardData[],
): TitanPulseResult => {
  const allUnits = [...playerBoard, ...enemyBoard];

  // 1. 计算场上泰坦总数（包括已黯淡的，关键词还在就计入）
  const titanCount = allUnits.filter(c => c.keywords.includes('Titan')).length;

  if (titanCount === 0) {
    return { playerBoard, enemyBoard, pulsedUnits: 0, pulseAmount: 0 };
  }

  // 2. 为未黯淡的泰坦加攻并标记黯淡
  const processBoard = (board: CardData[]): CardData[] =>
    board.map(c => {
      if (!c.keywords.includes('Titan')) return c;
      if ((c.depletedKeywords || []).includes('Titan')) return c;
      return {
        ...c,
        buffs: {
          power: (c.buffs?.power || 0) + titanCount,
          health: c.buffs?.health || 0,
        },
        depletedKeywords: [...(c.depletedKeywords || []), 'Titan'],
      };
    });

  const newPlayerBoard = processBoard(playerBoard);
  const newEnemyBoard = processBoard(enemyBoard);

  // 3. 统计本次脉冲的单位数
  const pulsedUnits = [...playerBoard, ...enemyBoard].filter(
    c => c.keywords.includes('Titan') && !(c.depletedKeywords || []).includes('Titan')
  ).length;

  return {
    playerBoard: newPlayerBoard,
    enemyBoard: newEnemyBoard,
    pulsedUnits,
    pulseAmount: titanCount,
  };
};

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
    // [新增] 初始化幻象致死标记
    let quickAttackEphemeralDeath = false;

    // [核心修复] 战斗引擎重见光明：读取攻击者的真实战斗力！
    const attackerRealPower = getPower(attacker);

    if (!blocker) {
        // --- 情况 A: 直接攻击 (Direct Attack) ---
        // 伤害全部打在水晶上
        nexusDamage = attackerRealPower;
    } else {
        // --- 情况 B: 单位对抗 (Clash) ---

        // 基础伤害计算
        let damageToBlocker = attackerRealPower;

        // [核心修复] 读取防守者的真实血量和攻击力
        const blockerRealHealth = getHealth(blocker);
        const blockerRealPower = getPower(blocker);

        // --- 1. Overwhelm (贯通/碾压) ---
        // 效果：超出阻挡者生命值的伤害打击水晶
        if (attacker.keywords.includes('Overwhelm')) {
            // 计算溢出伤害
            const overflow = Math.max(0, attackerRealPower - blockerRealHealth);
            if (overflow > 0) {
                nexusDamage = overflow;
            }
            // 注意：在大多数 TCG (如 LoR) 中，即使有贯通，阻挡者依然承受全额攻击力伤害
            damageToBlocker = attackerRealPower;
        }

        // 记录阻挡者受到的最终伤害
        blockerDamage = damageToBlocker;

        // --- 2. QuickAttack (先攻) ---
        // 效果：若攻击者有先攻且能击杀阻挡者，则不受反击伤害
        const hasQuickAttack = attacker.keywords.includes('QuickAttack');
        // 预测阻挡者是否会在这次打击中死亡
        const willBlockerDie = blockerRealHealth <= damageToBlocker;
        // [新增] 检查攻击者是否为幻象
        const isAttackerEphemeral = attacker.keywords.includes('Ephemeral');

        if (hasQuickAttack) {
            if (isAttackerEphemeral) {
                // [幻象拦截] 先攻 + 幻象：打完先攻伤害后自己立刻蒸发，阻挡者（无论死活）都因失去目标而无法反击
                attackerDamage = 0;
                quickAttackEphemeralDeath = true; // 发送标记给外层执行处决
            } else if (willBlockerDie) {
                // 先攻生效且击杀：无损
                attackerDamage = 0;
            } else {
                // 正常反击：承受阻挡者的真实攻击力
                attackerDamage = blockerRealPower;
            }
        } else {
            // 没有先攻的正常反击：承受阻挡者的真实攻击力
            attackerDamage = blockerRealPower;
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

    return { attackerDamage, blockerDamage, nexusDamage, attackerBarrierPopped, blockerBarrierPopped, quickAttackEphemeralDeath };
};