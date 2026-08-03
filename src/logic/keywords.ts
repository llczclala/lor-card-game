import type { CardData, GameState } from '../types';

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
// [核心修复] 补回遗漏的 roundBuffs (临时账本)！否则冻结和临时增益在战斗中将完全失效！
// (将其 export 导出，供 effectProcessor 等外部组件共用，避免重复造轮子)
export const getPower = (c: CardData) => {
    const raw = (c.power || 0) + (c.buffs?.power || 0) + (c.roundBuffs?.power || 0);
    // [maxPower] 如有攻击力上限，clamp 到该值（底座专用）
    if (c.maxPower !== undefined && raw > c.maxPower) return c.maxPower;
    // [2026-07-09] 攻击力下限为 0，不因 debuff 变为负数
    return Math.max(0, raw);
};
export const getHealth = (c: CardData) => (c.health || 0) + (c.buffs?.health || 0) + (c.roundBuffs?.health || 0) - (c.damageTaken || 0);

// ==========================================
// [新增] 冻结 (Frostbite) 专属绝对零度处理器
// ==========================================
/**
 * 应用【冻结】效果：动态计算当前真实攻击力，并向 roundBuffs 注入等额负数对冲清零
 */
export const applyFrostbite = (card: CardData): CardData => {
    // 1. 获取当前真实攻击力 (包含永久和临时 Buff)
    const currentPower = getPower(card);

    // 2. 如果攻击力已经 <= 0，不需要再减；否则产生等额的负数对冲
    const offset = currentPower > 0 ? -currentPower : 0;

    // 3. 记入临时词条账本，确保回合结束能被全局清理机制自动销毁
    let newRoundKeywords = card.roundKeywords || [];
    if (!newRoundKeywords.includes('Frostbite')) {
        newRoundKeywords = [...newRoundKeywords, 'Frostbite'];
    }

    return {
        ...card,
        keywords: Array.from(new Set([...card.keywords, 'Frostbite'])),
        roundKeywords: newRoundKeywords,
        roundBuffs: {
            power: (card.roundBuffs?.power || 0) + offset,
            health: card.roundBuffs?.health || 0
        },
        animState: 'buff' as const // 借用 buff 动画状态触发前端光晕
    };
};

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
// [Volatile] 瞬逝 — 回合结束手牌弃置
// Volatile 不限定卡牌类型（单位/法术均可持有），
// 触发时机固定为回合结束时，从手牌弃置。
// 返回 { kept, discarded } 方便调用方做事件分发
// ==========================================
export const applyVolatileDiscard = (hand: CardData[]): { kept: CardData[], discarded: CardData[] } => {
    const discarded = hand.filter(c => c.keywords.includes('Volatile'));
    const kept = hand.filter(c => !c.keywords.includes('Volatile'));
    return { kept, discarded };
};

// ==========================================
// [泰坦] 脉冲解析器 — 事件驱动分发架构
// ==========================================

export interface TitanPulseResult {
  playerBoard: CardData[];
  enemyBoard: CardData[];
  pulsedUnits: number;  // 本次脉冲了多少个单位
  pulseAmount: number;  // 本次脉冲的攻击力数值
}

/** 脉冲产生的副效果事件类型 */
export type PulseEventType = 'random_barrage' | 'aoe_damage';

/** 脉冲副效果事件 */
export interface PulseEvent {
  type: PulseEventType;
  sourceId: string;
  owner: 'player' | 'enemy';
  params: {
    shots?: number;   // random_barrage: 发射子弹数
    damage: number;   // 伤害值
  };
}

/** 增强的脉冲结果（带事件队列） */
export interface TitanPulseResultEx extends TitanPulseResult {
  events: PulseEvent[];
}

/**
 * 处理泰坦脉冲：按单位类型分发效果
 * - 普通泰坦：+ATK（等于全场泰坦数）→ 标记黯淡
 * - 特殊泰坦：按 unit.key 走不同分支（不加攻 / 半额 / 产生扫射事件等）
 * @param playerBoard 我方场上单位
 * @param enemyBoard 敌方场上单位
 * @returns 更新后的双方场上单位 + 脉冲信息 + 副效果事件
 */
export const resolveTitanPulse = (
  playerBoard: CardData[],
  enemyBoard: CardData[],
): TitanPulseResult => {
  // 直接调用新版本，丢弃 events（向上兼容）
  const result = executeTitanPulse(playerBoard, enemyBoard);
  return result;
};

