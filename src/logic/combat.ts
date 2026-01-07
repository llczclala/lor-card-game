import type { CardData, GameState, Keyword } from '../types';
import { checkCardLevelUp, getLeveledUpCard } from '../utils/gameRules';
import { calculateCombatInteraction } from './keywords'; // [新增]


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

// [新增] 计算单个槽位的战斗结果
export const resolveSingleCombat = (
    fight: { attacker: CardData, blocker: CardData | null, owner: 'player' | 'enemy' },
    game: GameState
): SingleCombatResult => {
    const { attacker, blocker, owner } = fight;

    // 初始化状态
    let newAttacker = { ...attacker, strikeCount: attacker.strikeCount + 1, damageTaken: 0 };
    let newBlocker = blocker ? { ...blocker, strikeCount: blocker.strikeCount + 1, damageTaken: 0 } : null;

    let nexusDmgInfo = undefined;
    const killedUnits: CardData[] = [];
    let levelUpUpdate = undefined;

    // 1. 调用关键词逻辑计算伤害
    const interaction = calculateCombatInteraction(newAttacker, newBlocker);

    // 2. 应用伤害
    if (newBlocker) {
        newBlocker.health -= interaction.blockerDamage;
        newBlocker.damageTaken = interaction.blockerDamage;
        newAttacker.health -= interaction.attackerDamage;
        newAttacker.damageTaken = interaction.attackerDamage;
    }

    // 3. 溢出伤害或直接攻击
    if (interaction.nexusDamage > 0) {
        nexusDmgInfo = {
            target: (owner === 'player' ? 'enemy' : 'player') as 'player' | 'enemy',
            amount: interaction.nexusDamage
        };
    }

    // 4. 升级判定 (简化版，仅检查攻击者)
    if (checkCardLevelUp(newAttacker, game.playerNexus, game.enemyNexus)) {
        const leveled = getLeveledUpCard(newAttacker);
        newAttacker = { ...leveled, health: newAttacker.health, damageTaken: newAttacker.damageTaken };
        levelUpUpdate = newAttacker;
    }

    // 5. 死亡判定
    if (newAttacker.health <= 0) {
        newAttacker.animState = 'dying';
        killedUnits.push(newAttacker);
    } else {
        newAttacker.animState = 'hit';
    }

    if (newBlocker) {
        if (newBlocker.health <= 0) {
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
        let newAttacker = { ...attacker, animState: 'hit', strikeCount: attacker.strikeCount + 1, damageTaken: 0 };
        let newBlocker = blocker ? { ...blocker, animState: 'hit', damageTaken: 0 } : null;

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
        if (result.attackerDamage > 0) {
            newAttacker.health -= result.attackerDamage;
            newAttacker.damageTaken = (newAttacker.damageTaken || 0) + result.attackerDamage;
        }
        // [新增] 如果屏障破碎，移除关键词
        if (result.attackerBarrierPopped) {
            newAttacker.keywords = newAttacker.keywords.filter((k: Keyword) => k !== 'Barrier');
        }

        if (newBlocker) {
            if (result.blockerDamage > 0) {
                newBlocker.health -= result.blockerDamage;
                newBlocker.damageTaken = (newBlocker.damageTaken || 0) + result.blockerDamage;
            }
            // [新增] 如果屏障破碎，移除关键词
            if (result.blockerBarrierPopped) {
                newBlocker.keywords = newBlocker.keywords.filter((k: Keyword) => k !== 'Barrier');
            }
        }

        // 升级检查

        // 升级检查
        if (checkCardLevelUp(newAttacker, pNexus, eNexus)) {
            const leveled = getLeveledUpCard(newAttacker);
            levelUpCards.push(leveled);
            // 修复：不仅播放动画，还要把当前单位的数据真正替换成 LV2
            newAttacker = { ...leveled, animState: 'hit', damageTaken: 0 };
        }
        if (newBlocker && checkCardLevelUp(newBlocker, pNexus, eNexus)) {
            const leveled = getLeveledUpCard(newBlocker);
            levelUpCards.push(leveled);
            // 修复：阻挡者同理
            newBlocker = { ...leveled, animState: 'hit', damageTaken: 0 };
        }

        // 死亡标记 & 存活收集
        // 只有这里决定单位去留
        if (newAttacker.health <= 0) {
            newAttacker.animState = 'dying';
        } else {
            // 存活：重置状态并收集
            const survivor = { ...newAttacker, animState: 'idle', damageTaken: 0 };
            // 根据 owner 判断归属：如果 owner是player，attacker就是player的
            if (owner === 'player') survivorsPlayer.push(survivor);
            else survivorsEnemy.push(survivor);
        }

        if (newBlocker) {
            if (newBlocker.health <= 0) {
                newBlocker.animState = 'dying';
            } else {
                // 存活：重置状态并收集
                const survivor = { ...newBlocker, animState: 'idle', damageTaken: 0 };
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