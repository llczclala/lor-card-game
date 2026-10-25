import type { CardData, GameState, Keyword } from '../types';
import { createCard } from '../data/cards'; // [2026-08-06 莉莉子] Echo 回响：生成瞬逝复制品需要重建卡牌实例
// [2026-10-08 莉莉子 · 法术专属装备 第二波 · Q5] 复制品**继承装备**（G1：跳过提供 Echo 的装备，防无限繁殖）
import { attachEquipment, getEquipmentById } from '../data/equipment';
// [2026-10-19 程] 充能上限不再写死 3，改用动态上限（共鸣涌流成长 / 囤积提额）
import { spellManaCapOf } from './core';

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

// ==========================================
// [2026-09-12 莉莉子] 【剧毒 Deadly】擦伤即解构 —— 统一判定入口
//   Deadly 是**负面**词条：带有它的单位【受到】任何伤害即被消灭
//   （2026-09-12 语义反转：原为"该单位造成的伤害必杀"＝给己方的增益，现为受体侧的 debuff）
//   边界：
//     · 只看减伤结算之后的最终伤害 > 0 才算"擦伤"——屏障全额抵挡 / 坚韧减到 0 → 不触发
//     · 对水晶无效，只作用于单位（本函数仅在单位伤害落点调用）
//     · 战斗打击 / 法术直伤 / 反伤反弹 三条伤害来源全覆盖
//   实现手法沿用幻象（Ephemeral）：注入超大伤害，交由全局收尸系统统一裁决死亡与演出
// ==========================================

/** 剧毒引发的致死伤害注入值：远大于任何单位的血量上限 */
export const POISON_LETHAL_DAMAGE = 9999;

/**
 * 计算剧毒需要额外注入的致死伤害。
 * @param target 承受伤害的单位
 * @param finalDamage 经屏障/坚韧等减伤结算后的最终伤害
 * @returns 需追加进 damageTaken 的致死伤害；未触发剧毒时返回 0
 */