/** 完整的泰坦脉冲执行器（带副效果事件） */
export const executeTitanPulse = (
  playerBoard: CardData[],
  enemyBoard: CardData[],
): TitanPulseResultEx => {
  const allUnits = [...playerBoard, ...enemyBoard];
  const events: PulseEvent[] = [];

  // 1. 计算场上泰坦总数
  const titanCount = allUnits.filter(c => c.keywords.includes('Titan')).length;

  if (titanCount === 0) {
    return { playerBoard, enemyBoard, pulsedUnits: 0, pulseAmount: 0, events };
  }

  // 2. 按单位类型分发脉冲效果
  const processBoard = (board: CardData[]): CardData[] =>
    board.map(c => {
      if (!c.keywords.includes('Titan')) return c;
      if ((c.depletedKeywords || []).includes('Titan')) return c;

      // --- 按单位 key 分发 ---
      switch (c.key) {
        // ========== 乙型异化人：不加攻，产生随机扫射事件 ==========
        case 'titan_type_b_mutant':
          events.push({
            type: 'random_barrage',
            sourceId: c.id,
            owner: board === playerBoard ? 'player' : 'enemy',
            params: { shots: titanCount, damage: 1 },
          });
          return {
            ...c,
            depletedKeywords: [...(c.depletedKeywords || []), 'Titan'],
            animState: 'buff',
          };

        // ========== 丙型异化人：不加攻，改为加生命 ==========
        case 'titan_type_c_mutant':
          return {
            ...c,
            buffs: {
              power: c.buffs?.power || 0,
              health: (c.buffs?.health || 0) + titanCount,
            },
            depletedKeywords: [...(c.depletedKeywords || []), 'Titan'],
            animState: 'buff',
          };

        // ========== 贡露：不加攻，累计无人机充能 ==========
        case 'titan_gonglu':
          return {
            ...c,
            titanCharge: ((c as any).titanCharge || 0) + titanCount,
            depletedKeywords: [...(c.depletedKeywords || []), 'Titan'],
            animState: 'buff',
          };

        // ========== 盖弥尔：半额加攻 + 不黯淡 + 脉冲时全场AOE ==========
        case 'titan_gaimer':
          events.push({
            type: 'aoe_damage',
            sourceId: c.id,
            owner: board === playerBoard ? 'player' : 'enemy',
            params: { damage: 1 },
          });
          return {
            ...c,
            buffs: {
              power: (c.buffs?.power || 0) + Math.floor(titanCount / 2),
              health: c.buffs?.health || 0,
            },
            // 不追加 depletedKeywords → 永不黯淡
            animState: 'buff',
          };

        // ========== 默认：普通泰坦加攻后黯淡 ==========
        default:
          return {
            ...c,
            buffs: {
              power: (c.buffs?.power || 0) + titanCount,
              health: c.buffs?.health || 0,
            },
            depletedKeywords: [...(c.depletedKeywords || []), 'Titan'],
            animState: 'buff',
          };
      }
    });

  const newPlayerBoard = processBoard(playerBoard);
  const newEnemyBoard = processBoard(enemyBoard);

  // 3. 统计本次脉冲的单位数
  const pulsedUnits = allUnits.filter(
    c => c.keywords.includes('Titan') && !(c.depletedKeywords || []).includes('Titan')
  ).length;

  return {
    playerBoard: newPlayerBoard,
    enemyBoard: newEnemyBoard,
    pulsedUnits,
    pulseAmount: titanCount,
    events,
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
    let attackerRealPower = getPower(attacker);
    // [CantAttack] 无法攻击：战斗中攻击力强制为 0，无论面板显示多少
    if (attacker.keywords.includes('CantAttack')) {
        attackerRealPower = 0;
    }

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

        // --- 3. Tough (坚韧) ---
        // 效果：受到的所有伤害减少 1 点（最低为 0）
        if (blocker && blocker.keywords.includes('Tough') && blockerDamage > 0) {
            blockerDamage = Math.max(0, blockerDamage - 1);
        }
        if (attacker.keywords.includes('Tough') && attackerDamage > 0) {
            attackerDamage = Math.max(0, attackerDamage - 1);
        }

        // --- 4. Barrier (屏障) ---
        // 效果：抵挡一次伤害，生效后消失
        const attackerBarrierActive = attacker.keywords.includes('Barrier');
        const blockerBarrierActive = blocker && blocker.keywords.includes('Barrier');

        if (attackerBarrierActive && attackerDamage > 0) {
            attackerDamage = 0;
            attackerBarrierPopped = true;
        }
        if (blockerBarrierActive && blockerDamage > 0) {
            blockerDamage = 0;
            blockerBarrierPopped = true;
        }
    }

    return { attackerDamage, blockerDamage, nexusDamage, attackerBarrierPopped, blockerBarrierPopped, quickAttackEphemeralDeath };
};

// ==========================================
// [Channel] 充能 — 恢复 1 点法术法力，触发后黯淡
// ==========================================
/**
 * 处理 Channel（充能）关键词：恢复 1 点法术法力，触发后追加 depletedKeywords
 * 上限为 3，超出部分不累积
 * @param card 被召唤的单位
 * @param owner 所属方
 * @param game 当前游戏状态
 * @returns 更新后的游戏状态
 */
export const applyChannelOnSummon = (card: CardData, owner: 'player' | 'enemy', game: GameState): GameState => {
    if (!card.keywords.includes('Channel')) return game;
    if ((card.depletedKeywords || []).includes('Channel')) return game; // 已黯淡不再触发

    const newGame = { ...game };
    if (owner === 'player') {
        const before = newGame.playerSpellMana;
        newGame.playerSpellMana = Math.min(3, (newGame.playerSpellMana || 0) + 1);
        console.log(`[Channel] ${card.name} 充能：法术法力 ${before} → ${newGame.playerSpellMana}`);
    } else {
        const before = newGame.enemySpellMana;
        newGame.enemySpellMana = Math.min(3, (newGame.enemySpellMana || 0) + 1);
        console.log(`[Channel] ${card.name} 充能：法术法力 ${before} → ${newGame.enemySpellMana}`);
    }
    return newGame;
};

/**
 * 处理回合开始时未黯淡的 Channel 单位：充能 +1 法术法力
 * @param cards 备战席上的卡牌数组
 * @param owner 所属方
 * @returns { cards: 更新后的卡牌数组, count: 触发充能的单位数 }
 */
export const applyChannelOnRoundStart = (cards: CardData[]): { cards: CardData[], count: number } => {
    let count = 0;
    const updatedCards = cards.map(card => {
        if (card.keywords.includes('Channel') && !(card.depletedKeywords || []).includes('Channel')) {
            count++;
            return {
                ...card,
                animState: 'channel_pulse' as const,
                depletedKeywords: [...(card.depletedKeywords || []), 'Channel'],
            };
        }
        return card;
    });
    return { cards: updatedCards, count };
};