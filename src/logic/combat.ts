import type { CardData, GameState, Keyword } from '../types';
import { checkCardLevelUp, getLeveledUpCard } from '../utils/gameRules';
import { calculateCombatInteraction } from './keywords'; // [新增]


// [新增] 单次战斗结果接口
export interface SingleCombatResult {
    updatedFight: { attacker: CardData, blocker: CardData | null, owner: 'player' | 'enemy' };
    attackerDamage: number;  // [修复] 攻击者承受的伤害（用于发射 unit_damage 事件）
    blockerDamage: number;   // [修复] 阻挡者承受的伤害（用于发射 unit_damage 事件）
    nexusDamage?: { target: 'player' | 'enemy', amount: number };
    levelUpUpdate?: CardData;
    killedUnits: CardData[];
}

export interface CombatResult {
    nextField: { attacker: CardData, blocker: CardData | null, owner: 'player' | 'enemy' }[];
    survivorsPlayer: CardData[];
    survivorsEnemy: CardData[];
    playerNexus: number;
    enemyNexus: number;
    nexusDmgInfo?: { target: 'player' | 'enemy', amount: number };
    levelUpCards: CardData[];
}

// [核心解锁] 将生命值探针暴露给外部，用于多段随机伤害的动态存活校验
export const getCurrentHP = (c: CardData) => c.health + (c.buffs?.health || 0) + (c.roundBuffs?.health || 0) - (c.damageTaken || 0);