export const deadlyLethalInject = (target: CardData, finalDamage: number): number =>
    (finalDamage > 0 && target.keywords.includes('Deadly')) ? POISON_LETHAL_DAMAGE : 0;

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
            // 🔴 [2026-10-06 莉莉子 · 审计收口] **"无法被治疗"必须拦住【再生】** ——
            //   全项目对 `cantBeHealed`（终焉契约的 Pact 代价）只有一处拦截：`effectProcessor` 的 HEAL 效果类；
            //   而关键词【再生】直接清欠条 ⇒ **绕过**了"无法被治疗"，带契约的单位照样每回合回满血。
            //   ⇒ 与 HEAL 类同口径：契约在手，不回血。
            const needsHeal = (card.damageTaken || 0) > 0 && !card.cantBeHealed;

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
        let blockerRealPower = getPower(blocker);
        // [2026-09-18 BUG修复]【无法攻击】同样约束【格挡反击】——
        //   此前只对 attacker 归零，导致被【暴露】/【挑战者】拉上场格挡的 CantAttack 单位
        //   照常打出反击伤害（面板攻击力没有归零）。
        if (blocker.keywords.includes('CantAttack')) {
            blockerRealPower = 0;
        }

        // 记录阻挡者受到的最终伤害
        blockerDamage = damageToBlocker;

        // [2026-10-19 莉莉子 BUG修复] 【屏障】"是否还存在"必须排除 depletedKeywords
        //   ── `combat.ts` 弹出屏障时只往 `depletedKeywords` 里追加 'Barrier'（:120-125），
        //      而本函数此前只查 `keywords.includes('Barrier')` ⇒ **同一回合内被弹掉的屏障会再挡一次**。
        //   ── 症状最明显的是【连击】：`combat.ts:163` 第一击**强制带先攻**打过去把屏障弹掉，
        //      第二击再进来时 keywords 仍有 Barrier ⇒ 屏障替同一个单位挡两次，
        //      连击对带屏障的单位**等于完全失效**（玩家看到的是"连击打了个寂寞"）。
        //   ── 屏障的语义是「抵挡**一次**伤害」，无论"每回合一次"还是"整局一次"，
        //      都不可能在同一回合里吸收两次。故三处判定统一走下面两个谓词。
        const attackerBarrierActive = attacker.keywords.includes('Barrier')
            && !(attacker.depletedKeywords || []).includes('Barrier');
        const blockerBarrierActive = blocker.keywords.includes('Barrier')
            && !(blocker.depletedKeywords || []).includes('Barrier');

        // --- 2. QuickAttack (先攻) ---
        // 效果：若攻击者有先攻且能击杀阻挡者，则不受反击伤害
        const hasQuickAttack = attacker.keywords.includes('QuickAttack');
        // [2026-10-19 莉莉子 BUG修复] 致死判定必须用「真正会落到阻挡者身上的伤害」
        //   此前用的是 damageToBlocker（**未扣任何减免**的原始值），而【坚韧】的 −1 要到
        //   下方第 3 段「Tough」才执行 ⇒ 先攻打带【坚韧】的阻挡者时"打不死也判定击杀、还不吃反击"。
        //   例：3 攻打 3 血带坚韧的阻挡者 → 实际只造成 2 点（打不死），旧逻辑却判定死亡 ⇒ 白免反击。
        //   现在把**预测值**先过一遍减免：坚韧 −1、屏障归零（屏障生效后伤害为 0，同样打不死）。
        //   ⚠️ 这里只算"预测"，真正的扣减仍由第 3/4 段执行，避免两处状态互相污染。
        const blockerPredictedDamage = blockerBarrierActive
            ? 0
            : Math.max(0, damageToBlocker - (blocker.keywords.includes('Tough') ? 1 : 0));
        // 预测阻挡者是否会在这次打击中死亡（用减免后的真实伤害判定）
        const willBlockerDie = blockerRealHealth <= blockerPredictedDamage;
        // [2026-10-19 程] 碾压溢出必须用"减免后的真实伤害"（含坚韧 −1、屏障归零）
        //   与 blockerPredictedDamage 同源，避免两套减伤公式分叉（这正是本 bug 的成因）
        if (attacker.keywords.includes('Overwhelm')) {
            nexusDamage = Math.max(0, blockerPredictedDamage - blockerRealHealth);
        }
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
        //   ⚠️ 「是否还持有屏障」已在第 2 段之前统一判定为 attackerBarrierActive / blockerBarrierActive
        //   （必须排除 depletedKeywords，否则同一回合内刚被弹掉的屏障会替同一个单位再挡一次）
        if (attackerBarrierActive && attackerDamage > 0) {
            attackerDamage = 0;
            attackerBarrierPopped = true;
        }
        if (blockerBarrierActive && blockerDamage > 0) {
            blockerDamage = 0;
            blockerBarrierPopped = true;
        }

        // --- 5. Thorns (反伤) — [2026-09-04 莉莉子 补全] 防守反伤 ---
        // 反伤单位作为被攻击方（阻挡者）时，若确实受到实质物理伤害
        // （扣除自身坚韧/屏障后仍 >0），对攻击者回敬固定 1 点伤害。
        // 放最末尾：反伤是独立固定伤害，不参与双方后续的坚韧/屏障减免
        // （数值固定）。天然克制快攻——先攻/连击打刺杀不掉这点反弹。
        // [2026-10-19 程] 反伤双向：被打反、打过去挨反击也反
        //   ⚠️ 快照必须在任何 +=1 之前取：否则"先攻击杀阻挡者"时 attackerDamage 本为 0，
        //      会被阻挡者的反伤抬成 1 ⇒ 攻击者的反伤被自己的反伤骗触发，阻挡者凭空多掉 1 点
        const attackerTookRealDamage = attackerDamage > 0;
        const blockerTookRealDamage = blockerDamage > 0;
        if (blocker.keywords.includes('Thorns') && blockerTookRealDamage) attackerDamage += 1;
        if (attacker.keywords.includes('Thorns') && attackerTookRealDamage) blockerDamage += 1;
    }

    return { attackerDamage, blockerDamage, nexusDamage, attackerBarrierPopped, blockerBarrierPopped, quickAttackEphemeralDeath };
};

