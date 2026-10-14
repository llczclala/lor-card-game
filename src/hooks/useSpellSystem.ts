import { useState } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import type { CardData, GameState, SpellStackItem, Race, Keyword } from '../types';
import { EFFECT_DB } from '../data/effectRegistry';
import type { TargetType } from '../data/effectRegistry';
import { eventBus, GameEvents } from '../utils/eventBus';
import { executeSpellEffect } from '../logic/spells';
// [2026-10-03 莉莉子 · P0 收口] "等升级播完"的唯一实现（原先本文件与 useGameState 各一份）
import { awaitLevelUpDrain as awaitLevelUpDrainCore } from '../utils/levelUpDrain';
import { applyEchoOnPlay } from '../logic/keywords'; // [2026-08-06 莉莉子] Echo 回响
import { runEnemySpellCastBeats } from '../utils/spellCastBeats'; // [2026-09-19 方案C] AI 施法三拍
import { noteSpellCast, getSpellCastSnapshot } from '../utils/gameRules'; // [2026-10-08 第二波] 施法计数（条件减费判据）· [2026-10-12] + 施法前基准
import { nextAnimId } from '../utils/animId'; // [2026-09-04 莉莉子] 全局唯一动画 ID（替代 Date.now()，修抽卡动画 key 撞车）
import { CARD_DB } from '../data/cards';
import { calculateNewMana, getEffectiveSpellCost, getChoiceCardCost, CHOICE_FLYING_SWORD_DISCOUNT_KEYS, buffTopUnitInDeck, getLeveledUpCard, isLeveledUpForSide } from '../utils/gameRules'; // [2026-10-12] + 抉择算价唯一入口
import { attachEquipment } from '../data/equipment'; // [2026-10-04 莉莉子 BUG修复] 法术回库生成的英雄副本要补挂装备/武装
import { StrikeEvents } from '../utils/eventBus'; // [新增] 引入全新的打击信号总线
import { getCurrentHP } from '../logic/combat'; // [新增] 引入真实血量探针
import { getFlyingSwordOwner, getDefensiveSide, getExtraAttackOwner } from '../logic/combat'; // [2026-08-24 莉莉子 飞剑竞态根治] 飞剑判定工具 · [2026-09-26 T17] 额外攻击判定
import { applyPermanentBuff, getEquipTriggers } from '../logic/rogueBattle'; // [2026-08-19] 迷宫强化分发（分发已收编 rogueTrigger）
import { runRogueTrigger, type RogueTriggerCtx, type Side } from '../logic/rogueTrigger'; // [2026-09-09 重构] 迷宫强化统一串行触发引擎
import { bumpAnimProgress } from '../utils/animGuard'; // [2026-09-03] animating 停滞看门狗心跳

/**
 * [2026-09-19 1.0.16 茉莉安] 是否为「连斩类」法术（目前只有「最终指令」）。
 *
 * 用途：**跳过通用弹道** —— 连斩的演出由 `UltimateStrikeLayer` 逐击全权负责。
 * 不跳过的话，玩家指定的**首击**会被那发通用飞弹顶掉（后续续击才是专属特效），
 * 表现为「第一击是默认特效、后面才是大招特效」。
 *
 * ⚠️ 判据取「效果类 == CHAIN_STRIKE」而非写死卡 key：将来复用该类的新卡自动生效。
 */
const isChainStrikeSpell = (card: CardData | null | undefined): boolean =>
    !!card && (card.effects || []).some(id => EFFECT_DB[id]?.class === 'CHAIN_STRIKE');

// ==========================================
// [时间管理器] 独立封装的纯函数，等待通用打击特效播完
// ==========================================
export const waitForStrikeComplete = (timeoutMs: number = 3000): Promise<void> => {
    return new Promise((resolve) => {
        let resolved = false;
        const onEnd = () => {
            if (resolved) return;
            resolved = true;
            eventBus.off(StrikeEvents.COMPLETE, onEnd);
            resolve();
        };
        eventBus.on(StrikeEvents.COMPLETE, onEnd);
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                eventBus.off(StrikeEvents.COMPLETE, onEnd);
                resolve();
            }
        }, timeoutMs);
    });
};

/** [2026-07-30 AI抉择] 根据效果定义自动选取合法目标 */
function findAITargetsForEffect(
    effectDef: typeof EFFECT_DB[string],
    owner: 'player' | 'enemy',
    state: {
        game: GameState;
        playerBench: CardData[];
        enemyBench: CardData[];
        combatField: any[];
    }
): any[] {
    const targets: any[] = [];
    if (!effectDef.targetRequirements || effectDef.targetRequirements.length === 0) return targets;

    const isAI = owner === 'enemy';
    const friendlyBench = isAI ? state.enemyBench : state.playerBench;
    const hostileBench = isAI ? state.playerBench : state.enemyBench;

    for (const req of effectDef.targetRequirements) {
        const type = req.type;
        const filterKey = req.filterKey;
        const count = req.count || 1;
        let candidates: CardData[] = [];

        if (type === 'ALLY_CHAMPION' || type === 'ALLY_UNIT') {
            candidates = [...friendlyBench];
            state.combatField.forEach(f => {
                if (f.owner === owner && f.attacker) candidates.push(f.attacker);
                if (f.blocker) {
                    // blocker belongs to whoever controls it — check field ownership
                    // Actually, blocker is assigned to the non-attacker side
                    if (f.owner !== owner && f.blocker) candidates.push(f.blocker);
                }
            });
            if (filterKey) {
                candidates = candidates.filter(c => c.key?.toLowerCase().includes(filterKey.toLowerCase()));
            }
            if (type === 'ALLY_CHAMPION') {
                candidates = candidates.filter(c => c.isChampion);
            }
        } else if (type === 'ENEMY_UNIT') {
            candidates = [...hostileBench];
            state.combatField.forEach(f => {
                if (f.owner !== owner && f.attacker) candidates.push(f.attacker);
                if (f.blocker && f.owner === owner) candidates.push(f.blocker);
            });
            // [2026-08-16 莉莉子] 删除 'ENEMY_CHAMPION' 幽灵分支：TargetType 仅 ALLY_CHAMPION，`type === 'ENEMY_CHAMPION'` 永假（TS2367 死代码）
        } else if (type === 'ANY_UNIT') {
            candidates = [...friendlyBench, ...hostileBench];
            state.combatField.forEach(f => {
                if (f.attacker && !candidates.some(c => c.id === f.attacker!.id)) candidates.push(f.attacker);
                if (f.blocker && !candidates.some(c => c.id === f.blocker!.id)) candidates.push(f.blocker);
            });
        }

        // 去重 + 取前 count 个
        const seen = new Set<string>();
        const picked = candidates.filter(c => {
            if (seen.has(c.id)) return false;
            seen.add(c.id);
            return true;
        }).slice(0, count).map(c => ({
            id: c.id,
            key: c.key,
            type: c.type,
            entityType: type,
        }));
        targets.push(...picked);

        if (picked.length < count) {
            console.warn(`[AI抉择] 目标类型 ${type} 仅找到 ${picked.length}/${count} 个合法目标`);
        }
    }

    return targets;
}

export interface UseSpellSystemParams {
    stateRef: MutableRefObject<{
        game: GameState;
        playerBench: CardData[];
        enemyBench: CardData[];
        combatField: any[];
        playerHand: CardData[];
        enemyHand: CardData[];
        playerDeck: CardData[];
        enemyDeck: CardData[];
    }>;
    game: GameState;
    playerBench: CardData[];

    setGame: Dispatch<SetStateAction<GameState>>;
    setPlayerBench: Dispatch<SetStateAction<CardData[]>>;
    setEnemyBench: Dispatch<SetStateAction<CardData[]>>;
    setCombatField: Dispatch<SetStateAction<any[]>>;
    setPlayerHand: Dispatch<SetStateAction<CardData[]>>;
    setEnemyHand: Dispatch<SetStateAction<CardData[]>>;
    setPlayerDeck: Dispatch<SetStateAction<CardData[]>>;
    setEnemyDeckState: Dispatch<SetStateAction<CardData[]>>;
    setMessage: Dispatch<SetStateAction<string>>;

    createFullCard: (key: string, side: 'player' | 'enemy') => CardData;
    flushMicroQueue: () => boolean;
    judgeLifeAndDeath: () => void;  // [SBA] 生死簿同步判决
    wait: (ms: number) => Promise<void>;
    triggerShake: () => void;

    onComplete: (card: CardData, targets: any[]) => void;

    /**
     * [2026-10-04 莉莉子 BUG修复 · I3a] 该方"卡 key → 装备/武装 id 列表"表。
     * 用途：`grantChampionSpellCopy`（法术回库生成英雄副本）要给新副本**补挂装备/武装** ——
     *   程口径：「法术回库生成的英雄副本应该要带装备」。
     * ⚠️ 与 useGameState 的 `rogueEquipments` / `enemyEquipments` 同源、按方传入。
     * ⚠️ GameSession 的 UI 层实例**不传**（undefined）⇒ 那边行为与改动前逐字一致。
     */
    playerEquipments?: Record<string, string[]>;
    enemyEquipments?: Record<string, string[]>;

    /**
     * [2026-10-02 莉莉子] 棋盘快照读取器 —— **仅供"目标不足时放宽"使用**。
     *
     * 背景：本 hook 在本项目有**两个实例**：
     *   · useGameState 层：完整传参（含 stateRef）
     *   · GameSession UI 层：**只传 onComplete**，其余全 undefined（`as` 强转绕过类型）
     * 而游戏内的目标点击恰恰走 UI 层 ⇒ 它拿不到棋盘数据 ⇒ 无法判断"还剩几个可选目标"。
     *
     * ⚠️ 刻意不复用 stateRef：那会激活 `handleTargetClick` 顶部那条
     *    原本在 UI 层被跳过的 `select_discard` 分支，属于会改变既有行为的风险改动。
     *    本参数是**纯新增**，除了下面那处放宽判定，没有任何代码读它。
     */
    boardSnapshot?: () => { playerBench: CardData[]; enemyBench: CardData[]; combatField: any[] };

    /**
     * [2026-10-04 莉莉子] 水晶血量快照读取器 —— **仅供「生机补充」满血屏蔽（ally_not_full）判定使用**。
     *
     * 背景与 boardSnapshot 完全同源：玩家点击走的是 **GameSession UI 层实例**，
     *   那个实例刻意不传 `stateRef`（见上方注释：复用 stateRef 会激活 UI 层原本跳过的
     *   高风险分支）⇒ 它读不到 `game.playerNexus` ⇒ 满血水晶挡不住。
     *
     * ⚠️ 纯新增参数：除 `readNexusHp` 外没有任何代码读它；
     *   UI 层不传时自动回落 `stateRef`（useGameState 层本来就有）。
     */
    nexusSnapshot?: () => { player: number; playerMax: number; enemy: number; enemyMax: number };

    /**
     * [2026-10-04 莉莉子] 非法目标反馈通道。
     *
     * 此前 `handleTargetClick` 点到不合法目标时**只有 `console.log("Invalid target")`**，
     *   玩家屏幕上零反馈（"点了没反应"），这正是「生机补充」白花 2 费的体验源头。
     *
     * ⚠️ 刻意不给 UI 层传 `setMessage`：那会顺带激活本 hook 内其他 setMessage 调用点
     *   （HAND_CARD 提示 / startSpellCasting / 艾娃光环），属于**范围外**的行为变化。
     */
    onInvalidTarget?: (message: string) => void;
}