// [新增] 计算单个槽位的战斗结果
export const resolveSingleCombat = (
    // [核心补全] 接收来自 effectProcessor 的空气墙标记 isGhostBlocked
    fight: { attacker: CardData, blocker: CardData | null, owner: 'player' | 'enemy', isGhostBlocked?: boolean },
    game: GameState
): SingleCombatResult => {
    const { attacker, blocker, owner, isGhostBlocked } = fight;

    // [核心防爆锁] 绝生死关：核验单位在物理碰撞前是否已死亡！
    const isAttackerDead = attacker.animState === 'dying' || attacker.animState === 'ephemeral_dying' || attacker.isDead || getCurrentHP(attacker) <= 0;
    const isBlockerDead = blocker && (blocker.animState === 'dying' || blocker.animState === 'ephemeral_dying' || blocker.isDead || getCurrentHP(blocker) <= 0);

    // 如果攻击者已死，直接终止其物理判定，不产生任何伤害与升级！
    if (isAttackerDead) {
        return {
            updatedFight: { ...fight },
            attackerDamage: 0,   // [修复] 补全接口字段
            blockerDamage: 0,    // [修复] 补全接口字段
            nexusDamage: undefined,
            killedUnits: [] // 已经在法术结算时记录过死亡，不再重复宣告
        };
    }

    // 初始化状态
    let newAttacker = { ...attacker, strikeCount: attacker.strikeCount + 1 };
    let newBlocker = blocker ? { ...blocker, strikeCount: isBlockerDead ? blocker.strikeCount : blocker.strikeCount + 1 } : null;

    // [僵尸缴械] 如果阻挡者已死，强制将其攻击力归零，确保无法挥出反击伤害！
    if (isBlockerDead && newBlocker) {
        newBlocker.power = -9999;
        if (newBlocker.buffs) newBlocker.buffs.power = 0;
    }

    let nexusDmgInfo = undefined;
    const killedUnits: CardData[] = [];
    let levelUpUpdate = undefined;

    // 检测是否有 Double Attack（连击）
    const hasDoubleAttack = newAttacker.keywords.includes('Double Attack');

    // ==========================================
    // 内部辅助：执行单次打击并累加伤害
    // ==========================================
    const executeStrike = (atk: CardData, blk: CardData | null, isQuickStrike: boolean, isGhosted: boolean) => {
      // 先攻打击：如果单位自身没有 QuickAttack，临时附加
      const strikeAtk = isQuickStrike && !atk.keywords.includes('QuickAttack')
        ? { ...atk, keywords: [...atk.keywords, 'QuickAttack' as Keyword] }
        : atk;

      const inter = calculateCombatInteraction(strikeAtk, blk);

      // 屏障破碎
      if (inter.attackerBarrierPopped) {
        atk.depletedKeywords = [...(atk.depletedKeywords || []), 'Barrier'];
      }
      if (blk && inter.blockerBarrierPopped) {
        blk.depletedKeywords = [...(blk.depletedKeywords || []), 'Barrier'];
      }

      // 伤害累加（绝不减 health，只记 damageTaken 欠条）
      if (blk) {
        blk.damageTaken = (blk.damageTaken || 0) + inter.blockerDamage;
      }
      atk.damageTaken = (atk.damageTaken || 0) + inter.attackerDamage;

      // 水晶伤害（空气墙过滤）
      let nexus = inter.nexusDamage;
      if (isGhosted && !atk.keywords.includes('Overwhelm')) {
        nexus = 0;
        console.log(`[Combat] 攻击被空气墙完全吸收！`);
      }

      return { nexusDmg: nexus, qaEphemeral: inter.quickAttackEphemeralDeath, atkDmg: inter.attackerDamage, blkDmg: inter.blockerDamage };
    };

    // ==========================================
    // 执行打击（无连击→一次，有连击→两次）
    // ==========================================
    let totalNexus = 0;
    let qaEphemeralDeath = false;
    let totalAttackerDmg = 0;
    let totalBlockerDmg = 0;

    // 第一击：如果连击则带先攻，否则按单位自身关键词
    const s1 = executeStrike(newAttacker, newBlocker, hasDoubleAttack || newAttacker.keywords.includes('QuickAttack'), isGhostBlocked ?? false);
    totalNexus += s1.nexusDmg;
    qaEphemeralDeath = s1.qaEphemeral;
    totalAttackerDmg += s1.atkDmg;
    totalBlockerDmg += s1.blkDmg;

    // 第二击：仅当连击且攻击者仍存活
    if (hasDoubleAttack && getCurrentHP(newAttacker) > 0) {
      const blkAfterFirst = newBlocker && getCurrentHP(newBlocker) > 0 ? newBlocker : null;
      const s2 = executeStrike(newAttacker, blkAfterFirst, false, false);
      totalNexus += s2.nexusDmg;
      totalAttackerDmg += s2.atkDmg;
      totalBlockerDmg += s2.blkDmg;

      // 第二击是普通攻击，不改变 qaEphemeralDeath（保留第一击的值）

      // 额外打击计数（初始化时 strikeCount 已 +1，这里再加 1）
      newAttacker.strikeCount = (newAttacker.strikeCount || 0) + 1;
      if (blkAfterFirst) {
        newBlocker!.strikeCount = (newBlocker!.strikeCount || 0) + 1;
      }
    }

    // 合并水晶伤害
    if (totalNexus > 0) {
      nexusDmgInfo = {
        target: (owner === 'player' ? 'enemy' : 'player') as 'player' | 'enemy',
        amount: totalNexus
      };
    }

    // 4. 升级判定 (简化版，仅检查攻击者)
    if (checkCardLevelUp(newAttacker, game.playerNexus, game.enemyNexus) && getCurrentHP(newAttacker) > 0) {
        const leveled = getLeveledUpCard(newAttacker);
        // [核心修复] 彻底删除 health 覆盖，并完美继承所有的运行时状态！
        newAttacker = {
            ...leveled,
            damageTaken: newAttacker.damageTaken,
            buffs: newAttacker.buffs,
            roundBuffs: newAttacker.roundBuffs,
            strikeCount: newAttacker.strikeCount,
            animState: newAttacker.animState
        };
        levelUpUpdate = newAttacker;
    }

    // 5. 死亡判定 [关键修复] 基于真实血量判断生死，[新增] 幻象(Ephemeral)的“打击后死亡”裁决
    // 攻击者只要参战就必定完成了打击，因此如果带有幻象必死
    const attackerDiesFromEphemeral = newAttacker.keywords.includes('Ephemeral');

    // [核心修正] 调换优先级：只要是瞬息触发的死亡，无视其是否承受了致命伤，强制播放专属消散演出！
    if (attackerDiesFromEphemeral) {
        newAttacker.animState = 'ephemeral_dying';
        killedUnits.push(newAttacker);
    } else if (getCurrentHP(newAttacker) <= 0) {
        newAttacker.animState = 'dying';
        killedUnits.push(newAttacker);
    } else {
        newAttacker.animState = 'hit';
    }

    if (newBlocker) {
        // 判定阻挡者是否挥出了常规反击：
        // 如果攻击者有先攻，且（阻挡者被秒杀了 OR 攻击者因幻象自己蒸发了），则阻挡者未能挥出反击
        // 如果是连击（Double Attack）：第二击是普通攻击，只要阻挡者活着就必定反击
        const blockerDidStrike = hasDoubleAttack
          ? getCurrentHP(newBlocker) > 0
          : !(newAttacker.keywords.includes('QuickAttack') && (getCurrentHP(newBlocker) <= 0 || qaEphemeralDeath));

        // 阻挡者触发幻象死亡的条件：它必须成功挥出了反击，且自身带有幻象
        const blockerDiesFromEphemeral = blockerDidStrike && newBlocker.keywords.includes('Ephemeral');

        if (blockerDiesFromEphemeral) {
            newBlocker.animState = 'ephemeral_dying';
            killedUnits.push(newBlocker);
        } else if (getCurrentHP(newBlocker) <= 0) {
            newBlocker.animState = 'dying';
            killedUnits.push(newBlocker);
        } else {
            newBlocker.animState = 'hit';
        }
    }

    return {
        updatedFight: { ...fight, attacker: newAttacker, blocker: newBlocker },
        attackerDamage: totalAttackerDmg,   // [修复] 透传受伤数据，供外层发射 unit_damage 事件
        blockerDamage: totalBlockerDmg,     // [修复] 透传受伤数据，供外层发射 unit_damage 事件
        nexusDamage: nexusDmgInfo,
        levelUpUpdate,
        killedUnits
    };
};


