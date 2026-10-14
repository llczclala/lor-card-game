// 关键修复：添加 type 关键字
import type { CardData, GameState } from '../types';
import { spellManaCapBonusOf, hoardSpellManaCapOf } from './questTracker';
import { getBuffById, getBattleEffects } from '../data/roguelike/buffs';

/**
 * [2026-09-25 莉莉子 强化线] 本场「法术法力池上限」：基础 3 + 共鸣涌流成长 + 囤积的溢出额度。
 *   这两件强化不改战斗内的即时效果，改的是**回合边界的资源规则** —— 所以统一在这里算，
 *   而"溢出多少"天然受剩余法力限制（上限抬高 ≠ 白送法力）。
 */
export const spellManaCapOf = (g: GameState): number =>
    3 + spellManaCapBonusOf(g.questProgress, g.rogueEnhancements) + hoardSpellManaCapOf(g.rogueEnhancements);

/**
 * [2026-09-29 莉莉子 收口] 从强化 id 列表里累加全部 `START_MANA_BONUS` 效果的 value。
 *   取代原先"写死只认 divfx_common_5 一个 id"的做法 —— 现在任何带该效果类的强化都自动生效
 *   （神格·潮汐 divfx_common_5 / 敌方先机三档 enemy_start_mana_1~3 共用此查询）。
 */
const sumStartManaBonus = (enhIds: string[] | undefined): number =>
    (enhIds ?? []).reduce((sum, id) => {
        const b = getBuffById(id);
        if (!b) return sum;
        // 走统一定义表：一条强化可能有多个效果（与 encounterBuilder.sumNexusBoost 同口径）
        for (const be of getBattleEffects(b)) {
            if (be.effectClass === 'START_MANA_BONUS') sum += (be.params?.value as number) ?? 0;
        }
        return sum;
    }, 0);

/**
 * [2026-09-28 莉莉子 神格神经 · ⑤ 固定槽] 我方「最大法力 +1」。
 * [2026-09-29 莉莉子] 改为通用扫描（不再只认 divfx_common_5 一个 id）。
 *   为什么必须走规则查询、而不是在 game_start 写值：
 *   `calculateRoundStart` 每回合把最大法力**由回合数从零重算**（min(10, round)），
 *   所以任何在 game_start 直接写 playerMaxMana 的做法都会在下一个回合边界被冲掉。
 *   与 `spellManaCapOf`（共鸣涌流 / 囤积）同一口径：规则类效果统一在这里算。
 */
export const startManaBonusOf = (g: GameState): number => {
    let bonus = sumStartManaBonus(g.rogueEnhancements);
    // [2026-09-28 莉莉子 神格神经 · 猫汐尔③ 莲脉增殖] 每召唤 1 个召唤衍生物 → 本场永久 +1
    //   计数由 rogueTrigger 的 MANA_PER_SUMMON_PERMANENT 写进 questProgress；这里只做"规则查询"
    //   （上限仍受 calculateRoundStart 里的 min(10, …) 约束，不会无限涨）
    if ((g.rogueEnhancements ?? []).includes('divfx_mauxir_3')) {
        // [2026-10-13 F3·L4] 读**玩家侧**那一份（本函数是玩家口径）——
        //   原实现读的是**无侧别**的共享键，敌方召唤会加到这里来。
        bonus += g.questProgress?.['div:mauxir:mana:player'] ?? 0;
    }
    return bonus;
};

/**
 * [2026-09-29 莉莉子] 敌方「最大法力 +N」——镜像 startManaBonusOf（我方口径）。
 *   载体为 `enemy_start_mana_1~3`（enemyEligible 专用，buffs.ts）。
 *   ⚠️ 与 `startManaBonusOf` 同属规则类效果：**必须走查询**，不能在 game_start 写值。
 */
export const enemyStartManaBonusOf = (g: GameState): number => sumStartManaBonus(g.enemyEnhancements);

/**
 * [2026-10-03 莉莉子 · 进攻标识三层分离 ①]
 * **追加一次进攻权**（备战 / 侦察关键词的唯一出口）。
 *
 * 语义（程 2026-10-03 拍板）：
 *   · **只看本回合** —— 给该侧"本回合还能再进攻一次"的权力；**跨回合由 `calculateRoundStart` 硬覆盖**，天然不累积。
 *   · **不覆盖已有标识** —— 该侧若已持 `normal`（正轮换到它）就保持 `normal`；
 *     只有"当前没有标识"（非奇偶方 / 刚进攻完被消耗）时才补一个 `rally`。
 *     ⚠️ 这条正是为了修掉老实现"把 `normal` 无条件改写成 `rally`"的副作用：
 *        那会让**侦察关键词的判据（曾用 token==='normal' 当代理指标）误判**。
 *
 * @param source 仅用于日志/排查（备战法术 / 狼群战术 / 侦察 等）
 */
export const grantExtraAttackTurn = (
    g: GameState,
    owner: 'player' | 'enemy',
    source?: string,
): GameState => {
    if (g.attackToken[owner]) return g; // 已有标识 ⇒ 不重复授予、也不改写类型
    console.log(`[AttackToken] 追加进攻权 → ${owner}（来源：${source ?? '未标注'}）`);
    // [2026-10-06 程拍板 · 序号去重] 每次**真正授予**都递增授予序号 ——
    //   `ON_GET_ATTACK_TOKEN`（安卡"获得进攻标识时"）的两个派发点按它去重：
    //   「`seq > handled` 才发、发完追平」⇒ **一次授予 = 一次派发**，不靠 prev 值 / 时间窗猜。
    const tokenGrantSeq = { player: 0, enemy: 0, ...(g.tokenGrantSeq ?? {}) };
    tokenGrantSeq[owner] = (tokenGrantSeq[owner] ?? 0) + 1;
    return { ...g, attackToken: { ...g.attackToken, [owner]: 'rally' }, tokenGrantSeq };
};