// ==========================================
// [Channel] 充能 — 恢复 1 点法术法力，触发后黯淡
// ==========================================
/**
 * 处理 Channel（充能）关键词：恢复 1 点法术法力，触发后追加 depletedKeywords
 * 玩家侧上限走 spellManaCapOf（基础 3 + 共鸣涌流成长 + 囤积提额），超出部分不累积；
 * 敌方侧上限固定 3（spellManaCapOf 读的是玩家侧养成/强化，不能用于敌方）
 * [2026-10-19 程] 此前写死 Math.min(3, ...)，强化提额后充能仍卡在 3（玩家侧）
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
        newGame.playerSpellMana = Math.min(spellManaCapOf(newGame), (newGame.playerSpellMana || 0) + 1);
        console.log(`[Channel] ${card.name} 充能：法术法力 ${before} → ${newGame.playerSpellMana}`);
    } else {
        const before = newGame.enemySpellMana;
        // [2026-10-19] 敌方充能上限**固定 3**：spellManaCapOf 读的是玩家侧养成/强化，
        //   直接用会让玩家的法力上限强化泄漏给敌方。敌方口径与回合末结转保持一致（core.ts / useRoundLifecycle）。
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
                depletedKeywords: [...(card.depletedKeywords || []), 'Channel' as Keyword],
            };
        }
        return card;
    });
    return { cards: updatedCards, count };
};

// ==========================================
// [Echo] 回响 — 打出并结算时，在手牌生成一张该牌的瞬逝复制品
// ==========================================
// 触发时机固定为"卡牌打出并结算后"（单位上场 / 法术结算后各接入一次）。
// 复制品追加 Volatile（瞬逝）关键词，与 keywordDetails 中"被强制附加易碎限制"的设定一致。
// 手牌已满（10张）时不再生成，防止爆牌。
// ==========================================
export interface EchoResult {
    hand: CardData[];
    echoedCards: CardData[]; // 本次生成的回响复制品（供调用方播放 DRAW_START 动画）
}

export const applyEchoOnPlay = (
    sourceCard: CardData,
    ownerHand: CardData[],
    _owner: 'player' | 'enemy', // [2026-08-16] 未使用，下划线前缀避免 TS6133
    /** [2026-10-08 第二波 · Q5] 本体已挂的装备 id（由调用方按方传入：玩家 = rogueEquipments / 敌方 = enemyEquipments） */
    equipIds?: string[],
): EchoResult => {
    if (!sourceCard.keywords.includes('Echo')) return { hand: ownerHand, echoedCards: [] };
    if (ownerHand.length >= 10) {
        console.log(`[Echo] 手牌已满，${sourceCard.name} 的回响复制品被销毁`);
        return { hand: ownerHand, echoedCards: [] };
    }

    // ── [Q5 程定稿] 复制品**继承装备**：与既有语义「装备按卡 key 生效、覆盖该卡所有副本」一致。
    //    不继承的话，「给带回响的法术装减费」会出现本体减费、复制品原价 —— 同卡副本行为不一致，玩家会当 BUG。
    // ── [G1 防递归] **跳过"提供 Echo 关键词"的装备**：
    //    否则给无 Echo 的法术装「誊抄副本」→ 复制品继承该装备 → 复制品也带 Echo → 无限繁殖。
    //    语义 = 一件回响装备只多一次施放（1→2），不滚雪球。
    // ── [G2] 只排除**装备来源**的 Echo，不动"卡面自带 Echo"的链式复制（既有的"回响复刻连绵不绝"，本次不改）。
    let copy = createCard(sourceCard.key);
    for (const id of equipIds ?? []) {
        const def = getEquipmentById(id);
        if (!def) continue;
        if (def.keywords?.includes('Echo')) continue; // G1
        copy = attachEquipment(copy, id);
    }
    const echoed = {
        ...copy,
        keywords: Array.from(new Set([...(copy.keywords || []), 'Volatile'])),
    } as CardData;

    console.log(`[Echo] ${sourceCard.name} 回响 → 手牌生成瞬逝复制品 ${echoed.name}`);
    return { hand: [...ownerHand, echoed], echoedCards: [echoed] };
};