export const calculateCombatOutcome = (
    combatField: any[],
    game: GameState
): CombatResult => {
    let pNexus = game.playerNexus;
    let eNexus = game.enemyNexus;
    let nexusDmgInfo = undefined;

    const survivorsPlayer: CardData[] = [];
    const survivorsEnemy: CardData[] = [];
    const levelUpCards: CardData[] = [];

    // 1. 计算每一路战斗
    const nextField = combatField.map(fight => {
        const { attacker, blocker, owner } = fight;

        // [核心修复] 法术预击杀：攻击者在战斗结算前已被法术打死，不参与战斗
        // 不造成伤害、不承受反击；阻挡者解除任务，存活归位
        if (attacker.animState === 'dying' || attacker.animState === 'ephemeral_dying') {
            if (blocker) {
                const blockerSurvivor = { ...blocker, damageTaken: blocker.damageTaken || 0, animState: 'idle' as const };
                if (owner === 'player') survivorsEnemy.push(blockerSurvivor);
                else survivorsPlayer.push(blockerSurvivor);
            }
            return { ...fight, attacker: { ...attacker }, blocker: null };
        }

        // 深拷贝防止引用污染
        // [核心修复] 同样移除 damageTaken: 0，保留卡牌进入战斗前的真实血量状态！
        let newAttacker = { ...attacker, animState: 'hit', strikeCount: attacker.strikeCount + 1 };
        let newBlocker = blocker ? { ...blocker, animState: 'hit' } : null;

        // [修改] 调用关键词核心逻辑计算伤害结果
        // 这里统一处理了 直接攻击、阻挡、碾压(Overwhelm)、先攻(QuickAttack)
        const result = calculateCombatInteraction(newAttacker, newBlocker);

        // 1. 应用水晶伤害 (包含直接攻击和碾压溢出)
        if (result.nexusDamage > 0) {
            if (owner === 'player') {
                eNexus -= result.nexusDamage;
                nexusDmgInfo = { target: 'enemy', amount: result.nexusDamage };
            } else {
                pNexus -= result.nexusDamage;
                nexusDmgInfo = { target: 'player', amount: result.nexusDamage };
            }
        }

        // 2. 应用单位伤害 & 状态更新
        // [致命 Bug 修复] 绝不减 c.health，只累加 damageTaken
        if (result.attackerDamage > 0) {
            newAttacker.damageTaken = (newAttacker.damageTaken || 0) + result.attackerDamage;
        }
        // 屏障破碎，从关键词列表中移除
        if (result.attackerBarrierPopped) {
            newAttacker.keywords = newAttacker.keywords.filter((k: string) => k !== 'Barrier');
        }

        if (newBlocker) {
            if (result.blockerDamage > 0) {
                newBlocker.damageTaken = (newBlocker.damageTaken || 0) + result.blockerDamage;
            }
            // 屏障破碎，从关键词列表中移除
            if (result.blockerBarrierPopped) {
                newBlocker.keywords = newBlocker.keywords.filter((k: string) => k !== 'Barrier');
            }
        }

        // 升级检查
        if (checkCardLevelUp(newAttacker, pNexus, eNexus) && getCurrentHP(newAttacker) > 0) {
            const leveled = getLeveledUpCard(newAttacker);
            levelUpCards.push(leveled);
            // [核心修复] 让 2 级英雄使用自身的满额最大血量，并完美继承所有运行时状态
            newAttacker = {
                ...leveled,
                animState: 'hit',
                damageTaken: newAttacker.damageTaken,
                buffs: newAttacker.buffs,
                roundBuffs: newAttacker.roundBuffs,
                strikeCount: newAttacker.strikeCount
            };
        }
        if (newBlocker && checkCardLevelUp(newBlocker, pNexus, eNexus) && getCurrentHP(newBlocker) > 0) {
            const leveled = getLeveledUpCard(newBlocker);
            levelUpCards.push(leveled);
            // [核心修复] 阻挡者同理
            newBlocker = {
                ...leveled,
                animState: 'hit',
                damageTaken: newBlocker.damageTaken,
                buffs: newBlocker.buffs,
                roundBuffs: newBlocker.roundBuffs,
                strikeCount: newBlocker.strikeCount
            };
        }

        // 死亡标记 & 存活收集
        // [关键修复] 基于真实血量判断生死，[新增] 幻象(Ephemeral)的“打击后死亡”裁决
        const attackerDiesFromEphemeral = newAttacker.keywords.includes('Ephemeral');

        // [核心修正] 调换优先级：只要是瞬息触发的死亡，无视其是否承受致命伤，强制触发瞬息消散！
        if (attackerDiesFromEphemeral) {
            newAttacker.animState = 'ephemeral_dying';
        } else if (getCurrentHP(newAttacker) <= 0) {
            newAttacker.animState = 'dying';
        } else {
            // 存活：重置状态并收集 (绝对不要把 damageTaken 设为 0！)
            const survivor = { ...newAttacker, animState: 'idle' };
            // 根据 owner 判断归属：如果 owner是player，attacker就是player的
            if (owner === 'player') survivorsPlayer.push(survivor);
            else survivorsEnemy.push(survivor);
        }

        if (newBlocker) {
            const blockerDidStrike = !(newAttacker.keywords.includes('QuickAttack') && (getCurrentHP(newBlocker) <= 0 || result.quickAttackEphemeralDeath));
            const blockerDiesFromEphemeral = blockerDidStrike && newBlocker.keywords.includes('Ephemeral');

            // [核心修正] 阻挡者同样调换优先级
            if (blockerDiesFromEphemeral) {
                newBlocker.animState = 'ephemeral_dying';
            } else if (getCurrentHP(newBlocker) <= 0) {
                newBlocker.animState = 'dying';
            } else {
                // 存活：重置状态并收集 (绝对不要把 damageTaken 设为 0！)
                const survivor = { ...newBlocker, animState: 'idle' };
                // 如果 owner是player，blocker就是enemy的
                if (owner === 'player') survivorsEnemy.push(survivor);
                else survivorsPlayer.push(survivor);
            }
        }

        return { ...fight, attacker: newAttacker, blocker: newBlocker };
    });

    return {
        nextField,
        survivorsPlayer,
        survivorsEnemy,
        playerNexus: pNexus,
        enemyNexus: eNexus,
        nexusDmgInfo,
        levelUpCards
    };
};