export const useSpellSystem = (params: UseSpellSystemParams) => {
    const {
        stateRef, game,
        setGame, setPlayerBench, setEnemyBench, setCombatField,
        setPlayerHand, setEnemyHand, setPlayerDeck, setEnemyDeckState,
        setMessage, createFullCard, flushMicroQueue, judgeLifeAndDeath, wait, triggerShake, onComplete,
        playerEquipments, enemyEquipments,
        onInvalidTarget
    } = params;
    // 正在施放的卡牌
    const [castingCard, setCastingCard] = useState<CardData | null>(null);
    // 当前处于第几步 (从 0 开始)
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    // 已选定的目标列表
    const [selectedTargets, setSelectedTargets] = useState<any[]>([]);

    // 辅助：获取当前卡牌的效果定义
    const getEffectDef = (card: CardData) => {
        if (!card.effects || card.effects.length === 0) return null;
        return EFFECT_DB[card.effects[0]];
    };

    // [2026-07-21] 根据 ID 在全场查找单位（备战席/战场/手牌）
    const findUnitById = (id: string): CardData | null => {
        const { playerBench, enemyBench, combatField, playerHand, enemyHand } = stateRef.current;
        let unit: CardData | undefined;
        unit = playerBench.find(c => c.id === id); if (unit) return unit;
        unit = enemyBench.find(c => c.id === id); if (unit) return unit;
        if (combatField) {
            for (const fight of combatField) {
                if (fight.attacker?.id === id) return fight.attacker;
                if (fight.blocker?.id === id) return fight.blocker;
            }
        }
        unit = playerHand?.find(c => c.id === id); if (unit) return unit;
        unit = enemyHand?.find(c => c.id === id); if (unit) return unit;
        return null;
    };

    // [2026-07-21] 判断某个 ID 的单位属于哪一方
    const getUnitOwner = (id: string): 'player' | 'enemy' => {
        const { playerBench, enemyBench, combatField } = stateRef.current;
        if (playerBench.some(c => c.id === id)) return 'player';
        if (enemyBench.some(c => c.id === id)) return 'enemy';
        if (combatField) {
            for (const f of combatField) {
                if (f.attacker?.id === id) return f.owner;
                if (f.blocker?.id === id) return f.owner === 'player' ? 'enemy' : 'player';
            }
        }
        return 'player';
    };

    // [2026-07-21] 卡牌状态快照
    const captureSnapshot = (card: CardData) => ({
        power: card.power || 0,
        health: card.health || 0,
        maxHealth: card.maxHealth || card.health || 0,
        damageTaken: card.damageTaken || 0,
        buffs: card.buffs ? { health: card.buffs.health, power: card.buffs.power } : undefined,
        roundBuffs: card.roundBuffs ? { health: card.roundBuffs.health, power: card.roundBuffs.power } : undefined,
    });

    // [2026-07-21] 扫描全场单位 ID（备战席 + 战场）
    const collectFieldUnitIds = (): string[] => {
        const { playerBench, enemyBench, combatField } = stateRef.current;
        const ids: string[] = [];
        playerBench.forEach(c => { if (c.id) ids.push(c.id); });
        enemyBench.forEach(c => { if (c.id) ids.push(c.id); });
        if (combatField) {
            combatField.forEach((f: any) => {
                if (f.attacker?.id) ids.push(f.attacker.id);
                if (f.blocker?.id) ids.push(f.blocker.id);
            });
        }
        return ids;
    };

    // [2026-07-21] 从快照 Map 计算所有变化 → 生成实体数组
    const computeChangesFromMap = (
        map: Map<string, { damageTaken: number; buffsH: number; buffsP: number; roundH: number; roundP: number; keywords: string[] }>
    ): import('../types').RecordEntity[] => {
        const entities: import('../types').RecordEntity[] = [];
        for (const [id, before] of map) {
            const after = findUnitById(id);
            if (!after) continue;

            const changes: import('../types').RecordChange[] = [];
            const dmgDelta = (after.damageTaken || 0) - before.damageTaken;
            if (dmgDelta > 0) changes.push({ type: 'damage', value: dmgDelta });
            const healDelta = before.damageTaken - (after.damageTaken || 0);
            if (healDelta > 0) changes.push({ type: 'heal', value: healDelta });

            const nowH = (after.buffs?.health || 0) + (after.roundBuffs?.health || 0);
            const befH = before.buffsH + before.roundH;
            if (nowH - befH > 0) changes.push({ type: 'buff_health', value: nowH - befH });

            const nowP = (after.buffs?.power || 0) + (after.roundBuffs?.power || 0);
            const befP = before.buffsP + before.roundP;
            const pwD = nowP - befP;
            if (pwD > 0) changes.push({ type: 'buff_power', value: pwD });
            if (pwD < 0) changes.push({ type: 'debuff_power', value: Math.abs(pwD) });

            const newKws = (after.keywords || []).filter(k => !before.keywords.includes(k));
            for (const kw of newKws) changes.push({ type: 'gain_keyword', keyword: kw });

            if (changes.length > 0) {
                entities.push({
                    cardKey: after.key,
                    owner: getUnitOwner(id),
                    damageTaken: dmgDelta > 0 ? dmgDelta : undefined,
                    died: after.isDead || after.animState === 'dying' || getCurrentHP(after) <= 0,
                    snapshot: captureSnapshot(after),
                    changes,
                });
            }
        }
        return entities;
    };

    // [2026-07-21] 全单位快照类型
    type UnitSnapshot = { damageTaken: number; buffsH: number; buffsP: number; roundH: number; roundP: number; keywords: string[] };

    // [2026-07-21] 捕获全场单位的快照 Map
    const snapshotAllFieldUnits = (): Map<string, UnitSnapshot> => {
        const map = new Map<string, UnitSnapshot>();
        for (const id of collectFieldUnitIds()) {
            const u = findUnitById(id);
            if (u) map.set(id, {
                damageTaken: u.damageTaken || 0,
                buffsH: u.buffs?.health || 0, buffsP: u.buffs?.power || 0,
                roundH: u.roundBuffs?.health || 0, roundP: u.roundBuffs?.power || 0,
                keywords: [...(u.keywords || [])],
            });
        }
        return map;
    };

    // --- 1. 开始施法 ---
    // ★ 选择模式基础框架 — 每个选择模式都通过此函数激活 spellSystem 视觉层
    //    有效果定义的卡：进入目标选择模式（瞄准线/高亮）
    //    无效果定义的卡（如 select_bench 的单位）：仅激活视觉层（卡牌居中/播报文字/瞄准线）
    const startCasting = (card: CardData, skipAutoComplete?: boolean) => {
        const effect = getEffectDef(card);
        if (!effect) {
            // [2026-07-20] 无效果定义的卡（如替换打出的单位）：仍然激活视觉层
            setCastingCard(card);
            setCurrentStepIndex(0);
            setSelectedTargets([]);
            return;
        }

        // 如果没有目标需求，直接完成 (自动施法)
        // 但 skipAutoComplete 时跳过，由调用方控制完成时机
        if (effect.targetRequirements.length === 0 && !skipAutoComplete) {
            onComplete(card, []);
        } else {
            // 进入选择模式
            setCastingCard(card);
            setCurrentStepIndex(0);
            setSelectedTargets([]);
        }
    };

    // --- 2. 取消施法 ---
    const cancelCasting = () => {
        setCastingCard(null);
        setCurrentStepIndex(0);
        setSelectedTargets([]);
    };

    // =============================================
    // [2026-10-04 莉莉子] 水晶血量读取（「生机补充」满血屏蔽专用）
    // 数据源优先级与 boardSnapshot 同思路：
    //   ① UI 层补传的 nexusSnapshot（玩家点击路径，该实例刻意无 stateRef）
    //   ② stateRef.current.game（useGameState 层，本来就有）
    // ⚠️ 都拿不到 ⇒ 返回 null，调用方按"放行"处理 ——
    //    绝不因为读不到血量而误锁玩家目标（宁可漏挡，不可错杀）。
    // =============================================
    const readNexusHp = (owner: 'player' | 'enemy'): { current: number; max: number } | null => {
        const snap = params.nexusSnapshot?.();
        if (snap) {
            return owner === 'player'
                ? { current: snap.player, max: snap.playerMax }
                : { current: snap.enemy, max: snap.enemyMax };
        }
        const g = stateRef ? stateRef.current?.game : undefined;
        if (g) {
            // 上限口径与 effectProcessor:3158 逐字一致（缺省 20 = NEXUS_MAX_HP）
            const max = (owner === 'player' ? g.playerNexusMax : g.enemyNexusMax) ?? 20;
            const current = owner === 'player' ? g.playerNexus : g.enemyNexus;
            return { current, max };
        }
        return null;
    };

    // --- 3. 核心：验证目标是否合法 ---
    // 这是一个纯逻辑判断，用于决定点击是否有效，以及是否显示高亮框
    const isValidTarget = (
        card: CardData | 'nexus',
        owner: 'player' | 'enemy',
        reqType: TargetType,
        filterKey?: string,
        targetCondition?: string, // [核心新增] 接收目标高级过滤暗号
        raceFilter?: Race[],       // [新增] 种族过滤器
        keywordFilter?: string[],   // [2026-07-07] 关键词过滤
        stackCostBelow?: number,    // [2026-08-05 莉莉子] SPELL_ON_STACK 目标费用上限（不含）
        stackSpeedFilter?: string[] // [2026-08-05 莉莉子] SPELL_ON_STACK 目标速度白名单
    ): boolean => {
        if (card === 'nexus') {
            // [2026-06-27 生机补充] ally_only 时我方水晶可被选，敌方不可
            // [2026-10-04 莉莉子] ally_not_full = ally_only ∪ 「满血水晶不可选」
            if (targetCondition === 'ally_only' || targetCondition === 'ally_not_full') {
                const isOwnNexus = (reqType === 'PLAYER_NEXUS' && owner === 'player') ||
                       (reqType === 'ENEMY_NEXUS' && owner === 'enemy') ||
                       (reqType === 'ANY_TARGET' && owner === 'player');
                if (!isOwnNexus) return false;
                // 满血屏蔽：水晶治疗量 = min(nexusMax - current, amount)
                // （effectProcessor:3159），已满 ⇒ 恒为 0 ⇒ 放行就是让玩家白花一张牌
                if (targetCondition === 'ally_not_full') {
                    const hp = readNexusHp(owner);
                    if (hp && hp.current >= hp.max) return false;
                }
                return true;
            }
            if (targetCondition) return false; // 其他条件水晶不参与判定
            return (reqType === 'PLAYER_NEXUS' && owner === 'player') ||
                   (reqType === 'ENEMY_NEXUS' && owner === 'enemy') ||
                   reqType === 'ANY_TARGET';
        }

        const isAlly = owner === 'player';
        const isEnemy = owner === 'enemy';

		// [2026-06-27 暗箱操作] HAND_CARD 跳过存活检查（手牌法术 health=0 会误杀）
		if (reqType === 'HAND_CARD') {
			return true;
		}

// [SBA] 基础存活检查 (尸体不能作为目标)
        // [2026-08-08 莉莉子修复] 仅单位需要存活判定——法术卡 health=0 会被 getCurrentHP 误判为死亡，
        // 导致 SPELL_ON_STACK（反制栈上法术）等以法术为目标的选择永远被拦下（点不动敌方法术）
        if (card.type?.includes('unit') && (card.isDead || getCurrentHP(card) <= 0)) return false;

        // =====================================
        // [核心新增] 种族拦截器 (Race Filter)
        // =====================================
        if (raceFilter && raceFilter.length > 0) {
            if (!card.race || !card.race.some(r => raceFilter.includes(r))) {
                return false; // 种族不符，不可选
            }
        }

        // =====================================
        // [2026-07-07 新增] 关键词过滤器 (Keyword Filter)
        // =====================================
        if (keywordFilter && keywordFilter.length > 0) {
            // 目标必须拥有 keywordFilter 中的至少一个关键词
            // [2026-08-16 莉莉子] string → Keyword 断言（关键词数据统一 string 处理，见 design 约定）
            const hasKeyword = keywordFilter.some(kw => card.keywords?.includes(kw as Keyword));
            if (!hasKeyword) return false;
        }

        // =====================================
        // [核心新增] 高级条件拦截器 (Advanced Radar)
        // =====================================
        if (targetCondition) {
            if (targetCondition === 'ally_only' || targetCondition === 'ally_not_full') {
                // [2026-06-27 生机补充] 只能选我方单位（水晶已在上面拦截层放过）
                if (!isAlly) return false;
                // [2026-10-04 莉莉子] ally_not_full：满血单位不可被选
                //   判据取 damageTaken，与 effectProcessor 的 applyHeal 逐字同口径
                //   （:3178-3179 actualHeal = Math.min(damageTaken, amount)），
                //   damageTaken=0 ⇒ 治疗量恒为 0 ⇒ 放行就是白花 2 费。
                if (targetCondition === 'ally_not_full' && (card.damageTaken || 0) <= 0) return false;
            }
            else if (targetCondition === 'injured') {
                // 必须掉血才能被选中
                if ((card.damageTaken || 0) <= 0) return false;
            }
            else if (targetCondition === 'power_less_than_3') {
                // 计算当前真实攻击力
                const currentPower = (card.power || 0) + (card.buffs?.power || 0);
                if (currentPower >= 3) return false;
            }
            else if (targetCondition === 'in_combat') {
                // [物理探针] 利用 DOM 结构扫描，判断该实体是否位于交战槽位中！
                const el = document.querySelector(`[data-entity-id="${card.id}"]`);
                if (!el || !el.closest('[data-combat-index]')) return false;
            }
        }

        switch (reqType) {
            case 'ALLY_UNIT': return isAlly && (!filterKey || card.key === filterKey);
            case 'ENEMY_UNIT': return isEnemy;
            case 'ANY_UNIT': return true;
            case 'ANY_TARGET': return true; // 单位也是 Target
            case 'ALLY_CHAMPION': return isAlly && card.isChampion && (!filterKey || card.key === filterKey);
            // [2026-08-16 莉莉子] 删除 case 'HAND_CARD'：348 行已提前 return 拦截，此 case 不可达（TS2678 死代码）
            case 'SPELL_ON_STACK': {
                // [2026-08-05 莉莉子] 反制目标：堆叠中的敌方法术（来源由 handleTargetClick 前置拦截为 'stack'）
                // [LILITH-DEBUG] 反制目标校验诊断
                const _isAlly = isAlly, _type = card.type, _cost = card.cost || 0, _costBelow = stackCostBelow, _spdF = stackSpeedFilter;
                let _onStack = true;
                if (stateRef) _onStack = stateRef.current.game.spellStack.some(s => s.card.id === card.id);
                const _pass = !_isAlly && (_type === 'spell-fast' || _type === 'spell-slow' || _type === 'spell-burst')
                    && !(_costBelow !== undefined && _cost >= _costBelow)
                    && !(_spdF && _spdF.length > 0 && !_spdF.includes(_type))
                    && _onStack;
                console.log(`[LILITH-DEBUG][NEGATE] 校验目标 ${card.key}(${card.name}) type=${_type} cost=${_cost} owner=${owner} stackCostBelow=${_costBelow} speedFilter=${JSON.stringify(_spdF)} onStack=${_onStack} → ${_pass ? '✅可反制' : '❌拒绝'}`);
                return _pass;
            }
            default: return false;
        }
    };

    // --- 4. 处理点击交互 ---
    // [2026-06-27 暗箱操作] 新增 source 参数区分手牌点击 vs 场上点击
    const handleTargetClick = (target: CardData | 'nexus', owner: 'player' | 'enemy', source?: 'hand' | 'field' | 'stack') => {
        // [2026-07-09 瓦莱莉] 支持 select_discard 模式（无 castingCard，直接读写 game.spellCasting）
        // 注：此分支只有 useGameState 层的 useSpellSystem 有 stateRef，UI 层的走 GameSession.handleCardClick
        if (stateRef) {
            const sc = stateRef.current.game.spellCasting;
            if (!castingCard && sc?.step === 'select_discard') {
                if (source !== 'hand' || target === 'nexus') return;
                const targetObj = { type: 'ally' as const, id: target.id };
                const currentIds = sc.targets.map((t: any) => t.id);
                const newTargets = currentIds.includes(target.id)
                    ? sc.targets.filter((t: any) => t.id !== target.id)
                    : [...sc.targets, targetObj];
                updateSpellCasting({ ...sc, targets: newTargets });
                // [2026-09-19] 施法选目标 → 专用事件（专属音效只服务施法，不再和通用选单位共用）
                eventBus.emit(GameEvents.SFX_SPELL_TARGET);
                return;
            }
        }

        if (!castingCard) return;

        const effect = getEffectDef(castingCard);
        if (!effect) return;

        // 获取当前步骤的需求
        const requirement = effect.targetRequirements[currentStepIndex];
        if (!requirement) return;

        // [2026-06-27 HAND_CARD] 来源隔离：手牌操作只能由点击手牌触发
        if (requirement.type === 'HAND_CARD' && source !== 'hand') return;
        if (requirement.type !== 'HAND_CARD' && source === 'hand') return;
        // [2026-08-05 SPELL_ON_STACK] 来源隔离：堆叠法术只能由点击堆叠卡触发
        if (requirement.type === 'SPELL_ON_STACK' && source !== 'stack') return;
        if (source === 'stack' && requirement.type !== 'SPELL_ON_STACK') return;

        // [2026-07-09 修复] 手牌弃牌：不能选正在打出的卡牌自身（按实例 ID 排，同名不同 ID 可以选）
        if (requirement.type === 'HAND_CARD' && target !== 'nexus' && castingCard && target.id === castingCard.id) {
            console.log("[HAND_CARD] 不能选择正在施放的卡牌自身作为弃牌目标");
            return;
        }

        // [2026-08-08 莉莉子修复] HAND_CARD 类型/费用过滤（战术闪击等：只能选指定类型、费用上限的手牌）
        if (requirement.type === 'HAND_CARD' && target !== 'nexus') {
            if (requirement.cardTypeFilter === 'unit' && !target.type?.includes('unit')) {
                setMessage?.("只能选择单位卡牌！");
                return;
            }
            if (requirement.cardTypeFilter === 'spell' && !target.type?.includes('spell')) {
                setMessage?.("只能选择法术卡牌！");
                return;
            }
            const maxCost = effect?.params?.maxCost;
            if (maxCost !== undefined && (target.cost || 0) >= maxCost) {
                setMessage?.(`只能选择费用低于${maxCost}的卡牌！`);
                return;
            }
        }

        // [2026-08-05 莉莉子 法术16] 多目标选择去重：同一单位不可重复选（防止三连选天启者选中同一个）
        if (target !== 'nexus' && selectedTargets.some(t => t.id === target.id)) {
            console.log("[目标选择] 该单位已选过，不能重复选择");
            return;
        }

        // 验证合法性：将法术配置中的高级暗号和种族过滤器传给雷达
        if (isValidTarget(target, owner, requirement.type, requirement.filterKey, effect.params?.targetCondition, requirement.raceFilter, requirement.keywordFilter, requirement.stackCostBelow, requirement.stackSpeedFilter)) {
            // [新增] 目标合法，成功锁定！播放清脆的确认音
            eventBus.emit(GameEvents.SFX_SELECT_UNIT);

            // 构建目标数据结构 (标准化)
            // [核心修复 BUG 4]：为水晶目标补齐虚拟的 DOM 锚点 ID，防止特效层取不到坐标而卡死
            const targetObj = target === 'nexus'
                ? { type: owner === 'player' ? 'player_nexus' : 'enemy_nexus', id: owner === 'player' ? 'nexus_player' : 'nexus_enemy' }
                : requirement.type === 'SPELL_ON_STACK'
                    ? { type: 'spell_on_stack', spellId: target.id, id: target.id } // [2026-08-05 莉莉子] 反制目标：指向堆叠法术实例；[2026-08-15] 补 id 让 VFXLayer 确认/持久线能按 data-entity-id 定位 DOM（此前缺 id 导致线不渲染）
                    : { type: owner === 'player' ? 'ally' : 'enemy', id: target.id };

            const newTargets = [...selectedTargets, targetObj];

            // =====================================
            // [2026-09-19 莉莉子 BUG修复] 多目标需求（count > 1）必须点满 count 个才推进
            // ── 病根：此前按「需求【条目】数」推进 —— 一个 `{ type:'ENEMY_UNIT', count:2 }`
            //    点第一下就满足 `currentStepIndex+1 >= targetRequirements.length` 直接收工。
            //    `count` 此前**只被 AI 自动选目标路径**（pickAITargets）消费，玩家手动选永远只能选到 1 个
            //    ⇒「钢羽傍身 / 标记射击」描述写"选择两个敌方单位"，实战只能选一个。
            // ── 口径：count<=0 视作 1（保住 ALL_ALLIES 这类"点一下即可"的旧行为，零回归）
            // ── 本步骤已选几个 = 总已选数 - 前面各步骤需求之和
            // =====================================
            const countOf = (r: { count?: number }) => (r.count && r.count > 0 ? r.count : 1);
            const priorNeed = effect.targetRequirements
                .slice(0, currentStepIndex)
                .reduce((n, r) => n + countOf(r), 0);
            const needForCurrent = countOf(effect.targetRequirements[currentStepIndex]);
            const selectedForStep = newTargets.length - priorNeed;

            // =====================================
            // [2026-10-02 莉莉子 BUG修复] 「目标不足时」也必须能收尾
            // ── 病根：本判定**只看"需求写了几"，没看"场上还剩几个可选的"**。
            //    典型复现（粉丝原话）：「钢羽傍身」= `{type:'ENEMY_UNIT', count:2}`，
            //      「对面只有一个人的时候用不了」—— 永远选不满 2 个 ⇒ 卡在选目标，法术打不出去。
            // ── 口径：**选满 count** 或 **已无任何合法目标可选** ⇒ 本步完成（选几个算几个）。
            // ── 安全性：这是**纯放宽** —— 只在"原本永远无法完成"的情形下多给一条出路，
            //    目标充足时行为与原来完全一致（仍要求选满 count）。
            // ── 候选池口径与 `findAITargetsForEffect` / `isValidTarget` 保持一致；
            //    其余类型（水晶 / 堆叠法术 / 手牌…）不放宽，返回 0 ⇒ 维持原行为。
            // =====================================
            const remainingSelectable = (() => {
                // ⚠️ [2026-10-02 莉莉子 紧急修复] `stateRef` 是**可选的**！
                //   useSpellSystem 在本项目里有**两个实例**：
                //     · useGameState 层 —— 完整传参，含 stateRef
                //     · GameSession UI 层 —— **只传 onComplete**，其余参数全是 undefined
                //       （见 GameSession.tsx:576 的 `as Parameters<...>[0]` 强转）
                //   此前这里直接 `stateRef.current` ⇒ UI 层一选目标就抛
                //   `Cannot read properties of undefined (reading 'current')` ⇒ 所有需要选目标的法术全部点不动。
                //   返回 -1 表示「**无法枚举**」（≠ 0「确实没有可选目标」），用于与真正的空池区分。
                //   数据源优先级：stateRef（useGameState 层）→ boardSnapshot（UI 层补传）
                const board = stateRef ? stateRef.current : params.boardSnapshot?.();
                if (!board) return -1;

                // =====================================
                // 🔴 [2026-10-03 莉莉子 BUG修复 · 钢羽傍身"只有一个敌人时用不了"第二根因]
                // ── 病根：本段的 `owner` **用错了语义**。
                //    `handleTargetClick(target, owner, …)` 的 `owner` 是**被点击目标的阵营**，
                //    不是施法者阵营。证据（三处独立）：
                //      · :533  `{ type: owner === 'player' ? 'ally' : 'enemy', id: target.id }`
                //      · :434  `case 'ENEMY_UNIT': return isEnemy`（= 目标在敌方侧）
                //      · 调用方 GameSession :2213/2227/2258 传目标的 owner；:2920 打敌方水晶传 'enemy'
                //    而相邻的 `findAITargetsForEffect(effectDef, owner, …)` 里的 `owner` 才是**施法者**
                //    （:1186 传 `choiceOwner`）。当初 -06 的放宽段就是照抄它的 `isAI/friendly/hostile` —
                //    ⇒ 玩家点敌方单位时 owner='enemy' ⇒ 被误判成"AI 在施法"
                //    ⇒ `hostile` 取到了**玩家自己的备战席**，且 `isValidTarget(c, 'enemy', 'ENEMY_UNIT')`
                //      恒为 true（它只看传进来的那个 owner，不看 card）
                //    ⇒ 计数实际变成「**玩家自己备战席上还剩几个单位**」！
                // ── 症状：玩家点掉唯一敌人后，只要自己场上还有活着的单位，
                //    `remainingSelectable ≥ 1` ⇒ 判定"没选满 2 个" ⇒ 卡在选目标 ⇒ **打不出去**。
                //    完全解释「有时行有时不行」= 取决于**玩家自己阵容里有没有单位**（空场/全死时能打出）。
                // ── 也解释为什么敌人在 2 个以上时从来不犯：走正常路径 `selectedForStep >= 2`，
                //    根本不经过本段。
                // ── 正解：**按候选自己的阵营分桶、按候选自己的阵营校验** ——
                //    与"真实点击一次"的校验方式逐字一致，不再推导施法者是谁（本路径本就只有玩家点选）。
                // =====================================
                const playerPool: CardData[] = [...(board.playerBench ?? [])];
                const enemyPool: CardData[] = [...(board.enemyBench ?? [])];
                // 交战区：attacker 属 `f.owner`；blocker 属 `f.owner` 的**对面**（全局统一口径）
                (board.combatField ?? []).forEach((f: any) => {
                    if (f?.attacker) (f.owner === 'player' ? playerPool : enemyPool).push(f.attacker);
                    if (f?.blocker) (f.owner === 'player' ? enemyPool : playerPool).push(f.blocker);
                });

                // 按需求类型决定候选来自哪一侧（与本 hook 的 `isValidTarget` 同口径：
                //   ALLY_* / SELF / ALL_ALLIES ⇒ 需 owner==='player'；ENEMY_UNIT ⇒ 需 owner==='enemy'）
                let candidates: { card: CardData; side: 'player' | 'enemy' }[] = [];
                if (requirement.type === 'ALLY_UNIT' || requirement.type === 'ALLY_CHAMPION'
                    || requirement.type === 'ALL_ALLIES' || requirement.type === 'SELF') {
                    candidates = playerPool.map(c => ({ card: c, side: 'player' as const }));
                    if (requirement.type === 'ALLY_CHAMPION') {
                        candidates = candidates.filter(x => x.card?.isChampion);
                    }
                } else if (requirement.type === 'ENEMY_UNIT') {
                    candidates = enemyPool.map(c => ({ card: c, side: 'enemy' as const }));
                } else if (requirement.type === 'ANY_UNIT' || requirement.type === 'ANY_TARGET') {
                    candidates = [
                        ...playerPool.map(c => ({ card: c, side: 'player' as const })),
                        ...enemyPool.map(c => ({ card: c, side: 'enemy' as const })),
                    ];
                } else {
                    return -1; // 其余类型（水晶 / 堆叠法术 / 手牌…）不放宽 ⇒ 维持原行为
                }

                if (requirement.filterKey) {
                    const fk = requirement.filterKey.toLowerCase();
                    candidates = candidates.filter(x => x.card?.key?.toLowerCase().includes(fk));
                }

                const seen = new Set<string>();
                let n = 0;
                for (const { card: c, side } of candidates) {
                    if (!c || !c.id || seen.has(c.id)) continue;
                    seen.add(c.id);
                    if (newTargets.some(t => t.id === c.id)) continue; // 同一步不可重复选同一单位
                    // ⚠️ 用**候选自己的阵营** `side` 校验（原实现传的是被点击目标的 `owner`）
                    if (isValidTarget(c, side, requirement.type, requirement.filterKey, effect.params?.targetCondition, requirement.raceFilter, requirement.keywordFilter, requirement.stackCostBelow, requirement.stackSpeedFilter)) n++;
                }
                return n;
            })();

            // [2026-10-02] `=== 0` 严格判定：-1（无法枚举）不会误触发放宽
            const currentReqSatisfied = selectedForStep >= needForCurrent || remainingSelectable === 0;

            setSelectedTargets(newTargets); // [核心修复 BUG 1] 先存状态以维持前台连线渲染，绝不提前销毁

            if (currentReqSatisfied) {
                if (currentStepIndex + 1 >= effect.targetRequirements.length) {
                    // [2026-08-26 莉莉子] 法术目标全部选完：通知教程控制器（精确到施法操作完成）
                    eventBus.emit(GameEvents.TUTORIAL_SPELL_TARGETS_SELECTED, { card: castingCard, owner });
                    onComplete(castingCard, newTargets);
                } else {
                    setCurrentStepIndex(prev => prev + 1); // 本步骤选满 → 进下一步
                }
            }
            // 未选满：留在本步骤，让玩家继续点（连线保持）
        } else {
            // [2026-10-04 莉莉子] 「生机补充」满血被拒时给玩家**可见**反馈
            //   —— 此前该分支只有 `console.log("Invalid target")`，玩家屏幕上零反馈。
            //
            // ⚠️ 为什么必须走 onInvalidTarget，而不是直接用 setMessage（第一版就栽在这里）：
            //   本项目 `setMessage` 写入的 message state 在**标准对局里没有任何渲染点** ——
            //     · GameSession 只解构 setMessage、**从不解构也不渲染 `message`**
            //     · useGameState 里 `message` 只有「定义(:187)」与「导出(:5864)」两处，无消费 effect
            //     · 全项目唯一渲染点是沙盒 `SandboxSession.tsx:604 / :983`
            //   ⇒ 标准对局的可见通道只有 announce（useGameAnnouncer → <GameAnnouncement>），
            //     由调用方经 onInvalidTarget 接上。
            //
            // ⚠️ 只对 ally_not_full 提示：其他法术卡的"非法点击静默"行为**不在本次范围**，一字不改。
            const cond = effect.params?.targetCondition;
            console.log("Invalid target");
            if (cond === 'ally_not_full') {
                const reason = target === 'nexus'
                    ? '该水晶生命值已满，无法被治疗！'
                    : '该单位生命值已满，无法被治疗！';
                onInvalidTarget?.(reason);   // 标准对局：GameSession → announce 中央播报
                setMessage?.(reason);        // 沙盒：SandboxSession 会渲染 message（其余场景为兼容兜底）
            }
        }
    };
    // ==========================================
    // [搬迁] 游戏核心法术与堆叠逻辑
    // ==========================================

    const startSpellCasting = (card: CardData) => {
        setPlayerHand(prev => prev.filter(c => c.id !== card.id));
        setGame(prev => ({
            ...prev, activeCard: card,
            spellCasting: { cardId: card.id, step: 'select_ally', targets: [], allyId: undefined }
        }));
        setMessage("选择目标");
    };

    const updateSpellCasting = (newState: any) => setGame(prev => ({ ...prev, spellCasting: newState }));

    // =============================================
    // [2026-07-11 绿灵·艾娃] 光环检测：打出快速法术时触发牌库BUFF
    // =============================================
    const checkEvaAura = (card: CardData, owner: 'player' | 'enemy', logPrefix: string) => {
        if (card.type !== 'spell-fast') return;
        const benchToCheck = owner === 'player' ? stateRef.current.playerBench : stateRef.current.enemyBench;
        const aliveFilter = (c: CardData) =>
            c.key === 'Green_Spirit_Squad_Eva' && !c.isDead &&
            c.animState !== 'dying' && c.animState !== 'ephemeral_dying';
        const evaCount = benchToCheck.filter(aliveFilter).length;
        console.log(`[Green_Debug] 🔍 ${logPrefix} 艾娃光环检测: card=${card.name}(${card.cost}费), type=${card.type}, owner=${owner}, evaCount=${evaCount}, benchLen=${benchToCheck.length}`);
        if (evaCount === 0) return;

        let deckCopy = [...(owner === 'player' ? stateRef.current.playerDeck : stateRef.current.enemyDeck)];
        let totalBuffed = 0;
        for (let i = 0; i < evaCount; i++) {
            const result = buffTopUnitInDeck(deckCopy, 1, 1);
            if (result.buffed) {
                deckCopy = result.deck;
                totalBuffed++;
                console.log(`[Green_Debug] 🌟 艾娃光环 #${i + 1} 触发！${owner}打出快速法术=${card.name}，牌库顶单位=${result.buffedUnit?.name} 获得+1+1`);
            }
        }
        if (totalBuffed > 0) {
            if (owner === 'player') {
                setPlayerDeck(deckCopy);
                stateRef.current.playerDeck = deckCopy;
            } else {
                setEnemyDeckState(deckCopy);
                stateRef.current.enemyDeck = deckCopy;
            }
            setMessage(`艾娃的光环${evaCount > 1 ? '们' : ''}滋养了牌库！`);
        } else {
            console.log(`[Green_Debug] 🌟 艾娃光环：${owner}牌库中无单位可BUFF`);
        }
    };

    // =============================================
    // [2026-09-13 莉莉子] 天启者法术回库
    // 兑现卡面「使用后，在牌库里生成一张"XXX"」的承诺。
    // 覆盖 6 张天启者抉择法术：里芙的决意 / 芬妮的狂热 / 卜卜的卜卦 /
    //                        猫汐尔的演算 / 安卡希雅的剑舞 / 安卡希雅的重锋(Lv2)
    //
    // 判定口径：抉择子卡回指原法术（parentCard），原法术须带 associatedChampionKey + choices。
    //   支援技（冻沙激流等）虽带 associatedChampionKey 但无 choices → 天然排除，不会误生成。
    //
    // ⚠️ 调用点必须避开 commitSpell 的"1 秒悬停撤回熔断"（撤回时法术未实际打出，不可投放）；
    //    也必须晚于 resolveStack 的 NEGATE 反制检查（被无效化的法术不投放）。
    // =============================================
    const grantChampionSpellCopy = (card: CardData, owner: 'player' | 'enemy') => {
        const src = ((card as any).parentCard ?? card) as CardData;
        const champKey = (src as any)?.associatedChampionKey as string | undefined;
        const hasChoices = Array.isArray((src as any)?.choices) && (src as any).choices.length > 0;
        if (!champKey || !hasChoices || !CARD_DB[champKey]) return;

        // 英雄已升级时生成 Lv2 副本，与变形系统 processHandTransformation 的取牌口径一致
        // [2026-10-04 莉莉子 BUG修复 · I5] 判据改为**按方**：原先读全局 `leveledChampions`
        //   ⇒ 镜像对局里"玩家把某英雄练到 Lv2"会让**敌方**那张同名卡回库时也生成 Lv2 副本（跨侧泄漏）。
        let champCard = createFullCard(champKey, owner); // [2026-10-13 F3·L1] 归属 = 法术归属方
        if (isLeveledUpForSide(stateRef.current.game, owner, champKey)) {
            champCard = getLeveledUpCard(champCard);
        }

        // [2026-10-04 莉莉子 BUG修复 · I3a] 副本必须**带装备/武装**（程口径）——
        //   照搬"开局构建"的同一口径：按 champKey 查该方的装备表，逐个 attachEquipment。
        //   ⚠️ GameSession 的 UI 层实例不传这两张表（undefined）⇒ 那边不挂，行为与改动前一致。
        const copyEquips = (owner === 'player' ? playerEquipments : enemyEquipments)?.[champKey];
        if (copyEquips?.length) {
            for (const eid of copyEquips) champCard = attachEquipment(champCard, eid);
            console.log(`[ChampionSpell] 🎽 回库副本 ${champKey} 补挂装备/武装 [${copyEquips.join(', ')}]`);
        }

        // Fisher-Yates 洗入牌堆（与 useGameState.shuffleDeck 同算法）——
        // 抽牌是从牌库顶 splice，追加到末尾等于沉底，必须打散才有意义
        const shuffleIn = (deck: CardData[]) => {
            const next = [...deck, champCard];
            for (let i = next.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [next[i], next[j]] = [next[j], next[i]];
            }
            return next;
        };

        if (owner === 'player') {
            setPlayerDeck(prev => { const n = shuffleIn(prev); stateRef.current.playerDeck = n; return n; });
        } else {
            setEnemyDeckState(prev => { const n = shuffleIn(prev); stateRef.current.enemyDeck = n; return n; });
        }

        // 表现层：中央亮相 → 翻背 → 飞回牌库（单向事件，牌已洗入，动画纯表现）
        eventBus.emit(GameEvents.CARD_TO_DECK, {
            animId: nextAnimId('todeck', owner, champCard.id),
            card: champCard,
            owner,
        });
        console.log(`[ChampionSpell] ✅ ${src.name} 使用后，牌库生成一张 ${champCard.name}`);
    };

    // ==========================================
    // [2026-10-12 莉莉子 BUG修复 · 施法侧「触发时机太早」族（#1/#2/#4/#5）]
    // ── 病根：这一整段（迷宫强化 `on_cast_spell` + 装备 `player_cast_spell` 成长）原先写在
    //    `commitSpell` 的**第二行**，也就是**还在可撤回窗口之内**：
    //      · 玩家打出快速/慢速法术 ⇒ 加成当场到手 ⇒ 点「取消」(`cancelPendingSpell`)
    //        **退卡 + 全额退费**（本文件 `:1615-1632`）⇒ **零成本无限刷**；
    //      · 极速法术另有一条「1 秒悬停退回手牌」的路径。
    //    quest `cast_spell`（共鸣回路）与「共鸣涌流」同理 —— 原在 `useGameState.playCard`
    //    里**点下去就推进**，同一张法术"打出→取消"N 次即可白刷。
    // ── 现改为**统一挪到"法术真正结算之后"**兑现，三个调用点：
    //    ①  极速法术：`commitSpell` 的悬停熔断检查之后、`executeSpellEffect` + `flushMicroQueue` 之后；
    //    ②  堆栈法术（快速/慢速）：`resolveStack` 的同一位置；
    //    ③  **被无效化（NEGATE）的法术**：`resolveStack` 的 `continue` **之前** ——
    //        程的口径（2026-10-12）：**被反制掉的法术「算施放过」**，故同样要兑现。
    //    窗口内不再分发 ⇒ **撤回后不残留任何加成**，天然不可刷。
    // ── quest 那两条（#4/#5）走 `eventBus` 回抛给 `useGameState` 跑它自己的 `runGearQuest`
    //    （那是 hook 内的局部 `useCallback`，**不能 import、也不该复制第二份**）。
    // ==========================================
    // [2026-10-13 莉莉子] 形参 `card` → `_card`：本函数体内**从未使用**它
    //   （`on_cast_spell` 走 ctx、③④ 由 `SPELL_CAST_SETTLED` 回抛，都刻意不读卡本身）。
    //   ⚠️ 本项由**真类型检查**（`tsc -b`）报出 `TS6133` —— 见本次交接：
    //   `npx tsc --noEmit` 因 `tsconfig.json` 是 `files: []` 的解决方案式配置而**空转**，
    //   它会让 `npm run build`（`tsc -b`）失败 ⇒ 项目当时**打不出包**。
    //   三个调用点仍照旧传卡（保留"将来可能需要"的接口形状，与本仓库 `_enemyBench` 等惯例一致）。
    const dispatchSpellCastSideEffects = (_card: CardData, owner: 'player' | 'enemy') => {
        // ── ① 迷宫强化 on_cast_spell：随机友军永久 +1/+1（法术共鸣 / 法术渗透）
        if (stateRef.current.game[owner === 'player' ? 'rogueEnhancements' : 'enemyEnhancements']?.length) {
            const enhList = owner === 'player' ? stateRef.current.game.rogueEnhancements : stateRef.current.game.enemyEnhancements;
            const sCtx: RogueTriggerCtx = {
                game: { ...stateRef.current.game },
                playerBench: [...stateRef.current.playerBench],
                enemyBench: [...stateRef.current.enemyBench],
                combatField: [...stateRef.current.combatField],
                playerHand: [...stateRef.current.playerHand],
                enemyHand: [...stateRef.current.enemyHand],
                playerDeck: [...stateRef.current.playerDeck],
                enemyDeck: [...stateRef.current.enemyDeck],
                owner,
                trigger: 'on_cast_spell',
                createFullCard,
                info: {},
                dirty: { bench: new Set<Side>(), hand: new Set<Side>(), deck: new Set<Side>(), field: false, game: false },
            };
            runRogueTrigger(sCtx, enhList, 'on_cast_spell');
            if (sCtx.dirty.bench.has('player')) setPlayerBench(sCtx.playerBench);
            if (sCtx.dirty.bench.has('enemy')) setEnemyBench(sCtx.enemyBench);
            if (sCtx.dirty.field) setCombatField(sCtx.combatField);
        }

        // ── ② 成长装备 player_cast_spell（歌莉娅的课题权杖 / 乐手的疗愈独奏 / arm_grow_spell_ally）
        //    仅扫描我方备战席存活 + 交战区我方存活（装备卡须在场才成长）；
        //    self → 装备卡自己；random_ally → 随机在场友军
        if (owner === 'player') {
            const isLiveUnit = (c: any): c is CardData =>
                !!c && !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying';
            const fieldUnits: CardData[] = [
                ...stateRef.current.playerBench.filter(isLiveUnit),
                ...stateRef.current.combatField
                    .filter((f: any) => f.owner === 'player' && isLiveUnit(f.attacker))
                    .map((f: any) => f.attacker as CardData),
            ];
            if (fieldUnits.length) {
                const growth: { id: string; buffed: CardData }[] = [];
                // 合并同卡多次成长（一张卡可挂多件同事件成长装，避免写回时只取第一条丢 buff）
                const addGrowth = (target: CardData, p: number, h: number) => {
                    const idx = growth.findIndex(x => x.id === target.id);
                    if (idx >= 0) growth[idx] = { id: target.id, buffed: applyPermanentBuff(growth[idx].buffed, p, h) };
                    else growth.push({ id: target.id, buffed: applyPermanentBuff(target, p, h) });
                };
                fieldUnits.forEach(unit => {
                    getEquipTriggers(unit, 'player_cast_spell').forEach(t => {
                        if (t.target === 'self') {
                            addGrowth(unit, t.power, t.health);
                        } else if (t.target === 'random_ally') {
                            const pick = fieldUnits[Math.floor(Math.random() * fieldUnits.length)];
                            if (pick) addGrowth(pick, t.power, t.health);
                        }
                    });
                });
                if (growth.length) {
                    // [2026-10-12 莉莉子 BUG修复 · 施法成长装备对【备战席】单位不生效]
                    //   原写回**只有 `setCombatField`**，而扫描列表早就含备战席 ⇒ 备战席单位的成长
                    //   「算出来了却写不回去」；而 main 阶段交战区按引擎不变量恒为空 ⇒ 绝大多数施法零写回。
                    //   修法：两片各自函数式写回（照 `useGameState.ts:3926-3929` 攻击后成长的既有写法）。
                    setPlayerBench(prev => {
                        let changed = false;
                        const next = prev.map(c => {
                            const hit = growth.find(x => x.id === c.id);
                            if (hit) { changed = true; return hit.buffed; }
                            return c;
                        });
                        return changed ? next : prev; // 无变化则原样返回（React 直接 bail out）
                    });
                    setCombatField(prev => prev.map(f => {
                        const hit = growth.find(x => x.id === f.attacker?.id);
                        return hit && f.owner === 'player' ? { ...f, attacker: hit.buffed } : f;
                    }));
                }
            }
        }

        // ── ③ quest `cast_spell`（共鸣回路）+ ④ 「共鸣涌流」法力上限成长
        //    [2026-10-12] 这两条原来在 `useGameState.playCard` 里**点下去就推进**（可撤回窗口内）
        //    ⇒ 同一张法术"打出→取消"N 次即可白刷（取消全额退费）。
        //    现随法术一起挪到结算后；由 `useGameState` 侧监听本事件、跑它自己的 `runGearQuest`
        //    （不复制实现、也不改 `useSpellSystem` 的入参签名）。
        if (owner === 'player') {
            eventBus.emit('SPELL_CAST_SETTLED', { owner });
        }
    };

    const commitSpell = async (card: CardData, owner: 'player' | 'enemy', targets: any[], originalPhase?: any) => {
        // [2026-10-08 莉莉子 · 法术专属装备 第二波] **施法计数累加**（唯一入口）
        //   ⚠️ 必须在**扣费之前/同时**记：条件减费判据是"本回合**尚未**打出过法术"，
        //      若在结算后才记，同回合的第二张法术会误判成"还没打过"。
        // [2026-10-12 莉莉子 BUG修复 · 活页夹页「−1 恒不生效」]
        //   上面那条约定**保持不变**（记账仍在此处、仍早于下一次施法）；
        //   但**本次施法**的扣费必须按"累加之前"的计数算 —— 否则本次施法会破坏自己的条件
        //   （活页夹页要求 thisRound===0，而这里刚把它变成 1）。
        //   ⇒ 先在累加**之前**取一份基准，再作为第 5 参传给下面两处 `getEffectiveSpellCost`。
        //   （门禁/卡面本来就在 commitSpell 之前读，天然是旧值 ⇒ 三者由此同源。）
        const preCastBasis = getSpellCastSnapshot(owner);
        noteSpellCast(owner);
        // [2026-09-19] 确定打出法术音效 —— 极速法术紧随「打出」；快速/慢速在玩家点「确定」时走到这里
        eventBus.emit(GameEvents.SFX_SPELL_CONFIRM);
        // [2026-07-20 对局记录修复] 使用 setTimeout 将事件推入宏任务队列，
        // 确保它在 commitSpell 后续所有的 setGame(cleanSnapshot) 同步状态覆盖完成后再执行
        setTimeout(() => {
            eventBus.emit('spell_record', { card, owner, targets });
        }, 0);

        // [2026-10-12 莉莉子 BUG修复] `on_cast_spell`（迷宫强化）与 `player_cast_spell`（成长装备）
        //   的分发**已从"这里"挪走** —— 它们原本就在本行位置兑现，即**可撤回窗口之内**。
        //   现统一由 `dispatchSpellCastSideEffects()` 在**法术真正结算之后**调用（三处调用点见该函数注释）。

        const existingPending = stateRef.current.game.pendingSpell;
        let cleanSnapshot = { ...stateRef.current.game };
        const safePhase = originalPhase || (cleanSnapshot.phase === 'animating' ? 'main' : cleanSnapshot.phase);

        // [2026-09-03 莉莉子 死锁逃生] commitSpell 主体包 try/finally：
        // 敌方演出分支（置 animating 后 await wait）或玩家极速法术"撤回熔断"(return 在恢复点前)
        // 一旦异常/中途退出，phase 会残留 animating → 对局死锁。finally 兜底恢复。
        // 刻意不清 spellStack（敌方慢速法术需留在堆叠交玩家响应）。
        try {
        // [2026-08-06 莉莉子 Echo 回响] 法术打出并结算后：在手牌生成一张该牌的瞬逝复制品
        if (card.keywords.includes('Echo')) {
            const echoOwnerHand = owner === 'player'
                ? stateRef.current.playerHand
                : stateRef.current.enemyHand;
            // [2026-10-08 第二波 · Q5] 传本体装备表 ⇒ 复制品继承装备（G1 防递归在 applyEchoOnPlay 内）
            const echoResult = applyEchoOnPlay(card, echoOwnerHand, owner, (owner === 'player' ? playerEquipments : enemyEquipments)?.[card.key]);
            if (echoResult.echoedCards.length > 0) {
                if (owner === 'player') {
                    setPlayerHand(echoResult.hand);
                    stateRef.current.playerHand = echoResult.hand;
                } else {
                    setEnemyHand(echoResult.hand);
                    stateRef.current.enemyHand = echoResult.hand;
                }
                echoResult.echoedCards.forEach(echoCard => {
                    const animId = nextAnimId('echo', echoCard.id);
                    eventBus.emit(GameEvents.DRAW_START, {
                        animId, card: echoCard, owner,
                        skipHandAdd: true,
                        skipDeckAnim: true,
                    });
                });
            }
        }

        if (card.type === 'spell-burst') {
            if (!card.parentCard) {
                // [2026-07-10 诗人] 凯特琳减费影响实际扣费（双方均适配）
                const benchForCost = owner === 'player' ? stateRef.current.playerBench : stateRef.current.enemyBench;
                // [2026-10-12 莉莉子 BUG修复] 传"施法前基准"⇒ 条件减费（活页夹页/双生符）按**本次之前**的计数算
                const effectiveCost = getEffectiveSpellCost(card, benchForCost, owner === 'player' ? cleanSnapshot.playerMaxMana : cleanSnapshot.enemyMaxMana, owner, preCastBasis); // [2026-10-13 F3·L5] maxMana 改按 owner 取该侧（原恒取 playerMaxMana）
                const { newMana, newSpellMana } = calculateNewMana(
                    effectiveCost,
                    owner === 'player' ? cleanSnapshot.playerMana : cleanSnapshot.enemyMana,
                    owner === 'player' ? cleanSnapshot.playerSpellMana : cleanSnapshot.enemySpellMana,
                    false
                );
                if (owner === 'player') {
                    cleanSnapshot.playerMana = Math.min(cleanSnapshot.playerMaxMana, newMana);
                    cleanSnapshot.playerSpellMana = Math.min(3, newSpellMana);
                } else {
                    cleanSnapshot.enemyMana = Math.min(cleanSnapshot.enemyMaxMana, newMana);
                    cleanSnapshot.enemySpellMana = Math.min(3, newSpellMana);
                }
            }

            setGame(cleanSnapshot);
            setMessage("极速法术准备就绪...");

            if (owner === 'enemy') {
                // [2026-07-07 重构] AI 法术三段式演出: 悬念 → 锁定 → 飞弹
                // Phase 1: 入堆栈无 targets → 大圆盘出现，无瞄准线（悬念期）
                // [2026-08-07 莉莉子修复] 清空抉择残留状态（对齐下方 enemy 慢速分支），
                // 防止 AI 打出天启者抉择法术（如里芙的决意）后 activeCard/spellCasting 残留导致抉择界面卡死
                setGame(prev => ({
                    ...prev,
                    activeCard: null,
                    spellCasting: null,
                    spellStack: [{ card, owner, targets: [] }, ...prev.spellStack],
                    phase: 'animating',
                }));
                setMessage("敌方正在施法...");
                await wait(1200);

                // Phase 2: 补充 targets → 瞄准线出现（锁定期）
                setGame(prev => ({
                    ...prev,
                    spellStack: prev.spellStack.map(s =>
                        s.card.id === card.id ? { ...s, targets } : s
                    )
                }));
                setMessage("敌方法术锁定目标！");
                await wait(400);
            } else {
                await wait(1000);

                const currentActiveCard = stateRef.current.game.activeCard;
                // [修复] 容错抉择法术：card.parentCard 指向抉择卡，此时 currentActiveCard 可能还是抉择卡的旧 ID
                const matchesActiveCard = currentActiveCard && (
                    currentActiveCard.id === card.id ||
                    currentActiveCard.id === (card as any).parentCard?.id
                );
                // [LILITH-DEBUG] 极速法术熔断诊断
                console.log(`[LILITH-DEBUG][BURST] 1秒悬停检查: card=${card.key}(${card.id}) currentActiveCard=${currentActiveCard ? currentActiveCard.key + '(' + currentActiveCard.id + ')' : 'null'} matches=${!!matchesActiveCard} spellCasting=${stateRef.current.game.spellCasting?.step ?? 'null'}`);
                if (owner === 'player' && !matchesActiveCard) {
                    console.log("[SpellSystem] 极速法术在 1 秒悬停期内被撤回，执行链已安全熔断！");
                    return;
                }

                setGame(prev => ({ ...prev, spellCasting: null, activeCard: null }));
                console.log(`[LILITH-DEBUG][BURST] 已清除 spellCasting/activeCard`);
            }

            // Phase 3: AI 弹道飞行前清除瞄准线
            if (owner === 'enemy') {
                setGame(prev => ({
                    ...prev,
                    spellStack: prev.spellStack.map(s => ({ ...s, targets: [] }))
                }));
            }

            // [2026-07-21 对局记录] 极速法术 — 执行前扫全场快照
            const burstBeforeMap = snapshotAllFieldUnits();

            // [核心升级] 极速法术弹道接入通用管线！
            // [2026-09-19 1.0.16 茉莉安] 连斩类法术（最终指令）**跳过通用弹道** ——
            //   它的逐击演出由 UltimateStrikeLayer 全权负责；不跳过的话，玩家指定的**首击**
            //   会被这发"通用飞弹"顶掉（后续续击才是专属特效）⇒ "第一击是默认特效"。
            if (!isChainStrikeSpell(card)) {
                eventBus.emit(StrikeEvents.COMMAND, {
                    sourceId: card.id,
                    spellKey: card.key,
                    bullets: (targets || []).map(t => ({ targetId: t.id, damage: 0, barrierPopped: false })),
                    interval: 0
                });
                await waitForStrikeComplete();
            }

            executeSpellEffect(card.key, owner, targets, {
                game: stateRef.current.game,
                setGame,
                playerBench: stateRef.current.playerBench, setPlayerBench,
                enemyBench: stateRef.current.enemyBench, setEnemyBench,
                combatField: stateRef.current.combatField, setCombatField,
                playerHand: stateRef.current.playerHand, setPlayerHand,
                playerDeck: stateRef.current.playerDeck, setPlayerDeck, // [核心修复] 喂入我方牌库快照与写权限
                enemyDeck: stateRef.current.enemyDeck, setEnemyDeck: setEnemyDeckState, // [核心修复] 喂入敌方牌库快照与写权限
                triggerShake,
                setMessage,
                // [2026-07-08 修复] 补传 enemyHand，DISCARD 需要它来找到要弃的牌
                enemyHand: stateRef.current.enemyHand,
                setEnemyHand,
                // [2026-10-03 莉莉子 BUG-20261002-24] 透传建卡工厂：
                //   神格①③「拉取暴露单位」的触发在 effectProcessor 内（猎影标记的额外攻击），
                //   而 RogueTriggerCtx.createFullCard 必填 ⇒ 必须从这里一路带下去。
                createFullCard,
            }, card); // [2026-07-28] 传入法术卡牌实例（供 FLYING_SWORD 读取 customProgress 模式）

            await wait(50);
            const isQueueProcessed = flushMicroQueue();
            if (isQueueProcessed) await wait(50);

            // [2026-10-12 莉莉子 BUG修复 · 触发时机太早] **法术已真正结算** ⇒ 到这里才兑现
            //   （`on_cast_spell` / 成长装备 / quest `cast_spell` / 共鸣涌流）。① 极速法术路径。
            //   若它在 1 秒悬停期内被撤回，上方熔断分支已 `return` ⇒ 这里根本不会执行 ⇒ **不可刷**。
            dispatchSpellCastSideEffects(card, owner);

            // [2026-07-11 绿灵·艾娃] 极速法术触发艾娃光环
            checkEvaAura(card, owner, '[BURST]');

            // [2026-09-13 莉莉子] 天启者法术回库：等法术弹道演出播完再投放，避免中央特效打架
            grantChampionSpellCopy(card, owner);

            // [2026-07-21 对局记录] 极速法术 — 全量对比发射
            {
                const burstEntities = computeChangesFromMap(burstBeforeMap);
                let burstSummary = '';
                if (card.effects) {
                    for (const effId of card.effects) {
                        const effDef = EFFECT_DB[effId];
                        if (!effDef) continue;
                        if (effDef.class === 'STRIKE' || effDef.class === 'HEAL') {
                            if (effDef.record?.summary) {
                                burstSummary = effDef.record.summary.replace(/\{(\w+)\}/g, (_, k) =>
                                    String(effDef.params[k as keyof typeof effDef.params] ?? `{${k}}`));
                            } else if (effDef.class === 'STRIKE' && effDef.params.value) {
                                burstSummary = `造成 ${effDef.params.value} 点伤害`;
                            } else if (effDef.class === 'HEAL' && effDef.params.value) {
                                burstSummary = `恢复 ${effDef.params.value} 点生命`;
                            }
                        }
                    }
                }
                if (burstEntities.length > 0 || burstSummary) {
                    eventBus.emit('spell_effect_record', {
                        owner, spellCardKey: card.key, summary: burstSummary, entities: burstEntities,
                    } as any);
                }
            }

            setGame(prev => ({
                ...prev,
                phase: safePhase,
                lastActionTimestamp: Date.now(),
                // [教程方案] AI 极速法术：从堆叠移除已结算的法术
                spellStack: owner === 'enemy' ? prev.spellStack.filter(s => s.card.id !== card.id) : prev.spellStack,
            }));
            setMessage("极速法术生效");
        } else {
            if (!card.parentCard) {
                // [2026-07-15 梵音] 慢速法术也应用减费（觉悟/凯特琳）
                const benchForCost = owner === 'player' ? stateRef.current.playerBench : stateRef.current.enemyBench;
                // [2026-10-12 莉莉子 BUG修复] 同极速分支：传"施法前基准"，避免本次施法破坏自己的条件
                const effectiveCost = getEffectiveSpellCost(card, benchForCost, owner === 'player' ? cleanSnapshot.playerMaxMana : cleanSnapshot.enemyMaxMana, owner, preCastBasis); // [2026-10-13 F3·L5] maxMana 改按 owner 取该侧（原恒取 playerMaxMana）
                const { newMana, newSpellMana } = calculateNewMana(
                    effectiveCost,
                    owner === 'player' ? cleanSnapshot.playerMana : cleanSnapshot.enemyMana,
                    owner === 'player' ? cleanSnapshot.playerSpellMana : cleanSnapshot.enemySpellMana,
                    false
                );
                if (owner === 'player') {
                    cleanSnapshot.playerMana = Math.min(cleanSnapshot.playerMaxMana, newMana);
                    cleanSnapshot.playerSpellMana = Math.min(3, newSpellMana);
                } else {
                    cleanSnapshot.enemyMana = Math.min(cleanSnapshot.enemyMaxMana, newMana);
                    cleanSnapshot.enemySpellMana = Math.min(3, newSpellMana);
                }
            }

            cleanSnapshot.spellCasting = null;
            cleanSnapshot.activeCard = null;

            const stackItem: SpellStackItem = { card, owner, targets };
            if (owner === 'player') {
                setGame({
                    ...cleanSnapshot,
                    spellStack: existingPending ? [existingPending, ...cleanSnapshot.spellStack] : cleanSnapshot.spellStack,
                    pendingSpell: stackItem,
                    phase: safePhase
                });
                setMessage("请确认是否打出该法术");
            } else {
                // [2026-07-07 重构] AI 非极速法术悬念期: 大圆盘 → 瞄准线 → 交响应
                // Phase 1: 入堆栈无 targets → 大圆盘出现，悬念（animating 防 AI 计时器捣乱）
                setGame({
                    ...cleanSnapshot,
                    activeCard: null,
                    spellCasting: null,
                    spellStack: [{ card, owner, targets: [] }, ...cleanSnapshot.spellStack],
                    phase: 'animating',
                });
                setMessage("敌方正在施法...");
                await wait(1200);

                // Phase 2: 补充 targets → 瞄准线出现 → 交给玩家响应
                setGame(prev => ({
                    ...prev,
                    turnOwner: 'player',
                    consecutivePasses: 0,
                    lastActionTimestamp: Date.now(),
                    phase: safePhase,
                    spellStack: prev.spellStack.map(s =>
                        s.card.id === card.id ? { ...s, targets } : s
                    )
                }));
                setMessage("敌方打出法术，请响应");
            }
        }
        } catch (err) {
            console.error('[commitSpell] 💥 异常', err, { card: card.key, owner });
        } finally {
            bumpAnimProgress();
            if (stateRef.current.game.phase === 'animating') {
                console.warn('[commitSpell] 应急恢复 phase →', safePhase);
                setGame(prev => ({
                    ...prev,
                    phase: (safePhase === 'animating' ? 'main' : safePhase) as GameState['phase'],
                    spellCasting: null,
                    activeCard: null,
                    lastActionTimestamp: Date.now(),
                }));
            }
        }
    };

    // ★ 选择模式接入点 ⑩ — 每个 select_* step 在取消时需处理退卡退费
    //    已实现: select_bench
    //    未来: select_enemy_bench | select_enemy_hand
    const cancelChoice = () => {
        // [2026-08-02 莉莉子] 同步清理施法视觉状态（castingCard / 目标选择 / 连线渲染）
        // 防止取消抉择后残留施法层，导致界面看起来"取消不掉"
        cancelCasting();
        const sc = stateRef.current.game.spellCasting;
        const currentActive = stateRef.current.game.activeCard;

        // [2026-07-20 替换打出] 取消替换：退回手牌 + 退还法力
        if (sc?.step === 'select_bench' && currentActive) {
            const cost = currentActive.cost || 0;
            setPlayerHand(prev => [...prev, currentActive]);
            setGame(prev => {
                let newMana = prev.playerMana + cost;
                let newSpellMana = prev.playerSpellMana;
                if (newMana > prev.playerMaxMana) {
                    newSpellMana = Math.min(3, newSpellMana + (newMana - prev.playerMaxMana));
                    newMana = prev.playerMaxMana;
                }
                return {
                    ...prev,
                    activeCard: null,
                    spellCasting: null,
                    playerMana: newMana,
                    playerSpellMana: newSpellMana,
                };
            });
            setMessage("已取消替换");
            return;
        }

        // [2026-10-04 莉莉子 BUG修复 · 审计 #4] 退卡必须按**抉择归属方**分派 ——
        //   原实现固定 `setPlayerHand(...)` ⇒ AI 的抉择法术被取消时，卡会"传送"到**玩家手牌**
        //   （玩家还能再把它打出来）。归属以 `spellCasting.choiceOwner`（10-02 引入的显式字段）为准。
        const choiceOwner = sc?.choiceOwner ?? 'player';
        if (currentActive) {
            const cardToReturn = currentActive.parentCard || currentActive;
            if (choiceOwner === 'enemy') {
                setEnemyHand(prev => [...prev, cardToReturn]);
            } else {
                setPlayerHand(prev => [...prev, cardToReturn]);
            }
        }
        // =====================================
        // 🔴 [2026-10-05 莉莉子 BUG修复] **抉择之后**取消 ⇒ 必须退还**子卡**费用。
        // ── 病根：`resolveChoice` 已按子卡费用扣过费（星光之途 1 费 / 绝对主角 6 费），
        //    而这里只"退卡不退费" ⇒ 玩家在"子卡选目标"阶段一取消就**白扣一次**。
        //    （上面 :1216 的替换打出分支是**退费**的 ⇒ 本意就该退，这里漏了。）
        // ── 判据：`parentCard` 存在 = **已抉择出子卡**（仍在 choose_mode 时 activeCard 是母卡、无 parentCard，
        //    那一刻**尚未扣费**，绝不能退）。
        // ── 退费公式与 :1219-1232（替换打出）/ GameSession 的取消施法**逐字一致**
        //    （超出最大法力的部分转法术法力，上限 3）。
        // =====================================
        // ⚠️ [2026-10-05 莉莉子 · 独立审查修复] 判据**必须同时要求"已离开 choose_mode"**。
        //   病根：AI 抉择"需要选目标"时存在一个 0.35~0.65s 的中间态 —— `resolveChoice` 已把
        //   `activeCard` 换成**子卡**（带 parentCard），但 `spellCasting` 仍是 `choose_mode`。
        //   若只看 `parentCard`，该窗口内一旦被取消入口命中，就会"**退子卡费用 + 母卡回手**"，
        //   而 AI 那边的 `runEnemySpellCastBeats().then(commitSpell)` **仍会继续结算**
        //   ⇒ 变成"退费 + 回手 + 照样生效"的**免费施法**。
        //   ⇒ 收紧为「有 parentCard **且** 已离开 choose_mode」= 真·已抉择（玩家正在选目标）。
        //   （玩家侧本就自洽：choose_mode 时 activeCard 是母卡、无 parentCard ⇒ 不退；进 select_* 后才退 ✅）
        const pickedCost = ((currentActive as any)?.parentCard && sc?.step !== 'choose_mode')
            // [2026-10-12 莉莉子 BUG修复 · 退款 ≠ 实扣] 优先退**实扣量**（`resolveChoice` 扣费时记的 `paidCost`）。
            //   原实现读 `currentActive.cost`（实例价）—— 只含"烘焙型"减费，遇到凯特琳光环 /
            //   装备条件减费这类**只在查询时生效**的减费就会 **退 > 扣**（可反复刷法力）。
            //   程口径：花多少退多少。取不到时（老路径 / 非抉择）回落 `cost` ⇒ 行为不变。
            ? ((currentActive as any).paidCost ?? currentActive!.cost ?? 0)
            : 0;
        if (pickedCost > 0) {
            if (choiceOwner === 'enemy') {
                setGame(prev => {
                    let newMana = prev.enemyMana + pickedCost;
                    let newSpellMana = prev.enemySpellMana;
                    if (newMana > prev.enemyMaxMana) {
                        newSpellMana = Math.min(3, newSpellMana + (newMana - prev.enemyMaxMana));
                        newMana = prev.enemyMaxMana;
                    }
                    return { ...prev, activeCard: null, spellCasting: null, enemyMana: newMana, enemySpellMana: newSpellMana };
                });
            } else {
                setGame(prev => {
                    let newMana = prev.playerMana + pickedCost;
                    let newSpellMana = prev.playerSpellMana;
                    if (newMana > prev.playerMaxMana) {
                        newSpellMana = Math.min(3, newSpellMana + (newMana - prev.playerMaxMana));
                        newMana = prev.playerMaxMana;
                    }
                    return { ...prev, activeCard: null, spellCasting: null, playerMana: newMana, playerSpellMana: newSpellMana };
                });
            }
            setMessage("已取消，费用已返还");
            return;
        }
        setGame(prev => ({ ...prev, activeCard: null, spellCasting: null }));
    };

    const resolveChoice = async (chosenCardKey: string) => {
        const originalPhase = stateRef.current.game.phase;
        const originalCard = game.activeCard;
        if (!originalCard || !game.spellCasting || game.spellCasting.step !== 'choose_mode') return;

        // [2026-10-02 莉莉子 BUG修复] 抉择归属方以 spellCasting.choiceOwner 为准，不再用 turnOwner 推断。
        //   病根：玩家可在**对方优先权**阶段打出极速抉择法术（典型：玩家进攻 → 格挡阶段
        //   turnOwner 归防守方 = 'enemy'），此时按 turnOwner 推断会把**玩家的**法术算成敌方法术：
        //   扣敌方法力、按敌方飞剑数算折扣、法术记成敌方所有 ⇒ 玩家点了也没用 / 资源算错。
        const choiceOwner = game.spellCasting.choiceOwner
            ?? (game.turnOwner === 'enemy' ? 'enemy' : 'player');

        const transformed = createFullCard(chosenCardKey, choiceOwner); // [2026-10-13 F3·L1] 归属 = choiceOwner（**不是** turnOwner）
        transformed.parentCard = originalCard;

        // =====================================
        // [2026-10-05 莉莉子 BUG修复 · 20261005-01] **引擎侧兜底**：慢速子卡的时机必须与普通慢速法术同口径
        // ── UI 侧已由 `gameRules.evaluateChoiceCondition` 的「枷锁4」拦下（选项显示锁定+原因）；
        //    这里再钉一道，是因为"合法性"这条语义在本项目出过太多次"两处不同源"的事故
        //    （高光说能打、点下去打不出去）。三条判据与 `playCard` 的慢速守卫**逐字同源**。
        // ── 越权时既不静默吞卡也不吞费：给提示 + 走既有 `cancelChoice`（母卡回手、子卡费用尚未扣），
        //    面板正常关闭 ⇒ 不存在"卡死在抉择界面"的风险（AI 侧同样安全）。
        // =====================================
        if (transformed.type === 'spell-slow') {
            const g = stateRef.current.game;
            const isCombatPhase = g.phase === 'attack_declare' || g.phase === 'block_declare' || g.phase === 'react_to_block';
            const illegalReason = isCombatPhase
                ? '战斗阶段无法施放慢速法术'
                : (g.turnOwner !== choiceOwner
                    ? '慢速法术只能在自己回合施放'
                    : (g.spellStack.length > 0 ? '法术响应中，无法施放慢速法术' : null));
            if (illegalReason) {
                console.warn(`[抉择·慢速守卫] ${transformed.name}(${chosenCardKey}) 被拒绝：${illegalReason}`
                    + `（owner=${choiceOwner} turnOwner=${g.turnOwner} phase=${g.phase} stack=${g.spellStack.length}）`);
                setMessage(`${illegalReason}！`);
                cancelChoice();
                return;
            }
        }
        // [2026-10-02 莉莉子] 抉择归属留痕 —— 复测时看这行即可确认玩家的抉择没有被算成敌方的
        console.log(`[抉择] ${originalCard.name}(${originalCard.key}) → 「${transformed.name}」 owner=${choiceOwner} turnOwner=${game.turnOwner} phase=${originalPhase}`);

        // [2026-07-30 飞剑减费] 抉择确认时应用飞剑折扣（朔望之期 + 剑痕时空）
        //   ⚠️ [2026-10-12 莉莉子 · 三价同源] 这里烘焙的是**子卡实例价**（下游读 `transformed.cost`）；
        //      **算价**统一走下方 `getChoiceCardCost`。因为实例价已含飞剑，
        //      那里第 5 参必须传 **0**，否则飞剑会被减两次（双减）。
        const choiceFsTotal = choiceOwner === 'player'
            ? (stateRef.current.game.playerFlyingSwordsTotal || 0)
            : (stateRef.current.game.enemyFlyingSwordsTotal || 0);
        if (CHOICE_FLYING_SWORD_DISCOUNT_KEYS.includes(chosenCardKey) && choiceFsTotal > 0) {
            transformed.cost = Math.max(0, (transformed.cost || 0) - choiceFsTotal);
        }

        // [新增] 触发天启者技能语音
        const heroKey = originalCard.associatedChampionKey;
        if (heroKey) {
            const isUltimate = chosenCardKey.includes('ultimate');
            eventBus.emit(GameEvents.SPELL_CHOICE, {
                hero: { key: heroKey, id: `voice-${heroKey}` } as CardData,
                choice: isUltimate ? 'ultimate' : 'small'
            });
        }

        // =====================================
        // 🔴 [2026-10-05 莉莉子 BUG修复] 抉择子卡的扣费**必须同步写回 `stateRef`**。
        // ── 病根（程实测）：「天启者法术 → 抉择小技能/大招 → **最后不扣费**」。链条：
        //    ① 这里用 `setGame(prev => …)` 扣费 —— 那是**异步入队**，`stateRef.current.game` 此刻仍是旧值；
        //    ② 紧接着**同步**调用的 `commitSpell` 会执行 `let cleanSnapshot = { ...stateRef.current.game }`（:939）
        //       ⇒ **取到扣费前的快照**，随后 `setGame({ ...cleanSnapshot, … })`（快速/慢速走 :1154）
        //       **整体覆盖**这把 mana ⇒ 那次扣费被抹掉；
        //    ③ 而 `commitSpell` 里两处扣费（:973 极速 / :1130 快速·慢速）都写着 `if (!card.parentCard)`
        //       —— **本意正是"抉择时已经扣过了、别再扣"**，前提却是这次扣费没被覆盖。
        //    ⇒ **两头都以为对方扣了，结果一分钱没花**（子卡是 spell-fast/spell-slow，正好都走覆盖路径）。
        // ── 修法：扣费后**立即同步 `stateRef.current.game`**，让随后同步执行的 `commitSpell`
        //    取到的 `cleanSnapshot` 已带着扣费（与项目里多处"手动同步 stateRef"同一惯例）。
        // ── 顺带：读数由闭包 `game` 换成 `stateRef.current.game` —— 本函数前面还有几处 setGame，
        //    闭包值可能不是最新。
        // =====================================
        const costGame = (stateRef ? stateRef.current.game : game);
        // ⚠️ [2026-10-05 莉莉子 · 独立审查修复] 扣费金额改走 `getEffectiveSpellCost`，
        //   与 `commitSpell` 的两处扣费（:976 极速 / :1133 快速·慢速）**同一口径** ——
        //   它把"凯特琳 -1""觉悟归零"等减费算进去（gameRules.ts）。
        //   原实现直接取 `transformed.cost` 裸值 ⇒ 抉择子卡一直吃不到减费；
        //   改动前这个差异被"扣费被覆盖"掩盖着（等于没扣），修好扣费后它**首次真实可见** ⇒ 必须对齐。
        const costBench = choiceOwner === 'player' ? stateRef?.current.playerBench : stateRef?.current.enemyBench;
        // [2026-10-12 莉莉子 BUG修复 · 抉择「显示价 / 门禁价 / 实扣价」三价同源]
        //   改走 `getChoiceCardCost` = 抉择子卡的**唯一算价入口**，与
        //   卡面显示（`GameSession` 抉择面板）/ AI 自动选 / AI 策略门禁**同一个函数**。
        //   ⚠️ 飞剑折扣已在上方烘焙进 `transformed.cost` ⇒ 第 5 参传 **0**（传总数会双减）。
        //   ⚠️ [2026-10-13 F3·L5 **已收口**] `maxMana` 曾恒传 `costGame.playerMaxMana`
        //      ⇒ 敌方抉择子卡是按**玩家的法力上限**定价的。虽只对「觉悟：巨偶一瞥」
        //      （`maxMana ≥ 10` 归零）有语义、而那张卡不是抉择子卡 ⇒ 实际影响为零，
        //      但**侧别取错就是侧别取错**，留着就是下一处泄漏的模板
        //      （F2 的教训：恒定方向偏玩家 = 漏传不报错 = 静默错侧）。
        const effectiveSubCost = costBench
            ? getChoiceCardCost(
                transformed, costBench,
                choiceOwner === 'player' ? costGame.playerMaxMana : costGame.enemyMaxMana,
                choiceOwner, 0,
            )
            : (transformed.cost || 0);
        // [2026-10-12 莉莉子 BUG修复 · 抉择「取消退款 ≠ 实扣量」] **把实扣量记在子卡上**。
        //   ── 退款处（下方 `cancelPendingSpell` 的 `pickedCost`）原来读 `currentActive.cost`（实例价），
        //      只含**烘焙型**减费（莲台无垠），**不含只在查询时生效的**（凯特琳光环 / 装备条件减费）
        //      ⇒ 那些场合 **退 > 扣**，可"打出 → 取消"刷法力。
        //   ── 程口径（2026-10-12）：「**花多少退多少**」⇒ 不重算（重算会因时点不同再次算错），改为记账。
        transformed.paidCost = effectiveSubCost;
        const { newMana, newSpellMana } = calculateNewMana(
            effectiveSubCost,
            choiceOwner === 'player' ? costGame.playerMana : costGame.enemyMana,
            choiceOwner === 'player' ? costGame.playerSpellMana : costGame.enemySpellMana,
            false
        );
        if (choiceOwner === 'player') {
            const nextMana = Math.min(costGame.playerMaxMana, newMana);
            const nextSpellMana = Math.min(3, newSpellMana);
            setGame(prev => ({ ...prev, playerMana: nextMana, playerSpellMana: nextSpellMana }));
            // ⚠️ 必须同步：commitSpell 的 cleanSnapshot(:939) 读的是 stateRef，不同步则覆盖本次扣费
            if (stateRef) stateRef.current.game = { ...stateRef.current.game, playerMana: nextMana, playerSpellMana: nextSpellMana };
        } else {
            const nextMana = Math.min(costGame.enemyMaxMana, newMana);
            const nextSpellMana = Math.min(3, newSpellMana);
            setGame(prev => ({ ...prev, enemyMana: nextMana, enemySpellMana: nextSpellMana }));
            // ⚠️ 同上（AI 抉择侧）
            if (stateRef) stateRef.current.game = { ...stateRef.current.game, enemyMana: nextMana, enemySpellMana: nextSpellMana };
        }

        const effectId = transformed.effects && transformed.effects.length > 0 ? transformed.effects[0] : null;
        const effectDef = effectId ? EFFECT_DB[effectId] : null;
        const needsTargets = effectDef && effectDef.targetRequirements && effectDef.targetRequirements.some(req => req.count > 0);

        // [千莲叠绽特判] 猫汐尔未格挡时直接召唤，不需要选目标
        const finalNeedsTargets = effectId === 'effect_mauxir_lotus_rush'
            ? needsTargets && stateRef.current.combatField?.some(f =>
                f.blocker?.key === 'mauxir_lotus_drive' && f.owner === 'enemy'
              )
            : needsTargets;

        // [修复] 将 activeCard 更新为选中的技能卡，确保后续流程使用正确的卡牌效果
        if (finalNeedsTargets) {
            // [2026-07-30 AI抉择] 敌方抉择法术需选目标时，AI自动选目标入栈
            if (choiceOwner === 'enemy') {
                const autoTargets = findAITargetsForEffect(effectDef!, choiceOwner, stateRef.current);
                if (autoTargets.length > 0) {
                    setGame(prev => ({ ...prev, activeCard: transformed }));
                    // [2026-09-19 方案C] 与手牌施法同源：AI 抉择法术也先走三拍演出
                    void runEnemySpellCastBeats(autoTargets, wait).then(() =>
                        commitSpell(transformed, 'enemy', autoTargets, originalPhase)
                    );
                } else {
                    console.warn(`[AI抉择] 找不到 ${transformed.name} 的合法目标，取消施法`);
                    // 直接清理状态，不调用 cancelChoice（后者会错误地归还手牌到玩家侧）
                    setGame(prev => ({ ...prev, activeCard: null, spellCasting: null }));
                }
            } else {
                const reqType = effectDef!.targetRequirements[0].type;
                let step: 'select_ally' | 'select_enemy' | 'select_any' = 'select_any';
                if (reqType.includes('ALLY')) step = 'select_ally';
                else if (reqType.includes('ENEMY')) step = 'select_enemy';

                setGame(prev => ({
                    ...prev,
                    activeCard: transformed,  // [修复] 替换 activeCard 为技能卡（含 effects）
                    phase: originalPhase === 'animating' ? 'main' : originalPhase,
                    spellCasting: {
                        cardId: transformed.id,
                        step: step,
                        targets: [],
                        allyId: undefined,
                        // ⚠️ [2026-10-05 莉莉子 · 独立审查修复] **必须带上抉择归属** ——
                        //   `cancelChoice` 的退卡/退费归属只认 `sc.choiceOwner`（:1241）。
                        //   原实现切到 select_* 时丢了这个字段 ⇒ 兜底成 'player'，
                        //   一旦 AI 侧出现持久化的 select_* 步，费用会**退到玩家头上**。
                        choiceOwner,
                    }
                }));
                setMessage(`请选择 ${transformed.name} 的施放目标`);
            }
        } else {
            // [修复] 先更新 activeCard 再 commit，防止 commitSpell 中 ID 检查失败
            setGame(prev => ({ ...prev, activeCard: transformed }));
            commitSpell(transformed, choiceOwner, [], originalPhase);
        }
    };

    const withdrawSpellFromStack = (cardId: string) => {
        const stackItem = stateRef.current.game.spellStack.find(s => s.card.id === cardId);
        if (!stackItem || stackItem.owner !== 'player') return;

        setGame(prev => ({
            ...prev,
            spellStack: prev.spellStack.filter(s => s.card.id !== cardId)
        }));

        const cardToReturn = stackItem.card.parentCard || stackItem.card;
        setPlayerHand(prev => [...prev, cardToReturn]);

        const costToRefund = stackItem.card.cost;
        setGame(prev => {
            let newMana = prev.playerMana + costToRefund;
            let newSpellMana = prev.playerSpellMana;
            if (newMana > prev.playerMaxMana) {
                newSpellMana = Math.min(3, newSpellMana + (newMana - prev.playerMaxMana));
                newMana = prev.playerMaxMana;
            }
            return { ...prev, playerMana: newMana, playerSpellMana: newSpellMana };
        });
        setMessage("法术已撤回");
    };

    const confirmPendingSpell = () => {
        const isBlockDeclare = stateRef.current.game.phase === 'block_declare';
        setGame(prev => {
            if (!prev.pendingSpell) return prev;
            return {
                ...prev,
                spellStack: [prev.pendingSpell, ...prev.spellStack],
                pendingSpell: null,
                // [修复] block_declare 阶段确认法术不转优先权，让玩家继续部署格挡
                turnOwner: isBlockDeclare ? prev.turnOwner : 'enemy',
                consecutivePasses: 0,
                lastActionTimestamp: Date.now()
            };
        });
        setMessage(isBlockDeclare ? "法术入栈，继续部署防线" : "法术入栈，等待对方响应");
    };

    // ★ 选择模式接入点 ⑪ — 每个 select_* step 的取消按钮路由到对应的退卡退费逻辑
    //    已实现: select_bench → cancelChoice | select_discard → 退费退卡
    //    未来: select_enemy_bench → cancelChoice | select_enemy_hand → cancelChoice
    const cancelPendingSpell = () => {
        // [2026-07-09 瓦莱莉] 取消弃牌选择：退回瓦莱莉并归还法力
        const sc = stateRef.current.game.spellCasting;

        // [2026-07-20 替换打出] 取消替换：同样退回卡牌并归还法力
        if (sc?.step === 'select_bench') {
            cancelChoice();
            return;
        }

        if (sc?.step === 'select_discard') {
            const activeCard = stateRef.current.game.activeCard;
            if (activeCard) {
                setPlayerHand(prev => [...prev, activeCard]);
                const costToRefund = activeCard.cost;
                setGame(prev => {
                    let newMana = prev.playerMana + costToRefund;
                    let newSpellMana = prev.playerSpellMana;
                    if (newMana > prev.playerMaxMana) {
                        newSpellMana = Math.min(3, newSpellMana + (newMana - prev.playerMaxMana));
                        newMana = prev.playerMaxMana;
                    }
                    return { ...prev, playerMana: newMana, playerSpellMana: newSpellMana, activeCard: null, spellCasting: null };
                });
            } else {
                setGame(prev => ({ ...prev, activeCard: null, spellCasting: null }));
            }
            setMessage("已取消");
            return;
        }

        if (sc?.step === 'select_hand_target') {
            // [2026-09-03 莉莉子] 白猎手牌目标选择取消：退回卡牌；单位型（playCard 已扣费）退费，
            // 法术型（费用在 commitSpell 才扣、此时未扣）只退卡不退费，避免误加费用。
            const activeCard = stateRef.current.game.activeCard;
            if (activeCard) {
                setPlayerHand(prev => [...prev, activeCard]);
                if (activeCard.type.includes('unit')) {
                    const costToRefund = activeCard.cost || 0;
                    setGame(prev => {
                        let newMana = prev.playerMana + costToRefund;
                        let newSpellMana = prev.playerSpellMana;
                        if (newMana > prev.playerMaxMana) {
                            newSpellMana = Math.min(3, newSpellMana + (newMana - prev.playerMaxMana));
                            newMana = prev.playerMaxMana;
                        }
                        return { ...prev, playerMana: newMana, playerSpellMana: newSpellMana, activeCard: null, spellCasting: null };
                    });
                } else {
                    setGame(prev => ({ ...prev, activeCard: null, spellCasting: null }));
                }
            } else {
                setGame(prev => ({ ...prev, activeCard: null, spellCasting: null }));
            }
            setMessage("已取消");
            return;
        }

        const pending = stateRef.current.game.pendingSpell;
        if (!pending || pending.owner !== 'player') return;

        setGame(prev => ({ ...prev, pendingSpell: null }));

        const cardToReturn = pending.card.parentCard || pending.card;
        setPlayerHand(prev => [...prev, cardToReturn]);

        const costToRefund = pending.card.cost;
        setGame(prev => {
            let newMana = prev.playerMana + costToRefund;
            let newSpellMana = prev.playerSpellMana;
            if (newMana > prev.playerMaxMana) {
                newSpellMana = Math.min(3, newSpellMana + (newMana - prev.playerMaxMana));
                newMana = prev.playerMaxMana;
            }
            return {
                ...prev,
                playerMana: newMana,
                playerSpellMana: newSpellMana,
                phase: prev.phase === 'animating' ? 'main' : prev.phase
            };
        });
        setMessage("法术已取消打出");
    };

    const resolveStack = async () => {
        const originalPhase = stateRef.current.game.phase; // [修正] 用 stateRef 防闭包
        setGame(prev => ({ ...prev, phase: 'animating' }));
        const stack = [...stateRef.current.game.spellStack];

        // [2026-09-03 莉莉子 死锁逃生] 结算收尾段抽成局部函数，供正常与异常路径共用。
        // 异常时也必须把 spellStack 清空并写回 phase，杜绝 .then(() => passTurn()) 接力
        // 读到滞后的 animating 造成回合错误跳过 / 分支A 反复 resolveStack 死循环。
        const settleStack = () => {
            // [SBA] 法术结算后同步清尸
            judgeLifeAndDeath();
            const nextPhase = originalPhase === 'react_to_block' ? 'react_to_block' : 'main';
            // [2026-08-24 莉莉子 飞剑竞态根治] 结算后若交战区有飞剑，同步进入格挡阶段，
            // 不依赖异步守卫 effect 切换。react_to_block 情形（快速飞剑响应汇入战斗）不得强制拉回格挡。
            // [2026-09-26 T17 猎影标记] 同构扩展：交战线带 `isExtraAttack` 时同样强制进入格挡阶段
            //   （该战线的 blocker 已由 effectProcessor 预指定并标了 isChallenged，等防守方确认即可）。
            //   ⚠️ 飞剑优先短路 —— 飞剑分支行为完全不变。
            const fsOwner = getFlyingSwordOwner(stateRef.current.combatField);
            const blockOwner = fsOwner ?? getExtraAttackOwner(stateRef.current.combatField);
            const forceBlock = nextPhase === 'main' && !!blockOwner;
            setGame(prev => ({
                ...prev,
                phase: forceBlock ? ('block_declare' as const) : nextPhase,
                turnOwner: forceBlock ? getDefensiveSide(blockOwner) : prev.turnOwner,
                spellStack: [],
                // 【机制修复】如果是从防守响应阶段结算的法术，将让过次数设为 1
                // 这样接力调用的 passTurn 看到 >=1 就会立刻无缝触发 resolveCombatAnimation()！
                consecutivePasses: forceBlock ? 0 : (nextPhase === 'react_to_block' ? 1 : 0),
                lastActionTimestamp: Date.now(),
            }));
        };

        try {
        for (const spell of stack) {
            // [2026-08-05 NEGATE] 法术可能已在堆叠中被无效化移除（法术8/6/7），跳过不再结算
            const stillOnStack = stateRef.current.game.spellStack.some(s => s.card.id === spell.card.id);
            if (!stillOnStack) {
                setMessage(`${spell.card.name} 已被无效化`);
                console.log(`[resolveStack] ${spell.card.name} 已被无效化，跳过结算`);
                // [2026-10-12 莉莉子 BUG修复 · 触发时机太早] ③ **被无效化（NEGATE）的法术**：
                //   程的口径（2026-10-12）—— **「算施放过」** ⇒ 这里同样要兑现
                //   （否则被反制的法术会连"施法"这件事都不算，与口径相反）。
                //   注意：此分支发生在**堆栈结算期**，早已脱离"可撤回窗口" ⇒ 不会引入可刷性。
                dispatchSpellCastSideEffects(spell.card, spell.owner);
                continue;
            }
            setMessage(`结算: ${spell.card.name}`);
            await new Promise(r => setTimeout(r, 300));

            setGame(prev => ({
                ...prev,
                spellStack: prev.spellStack.map(s => s.card.id === spell.card.id ? { ...s, targets: [] } : s)
            }));

            // [新增] 拦截猫汐尔大招——顷刻莲潮
            if (spell.card.key === 'mauxir_lotus_ultimate') {
                setMessage("顷刻莲潮！全基座发动双倍打击！");
                eventBus.emit('MAUXIR_ULTIMATE', { owner: spell.owner });
                await waitForStrikeComplete();

                // 基座攻击力减半（对总攻击力 base + buffs 减半）
                const halvePower = (c: CardData): CardData => {
                    const baseP = c.power || 0;
                    const totalP = baseP + (c.buffs?.power || 0);
                    const halfP = Math.floor(totalP / 2);
                    return { ...c, buffs: { power: halfP - baseP, health: c.buffs?.health ?? c.health } };
                };
                setPlayerBench(prev => prev.map(c => {
                    if (c.key === 'mauxir_lotus_pedestal') return halvePower(c);
                    return c;
                }));
                setCombatField(prev => {
                    if (!prev) return prev;
                    return prev.map(f => {
                        const newF = { ...f };
                        if (newF.attacker?.key === 'mauxir_lotus_pedestal') newF.attacker = halvePower(newF.attacker);
                        if (newF.blocker?.key === 'mauxir_lotus_pedestal') newF.blocker = halvePower(newF.blocker);
                        return newF;
                    });
                });

                setGame(prev => ({ ...prev, spellStack: prev.spellStack.filter(s => s.card.id !== spell.card.id) }));
                setMessage("顷刻莲潮！全基座攻击力已减半");

                await wait(50);
                const isQueueProcessed = flushMicroQueue();
                if (isQueueProcessed) await wait(50);
                continue; // 跳过常规 executeSpellEffect
            }

            // [2026-07-21 对局记录] 执行前 — 扫全场快照
            const beforeSnapshotMap = snapshotAllFieldUnits();

            // [核心升级] 栈内法术弹道接入通用管线！
            // [核心修复] 放宽限制！即使没有具体目标，也必须发出施法指令以触发屏幕中央的法阵特效！
            // [2026-09-19 1.0.16 茉莉安] 连斩类法术（最终指令）同样跳过 —— 见上方说明（首击会被顶掉）
            if (!isChainStrikeSpell(spell.card)) {
                eventBus.emit(StrikeEvents.COMMAND, {
                    sourceId: spell.card.id,
                    spellKey: spell.card.key,
                    bullets: (spell.targets || []).map(t => ({ targetId: t.id, damage: 0, barrierPopped: false })),
                    interval: 0 // 法术默认齐射
                });
                await waitForStrikeComplete();
            }

            executeSpellEffect(spell.card.key, spell.owner, spell.targets, {
                game: stateRef.current.game, setGame,
                playerBench: stateRef.current.playerBench, setPlayerBench,
                enemyBench: stateRef.current.enemyBench, setEnemyBench,
                combatField: stateRef.current.combatField, setCombatField,
                playerHand: stateRef.current.playerHand, setPlayerHand,
                playerDeck: stateRef.current.playerDeck, setPlayerDeck, // [核心修复] 同步传给堆栈法术系统
                enemyDeck: stateRef.current.enemyDeck, setEnemyDeck: setEnemyDeckState, // [核心修复] 同步传给堆栈法术系统
                triggerShake, setMessage,
                // [2026-07-08 修复] 补传 enemyHand，DISCARD 需要它来找到要弃的牌
                enemyHand: stateRef.current.enemyHand,
                setEnemyHand,
                // [2026-10-03 莉莉子 BUG-20261002-24] 同上（堆栈结算路径）
                createFullCard,
            }, spell.card); // [2026-07-28] 传入法术卡牌实例（供 FLYING_SWORD 读取 customProgress 模式）
            setGame(prev => ({ ...prev, spellStack: prev.spellStack.filter(s => s.card.id !== spell.card.id) }));

            await wait(50);
            const isQueueProcessed = flushMicroQueue();
            if (isQueueProcessed) await wait(50);

            // [2026-10-12 莉莉子 BUG修复 · 触发时机太早] **法术已真正结算** ⇒ 到这里才兑现。
            //   ② 堆栈法术（快速/慢速）路径。
            dispatchSpellCastSideEffects(spell.card, spell.owner);

            // [2026-07-11 绿灵·艾娃] 栈内法术触发艾娃光环
            checkEvaAura(spell.card, spell.owner, '[STACK]');

            // [2026-09-13 莉莉子] 天启者法术回库（慢速/快速抉择走堆栈结算，极速走 commitSpell）
            grantChampionSpellCopy(spell.card, spell.owner);

            // ==========================================
            // [2026-08-30 莉莉子 死锁护栏] 升级影片/队列等待加超时上限，
            // 杜绝升级影片 onEnd 挂起（芬妮单挑、卜卜胜利竞态）导致的无限死锁。
            // 超时后强制清空升级队列放行——升级数值/效果已入账，仅截断演出，绝不冻结对局。
            // [2026-10-03 莉莉子 · P0 收口] 这段原先是**内联拷贝**，现已与 useGameState 合并到
            //   `utils/levelUpDrain.ts` 的唯一实现；本实例（UI 层简版只传 onComplete 时参数为 undefined）
            //   由那边的**判空防御**兜住 —— 宁可不等待，也不会崩。
            // ==========================================
            await awaitLevelUpDrainCore({
                readPending: () => {
                    const g = stateRef.current.game;
                    const queueLen = (g.pendingLevelUps || []).length;
                    return { isPending: g.levelUpCard !== null || queueLen > 0, queueLen };
                },
                clearLevelUp: () => setGame(prev => ({ ...prev, levelUpCard: null, pendingLevelUps: [] })),
                wait,
                tag: 'resolveStack:法术结算后',
            });

            // [2026-07-21 对局记录] 全量对比发射
            {
                const effectEntities = computeChangesFromMap(beforeSnapshotMap);
                let effectSummary = '';
                const cardDef = CARD_DB[spell.card.key];
                if (cardDef?.effects) {
                    for (const effId of cardDef.effects) {
                        const effDef = EFFECT_DB[effId];
                        if (!effDef) continue;
                        if (effDef.class === 'STRIKE' || effDef.class === 'HEAL') {
                            if (effDef.record?.summary) {
                                effectSummary = effDef.record.summary.replace(/\{(\w+)\}/g, (_, k) =>
                                    String(effDef.params[k as keyof typeof effDef.params] ?? `{${k}}`));
                            } else if (effDef.class === 'STRIKE' && effDef.params.value) {
                                effectSummary = `造成 ${effDef.params.value} 点伤害`;
                            } else if (effDef.class === 'HEAL' && effDef.params.value) {
                                effectSummary = `恢复 ${effDef.params.value} 点生命`;
                            }
                        }
                    }
                }
                if (effectEntities.length > 0 || effectSummary) {
                    eventBus.emit('spell_effect_record', {
                        owner: spell.owner,
                        spellCardKey: spell.card.key,
                        summary: effectSummary,
                        entities: effectEntities,
                    } as any);
                }
            }
        }
        } catch (err) {
            console.error('[resolveStack] 💥 异常，清空堆叠安全放行', err, stack.map(s => s.card?.key));
            judgeLifeAndDeath();
        } finally {
            settleStack();

            // 【致命核心修复】强制让出主线程 50ms，确保上述的 setGame 被 React 批处理刷入 stateRef！
            // 防止外层的 .then(() => passTurn()) 同步执行时，读到滞后的 'animating' 阶段而导致回合被错误跳过
            await wait(50);
            setMessage("法术结算完毕");
            bumpAnimProgress();
        }
    };

    // --- 5. 导出状态供 UI 使用 ---
    const currentRequirement = castingCard ? getEffectDef(castingCard)?.targetRequirements[currentStepIndex] : null;

    return {
        // 原有 UI 目标选择层
        isCasting: !!castingCard,
        // [2026-09-19 莉莉子 BUG修复] 判满口径：所有需求的 count【求和】，不是需求条目数
        //   与点击推进逻辑（handleTargetSelect）同口径，否则 count:2 会在选到 1 个时就被判"已完成"
        isSelectionComplete: !!castingCard && selectedTargets.length >= (getEffectDef(castingCard)?.targetRequirements || [])
            .reduce((n, r) => n + (r.count && r.count > 0 ? r.count : 1), 0),
        activeCard: castingCard,
        currentRequirement, // [2026-08-05 莉莉子] 暴露当前目标需求（SPELL_ON_STACK 判断用）
        selectedTargets,
        instruction: currentRequirement?.label,
        selectedIds: selectedTargets.map(t => t.id).filter(Boolean),
        checkIsTargetable: (card: CardData | 'nexus', owner: 'player' | 'enemy') => {
            if (!currentRequirement || !castingCard) return false;
            // [2026-06-27 HAND_CARD] 手牌选择不高亮场上目标
            if (currentRequirement.type === 'HAND_CARD') return false;
            const effect = getEffectDef(castingCard);
            return isValidTarget(card, owner, currentRequirement.type, currentRequirement.filterKey, effect?.params?.targetCondition, currentRequirement.raceFilter, currentRequirement.keywordFilter, currentRequirement.stackCostBelow, currentRequirement.stackSpeedFilter);
        },
        startCasting,
        cancelCasting,
        handleTargetClick,

        // 搬迁过来的游戏逻辑层
        startSpellCasting,
        updateSpellCasting,
        commitSpell,
        resolveChoice,
        cancelChoice,
        withdrawSpellFromStack,
        confirmPendingSpell,
        cancelPendingSpell,
        resolveStack,
    };
};