/**
 * 计算回合开始时的状态变更
 *
 * [2026-10-03 莉莉子 · 进攻标识三层分离 ①] **先手方收进本函数**：
 *   此前这里**写死「奇数=玩家」**，再靠外层两处补偿翻转（`useGameState` 开局覆盖 + `useRoundLifecycle` 每回合 swap）
 *   ⇒ 效果等价但**隐式**：任何绕过 `startRound` 的 token 写入都不在同一条坐标系里。
 *   现在直接按「**先手方占奇数回合**」算（程 2026-10-03 拍板口径），外层补偿一并删除。
 */
export const calculateRoundStart = (
    currentGame: GameState,
    firstAttacker: 'player' | 'enemy' = 'player',
): Partial<GameState> => {
    const prev = currentGame;
    const manaBonus = startManaBonusOf(prev);
    // [2026-09-29 莉莉子] 敌方开局法力强化（enemy_start_mana_*）→ 与玩家侧同口径，仅作用于敌方
    const enemyManaBonus = enemyStartManaBonusOf(prev);

    /** 先手方占奇数回合；后手方占偶数回合 */
    const oddOwner = firstAttacker;
    const evenOwner = oddOwner === 'player' ? 'enemy' : 'player';
    /** 侦察「每回合首次」标记：回合边界统一清零（与进攻标识同批重置） */
    const freshScoutFlag = { player: false, enemy: false };

    // 如果是第0回合(初始化)，直接跳到第1回合
    if (prev.round === 0) {
        return {
            round: 1,
            playerMaxMana: 1 + manaBonus, playerMana: 1 + manaBonus, playerSpellMana: 0,
            enemyMaxMana: 1 + enemyManaBonus, enemyMana: 1 + enemyManaBonus, enemySpellMana: 0,
            attackToken: { player: oddOwner === 'player' ? 'normal' : null, enemy: oddOwner === 'enemy' ? 'normal' : null },
            turnOwner: oddOwner,
            phase: 'main',
            consecutivePasses: 0,
            scoutUsedThisRound: freshScoutFlag,
            // [2026-10-06 独立审查修复 · 跨局泄漏] 授予账本是**对局级**的 ⇒ 每场开局（round 0 → 1）清零，
            //   否则上一局遗留的 `seq > handled` 会在新局回合 1 触发一次**凭空的**「获得进攻标识时」。
            tokenGrantSeq: { player: 0, enemy: 0 },
            tokenGrantHandled: { player: 0, enemy: 0 },
        };
    }

    const newRound = prev.round + 1;
    const newPlayerMaxMana = Math.min(10, newRound + manaBonus); // [2026-09-28 神格神经 ⑤] 我方 +1（仅我方）
    // [2026-09-29 莉莉子] 敌方最大法力同样受己方加成，上限仍钳在 10
    const newEnemyMaxMana = Math.min(10, newRound + enemyManaBonus);
    const tokenOwner = newRound % 2 !== 0 ? oddOwner : evenOwner; // 先手方占奇数回合
    // [修改] 根据回合归属，分配 'normal' 标识，另一方清空
    const nextAttackToken = {
        player: tokenOwner === 'player' ? 'normal' : null,
        enemy: tokenOwner === 'enemy' ? 'normal' : null
    };


    // 法力值存贮逻辑：多余 Mana 转入 Spell Mana（[2026-09-25 莉莉子 强化线] 上限由 spellManaCapOf 动态给出：共鸣涌流成长 / 囤积提额）
    const nextPlayerSpellMana = Math.min(spellManaCapOf(prev), prev.playerSpellMana + prev.playerMana);
    const nextEnemySpellMana = Math.min(3, prev.enemySpellMana + prev.enemyMana);

    return {
        round: newRound,
        playerMaxMana: newPlayerMaxMana,
        playerMana: newPlayerMaxMana, // 补满普通 Mana
        playerSpellMana: nextPlayerSpellMana,
        enemyMaxMana: newEnemyMaxMana,
        enemyMana: newEnemyMaxMana, // 补满普通 Mana
        enemySpellMana: nextEnemySpellMana,
        attackToken: nextAttackToken as any, // 这里的 as any 是为了防止TS类型推断还没更新时的临时报错，实际类型已匹配
        turnOwner: tokenOwner,
        phase: 'main',
        consecutivePasses: 0,
        scoutUsedThisRound: freshScoutFlag,
    };
};

/**
 * 检查是否买得起卡牌
 */
export const canAfford = (card: CardData, mana: number, spellMana: number, effectiveCost?: number) => {
    const cost = effectiveCost ?? card.cost;
    if (card.type.includes('unit')) return mana >= cost;
    return (mana + spellMana) >= cost;
};

/**
 * 计算扣费后的法力值
 */
export const calculateManaCost = (card: CardData, currentMana: number, currentSpellMana: number) => {
    let m = currentMana;
    let sm = currentSpellMana;
    const cost = card.cost;

    if (card.type.includes('spell')) {
        const usedSm = Math.min(cost, sm);
        sm -= usedSm;
        m -= (cost - usedSm);
    } else {
        m -= cost;
    }
    // [2026-07-22 莉莉子] 保险钳制：法力值不允许低于 0
    return { newMana: Math.max(0, m), newSpellMana: Math.max(0, sm) };
};