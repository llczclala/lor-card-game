import type { CardData, GameState, Keyword } from '../types';
import { checkCardLevelUp, getLeveledUpCard } from '../utils/gameRules';
import { calculateCombatInteraction } from './keywords'; // [新增]
import { eventBus, GameEvents } from '../utils/eventBus'; // [新增] 引入事件总线


// [新增] 单次战斗结果接口
export interface SingleCombatResult {
    updatedFight: { attacker: CardData, blocker: CardData | null, owner: 'player' | 'enemy' };
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

const getCurrentHP = (c: CardData) => c.health + (c.buffs?.health || 0) - (c.damageTaken || 0);

// [新增] 计算单个槽位的战斗结果
export const resolveSingleCombat = (
    // [核心补全] 接收来自 effectProcessor 的空气墙标记 isGhostBlocked
    fight: { attacker: CardData, blocker: CardData | null, owner: 'player' | 'enemy', isGhostBlocked?: boolean },
    game: GameState
): SingleCombatResult => {
    const { attacker, blocker, owner, isGhostBlocked } = fight;

    // 初始化状态
    // [核心修复] 移除 damageTaken: 0，让 ...attacker 和 ...blocker 自然继承之前的旧伤！
    let newAttacker = { ...attacker, strikeCount: attacker.strikeCount + 1 };
    let newBlocker = blocker ? { ...blocker, strikeCount: blocker.strikeCount + 1 } : null;

    let nexusDmgInfo = undefined;
    const killedUnits: CardData[] = [];
    let levelUpUpdate = undefined;

    // 1. 调用关键词逻辑计算伤害
    const interaction = calculateCombatInteraction(newAttacker, newBlocker);

    // [改造] 物理破盾法则：如果护盾抵挡了伤害，将 'Barrier' 标记为黯淡而非移除
    if (interaction.attackerBarrierPopped) {
        newAttacker.depletedKeywords = [...(newAttacker.depletedKeywords || []), 'Barrier'];
    }
    if (newBlocker && interaction.blockerBarrierPopped) {
        newBlocker.depletedKeywords = [...(newBlocker.depletedKeywords || []), 'Barrier'];
    }

    // [致命 Bug 修复] 绝不减 c.health，只累加 damageTaken
    if (newBlocker) {
        newBlocker.damageTaken = (newBlocker.damageTaken || 0) + interaction.blockerDamage;
        newAttacker.damageTaken = (newAttacker.damageTaken || 0) + interaction.attackerDamage;
    }

    // 3. 溢出伤害或直接攻击
    let finalNexusDamage = interaction.nexusDamage;

    // [核心修复] 空气墙 (Ghost Blocker) 机制生效！
    // 逻辑：如果这路交锋被空气墙阻挡，且攻击者没有【碾压】(Overwhelm)，则水晶受到 0 点伤害！
    if (isGhostBlocked && !newAttacker.keywords.includes('Overwhelm')) {
        finalNexusDamage = 0;
        console.log(`[Combat] 攻击被空气墙完全吸收！`);
    }

    if (finalNexusDamage > 0) {
        nexusDmgInfo = {
            target: (owner === 'player' ? 'enemy' : 'player') as 'player' | 'enemy',
            amount: finalNexusDamage
        };
    }

    // 4. 升级判定 (简化版，仅检查攻击者)
    if (checkCardLevelUp(newAttacker, game.playerNexus, game.enemyNexus)) {
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
        const blockerDidStrike = !(newAttacker.keywords.includes('QuickAttack') && (getCurrentHP(newBlocker) <= 0 || interaction.quickAttackEphemeralDeath));

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
        // [改造] 如果屏障破碎，标记黯淡而非移除
        if (result.attackerBarrierPopped) {
            newAttacker.depletedKeywords = [...(newAttacker.depletedKeywords || []), 'Barrier'];
        }

        if (newBlocker) {
            if (result.blockerDamage > 0) {
                newBlocker.damageTaken = (newBlocker.damageTaken || 0) + result.blockerDamage;
            }
            // [改造] 如果屏障破碎，标记黯淡而非移除
            if (result.blockerBarrierPopped) {
                newBlocker.depletedKeywords = [...(newBlocker.depletedKeywords || []), 'Barrier'];
            }
        }

        // 升级检查
        if (checkCardLevelUp(newAttacker, pNexus, eNexus)) {
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
        if (newBlocker && checkCardLevelUp(newBlocker, pNexus, eNexus)) {
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