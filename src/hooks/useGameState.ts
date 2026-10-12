import { processEffect, relayEffectEvents, processOnGetAttackToken, buildCalibrateDraw } from '../logic/effectProcessor';
import { runSummonEntry } from '../logic/summonEntry'; // [2026-10-06 程拍板 · A 方案] 「入场」门铃唯一实现
import type { EffectContext } from '../logic/effectProcessor';
import { EFFECT_DB, isEntryTiming, isPlayFromHandTiming } from '../data/effectRegistry';
import { useSpellSystem } from './useSpellSystem'; // [2026-08-16] 移除未使用的 waitForStrikeComplete 导入（TS6133）
import { useState, useRef, useEffect, useCallback } from 'react';
import type { CardData, GameState, GameRecordCategory, SpellStackItem, RecordEntity, Keyword } from '../types';
import { createCard, CARD_DB } from '../data/cards';
import {  calculateNewMana, getLeveledUpCard, getEffectiveSpellCost, upgradeAcaciaHand } from '../utils/gameRules';
import { resolveSingleCombat, resolveDoubleStrikeCombat, type DoubleStrikeCombatResult } from '../logic/combat'; // [新增] 引入真实血量探针
import { combatHasFlyingSword, getFlyingSwordOwner, getDefensiveSide, getExtraAttackOwner, combatHasExtraAttack } from '../logic/combat'; // [2026-08-24 莉莉子 飞剑竞态根治] 飞剑判定工具 · [2026-09-26 T17] 额外攻击判定
import { canAfford, grantExtraAttackTurn } from '../logic/core'; // [2026-10-03] 追加进攻权唯一出口（备战的唯一入口）
// [2026-10-03 莉莉子 · P0 收口] "等升级播完"的唯一实现（原先本文件与 useSpellSystem 各一份）
import { awaitLevelUpDrain as awaitLevelUpDrainCore, makeLevelUpDrainBudget } from '../utils/levelUpDrain';
import { runEnemySpellCastBeats } from '../utils/spellCastBeats'; // [2026-09-19 方案C] AI 施法三拍
import { nextAnimId } from '../utils/animId'; // [2026-09-04 莉莉子] 全局唯一动画 ID（替代 Date.now()，修抽卡动画 key 撞车）
import { eventBus, GameEvents } from '../utils/eventBus';
import { applyChannelOnSummon, applyEchoOnPlay, getPower, getHealth } from '../logic/keywords'; // [2026-09-22 修复] getHealth 统一有效血量口径 // [2026-08-06 莉莉子] Echo 回响
import { checkCardLevelUp, accumulateMauxirDamage, applyBeaconDeaths, isSummonerOrSummon, markLeveledUp, isLeveledUpForSide, assembleBeaconCard, grantBeaconRespawnEffect, hasLiveMarian, canPlayerRetractBlocker, collectFieldUnits, sideOfUnit, setNexusMaxSnapshot, isNexusImmune, setSpellCostDownAllSnapshot, applySpellCostDownToNewCard, resetSpellCastState } from '../utils/gameRules';
import { gameLogger } from '../utils/gameLogger'; // [新增] 引入战术审计黑匣子探针
import { bumpAnimProgress, animGuard, ANIM_STALL_MS, LEVELUP_STALL_GRACE_MS } from '../utils/animGuard'; // [2026-09-03] animating 停滞看门狗心跳 · [2026-10-05] + 升级链宽限阈值
import { recoverCombatSurvivors } from '../utils/combatRecovery'; // [2026-09-03] 交战区幸存者应急归位
import { applyBeaconFuse } from '../utils/beaconFuse'; // [2026-10-09 莉莉子 BUG修复 · BUG-20261009-01] 信标引爆倒计时的唯一实现（进攻宣告 + 飞剑造剑 两个调用点共用）
// [2026-10-05 莉莉子 BUG修复 · 20261005-03] 【无法攻击】归零/还原的**唯一出口**（模块级账本，hook 与纯逻辑层共用）
import { applyCantAttackZeroPower, restoreCantAttackPower } from '../utils/cantAttackLedger';
// [2026-10-05 莉莉子 BUG修复 · 20261005-12] 「unit_die 强化已派发」账本（与 `isDead` 解耦；见文件头注释）
import { markUnitDieDispatched, hasUnitDieDispatched } from '../utils/deathLedger';
// [2026-10-06 莉莉子 BUG修复 · BUG-20261006-01] 猫汐尔升级进度：真源账本 + 幂等贴值（含交战区）
import { applyMauxirProgress, applyMauxirProgressToField, resetMauxirProgress } from '../utils/mauxirProgress';
import { useRoundLifecycle } from './useRoundLifecycle'; // [核心新增] 引入剥离的回合生命周期引擎
import { getRogueDefs, flashRogueBuff, applyPermanentBuff, applyStatBalance, getEquipTriggers, isStrikeTargetAlive } from '../logic/rogueBattle'; // [2026-08-11] 迷宫强化战斗内分发（分发已收编 rogueTrigger）· [2026-09-15] isStrikeTargetAlive 打击成长的存活判据
import { runRogueTrigger, commitSlicePatch, getSpellCostDownAll, type RogueTriggerCtx, type Side } from '../logic/rogueTrigger'; // [2026-09-09 重构] 迷宫强化统一串行触发引擎
import { executeEquipmentOnPlay } from '../logic/equipment'; // [2026-08-12] 装备系统：打出时效果执行
import { attachEquipment, getArmamentNexusCost, getEquipmentById } from '../data/equipment'; // [2026-08-12] 装备挂载 · [2026-09-25] 遗嘱转移 / Pact 水晶代价
// [2026-09-25 莉莉子 三线任务化框架] 任务进度中枢：推进 / 判定 / 兑现查询
import { advanceEnhQuests, advanceSpellManaGrowth, applyGearQuestReward, gearQuestState, questCount, questKey, runGearQuestStep } from '../logic/questTracker';
import { getBuffById } from '../data/roguelike/buffs'; // [2026-09-25 莉莉子] 进度 UI：任务版强化的名字
import type { QuestEvent } from '../data/questTypes'; // [2026-09-25] 任务事件类型（装备线统一入口签名用）

// [修复 A] 显式断言类型，并确保 createCard 返回的是 Partial CardData 或正确的基类
const createFullCard = (key: string): CardData => {
    const base = createCard(key);
    // 强制断言 base 为 Partial<CardData> 以便与后续属性合并
    // 或者直接构建完整对象并断言为 CardData
    return applySpellCostDownToNewCard('player', {
        ...base,
        id: Math.random().toString(36).substr(2, 9),
        strikeCount: 0,
        animState: 'idle',
        damageTaken: 0,
        buffs: { power: 0, health: 0 },
        roundBuffs: { power: 0, health: 0 }, // [新增] 初始化临时账本
        roundStrikes: 0, // [新增] 初始化本回合打击数
        // [核心修复] 初始充能写死在建卡瞬间！从牌库抽出来时就已经装好电池了
        customProgress: key === 'Chongye_Squad_Elice' ? 1 : 0,
        // [能力] 初始化运行时状态：在牌库/手牌中时隐藏，上场后由 playCard 设为 breathing
        abilityState: (base as any).ability ? 'hidden' as const : undefined,
        abilityCharges: (base as any).ability?.maxCharges,
    } as CardData);
};

// [修正] 定义 shuffleDeck 函数 (解决 TS2552, TS2304)
const shuffleDeck = <T>(array: T[]): T[] => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
};
// ==========================================
// [2026-09-19 莉莉子 BUG修复] 死亡票去重探针
// ── 病根：同一次死亡会被开两张「UNIT_DIED 票」，亡语因此结算两遍
//    （獠牙信标连炸两次：一张票算敌方、一张票算玩家方 → 8 点分摊把全场都炸了）
// ── 两个开票口：
//      ① judgeLifeAndDeath 推入微队列（先 emit 再 push）
//      ② 监听器 handleUnitDeath —— 听到①的 emit 后又开一张
// ── 口径：谁先开票谁生效，后来者跳过（两张票归属若不同，先到的那张才是当场判决结果）
// ==========================================
const hasDeathTicket = (queue: { type: string; payload?: any }[], id: string): boolean =>
    queue.some(a => a.type === 'UNIT_DIED' && a.payload?.unit?.id === id);

// ★ 教程初始战场配置
export interface TutorialInitState {
    playerField?: { cardKey: string; hp: number; power: number }[];
    enemyField?: { cardKey: string; hp: number; power: number }[];
    playerBench?: string[];
    playerHand?: string[];
    playerCrystalHp?: number;
    enemyCrystalHp?: number;
    playerMana?: number;
    playerMaxMana?: number;
    enemyMana?: number;
    enemyMaxMana?: number;
}

// 1. 接收 initialDeck 参数，默认为空数组
export const useGameState = (deck: string[], enemyDeck: string[], isSandbox: boolean = false, disableMulligan: boolean = false, tutorialInit?: TutorialInitState, firstAttacker: 'player' | 'enemy' = 'player', initialPlayerNexus?: number, playerNexusMax?: number, rogueEnhancements: string[] = [], rogueEquipments: Record<string, string[]> = {}, enemyEnhancements: string[] = [], initialEnemyNexus?: number, enemyEquipments: Record<string, string[]> = {}) => {
    // ── [2026-10-04 程拍板] 同步「水晶生命上限」快照 ──
    //   芬妮升级口径已改为「任一方水晶 ≤ **其自身上限**的一半」，判定（combat.ts）与 UI 进度（Card.tsx）
    //   都拿不到 game.playerNexusMax / enemyNexusMax，靠 props 层层下传必漏（历史病：漏一处那处静默退回 20）。
    //   上限在**一局之内不变**，所以在对局初始化这里同步一次即可（快照定义见 gameRules.ts）。
    //   ⚠️ 纯模块级赋值、幂等 ⇒ 与 useRoguelikeRun 的 `runRef.current = run` 同款，StrictMode 重复执行无副作用。
    setNexusMaxSnapshot(playerNexusMax ?? 20, initialEnemyNexus ?? 20);

    // --- 1. 状态定义 ---
    // [2026-09-26 T17 猎影标记] 补 `isExtraAttack` —— 法术装配的「额外攻击」战线标记
    //   （归位时不消耗进攻标识 / 强制进入格挡阶段，见 passTurn 守卫与 runResolveCombatAnimation）
    const [combatField, setCombatField] = useState<{attacker: CardData, blocker: CardData | null, owner: 'player' | 'enemy', isChallenged?: boolean, isExtraAttack?: boolean}[]>([]);

    const [game, setGame] = useState<GameState>({
        playerMana: 0, playerMaxMana: 0, playerSpellMana: 0,
        enemyMana: 0, enemyMaxMana: 0, enemySpellMana: 0,
        // [2026-09-25 莉莉子 武装线] Pact 开局代价（王权之证等）：水晶初值直接扣，下限 1（防开局即败）
        playerNexus: Math.max(1, (initialPlayerNexus ?? 20) - getArmamentNexusCost(rogueEquipments)), // [2026-08-11] 肉鸽真衔接：初值=run.hp
        playerNexusMax: playerNexusMax ?? 20, // [2026-08-11] 玩家水晶回血上限（肉鸽=run.maxHp）
        playerNexusBarrier: 0, // [2026-08-27] 玩家水晶屏障（固若金汤累积，受击先挡）
        rogueEnhancements: rogueEnhancements || [], // [2026-08-11] 玩家迷宫强化 id（战斗内 battleEffect 分发）
        enemyEnhancements: enemyEnhancements || [], // [2026-08-27] 敌方迷宫强化 id（战斗内 battleEffect 分发）
        enemyNexus: initialEnemyNexus ?? 20, // [2026-08-28] 敌方水晶初始血量（肉鸽=难度基础+生命强化，缺省 20）
        enemyNexusMax: initialEnemyNexus ?? 20, // [2026-08-30 莉莉子] 敌方水晶回血上限（=敌方水晶初值，防回血压血）
        enemyNexusBarrier: 0, // [2026-08-27] 敌方水晶屏障（固若金汤累积，受击先挡）
        round: 0,
        attackToken: { player: null, enemy: null },
        phase: 'mulligan',
        turnOwner: 'player',
        consecutivePasses: 0,
        spellCasting: null,
        pendingSpell: null,
        spellStack: [],
        activeCard: null,
        selectedBlockerId: null,
        selectedChallengerId: null, // [新增]
        lastActionTimestamp: 0,
        levelUpCard: null,
        fullArtCard: null,
        gameResult: null,
        screenShake: false,
        nexusDamage: undefined,
        leveledChampions: [],
        leveledChampionsBySide: { player: [], enemy: [] }, // [2026-09-13] 分阵营升级标记
        pendingLevelUps: [], // [新增] 初始化待升级队列
        stats: {
            nexusDamage: 0,
            unitsPlayed: 0,
            heroesPlayed: 0,
            spellsPlayed: 0,
            unitsKilled: 0,
            heroesKilled: 0,
            heroLevelUps: 0
        },
        everywhereBuffs: [], // [核心新增] 全域光环账本：用于记录各处 Buff
        friendlyUnitDeaths: 0, // [2026-07-14 梵音] 我方单位阵亡计数器
        enemyUnitDeaths: 0, // [2026-07-15] 敌方单位阵亡计数器
        playerGraveyard: [], // [2026-08-06 莉莉子] 我方墓地（死亡单位快照）
        enemyGraveyard: [], // [2026-08-06 莉莉子] 敌方墓地（死亡单位快照）
        // [2026-07-29 安卡希雅] 飞剑计数系统
        playerFlyingSwordsTotal: 0,
        playerGreatSwordsTotal: 0,
        playerRoundSwordUsed: false,
        playerRoundFlyingSwords: 0,
        enemyFlyingSwordsTotal: 0,
        enemyGreatSwordsTotal: 0,
        enemyRoundSwordUsed: false,
        enemyRoundFlyingSwords: 0,
        gameRecords: [], // [2026-07-20] 对局操作记录
    } as any); // [修改] 强转为 any 以免除由于新增字段导致的严格类型报错
// 新增：牌库状态 (Deck)
    const [playerDeck, setPlayerDeck] = useState<CardData[]>([]);
    const [enemyDeckState, setEnemyDeckState] = useState<CardData[]>([]);
    const [playerInitialDeckInfo, setPlayerInitialDeckInfo] = useState<{ heroes: CardData[], regions: string[] }>({ heroes: [], regions: [] });
    const [enemyInitialDeckInfo, setEnemyInitialDeckInfo] = useState<{ heroes: CardData[], regions: string[] }>({ heroes: [], regions: [] });
    // [新增] 将当前手牌全部放回牌库顶端 (用于换牌结束后的衔接)

    const [playerHand, setPlayerHand] = useState<CardData[]>([]);
    const [enemyHand, setEnemyHand] = useState<CardData[]>([]);
    const [playerBench, setPlayerBench] = useState<CardData[]>([]);
    const [enemyBench, setEnemyBench] = useState<CardData[]>([]);

    // ══════════════════════════════════════════════════════════════════
    // [2026-09-13 莉莉子] 沙盒守卫开关（L2-A）
    //
    // 沙盒默认跳过若干"真机守卫"（如交战区不变量守卫），因为自由造场不该被守卫干预。
    // 但这会造成测试盲区 —— **守卫本身引发的 BUG 在沙盒里永远复现不了**，
    // 于是出现"沙盒里测通了、玩家真机还犯"。
    //
    // 故加显式开关：默认 false（保留原有的自由造场体验）；
    // 沙盒界面可一键打开「守卫照跑」，让沙盒行为贴近真机。
    // ══════════════════════════════════════════════════════════════════
    const [sandboxGuardEnabled, setSandboxGuardEnabled] = useState(false);

    // 新增：记录胜利时存活的英雄 Key，用于播放对应的胜利 CG
    const [winningHeroKeys, setWinningHeroKeys] = useState<string[]>([]);

    const [message, setMessage] = useState("游戏开始！");

    // 状态 Refs (用于解决异步闭包陈旧数据问题)
    const stateRefs = useRef({ game, playerBench, enemyBench, combatField, playerHand, enemyHand });
    const heroActionHistory = useRef<Set<string>>(new Set());
    const initializedRef = useRef(false);
    const enemyUnitsPlayedRef = useRef(0);
    // [新增] State Ref: 用于在异步循环中获取最新状态 (加入 Deck 状态)
    const stateRef = useRef({ game, combatField, playerBench, enemyBench, playerHand, enemyHand, playerDeck, enemyDeck: enemyDeckState });

    // ═══ [2026-09-25 莉莉子 三线任务化框架 · 装备线] 统一入口 ═══
    //   装备任务的事件语义分两类：
    //     · 按卡实例（unit_attack / card_block / unit_kill）→ 调用方显式传当事人那一张卡
    //     · 我方全局（cast_spell / play_unit / nexus_damaged / unit_die）→ 不传卡则推进所有【在场】己方卡
    //   推进与兑现都收口在这里，各站点一行即可；无匹配任务时直接 return（一步 setState 都不触发）。
    const runGearQuest = useCallback((
        events: QuestEvent | QuestEvent[],
        cards?: (CardData | undefined)[],
        opts?: { amount?: number; when?: { nexusPct?: number } }, // amount=按量累计（血债账簿）；when=常驻条件上下文（背水之刃）
    ) => {
        const evs = Array.isArray(events) ? events : [events];
        const list = cards ?? [
            ...stateRef.current.playerBench,
            ...stateRef.current.combatField.filter(f => f.owner === 'player').map(f => f.attacker),
        ];
        // ⚠️ 多个事件必须在本函数内**串行累加同一份进度表**再一次性写回：
        //    setGame 是异步的，分成两次调用会各自基于同一份旧 stateRef 计算 → 后一次覆盖前一次。
        let progress = stateRef.current.game.questProgress;
        const hits: { cardId: string; reward: Parameters<typeof applyGearQuestReward>[1] }[] = [];
        for (const ev of evs) {
            const step = runGearQuestStep(progress, list, ev, opts);
            if (!step.changed) continue;
            progress = step.progress;
            hits.push(...step.hits);
        }
        if (progress === stateRef.current.game.questProgress) return; // 无匹配任务 → 一步 setState 都不触发
        setGame(prev => ({ ...prev, questProgress: progress! }));
        if (!hits.length) return;
        // 兑现：按 cardId 在备战席 / 交战区两处就地改写（同一张卡只可能在其中一处）
        const byId = new Map(hits.map(h => [h.cardId, h.reward]));
        const applyTo = (c: CardData) => { const r = byId.get(c.id); return r ? applyGearQuestReward(c, r) : c; };
        setPlayerBench(prev => prev.map(applyTo));
        setCombatField(prev => prev.map(f => {
            let n = f;
            if (n.attacker) { const a = applyTo(n.attacker); if (a !== n.attacker) n = { ...n, attacker: a }; }
            if (n.blocker) { const b = applyTo(n.blocker); if (b !== n.blocker) n = { ...n, blocker: b }; }
            return n;
        }));
    }, []);

    /**
     * [2026-09-25 莉莉子 三线任务化框架] 提交触发引擎 ctx 的 **game 级变更**。
     *   ⚠️ 必须"逐键对比播种快照、只写回真正变了的字段"：
     *     · 直接 setGame(ctx.game) 会把整个 game 换成陈旧副本，洗掉同期别的字段
     *     · game_start / unit_die 两个站点原本**完全没有** game 级提交，效果会被静默丢弃（已分别补上）
     */
    const commitDirtyGame = useCallback((ctxGame: GameState, seeded: GameState) => {
        setGame(prev => {
            const next: GameState = { ...prev };
            const mutable = next as unknown as Record<string, unknown>;
            for (const k of Object.keys(ctxGame) as (keyof GameState)[]) {
                if (ctxGame[k] !== seeded[k]) mutable[k as string] = ctxGame[k];
            }
            return next;
        });
    }, []);

    // ═══ [2026-09-25 莉莉子 三线任务化框架 · 进度可见性] 单场任务进度 → 广播给 UI ═══
    //   一处收口（只监听 questProgress 变化），自动覆盖所有推进站点（打击 / 格挡 / 施法 / 水晶受伤 / 亡语…）。
    //   设计依据：炉石任务牌的坑 #1「进度必须公开可见」—— 没有进度显示，"任务引导玩家"就无从谈起。
    useEffect(() => {
        const prog = game.questProgress;
        const rows: { key: string; name: string; sub?: string; current: number; threshold: number; done: boolean }[] = [];
        // ① 任务版迷宫强化（如铁誓）
        for (const id of game.rogueEnhancements ?? []) {
            const b = getBuffById(id);
            const q = b?.quest;
            if (!b || !q) continue;
            const cur = Math.min(questCount(prog, questKey.enh(id)), q.threshold);
            rows.push({ key: `enh:${id}`, name: b.name, sub: '迷宫强化', current: cur, threshold: q.threshold, done: cur >= q.threshold });
        }
        // ② 在场卡身上的任务型装备（用 stateRef 读卡，避免把 bench/field 放进依赖导致高频广播）
        const cards = [
            ...stateRef.current.playerBench,
            ...stateRef.current.combatField.filter(f => f.owner === 'player').map(f => f.attacker),
        ].filter(Boolean) as CardData[];
        for (const c of cards) {
            for (const eid of c.equipment ?? []) {
                const st = gearQuestState(prog, c.id, eid);
                if (!st) continue;
                rows.push({ key: `gear:${c.id}:${eid}`, name: getEquipmentById(eid)?.name ?? eid, sub: c.name, current: st.current, threshold: st.threshold, done: st.done });
            }
        }
        eventBus.emit(GameEvents.ROGUE_QUEST_UI, { scope: 'battle', rows });
    }, [game.questProgress, game.rogueEnhancements]);
    // 👇 [新增] 微队列缓冲区 (Micro-Queue Buffer)
    const pendingActionsRef = useRef<{ type: string; payload?: any }[]>([]);
    // ==========================================
    // [2026-10-05 莉莉子 BUG修复 · 20261005-03] 【无法攻击】归零/还原已抽成**唯一出口**
    // ── 病根（程实测）：主动用「臆莲基座」进攻 → 攻击力归零 → 结算完回备战席，攻击力没还原。
    //    原实现是本地 ref + 内联函数，回席出口只接了 3 条（撤回进攻 / 撤回格挡 / 战斗收尾），
    //    而"回备战席"另有 4 条出口**没接账本**：应急归位（combatRecovery）、异常/残留收尾、
    //    「召回」、千莲叠绽换位 ⇒ 任何一条走到，单位就带着 0 攻回席。
    // ── 现改为模块级账本（`utils/cantAttackLedger`）——hook 与纯逻辑层共用同一份：
    //    进场 `applyCantAttackZeroPower` · 回席 `restoreCantAttackPower`，且**记账幂等**（真值不被覆盖）。
    // ==========================================
    // [2026-07-30] 追踪进攻标识变化 → 触发 ON_GET_ATTACK_TOKEN（安卡「获得进攻标识时」）
    // [2026-10-06 程拍板 · 序号去重] **判据从"标识值 / 时间窗"改成"授予账本"** ——
    //   ── 病根（程实测）：**格挡回合**打出「灵轨月轮·扩散」→ 侦察给出标识（`null → 'rally'`）
    //      ⇒ 场上的安卡希雅**没有**生成下一张灵轨月轮。
    //      ∵ 旧判据是 `curr === 'rally' && prev !== 'rally' && prev !== null`（原注自称
    //        「normal→rally 升级检测器」），而回合初那一份归 `useRoundLifecycle` 的**块 B**
    //        ⇒ **"本来没标识、回合内被补一个 rally"两个派发点都不管**。
    //      ⚠️ 而单纯去掉 `prev !== null` 会**双发** —— 块 B 是在 **+100ms 定时器里读「实时」状态**的
    //        （边界**不是**提交批次）⇒ 落在那个窗口里的授予会被两边各发一次。
    //   ── 现口径（**与时序无关**）：`grantExtraAttackTurn` 是「追加进攻权」的**唯一出口**，
    //      每次真正授予都写 `tokenGrantSeq[side]++`；本检测器与块 B 都按
    //      「`seq > handled` 才派发、派发后把 `handled` 追平」去重 ⇒ **一次授予 = 一次派发**。
    //      这也终于满足 `processOnGetAttackToken` 自己的文档承诺：「**任何**获得进攻标识的场景」。

    // [2026-09-19 莉莉子 茉莉安·信标] 引爆幂等的两枚钉子（声明位置对齐 pendingActionsRef：
    //   下方 UNIT_DIED 分支与「引爆对账器」都要用，必须早于二者声明）
    //   exploded = 已真正引爆过的信标 id（钉在引爆动作上，杜绝任何来源的二次引爆）
    //   ticketed = 对账器补过票的 id
    const beaconExplodedRef = useRef<Set<string>>(new Set());
    const reconcileTicketedRef = useRef<Set<string>>(new Set());
    // [2026-10-06 独立审查修复 · StrictMode / 同 tick 重入] 账本只在**提交之后**才起去重作用，
    //   而 React 严格模式会把 effect 连调两次（两次读到同一份**未提交**状态）⇒ 判据会连过两次。
    //   用 ref 立刻钉住"本次已派发的授予序号"，跨提交由 `tokenGrantHandled` 兜底。
    const tokenDispatchRef = useRef<{ player: number; enemy: number }>({ player: 0, enemy: 0 });
    useEffect(() => {
        // 换牌 / 开局首帧：一律不派发（回合初那一份由块 B 负责）
        if (game.phase === 'mulligan' || game.round <= 0) return;

        (['player', 'enemy'] as const).forEach(sideKey => {
            const grantSeq = game.tokenGrantSeq?.[sideKey] ?? 0;
            const handledSeq = Math.max(
                game.tokenGrantHandled?.[sideKey] ?? 0,
                tokenDispatchRef.current[sideKey] ?? 0,
            );
            if (grantSeq <= handledSeq) return; // 该侧没有"尚未派发"的授予
            tokenDispatchRef.current[sideKey] = grantSeq; // 立刻钉住（防同 tick / 严格模式二次进入）
            const tokenResult = processOnGetAttackToken(sideKey, {
                game, playerBench, enemyBench, playerHand, enemyHand,
                playerDeck, enemyDeck: enemyDeckState,
                combatField,
                // [2026-10-06 程拍板 · 新增强化「霜锋乘势」] 传入建卡工厂 ⇒ 该入口同时派发
                //   迷宫强化的 `on_get_attack_token`（与块 B 同源）
                createFullCard,
            });
            if (tokenResult.playerHand) setPlayerHand(tokenResult.playerHand);
            if (tokenResult.enemyHand) setEnemyHand(tokenResult.enemyHand);
            if (tokenResult.playerBench !== playerBench) setPlayerBench(tokenResult.playerBench);
            if (tokenResult.enemyBench !== enemyBench) setEnemyBench(tokenResult.enemyBench);
            // [2026-10-06] 迷宫派发可能改牌库 / 交战区（如未来的减费、落场类效果）⇒ 一并提交
            if (tokenResult.playerDeck && tokenResult.playerDeck !== playerDeck) setPlayerDeck(tokenResult.playerDeck);
            if (tokenResult.enemyDeck && tokenResult.enemyDeck !== enemyDeckState) setEnemyDeckState(tokenResult.enemyDeck);
            if (tokenResult.combatField && tokenResult.combatField !== combatField) setCombatField(tokenResult.combatField);
            setGame(prevGame => {
                // [2026-10-06 独立审查修复 · 陈旧底稿] **不能拿 `tokenResult.game` 当底** ——
                //   它派生于**效果闭包里的旧快照**：直接铺开会把同批其它提交（例如结算刚打的授予序号、
                //   或另一侧刚写的 handled）一起回滚。⇒ 以**队列最新状态**为底，只把"效果**真正改动**的键"
                //   打补丁进去，再合并本侧的 handled 标记。
                const patch: Record<string, unknown> = {};
                if (tokenResult.game && tokenResult.game !== game) {
                    for (const k of Object.keys(tokenResult.game)) {
                        if ((tokenResult.game as any)[k] !== (game as any)[k]) patch[k] = (tokenResult.game as any)[k];
                    }
                }
                return {
                    ...prevGame,
                    ...patch,
                    tokenGrantHandled: { player: 0, enemy: 0, ...(prevGame.tokenGrantHandled ?? {}), [sideKey]: grantSeq },
                } as GameState;
            });
        });
    }, [game.attackToken.player, game.attackToken.enemy, game.phase, game.round,
        game.tokenGrantSeq?.player, game.tokenGrantSeq?.enemy,
        game.tokenGrantHandled?.player, game.tokenGrantHandled?.enemy]);
    useEffect(() => {
        stateRef.current = { game, combatField, playerBench, enemyBench, playerHand, enemyHand, playerDeck, enemyDeck: enemyDeckState };
    }, [game, combatField, playerBench, enemyBench, playerHand, enemyHand, playerDeck, enemyDeckState]);

    // 辅助函数：异步等待
    const wait = (ms: number): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, ms));

    // ==========================================
    // [2026-07-20] 对局操作记录 — 写入函数
    // ==========================================
    const recordIdRef = useRef(0);
    const recordAction = (
        category: GameRecordCategory,
        owner: 'player' | 'enemy',
        summary: string,
        options?: { cardKey?: string; detail?: string; entities?: RecordEntity[] }
    ) => {
        recordIdRef.current++;
        setGame(prev => ({
            ...prev,
            gameRecords: [...prev.gameRecords, {
                id: `rec-${recordIdRef.current}`,
                turn: prev.round,
                owner,
                category,
                summary,
                cardKey: options?.cardKey,
                detail: options?.detail,
                entities: options?.entities,
            }]
        }));
    };
    // ==========================================

    // [2026-07-21] 卡牌状态快照 — 冻结这一刻的数值
    const captureSnapshot = (card: CardData) => ({
        power: card.power || 0,
        health: card.health || 0,
        maxHealth: card.maxHealth || card.health || 0,
        damageTaken: card.damageTaken || 0,
        buffs: card.buffs ? { health: card.buffs.health, power: card.buffs.power } : undefined,
        roundBuffs: card.roundBuffs ? { health: card.roundBuffs.health, power: card.roundBuffs.power } : undefined,
    });

    // ==========================================
    // [核心重构] 挂载独立的生命周期引擎
    // ==========================================
    const { startRound, executeRoundEndSequence, triggerFirstRoundRogueEnhance } = useRoundLifecycle({
        stateRef,
        heroActionHistory,
        enemyUnitsPlayedRef,
        game,
        setGame,
        setPlayerBench,
        setEnemyBench,
        setCombatField,
        setPlayerHand,
        setEnemyHand,
        setPlayerDeck,
        setEnemyDeckState,
        setMessage,
        createFullCard,
        firstAttacker, // [新增] 传递给回合引擎校正进攻标识偏移
        // [战术规避] 使用箭头函数包裹，规避 const 声明不会提升导致的”在初始化前访问”的报错死锁！
        flushMicroQueue: () => flushMicroQueue(),
        judgeLifeAndDeath: () => judgeLifeAndDeath(),   // [SBA] 生死簿同步判决
        wait,
        // [2026-07-23] 对局记录注入
        recordAction,
        captureSnapshot,
        // [2026-08-14 武装] 秘法回响：玩家挂载则回合开始恢复全部法术法力
        // [2026-10-06 莉莉子 · 审计收口 · **模式 C（硬编码 id 暗接线）**] 原先靠**硬编码 id** `'arm_spell_mana'` 认，
        //   而它数据里声明的 `onRoundStart.class = 'RESTORE_SPELL_MANA'` **全项目零消费者** ⇒
        //   改 id / 复制一件同类武装都会**静默失效**（类型检查也拦不住）。现改为**按声明字段读**。
        //   ⚠️ 与本次「碳原子板 / 重修申请」两处收口是同一口径：**数据即真源，代码不写 id**。
        armamentManaRestore: Object.values(rogueEquipments || {})
            .some(list => list.some(id => getEquipmentById(id)?.onRoundStart?.class === 'RESTORE_SPELL_MANA')),
    });

    // --- 3. 基础操作 ---

    const triggerShake = () => {
        setGame(prev => ({ ...prev, screenShake: true }));
        setTimeout(() => setGame(prev => ({ ...prev, screenShake: false })), 500);
    };

    // [2026-10-07 莉莉子 · 打击感] 分档震屏 —— 专供战斗撞水晶路径。
    //   ── 背景：`triggerShake` 全项目**只被法术路径调用**（spells.ts:109），
    //      所以"法术打水晶会全屏震、单位拼死冲上去砸水晶只有水晶自己抖 4px"，力度感是反的。
    //   ── 为什么不直接改 triggerShake 的签名：那会连带改动 spells.ts / useSpellSystem.ts 的类型声明，
    //      而法术路径不在本次范围内 ⇒ 这里**新增**一个函数，法术路径零影响。
    //   ── 档位时长与 index.css 的 .animate-shake-{sm,md,lg} 一一对应，改一处必须改两处。
    const NEXUS_SHAKE_MS: Record<'sm' | 'md' | 'lg', number> = { sm: 180, md: 280, lg: 420 };
    const triggerNexusShake = (level: 'sm' | 'md' | 'lg') => {
        setGame(prev => ({ ...prev, screenShake: level }));
        setTimeout(() => setGame(prev => ({ ...prev, screenShake: undefined })), NEXUS_SHAKE_MS[level]);
    };

    // ==========================================
    // [核心重构] 挂载独立的法术系统引擎
    // ==========================================
    const {
        startSpellCasting, updateSpellCasting, commitSpell,
        cancelChoice, resolveChoice,
        withdrawSpellFromStack, confirmPendingSpell, cancelPendingSpell,
        resolveStack
    } = useSpellSystem({
        stateRef,
        game,
        playerBench,
        setGame, setPlayerBench, setEnemyBench, setCombatField,
        setPlayerHand, setEnemyHand, setPlayerDeck, setEnemyDeckState,
        setMessage,
        createFullCard,
        flushMicroQueue: () => flushMicroQueue(),
        judgeLifeAndDeath: () => judgeLifeAndDeath(),   // [SBA] 生死簿同步判决
        wait,
        // [2026-08-16 莉莉子] 删除多余传参 waitForStrikeComplete：useRoundLifecycle 内部自带同名局部函数（L18），接口无此字段
        triggerShake,
        onComplete: () => {}, // useGameState 内部直接调用引擎，不需要处理 UI 层的完成回调
        // [2026-10-04 莉莉子 BUG修复 · I3a] 法术回库生成的英雄副本要带装备/武装 ⇒ 把两张表交给法术系统
        //   （程口径：「法术回库生成的英雄副本应该要带装备」）
        playerEquipments: rogueEquipments,
        enemyEquipments,
    });

    useEffect(() => {
        stateRefs.current = { game, playerBench, enemyBench, combatField, playerHand, enemyHand };
    }, [game, playerBench, enemyBench, combatField, playerHand, enemyHand]);

    // [2026-07-20 对局记录] 监听法术施放事件（从 commitSpell 发射）
    useEffect(() => {
        const onSpellRecord = (payload: { card: CardData; owner: 'player' | 'enemy'; targets: any[] }) => {
            recordAction('spell_cast', payload.owner, `施放 ${payload.card.name}`, {
                cardKey: payload.card.key,
                entities: [{ cardKey: payload.card.key, owner: payload.owner, snapshot: captureSnapshot(payload.card) }]
            });
        };
        eventBus.on('spell_record', onSpellRecord);
        return () => eventBus.off('spell_record', onSpellRecord);
    }, []);

    // [2026-07-21 对局记录] 监听法术效果事件（从 resolveStack 发射）
    useEffect(() => {
        const onSpellEffect = (payload: { owner: 'player' | 'enemy'; spellCardKey: string; summary: string; entities: RecordEntity[] }) => {
            const card = CARD_DB[payload.spellCardKey] as CardData | undefined;
            recordAction('spell_effect', payload.owner, payload.summary || (card ? `法术效果` : '法术效果'), {
                cardKey: payload.spellCardKey,
                entities: payload.entities,
            });
        };
        eventBus.on('spell_effect_record', onSpellEffect);
        return () => eventBus.off('spell_effect_record', onSpellEffect);
    }, []);

    // ==========================================
    // [2026-10-08 莉莉子 · 对局记录补齐] 监听「能力效果」事件 —— 统一入库入口
    //   ── 病根：记录系统是**操作驱动**的（埋点全挂在"有人点了什么"处），而
    //      基座扫射 / 信标引爆 / 亡语 / 光环这类**效果结算的副产物**没有对应的"操作"
    //      ⇒ 此前一律不进对局记录（基座伤害出问题时无从回查）。
    //   ── 本监听是这类事件的唯一入口（语义对齐上面的 `spell_effect_record`）：
    //      逻辑层只管 `eventBus.emit('ability_record', {...})`，入库统一走这里 ——
    //      避免以后每加一个能力就到处补埋点（"需要监控所有路径"的设计迟早会漏）。
    // ==========================================
    useEffect(() => {
        const onAbilityRecord = (payload: {
            owner: 'player' | 'enemy';
            summary: string;
            cardKey?: string;
            detail?: string;
            entities?: RecordEntity[];
        }) => {
            recordAction('ability_effect', payload.owner, payload.summary, {
                cardKey: payload.cardKey,
                detail: payload.detail,
                entities: payload.entities,
            });
        };
        eventBus.on('ability_record', onAbilityRecord);
        return () => eventBus.off('ability_record', onAbilityRecord);
    }, []);

    useEffect(() => {
        // [2026-10-06 莉莉子 BUG修复 · BUG-20261006-01] 新对局开局：猫汐尔进度账本清零
        //   ⚠️ 必须放在**沙盒早退之前** —— 沙盒分支会提前 return
        //      （独立审查回执 R.5：放在早退之后 ⇒ 进出 Studio 沙盒会**继承上一局的账本**）。
        //   ⚠️ 建局入口有**两处**（本初始构建 effect + `resetGame`），两处都要清
        //      —— 与装备/武装"两个建局入口"同源（2026-08-25 正是漏了一处才出事）。
        resetMauxirProgress();
        // [2026-10-06 莉莉子 BUG修复 · 莲台无垠] 「全法术 −N」快照（**建卡之前**就要设好）——
        //   查询口径 `getEffectiveSpellCost` 据此给**所有**法术减费（含战斗中生成的），
        //   不再依赖"开局那一刻改数据"（那正是它原先漏掉生成法术的原因）。
        setSpellCostDownAllSnapshot(getSpellCostDownAll(rogueEnhancements), getSpellCostDownAll(enemyEnhancements));
        resetSpellCastState(); // [2026-10-08 第二波] 施法计数快照（条件减费判据）每局重设

        // [新增] 沙盒模式拦截：不自动发牌，不洗牌，直接进入主阶段，给足 99 费用
        if (isSandbox) {
            setGame(prev => ({
                ...prev,
                round: 1,
                phase: 'main',
                turnOwner: 'player',
                playerMana: 10, playerMaxMana: 10, playerSpellMana: 3,
                enemyMana: 10, enemyMaxMana: 10, enemySpellMana: 3,
                attackToken: { player: 'normal', enemy: null },
                // [2026-10-06 独立审查修复 · 跨局泄漏] 沙盒走的是"铺 prev + 直接写 round:1"，
                //   不会经过 `calculateRoundStart` 的 round-0 清零 ⇒ 在这里显式清授予账本。
                tokenGrantSeq: { player: 0, enemy: 0 },
                tokenGrantHandled: { player: 0, enemy: 0 },
                consecutivePasses: 0
            }));
            return;
        }

        // 1. 创建完整卡牌对象
        const validPlayerDeck = deck.filter(key => CARD_DB[key]);
        const validEnemyDeck = enemyDeck.filter(key => CARD_DB[key]);

        const pDeck = validPlayerDeck.map(key => {
            // [2026-08-25 莉莉子] 初始对局构建应用装备/武装（此前只在 resetGame 应用、而 GameSession 不调 resetGame → 首次进对局装备/武装全部失效；标准/教程 rogueEquipments 为空零影响）
            let card = createFullCard(key);
            const equips = rogueEquipments?.[key];
            if (equips?.length) {
                for (const eid of equips) card = attachEquipment(card, eid);
            }
            return card;
        });
        const eDeck = validEnemyDeck.map(key => {
            // [2026-08-30 程拍板] 敌人随机装备：构建敌方卡时 attachEquipment（难度分级，数值/关键词生效）
            let card = createFullCard(key);
            const equips = enemyEquipments?.[key];
            if (equips?.length) for (const eid of equips) card = attachEquipment(card, eid);
            return card;
        });

        const extractDeckInfo = (deckCards: CardData[]) => {
            const heroes = deckCards.filter(c => c.isChampion);
            // 根据 key 去重（同名英雄只展示一张）
            const uniqueHeroes = heroes.filter((h, i, arr) => arr.findIndex(x => x.key === h.key) === i);
            const regions = Array.from(new Set(deckCards.map(c => c.region)));
            return { heroes: uniqueHeroes, regions };
        };
        setPlayerInitialDeckInfo(extractDeckInfo(pDeck));
        setEnemyInitialDeckInfo(extractDeckInfo(eDeck));

        // 2. 洗牌
        const shuffledP = pDeck.sort(() => Math.random() - 0.5);
        const shuffledE = eDeck.sort(() => Math.random() - 0.5);

        // ★ 教程模式：由 tutorialInit 布置初始战场，不抽起手牌
        if (disableMulligan && tutorialInit) {
            // [修复] 改用计数 Map 替代 Set，同种卡牌多张时只移除实际被布置的数量
            const reserveCounts: Record<string, number> = {};
            const countReserve = (key: string) => {
                reserveCounts[key] = (reserveCounts[key] || 0) + 1;
            };
            tutorialInit.playerField?.forEach(u => countReserve(u.cardKey));
            tutorialInit.enemyField?.forEach(u => countReserve(u.cardKey));
            tutorialInit.playerBench?.forEach(k => countReserve(k));
            tutorialInit.playerHand?.forEach(k => countReserve(k));

            // 我方备战席：playerField + playerBench 都放备战席
            const pBenchKeys = [
                ...(tutorialInit.playerField || []).map(u => u.cardKey),
                ...(tutorialInit.playerBench || []),
            ];
            const eBenchKeys = [
                ...(tutorialInit.enemyField || []).map(u => u.cardKey),
            ];

            // 创建卡牌时应用 playerField/enemyField 中自定义的 hp/power
            const applyFieldOverrides = (cards: CardData[], fieldConfigs: { cardKey: string; hp: number; power: number }[]) =>
                cards.map(card => {
                    const config = fieldConfigs.find(c => c.cardKey === card.key);
                    if (!config) return card;
                    return { ...card, health: config.hp, maxHealth: config.hp, power: config.power, damageTaken: 0 };
                });

            const benchPCards = applyFieldOverrides(
                pBenchKeys.map(k => createFullCard(k)),
                tutorialInit.playerField || []
            );
            const benchECards = applyFieldOverrides(
                eBenchKeys.map(k => createFullCard(k)),
                tutorialInit.enemyField || []
            );
            const handPCards = (tutorialInit.playerHand || []).map(k => createFullCard(k));
            setPlayerBench(benchPCards);
            setEnemyBench(benchECards);
            setPlayerHand(handPCards);
            setEnemyHand([]);

            // 从牌库中移除已布置的卡牌（只移除指定数量），剩余作为可抽牌库
            const filterDeck = (deckArr: CardData[], counts: Record<string, number>) => {
                const remaining = { ...counts };
                return deckArr.filter(c => {
                    const needed = remaining[c.key];
                    if (needed && needed > 0) {
                        remaining[c.key] = needed - 1;
                        return false; // 移除此张
                    }
                    return true; // 保留
                });
            };
            const filteredP = filterDeck(shuffledP, reserveCounts);
            const filteredE = filterDeck(shuffledE, reserveCounts);
            setPlayerDeck(filteredP);
            setEnemyDeckState(filteredE);

            // ★ 关键：同步更新 ref，否则 startRound() 会读到旧值并覆盖掉
            stateRef.current.playerBench = benchPCards;
            stateRef.current.enemyBench = benchECards;
            stateRef.current.playerHand = handPCards;
            stateRef.current.enemyHand = [];
            stateRef.current.playerDeck = filteredP;
            stateRef.current.enemyDeck = filteredE;

            // 覆盖水晶 HP
            if (tutorialInit.playerCrystalHp !== undefined || tutorialInit.enemyCrystalHp !== undefined) {
                setGame(prev => ({
                    ...prev,
                    playerNexus: tutorialInit.playerCrystalHp ?? prev.playerNexus,
                    enemyNexus: tutorialInit.enemyCrystalHp ?? prev.enemyNexus,
                }));
            }

            // 覆盖初始法力
            if (tutorialInit.playerMana !== undefined || tutorialInit.playerMaxMana !== undefined
                || tutorialInit.enemyMana !== undefined || tutorialInit.enemyMaxMana !== undefined) {
                setGame(prev => ({
                    ...prev,
                    playerMana: tutorialInit.playerMana ?? prev.playerMana,
                    playerMaxMana: tutorialInit.playerMaxMana ?? prev.playerMaxMana,
                    enemyMana: tutorialInit.enemyMana ?? prev.enemyMana,
                    enemyMaxMana: tutorialInit.enemyMaxMana ?? prev.enemyMaxMana,
                }));
            }

            // [安卡希雅] 牌局开始时：扫描所有初始卡牌中的 gameStartGenerate
            (() => {
                const extra: CardData[] = [];
                const tutorHand = [...handPCards];
                const tutorDeck = [...filteredP];
                [...tutorHand, ...tutorDeck].forEach(card => {
                    if (card.effects) {
                        card.effects.forEach(effId => {
                            const def = EFFECT_DB[effId];
                            if (def && def.params?.gameStartGenerate) {
                                const genKey = def.params.gameStartGenerate;
                                const already = [...tutorHand, ...extra].some(c => c.key === genKey);
                                if (!already && tutorHand.length + extra.length < 10) {
                                    extra.push(createFullCard(genKey));
                                    console.log(`[GameStart] 牌局开始：生成 ${genKey} 到手牌`);
                                }
                            }
                        });
                    }
                });
                if (extra.length > 0) {
                    setPlayerHand(prev => [...prev, ...extra]);
                }
            })();
        } else {
            // 标准模式：正常发牌（各抽4张）
            const stdHand = shuffledP.slice(0, 4);
            const stdDeck = shuffledP.slice(4);

            setPlayerDeck(stdDeck);
            setPlayerHand(stdHand);
            setEnemyDeckState(shuffledE);
            setEnemyHand([]);
            setPlayerBench([]);
            setEnemyBench([]);
        }

    }, [deck, enemyDeck, disableMulligan, tutorialInit]);

    // [2026-08-31 莉莉子 修复] game_start 强化防御层：记录本局已召唤过的 summonKey（幽灵行动等），触发仅一次，防未来重复调用导致每回合复活
    const gameStartSummonedRef = useRef<Set<string>>(new Set());

    // [安卡希雅] 换牌结束/第一回合开始后，扫描手牌+牌库生成 gameStartGenerate 卡牌
    const triggerGameStartGenerate = useCallback(() => {
        const extra: CardData[] = [];
        [...stateRef.current.playerHand, ...stateRef.current.playerDeck].forEach(card => {
            if (card.effects) {
                card.effects.forEach(effId => {
                    const def = EFFECT_DB[effId];
                    if (def && def.params?.gameStartGenerate) {
                        const genKey = def.params.gameStartGenerate;
                        const already = [...stateRef.current.playerHand, ...extra].some(c => c.key === genKey);
                        if (!already && stateRef.current.playerHand.length + extra.length < 10) {
                            extra.push(createFullCard(genKey));
                            console.log(`[GameStart] 第1回合开始：生成 ${genKey} 到手牌`);
                        }
                    }
                });
            }
        });
        if (extra.length > 0) {
            setPlayerHand(prev => [...prev, ...extra]);
        }

        // [2026-08-11 莉莉子] 迷宫强化 game_start（玩家：幽灵行动→安提娜 / 天启共鸣；敌方：精锐动员）
        // [2026-09-09 莉莉子 重构] 收编进统一串行触发引擎（串行 + priority + 按侧去重）
        {
            // 按侧"本局召唤一次"去重（玩家侧防死后每回合复活；敌方仅一次天然触发故不记录）
            const tryMarkSummonOnce: (side: Side, summonKey: string) => boolean = (side, summonKey) => {
                if (side === 'player') {
                    if (gameStartSummonedRef.current.has(summonKey)) return false;
                    gameStartSummonedRef.current.add(summonKey);
                }
                return true;
            };
            // [2026-09-09 修复·快速开局回归] seed 可能滞后并发抽卡（instantDrawCards 排队后同 tick 触发 game_start），
            // 手牌/牌库走补丁式提交（commitSlicePatch）保并发抽卡；bench/field 无并发排队仍全量。
            const playerHandSeed = [...stateRef.current.playerHand, ...extra]; // 带上 extra（上方已 setPlayerHand 排队），CHAMPION 追加不错位
            const enemyHandSeed = [...stateRef.current.enemyHand];
            const playerDeckSeed = [...stateRef.current.playerDeck];
            const enemyDeckSeed = [...stateRef.current.enemyDeck];
            const ctx: RogueTriggerCtx = {
                game: { ...stateRef.current.game },
                playerBench: [...stateRef.current.playerBench],
                enemyBench: [...stateRef.current.enemyBench],
                combatField: [...stateRef.current.combatField],
                playerHand: playerHandSeed.slice(),
                enemyHand: enemyHandSeed.slice(),
                playerDeck: playerDeckSeed.slice(),
                enemyDeck: enemyDeckSeed.slice(),
                owner: 'player',
                trigger: 'game_start',
                createFullCard,
                info: { tryMarkSummonOnce },
                dirty: { bench: new Set<Side>(), hand: new Set<Side>(), deck: new Set<Side>(), field: false, game: false },
            };
            ctx.owner = 'player';
            runRogueTrigger(ctx, stateRef.current.game.rogueEnhancements, 'game_start');
            ctx.owner = 'enemy';
            runRogueTrigger(ctx, stateRef.current.game.enemyEnhancements, 'game_start');
            // ── [2026-09-25 莉莉子 强化线] game_start 的 game 级变更提交（悬赏标记 / 终焉回响的水晶代价）──
            //   本站点以前只提交 bench/hand/deck/field —— game 级效果会被静默丢弃（与 unit_die 同款问题）
            if (ctx.dirty.game) commitDirtyGame(ctx.game, stateRef.current.game);

            // =====================================
            // [2026-09-16 1.0.16 茉莉安] ④【库效】对局开始召唤（可指定对方半场）
            // ── 与 gameStartGenerate 的两点区别：
            //    ① 走「落场」而非「入手牌」
            //    ② 落点可指向【对方半场】（獠牙信标要落在对手备战席）
            // ── 载体只能是茉莉安本体：信标是 isCollectible:false 的衍生物，
            //    永远不会出现在牌库里，库效基因挂在它身上永远不会触发
            // ── 对局开始只发生一次 → 天然「只触发一次」，不会因信标被拆而重生
            // ⚠️ 复用 ctx 的 dirty 标记提交，避免与上方强化触发抢同一批 setState
            // =====================================
            (['player', 'enemy'] as Side[]).forEach(side => {
                const hand = side === 'player' ? ctx.playerHand : ctx.enemyHand;
                const deck = side === 'player' ? ctx.playerDeck : ctx.enemyDeck;

                // 从该侧的手牌 + 牌库找出携带库效基因的卡
                const carrier = [...(hand || []), ...(deck || [])].find(c =>
                    c.effects?.some(id => EFFECT_DB[id]?.params?.gameStartSummon)
                );
                if (!carrier) return;

                const effId = carrier.effects!.find(id => EFFECT_DB[id]?.params?.gameStartSummon)!;
                const p = EFFECT_DB[effId].params!;
                const summonKey = p.gameStartSummon!;
                const toOpponent = p.gameStartSummonSide === 'opponent';
                const landSide: Side = toOpponent ? (side === 'player' ? 'enemy' : 'player') : side;

                const bench = landSide === 'player' ? ctx.playerBench : ctx.enemyBench;

                // 召唤限制（与设计文档 3.6 一致）：已有同名单位 / 备战席无空位 → 不召唤
                if (bench.some(c => c.key === summonKey)) {
                    console.log(`[GameStart] ④库效：${landSide} 备战席已有「${summonKey}」，跳过`);
                    return;
                }
                if (bench.length >= 6) {
                    console.log(`[GameStart] ④库效：${landSide} 备战席已满（${bench.length}/6），跳过`);
                    return;
                }

                // [2026-09-19 莉莉子 BUG修复] 与另两条召唤路径统一走公共装配器
                //   （开局时 beaconMaxHealthMod 必为 0，此处为同一类洞的预防性收口）
                const summonedBeacon = { ...assembleBeaconCard(ctx.createFullCard(summonKey), ctx.game.beaconMaxHealthMod), animState: 'summoning' as const };
                bench.push(summonedBeacon);
                eventBus.emit(GameEvents.SFX_SUMMON); // [2026-09-19] 同上：开局库效也走直建，需自行发召唤音
                ctx.dirty.bench.add(landSide);
                // =====================================
                // [2026-10-06 程拍板 · A 方案] ④库效开局召唤同样补响「入场」门铃
                //   （此前也是直建直塞 ⇒ 召唤物拿不到入场效果 / `on_summon` 类强化）
                // =====================================
                const entry = runSummonEntry(summonedBeacon.id, landSide, {
                    game: ctx.game,
                    playerBench: ctx.playerBench,
                    enemyBench: ctx.enemyBench,
                    playerHand: ctx.playerHand,
                    enemyHand: ctx.enemyHand,
                    playerDeck: ctx.playerDeck,
                    enemyDeck: ctx.enemyDeck,
                    combatField: ctx.combatField,
                }, ctx.createFullCard);
                if (entry.applied) {
                    ctx.game = entry.game;
                    ctx.playerBench = entry.playerBench;
                    ctx.enemyBench = entry.enemyBench;
                    ctx.playerHand = entry.playerHand;
                    ctx.enemyHand = entry.enemyHand;
                    if (entry.playerDeck) ctx.playerDeck = entry.playerDeck;
                    if (entry.enemyDeck) ctx.enemyDeck = entry.enemyDeck;
                    if (entry.combatField) { ctx.combatField = entry.combatField; ctx.dirty.field = true; }
                    // 保守起见全量标脏（重复提交无害；漏标会丢改动）
                    ctx.dirty.game = true;
                    ctx.dirty.bench.add('player');
                    ctx.dirty.bench.add('enemy');
                    ctx.dirty.hand.add('player');
                    ctx.dirty.hand.add('enemy');
                    ctx.dirty.deck.add('player');
                    ctx.dirty.deck.add('enemy');
                }
                console.log(`[GameStart] ④库效：【${carrier.name}】发动 → 在 ${landSide} 备战席召唤「${summonKey}」`);
            });

            if (ctx.dirty.bench.has('player')) setPlayerBench(ctx.playerBench);
            if (ctx.dirty.bench.has('enemy')) setEnemyBench(ctx.enemyBench);
            // =====================================
            // [2026-10-03 莉莉子 BUG修复] **同步回写 stateRef**（备战席）
            // ── 症状（粉丝实测）：开局时 茉莉安神格 ②「猎场哨戒」/④「猎场锁定」
            //    对**敌方备战席上的獠牙信标**既不贴【暴露】也不造成伤害。
            // ── 根因：**同一 tick 内的 stateRef 竞态**。
            //    `GameSession:542-543`（及 :564-565）是**紧挨着**调用的：
            //      ① triggerGameStartGenerate() —— 上面的④库效把信标 push 进 `ctx.enemyBench`，
            //         然后只调了 `setEnemyBench(...)`（React 排队更新）。
            //      ② triggerFirstRoundRogueEnhance() —— **下一行**，它内部
            //         `runRoundStartRogueEnhancements` 从 **`stateRef.current`** 重建 ctx
            //         （useRoundLifecycle:640-641）。
            //    而 `stateRef.current` 只在 **render 后**刷新（本文件 :339）⇒ 排队中的信标看不见
            //    ⇒ 神格拿到的敌方备战席是**空的**。
            // ── 后果放大点：`EXPOSE_AND_DAMAGE`（rogueTrigger:663-664）空池**直接 return**
            //    ⇒ 既不暴露、也不造成伤害、连闪光都没有 —— 与实测逐字吻合。
            // ── 修法：与 useRoundLifecycle:1502 / 本文件 :584 同款既有手法 —— 同步回写 stateRef，
            //    让下一行的 round_start 强化能看见刚落场的单位（信标）。
            // ⚠️ 只回写备战席：这是本次坐实的缺口；手牌/牌库/交战区的同类滞后**未动**（不扩大改动面）。
            // =====================================
            if (ctx.dirty.bench.has('player')) stateRef.current.playerBench = ctx.playerBench;
            if (ctx.dirty.bench.has('enemy')) stateRef.current.enemyBench = ctx.enemyBench;
            if (ctx.dirty.field) setCombatField(ctx.combatField);
            if (ctx.dirty.hand.has('player')) commitSlicePatch(playerHandSeed, ctx.playerHand, fn => setPlayerHand(fn));
            if (ctx.dirty.hand.has('enemy')) commitSlicePatch(enemyHandSeed, ctx.enemyHand, fn => setEnemyHand(fn));
            if (ctx.dirty.deck.has('player')) commitSlicePatch(playerDeckSeed, ctx.playerDeck, fn => setPlayerDeck(fn));
            if (ctx.dirty.deck.has('enemy')) commitSlicePatch(enemyDeckSeed, ctx.enemyDeck, fn => setEnemyDeckState(fn));
        }
    }, []);

    // [飞剑] 检测交战区出现飞剑衍生物→自动进入格挡阶段
    // [2026-08-24 莉莉子 飞剑竞态根治] 去掉一次性 ref 门：每次 phase='main' + 交战区有飞剑即归一为 block_declare，
    // 让守卫成为随时可复位的纯安全网（M4/M5 已同步切格挡，此处兜底未知路径）。
    useEffect(() => {
        const hasSwords = combatField.some(f =>
            f.attacker?.key === 'Acacia_Flying_Sword' || f.attacker?.key === 'Acacia_Great_Sword'
        );
        if (hasSwords && game.phase === 'main') {
            // [2026-08-06 莉莉子 敌我修复] 按飞剑归属决定防守方，而非无条件翻转 turnOwner：
            //   - 敌方飞剑（owner='enemy'）→ 玩家格挡 → turnOwner='player'
            //   - 我方飞剑（owner='player'）→ 敌方格挡 → turnOwner='enemy'
            // 防止玩家把自己单位派去格挡自己召唤的飞剑（结算后归位错乱）。
            const swordOwner = combatField.find(f =>
                f.attacker?.key === 'Acacia_Flying_Sword' || f.attacker?.key === 'Acacia_Great_Sword'
            )?.owner;
            const defensiveSide = swordOwner === 'player' ? 'enemy' : 'player';
            setGame(prev => ({
                ...prev,
                phase: 'block_declare',
                turnOwner: defensiveSide as 'player' | 'enemy',
                consecutivePasses: 0,
                lastActionTimestamp: Date.now(),
            }));
            setMessage(swordOwner === 'player' ? '我方飞剑来袭，请敌方格挡' : '敌方飞剑来袭，请分配格挡！');
        }
    }, [game.phase, combatField.length]);

    // --- 2. 英雄卡变形逻辑 (Champion Spell Transformation) ---
    useEffect(() => {
        // 通用变形处理函数
        // [2026-10-04 莉莉子 BUG修复] 新增 `equipsByKey`：该方"按卡 key 的装备/武装表"。
        //   为什么必须按方传入：装备/武装只在"开局构建"那两处挂（初始构建 / resetGame），
        //   而**双方**都用本函数做变形 ⇒ 重建出来的英雄卡都得各自补挂自己那一方的装备表
        //   （玩家 = rogueEquipments：局内购装 + 局外武装；敌方 = enemyEquipments：难度分级随机装备）。
        //   标准 / 教程模式两张表都为空 ⇒ 零影响。
        const processHandTransformation = (
            currentHand: CardData[],
            unitsOnBoard: CardData[],
            leveledChampions: string[],
            equipsByKey: Record<string, string[]> | undefined
        ): { changed: boolean, hand: CardData[] } => {
            // 提取场上英雄的 Key 集合
            const championKeysOnBoard = new Set(
                unitsOnBoard.filter(c => c.isChampion).map(c => c.key)
            );

            let hasChanged = false;

            const nextHand = currentHand.map(card => {
                // --- 情况 A: 英雄 -> 法术 ---
                // 条件：卡牌是英雄 + 场上已有该英雄 + 该英雄定义了关联法术
                if (card.isChampion && championKeysOnBoard.has(card.key) && card.associatedSpellKey) {
                    // [2026-07-31 架构修复] 若该英雄已全局升级（leveledChampions），关联法术取 Lv2 版本
                    //（如安卡 剑舞→重锋）——升级走全局标记自动适配，与其他天启者一致，不再依赖手动替换副本
                    const spellKey = leveledChampions.includes(card.key)
                        ? (getLeveledUpCard(card).associatedSpellKey || card.associatedSpellKey)
                        : card.associatedSpellKey;
                    const spellData = CARD_DB[spellKey];
                    hasChanged = true;
                    // 返回变形后的法术卡，保留 ID 和原始 Key
                    return {
                        ...spellData,
                        id: card.id,
                        associatedChampionKey: card.key,
                        animState: 'transform',
                        isTransformed: true, // 标记：我是变形来的
                        originalBaseKey: card.key
                    } as unknown as CardData;
                }

                // --- 情况 B: 法术 -> 英雄 ---
                // 条件：卡牌是关联法术 + 场上无该英雄 + 该卡是变形来的
                if (card.associatedChampionKey && !championKeysOnBoard.has(card.associatedChampionKey) && (card as any).isTransformed) {
                    const originalKey = (card as any).originalBaseKey || card.associatedChampionKey;

                    // [2026-10-04 莉莉子 BUG修复 · 独立审查 I4] 重建基座改用 `createFullCard`（= 开局构建的**真**口径）：
                    //   原来直接用 `CARD_DB[originalKey]`，而 `CARD_DB` 的条目**不含实例字段**
                    //   （`strikeCount` / `customProgress` / `abilityState`·`abilityCharges` / `buffs` / `roundBuffs` / `roundStrikes`
                    //     —— 见 `createFullCard` `:33-52` 与 `cards.ts:4` 的类型定义）。
                    //   后果（可玩可见）：`strikeCount` 成了 `undefined`，而 `combat.ts:86` 做
                    //   `attacker.strikeCount + 1` ⇒ **NaN**；`gameRules.ts:258` 的里芙升级判据
                    //   `card.strikeCount >= 2` **没有兜底** ⇒ **变回来的里芙永远无法升级**。
                    //   （既有缺陷，本次顺带修掉：既然是"变回一张新卡"，就该与开局构建逐字段等价。）
                    let championData: CardData = createFullCard(originalKey);
                    if (leveledChampions.includes(originalKey)) {
                        championData = getLeveledUpCard(championData);
                    }

                    // ==========================================
                    // [2026-10-04 莉莉子 BUG修复] 变回英雄时**必须重新挂载该方的装备 / 武装**
                    //   病根（程报）：装备/武装**只在"开局构建"那两处挂**
                    //     —— `:499-506`（初始构建）与 `:1601-1604`（resetGame）。
                    //     （`:1034` 的「遗嘱」也挂装备，但那是**战斗内转移给友军**，不是本卡的来源。）
                    //   ⇒ 肉鸽里她阵亡后、手牌中的关联法术变回她本人时，`card.equipment` 是空的：
                    //     卡面 pip 没了、武装的静态修饰（+1/+1 / 减费标记 / 关键词）也没了
                    //     ⇒ **"其身上的武装和装备都会丢失"**。
                    //   修法：照抄开局构建的**同一口径**（按 key 查装备表，逐个 `attachEquipment`）。
                    //   ⚠️ 用 `originalKey` 而不是 `card.key`：变形卡当前的 key 是**法术**的 key。
                    //   ⚠️ 标准 / 教程模式两张表都为空 ⇒ 零影响。
                    // ==========================================
                    // ⚠️ [独立审查 I1 · **当前是 no-op，别当成已完成的行为**] 敌方那半查不到任何东西：
                    //   `enemyEquipments` 只由 `rollEnemyEquipments` 产出，而它**只挑非天启者单位**
                    //   （`encounterBuilder.ts:151-154`）⇒ 表里永远没有天启者 key，而本分支的 `originalKey`
                    //   恒为天启者 key ⇒ 永远查不到、不挂。管道留着是为了"两侧同一口径"；
                    //   若将来要让**敌方天启者也带装备**，改动点在 `rollEnemyEquipments` 的过滤条件（**不是这里**）。
                    const heroEquips = equipsByKey?.[originalKey];
                    if (championData && heroEquips?.length) {
                        // [独立审查 I6] `championData` 判空：`equippedCards` 是持久化存档，
                        //   若遇上过期存档导致 key 失效，`attachEquipment(undefined, …)` 会在 effect 的
                        //   `.map` 里抛 TypeError（渲染级崩溃）。加一道廉价护栏。
                        for (const eid of heroEquips) championData = attachEquipment(championData, eid);
                        console.log(`[变形] ${originalKey} 变回天启者：重新挂载装备/武装 [${heroEquips.join(', ')}]`);
                    }

                    hasChanged = true;
                    // 变回英雄
                    return {
                        ...championData,
                        id: card.id,
                        animState: 'transform'
                    } as CardData;
                }

                // --- 情况 C: 支援技 -> 抉择法术 ---
                // 条件：卡牌是支援技 + 场上已有对应英雄 + 未变形
                if (card.associatedChampionKey && championKeysOnBoard.has(card.associatedChampionKey)
                    && card.key.endsWith('_support') && !(card as any).isTransformed) {
                    const champCard = CARD_DB[card.associatedChampionKey];
                    if (champCard?.associatedSpellKey) {
                        const choiceSpell = CARD_DB[champCard.associatedSpellKey];
                        if (choiceSpell) {
                            hasChanged = true;
                            return {
                                ...choiceSpell,
                                id: card.id,
                                associatedChampionKey: card.associatedChampionKey,
                                animState: 'transform',
                                isTransformed: true,
                                originalBaseKey: card.key
                            } as unknown as CardData;
                        }
                    }
                }

                return card;
            });

            return { changed: hasChanged, hand: nextHand };
        };


        // 1. 处理玩家 (Player)
        const playerUnits = [
            ...playerBench,
            ...combatField.filter(f => f.owner === 'player').map(f => f.attacker),
            ...combatField.filter(f => f.blocker && f.owner === 'enemy').map(f => f.blocker!)
        ];
        // [2026-10-04] 玩家侧：装备表 = rogueEquipments（局内购装 + 局外武装）；
        //   升级判据 = **按方**列表（原先传全局 `leveledChampions` ⇒ 镜像对局里会读到敌方的升级，
        //   于是"变回 Lv2 卡 / 取 Lv2 关联法术"跨侧串味）
        const pResult = processHandTransformation(playerHand, playerUnits, stateRef.current.game.leveledChampionsBySide?.player ?? [], rogueEquipments);
        if (pResult.changed) setPlayerHand(pResult.hand);

        // 2. 处理敌方 (Enemy) [本次修复的核心]
        const enemyUnits = [
            ...enemyBench,
            ...combatField.filter(f => f.owner === 'enemy').map(f => f.attacker),
            ...combatField.filter(f => f.blocker && f.owner === 'player').map(f => f.blocker!)
        ];
        // [2026-10-04] 敌方侧：装备表 = enemyEquipments；升级判据同样**按方**（见上）
        const eResult = processHandTransformation(enemyHand, enemyUnits, stateRef.current.game.leveledChampionsBySide?.enemy ?? [], enemyEquipments);
        if (eResult.changed) setEnemyHand(eResult.hand);

    }, [playerBench, enemyBench, combatField, playerHand, enemyHand, game.leveledChampions, game.leveledChampionsBySide]); // [关键] 依赖列表包含双方状态 + 升级标记（升级时自动重跑变形）；[2026-10-04] 补分阵营表（变形已改读它）

       // [升级版] 全局死亡监测 (Death Check System) - 黄金 1.1 秒法则
    // 监听备战席单位，赋予法术/技能击杀充足的特效播放时间
    useEffect(() => {
        const processDeaths = (
            bench: CardData[],
            setBench: React.Dispatch<React.SetStateAction<CardData[]>>,
        ) => {
            let needsUpdate = false;
            const deadUnitsToBroadcast: CardData[] = [];

            const newBench = bench.map(unit => {
                const currentHealth = getHealth(unit); // [2026-09-22 莉莉子 BUG修复] 原公式漏 roundBuffs.health → 带临时血的单位被误判死亡

                // [核心修正] 防重复触发必须同时放过 dying 和 ephemeral_dying，绝不能用普通死亡覆盖瞬息死亡！
                if (currentHealth <= 0 && unit.animState !== 'dying' && unit.animState !== 'ephemeral_dying') {
                    // ── [2026-09-25 莉莉子 武装线] 不屈之证：天启者已升级时，每场战斗首次阵亡以 1 点生命存活 ──
                    //   拦截点选在"死刑判定处"：既不推入 deadUnitsToBroadcast、也不写 dying，直接改写成 1 血
                    //   每场一次：账本用 questProgress 的 used:<武装 id> 键（与本框架 oncePerBattle 同款口径）
                    const reviver = bench === playerBench && unit.isChampion && (unit.level ?? 1) >= 2
                        ? (unit.equipment ?? []).find(id => getEquipmentById(id)?.reviveOncePerBattle)
                        : undefined;
                    if (reviver && !(stateRef.current.game.questProgress ?? {})[`used:${reviver}`]) {
                        setGame(prev => ({ ...prev, questProgress: { ...(prev.questProgress ?? {}), [`used:${reviver}`]: 1 } }));
                        const totalHp = (unit.health || 0) + (unit.buffs?.health || 0) + (unit.roundBuffs?.health || 0);
                        needsUpdate = true; // 触发 setBench，把改写后的活体写回
                        return { ...unit, damageTaken: Math.max(0, totalHp - 1), animState: 'buff' as const };
                    }
                    // [视觉解耦] 不再需要暂缓死刑等待 hit 状态，死亡碎裂动画与独立受击特效完美兼容，直接处决！
                    needsUpdate = true;
                    deadUnitsToBroadcast.push(unit);
                    // 缓刑：不直接删除，只挂载死亡标记下发给视图层播放特效
                    return { ...unit, animState: 'dying' as const };
                }
                return unit;
            });

            if (needsUpdate) {
                // 1. 下发 dying 状态，通知 Card.tsx 触发金蝉脱壳与粒子爆炸
                setBench(newBench);

                // 2. 广播死亡事件 (触发语音、统计等)
                // [2026-08-27] 亡灵军团(all=false)：只复活本次死亡清算的首个阵亡（红·不死军团 all=true 全部复活）
                // [2026-09-09 莉莉子 重构] unit_die 强化收编进统一串行触发引擎（英魂传承/献祭仪式/亡灵军团）。
                // ctx 的死亡侧 bench 用 newBench（已带 dying 标记），RESURRECT 原地"移除死者+追加复活体"、保留其余 dying 态；
                // 本批共享同一 ctx → 非全复活强化只救首个；processDeaths 在独立 useEffect（状态已落定）内运行，stateRef 播种安全。
                const dieSide = bench === playerBench ? 'player' : 'enemy';
                const dieEnh = dieSide === 'player' ? stateRef.current.game.rogueEnhancements : stateRef.current.game.enemyEnhancements;
                const unitCtx: RogueTriggerCtx = {
                    game: { ...stateRef.current.game },
                    playerBench: dieSide === 'player' ? [...newBench] : [...stateRef.current.playerBench],
                    enemyBench: dieSide === 'enemy' ? [...newBench] : [...stateRef.current.enemyBench],
                    combatField: [...stateRef.current.combatField],
                    playerHand: [...stateRef.current.playerHand],
                    enemyHand: [...stateRef.current.enemyHand],
                    playerDeck: [...stateRef.current.playerDeck],
                    enemyDeck: [...stateRef.current.enemyDeck],
                    owner: dieSide,
                    trigger: 'unit_die',
                    createFullCard,
                    info: { resurrectedSide: undefined },
                    dirty: { bench: new Set<Side>(), hand: new Set<Side>(), deck: new Set<Side>(), field: false, game: false },
                };
                deadUnitsToBroadcast.forEach(u => {
                    console.log(`[DeathCheck] ${u.name} died in bench. Initiating shatter VFX.`);
                    eventBus.emit(GameEvents.UNIT_DIE, u);

                    // ── [2026-09-25 莉莉子 三线任务化框架 · 装备线·新机制] 遗嘱 ──
                    //   🔴 [2026-10-06 莉莉子 · 审计收口] **已搬走**：原实现挂在这里（只覆盖**备战席**死亡），
                    //   而单位进攻/格挡时已离开备战席 ⇒ 死在交战区永远不触发。
                    //   现统一挂在 `UNIT_DIED`（全项目唯一死亡出口，四条开票口都汇进去）—— 见 `flushMicroQueue`。

                    // ── [2026-09-25 莉莉子 任务化框架 · 武装线] 我方单位阵亡 → 广播给 run 层记账 ──
                    //   ① unit_die：亡者低语等整局任务计数 ② ROGUE_HERO_DIED：凯旋之匣判定"英雄是否活到最后"
                    if (dieSide === 'player') {
                        eventBus.emit(GameEvents.ROGUE_QUEST_EVENT, { event: 'unit_die' });
                        if (u.isChampion) eventBus.emit(GameEvents.ROGUE_HERO_DIED, { key: u.key });
                    }

                    // 迷宫强化 unit_die：同一份工作快照上串行触发（死亡侧强化；非全复活强化仅救本批首个）
                    // [2026-10-05 莉莉子 BUG修复 · 20261005-12 · **第三轮审查·5**] 这条**原本没有前置判重**
                    //   （只在事后记账）：而 `effectProcessor:442/449` 会把尸体 `animState` 就地改成 `'hit'`、
                    //   `keywords.ts:68` 会重置成 `'idle'` ⇒ 尸体**重新满足本函数的判死条件**（`:980` 只看 animState）
                    //   ⇒ 同一死亡再派发一次。⇒ 加上账本前置判重（认"这次死亡的强化已发过"）。
                    if (hasUnitDieDispatched(u)) {
                        console.log(`[DeathLedger] ${u.name}(${u.key}) 的 unit_die 已派发过（尸体被改写/克隆后重新满足判死）→ 跳过，防重复`);
                    } else {
                        unitCtx.info.deadUnit = u;
                        runRogueTrigger(unitCtx, dieEnh, 'unit_die');
                        // [2026-10-05 莉莉子 BUG修复 · 20261005-12] 记账：这只单位的 unit_die 已派发
                        //   （备战席这条**本就在同一趟里派发**，不受盖章影响；记账是为了让"补派发"那趟与回合末收口不重复发）
                        markUnitDieDispatched(u);
                        // ⚠️ 上面 `u` 是**广播用的原对象**，而真正落席的是 `newBench` 里 `{ ...unit, animState: 'dying' }`
                        //    那个**新对象** ⇒ 必须把落席那张也记上，否则账本与"场上那张卡"对不上（后续消费者会重复发）。
                        const committed = newBench.find(c => c.id === u.id);
                        if (committed) markUnitDieDispatched(committed);
                    }
                    if (unitCtx.dirty.bench.has('player')) setPlayerBench(unitCtx.playerBench);
                    if (unitCtx.dirty.bench.has('enemy')) setEnemyBench(unitCtx.enemyBench);
                    if (unitCtx.dirty.field) setCombatField(unitCtx.combatField);
                    if (unitCtx.dirty.hand.has('player')) setPlayerHand(unitCtx.playerHand);
                    if (unitCtx.dirty.hand.has('enemy')) setEnemyHand(unitCtx.enemyHand);
                    if (unitCtx.dirty.deck.has('player')) setPlayerDeck(unitCtx.playerDeck);
                    if (unitCtx.dirty.deck.has('enemy')) setEnemyDeckState(unitCtx.enemyDeck);
                    // ── [2026-09-25 莉莉子 强化线] game 级变更（余烬的敌方水晶伤害等）：差异合并提交 ──
                    if (unitCtx.dirty.game) commitDirtyGame(unitCtx.game, stateRef.current.game);

                    // [重构] 剥离硬编码！把亡语触发权移交给微队列的中央处理器！
                    // 把这具尸体当作包裹，扔进微队列缓冲区
                    pendingActionsRef.current.push({ type: 'UNIT_DIED', payload: { unit: u, bench: bench === playerBench ? 'player' : 'enemy' } });
                });

                // [NecroDebug] processDeaths 推送 UNIT_DIED
                if (deadUnitsToBroadcast.length > 0) {
                    console.log(`[NecroDebug] processDeaths 推送 ${deadUnitsToBroadcast.length} 个 UNIT_DIED:`, deadUnitsToBroadcast.map(u => `${u.name}(${u.key}) id=${u.id} anim=${u.animState}`));
                }

                // 3. [关键时间轴] 收尸法则延时至 1.8 秒，以便瞬息动画(ephemeral_dying)及常规死亡播完
                // 彻底异步非阻塞，完美避开陈旧闭包 Bug
                setTimeout(() => {
                    setBench(prev => prev.filter(u => u.animState !== 'dying' && u.animState !== 'ephemeral_dying'));
                }, 2500);
            }
        };

        if (playerBench.length > 0) processDeaths(playerBench, setPlayerBench);
        if (enemyBench.length > 0) processDeaths(enemyBench, setEnemyBench);

        // ========== [新增] 交战区死亡监测 ==========
        // 处理法术击杀正在攻击/阻挡的单位：直接标记 dying 让 Card.tsx 播放碎裂动画
        // 不需要额外 cleanup——战斗结算 (calculateCombatOutcome) 会自然处理战场清理
        let combatDeath = false;
        const nextCombat = combatField.map(fight => ({
            ...fight,
            attacker: (() => {
                if (!fight.attacker) return fight.attacker;
                const hp = getHealth(fight.attacker); // [2026-09-22 莉莉子 BUG修复] 原公式漏 roundBuffs.health
                if (hp <= 0 && fight.attacker.animState !== 'dying' && fight.attacker.animState !== 'ephemeral_dying') {
                    combatDeath = true;
                    return { ...fight.attacker, animState: 'dying' as const };
                }
                return fight.attacker;
            })(),
            blocker: (() => {
                if (!fight.blocker) return fight.blocker;
                const hp = getHealth(fight.blocker); // [2026-09-22 莉莉子 BUG修复] 原公式漏 roundBuffs.health
                if (hp <= 0 && fight.blocker.animState !== 'dying' && fight.blocker.animState !== 'ephemeral_dying') {
                    combatDeath = true;
                    return { ...fight.blocker, animState: 'dying' as const };
                }
                return fight.blocker;
            })(),
        }));
        if (combatDeath) setCombatField(nextCombat);

    }, [playerBench, enemyBench, combatField]);

    // ==========================================
    // [重构] 场上目睹机制 (Local Witness System) - 微队列版
    // 监听到广播后，不再直接修改状态，而是向微队列中推入一个待办动作
    // ==========================================
    useEffect(() => {
        const handleNexusStrike = (payload: { target: 'player' | 'enemy', amount: number; floatOnly?: boolean }) => {
            // [2026-10-10 莉莉子] **"只演出"的水晶事件不排微队列** ——
            //   首个使用方：「镜阵回响」（`rogueTrigger` 的 `NEXUS_REPEAT_STRIKE` 兑现段）的回合末再击。
            //   它要**飘字 / 震屏 / 音效**（故必须发正牌 `NEXUS_STRIKED`），但它**不是一次"打击"**
            //   ⇒ 不能计入卜卜的目睹进度、更不能再次触发 `on_nexus_strike`（那正是回环）。
            if (payload.floatOnly) return;
            // [2026-08-27] 双方水晶受击都入微队列（卜卜目睹/玩家强化只在敌方被打触发；敌方强化在我方被打触发）
            pendingActionsRef.current.push({ type: 'NEXUS_STRIKED', payload });
        };

        // [核心新增] 监听全域受伤事件，将其吸入微队列统一清算！
        const handleUnitDamage = (payload: { id: string, amount: number }) => {
            console.log(`[🩸UnitDamage] 收到受伤事件: id=${payload.id}, amount=${payload.amount}`);
            pendingActionsRef.current.push({ type: 'UNIT_DAMAGED', payload });
        };

        // [新增] 监听全域死亡事件（尤其是交战区的尸体），纳入微队列清算！
        const handleUnitDeath = (unit: CardData) => {
            // 只要收到死讯，不管是备战席还是战场，先排个号
            // 因为前一步(改造点1)已经处理过备战席了，这里加个判断，只处理战场和未知来源的尸体
            const isInPlayerBench = stateRef.current.playerBench.some(c => c.id === unit.id);
            const isInEnemyBench = stateRef.current.enemyBench.some(c => c.id === unit.id);
            if (!isInPlayerBench && !isInEnemyBench) {
                // [2026-09-19 莉莉子 BUG修复] 去重：judgeLifeAndDeath 是「先 emit 再 push」，
                //   本监听器听到那次 emit 时它自己那张票还没落袋 → 两张票会同时入队、亡语跑两遍。
                //   此处若已有人给这张卡开过票（多半是 resolveCombat 的广播），直接不重复开。
                if (hasDeathTicket(pendingActionsRef.current, unit.id)) return;
                // [2026-09-19 莉莉子 方向一] 有归属戳就查表，没有才回落到交战区推导
                const owner = unit.unitOwner ?? ((stateRef.current.combatField.some(f => f.owner === 'player' && f.attacker.id === unit.id) ||
                               stateRef.current.combatField.some(f => f.owner === 'enemy' && f.blocker?.id === unit.id))
                              ? 'player' : 'enemy');
                pendingActionsRef.current.push({ type: 'UNIT_DIED', payload: { unit, bench: owner } });
            }
        };

        eventBus.on(GameEvents.NEXUS_STRIKED, handleNexusStrike);
        eventBus.on('unit_damage', handleUnitDamage); // 桥接法术与物理的受击事件
        eventBus.on(GameEvents.UNIT_DIE, handleUnitDeath); // 接收尸体
        return () => {
            eventBus.off(GameEvents.NEXUS_STRIKED, handleNexusStrike);
            eventBus.off('unit_damage', handleUnitDamage);
            eventBus.off(GameEvents.UNIT_DIE, handleUnitDeath);
        };
    }, []);

    // ==========================================
    // [新增] 高情商智能裁判 (State-Based Actions Check)
    // 负责全局胜负判定，完美支持法术斩杀与战斗溢出伤害 (Overkill) 爽点
    // ==========================================
    useEffect(() => {
        // 核心过滤：让子弹飞一会儿！
        // 只要系统还在播动画 (animating)、换牌 (mulligan) 或已经结算，裁判就保持沉默
        if (game.phase === 'animating' || game.phase === 'mulligan' || game.gameResult !== null) {
            return;
        }

        // 只要回到静态等待阶段 (如 main)，立刻核查水晶血量
        if (game.playerNexus <= 0 || game.enemyNexus <= 0) {
            const finalResult = game.playerNexus <= 0 ? 'defeat' : 'victory';

            // 收集胜利时的场上英雄，用于播放 MVP 动画
            if (finalResult === 'victory') {
                const heroes = playerBench.filter(c => c.isChampion).map(c => c.key);
                setWinningHeroKeys(heroes);
            }

            // [新增] 军功审计探针：记录对局落幕
            gameLogger.logEvent({
                type: 'game_end',
                turn: game.round,
                isPlayerSide: true,
                result: finalResult === 'victory' ? 'win' : 'loss'
            });

            setGame(prev => ({ ...prev, gameResult: finalResult }));
        }
    }, [game.playerNexus, game.enemyNexus, game.phase, game.gameResult, playerBench]);

    // ==========================================
    // [新增] 全局觉醒光环 (State-Based Level Up Aura)
    // 监听水晶血量及场上人员变化。一旦满足条件（如芬妮的半血觉醒），立刻强制触发升级队列！
    // ==========================================
    useEffect(() => {
        // [2026-10-03 莉莉子 · A] 允许在**战斗演出期间**升级：程拍板「升级影片可以在战斗演出期间插播，
        //   并暂停战斗演出直到升级动画播完再继续」⇒ 扫描不再因 `phase === 'animating'` 整段跳过
        //   （旧实现跳过演出期 ⇒ 她在场上达成条件也看不见 ⇒ 只能等战斗结束回备战席才升 = 反馈的"升级延迟"）。
        //   仍保留换牌期 / 对局结束的拦截（那两段不该插播）。
        if (game.phase === 'mulligan' || game.gameResult !== null) return;

        let hasLeveledUp = false;
        const leveledHeroes: CardData[] = [];
        // [2026-09-13 莉莉子] 与 leveledHeroes 一一对应：记录每个待升级英雄归属哪一方
        const leveledSides: Array<'player' | 'enemy'> = [];

        // 全场雷达扫描：检查场上是否有达到升级条件的 1 级英雄
        // ══════════════════════════════════════════════════════════════════
        // [2026-09-13 莉莉子] 修复「升级影片无限循环」：升级标记判定必须区分敌我。
        //
        // 旧实现查全局 leveledChampions（只记 key、不记这名字属于谁），于是敌我双方场上
        // 有同名天启者时：我方里芙达标升级 → 写下全局标记 'lyfe' → 敌方 Lv1 里芙在后续每次
        // 扫描中都被 alreadyMarked 误判为"该升级" → 反复入队播影片；可它自己并不达标，
        // 升级时被正确跳过 → 永远停在 Lv1 → 下次扫描又被误判 → 影片无限循环。
        // （这也解释了为什么上次修复将"连带升级"改对之后，反而更容易触发：那个连带升级
        //   恰好是循环的刹车片——敌方被升到 Lv2 后就不再被扫到了。）
        //
        // 现改为查询「该方」的标记，敌我彻底分开。
        // ══════════════════════════════════════════════════════════════════
        // ==========================================
        // [2026-10-03 莉莉子 · 系统性收口 + A] **扫描范围：从"只扫两个备战席"改为"全场"**
        //   ── 病根：旧实现只 `scanAndLevelUp(playerBench/enemyBench)` ⇒ 天启者**在交战区**达成条件时
        //      扫描根本看不见她 ⇒ 要等她回到备战席才入队升级（程：「明明已经达成目标了…要等战场所有对战
        //      结束、天启者回到备战席时，才会播放升级动画升级」）。
        //   ── 现在统一走 `collectFieldUnits`（备战席 + 交战区攻守两侧，含归属戳）⇒ 她在哪儿都能被扫到。
        //   ── 归属：备战席用数组侧（升级标记按方写，敌我必须分开）；交战区照旧按攻守推导。
        // ==========================================
        collectFieldUnits({ playerBench, enemyBench, combatField }).forEach(({ side, card }) => {
            if (!(card.isChampion && card.level === 1)) return;
            // [2026-07-31 安卡希雅] 场下升级：朔望之期已标记升级 → 打出安卡直接 Lv2
            // 对齐猫汐尔"场下达成条件、打出后升级"；已升级实例(level 2)会被 level===1 挡在外，不会重复升级
            const alreadyMarked = isLeveledUpForSide(game, side, card.key);
            const statusMet = checkCardLevelUp(card, game.playerNexus, game.enemyNexus);
            if (!alreadyMarked && !statusMet) return;
            hasLeveledUp = true;
            const leveled = { ...getLeveledUpCard(card), id: card.id };
            // 严防死守：死人禁止诈尸升级
            // ══════════════════════════════════════════════════════════════════
            // [2026-10-10 莉莉子 BUG修复 · 程实测] 判据由"只看 `animState`"改为**统一存活判据**
            //   `isStrikeTargetAlive`；且**必须判 Lv1 的 `card`，绝不能判 `leveled`**。
            // ── 病根：`animState === 'dying'` **只有战斗结算（combat.ts）会写**；法术路径
            //    （单挑 / 王见王）打死人**只累加 `damageTaken`**，`animState` 只写 `'hit'`
            //    （effectProcessor.ts:1266）⇒ 被「单挑」打死的天启者在这道门下**仍被判为存活**
            //    ⇒ 照常入队、照常播升级影片（程：「里芙明明已经被击败了，却还是升级正常播放了升级影片」）。
            //    这与 2026-09-15「打击成长救活尸体」是**同一个病根**（见 `isStrikeTargetAlive` 注释），
            //    升级链路是当时没扫到的另一处 ⇒ 故直接复用那个唯一出口，不再自造第二份判据。
            // ── 为什么不能判 `leveled`：`getLeveledUpCard` 会给里芙 `health + 1`（gameRules.ts:500）
            //    ⇒ 一具 `damageTaken` 刚好打满 Lv1 血量的尸体，在升级后的卡上会被算成 hp=1 ⇒ 判活。
            // ══════════════════════════════════════════════════════════════════
            if (isStrikeTargetAlive(card)) {
                leveledHeroes.push(leveled);
                leveledSides.push(side);
            }
        });

        if (hasLeveledUp && leveledHeroes.length > 0) {
            // [2026-07-31 安卡希雅] 升级后手牌法术替换：剑舞→重锋、扩散/集束→月镰剑势（战斗升级等通用路径）
            // [2026-10-04 莉莉子 BUG修复 · I5] 按方过滤：升级扫描是**双方共用**的，
            //   而这段只改**玩家**的手牌/牌库 ⇒ 必须要求"升级的那位是玩家侧的安卡"，
            //   否则镜像对局里敌方安卡升级会把我方手牌也换成重锋（跨侧泄漏）
            if (leveledHeroes.some((h, i) => h.key === 'acacia_chrono_echo' && leveledSides[i] === 'player')) {
                setPlayerHand(prev => upgradeAcaciaHand(prev));
                setPlayerDeck(prev => upgradeAcaciaHand(prev)); // [2026-07-31] 牌库副本同步升级，抽到即 Lv2（否则变形系统会变出剑舞）
                console.log(`[安卡希雅] 升级扫描：手牌+牌库法术替换完成`);
            }

            // 1. 把英雄送进顶层升级调度队列，UI层将无条件接管屏幕播放动画
            setGame(prev => {
                // [2026-08-02 莉莉子] 队列去重：同一英雄 key 已在队中时不再重复入队，
                // 杜绝"持续满足条件"型英雄（如芬妮）在漏网场景下影片无限循环
                const queuedKeys = new Set((prev.pendingLevelUps || []).map(p => p.key));
                const freshIndexes: number[] = [];
                leveledHeroes.forEach((h, i) => {
                    if (!queuedKeys.has(h.key)) freshIndexes.push(i);
                });
                // [2026-09-13 莉莉子] 无新增则原样返回：既避免无谓重渲染，也不给扫描引擎"自我唤醒"的机会
                if (freshIndexes.length === 0) return prev;

                const nextGame = { ...prev };
                // [2026-09-13 莉莉子] 标记按方写入（markLeveledUp 内部同时维护全局 + 分阵营两套）
                freshIndexes.forEach(i => markLeveledUp(nextGame, leveledSides[i], leveledHeroes[i].key));
                nextGame.pendingLevelUps = [...(prev.pendingLevelUps || []), ...freshIndexes.map(i => leveledHeroes[i])];
                return nextGame;
            });

            // [修复] 2. 物理洗牌移至 levelUpCard-triggered useEffect，
	            // 确保卡牌数据升级与影片播放时机一致，避免教程暂停升级时卡面已提前升级
        }
    // [关键依赖] 水晶血量变化、备战席人员变化，都会唤醒这套扫描引擎！
    // [2026-10-03 莉莉子 · A] **必须补 `combatField`** —— 扫描范围已放宽到交战区，
    //   否则"她只在战场上发生变化"时这个 effect 不会重跑 ⇒ 又变成延迟升级。
    }, [game.playerNexus, game.enemyNexus, playerBench, enemyBench, combatField, game.phase, game.gameResult]);


        // [修复] 升级影片开始时再替换卡牌数据（解决教程暂停升级导致卡面提前升级的问题）
    useEffect(() => {
        const card = game.levelUpCard;
        if (!card || !card.isChampion) return;
        const heroKey = card.key;

        // ==========================================
        // [2026-09-13 莉莉子] 判定这一票属于哪一方 —— 用实例 id 反查
        // 队列项只存卡数据、不带归属；而升级必须严格按方执行，绝不连带到对面。
        // 查不到（已不在任何列表）则直接不动手 —— 宁可漏升，不可误伤另一方。
        // ==========================================
        const cardId = card.id;
        const onPlayerSide =
            playerBench.some(c => c.id === cardId) ||
            playerHand.some(c => c.id === cardId) ||
            playerDeck.some(c => c.id === cardId) ||
            combatField.some(f => (f.owner === 'player' && f.attacker.id === cardId) ||
                                   (f.owner === 'enemy' && f.blocker?.id === cardId));
        const onEnemySide =
            enemyBench.some(c => c.id === cardId) ||
            enemyHand.some(c => c.id === cardId) ||
            enemyDeckState.some(c => c.id === cardId) ||
            combatField.some(f => (f.owner === 'enemy' && f.attacker.id === cardId) ||
                                   (f.owner === 'player' && f.blocker?.id === cardId));
        const side: 'player' | 'enemy' | null = onPlayerSide ? 'player' : (onEnemySide ? 'enemy' : null);
        if (!side) return;

        // 该方是否还有该英雄的 Lv1 实例（没有则无需动作）
        const pool = side === 'player'
            ? [...playerBench, ...playerHand, ...playerDeck]
            : [...enemyBench, ...enemyHand, ...enemyDeckState];
        const combatHas = combatField.some(f => {
            const attackerSide: 'player' | 'enemy' = f.owner === 'player' ? 'player' : 'enemy';
            const blockerSide: 'player' | 'enemy' = f.owner === 'player' ? 'enemy' : 'player';
            return (f.attacker.key === heroKey && f.attacker.level === 1 && attackerSide === side) ||
                   (!!f.blocker && f.blocker.key === heroKey && f.blocker.level === 1 && blockerSide === side);
        });
        if (!pool.some(c => c.key === heroKey && c.level === 1) && !combatHas) return;

        // ══════════════════════════════════════════════════════════════════
        // [2026-09-13 莉莉子] 升级 = 不可逆的状态跃迁：达标即锁存，执行时不再二次核验。
        //
        // 旧实现在这里用 checkCardLevelUp 重新核一遍资格，于是出现"叫了号却领不到奖"：
        //   入队时达标 → 执行时不达标 → 卡停在 Lv1 → 下轮扫描又被标记叫号 → 影片无限循环。
        // 现改为照「该方已锁定升级」的名单无条件执行 —— 升了就升了，之后无论发生什么都
        // 不再打断、更不退回（对齐程的设计：第一次达标即生效）。
        //
        // 同时：无任何改动时返回原引用，掐断"升级 → 引用变化 → 重扫 → 再入队"的燃料。
        // ══════════════════════════════════════════════════════════════════
        const upgradeFn = (list: CardData[]) => {
            let changed = false;
            const next = list.map(c => {
                if (c.key === heroKey && c.level === 1) {
                    changed = true;
                    return { ...getLeveledUpCard(c), id: c.id };
                }
                return c;
            });
            return changed ? next : list;
        };

        if (side === 'player') {
            setPlayerBench(upgradeFn);
            setPlayerHand(upgradeFn);
            setPlayerDeck(upgradeFn);
        } else {
            setEnemyBench(upgradeFn);
            setEnemyHand(upgradeFn);
            setEnemyDeckState(upgradeFn);
        }

        // 交战区按每条记录的 owner 精确分方 ——
        // owner='player' 记录里 attacker 属我方、blocker 属敌方；owner='enemy' 反之。
        setCombatField(prev => {
            let changed = false;
            const next = prev.map(f => {
                const attackerSide: 'player' | 'enemy' = f.owner === 'player' ? 'player' : 'enemy';
                const blockerSide: 'player' | 'enemy' = f.owner === 'player' ? 'enemy' : 'player';
                let nf = f;
                if (f.attacker.key === heroKey && f.attacker.level === 1 && attackerSide === side) {
                    nf = { ...nf, attacker: { ...getLeveledUpCard(f.attacker), id: f.attacker.id } };
                    changed = true;
                }
                if (f.blocker && f.blocker.key === heroKey && f.blocker.level === 1 && blockerSide === side) {
                    nf = { ...nf, blocker: { ...getLeveledUpCard(f.blocker), id: f.blocker.id } };
                    changed = true;
                }
                return nf;
            });
            return changed ? next : prev;
        });
    }, [game.levelUpCard]);


// ==========================================
    // [新增] 自动推进引擎 (Auto-Advance Engine)
    // ==========================================
    const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);

    const canPlayerAct = (checkPhase: string) => {
        const { playerMana, playerSpellMana, playerMaxMana } = stateRef.current.game;
        const hand = stateRef.current.playerHand;
        const bench = stateRef.current.playerBench;
        const field = stateRef.current.combatField;

        // 1. 格挡阶段：检查是否有能用的阻挡者
        if (checkPhase === 'block_declare') {
            const canBlock = bench.some(blocker => {
                if (blocker.keywords.includes('CantBlock')) return false;
                return field.some(fight => {
                    // 只能挡对面的空位
                    if (fight.blocker !== null || fight.owner !== 'enemy') return false;
                    if (fight.attacker.keywords.includes('Elusive') && !blocker.keywords.includes('Elusive')) return false;
                    const blockerPower = (blocker.power || 0) + (blocker.buffs?.power || 0);
                    if (fight.attacker.keywords.includes('Fearsome') && blockerPower < 3) return false;
                    return true;
                });
            });
            if (canBlock) return true;

            // [格挡确认保护] 如果玩家已经分配了格挡单位，视为"可操作"
            // 此时玩家可以选择"格挡"按钮确认，或点击已分配的格挡者撤回
            const hasAssignedBlockers = field.some(fight => fight.blocker !== null);
            if (hasAssignedBlockers) return true;
        }

        // 2. 响应阶段 (包含格挡阶段)：检查是否有合规的法术可以打出
        if (checkPhase === 'block_declare' || checkPhase === 'react_to_block') {
            const canCast = hand.some(card => {
                if (!card.type.includes('spell')) return false;
                if (card.type === 'spell-slow') return false; // 战斗中绝不能打慢速法术
                const effectiveCost = getEffectiveSpellCost(card, playerBench, playerMaxMana);
                return canAfford(card, playerMana, playerSpellMana, effectiveCost);
            });
            if (canCast) return true;
        }

        return false;
    };

    useEffect(() => {
        // 不在动画期、不在结算期、不是微队列未清空期
        if (game.phase === 'animating' || game.gameResult !== null || pendingActionsRef.current.length > 0) return;

        // 仅在轮到玩家的防守/响应回合进行托管检测
        if (game.turnOwner === 'player' && (game.phase === 'block_declare' || game.phase === 'react_to_block')) {
            if (!canPlayerAct(game.phase)) {
                setIsAutoAdvancing(true);

                // 给予 0.8 秒的视觉缓冲期，让玩家看清敌方刚刚的操作，防晕车
                const timer = setTimeout(() => {
                    setIsAutoAdvancing(false);
                    // [核心修复] 区分格挡阶段和响应阶段的动作！
                    // [2026-08-24 莉莉子 飞剑竞态根治] 只对真实阶段做合法动作，
                    // 意外回到 main（如飞剑归位后）一律不动，防止补一脚 passTurn 导致回合误结束
                    const phaseNow = stateRef.current.game.phase;
                    if (phaseNow === 'block_declare') {
                        confirmBlock(); // 格挡阶段无事可做应视为“防线确认完毕”
                    } else if (phaseNow === 'react_to_block') {
                        passTurn(); // 只有在战术响应阶段才叫“让过”
                    }
                }, 800);

                return () => clearTimeout(timer);
            }
        } else {
            setIsAutoAdvancing(false);
        }
    // 注意：绝不可将 passTurn 加入依赖以避免死循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [game.phase, game.turnOwner, playerHand.length, playerBench.length, game.playerMana, game.playerSpellMana]);



    // ══════════════════════════════════════════════════════════
    //  🎴 事件驱动抽卡系统 (取代旧的时间锁 wait)
    // ══════════════════════════════════════════════════════════

    const pendingDrawsRef = useRef<Map<string, { resolve: () => void }>>(new Map());

    // 注册全局事件监听器：DRAW_AT_CENTER → 分支判断，DRAW_COMPLETE → resolve
    useEffect(() => {
        const onAtCenter = (payload: { animId: string; card: CardData; owner: 'player' | 'enemy'; skipHandAdd?: boolean }) => {
            const { card, owner, skipHandAdd } = payload;
            const hand = owner === 'player' ? stateRef.current.playerHand : stateRef.current.enemyHand;
            const isBurn = hand.length >= 10;
            console.log(`[draw] onAtCenter ${owner} hand=${hand.length} isBurn=${isBurn} skipHandAdd=${skipHandAdd} card=${card.name}`);

            // [2026-07-06] 法术抽卡：卡已在手牌中（effectProcessor 已 push），仅播动画不再重复加入
            if (skipHandAdd) {
                eventBus.emit(GameEvents.DRAW_FLY_TO_HAND, { animId: payload.animId });
                return;
            }

            if (isBurn) {
                eventBus.emit(GameEvents.DRAW_CENTER_SHATTER, { animId: payload.animId });
            } else {
                // [交叉过渡] 立即写入手牌 + overlay 移除，AnimatedHandCard isNew 接替
                // [2026-09-04 莉莉子 修复] 与 onDrawComplete 一致按 id 去重：
                // 同一张生成/抽到的卡若被重复调度（双剑等使事件双触），onAtCenter 曾无脑 append → 手牌出现同 id 两张 → React key 撞车。
                if (owner === 'player') {
                    setPlayerHand(prev => prev.some(c => c.id === card.id) ? prev : [...prev, card]);
                } else {
                    setEnemyHand(prev => prev.some(c => c.id === card.id) ? prev : [...prev, card]);
                }
                eventBus.emit(GameEvents.DRAW_FLY_TO_HAND, { animId: payload.animId });
            }
        };

        const onDrawComplete = (payload: { animId: string; card: CardData; owner: 'player' | 'enemy'; isBurn: boolean }) => {
            if (payload.isBurn) {
                console.log(`【爆牌】${payload.owner} 手牌满，${payload.card.name} 爆牌销毁`);
            } else {
                // [2026-07-07] 法术抽卡：卡不在手牌中（spells.ts 过滤了），动画完成才加入
                if (payload.owner === 'player') {
                    setPlayerHand(prev => prev.some(c => c.id === payload.card.id) ? prev : [...prev, payload.card]);
                } else {
                    setEnemyHand(prev => prev.some(c => c.id === payload.card.id) ? prev : [...prev, payload.card]);
                }
            }
            const pending = pendingDrawsRef.current.get(payload.animId);
            if (pending) {
                pending.resolve();
                pendingDrawsRef.current.delete(payload.animId);
            }
        };

        eventBus.on(GameEvents.DRAW_AT_CENTER, onAtCenter);
        eventBus.on(GameEvents.DRAW_COMPLETE, onDrawComplete);

        return () => {
            eventBus.off(GameEvents.DRAW_AT_CENTER, onAtCenter);
            eventBus.off(GameEvents.DRAW_COMPLETE, onDrawComplete);
            pendingDrawsRef.current.clear();
        };
    }, []);

    // [重构] 事件驱动抽卡：DRAW_START → 动画层飞牌库→中央
    // 动画层到达中央后发 DRAW_AT_CENTER → 事件监听器分支判断
    // 动画层播完后发 DRAW_COMPLETE → Promise resolve
    // [2026-09-19] reason：抽卡的「场合标记」——目前只有换牌阶段的开局抽卡会打 'mulligan'，
    //   供音效层区分「换牌阶段开局抽出卡牌」与平时的「抽出卡牌」。
    //   ⚠️ 刻意做成**显式标记**而非"靠 count>=2 猜"：法术抽 2 张也满足 >=2，猜错就会串音。
    const drawCards = async (count: number, owner: 'player' | 'enemy', delay: number = 0, reason?: 'mulligan') => {
        if (delay > 0) await wait(delay);
        // [2026-07-20 对局记录] 抽卡
        if (count > 0) recordAction('draw_card', owner, `抽了 ${count} 张牌`);
        for (let i = 0; i < count; i++) {
            // 提前终止：如果游戏已经出结果，停止一切抽卡动画
            const curResult = stateRef.current.game.gameResult;
            if (curResult !== null) break;

            const currentDeck = owner === 'player' ? stateRef.current.playerDeck : stateRef.current.enemyDeck;

            // 疲劳判负逻辑：抽不出牌直接暴毙
            if (currentDeck.length === 0) {
                const loser = owner;
                const result = loser === 'player' ? 'defeat' : 'victory';

                gameLogger.logEvent({
                    type: 'game_end',
                    turn: stateRef.current.game.round,
                    isPlayerSide: true,
                    result: result === 'victory' ? 'win' : 'loss'
                });

                setGame(prev => ({ ...prev, gameResult: result, phase: 'animating' as const }));
                setMessage(loser === 'player' ? "牌库已空！你因疲劳而战败…" : "敌方牌库已空！敌方因疲劳而战败！");
                break;
            }

            const cardToDraw = currentDeck[0];
            const newDeck = currentDeck.slice(1);

            // 1. 物理层：立即扣除牌库里的卡牌
            if (owner === 'player') {
                setPlayerDeck(newDeck);
            } else {
                setEnemyDeckState(newDeck);
            }

            // 2. 生成唯一动画 ID，创建 Promise
            const animId = nextAnimId('draw', owner, cardToDraw.id);
            const drawPromise = new Promise<void>(resolve => {
                pendingDrawsRef.current.set(animId, { resolve });
            });

            // 3. 通信层：发射 DRAW_START → 动画层开始飞牌库→中央
            eventBus.emit(GameEvents.DRAW_START, { animId, card: cardToDraw, owner, reason });

            // 4. 等待动画层完整生命周期（中央到达 → 分支判断 → 飞入手牌/爆牌碎裂）
            await drawPromise;

            // 5. 节奏控制：单次抽牌结束后的微小停顿，准备抽下一张
            if (i < count - 1) await wait(300);
        }
    };

    // [安卡希雅] 快速抽卡：直接塞牌到手牌，跳过飞入动画
    const instantDrawCards = (count: number, owner: 'player' | 'enemy') => {
        // [BUG修复] 每次循环都从 stateRef 读牌库会导致闭包陷阱
        // （React 批量更新，stateRef.current 在同步循环中不会变）
        // 改为本地变量持有牌库，每次迭代 slice 更新
        let deck = owner === 'player'
            ? [...stateRef.current.playerDeck]
            : [...stateRef.current.enemyDeck];
        for (let i = 0; i < count; i++) {
            if (deck.length === 0) break;
            const card = deck[0];
            deck = deck.slice(1);
            if (owner === 'player') {
                setPlayerDeck(deck);
                setPlayerHand(prev => [...prev, card]);
            } else {
                setEnemyDeckState(deck);
                setEnemyHand(prev => [...prev, card]);
            }
        }
    };

    const resetGame = () => {
        // [2026-10-06 莉莉子 BUG修复 · BUG-20261006-01] 猫汐尔进度账本清零。
        // ⚠️ 诚实标注（独立审查回执 R.4）：`resetGame` **当前全仓库没有调用者**（可能是历史遗留），
        //    真正的清零发生在上面那个初始构建 effect（App 用 `key` 递增重挂 GameSession 时触发）。
        //    这里**保留**为防御性第二入口：将来若有人接上 resetGame，账本不会漏清。
        resetMauxirProgress();
        // [2026-10-06 莲台无垠] 同一道理：法术减费快照也必须跟着重设（否则跨局残留）
        setSpellCostDownAllSnapshot(
            getSpellCostDownAll(stateRef.current.game?.rogueEnhancements),
            getSpellCostDownAll(stateRef.current.game?.enemyEnhancements),
        );
        resetSpellCastState(); // [2026-10-08 第二波] 同上（跨局残留防护）
        // [修复] 替换未定义的 initDeck 函数，使用正规的解析与洗牌流程
        const pDeck = shuffleDeck(deck.filter(key => CARD_DB[key]).map(key => {
            // [2026-08-12 天启者养成] 开局装备：把 run 记录的装备挂到对应卡（目前等级解锁的装备挂起始英雄卡）
            let card = createFullCard(key);
            const equips = rogueEquipments?.[key];
            if (equips?.length) {
                // [2026-08-15] 武装/装备应用日志（排查武装断连：正常应看到英雄卡应用了武装 id）
                console.log(`[ResetGame] 卡 ${key} 应用装备 [${equips.join(', ')}]`);
                for (const eid of equips) card = attachEquipment(card, eid);
            }
            return card;
        }));
        const eDeck = shuffleDeck(enemyDeck.filter(key => CARD_DB[key]).map(key => {
            // [2026-08-30 程拍板] 敌人随机装备（resetGame 路径同样挂载）
            let card = createFullCard(key);
            const equips = enemyEquipments?.[key];
            if (equips?.length) for (const eid of equips) card = attachEquipment(card, eid);
            return card;
        }));

        // 洗牌并抽初始手牌 (各4张)
        const pHand = pDeck.splice(0, 4);
        const eHand = eDeck.splice(0, 4);

        setPlayerDeck(pDeck);
        setEnemyDeckState(eDeck);
        setPlayerHand(pHand);
        setEnemyHand(eHand);
        setPlayerBench([]);
        setEnemyBench([]);
        setCombatField([]);

        setGame({
            playerMana: 1,
            playerMaxMana: 1,
            playerSpellMana: 0,
            enemyMana: 1,
            enemyMaxMana: 1,
            enemySpellMana: 0,
            round: 1,
            phase: 'main',
            turnOwner: 'player',
            playerNexus: initialPlayerNexus ?? 20, // [2026-08-11] 同步注入初值（整局重开路径）
            playerNexusMax: playerNexusMax ?? 20, // [2026-08-11] 同步回血上限
            enemyNexus: initialEnemyNexus ?? 20, // [2026-08-28] 同步敌方水晶初始血量（重开路径）
            enemyNexusMax: initialEnemyNexus ?? 20, // [2026-08-30 莉莉子] 同步敌方回血上限（重开路径）
            // [修复] 删除非法的 playerMaxManaCap 和 enemyMaxManaCap
            spellStack: [],
            activeCard: null,
            attackToken: { player: 'normal', enemy: null },
            consecutivePasses: 0,
            // [修复] 删除废案属性 winner
            gameResult: null,
            levelUpCard: null,
            fullArtCard: null,

            // ==========================================
            // [新增] 补全 TypeScript 在第二道安检时查出的缺失必填项！
            leveledChampions: [],              // 重置英雄升级记录
            leveledChampionsBySide: { player: [], enemy: [] }, // [2026-09-13] 重置分阵营升级标记
            pendingLevelUps: [],               // [新增] 重置待升级队列
            lastActionTimestamp: Date.now(),   // 重置最后操作时间
            selectedBlockerId: null,           // 清空选中的格挡者
            selectedChallengerId: null,        // 清空选中的挑战者
            // ==========================================
            // [修复] 对齐真实的 GameStats 接口定义，铲除不匹配的幻觉属性
            stats: {
                nexusDamage: 0,
                unitsPlayed: 0,
                heroesPlayed: 0,
                spellsPlayed: 0,
                unitsKilled: 0,
                heroesKilled: 0,
                heroLevelUps: 0
            },
            screenShake: false,
            spellCasting: null,
            everywhereBuffs: [], // [核心新增] 重置游戏时，清空全域光环账本！
            gameRecords: [], // [2026-07-20] 重置对局记录
        } as any);

        recordAction('turn_start', 'player', `— 第 1 回合 —`);
        eventBus.emit(GameEvents.ROUND_START, { round: 1 });
        setMessage("GAME START");
    };

    // --- 4. 战斗系统 ---

    const initiateAttack = () => {
        if (game.phase !== 'main') return;
        if (game.spellStack.length > 0) return;
        if (game.attackToken.player === null) return;
        if (game.turnOwner !== 'player') return;
        setGame(prev => ({ ...prev, phase: 'attack_declare' as const, turnOwner: 'player', consecutivePasses: 0, lastActionTimestamp: Date.now() }));
        setMessage("选择进攻单位");
    };

    // ==========================================
    // [2026-10-10 莉莉子 · 程拍板] 神格①③「猎影援护 / 猎影疾袭」：**在"点击进攻之后"才兑现**
    // ── 为什么挪：原先在"拉取（装配战线）那一瞬间"就发 `on_pull_exposed` ⇒ 加成在玩家
    //    还能**撤回进攻**时就到手（程：「我本来预期这样会无限刷 BUFF」）；撤回本身又撞上
    //    空 `attacker` 的战線直接黑屏（同批已补空值护栏）。
    // ── 现在：拉取只打 `fromExposePull` 标记（`effectProcessor` 的猎影分支）；本函数在
    //    `commitAttack` / `confirmBlock`（＝玩家点了进攻、或防线确认）里被调用 ⇒ 已过"可撤回"窗口，
    //    且**这次进攻本身就吃到加成**（+2/+0、或 +3/+0 与【快速攻击】）。
    // ── 一次性：兑现后**清掉标记** ⇒ 同一条战线无论从哪个入口进来都只发一次。
    // ── 口径与 `challengeEnemy` 的同名站点完全一致（只对 **player** 拥有的战线触发、只回写脏切片）。
    // ==========================================
    const grantExposePullBuffs = () => {
        const snap = stateRef.current;
        const marked = (snap.combatField || []).filter((f: any) => f?.fromExposePull && f?.attacker);
        if (marked.length === 0) return;

        let game = { ...snap.game };
        let combatField: any[] = snap.combatField.map((f: any) => ({ ...f }));
        let playerBench = [...snap.playerBench];
        let enemyBench = [...snap.enemyBench];
        let playerHand = [...snap.playerHand];
        let enemyHand = [...snap.enemyHand];
        const playerDeck = [...snap.playerDeck];
        const enemyDeck = [...snap.enemyDeck];

        for (const line of marked) {
            // 神格是**玩家**的 run 强化（`buffs.ts` 的 divfx_marian_1/3 均 `playerEligible:false`）
            // ⇒ 与 challengeEnemy 站点同口径：只对 player 拥有的战线触发。
            if (line.owner !== 'player') continue;
            const pullCtx: RogueTriggerCtx = {
                game,
                playerBench, enemyBench, combatField,
                playerHand, enemyHand,
                playerDeck, enemyDeck,
                owner: 'player',
                trigger: 'on_pull_exposed',
                createFullCard,
                info: { playedCard: line.attacker }, // BUFF handler 的加成对象 = 发起拉取者
                dirty: { bench: new Set<Side>(), hand: new Set<Side>(), deck: new Set<Side>(), field: false, game: false },
            };
            runRogueTrigger(pullCtx, game.rogueEnhancements, 'on_pull_exposed');
            // 脏切片回写（与 challengeEnemy / effectProcessor 猎影分支的同名片段同构）
            if (pullCtx.dirty.game) game = { ...pullCtx.game };
            if (pullCtx.dirty.field) combatField = [...pullCtx.combatField];
            if (pullCtx.dirty.bench.has('player')) playerBench = pullCtx.playerBench;
            if (pullCtx.dirty.bench.has('enemy')) enemyBench = pullCtx.enemyBench;
            if (pullCtx.dirty.hand.has('player')) playerHand = pullCtx.playerHand;
            if (pullCtx.dirty.hand.has('enemy')) enemyHand = pullCtx.enemyHand;
        }

        // **清标记**（兑现凭据一次性）—— 与上面的加成写回放在**同一批**提交里
        combatField = combatField.map((f: any) => (f?.fromExposePull ? { ...f, fromExposePull: false } : f));

        setGame(game);
        setCombatField(combatField);
        setPlayerBench(playerBench);
        setEnemyBench(enemyBench);
        setPlayerHand(playerHand);
        setEnemyHand(enemyHand);
        // 同步快照：紧随其后的 commitAttack / confirmBlock 必须读到"加成之后"的战场
        stateRef.current.game = game;
        stateRef.current.combatField = combatField;
        stateRef.current.playerBench = playerBench;
        stateRef.current.enemyBench = enemyBench;
        stateRef.current.playerHand = playerHand;
        stateRef.current.enemyHand = enemyHand;
    };

    const commitAttack = () => {
        // [2026-10-10 莉莉子 · 程拍板] **猎影援护/疾袭 在这里兑现**（拉取时只打标记）。
        //   放在最前：紧随其后的 `stateRef.current.combatField` 必须已经是"加成之后"的战场，
        //   这样**这次进攻本身就吃到** +2/+0（或 +3/+0 与【快速攻击】）。
        grantExposePullBuffs();
        const currentCombatField = stateRef.current.combatField; // 提取绝对新鲜的战场快照
        if (currentCombatField.length === 0) {
            setGame(prev => ({ ...prev, phase: 'main', lastActionTimestamp: Date.now() }));
            return;
        }

        // =====================================
        // [核心重构] 空降交战区与攻击宣告拦截
        // =====================================
        let tempGame = { ...stateRef.current.game };
        let tempPlayerBench = [...stateRef.current.playerBench];
        let tempEnemyBench = [...stateRef.current.enemyBench];
        let tempCombatField = [...currentCombatField];
        let hasEffectTriggered = false;
        const pendingSpells: SpellStackItem[] = [];

        // [能力] 触发攻击宣告类能力的闪光
        const flashAttackAbility = (fighterList: any[]) => fighterList.map((fight: any) => {
            if (fight.attacker && fight.attacker.ability && fight.attacker.ability.trigger === 'on_attack_declare' && fight.attacker.abilityState === 'breathing') {
                const attacker = { ...fight.attacker, abilityState: 'flashing' as const };
                setTimeout(() => {
                    const chargeLeft = attacker.ability.maxCharges === -1 ? -1 : (attacker.abilityCharges || 0) - 1;
                    const finalState = (chargeLeft === 0 && attacker.ability.postTriggerState === 'dim') ? 'dimmed' : 'breathing';
                    setCombatField((prev: any) => prev.map((f: any) =>
                        f.attacker.id === attacker.id ? { ...f, attacker: { ...f.attacker, abilityState: finalState, abilityCharges: chargeLeft } } : f
                    ));
                }, 500);
                return { ...fight, attacker };
            }
            return fight;
        });
        tempCombatField = flashAttackAbility(tempCombatField);

        // [关键] 仅遍历初始时的参战者，防止新空降的单位也带有攻击宣告从而导致死循环！
        const initialFighters = [...tempCombatField];

        initialFighters.forEach((fight) => {
            // [核心修复] 拆除 owner === 'player' 阵营隔离墙！允许全域监听进攻宣告！
            if (fight.attacker && fight.attacker.effects) {
                fight.attacker.effects.forEach(effId => {
                    const def = EFFECT_DB[effId];
                    // [核心修复] 放宽匹配规则
                    if (def && def.timing.includes('ON_ATTACK_DECLARE')) {
                        // [LILITH-DEBUG] 镜爻卜卜复制排查：记录攻击宣告效果触发次数
                        if (effId === 'effect_pupu_level2_attack' || effId === 'effect_test_pupu_attack') {
                            console.log(`[LILITH-DEBUG][ATTACK-DECLARE] 触发 effect=${effId} attacker=${fight.attacker.key}(${fight.attacker.name}) lv=${fight.attacker.level} owner=${fight.owner} combatLen=${tempCombatField ? tempCombatField.length : 0} benchLen=${tempPlayerBench.length}`);
                        }
                        const ctx: EffectContext = {
                            game: tempGame,
                            playerBench: tempPlayerBench,
                            enemyBench: tempEnemyBench,
                            playerHand: [...stateRef.current.playerHand],
                            enemyHand: [...stateRef.current.enemyHand],
                            combatField: tempCombatField, // 传递当前战况供处理器修改（包含空降与防爆机制）
                            // [核心修复] 动态抓取当前发起攻击的真实阵营！
                            owner: fight.owner,
                            sourceCard: fight.attacker, // [新增] 把本体传给结算引擎，充当复印机的扫描源头！
                            // [2026-10-05 莉莉子 BUG修复] 补传 `createFullCard` ——
                            //   `FLYING_SWORD`（玛格丽特「飞剑突袭」飞剑2）正是挂在本 ON_ATTACK_DECLARE 站点上，
                            //   而飞剑补跑 `on_summon` 时需要它来构造 RogueTriggerCtx；不传则整段被跳过、
                            //   飞剑静默吃不到任何"召唤时"强化（详因见 effectProcessor 的 FLYING_SWORD 分支）。
                            createFullCard,
                        };

                        // [核心] 调用正规效果处理器
                        const res = processEffect(effId, [], ctx);

                        // 接收返回的新鲜快照
                        tempGame = res.game;
                        tempPlayerBench = res.playerBench;
                        tempEnemyBench = res.enemyBench;
                        // [BUG修复] 同步写回手牌（FLYING_SWORD 等效果会修改手牌中的卡牌数据）
                        if (res.playerHand && fight.owner === 'player') setPlayerHand(res.playerHand);
                        if (res.enemyHand && fight.owner === 'enemy') setEnemyHand(res.enemyHand);
                        // 注意：processEffect 内部的 SUMMON 指令可能会直接向 combatField 推入空降兵
                        if (res.combatField) tempCombatField = res.combatField;

                        hasEffectTriggered = true;
                    }
                });
            }

        });

        // [2026-07-17 阿尔戈重做] onAttackSpell 检测 — 支持无限制触发（鸽子）和有限次触发（银臂）
        initialFighters.forEach((fight) => {
            if (fight.attacker && fight.attacker.onAttackSpell) {
                // 判断是否为无限制触发 (ability.maxCharges === -1)
                const isUnlimited = fight.attacker.ability && fight.attacker.ability.maxCharges === -1;
                // 有限次触发且已触发过 → 跳过
                if (!isUnlimited && fight.attacker.customProgress) return;

                const spellCard = createFullCard(fight.attacker.onAttackSpell);
                spellCard.parentCard = { ...fight.attacker };
                pendingSpells.push({
                    card: spellCard,
                    owner: fight.owner,
                    targets: []
                });

                // 仅有限次触发需要标记 customProgress（如银臂首次进攻）
                if (!isUnlimited) {
                    const markUsed = (c: CardData) =>
                        c.id === fight.attacker.id ? { ...c, customProgress: 1 } : c;
                    tempPlayerBench = tempPlayerBench.map(markUsed);
                    tempEnemyBench = tempEnemyBench.map(markUsed);
                    if (tempCombatField) {
                        tempCombatField = tempCombatField.map(f => ({
                            ...f,
                            attacker: f.attacker && f.attacker.id === fight.attacker.id
                                ? { ...f.attacker, customProgress: 1 }
                                : f.attacker,
                            blocker: f.blocker,
                        }));
                    }
                }

                hasEffectTriggered = true;
                console.log(`[onAttackSpell] ${fight.attacker.name} 触发 onAttackSpell=${fight.attacker.onAttackSpell}，已推入堆栈${isUnlimited ? '（无限制）' : ''}`);
            }
        });

        // [贡露] 进攻宣告时：消耗无人机充能召唤辅助无人机
        initialFighters.forEach((fight) => {
            if (fight.attacker?.key !== 'titan_gonglu') return;
            const titanCharge = (fight.attacker as any).titanCharge || 0;
            if (titanCharge <= 0) return;

            const toSummon = Math.min(titanCharge, 4);
            const currentCombatLen = tempCombatField ? tempCombatField.length : 0;
            const availableSlots = 6 - currentCombatLen;
            const actuallySummon = Math.min(toSummon, availableSlots);

            for (let i = 0; i < actuallySummon; i++) {
                const drone = createCard('titan_gonglu_drone');
                drone.animState = 'idle';
                if (tempCombatField) {
                    tempCombatField.push({
                        attacker: drone,
                        blocker: null,
                        owner: fight.owner,
                    });
                }
            }

            // 消耗充能
            (fight.attacker as any).titanCharge = 0;
            if (actuallySummon > 0) {
                hasEffectTriggered = true;
                console.log(`[贡露] 召唤 ${actuallySummon} 个辅助无人机（充能 ${titanCharge}，空位 ${availableSlots}）`);
            }
        });

        // ==========================================
        // [2026-09-05 莉莉子] STAT_BALANCE（生命壁垒/攻守易形）在进攻宣告确认时触发（程拍板：带调整后数值去战斗）
        // 玩家攻击者在 commitAttack（点进攻确认）那一刻即成长（攻血互等只增不减），不再等 animating 打击结算后才触发。
        // 故 useGameState 的 after_attack（animating）分支须跳过 STAT_BALANCE，防二次触发（见 2247 段）。
        // ==========================================
        let statBalanceApplied = false;
        const statBalanceDefs = getRogueDefs(stateRef.current.game.rogueEnhancements, 'after_attack')
            .filter(d => d.battleEffect?.effectClass === 'STAT_BALANCE');
        if (statBalanceDefs.length > 0) {
            tempCombatField = tempCombatField.map(fight => {
                if (fight.owner !== 'player' || !fight.attacker) return fight;
                let attacker = fight.attacker;
                statBalanceDefs.forEach(def => {
                    const be = def.battleEffect!;
                    const buffed = applyStatBalance(attacker, (be.params?.mode as string) ?? 'health_to_power');
                    if (buffed !== attacker) {
                        attacker = buffed;
                        statBalanceApplied = true;
                    }
                });
                return attacker === fight.attacker ? fight : { ...fight, attacker };
            });
            if (statBalanceApplied) statBalanceDefs.forEach(def => flashRogueBuff(def));
        }

        // ==========================================
        // [2026-09-28 莉莉子 神格神经] 新触发时机「进攻宣告」（on_attack_declare）—— 程授权改本文件
        //   服务：芬妮②④（进攻单位攻击力总和达标 → 备战）· 卜卜①③（进攻时复制召唤）
        //   时机：STAT_BALANCE 之后、下面的渲染提交之前 ⇒ 本时机产生的增删会被同一次提交带出去
        // ==========================================
        let declTouched = false;
        if (tempCombatField.length > 0) {
            const declOwner = (tempCombatField[0]?.owner ?? 'player') as Side;
            const declCtx: RogueTriggerCtx = {
                game: { ...stateRef.current.game },
                playerBench: [...tempPlayerBench],
                enemyBench: [...tempEnemyBench],
                combatField: tempCombatField,
                playerHand: [...stateRef.current.playerHand],
                enemyHand: [...stateRef.current.enemyHand],
                playerDeck: [...stateRef.current.playerDeck],
                enemyDeck: [...stateRef.current.enemyDeck],
                owner: declOwner,
                trigger: 'on_attack_declare',
                createFullCard,
                info: {},
                dirty: { bench: new Set<Side>(), hand: new Set<Side>(), deck: new Set<Side>(), field: false, game: false },
            };
            // =====================================
            // [2026-10-05 莉莉子 · BUG-20261005-14 取证日志]（查完可删）
            //   实测：卜卜「①镜爻随征/③万象镜身」（on_attack_declare 神格）不召唤，而**英雄自身的镜爻照常**
            //   ⇒ 本站点本身是通的，问题在这条神级分发**读到的数据**上 ⇒ 一次复现即可定位：
            //     declOwner（交战区第一条阵营）· 本次强化表条数 · 卜卜神格是否在表里 · 备战席可复制单位数
            {
                const ownEnh = declOwner === 'player' ? stateRef.current.game.rogueEnhancements : stateRef.current.game.enemyEnhancements;
                const bubuNodes = (ownEnh ?? []).filter(id => id.startsWith('divfx_bubu_'));
                const benchNow = declOwner === 'player' ? tempPlayerBench : tempEnemyBench;
                const aliveBench = benchNow.filter(c => !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying').length;
                console.log(`[RogueDecl] owner=${declOwner} 强化数=${(ownEnh ?? []).length} divfx共${(ownEnh ?? []).filter(id => id.startsWith('divfx_')).length}条 卜卜神格=[${bubuNodes.join(',')}] 可复制备战席=${aliveBench}`);
            }
            runRogueTrigger(
                declCtx,
                declOwner === 'player' ? stateRef.current.game.rogueEnhancements : stateRef.current.game.enemyEnhancements,
                'on_attack_declare',
            );
            tempCombatField = declCtx.combatField;   // 复制召唤会追加参战单位
            tempPlayerBench = declCtx.playerBench;
            tempEnemyBench = declCtx.enemyBench;
            if (declCtx.dirty.game) commitDirtyGame(declCtx.game, stateRef.current.game);
            if (declCtx.dirty.hand.size > 0) { setPlayerHand(declCtx.playerHand); setEnemyHand(declCtx.enemyHand); }
            if (declCtx.dirty.deck.size > 0) { setPlayerDeck(declCtx.playerDeck); setEnemyDeckState(declCtx.enemyDeck); } // [2026-09-29 莉莉子] 修 setEnemyDeck 笔误（实际 setter 名是 setEnemyDeckState）—— 否则进攻宣告触发牌库改动时运行时 ReferenceError
            declTouched = declCtx.dirty.field || declCtx.dirty.bench.size > 0 || declCtx.dirty.hand.size > 0 || declCtx.dirty.deck.size > 0 || declCtx.dirty.game;
        }

        // [修复] 根据进攻方决定格挡方：player 进攻 → enemy 格挡，enemy 进攻 → player 格挡
        const firstOwner = currentCombatField[0]?.owner || 'player';
        const blockTurnOwner = firstOwner === 'player' ? 'enemy' : 'player';

        // [2026-07-21 对局记录] 进攻宣告
        recordAction('combat_declare', firstOwner, '发起进攻', {
            entities: currentCombatField.map(f => ({
                cardKey: f.attacker.key,
                owner: f.owner,
                snapshot: captureSnapshot(f.attacker),
            }))
        });

        // 统一结算并下发给 React 渲染层
        // 如果有法术待结算（如银臂乱打），推入堆栈后直接进入格挡阶段
        // 堆栈中的法术会在格挡确认后、战斗结算前通过 passTurn → resolveStack 自然结算
        if (hasEffectTriggered || statBalanceApplied || pendingSpells.length > 0 || declTouched) {
            setPlayerBench((hasEffectTriggered || declTouched) ? tempPlayerBench : stateRef.current.playerBench);
            setEnemyBench((hasEffectTriggered || declTouched) ? tempEnemyBench : stateRef.current.enemyBench);
            setCombatField((hasEffectTriggered || statBalanceApplied || declTouched) ? (tempCombatField as any) : stateRef.current.combatField);
        }

        // =====================================
        // [2026-09-16 1.0.16 茉莉安 · T08①] 獠牙信标引爆倒计时
        // ── 规则（设计文档 3.3）：某一方派出 N 个单位进攻 → 【对面】备战席上的信标 −N
        //    「信标永远站在召唤者的对面」→ 谁在进攻，就决定哪边的信标掉血
        // ── 计数口径：**每个进攻单位各算 1**（不是按进攻动作算），故数 initialFighters 里的人数
        //    initialFighters 是「宣告时的参战者」快照，不含后续空降的单位 —— 正合「宣告了几个人」
        // ── 死亡不在此处宣判：交给 runResolveCombatAnimation 开头的 judgeLifeAndDeath 收尸。
        //    那函数读的是 stateRef.current，此处同步调用只会拿到旧快照、并把本次伤害覆盖掉。
        // ✅ [2026-09-18 T08② 完成] 「该次进攻拉取了宿主方带暴露的单位格挡 → 再 −1」—— T10 暴露引擎已就绪，本次补上
        // =====================================
        {
            const attackersBySide: Record<'player' | 'enemy', number> = { player: 0, enemy: 0 };
            // [2026-09-18 T08②] 本次宣告中「被拉取上场格挡」的次数
            //   拉人来源 = 挑战者 / 暴露引擎，二者都会在 fight 上打 isChallenged 标记
            //   规则：该次进攻拉取了信标方的单位格挡 → 该方信标再 −1（每被拉 1 个算 1）
            const challengedBySide: Record<'player' | 'enemy', number> = { player: 0, enemy: 0 };
            initialFighters.forEach(f => {
                const side = f.owner === 'enemy' ? 'enemy' : 'player';
                // [2026-10-09 莉莉子 BUG修复 · BUG-20261009-01] 已由「造剑处」计入倒计时的飞剑跳过
                //   ── 可达场景：玩家在 attack_declare 期间用**快速**飞剑法术（御剑归鞘 / 剑鸣回响）召剑，
                //      那两把剑此刻已在交战区里；若不跳过，本处会**再数一次** ⇒ 2 把剑扣 4 血。
                //      （飞剑造剑处 `effectProcessor` 的 FLYING_SWORD 分支打此标记）
                if (f.attacker && !(f.attacker as any).beaconFuseCounted) attackersBySide[side] += 1;
                if (f.isChallenged) challengedBySide[side] += 1;
            });

            // [2026-10-09 莉莉子 BUG修复 · BUG-20261009-01] 规则实现已**收口**到 `utils/beaconFuse.ts`
            //   ── 病根：这段原先只长在本函数里，于是"绕开 commitAttack 进场的飞剑"从不结算倒计时。
            //      现在同一份规则被两个调用点共用：本处（进攻宣告）+ effectProcessor 造剑处（飞剑）。
            //   ── ⚠️ 计数口径**不变**：仍是 `initialFighters`（宣告时的参战者快照）。
            const fused = applyBeaconFuse({
                playerBench: tempPlayerBench,
                enemyBench: tempEnemyBench,
                combatField: tempCombatField,
                attackersBySide,
                challengedBySide,
                source: '进攻宣告',
            });

            if (fused.enemyBench !== tempEnemyBench) setEnemyBench(fused.enemyBench);
            if (fused.playerBench !== tempPlayerBench) setPlayerBench(fused.playerBench);
            if (fused.combatField !== tempCombatField) setCombatField(fused.combatField);
        }
        setGame(prev => ({
            ...(hasEffectTriggered ? tempGame : prev),
            spellStack: [...pendingSpells, ...(prev.spellStack || [])],
            phase: 'block_declare' as const,
            turnOwner: blockTurnOwner,
            consecutivePasses: 0,
            lastActionTimestamp: Date.now(),
            gameRecords: prev.gameRecords, // [2026-07-21] 确保 recordAction 的记录不被覆盖
        }));
        setMessage(pendingSpells.length > 0 ? "银臂乱打已入堆栈，请对手格挡" : "等待格挡...");
    };

    // [核心修复 1] 斩断直连结算！防守方确认格挡后，切入响应阶段，并把优先权踢回给进攻方
    const confirmBlock = () => {
        // [2026-10-10 莉莉子 · 程拍板] 猎影援护/疾袭的**另一个兑现入口**：
        //   猎影的额外攻击会把阶段推到 `block_declare`（`isExtraAttack` 强制格挡）⇒
        //   玩家点的可能是「防线确认」而不是「进攻」。两处都调、靠 `fromExposePull` 标记
        //   保证**只发一次**（先到先得，后到的查不到标记）。
        grantExposePullBuffs();
        // [2026-07-21 对局记录] 格挡宣告 — 收集所有阻挡者
        const blockField = stateRef.current.combatField;
        const playerBlockers = blockField.filter(f => f.blocker && f.owner === 'enemy');
        const enemyBlockers = blockField.filter(f => f.blocker && f.owner === 'player');
        if (playerBlockers.length > 0) {
            recordAction('combat_declare', 'player', '指派格挡', {
                entities: playerBlockers.map(f => ({ cardKey: f.blocker!.key, owner: 'player', snapshot: captureSnapshot(f.blocker!) }))
            });
        }
        if (enemyBlockers.length > 0) {
            recordAction('combat_declare', 'enemy', '指派格挡', {
                entities: enemyBlockers.map(f => ({ cardKey: f.blocker!.key, owner: 'enemy', snapshot: captureSnapshot(f.blocker!) }))
            });
        }

        setGame(prev => ({
            ...prev,
            phase: 'react_to_block',
            // 谁刚确认完格挡（通常是防守方），就把优先权交给对面（进攻方）开始打法术
            turnOwner: prev.turnOwner === 'player' ? 'enemy' : 'player',
            consecutivePasses: 0,
            lastActionTimestamp: Date.now()
        }));
        setMessage("防线部署完毕，请进攻方进行战术响应");
        eventBus.emit(GameEvents.SFX_CONFIRM_BLOCK); // [教程] 子任务完成信号
    };

    // ==========================================
    // [SBA] 生死簿同步判决 (judgeLifeAndDeath)
    // 在任意可能造成死亡的动作之后同步调用，统一宣判生死
    // ==========================================
    const judgeLifeAndDeath = () => {
        const { playerBench, enemyBench, combatField } = stateRef.current;
        let changed = false;
        const newlyDead: CardData[] = [];

        // [2026-10-05 莉莉子 BUG修复 · 20261005-02] 「已宣判」判据补第二条：**尸体已入墓地 ⇒ 亡语早已结算过**
        //   病根：另两条判死路径不写 `isDead`（备战席 processDeaths 只写 animState；交战区由对账器补票），
        //   而本函数的去重首句恰恰只看 `isDead` ⇒ 尸体留在场上那段时间（备战席 ~2.5s / 交战区到收尾清场），
        //   任何一次 judgeLifeAndDeath（每路战斗后 / 回合末 / 每次施法…）都会给同一具尸体**再开一张死亡票**
        //   ⇒ 亡语结算两遍（珍馐绵羊：一次亡语给 2 张梦莲无人机，程实测拿到 4 张）。
        //   ⚠️ 只在 `animState === 'dying'` 时查墓地：复活体重新入场是 `summoning` 且 RESURRECT 显式写
        //      `isDead:false` ⇒ 它的"第二次死亡"不会被这条误拦。
        const inGraveyard = (id: string): boolean =>
            (stateRef.current.game.playerGraveyard || []).some(g => g.id === id)
            || (stateRef.current.game.enemyGraveyard || []).some(g => g.id === id);

        const judgeUnit = (c: CardData): CardData => {
            if (c.isDead) return c; // 已宣判，跳过
            // ⚠️ [2026-10-05 追加] 幻象态（`ephemeral_dying`）也要查墓地 —— 梵音小队/飞剑这批幻象的
            //   消散演出态会被上面的"尸体盖章"刻意保留，若只认 `dying` 就会漏掉它们这一格。
            if ((c.animState === 'dying' || c.animState === 'ephemeral_dying') && inGraveyard(c.id)) return c; // 票已开过且亡语已结算 ⇒ 绝不开第二张
            const hp = (c.health || 0) + (c.buffs?.health || 0) + (c.roundBuffs?.health || 0) - (c.damageTaken || 0); // [2026-07-31] 补上本回合临时血，优先被扣
            const isDead = hp <= 0 || c.animState === 'ephemeral_dying';
            if (isDead) {
                changed = true;
                const deadUnit = { ...c, isDead: true, animState: 'dying' as const };
                // [2026-10-05 莉莉子 BUG修复 · 20261005-12 · 独立审查发现] 判死同样**造新对象** ⇒ 账本要跟着搬，
                //   否则"已派发过的尸体"换个身份又变成"没派发过"⇒ 补派发那趟重复触发一次。
                if (hasUnitDieDispatched(c)) markUnitDieDispatched(deadUnit);
                newlyDead.push(deadUnit);
                return deadUnit;
            }
            return c;
        };

        // ① 扫描 playerBench
        // [2026-10-02 莉莉子 -15] const → let：下面要给"交战区常规阵亡"补发 unit_die 强化，
        //   而强化可能改备战席（RESURRECT 补复活体）⇒ 需要能就地更新这三个工作数组
        let newPlayerBench = playerBench.map(judgeUnit);
        // ② 扫描 enemyBench
        let newEnemyBench = enemyBench.map(judgeUnit);
        // ③ 扫描 combatField (attacker + blocker)
        let newCombatField = combatField.map(entry => ({
            ...entry,
            attacker: entry.attacker ? judgeUnit(entry.attacker) : null,
            blocker: entry.blocker ? judgeUnit(entry.blocker) : null,
        }));

        // 推入微队列触发亡语
        // [2026-10-02 莉莉子 BUG修复 · -15] 交战区常规阵亡的 unit_die 强化 ctx（按 owner 每批共享一个）
        const fieldDeathCtx: Partial<Record<'player' | 'enemy', RogueTriggerCtx>> = {};
        // =====================================
        // [2026-10-05 莉莉子 BUG修复 · 20261005-12] **已盖章尸体的"补派发"**（程实测：飞剑阵亡不再触发 unit_die）
        // ── 病根：`isDead` 被当成两件事用 —— 它既是"亡语已结算"（`stampCorpse`，本文件 :2833），
        //    又成了"unit_die 已派发"的替身（`judgeUnit` 首句 `if (c.isDead) return c`，本文件 :2090）
        //    ⇒ 尸体进不了 `newlyDead` ⇒ 挂在 `newlyDead` 上的"**交战区**补发 unit_die"永不执行。
        //    （1.0.18.3 之所以反而能触发：那时没盖章，`judgeUnit` 还会把幻象态改写成 `'dying'`，
        //      恰好绕过了 `!isEphemeralDeath` 守卫 —— 歪打正着。）
        // ── 修法：把"已派发"独立成 `utils/deathLedger` 的账本，并把**交战区里已盖章但未派发**的尸体
        //    纳入下面这一趟（`fresh: false` ⇒ **只派发，不重发 UNIT_DIE** —— 重发会再开一张死亡票）。
        // ── 只收交战区：备战席与回合末幻象各有自己的派发点（`processDeaths` / `useRoundLifecycle`），
        //    而"在交战区被打死"正是被掐断的那条路。
        // =====================================
        const stampedCorpses: CardData[] = [];
        {
            const seen = new Set<CardData>();
            const collect = (c: CardData | null | undefined) => {
                if (!c || seen.has(c)) return;
                seen.add(c);
                if (!(c.isDead || c.animState === 'dying' || c.animState === 'ephemeral_dying')) return;
                // [2026-10-05 · 独立审查·6] 「消亡替换」不算阵亡 —— 对齐本文件 :2528-2531 的既有口径
                if (c.deathType === 'ELIMINATED') return;
                if (hasUnitDieDispatched(c)) return;
                stampedCorpses.push(c);
            };
            // [2026-10-05 · 独立审查·2] 备战席也要收：尸体若先被盖章，`judgeUnit`（:2101/:2104）
            //   与 `processDeaths`（:980 的 `dying` 守卫）会**双双挡住**它 ⇒ 没人派发。
            newPlayerBench.forEach(collect);
            newEnemyBench.forEach(collect);
            newCombatField.forEach(f => {
                collect(f.attacker as CardData | null);
                collect(f.blocker as CardData | null);
            });
        }
        if (stampedCorpses.length > 0) {
            console.log(`[DeathLedger] 补派发 unit_die：${stampedCorpses.length} 具（${stampedCorpses.map(c => c.name).join(' / ')}）`);
        }
        const deathEntries: { unit: CardData; fresh: boolean }[] = [
            ...newlyDead.map(u => ({ unit: u, fresh: true })),
            ...stampedCorpses.map(u => ({ unit: u, fresh: false })),
        ];

        deathEntries.forEach(({ unit, fresh }) => {
            // [2026-09-19 莉莉子 BUG修复] 归属推导补全「格挡方」分支。
            // ── 病根：此前只认进攻方（attacker 属 f.owner），凡不在备战席、又不是进攻方的，
            //    一律掉进最后的 `: 'player'` 兜底。而獠牙信标是 CantAttack 单位，
            //    在战场上【只可能是格挡方】→ 永远被算成玩家方的人。
            //    SPREAD_DAMAGE 正是按 context.owner 索敌 ⇒ 亡语 8 点分摊炸到了茉莉安自己场上。
            // ── 正解与 recallBlocker(格挡撤回) / SPREAD_DAMAGE 收集段 同口径：
            //      进攻方 = 发起方 f.owner；格挡方 = 发起方的【对面】。
            // [2026-09-19 莉莉子 方向一] 有归属戳 → 查表，一步到位（信标等召唤物走这条）
            // ── [2026-10-03 莉莉子 · P1 归属口径收口 · 第一步] 整段推导**迁移到唯一出口**。
            //    口径**逐字不变**：戳优先 → 备战席（玩家席在前）→ 交战区攻守反推 → 兜底 'player'。
            //    目的：消掉本文件里的第 N 份"交战区归属"拷贝，与 `collectFieldUnits` 共用同一份知识。
            //    ⚠️ 必须传**工作数组**（本次提交后的 new*），不能传 stateRef 快照。
            const owner = sideOfUnit(unit, {
                playerBench: newPlayerBench,
                enemyBench: newEnemyBench,
                combatField: newCombatField,
            });
            // =====================================
            // [2026-10-02 莉莉子 BUG修复 · BUG-20261002-15] 交战区的【常规阵亡】也要触发 unit_die 强化
            // ── 病根：unit_die 强化的触发站点只有两处，**都不是"交战区的常规阵亡"**：
            //    ① `processDeaths`（本文件 :1018）—— **只扫两个备战席**，交战区永远进不去；
            //    ② `useRoundLifecycle:1458` 那段 —— **只处理幻象阵亡**（`ephemeral_dying`），
            //       且显式排除 RESURRECT（防"飞剑死了又活"的循环）。
            //    ⇒ 常规（血量归零）阵亡**发生在交战区**时，**全部 12 处 unit_die 强化/神格零联动**：
            //      亡灵军团 / 不死军团 / 英魂传承 / 献祭仪式 / 余烬 / 返祖 / 献祭回响 /
            //      芬妮⑥聚光灯不落 / 卜卜②卜骨遗响 / 卜卜④龟甲承魂 / 安卡②残月·拾遗 / 安卡④朔望·减耗。
            //   粉丝原话（-15）：「对面进攻**碰死两个**（战场）**没触发**」「我用法术打死**备战席的触发了**」
            //    —— 逐字对应这个缺口。
            // ── 为什么放这里：本函数是**唯一同时扫备战席 + 交战区**的判决点，
            //    且 `judgeUnit` 打上 `isDead` 后同一死者不会再判一次 ⇒ **天然去重**，
            //    不会像"再新开一个触发站点"那样重复触发。
            // ── 分工保持不变（三条死亡路径各管一段，互不重叠）：
            //    幻象阵亡 → useRoundLifecycle 那段；常规·备战席 → processDeaths；**常规·交战区 → 本段**。
            // ── 批次语义：同一 owner 在本批共享一个 ctx ⇒ 保住「非全复活强化每批每侧只救首个」。
            // =====================================
            {
                const isFieldCorpse = newCombatField.some(f => f.attacker?.id === unit.id || f.blocker?.id === unit.id);
                // [2026-10-05 莉莉子 BUG修复 · 20261005-12] 原判据 `!isEphemeralDeath` 改由**独立账本**承担：
                //   它俩想防的是同一件事（与回合末幻象收口重复派发），但原写法把"**战斗中被打死**的飞剑"
                //   一起挡掉了 —— 那批尸体**到不了回合末**（会被清场移除）⇒ 两条路都没派发（程实测的正是这条）。
                //   账本按"这次死亡是否已派发"判重，与幻象态无关 ⇒ 该发的发、绝不多发。
                //   ⚠️ [独立审查·2] **不再要求"在交战区"** —— 备战席的死者若在这里被新判死，
                //      `processDeaths`（`:980` 的 `dying` 守卫）之后就再也看不上它了 ⇒ 谁也发不了。
                //      判重完全交给账本（`processDeaths` 派发时会记账 ⇒ 不会撞车）。
                if (!hasUnitDieDispatched(unit)) {
                    let fctx = fieldDeathCtx[owner];
                    if (!fctx) {
                        fctx = {
                            game: { ...stateRef.current.game },
                            playerBench: [...newPlayerBench],
                            enemyBench: [...newEnemyBench],
                            combatField: [...newCombatField],
                            playerHand: [...stateRef.current.playerHand],
                            enemyHand: [...stateRef.current.enemyHand],
                            playerDeck: [...stateRef.current.playerDeck],
                            enemyDeck: [...stateRef.current.enemyDeck],
                            owner,
                            trigger: 'unit_die',
                            createFullCard,
                            info: { resurrectedSide: undefined },
                            dirty: { bench: new Set<Side>(), hand: new Set<Side>(), deck: new Set<Side>(), field: false, game: false },
                        };
                        fieldDeathCtx[owner] = fctx;
                    }
                    fctx.info.deadUnit = unit;
                    const fieldDieEnh = owner === 'player'
                        ? stateRef.current.game.rogueEnhancements
                        : stateRef.current.game.enemyEnhancements;
                    // [2026-10-05 · 独立审查·3 二轮] **幻象单位一律不复活**（按 `Ephemeral` 关键词判定，不按 animState）：
                    //   与回合末幻象收口同口径（`useRoundLifecycle:1550` 排除 RESURRECT，理由：量产幻象复活会
                    //   形成"死了又活"的循环）。⚠️ 用 animState 判定不够 —— 它一被克隆/改写成 `'dying'` 就失效；
                    //   而 `keywords.includes('Ephemeral')` 是这套体系里判"这是幻象"的既有唯一口径（对比 `:1444`）。
                    //   普通单位不受影响 ⇒ 亡灵军团 / 不死军团照常生效。
                    const isEphemeralUnit = (unit.keywords || []).includes('Ephemeral');
                    // [2026-10-05 · 独立审查·4 二轮] `changed` 必须在**派发之前**置位：
                    //   否则 `runRogueTrigger` 一旦抛异常，末尾 `if (changed)` 不提交 ⇒ 整批尸体的改动全丢。
                    changed = true;
                    try {
                        runRogueTrigger(fctx, fieldDieEnh, 'unit_die', isEphemeralUnit ? (ec) => ec !== 'RESURRECT' : undefined);
                    } catch (err) {
                        // 单条强化的异常不该拖垮整条死亡管线（后面还有别的尸体要处理）
                        console.error(`[unit_die] 强化派发异常（${unit.name} / owner=${owner}）：`, err);
                    }
                    // 就地回写本批的工作数组（RESURRECT 会给备战席补一个复活体、DEATH_GIFT 会改手牌…）
                    newPlayerBench = fctx.playerBench as CardData[];
                    newEnemyBench = fctx.enemyBench as CardData[];
                    if (fctx.combatField) newCombatField = fctx.combatField as any[];
                    if (fctx.dirty.hand.has('player')) setPlayerHand(fctx.playerHand);
                    if (fctx.dirty.hand.has('enemy')) setEnemyHand(fctx.enemyHand);
                    if (fctx.dirty.deck.has('player')) setPlayerDeck(fctx.playerDeck);
                    if (fctx.dirty.deck.has('enemy')) setEnemyDeckState(fctx.enemyDeck);
                    if (fctx.dirty.game) commitDirtyGame(fctx.game, stateRef.current.game);
                    console.log(`[DeathCheck] ${unit.name} 在${isFieldCorpse ? '【交战区】' : '备战席'}${fresh ? '常规阵亡' : '已盖章尸体补派发'} → 派发 unit_die 强化触发（owner=${owner}）`);
                    markUnitDieDispatched(unit); // [2026-10-05 · 20261005-12] 记账：这次死亡的 unit_die 已派发
                    // （`changed` 已在派发**之前**置位 —— 见上方 :2251 的注释；这里不再重复置位）
                }
            }

            // [2026-10-05 莉莉子 BUG修复 · 20261005-12] `fresh` 才走"死亡广播 + 开票"：
            //   补派发的那批尸体**亡语早已结算过**，再 emit 一次 UNIT_DIE 会唤醒监听者**再开一张死亡票**
            //   ⇒ 亡语又结算一遍（正是今天刚修掉的病）✗ ⇒ 它们的这一趟**只派发强化，不碰事件与票**。
            if (fresh) {
                console.log(`[NecroDebug] judgeLifeAndDeath 推送 UNIT_DIED: ${unit.name}(${unit.key}) id=${unit.id} owner=${owner} 来源=${unit.animState === 'ephemeral_dying' ? '幻象死亡' : '血量归零'}`);
                eventBus.emit(GameEvents.UNIT_DIE, unit);
                // [2026-09-19 莉莉子 BUG修复] 去重：上面那次 emit 会唤醒 handleUnitDeath，它会为同一张卡再开一张票
                //   （本段是「先 emit 再 push」，故监听器的票永远先落袋）。同一次死亡只能结算一遍亡语 ——
                //   否则信标连炸两次、第二遍把玩家方也炸了。
                //   ⚠️ 已开过票时不 push 新票，而是【就地覆写】：本函数是在即将提交的
                //      newPlayerBench/newEnemyBench/newCombatField 上当场判决的，归属口径最准；
                //      监听器那份读的是 stateRef 快照，可能滞后。让权威的一票生效。
                const dupIdx = pendingActionsRef.current.findIndex(
                    a => a.type === 'UNIT_DIED' && a.payload?.unit?.id === unit.id
                );
                if (dupIdx >= 0) {
                    console.log(`[NecroDebug] ${unit.name}(${unit.key}) id=${unit.id} 已有死亡票，覆写归属为 ${owner}（不重复开票）`);
                    pendingActionsRef.current[dupIdx] = { type: 'UNIT_DIED', payload: { unit, bench: owner } };
                } else {
                    pendingActionsRef.current.push({ type: 'UNIT_DIED', payload: { unit, bench: owner } });
                }
            }
        });

        if (changed) {
            setPlayerBench(newPlayerBench as CardData[]);
            setEnemyBench(newEnemyBench as CardData[]);
            setCombatField(newCombatField as any);
        }
    };

    // ==========================================
    // [新增] 微队列清算中心 (Micro-Queue Flusher)
    // 由主循环主动调用，读取 pendingActionsRef，并基于当前快照进行绝对同步的状态结算
    // ==========================================
    const flushMicroQueue = () => {
        if (pendingActionsRef.current.length === 0) return false;

        const actions = [...pendingActionsRef.current];
        pendingActionsRef.current = []; // 取出后立刻清空缓冲区

        let hasLeveledUp = false;
        let leveledHeroes: CardData[] = [];

        // [核心修复] 补齐全部战区快照，夺取手牌发放权
        let nextPlayerBench = [...stateRef.current.playerBench];
        let nextEnemyBench = [...stateRef.current.enemyBench];
        let nextCombatField = [...stateRef.current.combatField];
        let nextGame = { ...stateRef.current.game };
        let nextPlayerHand = [...stateRef.current.playerHand];
        let nextEnemyHand = [...stateRef.current.enemyHand];
        let nextPlayerDeck = stateRef.current.playerDeck ? [...stateRef.current.playerDeck] : undefined;
        let nextEnemyDeck = stateRef.current.enemyDeck ? [...stateRef.current.enemyDeck] : undefined;

        // [2026-10-05 莉莉子 BUG修复 · 20261005-12 · 第二轮审查] 克隆卡时必须把「unit_die 已派发」账本一起搬
        //   （账本按对象身份记 ⇒ 任何 `{ ...c }` 都会让标记丢失 ⇒ 同一次死亡被再派发一次）
        const cloneWithLedger = (src: CardData, next: CardData): CardData => {
            if (hasUnitDieDispatched(src)) markUnitDieDispatched(next);
            return next;
        };

        const updateCardProgress = (c: CardData) => {
            if (c.key === 'pupu_specular_soul' && c.level === 1) {
                const newProgress = (c.customProgress || 0) + 1;
                const updatedCard = cloneWithLedger(c, { ...c, customProgress: newProgress });

                if (checkCardLevelUp(updatedCard, nextGame.playerNexus, nextGame.enemyNexus)) {
                    hasLeveledUp = true;
                    const leveled = cloneWithLedger(updatedCard, { ...getLeveledUpCard(updatedCard), id: updatedCard.id });
                    // [核心] 阵亡隔离锁：死者严禁入队升级！
                    // [2026-10-10 莉莉子 BUG修复] 判据同「全场升级扫描」那处，改用统一出口 `isStrikeTargetAlive`：
                    //   法术路径（单挑 / 王见王 / 剧毒 / 献祭）打死人**只累加 `damageTaken`**、
                    //   `animState` 只写 `'hit'` ⇒ 只看 animState 在这条路上同样拦不住。
                    //   **判 Lv1 的 `updatedCard`、不判 `leveled`**：`getLeveledUpCard` 会给里芙 +1 生命，
                    //   拿升级后的卡判血量会把"刚好被打满"的尸体算成存活。
                    if (isStrikeTargetAlive(updatedCard)) {
                        leveledHeroes.push(leveled);
                    }
                    return leveled;
                }
                return updatedCard;
            }
            // 2. [新增] 伊莉斯的记账逻辑：只要目睹打击，充能直接设为 1 (最大 1 层)
            if (c.key === 'Chongye_Squad_Elice') { // 请确保 key 与 cards.ts 中伊莉斯的 key 一致
                return cloneWithLedger(c, { ...c, customProgress: 1 });
            }
            return c;
        };

        // ==========================================
        // [2026-10-06 莉莉子 BUG修复 · 审计 P0] 强化触发的**结果回收器**
        // ── 病根：`on_nexus_strike` 站点只调 `runRogueTrigger`、**从不回收结果**（全站无 dirty 提交）⇒
        //    ① `ctx.game` 是快照副本，写入全丢 ⇒ 卜卜⑥「镜阵回响」记账的 `questProgress` 永远落不了地
        //       （`rogueTrigger.ts:793-795` 写、`:799` 的 `times <= 0` 直接 return）⇒ **整条传说节点从不兑现**。
        //    ② 牌库同理且更隐蔽：本函数尾部（setPlayerBench/…/setEnemyHand）里**没有** setPlayerDeck
        //       ⇒ 牌库灌注的 +1/+1 白写（同 2026-09-19 茉莉安那次"牌库副本写完就丢"的教训）。
        // ── 为什么**不**用 `commitDirtyGame`：它内部 `setGame(…)` 会被本函数尾部的
        //    `setGame(nextGame)`（值式写）**后写覆盖**。故这里只把差异并进工作对象 `nextGame`，
        //    由尾部**单点提交**（唯一出口）。
        // ── `questProgress` 单独处理：它是**多站点共写的记录表**（同一批里 advanceEnhQuests /
        //    runGearQuestStep 也会写它）⇒ 按键做**三方合并**（只采纳 ctx 真正改过的键），
        //    既不吞掉别人的进度、也不被别人的新值盖掉。
        // ==========================================
        // [2026-10-06 · 三轮审查 Q2] 把"id 级 diff"折叠成**本批新基线**（同 id 换对象 / 新增 / 移除；
        //   顺序 = 基线顺序 + 新增追加）。与 `commitSlicePatch`（rogueTrigger.ts:107）同一套 diff 语义，
        //   区别只是这里要"算出来的数组"、而不是发 setState。
        const foldSliceDiff = (seed: CardData[], result: CardData[]): CardData[] => {
            const byId = new Map(result.map(c => [c.id, c] as const));
            const seedIds = new Set(seed.map(c => c.id));
            const out: CardData[] = [];
            for (const c of seed) {
                const r = byId.get(c.id);
                if (r) out.push(r); // 同 id ⇒ 采纳新对象（未变则同一个对象）
            }
            for (const c of result) if (!seedIds.has(c.id)) out.push(c); // 新增
            return out;
        };

        const absorbRogueCtx = (ctx: RogueTriggerCtx, seed: GameState, deckSeed?: { player?: CardData[]; enemy?: CardData[] }) => {
            // ① bench / field / hand：handler 是**原地写**（`updateUnitById` rogueTrigger.ts:137-161、`hand.push`），
            //    且这三项在 ctx 里是 nextXxx 的**直接引用** ⇒ 通常无需搬运；
            //    仍做一次引用回写，兜住"整体替换数组"型的 handler。
            if (ctx.dirty.bench.has('player')) nextPlayerBench = ctx.playerBench;
            if (ctx.dirty.bench.has('enemy')) nextEnemyBench = ctx.enemyBench;
            if (ctx.dirty.field) nextCombatField = ctx.combatField;
            if (ctx.dirty.hand.has('player')) nextPlayerHand = ctx.playerHand;
            if (ctx.dirty.hand.has('enemy')) nextEnemyHand = ctx.enemyHand;

            // ② game：差异合并进 nextGame（尾部 setGame(nextGame) 统一提交）
            if (ctx.dirty.game) {
                const mutable = nextGame as unknown as Record<string, unknown>;
                for (const k of Object.keys(ctx.game) as (keyof GameState)[]) {
                    if (ctx.game[k] === seed[k]) continue; // 这条键 handler 没改
                    if (k === 'questProgress') {
                        // 🔴 [2026-10-06 · 独立审查 Q1 反例] 必须做**增量累加**，不能"绝对值覆盖"：
                        //   同一批里同侧水晶可能受击 **≥2 次**（多个 NEXUS_STRIKED action），
                        //   而每个 ctx 的差分基都是**本批入队前的**快照 ⇒ 绝对值写法会让后一次
                        //   把前一次的结果盖掉（卜卜⑥ 的记账会变成 old+1 而不是 old+N）。
                        const seedQ = (seed.questProgress ?? {}) as Record<string, number>;
                        const ctxQ = (ctx.game.questProgress ?? {}) as Record<string, number>;
                        const merged: Record<string, number> = { ...(nextGame.questProgress ?? {}) };
                        for (const qk of Object.keys(ctxQ)) {
                            const delta = (ctxQ[qk] ?? 0) - (seedQ[qk] ?? 0);
                            if (delta !== 0) merged[qk] = (merged[qk] ?? 0) + delta;
                        }
                        mutable.questProgress = merged;
                    } else if (nextGame[k] === seed[k]) {
                        mutable[k as string] = ctx.game[k]; // 本批没人动过 → 采纳
                    } else {
                        console.log(`[RogueCtx] 站点结果回收：跳过 ${String(k)}（本批已有更新的写入，不覆盖）`);
                    }
                }
            }

            // ③ 牌库：尾部清单**没有** setPlayerDeck / setEnemyDeckState ⇒ 必须在**这里**提交。
            //    🔴 [2026-10-06 · 独立审查 Q2 反例] 用仓库既有的 **id 级 diff 补丁** `commitSlicePatch`：
            //       它只贴**真的被动过的卡**（同 id 换对象 / 新增 / 移除），并发改动全部保留。
            //       ⚠️ 我第一版用"整份 ctx 数组建 Map 覆盖"是错的 —— 那会把**本 ctx 没改过**的卡
            //          也换成陈旧副本（弱于既有路径）；而且它连"增卡/删卡"都表达不了。
            //       ⚠️ 种子（deckSeed）必须是**改动前**的数组 ⇒ 站点构造 ctx 时传的是**副本**，
            //          否则写手原地改数组会把种子一起改掉，diff 恒为空、等于没提交。
            //    🔴 [三轮审查 Q2/Q1-b 反例] patch 之后**必须把结果折回基线**（`foldSliceDiff`）：
            //       否则同一批里第二笔同侧水晶受击仍以"入队前"为基 ⇒ 算出与第一笔**等值**的补丁
            //       ⇒ 覆盖式丢更新（牌库顶只 +1/+1，而按"每次受击 +1/+1"应为 +2/+2）。
            //       我上一版注释写的"同批后续 diff 会自然为空、幂等"是**错的**，已删。
            //    ⚠️ 残留（已记档 · 未扩大）：本批里其它**值式**写牌库的站点（如信标结算）若在本站点
            //       之后才提交，仍会用它的陈旧数组整体覆盖本补丁 —— 既有裂缝，与本改动无关。
            if (ctx.dirty.deck.has('player') && deckSeed?.player) {
                commitSlicePatch(deckSeed.player, ctx.playerDeck, fn => setPlayerDeck(fn));
                const folded = foldSliceDiff(deckSeed.player, ctx.playerDeck);
                nextPlayerDeck = folded;
                stateRef.current.playerDeck = folded;
            }
            if (ctx.dirty.deck.has('enemy') && deckSeed?.enemy) {
                commitSlicePatch(deckSeed.enemy, ctx.enemyDeck, fn => setEnemyDeckState(fn));
                const folded = foldSliceDiff(deckSeed.enemy, ctx.enemyDeck);
                nextEnemyDeck = folded;
                stateRef.current.enemyDeck = folded;
            }
        };

        // 按顺序结算所有条子
        actions.forEach(action => {
            if (action.type === 'NEXUS_STRIKED') {
                const struckSide = action.payload.target; // 'player' | 'enemy'（被击方）
                // 目睹/卜卜：水晶被打时，进攻方一侧在场的 Lv1 卜卜 +1 目睹（=本方向敌方水晶进攻命中）。
                // [2026-09-09 莉莉子 修复] 补对称敌方路径——此前只在敌方水晶被打(struckSide='enemy')时
                // 给玩家侧卜卜 +1，敌方卜卜在本局永远攒不到目睹次数，只能靠交战区连带升级（已在
                // levelUpCard effect 修复堵住），导致卜卜镜像流派里敌方卜卜升级行为错乱。
                if (struckSide === 'enemy') {
                    nextPlayerBench = nextPlayerBench.map(updateCardProgress);
                    nextCombatField = nextCombatField.map(fight => {
                        const newFight = { ...fight };
                        if (newFight.owner === 'player' && newFight.attacker) {
                            newFight.attacker = updateCardProgress(newFight.attacker) as CardData;
                        }
                        if (newFight.owner === 'enemy' && newFight.blocker) {
                            newFight.blocker = updateCardProgress(newFight.blocker) as CardData;
                        }
                        return newFight;
                    });
                }
                if (struckSide === 'player') {
                    nextEnemyBench = nextEnemyBench.map(updateCardProgress);
                    nextCombatField = nextCombatField.map(fight => {
                        const newFight = { ...fight };
                        if (newFight.owner === 'enemy' && newFight.attacker) {
                            newFight.attacker = updateCardProgress(newFight.attacker) as CardData;
                        }
                        if (newFight.owner === 'player' && newFight.blocker) {
                            newFight.blocker = updateCardProgress(newFight.blocker) as CardData;
                        }
                        return newFight;
                    });
                }
                // ── [2026-09-25 莉莉子 任务化框架 · 强化线] 我方水晶受伤 → 推进「水晶受伤」类强化任务进度 ──
                //   例：铁誓（本场累计受伤 3 次）→ 达成后由 rogueTrigger 的解锁门放行其 battleEffect
                if (struckSide === 'player') {
                    nextGame.questProgress = advanceEnhQuests(nextGame.questProgress, nextGame.rogueEnhancements, 'nexus_damaged');
                }
                // ── [2026-09-25 莉莉子 任务化框架 · 装备线] 我方水晶受伤 → 推进装备线同事件（按【伤害量】累计）──
                //   ⚠️ 本 action 在批次末尾用 setGame(nextGame) 整体提交，故**不能**调用 runGearQuest
                //      （它内部的 setGame 会被末尾的直接值覆盖掉）→ 必须就地写进三份工作快照。
                if (struckSide === 'player') {
                    // [2026-10-06 程拍板 · 审计收口] **全域参与** —— 进度是"我方水晶累计受伤"这种
                    //   **对局级全局事实**，不该只看备战席/交战区：卡在**手牌/牌库**时同样要累加、
                    //   同样要吃奖励（否则「血债账簿：此卡费用降为 0」会在卡已上场、费用已付之后才生效＝毫无意义）。
                    const gCards = [
                        ...nextPlayerBench,
                        ...nextPlayerHand,
                        ...(nextPlayerDeck ?? []),
                        ...nextCombatField.flatMap(f => (f.owner === 'player' ? [f.attacker, f.blocker] : [])),
                    ].filter(Boolean) as CardData[];
                    const nexusMax = stateRef.current.game.playerNexusMax ?? 20;
                    // 水晶余量取两份快照的较小值：本批是否已扣血取决于 action 先后，取小即可覆盖两种时序
                    const nexusNow = Math.min(stateRef.current.game.playerNexus ?? nexusMax, nextGame.playerNexus ?? nexusMax);
                    const gStep = runGearQuestStep(nextGame.questProgress, gCards, 'nexus_damaged', {
                        amount: action.payload.amount ?? 1,
                        when: { nexusPct: nexusMax > 0 ? (nexusNow / nexusMax) * 100 : 100 },
                    });
                    if (gStep.changed) {
                        nextGame = { ...nextGame, questProgress: gStep.progress };
                        if (gStep.hits.length) {
                            const gById = new Map(gStep.hits.map(h => [h.cardId, h.reward]));
                            const gApply = (c: CardData) => { const r = gById.get(c.id); return r ? applyGearQuestReward(c, r) : c; };
                            nextPlayerBench = nextPlayerBench.map(gApply);
                            nextPlayerHand = nextPlayerHand.map(gApply);
                            nextCombatField = nextCombatField.map(f => {
                                let n = f;
                                if (n.attacker) { const a = gApply(n.attacker); if (a !== n.attacker) n = { ...n, attacker: a }; }
                                if (n.blocker) { const b = gApply(n.blocker); if (b !== n.blocker) n = { ...n, blocker: b }; }
                                return n;
                            });
                            // 牌库那一份**必须就地提交**（本函数尾部清单里没有 setPlayerDeck）——
                            //   否则"以后抽到也是 0 费"落不了地。
                            if (nextPlayerDeck) {
                                nextPlayerDeck = nextPlayerDeck.map(gApply);
                                setPlayerDeck(nextPlayerDeck);
                                stateRef.current.playerDeck = nextPlayerDeck;
                            }
                        }
                    }
                }

                // ==========================================
                // [2026-08-19 莉莉子] 迷宫强化 on_nexus_strike：水晶受伤害
                // 玩家强化在「敌方水晶被打」触发（牌库灌注/水晶共鸣）；
                // [2026-08-27] 敌方强化在「我方水晶被打」触发（连击之势）
                // [2026-09-09 莉莉子 重构] 收编统一串行触发引擎：直接引用 nextXxx 工作数组（该 action 尾部统一提交）
                // ==========================================
                if (struckSide === 'enemy' && stateRef.current.game.rogueEnhancements) {
                    // [2026-10-06 莉莉子 BUG修复 · 审计 P0] 记下发车前的快照 —— 供 `absorbRogueCtx` 做**差异回收**
                    const nSeedP = stateRef.current.game;
                    // [审查 Q2] 牌库 diff 的**种子**必须是"改动前"的数组 ⇒ 下面给 ctx 传**副本**
                    const nSeedPD = nextPlayerDeck ?? [];
                    const nSeedED = stateRef.current.enemyDeck ?? [];
                    const nCtx: RogueTriggerCtx = {
                        game: { ...nSeedP },
                        playerBench: nextPlayerBench,
                        enemyBench: nextEnemyBench,
                        combatField: nextCombatField,
                        playerHand: [...stateRef.current.playerHand],
                        enemyHand: [...stateRef.current.enemyHand],
                        playerDeck: [...nSeedPD],
                        enemyDeck: [...nSeedED],
                        owner: 'player',
                        trigger: 'on_nexus_strike',
                        createFullCard,
                        info: {},
                        dirty: { bench: new Set<Side>(), hand: new Set<Side>(), deck: new Set<Side>(), field: false, game: false },
                    };
                    runRogueTrigger(nCtx, stateRef.current.game.rogueEnhancements, 'on_nexus_strike');
                    // [2026-10-06 BUG修复 · 审计 P0] **回收结果**（本站点此前从不回收 ⇒ 牌库灌注 / 卜卜⑥ 写完就丢）
                    absorbRogueCtx(nCtx, nSeedP, { player: nSeedPD, enemy: nSeedED });
                }
                // [2026-08-27] 敌方迷宫强化：我方水晶被打 → 随机敌方单位 +1/+1（连击之势）
                if (struckSide === 'player' && stateRef.current.game.enemyEnhancements) {
                    // [2026-10-06 莉莉子 BUG修复 · 审计 P0] 同上：快照 + 结果回收
                    const nSeedE = stateRef.current.game;
                    // [审查 Q2] 同上：种子取改动前的数组，ctx 拿副本
                    const nSeedPD2 = stateRef.current.playerDeck ?? [];
                    const nSeedED2 = stateRef.current.enemyDeck ?? [];
                    const nCtx: RogueTriggerCtx = {
                        game: { ...nSeedE },
                        playerBench: nextPlayerBench,
                        enemyBench: nextEnemyBench,
                        combatField: nextCombatField,
                        playerHand: [...stateRef.current.playerHand],
                        enemyHand: [...stateRef.current.enemyHand],
                        playerDeck: [...nSeedPD2],
                        enemyDeck: [...nSeedED2],
                        owner: 'enemy',
                        trigger: 'on_nexus_strike',
                        createFullCard,
                        info: {},
                        dirty: { bench: new Set<Side>(), hand: new Set<Side>(), deck: new Set<Side>(), field: false, game: false },
                    };
                    runRogueTrigger(nCtx, stateRef.current.game.enemyEnhancements, 'on_nexus_strike');
                    absorbRogueCtx(nCtx, nSeedE, { player: nSeedPD2, enemy: nSeedED2 });
                }
            }
            // =====================================
            // [新增] 结算单位受伤被动 (如：臆莲基座产无人机)
            // =====================================
            else if (action.type === 'UNIT_DAMAGED') {
                const targetId = action.payload.id;

                // 全场雷达：找出那个受伤的倒霉蛋
                let damagedUnit = nextPlayerBench.find(c => c.id === targetId) || nextEnemyBench.find(c => c.id === targetId);
                if (!damagedUnit) {
                    const fight = nextCombatField.find(f => f.attacker?.id === targetId || f.blocker?.id === targetId);
                    if (fight) damagedUnit = fight.attacker?.id === targetId ? fight.attacker : (fight.blocker ?? undefined);
                }

                // 🕵️ [探针 1] 追踪微队列是否正确接收到事件并找到了单位
                console.log('[MicroQueue] UNIT_DAMAGED received', {
                    targetId,
                    foundUnit: !!damagedUnit,
                    unitName: damagedUnit?.name,
                    unitKey: damagedUnit?.key,
                    effects: damagedUnit?.effects,
                    damageTaken: damagedUnit?.damageTaken,
                    benchCount: nextPlayerBench.length,
                    combatFieldCount: nextCombatField.length
                });

                if (damagedUnit && damagedUnit.effects) {
                    damagedUnit.effects.forEach((effId: string) => {
                        const def = EFFECT_DB[effId];

                        // 🕵️ [探针 2] 追踪基因库查表与前置条件检索状态
                        console.log('[MicroQueue] Checking effect', {
                            effId,
                            defFound: !!def,
                            onDamagedGenerate: def?.params?.onDamagedGenerate
                        });

                        // ⭐ [2026-07-16 达努·班西] ON_DAMAGE_SURVIVE — 受伤存活触发
                        if (def && def.timing === 'ON_DAMAGE_SURVIVE') {
                            const currentHp = (damagedUnit.health + (damagedUnit.buffs?.health || 0) + (damagedUnit.roundBuffs?.health || 0) - (damagedUnit.damageTaken || 0)); // [2026-07-31] 补上本回合临时血
                            console.log(`[MicroQueue:OnDamageSurvive] ${damagedUnit.name} 检出 ON_DAMAGE_SURVIVE，HP=${currentHp}，damageTaken=${damagedUnit.damageTaken}，effects=${damagedUnit.effects?.join(',')}`);
                            if (currentHp > 0) {
                                const isPUnit = nextPlayerBench.some(c => c.id === targetId) ||
                                    nextCombatField.some(f => (f.owner === 'player' && f.attacker?.id === targetId) || (f.owner === 'enemy' && f.blocker?.id === targetId));

                                const survivorCtx: EffectContext = {
                                    game: nextGame, playerBench: nextPlayerBench, enemyBench: nextEnemyBench,
                                    playerHand: nextPlayerHand, enemyHand: nextEnemyHand,
                                    playerDeck: nextPlayerDeck, enemyDeck: nextEnemyDeck,
                                    combatField: nextCombatField,
                                    owner: isPUnit ? 'player' : 'enemy',
                                    sourceCard: damagedUnit
                                };

                                const res = processEffect(effId, [damagedUnit], survivorCtx);
                                if (res.game) nextGame = res.game;
                                if (res.playerBench) nextPlayerBench = res.playerBench;
                                if (res.enemyBench) nextEnemyBench = res.enemyBench;
                                if (res.playerHand) nextPlayerHand = res.playerHand;
                                if (res.enemyHand) nextEnemyHand = res.enemyHand;
                                // [2026-10-06 莉莉子 · 既有裂缝④收口] 本站点此前把牌库结果**只写局部变量**，
                                //   而本函数（flushMicroQueue）的尾部提交清单里**没有** setPlayerDeck/setEnemyDeckState
                                //   ⇒ `processEffect` 产出的牌库改动**写完就丢**（与 P0 那两条同一个病）。
                                //   这里按同族兄弟站点（亡语 / 信标）的写法就地提交，并同步 stateRef。
                                if (res.playerDeck) { nextPlayerDeck = res.playerDeck; setPlayerDeck(res.playerDeck); stateRef.current.playerDeck = res.playerDeck; }
                                if (res.enemyDeck) { nextEnemyDeck = res.enemyDeck; setEnemyDeckState(res.enemyDeck); stateRef.current.enemyDeck = res.enemyDeck; }
                                if (res.combatField) nextCombatField = res.combatField;

                                console.log(`[MicroQueue] ${damagedUnit.name} 受伤存活，触发 ON_DAMAGE_SURVIVE 效果: ${def.name}`);
                            }
                        }

                        // 查表：如果这家伙带有”受伤发牌”的基因
                        if (def && def.params?.onDamagedGenerate) {
                            const reqKeys = def.params.presenceRequirement || [];

                            // 判断受伤单位的阵营，以此决定手牌和扫描归属
                            const isPlayerUnit = nextPlayerBench.some(c => c.id === targetId) ||
                                nextCombatField.some(f => (f.owner === 'player' && f.attacker.id === targetId) || (f.owner === 'enemy' && f.blocker?.id === targetId));

                            const benchToCheck = isPlayerUnit ? nextPlayerBench : nextEnemyBench;

                            // 检查前置条件（例如：我方阵营的猫汐尔是否在场）
                            const hasPresence = reqKeys.length === 0 ||
                                benchToCheck.some(c => reqKeys.some(req => c.key.includes(req))) ||
                                nextCombatField.some(f => {
                                    const u = f.owner === (isPlayerUnit ? 'player' : 'enemy') ? f.attacker : f.blocker;
                                    return u && reqKeys.some(req => u.key.includes(req));
                                });

                            if (hasPresence) {
                                // 满足条件！开动印钞机
                                const generatedCard = createFullCard(def.params.onDamagedGenerate!);
                                if (isPlayerUnit && nextPlayerHand.length < 10) {
                                    nextPlayerHand.push(generatedCard);
                                    console.log(`[MicroQueue] ${damagedUnit!.name} 受伤，生成 ${generatedCard.name} 到手牌！`);
                                } else if (!isPlayerUnit && nextEnemyHand.length < 10) {
                                    nextEnemyHand.push(generatedCard);
                                }
                            }
                        }
                    });
                }

                // ⭐ [2026-07-16 达努·温蒂] ON_FRIENDLY_DAMAGED — 友方受伤光环触发
                if (damagedUnit) {
                    const isPlayerUnit = nextPlayerBench.some(c => c.id === targetId) ||
                        nextCombatField.some(f => (f.owner === 'player' && f.attacker?.id === targetId) || (f.owner === 'enemy' && f.blocker?.id === targetId));
                    const friendlyBench = isPlayerUnit ? nextPlayerBench : nextEnemyBench;
                    const friendlySide = isPlayerUnit ? 'player' : 'enemy';

                    // 扫描该方所有在场单位的效果
                    const allFriendlyUnits = [...friendlyBench];
                    nextCombatField.forEach(fight => {
                        if (fight.attacker && fight.owner === friendlySide) allFriendlyUnits.push(fight.attacker);
                        if (fight.blocker && fight.owner !== friendlySide) allFriendlyUnits.push(fight.blocker);
                    });

                    allFriendlyUnits.forEach(unit => {
                        if (!unit.effects) return;
                        unit.effects.forEach(effId => {
                            const def = EFFECT_DB[effId];
                            if (def && def.timing === 'ON_FRIENDLY_DAMAGED') {
                                const auraCtx: EffectContext = {
                                    game: nextGame, playerBench: nextPlayerBench, enemyBench: nextEnemyBench,
                                    playerHand: nextPlayerHand, enemyHand: nextEnemyHand,
                                    playerDeck: nextPlayerDeck, enemyDeck: nextEnemyDeck,
                                    combatField: nextCombatField,
                                    owner: friendlySide,
                                    sourceCard: unit
                                };
                                const res = processEffect(effId, [damagedUnit], auraCtx);
                                if (res.playerBench) nextPlayerBench = res.playerBench;
                                if (res.enemyBench) nextEnemyBench = res.enemyBench;
                                if (res.combatField) nextCombatField = res.combatField;

                                console.log(`[MicroQueue] ${unit.name} 的 ON_FRIENDLY_DAMAGED 光环触发，为 ${damagedUnit.name} 添加 buff`);
                            }
                        });
                    });
                }
            }
            // =====================================
            // [新增] 亡语清算中心 (The Necromancer Engine)
            // =====================================
            else if (action.type === 'UNIT_DIED') {
                const { unit, bench: owner } = action.payload as { unit: CardData, bench: 'player' | 'enemy' };

                // [NecroDebug] 追踪亡语触发次数
                console.log(`[NecroDebug] UNIT_DIED 处理: ${unit.name}(${unit.key}), owner=${owner}, unit.id=${unit.id}, effects=`, unit.effects);

                // [2026-07-20 替换打出] 消亡不触发亡语、不计阵亡计数、不入墓地
                if (unit.deathType === 'ELIMINATED') {
                    console.log(`[ReplacePlay] ${unit.name} 为「消亡」，跳过亡语与计数`);
                    return; // 在 forEach 中等价于 continue
                }

                // =====================================
                // [2026-09-19 莉莉子 BUG修复] 引爆幂等钉 —— 钉在「真正引爆」这一处
                // ── 为什么必须钉在这里：信标死亡票有 4 个开票口（微队列正常流程 / 生死判决 /
                //    死亡广播监听 / 对账器补票）× 任意批次，此前的去重全建立在**可被覆盖的判据**上：
                //      同批次 → hasDeathTicket 查队列
                //      跨批次 → 查墓地（票处理器写墓地）
                //    而"后写覆盖先写"这条老病能把墓地判据一起抹掉 → 判据失效 → 补出第二张票 → 二次引爆。
                //    钉在引爆动作上，则**任何来源的重复票都变得无害**（不重复引爆、也不重复计数入墓）。
                // ── 只作用于信标：其他卡的复活可能复用 id，全局幂等会有副作用，暂不开放。
                // =====================================
                if (unit.key === 'Marian_Wolf_Tooth_Beacon') {
                    if (beaconExplodedRef.current.has(unit.id)) {
                        console.log(`[BeaconDebug] 信标(id=${unit.id}) 亡语已结算过 → 跳过重复票，杜绝二次引爆`);
                        return;
                    }
                    beaconExplodedRef.current.add(unit.id);
                }

                // [2026-07-14 梵音] 单位阵亡计数器（用于莎罗的入场BUFF，双方各计各的）
                // [2026-08-06 莉莉子] 同步写入墓地（死亡单位快照，供法术2「瓦尔哈拉的呼唤」复活）
                // 注意：ELIMINATED 消亡替换已在上方 return 跳过；爆牌销毁不走 UNIT_DIED 流程 → 两者天然不计入墓地
                const makeGraveSnapshot = (u: CardData): CardData =>
                    ({ ...u, buffs: { power: u.buffs?.power || 0, health: u.buffs?.health || 0 } } as CardData);
                if (owner === 'player') {
                    nextGame.friendlyUnitDeaths = (nextGame.friendlyUnitDeaths || 0) + 1;
                    nextGame.playerGraveyard = [...(nextGame.playerGraveyard || []), makeGraveSnapshot(unit)];
                } else {
                    nextGame.enemyUnitDeaths = (nextGame.enemyUnitDeaths || 0) + 1;
                    nextGame.enemyGraveyard = [...(nextGame.enemyGraveyard || []), makeGraveSnapshot(unit)];
                }

                // =====================================
                // [2026-09-25 莉莉子 三线任务化框架 · 装备线] 遗嘱：阵亡时把身上其他装备转给随机存活友军
                //   ① 遗嘱自身不参与传递（否则链式无限传承）② attachEquipment 自带去重，友军已有的装备自然跳过
                // 🔴 [2026-10-06 莉莉子 · 审计收口] **本段从 `processDeaths` 搬到这里** ——
                //   原实现挂在"**备战席**死亡清算"上，而单位**进攻/格挡时已经离开备战席** ⇒
                //   **死在交战区就永远不触发**（那恰恰是最常见的死法，粉丝侧的观感就是"这装备没反应"）。
                //   而 `UNIT_DIED` 是**全项目唯一的死亡结算出口**（四条开票口都汇到这里）⇒
                //   搬来即备战席 + 交战区**两条路径全覆盖**，且天然幂等（一张票只结算一次）。
                //   ⚠️ 本函数全程操作工作数组、尾部统一提交 ⇒ 这里直接改 `nextPlayerBench`，不再调 setState。
                // =====================================
                if (owner === 'player' && (unit.equipment ?? []).some(id => getEquipmentById(id)?.onOwnerDie?.class === 'TRANSFER_EQUIPMENT')) {
                    const inherits = (unit.equipment ?? []).filter(id => getEquipmentById(id)?.onOwnerDie?.class !== 'TRANSFER_EQUIPMENT');
                    const heirs = nextPlayerBench.filter(c =>
                        c.id !== unit.id && c.animState !== 'dying' && c.animState !== 'ephemeral_dying' && getHealth(c) > 0
                    );
                    if (inherits.length > 0 && heirs.length > 0) {
                        const heir = heirs[Math.floor(Math.random() * heirs.length)];
                        let upgraded: CardData = { ...heir };
                        for (const id of inherits) upgraded = attachEquipment(upgraded, id);
                        nextPlayerBench = nextPlayerBench.map(c => c.id === heir.id ? upgraded : c);
                        console.log(`[Will] 遗嘱触发：${unit.name} 把 ${inherits.length} 件装备转给 ${heir.name}`);
                    }
                }

                // =====================================
                // [2026-09-16 1.0.16 茉莉安 · T07] 獠牙信标被破坏 → 累计茉莉安的升级进度
                // ── 归属推导：信标【只会被召唤到召唤者的对面】（库效/本体/支援技三者皆然），
                //    所以「它倒在哪一侧」就等价于「它由对面召唤」—— 这是构造性结论，不是猜测。
                // ── 与猫汐尔同构：扫描 bench / hand / deck 全域，所以【茉莉安不在场】也计入进度
                // ── 全程操作局部数组，由本函数末尾（2156~2160）统一写回 React state
                // =====================================
                if (unit.key === 'Marian_Wolf_Tooth_Beacon') {
                    // [2026-09-19 莉莉子 方向一] 有归属戳 → 查表；无戳才回落到「倒在敌方 → 由玩家召唤」的推论
                    const summonerIsPlayer = (unit.unitOwner ?? owner) === 'enemy'; // 倒在敌方 → 由玩家召唤
                    const summonerSide: 'player' | 'enemy' = summonerIsPlayer ? 'player' : 'enemy';

                    // =====================================
                    // [2026-10-02 莉莉子 C1 · 改为全局进度] 权威值单一自增 + 幂等贴到各区域
                    // ── 旧实现：**每个区域各自 +1**。而计数挂在茉莉安身上，她同一时刻只在一个区域
                    //    ⇒ 漏扫她当时所在区域 = 本次进度静默丢失（09-23 / 09-27 两次事故的本质）。
                    // ── 新实现：真源 = `game.beaconDeaths[召唤者侧]`（本次**唯一**一次自增），
                    //    再把那个**绝对值**贴到各区域副本上（同值重复贴不会累加）。
                    //    即使某区域漏扫，也只是短暂显示旧值，**绝不丢进度**。
                    // =====================================
                    const nextBeaconDeaths = (nextGame.beaconDeaths?.[summonerSide] ?? 0) + 1;
                    nextGame.beaconDeaths = { ...(nextGame.beaconDeaths || {}), [summonerSide]: nextBeaconDeaths };

                    // [2026-09-19 BUG修复] 牌库那份必须【就地提交】：
                    //   微队列的收尾提交清单（setPlayerBench/…/setEnemyHand）里**没有** setPlayerDeck，
                    //   只改局部 nextPlayerDeck 等于写完就丢 ⇒ 牌库面板/左侧进度弹窗永远显示 0。
                    if (summonerIsPlayer) {
                        nextPlayerBench = applyBeaconDeaths(nextPlayerBench, nextBeaconDeaths);
                        nextPlayerHand = applyBeaconDeaths(nextPlayerHand, nextBeaconDeaths);
                        if (nextPlayerDeck) {
                            nextPlayerDeck = applyBeaconDeaths(nextPlayerDeck, nextBeaconDeaths);
                            setPlayerDeck(nextPlayerDeck);
                            stateRef.current.playerDeck = nextPlayerDeck;
                        }
                    } else {
                        nextEnemyBench = applyBeaconDeaths(nextEnemyBench, nextBeaconDeaths);
                        nextEnemyHand = applyBeaconDeaths(nextEnemyHand, nextBeaconDeaths);
                        if (nextEnemyDeck) {
                            nextEnemyDeck = applyBeaconDeaths(nextEnemyDeck, nextBeaconDeaths);
                            setEnemyDeckState(nextEnemyDeck);
                            stateRef.current.enemyDeck = nextEnemyDeck;
                        }
                    }

                    // [2026-09-27 莉莉子 BUG修复] 交战区实例必须一并同步 ——
                    //   单位一宣告进攻，toggleAttacker 就把它**移出备战席**（只存在于 combatField）；
                    //   若她此刻正在交战区，bench/hand/deck 三处一份副本都没有 ⇒ 进度看起来没加。
                    //   归属口径：attacker 属 f.owner，blocker 属发起方的对面（与判死 / 亡语分摊同源）。
                    {
                        const syncField = (field: any[], side: 'player' | 'enemy') => field.map(f => {
                            const atkSide: 'player' | 'enemy' = f.owner;
                            const blkSide: 'player' | 'enemy' = f.owner === 'player' ? 'enemy' : 'player';
                            const nextA = (f.attacker && atkSide === side) ? applyBeaconDeaths([f.attacker], nextBeaconDeaths)[0] : f.attacker;
                            const nextB = (f.blocker && blkSide === side) ? applyBeaconDeaths([f.blocker], nextBeaconDeaths)[0] : f.blocker;
                            return (nextA === f.attacker && nextB === f.blocker) ? f : { ...f, attacker: nextA, blocker: nextB };
                        });
                        nextCombatField = syncField(nextCombatField, summonerSide);
                    }
                    console.log(`[BeaconDebug] 獠牙信标被破坏：召唤者=${summonerSide}，全局进度=${nextBeaconDeaths}`);
                }

                // =====================================
                // [2026-09-17 1.0.16 松露小队 · T23 园丁灌溉无人机]
                // 每回合【首次】暴露的敌人阵亡时 → 随机暴露另一个未暴露的敌人
                // ── 园丁是「我方」单位，它盯的是【敌方】单位 → 园丁在亡者的对面
                // ── 每回合只触发一次：记 round 号节流（truffleGardenerRound）
                // ── 候选只从【备战席】取：已被拉进交战区的单位本来就在挨打，再给它暴露没有意义
                // =====================================
                {
                    const gardenerOwner: 'player' | 'enemy' = owner === 'player' ? 'enemy' : 'player';
                    const gardenerBench = gardenerOwner === 'player' ? nextPlayerBench : nextEnemyBench;
                    const hasGardener = gardenerBench.some(c =>
                        c.key === 'Truffle_Drone_Gardener' && !c.isDead && c.animState !== 'dying'
                    );

                    if (hasGardener && (unit.keywords || []).includes('Exposed')) {
                        if (nextGame.truffleGardenerRound === nextGame.round) {
                            console.log(`[园丁] 本回合已触发过，跳过（round=${nextGame.round}）`);
                        } else {
                            const deadSideBench = owner === 'player' ? nextPlayerBench : nextEnemyBench;
                            const candidates = deadSideBench.filter(c =>
                                !c.isDead
                                && c.animState !== 'dying'
                                && c.animState !== 'ephemeral_dying'
                                && !(c.keywords || []).includes('Exposed')
                            );

                            if (candidates.length > 0) {
                                const pick = candidates[Math.floor(Math.random() * candidates.length)];
                                const expose = (c: CardData): CardData =>
                                    c.id === pick.id
                                        ? {
                                            ...c,
                                            keywords: Array.from(new Set([...c.keywords, 'Exposed' as Keyword])),
                                            animState: 'buff' as const,
                                        }
                                        : c;

                                if (owner === 'player') nextPlayerBench = nextPlayerBench.map(expose);
                                else nextEnemyBench = nextEnemyBench.map(expose);

                                nextGame.truffleGardenerRound = nextGame.round;
                                console.log(`[园丁] 暴露的敌人「${unit.name}」阵亡 → 随机暴露「${pick.name}」`);
                            } else {
                                console.log(`[园丁] 敌方备战席已无未暴露单位，暴露链中断`);
                            }
                        }
                    }
                }

                // =====================================
                // [2026-10-02 莉莉子 信标亡语化] 「信标重生光环」：只要茉莉安**活着在场**，
                //   敌方信标就带「重生亡语」——在**亡语派发这一刻动态判定**。
                //   🔑 [程当晚更正 · 光环下放到 Lv1] **不再要求 Lv2**，原因有二（缺一都会永久断档）：
                //     ① Lv1 若只在入场贴一次，补出来的新信标不带亡语 ⇒ 第 2 枚被打死后再无信标；
                //     ② **致死的那一击永远吃不到 Lv2 光环** —— 升级标记 markLeveledUp 写在死亡批次**末尾**，
                //        而本处亡语派发在同一批次**更早** ⇒ 那一击看到的仍是"她还没升级"。
                //     ⇒ 等级无关后，两条根因一并消失（程：「反正 LV1 击杀两个信标后就升级了，也没什么区别」）。
                //   · 与"给她贴一次就记住"相比，动态判定天然覆盖**任意时刻新召唤出来的信标** ⇒ 链不会断。
                //   · 补挂的两条效果顺序 = [召唤, 补刀]（见 BEACON_RESPAWN_EFFECTS），
                //     排在原本的「分摊爆炸」之后 ⇒ 先爆炸、再补新信标、再补刀。
                // =====================================
                let lastBreathEffects: string[] = unit.effects || [];
                if (unit.key === 'Marian_Wolf_Tooth_Beacon') {
                    const beaconSummonerSide: 'player' | 'enemy' = (unit.unitOwner ?? owner) === 'enemy' ? 'player' : 'enemy';
                    if (hasLiveMarian(beaconSummonerSide, nextPlayerBench, nextEnemyBench, nextCombatField)) {
                        const granted = grantBeaconRespawnEffect({ ...unit, effects: lastBreathEffects } as CardData);
                        lastBreathEffects = granted.effects || lastBreathEffects;
                        console.log('[信标亡语化] 重生光环生效 → 本枚信标按「重生亡语」结算');
                    } else {
                        console.log('[信标亡语化] 召唤者侧没有存活茉莉安 → 本枚信标不重生（她下次入场会再埋一枚）');
                    }
                }

                if (lastBreathEffects.length > 0) {
                    lastBreathEffects.forEach(effId => {
                        const def = EFFECT_DB[effId];
                        // 从字典中核实该效果的 timing 是否为亡语
                        if (def && def.timing.includes('LAST_BREATH')) {
                            console.log(`[Necromancer] ${unit.name} 的亡语被触发！效果 ID: ${effId}`);

                            const ctx: EffectContext = {
                                game: nextGame,
                                playerBench: nextPlayerBench,
                                enemyBench: nextEnemyBench,
                                playerHand: nextPlayerHand,
                                enemyHand: nextEnemyHand,
                                playerDeck: stateRef.current.playerDeck, // 传引用
                                enemyDeck: stateRef.current.enemyDeck,   // 传引用
                                combatField: nextCombatField,
                                owner: owner, // 以亡者阵营的身份执行！
                                sourceCard: unit // 【关键】即使是一具尸体，它依然可以作为施法源头！
                            };

                            // 把亡者的遗愿无脑扔给中央处理器去办！
                            const res = processEffect(effId, [], ctx);

                            // 接收工厂的最新加工件
                            nextGame = res.game;
                            nextPlayerBench = res.playerBench;
                            nextEnemyBench = res.enemyBench;
                            nextPlayerHand = res.playerHand;
                            nextEnemyHand = res.enemyHand;
                            if (res.combatField) nextCombatField = res.combatField as any[];
                            if (res.playerDeck && owner === 'player') { setPlayerDeck(res.playerDeck); stateRef.current.playerDeck = res.playerDeck; }
                            if (res.enemyDeck && owner === 'enemy') { setEnemyDeckState(res.enemyDeck); stateRef.current.enemyDeck = res.enemyDeck; }

                            // [2026-07-09 新增] 亡语抽卡/生成动画事件（每张间隔 1.2s）
                            let necroAnimIdx = 0;
                            relayEffectEvents(res.events); // [2026-09-19] 转发伤害事件（飘字 + 受击音都靠它）
                            res.events.forEach(evt => {
                                if (evt.type === 'sfx_draw') {
                                    const drawnCard = evt.payload as CardData;
                                    const animId = nextAnimId('necromancer-draw', drawnCard.id);
                                    setTimeout(() => {
                                        eventBus.emit(GameEvents.DRAW_START, {
                                            animId, card: drawnCard, owner,
                                            skipHandAdd: true,
                                        });
                                    }, necroAnimIdx * 1200);
                                    necroAnimIdx++;
                                }
                                if (evt.type === 'sfx_generate') {
                                    const genCard = evt.payload as CardData;
                                    // 从 React state 移除（批处理中后执行的是循环外的 setPlayerHand(nextPlayerHand)）
                                    if (owner === 'player') setPlayerHand(prev => prev.filter(c => c.id !== genCard.id));
                                    else setEnemyHand(prev => prev.filter(c => c.id !== genCard.id));
                                    // 【关键】同时也从 nextPlayerHand 移除，否则循环外 setPlayerHand(nextPlayerHand) 会把它加回来
                                    if (owner === 'player') nextPlayerHand = nextPlayerHand.filter(c => c.id !== genCard.id);
                                    else nextEnemyHand = nextEnemyHand.filter(c => c.id !== genCard.id);
                                    const animId = nextAnimId('necro-gen', genCard.id);
                                    const delay = necroAnimIdx * 1200;
                                    necroAnimIdx++;
                                    setTimeout(() => {
                                        eventBus.emit(GameEvents.DRAW_START, {
                                            animId, card: genCard, owner,
                                            skipHandAdd: false, // 由动画把卡加回来，实现完整飞入效果
                                            skipDeckAnim: true,
                                        });
                                    }, delay);
                                }
                            });
                        }

                        // [丁型] 亡语：对敌方所有单位与水晶造成 2 点伤害
                        if (unit.key === 'titan_type_d_mutant') {
                            const enemyPlayer = owner === 'player' ? 'enemy' : 'player';
                            const enemyBench = enemyPlayer === 'player' ? nextPlayerBench : nextEnemyBench;

                            // 伤害敌方备战席
                            for (let i = 0; i < enemyBench.length; i++) {
                                enemyBench[i] = { ...enemyBench[i], damageTaken: (enemyBench[i].damageTaken || 0) + 2 };
                            }

                            // 伤害敌方交战区单位
                            if (nextCombatField) {
                                nextCombatField = nextCombatField.map(f => {
                                    const enemyUnit = f.owner !== owner ? f.attacker : f.blocker;
                                    if (!enemyUnit) return f;
                                    return {
                                        ...f,
                                        [f.owner !== owner ? 'attacker' : 'blocker']: {
                                            ...enemyUnit,
                                            damageTaken: (enemyUnit.damageTaken || 0) + 2,
                                        },
                                    };
                                });
                            }

                            // 伤害敌方水晶
                            // [2026-10-06 莉莉子 · 审计收口] 补查**水晶免疫**（不死之身）—— 本处此前是 7 处漏点之一
                            if (isNexusImmune(nextGame, enemyPlayer)) {
                                console.log(`[丁型] 泰坦物质爆炸：${enemyPlayer} 水晶免疫伤害，跳过 2 点扣除`);
                            } else if (enemyPlayer === 'player') {
                                nextGame.playerNexus = Math.max(0, (nextGame.playerNexus || 20) - 2);
                            } else {
                                nextGame.enemyNexus = Math.max(0, (nextGame.enemyNexus || 20) - 2);
                            }

                            // [2026-10-06 程拍板 · 审计收口] 免疫时**飘字也归零**（不留"打了却没掉血"的假数字）
                            const titanNexusDmg = isNexusImmune(nextGame, enemyPlayer) ? 0 : 2;
                            eventBus.emit('unit_damage', { id: `nexus_${enemyPlayer}`, amount: titanNexusDmg });
                            eventBus.emit(GameEvents.NEXUS_STRIKED, { target: enemyPlayer, amount: titanNexusDmg });
                            console.log(`[丁型] 泰坦物质爆炸！对敌方全体造成 ${titanNexusDmg} 点伤害`);
                        }
                    });
                }

                // =====================================
                // [2026-10-02 莉莉子 信标亡语化 —— 旧补兵机制已整体删除]
                // ── 删除内容：规则 A（Lv2 每回合首次补兵）/ 规则 B（Lv1 补兵券兑现）/
                //    `marianBeaconVoucher` 欠条 / `marianBeaconRespawnRound` 节流。
                // ── 为什么删：这套机制要在**死亡漏斗里集中兑现**，本质要求"监控所有信标死亡路径"。
                //    连续三次事故（09-23 不计数 / 09-27 交战区实例 / 10-01 补兵根治）都是这个监控漏了某条路。
                // ── 现在谁负责重生：**信标自己的亡语**（effect_marian_beacon_respawn），
                //    授予方式是**等级无关的光环** ⇒ 见本文件上方 hasLiveMarian 分支（亡语派发处动态补挂）。
                //    ⇒ 死亡漏斗**不再需要知道信标的事**，也就没有"漏路径"可言了。
                // ⚠️ 刻意保留「引爆对账器」（sbaPendingRef / reconcileTicketedRef）：它不只是补兵的一环，
                //    更是**亡语引爆**的兜底补票；BUG-20261002-20（信标死亡没触发 AOE）未查清前不动它。
                // =====================================

                // =====================================
                // [2026-10-05 莉莉子 BUG修复 · 20261005-02] **亡语幂等的第二道钉**：票被消费 ⇒ 立刻给场上那具尸体盖章
                // ── 为什么必须盖：`isDead` 是"已宣判"的唯一判据（`judgeUnit` 首句 `if (c.isDead) return c`），
                //    而另两条判死路径并不写它（备战席 processDeaths 只写 animState；交战区由对账器补票）
                //    ⇒ 尸体在场上停留期间会被**再次判死 → 再开一张票** ⇒ 亡语结算两遍
                //    （珍馐绵羊：2 张梦莲无人机 → 4 张）。
                // ── 位置刻意选在**亡语结算之后**：与信标的「引爆幂等钉」同思路（钉在真正结算的那一刻）。
                //    复活路径会显式写 `isDead:false`（RESURRECT / rogueTrigger）⇒ 不误伤复活体的第二次死亡。
                // ── 顺带收益：0 血尸体从此带 isDead ⇒ 索敌/存在性判定不再把尸体当活人。
                // ⚠️ [2026-10-05 追加] `animState` **只在不是死亡态时才改写**：幻象（梵音小队/飞剑等）的
                //    `ephemeral_dying` 是"消散"专属演出态，强行改成 `dying` 会把它演成普通碎裂
                //    —— 保留原态即可（`isDead` 已经足够让 judgeUnit 跳过、让清理过滤器命中）。
                // =====================================
                const stampCorpse = (c: CardData): CardData => {
                    if (!c || c.id !== unit.id) return c;
                    const stamped: CardData = {
                        ...c,
                        isDead: true,
                        animState: (c.animState === 'ephemeral_dying' ? 'ephemeral_dying' : 'dying') as CardData['animState'],
                    };
                    // [2026-10-05 莉莉子 BUG修复 · 20261005-12 · **独立审查抓到的重复派发反例**]
                    //   盖章会**造一个新对象** ⇒ 必须把「unit_die 已派发」账本一起搬过来。
                    //   否则补派发那趟会把这张新对象当成"没派发过"再发一遍 ——
                    //   **凡"先由 SBA(judgeLifeAndDeath) 派发、后被票据盖章"的死亡必中**（法术击杀 / 回合末）。
                    if (hasUnitDieDispatched(c)) markUnitDieDispatched(stamped);
                    return stamped;
                };
                nextPlayerBench = nextPlayerBench.map(stampCorpse);
                nextEnemyBench = nextEnemyBench.map(stampCorpse);
                if (nextCombatField) {
                    nextCombatField = nextCombatField.map((f: any) => ({
                        ...f,
                        attacker: f.attacker ? stampCorpse(f.attacker) : f.attacker,
                        blocker: f.blocker ? stampCorpse(f.blocker) : f.blocker,
                    }));
                }
            }
        });

        // 统一处理结算后的升级派单
        if (hasLeveledUp && leveledHeroes.length > 0) {
            // [2026-09-09 莉莉子 修复] 按 key 去重再入队：同一英雄 key 已在队列则不再重复派单
            // （对齐光环引擎 940-941 的去重策略），杜绝多只同 key 卜卜 / 同一触发被多次结算时
            // 升级影片被反复播放的观感。
            const queuedKeys = new Set((nextGame.pendingLevelUps || []).map(p => p.key));
            const freshHeroes = leveledHeroes.filter(h => !queuedKeys.has(h.key));
            nextGame.pendingLevelUps = [...(nextGame.pendingLevelUps || []), ...freshHeroes];
            freshHeroes.forEach(hero => {
                // [2026-09-09 莉莉子] 升级日志按真实归属标记敌我（补敌方目睹路径后，敌方卜卜升级不再误记为我方成就）
                const isPlayerHero = nextPlayerBench.some(c => c.id === hero.id) ||
                    nextCombatField.some(f => (f.owner === 'player' && f.attacker?.id === hero.id) || (f.owner === 'enemy' && f.blocker?.id === hero.id));
                // [2026-09-13 莉莉子] 标记改用统一入口按方写入（全局 + 分阵营两套同步维护），
                // 与升级流程的按方判定保持一致，杜绝敌我同名英雄互相污染升级状态。
                markLeveledUp(nextGame, isPlayerHero ? 'player' : 'enemy', hero.key);
                // [新增] 微队列升级也要记录日志，供成就任务系统使用
                gameLogger.logEvent({ type: 'level_up', turn: nextGame.round, isPlayerSide: isPlayerHero, cardKey: hero.key });
            });
        }

        // [核心修复] 将所有结算结果一次性拍板并写入 React 队列
        setPlayerBench(nextPlayerBench);
        setEnemyBench(nextEnemyBench);
        setCombatField(nextCombatField as any);
        setGame(nextGame as GameState);
        setPlayerHand(nextPlayerHand);
        setEnemyHand(nextEnemyHand);

        return true; // 返回 true 告知调用者“我处理过数据了”
    };

    // ==========================================
    // [2026-09-03 莉莉子 死锁逃生] 交战区应急归位
    // animating 异步链异常中断时调用：交战区存活幸存者放回备战席 + 清空交战区，
    // 并把仍停在 animating 的 phase 兜底回 main。刻意不重算进攻标识消耗
    // （避免误吞 scout 转 rally / 双扣剑），只保"单位不蒸发 + 流程可继续"。
    // ==========================================
    const emergencyUnstickCombat = () => {
        const ref = stateRef.current;
        recoverCombatSurvivors(ref.combatField, ref.playerBench, ref.enemyBench, {
            setPlayerBench, setEnemyBench, setCombatField, setGame,
        });
        setGame(prev => prev.phase === 'animating'
            ? { ...prev, phase: 'main' as const, consecutivePasses: 0, lastActionTimestamp: Date.now() }
            : prev);
    };

    // ==========================================
    // [2026-09-19 莉莉子 方向二 · 獠牙信标「引爆对账器」]
    // ── 病根：亡语触发【完全依赖别人替它开一张 UNIT_DIED 票】，而开票口散落在各条伤害通路里
    //    （引爆倒计时 / 入场效果 / 微队列 / 战斗结算…），判死又读的是提交前的旧快照
    //    ⇒ 信标死了却没人开票 = 不炸，或炸得极晚（实测：打死后半天不爆）。
    // ── 本对账器不关心凶手是谁、走哪条通路，只在【每次状态提交后】做纯推导。
    //    ⇒「渠道太多」这个前提就此作废：以后新增多少种死法都不用再管。
    // ── 刻意【不记录历史、不比对上拍】：只看当前这一拍的快照。
    //    这样连「刚召唤出来就被打死（同一拍内产生 + 阵亡）」也照样兜得住。
    // ── 两级对账（2026-09-19 补第二级，程实测"茉莉安入场打死信标后要跳过回合才炸"）：
    //    【一级·补判决】血已归零、却还没被判死 ⇒ 说明这一拍**根本没人跑过 SBA**。
    //        ⚠️ 关键：判死标记（isDead / animState='dying'）**只有 judgeLifeAndDeath 会打**，
    //           所以"只认死亡标记"的对账器会看见"信标还活着"——这正是首版漏掉的那一环。
    //           识别口径与 judgeUnit 完全相同：health + buffs + roundBuffs - damageTaken <= 0。
    //    【二级·补票】已判死、却没人开票 ⇒ 补一张 UNIT_DIED 票。
    // ── ⚠️ 两级必须分拍：补判决那一拍**不能顺手结算**，否则微队列会拿旧快照写回，
    //    把刚打上的死亡标记冲掉（伤在"判死读旧快照"的老病上）。故用 sbaPendingRef 隔一拍。
    // ── 幂等四重保险（缺一不可）：
    //    ① 已在墓地 ⇒ 正常流程已开过票（票处理器会写墓地）→ 跳过，绝不重复引爆
    //    ② 票已在微队列里 ⇒ 正常流程已开票但还没结算 → 不重复开（复用 hasDeathTicket）
    //    ③ 本对账器补过的 id 记入 reconcileTicketedRef → 不再补
    //    ④ 消亡替换（deathType='ELIMINATED'）⇒ 按设计不触发亡语 → 跳过
    // ── 边界：回手 / 退回牌库 / 被移除的信标不带死亡标记，天然不会被本器误爆。
    // ── 节拍：无依赖数组的 useEffect（每次提交后跑）。声明位置刻意排在 stateRef 同步 effect 之后，
    //    保证读到的是本次提交后的新快照 —— 这正是 judgeLifeAndDeath 在全项目里唯一"读到新快照"的调用点。
    // ==========================================
    // ==========================================
    // [2026-10-03 莉莉子 · 系统性收口] 本器已从「**信标专用引爆对账器**」升级为
    //   「**全场收尸＋亡语结算兜底**」：不再按 `BEACON_KEY` 过滤（那个常量已随本次放宽删除），
    //   任何单位"血归零却未判死 / 已判死却无人开票"都在这里被兜住。
    // ==========================================
    const sbaPendingRef = useRef(false);

    useEffect(() => {
        // ── 【跨拍衔接】上一拍补跑的判死已提交 ⇒ 现在结算它产生的亡语票
        if (sbaPendingRef.current) {
            sbaPendingRef.current = false;
            flushMicroQueue();
            return;
        }

        const isDowned = (c: CardData) =>
            !!c.isDead || c.animState === 'dying' || c.animState === 'ephemeral_dying';
        const hpOf = (c: CardData) =>
            (c.health || 0) + (c.buffs?.health || 0) + (c.roundBuffs?.health || 0) - (c.damageTaken || 0);

        // ① 全场盘点：[2026-10-03 莉莉子 · 系统性收口] **从"只收信标"放宽到"全场"** ——
        //    原来这里 `if (c.key !== BEACON_KEY) return` ⇒ 唯一那个"每拍补判"的兜底只认信标，
        //    于是被信标炸到 0 血的**普通单位**没人判死 ⇒「0 血单位赖在场上」（粉丝报的 `-22`）。
        //    现在统一走 `collectFieldUnits`（备战席 + 交战区全覆盖，含归属戳）⇒
        //    **任何单位**血归零却没人判死，都在这一拍被兜住。
        const board: { side: 'player' | 'enemy'; card: CardData }[] =
            collectFieldUnits({ playerBench, enemyBench, combatField }).map(u => ({ side: u.side, card: u.card }));

        // ② 【一级·补判决】有单位血已归零却没判死 ⇒ 这一拍漏了 SBA，补跑一次（隔拍结算）
        if (board.some(({ card }) => !isDowned(card) && hpOf(card) <= 0)) {
            console.log('[DeathReconcile] 对账器：检出血量已归零却未判死的单位 → 补跑一次生死判决（下一拍结算亡语）');
            sbaPendingRef.current = true;
            judgeLifeAndDeath();
            return;
        }

        // ③ 【二级·补票】躺下了 + 没人开过票 → 当场补票（「第一时间引爆/收尸」的兑现处）
        //    ⚠️ 范围同样放宽到全场，但**排除幻象死亡**（`ephemeral_dying` 由回合引擎那段单独处理，
        //       否则同一次死亡会被两边各触发一遍亡语）；ELIMINATED 消亡替换照旧不触发。
        board.filter(({ card }) => isDowned(card)).forEach(({ side, card }) => {
            if (card.animState === 'ephemeral_dying') return;                // 幻象：归回合引擎管，别双触发
            // =====================================
            // [2026-10-05 莉莉子 BUG修复 · 20261005-05] **已宣判 ⇒ 绝不补票**（幻象/梵音双触发的兜底）
            // ── `isDead: true` 全项目只有两个写入者：
            //      ① `judgeUnit`（一判死就盖章 —— 同时也是"死亡票已开"的那一刻）
            //      ② `UNIT_DIED` 处理器末尾的「尸体盖章」（票被消费、亡语已结算时盖章）
            //    ⇒ 看到 `isDead` 就等于"这张票已经开过 / 已经结算过"，再补一张就是**亡语结算两遍**。
            // ── 为什么非加不可：本器上一句的幻象豁免靠 `animState === 'ephemeral_dying'` 识别，
            //    而 `judgeUnit` 会把幻象**改写成 `'dying'`** ⇒ **豁免失效**；此时幻象尸体只要
            //    "墓地判据"没兜住（旧快照写回覆盖等），就会被本器**补第二张票** ⇒ 亡语跑两遍
            //    （珍馐绵羊 / 梵音小队同源症状）。
            // ── 安全性：全项目只有 `flushMicroQueue` 取出票据时清空队列（`pendingActionsRef.current = []`，
            //    仅此一处、且取出即全量处理）⇒ 不存在"已宣判却永远无人结算"的丢票场景。
            // ⚠️ 保留"只有 animState 死亡态、没有 isDead"这一格给本器继续兜底 —— 那才是它存在的意义
            //    （交战区/备战席被标 `dying` 却没人开票的情形）。
            // =====================================
            if (card.isDead) return;                                         // 已开票 / 已结算 ⇒ 不补
            if (reconcileTicketedRef.current.has(card.id)) return;              // ③ 本器已补过
            if (card.deathType === 'ELIMINATED') return;                     // ④ 消亡替换不触发亡语
            if (hasDeathTicket(pendingActionsRef.current, card.id)) return;  // ② 票已在队列 → 不重复开
            const inGrave = (game.playerGraveyard || []).some(c => c.id === card.id)
                || (game.enemyGraveyard || []).some(c => c.id === card.id);
            if (inGrave) return;                                             // ① 正常流程已开票并引爆过

            reconcileTicketedRef.current.add(card.id);
            console.log(`[DeathReconcile] 对账器补票：${card.name}(id=${card.id}) 已阵亡却无人开票 → 当场补结算（阵营=${side}）`);
            pendingActionsRef.current.push({ type: 'UNIT_DIED', payload: { unit: card, bench: side } });
            flushMicroQueue();                                               // 立刻结算
        });
    });

    // ==========================================
    // [2026-09-19 1.0.16 茉莉安 · 大招逐击] 连斩驱动器（节拍器）
    // ── 引擎侧把连斩改成「一击一步」后，需要有人把后续每一击推到下一拍。
    //    每打完一击，pendingChain 都会被写成**新对象** ⇒ 本 effect 重跑 ⇒ 起一个新的定时器
    //    ⇒ 形成「打一击 → 等演出 → 再打一击」的节奏（与演出层同拍）。
    // ── 期间锁相：连斩本质是"结算动画"，不该让玩家中途操作；收尾还原进入前的 phase。
    // ── 中途异常（组件卸载）由 cleanup 清掉定时器；残留的链会被下一次施法覆盖，不会卡死。
    // ==========================================
    const CHAIN_STRIKE_STEP_MS = 1000; // 每击间隔（程 2026-09-19 拍板：0.6s → 1s，给演出与音效留呼吸）

    const chainStrikeStep = () => {
        const chain = stateRef.current.game.pendingChain;
        if (!chain || chain.done) return;
        // [2026-10-10 莉莉子 · 二轮独立审查建议①] **每击续一次"进展"心跳** ——
        //   animating 看门狗的判据是"距上次 `bumpAnimProgress` 超过 25s"，而连斩的逐击路径
        //   此前**一处都没打点** ⇒ 判据实际是"链从起点起 25s 内必须收尾"；
        //   再加上 hidden/暂停早退不刷心跳，**切后台 / 休眠唤醒后墙钟一跳**就会在活链中途
        //   被误判成停滞并强推。现在每击都续心跳 ⇒ 语义变成"**多久没有新的一击**"，活链永不误伤。
        bumpAnimProgress();
        const snap = stateRef.current;
        const ctx: EffectContext = {
            game: { ...snap.game },
            playerBench: [...snap.playerBench],
            enemyBench: [...snap.enemyBench],
            playerHand: [...snap.playerHand],
            enemyHand: [...snap.enemyHand],
            playerDeck: snap.playerDeck,
            enemyDeck: snap.enemyDeck,
            combatField: [...snap.combatField],
            owner: chain.casterSide,
        };
        // ⚠️ 这里写死了「最终指令」的效果 id —— 目前**全仓库只有它用 CHAIN_STRIKE 类**（已核）。
        //    将来若出现第二张连斩卡，要把 id 记进 pendingChain 再从这里取。
        const res = processEffect('effect_marian_ultimate', [], ctx);
        setPlayerBench(res.playerBench);
        setEnemyBench(res.enemyBench);
        if (res.combatField) setCombatField(res.combatField as any);
        setGame(res.game as GameState);
        if (res.playerHand) setPlayerHand(res.playerHand);
        if (res.enemyHand) setEnemyHand(res.enemyHand);
        // 显式同步快照：下一击必须读到"本击之后"的最新战场（护栏①靠它成立）
        stateRef.current.playerBench = res.playerBench;
        stateRef.current.enemyBench = res.enemyBench;
        stateRef.current.game = res.game as GameState;
        if (res.combatField) stateRef.current.combatField = res.combatField as any[];
    };

    useEffect(() => {
        const chain = game.pendingChain;
        if (!chain) return;
        if (chain.done) {
            // 链收尾：还原进入前的 phase
            setGame(prev => (prev.phase === chain.prevPhase ? prev : { ...prev, phase: chain.prevPhase as GameState['phase'] }));
            return;
        }
        setGame(prev => (prev.phase === 'animating' ? prev : { ...prev, phase: 'animating' as const }));
        const timer = setTimeout(() => chainStrikeStep(), CHAIN_STRIKE_STEP_MS);
        return () => clearTimeout(timer);
    }, [game.pendingChain]);

    // ==========================================
    // [2026-10-03 莉莉子 · P0 收口] **"等升级播完"的唯一实现已提到 `utils/levelUpDrain.ts`**
    //   （原先 useGameState 与 useSpellSystem 各抄一份）。这里只做"接线"：
    //   把本 hook 的 stateRef / setGame / wait 传进去，并支持传入"本场战斗累计预算"。
    // ==========================================
    const awaitLevelUpDrain = (tag: string, budget?: { used: number; limit: number }) =>
        awaitLevelUpDrainCore({
            readPending: () => {
                const g = stateRef.current.game;
                const queueLen = (g.pendingLevelUps || []).length;
                return { isPending: g.levelUpCard !== null || queueLen > 0, queueLen };
            },
            clearLevelUp: () => setGame(prev => ({ ...prev, levelUpCard: null, pendingLevelUps: [] })),
            wait,
            tag,
            budget,
        });

    const runResolveCombatAnimation = async () => {
        // [2026-10-03 莉莉子 · P0] 本场战斗的**升级等待累计预算**（每一路战斗后的刹车共享它）
        //   —— 防止"队列被反复填充"时按"单次 20s × 最多 6 路"叠加成分钟级卡顿。
        const levelUpBudget = makeLevelUpDrainBudget();
        // [2026-09-18 BUG修复] 先让 React 把宣告阶段的 setBench 同步进 stateRef。
        //   进攻宣言的「引爆倒计时」可能把信标打死，但那批 setBench 尚未落到 stateRef，
        //   此处若立刻判死，读到的还是旧快照（信标"还没死"）→ 亡语被推迟到很晚才结算。
        await wait(30);
        // [SBA] 战斗开始前，先清尸
        judgeLifeAndDeath();
        setGame(prev => ({ ...prev, phase: 'animating' }));
        const totalFights = stateRef.current.combatField.length;
        console.log(`[CombatDebug] resolveCombatAnimation 开始 — totalFights=${totalFights}`, stateRef.current.combatField.map((f: any) =>
            `A:${f.attacker?.key}(HP=${f.attacker ? getHealth(f.attacker) : '—'} alive=!${f.attacker?.isDead&&'D'||f.attacker?.animState})` +
            ` vs B:${f.blocker?.key||'无'}(HP=${f.blocker ? getHealth(f.blocker) : '—'} alive=!${f.blocker?.isDead&&'D'||f.blocker?.animState||'—'})`
        ));
        const ralliedOwners = new Set<'player' | 'enemy'>(); // [核心新增] 收集在战斗中触发备战的阵营
        for (let i = 0; i < totalFights; i++) {
            let currentFight = stateRef.current.combatField[i];
            const { attacker, blocker } = currentFight;

            // [新增] 军功审计探针：记录我方发起进攻 (用于里芙卡背等任务)
            if (currentFight.owner === 'player') {
                gameLogger.logEvent({ type: 'attack', turn: stateRef.current.game.round, isPlayerSide: true, cardKey: attacker.key });
            }

            // [核心修复 1] 将快攻情报判定提前，用于指导动画状态机分流
            const hasQuickAttack = attacker.keywords.includes('QuickAttack');

            // [防诈尸补丁] 判断是否在法术阶段已被击杀
            const isAttackerDead = attacker.animState === 'dying' || attacker.animState === 'ephemeral_dying';
            // [2026-08-19 莉莉子 挥空动画] 无法进攻的三种情况 → 原地左右晃动而非撞向目标：
            // ① 空气墙阻挡（含阻挡者被法术撤回） ② 阻挡者被击杀已不在场 ③ 攻击力为 0（冻结 / 无法攻击 / 本身为 0）
            const swingMiss = !isAttackerDead && (
                (currentFight as any).isGhostBlocked === true
                || (currentFight.blocker && (currentFight.blocker.isDead || currentFight.blocker.animState === 'dying' || currentFight.blocker.animState === 'ephemeral_dying'))
                || getPower(attacker) <= 0
            );
            // [2026-08-19 莉莉子 连击双段] 连击单位且未死亡且非挥空 → 走双段打击流程（两段撞击动画 + 每击伤害分别飘字）
            const isDoubleStrikeFight = !isAttackerDead && !swingMiss && attacker.keywords.includes('Double Attack');

            setCombatField(prev => {
                const n = [...prev];

                // 严禁死者做动作！挥空时原地左右晃动，不撞向目标
                const atkState = isAttackerDead ? attacker.animState : (swingMiss ? 'swing_miss' : 'attacking');
                let blkState = n[i].blocker?.animState;
                if (n[i].blocker && blkState !== 'dying' && blkState !== 'ephemeral_dying') {
                    blkState = hasQuickAttack ? 'delayed_attacking' : 'attacking';
                }

                n[i] = {
                    ...n[i],
                    attacker: { ...n[i].attacker, animState: atkState } as CardData,
                    blocker: n[i].blocker ? { ...n[i].blocker, animState: blkState as any } as CardData : null
                };
                return n;
            });

            // 音效与节奏控制
            // ==========================================================
            // [2026-10-10 莉莉子 · 打击感] 拆成**两个时点**：撞点（音效）与结算点（伤害/状态）。
            //   为什么必须拆开 —— 这两件事对"能不能提前"的约束完全相反：
            //   · 音效只是播声音 ⇒ 提前到撞点**零风险** ✅
            //   · 结算会把卡牌 animState 从 'attacking' 翻成 'hit'，而 animClass 是
            //     "当前 animState 的**纯函数**"（Card.tsx:1074-1117）⇒ 若在撞点结算，
            //     就会**在撞点那一帧把 bump 动画整段摘掉**，卡牌从 -200px / -450px
            //     **一帧跳回原位**（瞬移）。bump 动画 0.3s、quick-dash 0.4s，
            //     所以结算必须等冲刺动画走完 —— 这就是旧值 400 / 470 / 350 的来历，
            //     它们不是随手写的数，是在躲动画长度。**不要把结算提前到撞点。**
            //   ⚠️ 撞点真源 = CSS keyframe 的百分比（index.css），改 keyframe 必须同步这里：
            //      bump-*         0.3s × 50%      = 150ms（有格挡对撞）
            //      bump-*-long    0.3s × 40%      = 120ms（无格挡直击水晶）
            //      quick-dash-*   0.4s × 40~60%   = 160~240ms，取中点 200ms（先攻）
            // ==========================================================
            const impactAt = isAttackerDead ? 0
                : swingMiss ? 200          // 挥空：无撞击，不发撞击音
                : hasQuickAttack ? 200     // 先攻冲刺刺入中心
                : (blocker ? 150 : 120);   // 有格挡对撞 / 直击水晶

            // 结算点：与旧值逐一对应（0 / 350 / 400 / 470），一律晚于冲刺动画
            const damageAt = isAttackerDead ? 0
                : swingMiss ? 350          // 挥空：等晃动演完（swing-miss 0.5s）
                : hasQuickAttack ? 470     // quick-dash 0.4s + 余量
                : 400;                     // bump 0.3s + 余量

            if (!isAttackerDead && !swingMiss) {
                if (!blocker) {
                    setTimeout(() => eventBus.emit(GameEvents.SFX_STRIKE_NEXUS), impactAt);
                } else {
                    if (hasQuickAttack) {
                        setTimeout(() => eventBus.emit(GameEvents.SFX_QUICK_ATTACK), impactAt);
                        // 格挡者的反击走 delayed-bump（1s × 70% = 700ms 才是它自己的撞点）
                        // ⇒ 反击音对齐到 700ms（旧值 450ms 比它的动画早了 250ms）
                        setTimeout(() => eventBus.emit(GameEvents.SFX_QUICK_BLOCK), 700);
                    } else {
                        setTimeout(() => eventBus.emit(GameEvents.SFX_STRIKE_NORMAL), impactAt);
                    }
                }
            }

            // 等待直到撞击结算（不是撞点 —— 见上方"瞬移"说明）
            await wait(damageAt);
            const gameSnapshot = stateRef.current.game;
            const result = isDoubleStrikeFight
                ? resolveDoubleStrikeCombat(currentFight, gameSnapshot)
                : resolveSingleCombat(currentFight, gameSnapshot);

            // ==========================================
            // [2026-08-19 莉莉子 连击双段] 单路战斗内每击伤害飘字（含 Mauxir 累积）
            // ==========================================
            // [2026-10-06 莉莉子 BUG修复 · BUG-20261006-01 · **旁支① A 方向**（程 2026-10-06 拍板）]
            //   记账必须**按实际归属方**：谁的召唤体系打出伤害，就记到**谁**的猫汐尔账上。
            //   ── 旧写法一律写 `stateRef.current.playerBench` ⇒ **敌方召唤系造成的伤害被记进我方猫汐尔**。
            //      （卡面文案是「**友方**召唤者和召唤物累计造成 30 点伤害」，友方 = 自己这一方。）
            //   ── 可达性（已核实）：敌方卡池里有 champion = 猫汐尔的流派
            //      `new_archetype_1783818542422`「摆完挂机」（6 张猫汐尔 + 图征小队三人，
            //      `data/enemies/archetypes.ts:172-186`），其召唤系衍生物（珍馐绵羊 / 搜救阿努比斯 /
            //      清泉医疗鳄，race 均为 `summon`）一动手就会串账。
            //   ── ⚠️ 既定代价（程已确认）：敌方那张猫汐尔**也会开始正常攒进度**。
            //   归属推导：`currentFight.owner` = **进攻方**；格挡者属其**对面**（与全项目既有读法一致）。
            // ⚠️ 本次只覆盖**交战区这三处**（C-1 / C-2 / C-3）。另外几条记账点
            //   （埋点 A / B-1 / B-2 / 群体 BUFF / 斯瓦莉 +3）仍保留 `owner === 'player'` 门
            //   ⇒ 敌方猫汐尔目前**只从肉搏攒进度**，不从那些来源攒。**未动，留档**。
            const accumulateMauxirForSide = (side: 'player' | 'enemy', amount: number) => {
                if (side === 'player') {
                    accumulateMauxirDamage(stateRef.current.playerBench, stateRef.current.combatField, amount, setPlayerBench, stateRef.current.playerHand, setPlayerHand, stateRef.current.playerDeck, setPlayerDeck, 'player');
                } else {
                    accumulateMauxirDamage(stateRef.current.enemyBench, stateRef.current.combatField, amount, setEnemyBench, stateRef.current.enemyHand, setEnemyHand, stateRef.current.enemyDeck, setEnemyDeckState, 'enemy');
                }
                // 交战区贴值（该函数已按各自归属方贴各自的值）
                setCombatField(prev => applyMauxirProgressToField(prev) ?? prev);
            };

            const emitStrikeDamage = (atkDmg: number, blkDmg: number) => {
                if (atkDmg > 0 && result.updatedFight.attacker) {
                    // [2026-09-19] fromCombat：战斗打击已有专属打击音，默认受击音据此跳过，避免双响
                    eventBus.emit('unit_damage', { id: result.updatedFight.attacker.id, amount: atkDmg, key: result.updatedFight.attacker.key, fromCombat: true });
                    // [修改] 埋点 C-2：防守者造成伤害 (进攻者挨打，说明是防守者造成的物理伤害)
                    if (currentFight.blocker && isSummonerOrSummon(currentFight.blocker)) {
                        const dmg = currentFight.blocker.key === 'Soline_Anubis' ? atkDmg * 2 : atkDmg;
                        // 格挡者属「进攻方的对面」
                        accumulateMauxirForSide(currentFight.owner === 'player' ? 'enemy' : 'player', dmg);
                    }
                }
                if (blkDmg > 0 && result.updatedFight.blocker) {
                    eventBus.emit('unit_damage', { id: result.updatedFight.blocker.id, amount: blkDmg, key: result.updatedFight.blocker.key, fromCombat: true }); // [2026-09-19] 同上
                    // [修改] 埋点 C-1：进攻者造成伤害 (防守者挨打，说明是进攻者造成的物理伤害)
                    if (isSummonerOrSummon(currentFight.attacker)) {
                        const dmg = currentFight.attacker.key === 'Soline_Anubis' ? blkDmg * 2 : blkDmg;
                        // 进攻者属 `currentFight.owner`
                        accumulateMauxirForSide(currentFight.owner === 'player' ? 'player' : 'enemy', dmg);
                    }
                }
            };

            if (isDoubleStrikeFight) {
                // [类型窄化] 断言为双段结算结果（运行时仅连击分支会走到）
                const dsResult = result as DoubleStrikeCombatResult;
                // ① 第一击伤害飘字（第一撞动画已在上面播放）
                emitStrikeDamage(dsResult.strike1.attackerDamage, dsResult.strike1.blockerDamage);

                // ② 第二撞动画：攻击者再撞一次，阻挡者若存活则反击
                if (dsResult.strike2) {
                    setCombatField(prev => {
                        const n = [...prev];
                        const f2 = n[i];
                        const a2 = { ...f2.attacker, animState: 'attacking' as const, strikeStamp: (f2.attacker.strikeStamp || 0) + 1 };
                        let b2: any = f2.blocker ? { ...f2.blocker } : null;
                        if (b2 && !b2.isDead && b2.animState !== 'dying' && b2.animState !== 'ephemeral_dying') {
                            b2 = { ...b2, animState: 'attacking' as const };
                        }
                        n[i] = { ...f2, attacker: a2, blocker: b2 };
                        return n;
                    });
                    // 第二击音效（普通攻击撞击）
                    // [2026-10-10 莉莉子 · 打击感] 第二撞走 bump-*-second（0.3s × 50% = 150ms 撞点）
                    // ⇒ **音效**对齐到 150ms（旧值 0 比撞点早了 150ms）。
                    // ⚠️ 但**结算仍留在 400ms**：`unit_damage` 会把该卡 localShake 置真
                    //    （Card.tsx:721），从而在撞点那一帧把 bump-*-second 摘掉造成瞬移
                    //    —— 与第一击同一条约束（见上方 impactAt / damageAt 说明）。
                    setTimeout(() => eventBus.emit(GameEvents.SFX_STRIKE_NORMAL), 150);
                    await wait(400);
                    // ③ 第二击伤害飘字
                    emitStrikeDamage(dsResult.strike2.attackerDamage, dsResult.strike2.blockerDamage);
                }
            }

            // [2026-07-21 对局记录] 单路战斗结算
            {
                const fightEnt: RecordEntity[] = [];
                const atkDied = result.killedUnits.some(u => u.id === currentFight.attacker.id);
                fightEnt.push({
                    cardKey: currentFight.attacker.key,
                    owner: currentFight.owner,
                    damageTaken: result.attackerDamage > 0 ? result.attackerDamage : undefined,
                    died: atkDied || undefined,
                    snapshot: captureSnapshot(result.updatedFight.attacker),
                });
                if (currentFight.blocker) {
                    const blkDied = result.killedUnits.some(u => u.id === currentFight.blocker!.id);
                    const blkOwner = currentFight.owner === 'player' ? 'enemy' : 'player';
                    fightEnt.push({
                        cardKey: currentFight.blocker!.key,
                        owner: blkOwner,
                        damageTaken: result.blockerDamage > 0 ? result.blockerDamage : undefined,
                        died: blkDied || undefined,
                        snapshot: captureSnapshot(result.updatedFight.blocker!),
                    });
                }
                let fightDetail: string | undefined;
                if (result.nexusDamage && result.nexusDamage.amount > 0) {
                    const targetLabel = result.nexusDamage.target === 'player' ? '你' : '敌方';
                    fightDetail = `🏰${targetLabel}受到${result.nexusDamage.amount}点伤害`;
                }
                recordAction('combat_fight', currentFight.owner, '交锋', {
                    entities: fightEnt,
                    detail: fightDetail,
                });
            }

            // [核心新增] 物理战斗受伤事件抛出 (完美桥接微队列，彻底免去污染 combat.ts)
            // [2026-08-19 莉莉子] 连击场景每击伤害已在双段分支分别飘字，此处仅非连击合并伤害飘一次
            if (!isDoubleStrikeFight) {
                emitStrikeDamage(result.attackerDamage, result.blockerDamage);
            }

            // 1. 广播死亡事件 & [新增] 击杀事件
            result.killedUnits.forEach(deadUnit => {
                // A. 广播死亡 (受害者)
                eventBus.emit(GameEvents.UNIT_DIE, deadUnit);

                // B. 寻找凶手并广播击杀
                // 逻辑：如果死者是进攻者，凶手就是格挡者；如果死者是格挡者，凶手就是进攻者
                let killer: CardData | null = null;
                if (deadUnit.id === currentFight.attacker.id && currentFight.blocker) {
                    killer = currentFight.blocker;
                } else if (currentFight.blocker && deadUnit.id === currentFight.blocker.id) {
                    killer = currentFight.attacker;
                }

                if (killer) {
                    // [核心新增] 【激励之声】击杀监听器：如果凶手身上贴有这个暗号词条，立即向军需处申请备战令牌！
                    if (killer.keywords.includes('Listening_KillToRally' as any)) {
                        const killerOwner = killer.id === currentFight.attacker.id ? currentFight.owner : (currentFight.owner === 'player' ? 'enemy' : 'player');
                        ralliedOwners.add(killerOwner);
                        eventBus.emit('gain_token_rally', { owner: killerOwner }); // 发射视觉信号
                    }
                    // C. 判定凶手是否为我方单位 (只有我方单位击杀时才播放语音)
                    // 逻辑：
                    // - 如果攻击是 player 发起的：Attacker 是 Player, Blocker 是 Enemy
                    // - 如果攻击是 enemy 发起的：Attacker 是 Enemy, Blocker 是 Player
                    const isAttackerPlayer = currentFight.owner === 'player';
                    const isKillerAttacker = killer.id === currentFight.attacker.id;

                    // 这里的逻辑是：(我是进攻方且凶手是进攻者) 或 (我是防守方且凶手是防守者) => 凶手是我
                    const isPlayerKiller = (isAttackerPlayer && isKillerAttacker) || (!isAttackerPlayer && !isKillerAttacker);

                    if (isPlayerKiller) {
                        // 稍微延迟 0.1秒，避免和死亡语音完全重叠，体验更好
                        setTimeout(() => {
                            eventBus.emit(GameEvents.UNIT_KILL, killer);
                        }, 100);
                    }
                }
            });

            // 2. 更新全局 State

            // [新增] 记账：为参与本次交锋的存活/阵亡单位，无情记上一笔“本回合已打击”
            if (result.updatedFight.attacker) {
                result.updatedFight.attacker.roundStrikes = (result.updatedFight.attacker.roundStrikes || 0) + 1;
            }
            if (result.updatedFight.blocker) {
                result.updatedFight.blocker.roundStrikes = (result.updatedFight.blocker.roundStrikes || 0) + 1;
            }

            // 更新战场卡牌状态
            setCombatField(prev => {
                const n = [...prev];
                n[i] = result.updatedFight;
                return n;
            });

            // ==========================================
            // [2026-08-19 莉莉子] 迷宫强化 after_attack / after_attacked：打击后成长
            // 目标 = 触发单位自身（打击者 / 被打击者），永久加成
            // ==========================================
            // 我方单位打击后（以战养战 BUFF_SELF）；生命壁垒/攻守易形(STAT_BALANCE)已提前到进攻宣告确认时触发
            // [2026-09-05 莉莉子] 见 commitAttack：STAT_BALANCE 攻击宣言即生效（程拍板），此处跳过防二次触发/闪烁
            // [2026-09-09 莉莉子 重构] 收编统一串行触发引擎：BUFF_SELF handler 直接改写 result.updatedFight 对应侧，
            // 末尾按需单次 setCombatField 提交（替换 index i），删掉原先每 def 一次散装 set。
            // [2026-10-06 莉莉子] 下面这段「强化成长」与紧随其后的「装备成长」共用这三个事实 ⇒ 提到块外声明
            const atkUnitId = currentFight.attacker?.id;
            const blkUnitId = currentFight.blocker?.id;
            // [2026-10-06 莉莉子 · 审查 Q4 反例] 判据改用**引擎自己的事实** `blockerDidStrike`：
            //   拿 `attackerDamage > 0` 当代理会**假阳**（荆棘反伤，阻挡者没挥击也 >0）
            //   也会**假阴**（反击被坚韧减到 0 / 被屏障吸收）⇒ 四支的开关必须读这个事实。
            const blockerStruck = result.blockerDidStrike === true;
            {
                const strikeGameSeed = stateRef.current.game; // [既有裂缝①] 差异合并的基线
                const strikeCtx: RogueTriggerCtx = {
                    game: { ...strikeGameSeed },
                    playerBench: [...stateRef.current.playerBench],
                    enemyBench: [...stateRef.current.enemyBench],
                    combatField: [],
                    playerHand: [],
                    enemyHand: [],
                    playerDeck: [],
                    enemyDeck: [],
                    owner: 'player',
                    trigger: 'after_attack',
                    createFullCard,
                    info: { fight: result.updatedFight },
                    dirty: { bench: new Set<Side>(), hand: new Set<Side>(), deck: new Set<Side>(), field: false, game: false },
                };
                const preAtk = result.updatedFight.attacker;
                const preBlk = result.updatedFight.blocker;
                // ==========================================
                // [2026-10-06 莉莉子 · 程拍板]**本块重构为「四支对称」**
                //   口径②：「被打击」= 当阻挡者挨打 **或** 进攻被反击
                //   旁支②：**阻挡者的反击也算「打击」**
                //   旁支①：**敌我两侧一视同仁**（原装备侧按"我方"写死 ⇒ 敌方成长装形同装饰）
                //   ⚠️ 派发必须带 `info.subject` 告诉 handler「**这次是谁**」——
                //      同一个 trigger 现在有两个可能主体，靠 owner 反推会 buff 到对面单位。
                // ==========================================
                const stOwner: 'player' | 'enemy' = currentFight.owner === 'player' ? 'player' : 'enemy';
                const stOther: 'player' | 'enemy' = stOwner === 'player' ? 'enemy' : 'player';
                const enhOf = (s: 'player' | 'enemy') =>
                    (s === 'player' ? stateRef.current.game.rogueEnhancements : stateRef.current.game.enemyEnhancements);
                const dispatchStrikeEnh = (
                    side: 'player' | 'enemy',
                    subject: 'attacker' | 'blocker',
                    trigger: 'after_attack' | 'after_attacked',
                ) => {
                    strikeCtx.owner = side;
                    strikeCtx.trigger = trigger;
                    strikeCtx.info = { fight: result.updatedFight, subject };
                    runRogueTrigger(strikeCtx, enhOf(side), trigger, c => c === 'BUFF_SELF');
                };
                // ① 攻击者：**打击**（发起进攻必算）
                //    [2026-10-06 既有裂缝②收口] 收紧为**存活才发**（被法术预杀 / 僵尸缴械的攻击者没挥击）。
                //    ⚠️ 诚实标注：handler 与装备侧本来都有存活门 ⇒ 这是**行为等价的写法收紧**，
                //       不是修一个玩家可见缺陷（收口的意义是"派发点写准，省后人排查")。
                if (isStrikeTargetAlive(result.updatedFight.attacker)) {
                    dispatchStrikeEnh(stOwner, 'attacker', 'after_attack');
                }
                // ② 攻击者：**被反击**（真的挨了才算 —— 先攻秒杀 / 对方 0 攻时不发）
                if (currentFight.blocker && blockerStruck) dispatchStrikeEnh(stOwner, 'attacker', 'after_attacked');
                // ③ 阻挡者：**被打击**（维持原口径：有 blocker 即算，未额外收紧"必须掉血"）
                if (currentFight.blocker) dispatchStrikeEnh(stOther, 'blocker', 'after_attacked');
                // ④ 阻挡者：**反击 = 打击**（旁支②；只有真的挥出才发）
                if (currentFight.blocker && blockerStruck) dispatchStrikeEnh(stOther, 'blocker', 'after_attack');
                // [2026-10-06 既有裂缝①收口] 本站点此前**从不回收 `strikeCtx.game`** ⇒
                //   挂在 after_attack / after_attacked 上的 `oncePerBattle` 账本（`used:` 键）写完即丢。
                //   按仓库既有写法差异合并提交（与 unit_die 站点 1089 同一出口）。
                if (strikeCtx.dirty.game) commitDirtyGame(strikeCtx.game, strikeGameSeed);
                // BUFF_SELF 改写了 updatedFight 对应侧 → 单次提交 index i 处
                if (result.updatedFight.attacker !== preAtk || result.updatedFight.blocker !== preBlk) {
                    setCombatField(prev => {
                        const n = [...prev];
                        n[i] = result.updatedFight;
                        return n;
                    });
                }
            }

            // ==========================================
            // [2026-08-20 莉莉子] 成长装备 after_attack / after_attacked：打击后/被打击后永久成长
            // [2026-10-06 莉莉子] 与强化侧**同口径、同四支、同归属**（旁支①：补齐敌方两侧）
            //   ⚠️ 多个事件 / 多件装备必须**合并累加、单次提交**：老写法是每件各
            //      `applyPermanentBuff(原始对象)` + 各调一次 setCombatField
            //      ⇒ 同一张卡挂两件成长装时**只有最后一件生效**（模式 A：顶掉）。
            //      攻击者侧上一批已修；本批把**阻挡者侧**一并修掉（独立审查 Q7-a 反例）。
            // ==========================================
            const applyEquipGrowth = (
                unit: CardData | null | undefined,
                id: string | undefined,
                events: ('after_attack' | 'after_attacked')[],
                slot: 'attacker' | 'blocker',
            ) => {
                if (!unit || !id || !isStrikeTargetAlive(unit) || events.length === 0) return;
                // [2026-09-15 莉莉子 BUG修复] 存活判据叠加真实血量（防"被这一击打死仍吃到成长"的变相复活）
                const growth = events.flatMap(ev => getEquipTriggers(unit, ev)).filter(t => t.target === 'self');
                if (growth.length === 0) return;
                const buffed = growth.reduce((acc, t) => applyPermanentBuff(acc, t.power, t.health), unit);
                setCombatField(prev => prev.map(f =>
                    (slot === 'attacker' ? f.attacker?.id === id : f.blocker?.id === id)
                        ? { ...f, [slot]: buffed }
                        : f));
            };
            // ① 攻击者：打击（必有） ＋ 被反击（真的挨了才算）
            applyEquipGrowth(
                result.updatedFight.attacker, atkUnitId,
                currentFight.blocker && blockerStruck ? ['after_attack', 'after_attacked'] : ['after_attack'],
                'attacker',
            );
            // ② 阻挡者：被打击（有 blocker 即算） ＋ 反击（真的挥出才算）
            if (currentFight.blocker) {
                applyEquipGrowth(
                    result.updatedFight.blocker, blkUnitId,
                    blockerStruck ? ['after_attacked', 'after_attack'] : ['after_attacked'],
                    'blocker',
                );
            }
            // ── [2026-09-25 莉莉子 任务化框架] 下列任务线**按设计只算我方**，故仍保留"我方"门（未随旁支①放开）──
            if (currentFight.owner === 'player' && result.updatedFight.attacker) {
                const atkAliveForQuest = isStrikeTargetAlive(result.updatedFight.attacker);
                // ① unit_attack＝本次打击本身 ② unit_kill＝本次打击击杀了单位（result.killedUnits 非空）
                if (atkAliveForQuest) {
                    runGearQuest(result.killedUnits.length > 0 ? ['unit_attack', 'unit_kill'] : 'unit_attack', [result.updatedFight.attacker]);
                }
                // ── [2026-09-25 莉莉子 任务化框架 · 武装线] 天启者打击 → 广播给 run 层记账 ──
                if (result.updatedFight.attacker?.isChampion) {
                    eventBus.emit(GameEvents.ROGUE_QUEST_EVENT, { event: 'hero_attack' });
                    if (result.nexusDamage && result.nexusDamage.target === 'enemy') {
                        eventBus.emit(GameEvents.ROGUE_QUEST_EVENT, { event: 'hero_hit_nexus' });
                    }
                }
            }
            if (currentFight.owner === 'enemy' && currentFight.blocker && result.updatedFight.blocker) {
                // [2026-09-25 莉莉子 任务化框架 · 装备线] 我方 blocker 挡下一次进攻 → 推进 card_block 任务（誓约之盾）
                //   语义：能站住接这一击 = 成功格挡一次（被打死的不算）
                if (isStrikeTargetAlive(result.updatedFight.blocker)) runGearQuest('card_block', [result.updatedFight.blocker]);
            }
            console.log(`[CombatDebug] 第${i+1}/${totalFights}路战斗结束: A=${result.updatedFight.attacker?.key}(HP=${result.updatedFight.attacker ? getHealth(result.updatedFight.attacker) : '—'} state=${result.updatedFight.attacker?.animState})` +
                ` B=${result.updatedFight.blocker?.key||'无'}(HP=${result.updatedFight.blocker ? getHealth(result.updatedFight.blocker) : '—'} state=${result.updatedFight.blocker?.animState||'—'})` +
                ` nexusDmg=${result.nexusDamage?.amount||0} killed=${result.killedUnits.map(u=>u.key).join(',')}`);

            // [关键修正] 战果已经排入 React 队列，现在安全发起广播！
            if (result.nexusDamage) {
                // [2026-09-02 莉莉子 修复] 固若金汤水晶坚韧：飘字 amount 同步实际伤害（下方 setGame 扣血已减 1；仅改飘字，内部目睹/强化只看 target）
                const combatNexusTough = result.nexusDamage.target === 'player' ? !!stateRef.current.game?.playerNexusTough : !!stateRef.current.game?.enemyNexusTough;
                // [2026-10-06 程拍板 · 审计收口] **免疫时飘字也归零** —— 不留"打了它却没掉血"的假数字
                const combatNexusImmune = isNexusImmune(stateRef.current.game, result.nexusDamage.target);
                const combatFinalAmount = combatNexusImmune ? 0 : (combatNexusTough ? Math.max(0, result.nexusDamage.amount - 1) : result.nexusDamage.amount);
                if (combatFinalAmount > 0) {
                    // [2026-10-07 莉莉子 · 打击感] 单位撞水晶补上分档震屏。
                    //   此前的力度感是反的：法术打水晶 → 全屏震；单位冲破防线撞上水晶 → 只有水晶自己抖 4px。
                    //   量级分档：≥5 重震 / ≥3 中震 / 其余轻震。
                    //   免疫 ⇒ combatFinalAmount 为 0 ⇒ 这里整个跳过，与"免疫时飘字也归零"同一口径（不留假反馈）。
                    triggerNexusShake(combatFinalAmount >= 5 ? 'lg' : combatFinalAmount >= 3 ? 'md' : 'sm');
                    eventBus.emit(GameEvents.NEXUS_STRIKED, { target: result.nexusDamage.target, amount: combatFinalAmount, fromCombat: true }); // [2026-09-19] 战斗已播水晶打击音，音效层据此跳过
                }

                // ==========================================
                // [修改] 埋点 C-3：肉搏战水晶伤害统计 (必定是进攻者打水晶)
                // 无论是空门直击还是碾压溢出，对水晶造成伤害的永远是发起冲锋的 Attacker
                // ==========================================
                const nexusSource = currentFight.attacker;
                // [2026-10-06 程拍板] 免疫 ⇒ **这一笔伤害根本没发生** ⇒ 也不计入召唤系伤害进度（猫汐尔）
                if (!combatNexusImmune && nexusSource && isSummonerOrSummon(nexusSource)) {
                    const nexusDmg = nexusSource.key === 'Soline_Anubis' ? result.nexusDamage.amount * 2 : result.nexusDamage.amount;
                    // [2026-10-06 · 旁支① A 方向] 打水晶的永远是发起冲锋的 attacker ⇒ 归属 = `currentFight.owner`
                    accumulateMauxirForSide(currentFight.owner === 'player' ? 'player' : 'enemy', nexusDmg);
                }
            }

            // ==========================================
            // [2026-09-15 莉莉子] 【吸血】Lifesteal —— 逻辑层实装
            // 语义：造成伤害的单位，为其所属方水晶回血（治疗量 = 本场战斗中它造成的总伤害）
            //   · 攻击者造成 = 对阻挡者的伤害 + 空门直击/碾压溢出打出的水晶伤害
            //   · 阻挡者造成 = 其反击伤害（被先攻秒杀未挥出反击时天然为 0）
            // 覆盖范围：敌我通用；单段与连击双段共用（DoubleStrikeCombatResult extends SingleCombatResult，
            //          两者的伤害字段均已是两击合计值，故一处即可覆盖）。
            // 仅逻辑层：复用既有 NEXUS_HEALED 事件与 playerNexusMax/enemyNexusMax 上限，无新增视觉代码。
            // 注：治疗量取原始伤害（不吃固若金汤水晶坚韧的 -1 减免），与「吸血=按其打出的伤害回复」语义一致。
            // ==========================================
            {
                const atkSide = currentFight.owner;
                const defSide: 'player' | 'enemy' = atkSide === 'player' ? 'enemy' : 'player';
                const atkDealt = (result.blockerDamage || 0)
                    + (result.nexusDamage && result.nexusDamage.target === defSide ? result.nexusDamage.amount : 0);
                const defDealt = result.attackerDamage || 0;

                const healNexus = (side: 'player' | 'enemy', amount: number) => {
                    if (amount <= 0) return;
                    setGame(prev => {
                        const max = side === 'player' ? (prev.playerNexusMax ?? 20) : (prev.enemyNexusMax ?? 20);
                        const cur = side === 'player' ? prev.playerNexus : prev.enemyNexus;
                        const next = Math.min(max, cur + amount);
                        if (next <= cur) return prev; // 已满或溢出 → 不写入
                        return side === 'player' ? { ...prev, playerNexus: next } : { ...prev, enemyNexus: next };
                    });
                    eventBus.emit(GameEvents.NEXUS_HEALED, { target: side, amount });
                };

                if (atkDealt > 0 && result.updatedFight.attacker?.keywords?.includes('Lifesteal')) {
                    healNexus(atkSide, atkDealt);
                }
                if (defDealt > 0 && result.updatedFight.blocker?.keywords?.includes('Lifesteal')) {
                    healNexus(defSide, defDealt);
                }
            }

            // ==========================================
            // [鬼怪小队] 埋点 E：首次打击水晶雷达
            // 检测当前进攻方是否首次打击敌方水晶，触发鬼怪效果
            // 每张卡用 customProgress bit 0 独立记账
            // 注意：同时处理玩家方和敌方的鬼怪小队，敌我判断用 side 变量统一管理
            // ==========================================
            const isPlayerStriking = result.nexusDamage && result.nexusDamage.target === 'enemy' && currentFight.owner === 'player';
            const isEnemyStriking = result.nexusDamage && result.nexusDamage.target === 'player' && currentFight.owner === 'enemy';

            if (isPlayerStriking || isEnemyStriking) {
                const side = isPlayerStriking ? 'player' : 'enemy';
                const nexusFallbackTarget = side === 'player' ? 'player_nexus' : 'enemy_nexus';

                // [2026-07-09 修复] 只检查打击水晶的那个攻击者自身，而非扫描全场
                const striker = currentFight.attacker;
                if (striker && striker.effects && striker.effects.length > 0 && !((striker.customProgress || 0) & 1)) {
                    striker.effects.forEach(effId => {
                        const def = EFFECT_DB[effId];
                        if (def && def.timing.includes('ON_FIRST_NEXUS_STRIKE')) {
                            console.log(`[GhostRadar][${side}] ${striker.name}(${striker.id.slice(0,6)}) 发动鬼怪效果: ${def.name}`);

                            const markTriggered = (c: CardData) => ({ ...c, customProgress: (c.customProgress || 0) | 1 });

                            // 标注攻击者已触发（它在 combatField 中）
                            setCombatField(prev => prev.map(fight => {
                                if (fight.attacker?.id === striker.id)
                                    return { ...fight, attacker: markTriggered(fight.attacker) };
                                return fight;
                            }));

                            // 收集友方单位作为效果目标池（排除已死亡单位）
                            const bench = side === 'player' ? stateRef.current.playerBench : stateRef.current.enemyBench;
                            const allies: CardData[] = [...bench];
                            if (stateRef.current.combatField) {
                                stateRef.current.combatField.forEach(fight => {
                                    if (fight.owner === side && fight.attacker) allies.push(fight.attacker);
                                    if (fight.owner !== side && fight.blocker) allies.push(fight.blocker);
                                });
                            }
                            // [2026-07-09 修复] 过滤掉已死亡的单位，防止"尸体回春"复活
                            const liveAllies = allies.filter(u =>
                                !u.isDead && u.animState !== 'dying' && u.animState !== 'ephemeral_dying'
                            );

                            let autoTargets: { type: string; id: string }[] = [];
                            const params = def.params;

                            if (params.targetFilter === 'RANDOM_ALLY') {
                                if (liveAllies.length > 0) {
                                    const pick = liveAllies[Math.floor(Math.random() * liveAllies.length)];
                                    autoTargets = [{ type: 'ally', id: pick.id }];
                                }
                            } else if (params.targetFilter === 'RANDOM_WOUNDED_ALLY') {
                                const wounded = liveAllies.filter(u => (u.damageTaken || 0) > 0);
                                if (wounded.length > 0) {
                                    const pick = wounded[Math.floor(Math.random() * wounded.length)];
                                    autoTargets = [{ type: 'ally', id: pick.id }];
                                } else if (params.nexusFallback) {
                                    autoTargets = [{ type: nexusFallbackTarget, id: nexusFallbackTarget }];
                                }
                            }

                            const ctx: EffectContext = {
                                game: stateRef.current.game,
                                playerBench: stateRef.current.playerBench,
                                enemyBench: stateRef.current.enemyBench,
                                playerHand: stateRef.current.playerHand,
                                enemyHand: stateRef.current.enemyHand,
                                playerDeck: stateRef.current.playerDeck,
                                enemyDeck: stateRef.current.enemyDeck,
                                combatField: stateRef.current.combatField,
                                owner: side,
                                sourceCard: striker
                            };

                            const res = processEffect(effId, autoTargets, ctx);
                            if (res.game) setGame(res.game);
                            if (res.playerBench) setPlayerBench(res.playerBench);
                            if (res.enemyBench) setEnemyBench(res.enemyBench);
                            if (res.combatField) setCombatField(res.combatField);
                            if (res.playerHand) setPlayerHand(res.playerHand);
                            if (res.playerDeck) setPlayerDeck(res.playerDeck);
                            relayEffectEvents(res.events); // [2026-09-19] 转发伤害事件（飘字 + 受击音都靠它）
                            res.events.forEach(evt => {
                                if (evt.type === 'nexus_heal') {
                                    eventBus.emit(GameEvents.NEXUS_HEALED, evt.payload);
                                }
                            });
                        }
                    });
                }
            }

            // ==========================================
            // [2026-07-14 锻造者] 蕾西亚：每次打击水晶雷达 (ON_NEXUS_STRIKE)
            // 与鬼怪不同，不设首次保护，每次打击水晶都触发
            // ==========================================
            if (isPlayerStriking || isEnemyStriking) {
                const side = isPlayerStriking ? 'player' : 'enemy';
                const striker = currentFight.attacker;
                if (striker && striker.effects && striker.effects.length > 0) {
                    striker.effects.forEach(effId => {
                        const def = EFFECT_DB[effId];
                        if (def && def.timing.includes('ON_NEXUS_STRIKE')) {
                            console.log(`[ForgerRadar][${side}] ${striker.name}(${striker.id.slice(0,6)}) 发动锻造者效果: ${def.name}`);
                            const ctx: EffectContext = {
                                game: stateRef.current.game,
                                playerBench: stateRef.current.playerBench,
                                enemyBench: stateRef.current.enemyBench,
                                playerHand: stateRef.current.playerHand,
                                enemyHand: stateRef.current.enemyHand,
                                playerDeck: stateRef.current.playerDeck,
                                enemyDeck: stateRef.current.enemyDeck,
                                combatField: stateRef.current.combatField,
                                owner: side,
                                sourceCard: striker
                            };
                            const res = processEffect(effId, [], ctx);
                            if (res.game) setGame(res.game);
                            if (res.playerHand) setPlayerHand(res.playerHand);
                            if (res.enemyHand) setEnemyHand(res.enemyHand);
                            // [2026-09-18 BUG修复] 补上备战席 / 交战区写回。
                            //   本块原为锻造者蕾西亚的「法术减费」所写，只动手牌，所以当时只写 hand 是够的。
                            //   夜视监察无人机的 damageBeaconBy 改的是【备战席】（信标站在备战席上），
                            //   此前结果被算出来却没写回 → 日志照打，信标血量纹丝不动。
                            if (res.playerBench) setPlayerBench(res.playerBench);
                            if (res.enemyBench) setEnemyBench(res.enemyBench);
                            if (res.combatField) setCombatField(res.combatField);
                            relayEffectEvents(res.events); // [2026-09-19] 转发伤害事件（飘字 + 受击音都靠它）
                            res.events.forEach(evt => {
                                if (evt.type === 'sfx_cost_reduce') {
                                    console.log(`[CostReduce] 减费事件: ${evt.payload.cardId} -${evt.payload.amount}`);
                                }
                            });
                        }
                    });
                }
            }

            // [修复] 给予微小缓冲期即可，删除违法的常量赋值操作！
            await wait(50);

            // ==========================================
            // [核心新增] 埋点 D：全场打击雷达扫网 (The Strike Effect Radar)
            // 分别让两名参与交锋的战士，去触发他们身上带有的 ON_ATTACK (打击时) 效果！
            // ==========================================
            const triggerStrikeEffects = (unit: CardData, myRole: 'attacker' | 'blocker') => {
                if (!unit || !unit.effects || unit.effects.length === 0) return;

                // 精准判定谁是盟友（从而抓取正确的手牌、牌库写回权）
                const side = (myRole === 'attacker' && currentFight.owner === 'player') ||
                             (myRole === 'blocker' && currentFight.owner === 'enemy')
                             ? 'player' : 'enemy';

                unit.effects.forEach(effId => {
                    const def = EFFECT_DB[effId];
                    // 核对暗号：只有符合‘打击时’契约的被动效果才能通关！
                    if (def && def.timing.includes('ON_ATTACK')) {
                        console.log(`[StrikeRadar] ${unit.name} 发动了打击效果: ${def.name}`);

                        const ctx: EffectContext = {
                            game: stateRef.current.game,
                            playerBench: stateRef.current.playerBench,
                            enemyBench: stateRef.current.enemyBench,
                            playerHand: stateRef.current.playerHand,
                            enemyHand: stateRef.current.enemyHand,
                            playerDeck: stateRef.current.playerDeck,
                            enemyDeck: stateRef.current.enemyDeck,
                            combatField: stateRef.current.combatField,
                            owner: side, // 注入正确的阵营所有权
                            sourceCard: unit // 本体挂载为扫描源，充当印钞机或复制器的坐标起航点
                        };

                        // 把任务无脑托管给中央处理器！
                        const res = processEffect(effId, [], ctx);

                        // 一次性同步更新工厂流转完产生的手牌、牌库与备战席资产
                        if (side === 'player') {
                            if (res.playerHand) setPlayerHand(res.playerHand);
                            if (res.playerDeck) setPlayerDeck(res.playerDeck);
                            if (res.playerBench) setPlayerBench(res.playerBench);
                        } else {
                            if (res.enemyHand) setEnemyHand(res.enemyHand);
                            if (res.enemyDeck) setEnemyDeckState(res.enemyDeck);
                            if (res.enemyBench) setEnemyBench(res.enemyBench);
                        }
                    }
                });
            };

            // 1. 让发起冲锋的攻击者执行打击事件
            triggerStrikeEffects(currentFight.attacker, 'attacker');
            // 2. 让坐镇防线的阻挡者（如果存在）执行打击事件
            if (currentFight.blocker) {
                triggerStrikeEffects(currentFight.blocker, 'blocker');
            }

            // 为了让批量结算后进入微队列的数据足够新鲜，在正式计算军功统计增量前给 React 一线渲染微隙
            await wait(20);

            // [新增] 计算本轮战斗的统计增量
            let statsDelta = { nexus: 0, uKilled: 0, hKilled: 0, hLevel: 0 };

            // 1. 水晶伤害
            if (result.nexusDamage && result.nexusDamage.target === 'enemy') {
                statsDelta.nexus = result.nexusDamage.amount;

                // [新增] 军功审计探针：记录对敌方水晶造成的伤害 (用于芬妮卡背等任务)
                const dmgSource = currentFight.owner === 'player' ? currentFight.attacker : currentFight.blocker;
                if (dmgSource) {
                    gameLogger.logEvent({ type: 'nexus_damage', turn: stateRef.current.game.round, isPlayerSide: true, sourceCardKey: dmgSource.key, amount: result.nexusDamage.amount });
                }
            }

            // 2. 击杀统计 (需判断死者归属)
            result.killedUnits.forEach(deadUnit => {
                // 在当前战场快照中查找死者的拥有者
                // 逻辑：如果是 'player' 发起的战斗，blocker 是 enemy；如果是 'enemy' 发起的，attacker 是 enemy
                const fight = stateRef.current.combatField.find(f => f.attacker.id === deadUnit.id || f.blocker?.id === deadUnit.id);
                if (fight) {
                    const isDeadUnitEnemy = fight.attacker.id === deadUnit.id
                        ? fight.owner === 'enemy'
                        : fight.owner === 'player'; // 如果死的是 blocker 且战斗是 player 发起的，那 blocker 就是 enemy

                    if (isDeadUnitEnemy) {
                        if (deadUnit.isChampion) statsDelta.hKilled++;
                        else statsDelta.uKilled++;
                    }
                }
            });

            // 3. 升级统计
            if (result.levelUpUpdate) {
                const card = result.levelUpUpdate;
                // 简单判断：如果当前触发升级的卡牌在战场上归属于 player (进攻或防守)
                const fight = stateRef.current.combatField.find(f => f.attacker.id === card.id || f.blocker?.id === card.id);
                const isPlayerCard = fight && (fight.attacker.id === card.id ? fight.owner === 'player' : fight.owner === 'enemy');

                if (isPlayerCard) {
                    statsDelta.hLevel++;
                }
            }

            // 更新水晶血量 & [新增] 更新统计数据
            if (result.nexusDamage || statsDelta.uKilled > 0 || statsDelta.hKilled > 0 || statsDelta.hLevel > 0) {
                const { target, amount } = result.nexusDamage || { target: 'none', amount: 0 };
                setGame(prev => {
                    // [2026-08-30 程拍板] 固若金汤坚韧：水晶受击伤害永久 -1（先于屏障应用）
                    // [2026-10-06 莉莉子 · 审计收口] **不死之身：水晶免疫任何伤害** —— 本站点是
                    //   "玩家普通进攻 / 碾压溢出"打水晶的**主战斗路径**，此前**完全没查免疫标记** ⇒
                    //   该 mythic 强化的核心机制（"玩家打不动，只能靠它每回合自扣 5 熬死"）形同虚设。
                    //   ⚠️ 唯一合法豁免是 NEXUS_SELF_DAMAGE（回合结束自扣，types.ts:294 明文）。
                    const nexusImmune = target === 'player' ? isNexusImmune(prev, 'player') : target === 'enemy' ? isNexusImmune(prev, 'enemy') : false;
                    const isNexusTough = target === 'player' ? !!prev.playerNexusTough : target === 'enemy' ? !!prev.enemyNexusTough : false;
                    const toughReduced = nexusImmune ? 0 : (isNexusTough ? Math.max(0, amount - 1) : amount);
                    // [2026-08-27] 固若金汤屏障先挡伤害（屏障值=可挡伤害总量，累积）
                    const barrier = target === 'player' ? (prev.playerNexusBarrier || 0) : target === 'enemy' ? (prev.enemyNexusBarrier || 0) : 0;
                    const blocked = Math.min(barrier, toughReduced);
                    return {
                        ...prev,
                        playerNexus: target === 'player' ? prev.playerNexus - (toughReduced - blocked) : prev.playerNexus,
                        enemyNexus: target === 'enemy' ? prev.enemyNexus - (toughReduced - blocked) : prev.enemyNexus,
                        playerNexusBarrier: target === 'player' ? barrier - blocked : prev.playerNexusBarrier,
                        enemyNexusBarrier: target === 'enemy' ? barrier - blocked : prev.enemyNexusBarrier,
                        nexusDamage: result.nexusDamage,
                        // [新增] 合并统计数据
                        stats: {
                            ...prev.stats,
                            nexusDamage: prev.stats.nexusDamage + statsDelta.nexus,
                            unitsKilled: prev.stats.unitsKilled + statsDelta.uKilled,
                            heroesKilled: prev.stats.heroesKilled + statsDelta.hKilled,
                            heroLevelUps: prev.stats.heroLevelUps + statsDelta.hLevel
                        }
                    };
                });
            } else if (result.nexusDamage)
            {
                const { target, amount } = result.nexusDamage;
                setGame(prev => {
                    // [2026-08-30 程拍板] 固若金汤坚韧：水晶受击伤害永久 -1（先于屏障应用）
                    // [2026-10-06 莉莉子 · 审计收口] **不死之身：水晶免疫任何伤害** —— 本站点是
                    //   "玩家普通进攻 / 碾压溢出"打水晶的**主战斗路径**，此前**完全没查免疫标记** ⇒
                    //   该 mythic 强化的核心机制（"玩家打不动，只能靠它每回合自扣 5 熬死"）形同虚设。
                    //   ⚠️ 唯一合法豁免是 NEXUS_SELF_DAMAGE（回合结束自扣，types.ts:294 明文）。
                    const nexusImmune = target === 'player' ? isNexusImmune(prev, 'player') : target === 'enemy' ? isNexusImmune(prev, 'enemy') : false;
                    const isNexusTough = target === 'player' ? !!prev.playerNexusTough : target === 'enemy' ? !!prev.enemyNexusTough : false;
                    const toughReduced = nexusImmune ? 0 : (isNexusTough ? Math.max(0, amount - 1) : amount);
                    // [2026-08-27] 固若金汤屏障先挡伤害（屏障值=可挡伤害总量，累积）
                    const barrier = target === 'player' ? (prev.playerNexusBarrier || 0) : target === 'enemy' ? (prev.enemyNexusBarrier || 0) : 0;
                    const blocked = Math.min(barrier, toughReduced);
                    return {
                        ...prev,
                        playerNexus: target === 'player' ? prev.playerNexus - (toughReduced - blocked) : prev.playerNexus,
                        enemyNexus: target === 'enemy' ? prev.enemyNexus - (toughReduced - blocked) : prev.enemyNexus,
                        playerNexusBarrier: target === 'player' ? barrier - blocked : prev.playerNexusBarrier,
                        enemyNexusBarrier: target === 'enemy' ? barrier - blocked : prev.enemyNexusBarrier,
                        nexusDamage: result.nexusDamage
                    };
                });
            }

            // 更新升级展示
            if (result.levelUpUpdate) {
                const leveledCard = result.levelUpUpdate;
                const heroKey = leveledCard.key;

                // [2026-09-13 莉莉子] 判定这次升级属于哪一方（用实例 id 反查），
                // 标记按方写入 —— 升级流程已改为按方判定，此处必须与之一致。
                const lvId = leveledCard.id;
                const lvOnPlayer =
                    stateRef.current.playerBench.some(c => c.id === lvId) ||
                    stateRef.current.playerHand.some(c => c.id === lvId) ||
                    stateRef.current.playerDeck.some(c => c.id === lvId) ||
                    stateRef.current.combatField.some(f => (f.owner === 'player' && f.attacker.id === lvId) ||
                                                           (f.owner === 'enemy' && f.blocker?.id === lvId));
                const lvSide: 'player' | 'enemy' = lvOnPlayer ? 'player' : 'enemy';

                // 1. 记录全场已升级英雄名单（markLeveledUp 同时维护全局 + 分阵营两套）
                setGame(prev => {
                    if (prev.leveledChampions.includes(heroKey) && isLeveledUpForSide(prev, lvSide, heroKey)) return prev;
                    const next = { ...prev };
                    markLeveledUp(next, lvSide, heroKey);
                    return next;
                });

                // 2. [核心拔除] 彻底删除所有的硬编码 await 延时循环，改为派发“排队券”！
                queueLevelUp(leveledCard);

                // [2026-09-09 莉莉子 修复] 战斗结算内的同名卡升级同样对齐 checkCardLevelUp，
                // 不再无条件连带手牌/牌库/备战席里未达条件(如 progress=0)的同 key Lv1 卜卜
                // （09-01 只修了 levelUpCard effect 的 upgradeFn，这里残留另一处旧连带逻辑）
                const upgradeList = (list: CardData[]) => {
                    return list.map(c => {
                        // 如果是该英雄、还没升级且满足升级条件
                        if (c.key === heroKey && c.level === 1
                            && checkCardLevelUp(c, stateRef.current.game.playerNexus, stateRef.current.game.enemyNexus)) {
                            return { ...getLeveledUpCard(c), id: c.id }; // 保持 ID，升级数据
                        }
                        return c;
                    });
                };
                setPlayerDeck(prev => upgradeList(prev));
                setPlayerHand(prev => upgradeList(prev));
                setPlayerBench(prev => upgradeList(prev)); // 备战席的其他同名卡也一起升级
            }
            await wait(600);
            setGame(prev => ({ ...prev, nexusDamage: undefined }));

            // ✨ [2026-07-16 达努·班西] 每路战斗后立即处理微队列中的受伤事件
            // 让班西等单位的 ON_DAMAGE_SURVIVE 在当前碰撞后即时触发，不等整个战斗轮次结束
            flushMicroQueue();

            await wait(30); // 给 React 同步 stateRef，确保下一路战斗读到最新状态

            // [2026-09-18 BUG修复] 每路战斗后也要判一次生死 ——
            //   此前整轮只在循环开头判一次，战斗中被打死的单位（如獠牙信标）亡语会被拖到很晚：
            //   程实测「第 1 路打爆信标，直到第 3 路才炸」。
            //   ⚠️ 必须放在上面的 await wait(30) **之后**：judgeLifeAndDeath 读 stateRef.current，
            //      而那个 await 才是让 React 把本路结果同步进 stateRef 的时机；放前面会读到上一路的状态。
            //   judgeLifeAndDeath 是幂等的（`if (c.isDead) return c` 已宣判即跳过），重复调用安全；
            //   它的亡语分支是同步 processEffect，所以在这里调用 = 亡语当场结算。
            judgeLifeAndDeath();

            // ==========================================
            // [2026-10-03 莉莉子 · A] **每一路战斗后都刹车等升级播完**
            //   程拍板：「升级影片可以在战斗演出期间插播，而且会**暂停当前的战斗演出**，
            //   直到天启者升级动画（包括影片）完整播放完毕，再接着播放战斗演出。」
            //   旧实现把刹车片放在**整场战斗的末尾**（循环外）⇒ 中途达成的升级要等所有对战打完，
            //   正好就是程说的"要等战场所有对战结束…才播放升级动画升级"。
            //   ⇒ 现在挪进循环内：本路结算（含上面刚判的亡语/升级）后立刻刹车，播完再进下一路。
            // ==========================================
            await awaitLevelUpDrain('resolveCombatAnimation:每路战斗后', levelUpBudget);
        }

        // 3. 战斗结束清理
        // [核心修正] 获取当前战场快照，动态计算清场等待时间，确保死亡动画能完整播完！
        const fieldForDeathCheck = stateRef.current.combatField;

        const hasEphemeralDeathInCombat = fieldForDeathCheck.some(f =>
            f.attacker.animState === 'ephemeral_dying' || f.blocker?.animState === 'ephemeral_dying'
        );
        const hasNormalDeathInCombat = fieldForDeathCheck.some(f =>
            f.attacker.animState === 'dying' || f.blocker?.animState === 'dying'
        );

        let cleanupWaitTime = 500;
        if (hasEphemeralDeathInCombat) {
            cleanupWaitTime = 2500;
        } else if (hasNormalDeathInCombat) {
            cleanupWaitTime = 1200;
        }

        await wait(cleanupWaitTime);

        // 👇 [新增] 在踩下刹车之前，主循环亲自收网！清空微队列
        const isQueueProcessed = flushMicroQueue();
        if (isQueueProcessed) {
            // 给 React 留下 50ms 的微小渲染窗口，确保 setGame 的结果能够同步到后面的 stateRef 中
            await wait(50);
        }

        // ==========================================
        // [核心修正：终极刹车片]
        // 任何机制导致的升级，都会体现为 pendingLevelUps 队列中有号或 levelUpCard 正在播放。
        // 主程序在此必须死锁挂起，绝对不准摧毁交战区 DOM，给足 UI 部门抓取物理卡牌演出的时间！
        // ==========================================
        // [2026-10-03 莉莉子 · 收口] 抽成共用函数 `awaitLevelUpDrain`（原先这段在 useGameState 与
        //   useSpellSystem 各抄了一份）⇒ 以后"等升级播完"只有一处实现。
        await awaitLevelUpDrain('resolveCombatAnimation:整场收尾', levelUpBudget);

        // ✨ [2026-07-16] 等待 BUFF 特效动画播放完毕再归位
        if (stateRef.current.combatField.some(f =>
            f.attacker.animState === 'buff' || f.blocker?.animState === 'buff'
        )) {
            await wait(600);
        }

        // [极其关键] 动画可能播了很久，在此期间监听器（如卜卜）可能已经把 2 级卡牌替换到了 stateRef 中。
        // 必须重新抓取最新鲜的战场快照，防止把旧的 1 级卡牌错误地移回备战席！
        const finalField = stateRef.current.combatField;

        // 收集幸存者 (逻辑同前，从最新的 finalField 中筛选)
        const survivorsP: CardData[] = [];
        const survivorsE: CardData[] = [];
        console.log(`[CombatDebug] 幸存者收集: finalField.length=${finalField.length}`, finalField.map((f:any) =>
            `A:${f.attacker?.key}(state=${f.attacker?.animState}) B:${f.blocker?.key||'无'}(state=${f.blocker?.animState||'—'})`
        ));

        finalField.forEach(f => {
            // [2026-10-05 莉莉子 BUG修复 · 20261005-03] 【无法攻击】账本收尾 → 统一走唯一出口
            //   · 幸存者：带真实面板回归备战席
            //   · 战死者：只销账（还原值不用 —— 尸体照样按阵亡处理），账本绝不能留
            const processCantAttack = (unit: CardData, isSurvivor: boolean): CardData => {
                if (!(unit.keywords || []).includes('CantAttack')) return unit;
                const restored = restoreCantAttackPower(unit);
                return isSurvivor ? restored : unit;
            };

            // [关键修复] 严防死守：普通死亡和瞬息死亡都绝对不能进入幸存者名单！
            if (f.attacker.animState !== 'dying' && f.attacker.animState !== 'ephemeral_dying') {
                let unit: CardData = { ...f.attacker, animState: 'idle' as const }; // [2026-08-27] 标注类型防窄推断
                unit = processCantAttack(unit as any, true); // [修复] 恢复 CantAttack
                if (f.owner === 'player') survivorsP.push(unit as any);
                else survivorsE.push(unit as any);
            } else {
                processCantAttack(f.attacker, false); // [清理] 战死者销户
            }

            if (f.blocker) {
                if (f.blocker.animState !== 'dying' && f.blocker.animState !== 'ephemeral_dying') {
                    let unit: CardData = { ...f.blocker, animState: 'idle' as const }; // [2026-08-27] 标注类型防窄推断
                    unit = processCantAttack(unit as any, true); // [修复] 恢复 CantAttack
                    if (f.owner === 'player') survivorsE.push(unit as any);
                    else survivorsP.push(unit as any);
                } else {
                    processCantAttack(f.blocker, false); // [清理] 战死者销户
                }
            }
        });

        // ==========================================
        // ✨ [2026-07-16 达努·银臂] POST_COMBAT 时序 — 战斗结算后触发
        // 扫描全场有 POST_COMBAT 效果的单位，对幸存者应用 buff
        // ==========================================
        const processPostCombatEffects = (side: 'player' | 'enemy', survivors: CardData[]): CardData[] => {
            if (survivors.length === 0) return survivors;

            // 收集该方所有单位（备战席 + 交战区中己方单位）
            const bench = side === 'player' ? stateRef.current.playerBench : stateRef.current.enemyBench;
            const combatUnits: CardData[] = [];
            stateRef.current.combatField.forEach(fight => {
                if (fight.attacker && fight.owner === side) combatUnits.push(fight.attacker);
                if (fight.blocker && fight.owner !== side) combatUnits.push(fight.blocker);
            });

            const allUnits = [...bench, ...combatUnits];
            let buffed = [...survivors];

            allUnits.forEach(unit => {
                if (!unit.effects) return;
                unit.effects.forEach(effId => {
                    const def = EFFECT_DB[effId];
                    if (def && def.timing === 'POST_COMBAT') {
                        const params = def.params as any;
                        const power = params.power || 0;
                        const health = params.health || 0;
                        const keywords = params.keywords || []; // [2026-08-27] 去掉 string[] 标注，避免合并后类型与 Keyword[] 冲突

                        // [2026-07-16] 首次进攻限制：银臂的战后buff仅首次进攻触发
                        if (params.firstAttackOnly && unit.customProgress !== 1) {
                            console.log(`[PostCombat] ${unit.name} 的 POST_COMBAT 效果跳过（非首次进攻，customProgress=${unit.customProgress}）`);
                            return;
                        }

                        buffed = buffed.map(c => ({
                            ...c,
                            buffs: {
                                power: (c.buffs?.power || 0) + power,
                                health: (c.buffs?.health || 0) + health
                            },
                            keywords: Array.from(new Set([...c.keywords, ...keywords])),
                            animState: 'buff' as const
                        }));

                        // [2026-07-16] 若效果源是首次进攻单位（银臂），标记 customProgress→2
                        if (params.firstAttackOnly && unit.onAttackSpell && unit.customProgress === 1) {
                            buffed = buffed.map(c =>
                                c.id === unit.id ? { ...c, customProgress: 2 } : c
                            );
                            console.log(`[PostCombat] ${unit.name} 首次进攻buff已结算完毕，customProgress→2`);
                        }

                        console.log(`[PostCombat] ${unit.name} 的 POST_COMBAT 效果已触发，已为 ${survivors.length} 个幸存者添加 buff`);
                    }
                });
            });

            return buffed;
        };

        const buffedSurvivorsP = processPostCombatEffects('player', survivorsP);
        const buffedSurvivorsE = processPostCombatEffects('enemy', survivorsE);

        // [剥离裁判权] 胜负判定已交由全局的”智能裁判(useEffect)”处理，确保多单位进攻时能爽快地鞭尸！

        // 归位
        // =====================================
        // [2026-10-05 莉莉子 BUG修复 · 20261005-15] **标识结算必须读"本次战斗的快照"，不能读 stateRef**
        // ── 症状（程实测）：仅卜卜进攻时进攻标识**不被消耗** ⇒ 可以无限进攻。
        // ── 病根：下面这个 `setGame(prev => …)` 的**回调被 React 延迟到渲染时才执行**，
        //     而本函数末尾（战斗收尾 `:4188/:4204`）会**同步**执行 `setCombatField([])` 与
        //     `stateRef.current.combatField = []`（2026-10-05 为修「归零还原」加的手动同步）
        //     ⇒ 等回调真正跑时 `stateRef.current.combatField` **已是空数组**
        //     ⇒ `attackerOwner = null` ⇒ **"消耗标识"整段被跳过** ⇒ 标识留着 ⇒ 同一回合可反复进攻。
        // ── 修法：在**清空之前**先抓一份参战快照，回调里只读快照（数组元素本身没被改动，取引用即可）。
        // =====================================
        const combatSnapshotForSettle = [...stateRef.current.combatField];
        setGame(prev => {
            // [修正] 战斗后只消耗发起进攻一方的 Token
            const currentFights = combatSnapshotForSettle;
            const attackerOwner = currentFights.length > 0 ? currentFights[0].owner : null;

            const nextAttackToken = { ...prev.attackToken };
            // [2026-08-19 莉莉子 BUG修复] 「额外攻击」标记：不消耗进攻权 → 回合不翻转
            // [2026-09-26 T17 猎影标记] 例外从「全是飞剑」扩大为「全是额外攻击」：
            //   飞剑（如常）或交战线带 `isExtraAttack`（法术装配的额外攻击）。
            //   ⚠️ `every` 的语义正是「本次结算**没有**任何常规进攻」—— 混合场景（本回合的常规进攻
            //      与额外攻击落进同一场结算）会照常消耗标识，这才是对的。
            //   ⚠️ 标识原本为 null 时不「恢复」⇒ 不会凭空白送一个进攻权。
            let keepAttackInitiative = false;
            let scoutUsed = false; // [2026-10-03] 本次结算是否用掉了「侦察·每回合首次」→ 折进返回对象统一落库
            // [2026-10-06 独立审查修复 · 序号泄漏] 本次结算要落库的**授予账本**。
            //   ⚠️ 旧写法（我刚写的那版）只把 `granted.attackToken` 抄回来，**`tokenGrantSeq` 被丢弃** ⇒
            //      账本永远看不到这次授予 ⇒ 检测器不发、块 B 又只管 normal ⇒ **0 次派发**
            //      —— 正是程报的那条（格挡回合侦察给标识 → 安卡不给月轮）。
            const tokenGrantSeqOut = { player: 0, enemy: 0, ...(prev.tokenGrantSeq ?? {}) };
            if (attackerOwner) {
                const allExtraAttacks = currentFights.every(f =>
                    f.attacker?.key === 'Acacia_Flying_Sword' || f.attacker?.key === 'Acacia_Great_Sword'
                    || !!f.isExtraAttack
                );
                // ==========================================
                // [2026-10-03 莉莉子 · 进攻标识三层分离 ③④]
                //   ③ 额外攻击（飞剑 / 猎影标记 / 丁型异化人）：**不消耗**标识 → 保留原样、且**不新增**
                //   ④ 侦察（`Scout`：每回合首次仅用侦察单位进攻 ⇒ 进攻后再获得一次进攻机会）：
                //      · **额外攻击也算"使用侦察单位进攻"** ⇒ 同样能触发（R4，程 2026-10-03 拍板）
                //      · 「每回合首次」改用**显式标记** `scoutUsedThisRound`，不再拿 token 值当代理指标
                //        （老实现判 `token === 'normal'` ⇒ 备战把 token 改写成 `rally` 后，
                //          侦察的额外机会会被**误判成"已用过"而吞掉**）
                // ==========================================
                const allScout = currentFights.every(f => f.attacker?.keywords?.includes('Scout'));
                const scoutFresh = allScout && !stateRef.current.game.scoutUsedThisRound?.[attackerOwner];
                scoutUsed = scoutFresh; // 交给下方返回对象落库（⚠️ 不可在 updater 内再调 setState）
                // =====================================
                // [2026-10-05 莉莉子 · BUG 取证日志]（查完可删）
                //   程实测：**仅卜卜进攻时进攻标识不被消耗 ⇒ 可无限进攻**
                //   本行把"标识结算"的输入与判定一次性打出来，复现一次即可定案：
                //     参战条数 / 各条 key+是否额外攻击 / allExtraAttacks / allScout / 消耗前后的标识
                console.log(`[AttackTokenSettle] 参战=${currentFights.length} [${currentFights.map(f => `${f.attacker?.key}${f.isExtraAttack ? '(extra)' : ''}`).join(' | ')}] allExtra=${allExtraAttacks} allScout=${allScout} scoutFresh=${scoutFresh} tokenBefore=${prev.attackToken[attackerOwner] ?? 'null'}`);
                // =====================================
                if (allExtraAttacks) {
                    keepAttackInitiative = true; // [修复] 额外攻击：保留进攻权 → 攻击方继续行动
                    // 额外攻击：保留进攻标识不变
                    console.log(`[额外攻击] 本次结算全为额外攻击（飞剑/猎影标记/异化人），保留进攻标识 ${nextAttackToken[attackerOwner]}`);
                    if (scoutFresh) {
                        const granted = grantExtraAttackTurn({ ...prev, attackToken: nextAttackToken }, attackerOwner, '额外攻击·侦察');
                        nextAttackToken.player = granted.attackToken.player;
                        nextAttackToken.enemy = granted.attackToken.enemy;
                        // [审查修复] 授予序号一并带回（否则这次授予对账本不可见）
                        if (granted.tokenGrantSeq) {
                            tokenGrantSeqOut.player = granted.tokenGrantSeq.player;
                            tokenGrantSeqOut.enemy = granted.tokenGrantSeq.enemy;
                        }
                    }
                } else {
                    // 正常战斗：消耗进攻标识
                    if (scoutFresh) {
                        const granted = grantExtraAttackTurn({ ...prev, attackToken: nextAttackToken }, attackerOwner, '侦察');
                        nextAttackToken.player = granted.attackToken.player;
                        nextAttackToken.enemy = granted.attackToken.enemy;
                        // [审查修复] 同上：这是**程报的那条**路径（侦察给标识），序号绝不能丢
                        if (granted.tokenGrantSeq) {
                            tokenGrantSeqOut.player = granted.tokenGrantSeq.player;
                            tokenGrantSeqOut.enemy = granted.tokenGrantSeq.enemy;
                        }
                    } else {
                        nextAttackToken[attackerOwner] = null;
                    }
                }
            }

            // [核心新增] 结算并下发战斗中因词条触发的【备战】(Rally) 令牌
            // [2026-10-06 程拍板 · 序号去重] 这是**绕过唯一出口**（`grantExtraAttackTurn`）的另一处 rally 写入
            //   ⇒ 也要打授予序号；否则"战斗中因词条触发的备战"不会派发 ON_GET_ATTACK_TOKEN（安卡不给月轮）。
            // [2026-10-06 独立审查修复] 与唯一出口**同口径**：**已有标识 ⇒ 不算"获得"** ——
            //   ① 不改写类型（旧的无条件写 `'rally'` 会把 `'normal'` 覆盖掉，正是 10-03「三层分离①」
            //      要根治的"污染侦察判据"）；② 不打序号（没有"获得时"可触发，否则会二次派发）。
            ralliedOwners.forEach(owner => {
                if (nextAttackToken[owner]) return; // 已持标识 ⇒ 既不改写、也不计数
                nextAttackToken[owner] = 'rally';
                tokenGrantSeqOut[owner] = (tokenGrantSeqOut[owner] ?? 0) + 1;
            });

            return {
                ...prev,
                // [关键] 只要这里将 phase 切回 'main'
                // 外面挂载的智能裁判就会瞬间苏醒并介入吹哨！
                phase: 'main',
                // [2026-09-03 莉莉子 双剑兼容修复] 归位行动权仲裁不再用"消耗前玩家是否持剑"猜"谁刚进攻完"。
                // 旧单剑假设在敌我双持 rally 剑、且逆序进攻（敌方先攻、玩家 normal 剑未耗）时，
                // 会把行动权误判给"剑刚耗空的敌方"，导致敌方连动、玩家持剑被悬空。
                // 新规则：仍持剑方优先行动（scout normal→rally 连攻 / 战斗 rally 回授 / 飞剑不耗剑延续），
                // 否则常规让渡给进攻方对手（含双方均无剑情形）。
                turnOwner: (() => {
                    if (!attackerOwner) return prev.attackToken.player ? 'enemy' : 'player'; // 空场兜底沿用旧式
                    const otherSide = attackerOwner === 'player' ? 'enemy' : 'player';
                    if (keepAttackInitiative) return attackerOwner === 'player' ? 'player' : 'enemy'; // 额外攻击不耗剑→攻击方继续
                    if (nextAttackToken[attackerOwner]) return attackerOwner === 'player' ? 'player' : 'enemy'; // 攻击方仍持剑→连攻
                    return otherSide; // 对方仍持剑→对方；双方无剑→常规让渡进攻方对手
                })(),
                attackToken: nextAttackToken,
                // [2026-10-06 程拍板 · 序号去重] 本次结算产生的授予序号（侦察 / 额外攻击·侦察 / 战斗备战）
                tokenGrantSeq: tokenGrantSeqOut,
                // [2026-10-03 莉莉子 · ④] 侦察「每回合首次」标记落库（回合边界由 calculateRoundStart 清零）
                ...(scoutUsed && attackerOwner
                    ? { scoutUsedThisRound: { ...(prev.scoutUsedThisRound ?? { player: false, enemy: false }), [attackerOwner]: true } }
                    : {}),
                consecutivePasses: 0,
                lastActionTimestamp: Date.now()
            };
        });

        // [LILITH-DEBUG] 镜爻卜卜复制排查：幸存者里有没有镜爻卜卜被挪回备战席
        const mirP = buffedSurvivorsP.filter((s: any) => s.key === 'Mirror_pupu');
        const mirE = buffedSurvivorsE.filter((s: any) => s.key === 'Mirror_pupu');
        if (mirP.length > 0 || mirE.length > 0) {
            console.log(`[LILITH-DEBUG][SURVIVOR] 镜爻卜卜作为幸存者回归备战席! P=${mirP.length} E=${mirE.length}`);
        }

        // [2026-10-06 莉莉子 BUG修复 · BUG-20261006-01] **归位这一刻必须再贴一次值**：
        //   猫汐尔本人在交战区打完回来时，带回来的是**交战区那份实例**，
        //   它的 `mauxirDamage` 镜像可能还是旧的 ⇒ 不贴这一次，进度就会一直停在旧值
        //   （旧实现里这一笔是**永久丢失**：交战区从不被扫 + 归位覆盖回旧实例）。
        setPlayerBench(prev => applyMauxirProgress([...prev, ...buffedSurvivorsP], 'player') as CardData[]);
        setEnemyBench(prev => applyMauxirProgress([...prev, ...buffedSurvivorsE], 'enemy') as CardData[]);
        setCombatField([]);

        // =====================================
        // [2026-10-05 莉莉子 BUG修复 · 20261005-03] **归位后立刻手动同步 stateRef**（本条 BUG 的根因位）
        // ── 病根：上面三句 setState 是**异步入队**，而外层 `resolveCombatAnimation` 的 `finally`
        //    紧接着**同步**执行、靠 `stateRef.current.game.phase === 'animating'` 判断"要不要应急归位"。
        //    那一刻 stateRef 还是**提交前**的旧快照（phase=animating、交战区还挂着整场人）
        //    ⇒ 应急归位**每次战斗都会触发**：`recoverCombatSurvivors` 拿旧交战区里的卡片对象
        //    （【无法攻击】单位是**已归零**的那一份）覆盖式写回备战席
        //    —— 其 `filter(去掉同 id) + append` 恰好把刚刚还原好的幸存者按 id 顶掉
        //    ⇒「攻击力还原」被静默抹回 0（程实测：基座主动进攻 → 结算完成 → 回备战席仍是 0）。
        //    ⚠️ 顺带被抹掉的还有战斗中产生的面板变化（POST_COMBAT buff 等），同源。
        // ── 修法就是项目里既有的惯例：**手动同步 stateRef**（与 resolveChoice 那处同类注释一致）。
        //    只同步 finally 判定所需的两项，最小改动面。
        // =====================================
        stateRef.current.game = { ...stateRef.current.game, phase: 'main' as const };
        stateRef.current.combatField = [];
    };

    // ==========================================
    // [2026-09-03 莉莉子 死锁逃生] resolveCombatAnimation 外层守卫
    // 内部 run 一旦中途异常（for 循环内大量 processEffect/resolveSingleCombat 等同步调用，
    // 原本无任何异常保护），phase 会永久停在 animating、交战区单位永不归位 → 对局死锁。
    // 外层包 try/catch/finally：异常时执行应急归位 + phase 兜底回 main。
    // 正常路径 run 尾部已把 phase 写回 main 并 setCombatField([])，finally 读到非 animating 即空转。
    // ==========================================
    const resolveCombatAnimation = async () => {
        bumpAnimProgress();
        setGame(prev => ({ ...prev, phase: 'animating' as const }));
        try {
            await runResolveCombatAnimation();
        } catch (err) {
            console.error('[resolveCombatAnimation] 💥 异常，执行应急归位', err);
            emergencyUnstickCombat();
        } finally {
            bumpAnimProgress();
            if (stateRef.current.game.phase === 'animating') {
                console.warn('[resolveCombatAnimation] ⚠️ 尾部仍 animating，应急归位兜底');
                emergencyUnstickCombat();
            }
        }
    };


    const playCard = (card: CardData, owner: 'player' | 'enemy', targets: any[] = []) => {
        // [新增 极强防御] 记录进入动画前的真实阶段
        const originalPhase = stateRef.current.game.phase;

        if (owner === 'player') {
            const { playerMana, playerSpellMana, playerMaxMana } = stateRef.current.game;
            // [2026-07-10 诗人] 凯特琳减费影响实际扣费
            const actualCost = getEffectiveSpellCost(card, playerBench, playerMaxMana);
            if (!canAfford(card, playerMana, playerSpellMana, actualCost)) {
                setMessage("法力不足！");
                return;
            }
            // [新增] 法术堆栈非空时，只能打出法术响应，不能出单位
            if (stateRef.current.game.spellStack.length > 0 && card.type.includes('unit')) {
                setMessage("法术响应中，无法打出单位！");
                return;
            }
            // [2026-07-16 修复] 战斗阶段不能打出单位卡牌（安全兜底）
            // [2026-07-27 莉莉子] 战斗阶段也不能打出慢速法术
            const isCombatPhase = stateRef.current.game.phase === 'attack_declare' || stateRef.current.game.phase === 'block_declare' || stateRef.current.game.phase === 'react_to_block';
            if (isCombatPhase) {
                if (card.type.includes('unit')) {
                    setMessage("战斗阶段无法打出单位！");
                    return;
                }
                if (card.type === 'spell-slow') {
                    setMessage("战斗阶段无法施放慢速法术！");
                    return;
                }
            }
            // [2026-10-02 莉莉子 BUG修复] 慢速法术的**回合归属**缺失 ⇒ 越权施放。
            //   病根：原守卫只查「是不是战斗阶段」，没查「是不是自己的回合」。
            //   于是玩家可以在**对方的回合主阶段**打出慢速法术，甚至能在对方打出快速/慢速法术、
            //   堆栈还没结算时跟着甩一张慢速法术 —— 与「极速 > 快速 > 慢速」的时序设计相悖。
            //   粉丝原话：「慢速只能在自己回合用」/「你这慢速法术就是可以跟对面的慢速法术一起用的」/
            //             「我甚至能在对面放快速法术的时候放慢速法术」。
            //   ⚠️ 本守卫位于 `owner === 'player'` 分支内，AI（enemy）施法路径不受影响。
            if (card.type === 'spell-slow') {
                if (stateRef.current.game.turnOwner !== owner) {
                    setMessage("慢速法术只能在自己回合施放！");
                    return;
                }
                if (stateRef.current.game.spellStack.length > 0) {
                    setMessage("法术响应中，无法施放慢速法术！");
                    return;
                }
            }
        }

        // [底层重构] 英雄法术不再进行静默转换，而是统一进入抉择流程
        // [修正] 只有带 choices 的抉择法术才走抉择流程，支援技（无 choices）不触发
        // [2026-08-05 莉莉子 法术13] 放宽：普通法术（无 associatedChampionKey）带 choices 也可抉择
        if (card.choices && card.choices.length > 0) {
            const champKey = card.associatedChampionKey ?? '';
            // [2026-08-16 莉莉子] champKey 兜底 '' 避免 string | undefined 传参（TS2345）
            const champBench = owner === 'player' ? playerBench : enemyBench;
            // [修复] 三重判定：备战席 + 交战区 + 全局升级记录
            const champCombat = combatField.some(f =>
                f.owner === owner && f.attacker.key === champKey && f.attacker.level === 2
            );
            const hasLv2 = champBench.some(c => c.key === champKey && c.level === 2)
                || champCombat
                // [2026-10-04 莉莉子 BUG修复 · I5] 按方判定：原先读全局 `leveledChampions`
                //   ⇒ 镜像对局里"敌方英雄练到 Lv2"会把我方同名英雄法术的大招一并解锁（跨侧泄漏）
                || isLeveledUpForSide(stateRef.current.game, owner, champKey);

            // [修改 1：拔剑留鞘修复] 在弹窗瞬间，立刻把这张 0 费英雄法术从手牌里没收暂存！
            if (owner === 'player') {
                setPlayerHand(prev => prev.filter(c => c.id !== card.id));
            } else {
                setEnemyHand(prev => prev.filter(c => c.id !== card.id));
            }

            setGame(prev => ({
                ...prev,
                activeCard: card,
                spellCasting: {
                    cardId: card.id,
                    step: 'choose_mode',
                    targets: [],
                    isHeroLeveled: hasLv2, // [关键] 告知 UI 英雄是否已升级，用于锁定大招显示
                    // [2026-10-02 莉莉子 BUG修复] 显式记录抉择归属方。
                    //   此前 UI 用 `turnOwner === 'enemy'` 猜"这是不是 AI 的抉择"，
                    //   而玩家可在对方优先权阶段（如玩家进攻→格挡阶段）打出极速抉择法术，
                    //   导致玩家自己的弹窗被锁死（点不动/取消不掉）⇒ 卡死。
                    choiceOwner: owner
                }
            }));
            setMessage(hasLv2 ? "请选择要施放的法术模式" : "选择法术施放（升级后可解锁大招）");
            return;
        }

        // [新增] 触发语音事件
        // 1. 播放登场语音 (PLAY_CARD_VOICE)
        if (card.type.includes('unit')) {
            // 1. 播放自身登场语音
            eventBus.emit(GameEvents.PLAY_CARD_VOICE, card);

            // 2. 敌人出现判定 (ENEMY_SPAWN)
            // 条件：敌方打出 + 本回合第一张单位 + 我方备战席有英雄
            if (owner === 'enemy') {
                enemyUnitsPlayedRef.current += 1;

                if (enemyUnitsPlayedRef.current === 1) {
                    const hasPlayerHero = stateRef.current.playerBench.some(c => c.isChampion);
                    if (hasPlayerHero) {
                        // 稍微延迟一点触发，让它排在登场语音之后进入队列
                        setTimeout(() => {
                            eventBus.emit(GameEvents.ENEMY_SPAWN, card);
                        }, 200);
                    }
                }
            }
        }

        // 2. 敌人出现判定 (ENEMY_SPAWN)
        // 如果是敌方出牌，且敌方备战席之前是空的，触发互动语音
        if (owner === 'enemy' && enemyBench.length === 0 && card.type.includes('unit')) {
            eventBus.emit(GameEvents.ENEMY_SPAWN, card);
        }

        // --- 扣费与手牌移除逻辑 ---
        const isUnit = card.type.includes('unit');

        // 修复：双重扣费BUG
        // 只有【单位卡】在这里立即扣费并更新状态。
        if (isUnit) {
            // [2026-10-04 莉莉子 · AI 停机保护性修复 · P6] 原用**闭包里的 game** 取法力，而调用方
            //   （AI 侧）可能持有 1.5s 前的 game/actions 快照 ⇒ 这期间新涨的法力会被下面那句
            //   绝对赋值 `Math.min(maxMana, newMana)` 直接覆盖掉（AI 静默少费 / 多扣）。
            //   改为读 stateRef 里的最新快照 ⇒ **跨 commit 的陈旧**被消除。
            //   ⚠️ 但这仍是"在 updater 之外算好的绝对值"（2026-10-04 独立审查 #13）：
            //      同一批次里若还有别的法力写入，仍会被这一句覆盖；且 stateRef 本身由 effect 刷新，
            //      也不是严格意义的"当下真值"。彻底根治要把计算挪进 updater —— 属更大改动，本次不做，
            //      已记入 技术手册/现状-敌人AI停机排查 的缺口表。
            const manaNow = stateRef.current.game;
            const { newMana, newSpellMana } = calculateNewMana(
                card.cost,
                owner === 'player' ? manaNow.playerMana : manaNow.enemyMana,
                owner === 'player' ? manaNow.playerSpellMana : manaNow.enemySpellMana,
                true // isUnit = true
            );

            // 只有单位才在这里扣费
            setGame(prev => {
                const maxMana = owner === 'player' ? prev.playerMaxMana : prev.enemyMaxMana;
                return owner === 'player'
                    ? { ...prev, playerMana: Math.min(maxMana, newMana), playerSpellMana: Math.min(3, newSpellMana) }
                    : { ...prev, enemyMana: Math.min(maxMana, newMana), enemySpellMana: Math.min(3, newSpellMana) };
            });
        }

        // 无论单位还是法术，都要从手牌移除
        if (owner === 'player') setPlayerHand(prev => prev.filter(c => c.id !== card.id));
        else setEnemyHand(prev => prev.filter(c => c.id !== card.id));

        // ================================================
        // [核心模式] 打出拦截分支 — step 选择模式
        // ================================================
        // 规律：每个选择模式都在这里拦截 return，不走后面的上场/动画流程
        // 前置条件：扣费(2250) + 移除手牌(2272) 已完成
        //
        // 新增一个选择模式需要在以下 11 处同步接入：
        //   GameSession.tsx:
        //     ① 状态同步枢纽    (~392)  startCasting(card, true)
        //     ② spellState.isCasting (~1627) 排除（不触发法术覆盖层）
        //     ③ spellState.hasPendingSpell (~1628) 加入（触发确认按钮）
        //     ④ showMousePreview (~1743) 瞄准线鼠标跟随
        //     ⑤ onConfirmPendingSpell (~1644) 确认按钮路由
        //     ⑥ 中间卡牌点击取消 (~2004) 路由到 cancelPendingSpell
        //     ⑦ 渲染分支 (~2035) 卡牌渲染 vs 法术圆盘
        //     ⑧ 通用打出动画排除 (~1917)
        //   useGameState.ts:
        //     ⑨ confirmXxx 函数（如 confirmReplacePlay）
        //   useSpellSystem.ts:
        //     ⑩ cancelChoice 增加 step 处理（退卡退费）
        //     ⑪ cancelPendingSpell 增加 step 路由
        // ================================================
        // 已实现: select_discard(瓦莱莉) | select_hand_target(白猎) | select_bench(替换)
        // 未来占位: select_enemy_bench | select_enemy_hand
        // ================================================

        // [2026-07-09 瓦莱莉] 打出后进入弃牌选择模式（玩家侧），不直接上场
        if (owner === 'player' && card.key === 'Bridget_Squad_Valerie') {
            setGame(prev => ({
                ...prev,
                activeCard: card,
                spellCasting: { cardId: card.id, step: 'select_discard', targets: [] }
            }));
            setMessage("选择要弃置的手牌（可多选），然后点击确定");
            return; // 拦截：不进入后面的上场流程
        }

        // [2026-07-14 通用] 自动检测 HAND_CARD 目标需求 → 进入手牌选择模式
        // 取代了之前按卡 key 逐张拦截的硬编码方式（白猎等）
        if (owner === 'player' && card.effects && card.effects.length > 0) {
            const effectDef = EFFECT_DB[card.effects[0]];
            const handReq = effectDef?.targetRequirements?.find(r => r.type === 'HAND_CARD');
            if (handReq) {
                const maxCost = effectDef?.params?.maxCost as number | undefined; // [2026-07-14 白猎] 读取费用上限
                setGame(prev => ({
                    ...prev,
                    activeCard: card,
                    spellCasting: {
                        cardId: card.id,
                        step: 'select_hand_target',
                        mode: handReq.count === 0 ? 'multi' : 'single',
                        maxCount: handReq.count || undefined,
                        cardTypeFilter: handReq.cardTypeFilter,
                        label: handReq.label,
                        targets: [],
                        maxCost: maxCost, // 传给UI层用于过滤
                    }
                }));
                setMessage(maxCost ? `${handReq.label}（费用需低于${maxCost}）` : (handReq.label || '选择手牌'));
                return; // 拦截：不进入后面的上场流程
            }
        }

        // [2026-07-20 替换打出] 备战席满员时，打出的单位进入替换选择模式
        if (isUnit && owner === 'player' && playerBench.length >= 6) {
            setGame(prev => ({
                ...prev,
                activeCard: card,
                spellCasting: {
                    cardId: card.id,
                    step: 'select_bench',
                    targets: [],
                }
            }));
            setMessage("选择一个单位替换");
            return; // 拦截：不进入后面的上场流程
        }

        // ========== 丁型异化人：自脉冲 + 直送战场（玩家侧） ==========
        if (card.key === 'titan_type_d_mutant' && owner === 'player') {
            // 统计全场泰坦数（含交战区）
            const allOnField = [
                ...stateRef.current.playerBench,
                ...stateRef.current.enemyBench,
                ...stateRef.current.combatField.flatMap(f => [f.attacker, f.blocker].filter(Boolean)),
            ];
            const titanCount = allOnField.filter(c => c?.keywords?.includes('Titan')).length;
            // 丁型自己也算在内（它入场后带着 Titan 关键词）
            const totalPulse = titanCount + 1;

            // [2026-08-16 莉莉子] 上方 c?.keywords 可选链处理 null（TS18047）

            // 自脉冲：加攻击 + 立即黯淡
            const pulsedCard = {
                ...card,
                buffs: {
                    power: (card.buffs?.power || 0) + totalPulse,
                    health: card.buffs?.health || 0,
                },
                depletedKeywords: ['Titan'],  // 脉冲后立即黯淡，回合末不再触发
                abilityState: card.ability ? 'breathing' as const : undefined,
                animState: 'buff' as const,
            };
            (pulsedCard as any).pulseValue = totalPulse; // 用于 +N 飘字显示

            // 门：直送交战区
            // [2026-10-03 莉莉子 · 进攻标识三层分离 ③ · R3] 「额外攻击」语义 = **不看、也不消耗**进攻标识。
            //   老实现是 `attackToken: { ...prev.attackToken, player: 'normal' }` —— 那是"**白送一个普通标识**"，
            //   于是**非奇偶方**也能靠它抢攻、且**不需要任何备战** ⇒ 粉丝报的"没有备战也会连续进攻"的来源之一。
            //   现在改为给战线打 `isExtraAttack`：回合末结算走 `allExtraAttacks ⇒ keepAttackInitiative`（**不消耗**原标识），
            //   与猎影标记 / 飞剑完全同一条口径。
            setCombatField(prev => [...prev, {
                attacker: pulsedCard as CardData,
                blocker: null,
                owner: 'player',
                isExtraAttack: true,
            }]);

            // 切换到攻击宣告阶段，让玩家选择挑战目标
            setGame(prev => ({
                ...prev,
                phase: 'attack_declare' as const,
                turnOwner: 'player' as const,
                activeCard: null,
                consecutivePasses: 0,
                lastActionTimestamp: Date.now(),
            }));

            setMessage(`${card.name} 冲入战场！选择挑战的目标`);
            eventBus.emit(GameEvents.SFX_PLAYER_PLAY_UNIT);
            return;
        }

        // ========== AI 侧：丁型异化人入场 ==========
        if (card.key === 'titan_type_d_mutant' && owner === 'enemy') {
            // 统计全场泰坦数（含交战区）
            const allOnField = [
                ...stateRef.current.playerBench,
                ...stateRef.current.enemyBench,
                ...stateRef.current.combatField.flatMap(f => [f.attacker, f.blocker].filter(Boolean)),
            ];
            const titanCount = allOnField.filter(c => c?.keywords?.includes('Titan')).length;
            const totalPulse = titanCount + 1;

            // [2026-08-16 莉莉子] 上方 c?.keywords 可选链处理 null（TS18047）

            // 自脉冲：加攻击 + 立即黯淡
            const pulsedCard = {
                ...card,
                buffs: {
                    power: (card.buffs?.power || 0) + totalPulse,
                    health: card.buffs?.health || 0,
                },
                depletedKeywords: ['Titan'],
                abilityState: card.ability ? 'breathing' as const : undefined,
                animState: 'buff' as const,
            };
            (pulsedCard as any).pulseValue = totalPulse;

            // AI 自动选择挑战者目标
            const playerBench = stateRef.current.playerBench;
            const validTargets = playerBench.filter(c =>
                !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying'
            );
            let chosenBlocker: CardData | null = null;
            if (validTargets.length > 0) {
                // AI 策略：优先选最贵的（价值高），其次选血量最低的（容易击杀）
                chosenBlocker = validTargets.sort((a, b) => {
                    const costDiff = (b.cost || 0) - (a.cost || 0);
                    if (costDiff !== 0) return costDiff;
                    return (a.health || 0) - (b.health || 0);
                })[0];
            }

            // 直送交战区（带预选挑战目标）
            // [2026-09-19 BUG修复] 预选格挡者若是「无法进攻」单位，同样归零（第三条漏网路径）
            // [2026-10-03 莉莉子 · R3] 同玩家侧：额外攻击**不看也不消耗**标识 ⇒ 打 `isExtraAttack`，不再白送 normal
            setCombatField(prev => [...prev, {
                attacker: pulsedCard as CardData,
                blocker: chosenBlocker ? applyCantAttackZeroPower(chosenBlocker) : null,
                owner: 'enemy',
                isExtraAttack: true,
            }]);

            setGame(prev => ({
                ...prev,
                phase: 'block_declare' as const,
                turnOwner: 'player' as const,
                activeCard: null,
                consecutivePasses: 0,
                lastActionTimestamp: Date.now(),
            }));

            setMessage(`敌方 ${card.name} 冲入战场！${chosenBlocker ? `锁定 ${chosenBlocker.name} 为挑战目标！` : '无人可挑战！'}`);
            eventBus.emit(GameEvents.SFX_ENEMY_PLAY_UNIT);
            return;
        }

        // [新增] 军功审计探针：记录成功打出卡牌 (用于 15 种常规皮肤成就)
        gameLogger.logEvent({
            type: 'play_card',
            turn: stateRef.current.game.round,
            isPlayerSide: owner === 'player',
            cardKey: card.key
        });

        // [新增] 判断如果打出的是单位，触发对应的放大展示音效
        if (isUnit) {
            if (owner === 'player') {
                eventBus.emit(GameEvents.SFX_PLAYER_PLAY_UNIT);
            } else {
                eventBus.emit(GameEvents.SFX_ENEMY_PLAY_UNIT);
            }
            // [2026-07-20 对局记录] 打出单位
            recordAction('play_card', owner, `打出 ${card.name}`, {
                cardKey: card.key,
                entities: [{ cardKey: card.key, owner, snapshot: captureSnapshot(card) }]
            });
        }

        // [2026-07-10 诗人·科洛] 追踪非易逝卡牌打出记录（供回合开始回收用）
        if (!card.keywords.includes('Ephemeral')) {
            console.log(`[Kelo_Debug] 📤 发射 KELO_TRACK_PLAY: card.key=${card.key}, card.name=${card.name}, owner=${owner}, 回合=${stateRef.current.game.round}`);
            eventBus.emit('KELO_TRACK_PLAY', { cardKey: card.key, owner });
        } else {
            console.log(`[Kelo_Debug] ⏭ 跳过追踪(易逝牌): card.key=${card.key}, card.name=${card.name}, owner=${owner}`);
        }

        // [2026-07-11 绿灵·艾娃] 光环检测已迁移至 useSpellSystem.ts 的 commitSpell/resolveStack

        // --- 播放出牌动画 ---
        setGame(prev => {
            const newStats = { ...prev.stats };

            // 仅统计我方 (Player) 的出牌行为
            if (owner === 'player') {
                if (card.isChampion) {
                    newStats.heroesPlayed += 1;
                } else if (card.type.includes('unit')) {
                    newStats.unitsPlayed += 1;
                } else {
                    newStats.spellsPlayed += 1;
                }
            }

            return {
                ...prev,
                stats: newStats,
                phase: 'animating',
                activeCard: card
            };
        });

        // ── [2026-09-25 莉莉子 任务化框架 · 装备线] 打出卡牌 → 推进「施法 / 打出单位」类装备任务 ──
        //   分类口径与上方 stats 完全一致：天启者 / 单位为「打出单位」，其余为「施法」
        if (owner === 'player') {
            const isSpellPlay = !card.isChampion && !card.type.includes('unit');
            runGearQuest(isSpellPlay ? 'cast_spell' : 'play_unit');
            // [2026-09-25 莉莉子 强化线] 共鸣涌流：每施放 N 个法术 → 本场法术法力上限 +1（计数在这里，生效在回合边界）
            if (isSpellPlay) {
                setGame(prev => {
                    const next = advanceSpellManaGrowth(prev.questProgress, prev.rogueEnhancements);
                    return next === prev.questProgress ? prev : { ...prev, questProgress: next };
                });
            }
        }

        setTimeout(() => {
            setGame(prev => ({ ...prev, activeCard: null }));
            if (isUnit) {
                // =====================================
                // [核心修复] 单位入场发动机：不仅要上场，还要触发 ON_PLAY 战吼！
                // =====================================
                let tempPlayerBench = [...stateRef.current.playerBench];
                let tempEnemyBench = [...stateRef.current.enemyBench];
                let tempCombatField = [...stateRef.current.combatField]; // [关键修复] 初始化缺失的交战区快照！
                let tempGame = { ...stateRef.current.game };

                // [新增] 卡牌物理砸入备战席音效 (底层判定，100%触发)
                eventBus.emit(GameEvents.SFX_DROP_BENCH);

                // 1. 单位先物理上场 (确保战吼如 ALL_ALLIES 能 Buff 到自己，或者系统能扫描到自己)
                // [能力] 初始化能力状态：上场时设为 breathing
                const cardWithAbility = card.ability
                    ? { ...card, abilityState: 'breathing' as const, abilityCharges: card.ability.maxCharges }
                    : card;
                if (owner === 'player') tempPlayerBench.push(cardWithAbility);
                else tempEnemyBench.push(cardWithAbility);

                // [2026-08-11 莉莉子] 迷宫强化 打出单位三时机（on_summon 机不可失/暗影双生、on_play_unit 军势鼓舞/传承武备/锋锐补给/万夫莫敌、on_first_play_unit 先锋之锐）
                // [2026-08-19 莉莉子] 预存"本回合是否首个打出单位"（先锋之锐用，避免被暗影双生改写标记后失效）
                // [2026-10-06 程拍板 · 审计收口 · 模式 B] **按打出方读**：这个闸门是"**该侧**本回合首个打出单位"
                //   （原先读共用布尔 ⇒ 玩家先出单位那回合，敌方的「斩杀协议」就吃不到）
                const isFirstUnitPlayedThisRound = !tempGame.rogueFirstSummonDone?.[owner];
                // [2026-09-09 莉莉子 重构] 收编进统一串行触发引擎：同一份工作快照（tempXxx）上按 owner 串行跑三个 trigger。
                // bench/field 直接引用 temp 数组（尾部统一 setX 提交）；hand/deck 为副本，脏即单独 setX；
                // 暗影双生改写 rogueFirstSummonDone → 收尾把 playCtx.game 同步回 tempGame。
                {
                    const enhList = owner === 'player' ? tempGame.rogueEnhancements : tempGame.enemyEnhancements;
                    const playCtx: RogueTriggerCtx = {
                        game: tempGame,
                        playerBench: tempPlayerBench,
                        enemyBench: tempEnemyBench,
                        combatField: tempCombatField,
                        playerHand: [...stateRef.current.playerHand],
                        enemyHand: [...stateRef.current.enemyHand],
                        playerDeck: [...stateRef.current.playerDeck],
                        enemyDeck: [...stateRef.current.enemyDeck],
                        owner,
                        trigger: 'on_summon',
                        createFullCard,
                        info: { playedCard: cardWithAbility, isFirstUnitPlayedThisRound },
                        dirty: { bench: new Set<Side>(), hand: new Set<Side>(), deck: new Set<Side>(), field: false, game: false },
                    };
                    runRogueTrigger(playCtx, enhList, 'on_summon');
                    runRogueTrigger(playCtx, enhList, 'on_play_unit');
                    if (isFirstUnitPlayedThisRound) {
                        // [2026-10-05 莉莉子 BUG修复 · 20261005-09] **补上 `on_first_summon` 的分发**
                        //   ── 病根（查本条时连带查出）：「暗影双生」用的就是这个 trigger（`buffs.ts:175`），
                        //      而全项目**从来没有任何地方分发过它** ⇒ 这条传说强化**一次都没生效过**。
                        //      它同时也是 `rogueFirstSummonDone` 的**唯一写入者** —— 正是下一条症状的成因。
                        runRogueTrigger(playCtx, enhList, 'on_first_summon');
                        runRogueTrigger(playCtx, enhList, 'on_first_play_unit');
                        // =====================================
                        // [2026-10-05 莉莉子 BUG修复 · 20261005-09] **必须消费掉"本回合首个打出单位"这个时机**
                        // ── 程实测：芬妮神格①「聚光灯下」+2/+0 / ③「全场焦点」+4/+0【碾压】、强化「先锋之锐」+2/+0
                        //    （以及敌方「斩杀协议」）卡面写的是"每回合**首个**打出的单位"，实际却
                        //    **每回合每个打出的单位都吃加成**。
                        // ── 病根：上面那个闸门读 `game.rogueFirstSummonDone`，而此前**只有暗影双生的处理器会写它**
                        //    （而它又从不触发，见上）⇒ 不持有暗影双生时该标记**整回合恒为 false**
                        //    ⇒ `isFirstUnitPlayedThisRound` 对每一个打出的单位都成立。
                        // ── 修法：分发完就无条件把时机标记为已消费。判定值用的是上面**预存**的那个
                        //    （顺序与语义都不动）⇒ **本回合首个单位该吃的加成照吃**，第二个起才不再吃。
                        // ── 字段语义由此明确为「本回合的『首个打出单位』时机是否已消费」——
                        //    暗影双生卡面写的也正是"每回合首次**打出的**单位"，二者本就同源（见 `types.ts` 注释）。
                        // =====================================
                        if (!playCtx.game.rogueFirstSummonDone?.[owner]) {
                            playCtx.game = {
                                ...playCtx.game,
                                rogueFirstSummonDone: { ...(playCtx.game.rogueFirstSummonDone || {}), [owner]: true },
                            };
                        }
                    }
                    // 同步回局部变量（CLONE/RANDOM 等已原地改写 temp 数组元素）
                    tempPlayerBench = playCtx.playerBench;
                    tempEnemyBench = playCtx.enemyBench;
                    tempCombatField = playCtx.combatField;
                    tempGame = playCtx.game;
                    if (playCtx.dirty.hand.has('player')) setPlayerHand(playCtx.playerHand);
                    if (playCtx.dirty.hand.has('enemy')) setEnemyHand(playCtx.enemyHand);
                    if (playCtx.dirty.deck.has('player')) setPlayerDeck(playCtx.playerDeck);
                    if (playCtx.dirty.deck.has('enemy')) setEnemyDeckState(playCtx.enemyDeck);
                }

                // 2. 扫描并触发入场特效 (ON_PLAY)
                if (card.effects && card.effects.length > 0) {
                    // [精灵小队 日志] 打印斯涅妮卡入场时的效果扫描
                    if (card.key === 'Spirit_Squad_Snenika') {
                        console.log(`[SpiritDebug] 斯涅妮卡入场，effects=`, card.effects);
                    }
                    card.effects.forEach(effId => {
                        const def = EFFECT_DB[effId];
                        // [2026-10-06 程拍板 · 时机口径统一] 这里是**从手牌打出**的路径 ⇒
                        //   两条时机都放行：「入场」(`ON_PLAY`) **和**「打出时」(`ON_PLAY_FROM_HAND`)。
                        //   （而"被召唤到战场"的路径只该放行「入场」——见 `isEntryTiming` 的注释。）
                        //   ⚠️ 旧写法 `def.timing.includes('ON_PLAY')` 是子串匹配，会把两条混在一起。
                        const onPlayMatched = isEntryTiming(def?.timing) || isPlayFromHandTiming(def?.timing);
                        if (card.key === 'Spirit_Squad_Snenika') {
                            console.log(`[SpiritDebug]  检查效果 ${effId}: timing=${def?.timing}, 匹配ON_PLAY=${onPlayMatched}`);
                        }
                        if (def && onPlayMatched) {
                            const ctx: EffectContext = {
                                game: tempGame,
                                playerBench: tempPlayerBench,
                                enemyBench: tempEnemyBench,
                                playerHand: stateRef.current.playerHand,
                                enemyHand: stateRef.current.enemyHand,
                                playerDeck: stateRef.current.playerDeck, // [新增] 把我方牌库喂进去！
                                enemyDeck: stateRef.current.enemyDeck,   // [新增] 把敌方牌库喂进去！
                                combatField: tempCombatField, // [核心修正] 这里也要改为用 tempCombatField，确保连环战吼数据一致
                                owner: owner,
                                sourceCard: card, // [关键] 把登场单位作为源卡牌传进去，供复印机或条件扫描器识别
                                // [2026-10-05 莉莉子 BUG修复] 补传 `createFullCard`（露米「时序加速」飞剑2 走这里）——
                                //   否则飞剑补跑的 `on_summon` 整段被跳过（同 :1764 站点）
                                createFullCard,
                            };


                           const res = processEffect(effId, targets, ctx);

                            // 接收执行战吼后的新鲜快照
                            tempGame = res.game;
                            tempPlayerBench = res.playerBench;
                            tempEnemyBench = res.enemyBench;

                            // [重要修复] 如果战吼将衍生物空降到了交战区，必须将其同步到快照中，否则空降会彻底失效！
                            if (res.combatField) tempCombatField = res.combatField;

                            // [新增] 接收被处理器修改过的牌库，并通过外部的 setState 直接写回 React
                            if (res.playerDeck && owner === 'player') setPlayerDeck(res.playerDeck);
                            if (res.enemyDeck && owner === 'enemy') setEnemyDeckState(res.enemyDeck);

                            // [2026-07-09 新增] 写入被处理器修改过的手牌（用于 GENERATE 等效果）
                            if (res.playerHand && owner === 'player') setPlayerHand(res.playerHand);
                            if (res.enemyHand && owner === 'enemy') setEnemyHand(res.enemyHand);

                            // [2026-07-09 新增] 处理战吼中的抽卡/生成动画事件（每张间隔 1.2s 确保完整播完）
                            let onplayAnimIdx = 0;
                            relayEffectEvents(res.events); // [2026-09-19] 转发伤害事件（飘字 + 受击音都靠它）
                            res.events.forEach(evt => {
                                if (evt.type === 'sfx_draw') {
                                    const drawnCard = evt.payload as CardData;
                                    const animId = nextAnimId('onplay-draw', drawnCard.id);
                                    setTimeout(() => {
                                        eventBus.emit(GameEvents.DRAW_START, {
                                            animId, card: drawnCard, owner,
                                            skipHandAdd: true,
                                        });
                                    }, onplayAnimIdx * 1200);
                                    onplayAnimIdx++;
                                }
                                if (evt.type === 'sfx_generate') {
                                    const genCard = evt.payload as CardData;
                                    setPlayerHand(prev => prev.filter(c => c.id !== genCard.id));
                                    const animId = nextAnimId('onplay-gen', genCard.id);
                                    const delay = onplayAnimIdx * 1200;
                                    onplayAnimIdx++;
                                    setTimeout(() => {
                                        eventBus.emit(GameEvents.DRAW_START, {
                                            animId, card: genCard, owner,
                                            skipHandAdd: false,
                                            skipDeckAnim: true,
                                        });
                                    }, delay);
                                }
                            });
                        }
                    });
                }

                // [2026-07-14 梵音] 莎罗入场：本牌局每有一个我方单位阵亡，自己和随机友方单位各+1/+1
                if (card.key === 'SacredChants_Squad_Shalo') {
                    const deathCount = owner === 'player'
                        ? (tempGame.friendlyUnitDeaths || 0)
                        : (tempGame.enemyUnitDeaths || 0);
                    const targetBench = owner === 'player' ? tempPlayerBench : tempEnemyBench;
                    if (deathCount > 0 && targetBench) {
                        const selfIndex = targetBench.findIndex(c => c.id === cardWithAbility.id);
                        for (let i = 0; i < deathCount; i++) {
                            // 给自己+1/+1
                            if (selfIndex >= 0) {
                                const self = targetBench[selfIndex];
                                targetBench[selfIndex] = {
                                    ...self,
                                    buffs: {
                                        power: (self.buffs?.power || 0) + 1,
                                        health: (self.buffs?.health || 0) + 1,
                                    },
                                };
                            }
                            // 随机一个其他友方单位+1/+1（不包含莎罗自己，"自己"那部分已在上面的self逻辑处理）
                            const available = targetBench.filter(c => !c.isDead && c.id !== cardWithAbility.id);
                            if (available.length > 0) {
                                const randomAlly = available[Math.floor(Math.random() * available.length)];
                                const allyIndex = targetBench.findIndex(c => c.id === randomAlly.id);
                                if (allyIndex >= 0) {
                                    const ally = targetBench[allyIndex];
                                    targetBench[allyIndex] = {
                                        ...ally,
                                        buffs: {
                                            power: (ally.buffs?.power || 0) + 1,
                                            health: (ally.buffs?.health || 0) + 1,
                                        },
                                    };
                                }
                            }
                        }
                        console.log(`[ShaloBuff] ${owner} 已阵亡 ${deathCount} 个单位，莎罗与友方各获得 ${deathCount} 次+1/+1`);
                    }
                }

                // [Channel 充能] 召唤时恢复 1 点法术法力，触发后黯淡
                if (card.keywords.includes('Channel') && !(card.depletedKeywords || []).includes('Channel')) {
                    tempGame = applyChannelOnSummon(card, owner, tempGame as any);
                    // 更新场上卡牌状态：追加 depletedKeywords + 触发特效
                    const bench = owner === 'player' ? tempPlayerBench : tempEnemyBench;
                    const cardIdx = bench.findIndex((c: any) => c.id === card.id);
                    if (cardIdx >= 0) {
                        bench[cardIdx] = {
                            ...bench[cardIdx],
                            depletedKeywords: [...(bench[cardIdx].depletedKeywords || []), 'Channel'],
                            animState: 'channel_pulse',
                        };
                    }
                }

                // [能力] 触发 ON_PLAY 类能力的闪光
                //   [2026-10-06 程拍板 · 时机口径统一] 本块位于**从手牌打出**的路径 ⇒
                //   「入场」(`on_play`) 与「打出时」(`on_play_from_hand`) 的能力都要闪。
                const flashOnPlay = (bench: any[]) => bench.map((c: any) => {
                    if (c.ability && (c.ability.trigger === 'on_play' || c.ability.trigger === 'on_play_from_hand') && c.abilityState === 'breathing') {
                        const updated = { ...c, abilityState: 'flashing' as const };
                        // 动画后转入终态
                        setTimeout(() => {
                            const chargeLeft = c.ability.maxCharges === -1 ? -1 : (c.abilityCharges || 0) - 1;
                            const finalState = (chargeLeft === 0 && c.ability.postTriggerState === 'dim') ? 'dimmed' : 'breathing';
                            const cardRef = owner === 'player'
                                ? stateRef.current.playerBench.find((bc: any) => bc.id === c.id)
                                : stateRef.current.enemyBench.find((bc: any) => bc.id === c.id);
                            // 用 setState 更新（仅在卡牌还在场上时）
                            if (cardRef) {
                                const updater = (prev: any[]) => prev.map((pc: any) =>
                                    pc.id === c.id ? { ...pc, abilityState: finalState, abilityCharges: chargeLeft } : pc
                                );
                                if (owner === 'player') setPlayerBench(updater);
                                else setEnemyBench(updater);
                            }
                        }, 500);
                        return updated;
                    }
                    return c;
                });
                tempPlayerBench = flashOnPlay(tempPlayerBench);
                tempEnemyBench = flashOnPlay(tempEnemyBench);

                // [2026-08-06 莉莉子 Echo 回响] 单位打出并结算后：在手牌生成一张该牌的瞬逝复制品
                if (card.keywords.includes('Echo')) {
                    const ownerHand = owner === 'player'
                        ? stateRef.current.playerHand
                        : stateRef.current.enemyHand;
                    // [2026-10-08 第二波 · Q5] 单位侧同口径：复制品继承装备（玩家=rogueEquipments / 敌方=enemyEquipments）
                    const echoResult = applyEchoOnPlay(card, ownerHand, owner, (owner === 'player' ? rogueEquipments : enemyEquipments)?.[card.key]);
                    if (echoResult.echoedCards.length > 0) {
                        if (owner === 'player') {
                            setPlayerHand(echoResult.hand);
                            stateRef.current.playerHand = echoResult.hand;
                        } else {
                            setEnemyHand(echoResult.hand);
                            stateRef.current.enemyHand = echoResult.hand;
                        }
                        // 播放生成动画：中央展示 → 飞入手牌
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

                // [2026-08-12 装备系统] 打出时装备效果：对**敌方**备战席所有单位造成伤害（装备「备战爆破」）
                // [2026-10-04 莉莉子 BUG修复] 原实现**硬编码传 `tempEnemyBench`** —— 而这里是
                //   玩家与 AI **共用**的通用 ON_PLAY 路径 ⇒ **AI 打出时炸的是它自己那侧**
                //   （粉丝：「AI 的单位自己携带这个装备时，都会打自己」）。
                //   现改为传「双方席位 + owner」，目标侧由 executeEquipmentOnPlay 内部按 owner 推导
                //   ⇒ 「打哪一侧」的判断**只此一处**，两个调用点都不再有机会传错。
                const equipStruck = executeEquipmentOnPlay(
                    { playerBench: tempPlayerBench, enemyBench: tempEnemyBench },
                    card,
                    owner,
                );
                if (equipStruck) {
                    if (equipStruck.side === 'player') tempPlayerBench = equipStruck.bench;
                    else tempEnemyBench = equipStruck.bench;
                }

                // 3. 统一将上场与战吼的结果拍板，下发给 React 渲染层
                setPlayerBench(tempPlayerBench);
                setEnemyBench(tempEnemyBench);
                setCombatField(tempCombatField); // [重要修复] 将交战区快照一并提交给底层！
                // [2026-08-24 莉莉子 飞剑竞态根治] ON_PLAY 战吼召唤飞剑（圣树露米）→ 同步进入格挡阶段，
                // 不依赖异步守卫 effect 切换。无飞剑时保持原 turnOwner 逻辑。
                const onPlaySwordOwner = getFlyingSwordOwner(tempCombatField);
                const onPlayTurnOwner = onPlaySwordOwner
                    ? getDefensiveSide(onPlaySwordOwner)
                    : (owner === 'player' ? 'enemy' : 'player');
                setGame({
                    ...tempGame,
                    phase: onPlaySwordOwner ? ('block_declare' as const) : 'main',
                    turnOwner: onPlayTurnOwner,
                    consecutivePasses: 0,
                    lastActionTimestamp: Date.now()
                });
            } else {
                // 法术：进入提交流程 (commitSpell 会处理 UI清理、扣费与入栈分流，且已内置录制)
                // [2026-09-19 方案C] AI 施法先走「三拍演出」：打出 → 逐个目标 → 确定。
                //   此前 AI 一瞬间选完目标直接结算 ⇒ 前两拍音效无从触发（也会让伤害"啪一下"就出来）。
                if (owner === 'enemy') {
                    void runEnemySpellCastBeats(targets, wait).then(() =>
                        commitSpell(card, owner, targets, originalPhase)
                    );
                } else {
                    commitSpell(card, owner, targets, originalPhase); // [关键修复] 把时空锚点传给引擎！
                }
            }
        }, 600);
    };


    const passTurn = () => {
        const g = stateRef.current.game; // [2026-07-16 修复] 用 stateRef 避免闭包陷阱
        console.log(`[passTurn] 被调用 — spellStack=${g.spellStack.length} consecutivePasses=${g.consecutivePasses} phase=${g.phase} turnOwner=${g.turnOwner}`);
        // ==========================================
        // [2026-10-03 莉莉子 BUG修复 · BUG-20261002-26] 校准面板未确认 ⇒ 禁止推进回合 / 翻转优先权
        //   · 病根：`calibratePending` 此前只被「主倒计时暂停」（GameSession）与「AI 自身校准」两处认了，
        //     **回合推进这条线完全没认** ⇒ 面板还开着，回合被推过去 ⇒ 对手直接开始行动。
        //   · 这里补的正是缺失的那一处 —— 与倒计时**同口径**（同一语义只留一处判据：面板开着就是全局阻塞）。
        //   · 不会死锁：面板必有出口（玩家确认 / AI 面板 1.5s+0.8s 自动确认）。
        // ==========================================
        if (g.calibratePending) {
            console.log('[passTurn][校准守卫] 校准面板未确认，passTurn 无效');
            return;
        }
        // [2026-08-24 莉莉子 飞剑竞态根治] 交战区仍有飞剑时，passTurn 绝不推进回合/翻转优先权/结束回合。
        // 飞剑是"额外攻击"，其生命周期（召唤→格挡→打击→归位）内回合结束检测不得介入。
        // [2026-09-26 T17 猎影标记] 同构扩展：法术装配的额外攻击（战线上 `isExtraAttack`）走同一条守卫 ——
        //   两者共同点是「额外攻击 ⇒ 归位前不消耗进攻标识、不得触发回合结束」，判定与处置完全一致。
        //   ⚠️ 飞剑优先短路，飞剑分支的行为一分未改。
        const swordField = stateRef.current.combatField;
        const swordOwner = getFlyingSwordOwner(swordField);
        const hasFlyingSword = !!swordOwner;
        const extraAttackOwner = swordOwner ?? getExtraAttackOwner(swordField);
        if (extraAttackOwner) {
            if (g.phase === 'block_declare') {
                // 格挡阶段：防守方应走 confirmBlock，passTurn 在此无效
                console.log(`[passTurn][额外攻击守卫] 交战区有额外攻击(飞剑=${hasFlyingSword})且已在格挡阶段，passTurn 无效`);
                return;
            }
            if (g.phase === 'main' || g.phase === 'animating') {
                // 刚入场、尚未进入格挡（守卫 effect 未及时介入）：强行拉回格挡阶段
                setGame(prev => ({
                    ...prev,
                    phase: 'block_declare' as const,
                    turnOwner: getDefensiveSide(extraAttackOwner),
                    consecutivePasses: 0,
                    lastActionTimestamp: Date.now(),
                }));
                setMessage(extraAttackOwner === 'player'
                    ? (hasFlyingSword ? '我方飞剑来袭，请敌方格挡' : '我方额外攻击已发动，请敌方格挡')
                    : (hasFlyingSword ? '敌方飞剑来袭，请分配格挡！' : '敌方额外攻击已发动，请分配格挡！'));
                console.log(`[passTurn][额外攻击守卫] 交战区有额外攻击且 phase=${g.phase} → 强制进入格挡阶段`);
                return;
            }
            // phase === 'react_to_block'：格挡已确认、额外攻击汇入战斗，放行走正常分支B → resolveCombatAnimation
        }
        if (g.spellStack.length > 0 && g.consecutivePasses === 0) {
             console.log(`[passTurn] 📚 分支A：堆叠非空，resolveStack`);
             setGame(prev => ({ ...prev, consecutivePasses: 1 }));
             // [2026-07-16 修复] resolveStack 完成后自动 re-entry 继续流程
             // 避免因 async resolveStack 未完成就进入分支B导致战斗跳过堆栈
             resolveStack().then(() => passTurn());
             return;
        }
        // [核心修复 3] 判断连续让过时所处的阶段
        if (g.consecutivePasses >= 1) {
            console.log(`[passTurn] 🔄 分支B：二次让过，phase=${g.phase}`);
            // [2026-07-16 修复] 即使二次让过，堆栈未空也要先结算
            if (g.spellStack.length > 0) {
                console.log(`[passTurn] ⚠️ 二次让过但堆栈仍有 ${g.spellStack.length} 个法术，优先结算`);
                setGame(prev => ({ ...prev, consecutivePasses: 0 }));
                resolveStack().then(() => passTurn());
                return;
            }
            if (g.phase === 'react_to_block') {
                // 如果在格挡响应阶段双方连续让过，说明法术交锋彻底结束，进入真正的物理战斗碰撞！
                resolveCombatAnimation();
            } else if (g.phase === 'block_declare') {
                // [安全兜底] 即使发生了异常导致格挡阶段连续让过，强行确认防线以推动流程，绝不吞噬战斗
                confirmBlock();
            } else if (g.phase === 'main') {
                // [核心修复] 如果在常规主阶段双方连续让过，不直接进入下回合，而是先执行回合结束清算序列（幻象清理等）
                // [2026-08-24 莉莉子 飞剑竞态根治] 收紧为 phase 白名单：只有 main 才允许结束回合
                executeRoundEndSequence();
            } else {
                // [2026-08-24 莉莉子 飞剑竞态根治] animating/attack_declare 等残留阶段不得触发回合结束
                console.warn(`[passTurn] ⚠️ 跳过残留阶段 ${g.phase} 的回合结束判定`);
            }
        }
        else {
            console.log(`[passTurn] ✅ 分支C：正常让过 → turnOwner ${g.turnOwner} → ${g.turnOwner === 'player' ? 'enemy' : 'player'}`);
            recordAction('pass_turn', g.turnOwner === 'player' ? 'player' : 'enemy', '让过');
            setGame(prev => ({ ...prev, turnOwner: prev.turnOwner === 'player' ? 'enemy' : 'player', consecutivePasses: prev.consecutivePasses + 1, lastActionTimestamp: Date.now() }));
        }
    };

    const toggleAttacker = (card: CardData, toCombat: boolean) => {
        if (toCombat) {
            // [2026-08-08 莉莉子] 堆叠非空时禁止上阵进攻（堵住拖拽绕过 initiateAttack 的洞）
            // 引擎层兜底：无论从哪条路径调上来，法术结算期间都不得派兵进攻
            if (stateRef.current.game.spellStack.length > 0) {
                setMessage("法术结算中，无法进攻！");
                return;
            }
            // [核心修复] 拦截上限：战场最多容纳 6 人！
            // 必须在外层拦截！如果在 setCombatField 内拦截，会导致卡牌被 setPlayerBench 扣除后直接蒸发！
            if (stateRef.current.combatField.length >= 6) {
                setMessage("战场已满！最多同时 6 个单位进攻。");
                return;
            }
            // 装备防抖守卫
            if (stateRef.current.combatField.some(f => f.attacker.id === card.id)) return;

            // [CantAttack] 进入战场时攻击力归零，保存原值用于撤回恢复
            // [2026-09-19] 改走公共函数，杜绝与挑战/拉取路径口径分叉
            const finalCard = applyCantAttackZeroPower(card);

            // [新增] 进攻上场语音：检查是否是本回合首次行动
            if (card.isChampion && !heroActionHistory.current.has(card.id)) {
                eventBus.emit(GameEvents.HERO_FIRST_ACTION, card);
                heroActionHistory.current.add(card.id);
            }
            eventBus.emit(GameEvents.SFX_BLOCK);

            setPlayerBench(prev => prev.filter(c => c.id !== card.id));
            setCombatField(prev => [...prev, { attacker: finalCard, blocker: null, owner: 'player' }]);
        } else {
            eventBus.emit(GameEvents.SFX_RECALL_BLOCK);

            // =====================================
            // [2026-10-02 莉莉子 BUG修复 · 🔥恶性] 撤回进攻时必须**先把 blocker 退回它自己的半场**
            // ── 病根：原实现 `prev.filter(c => c.attacker.id !== card.id)` 把**整条 fight** 滤掉，
            //    blocker 一起被丢弃。而被【挑战者】/【暴露】拉来的单位**此时已被移出备战席**
            //    （见 challengeEnemy / aiChallengeUnit 的 setBench filter）
            //    ⇒ 撤回进攻 = 那个单位**凭空消失**（程报的恶性 BUG）。
            // ── 修法：复用 `recallBlocker`（撤回格挡的既有正确逻辑：按 combat.owner 决定退回哪一侧、
            //    并还原 CantAttack 被归零的攻击力）。**不另写一份** —— 两条撤回路径各写各的，
            //    正是这个 BUG 的成因。
            // ── 为什么"我方挑战敌人后撤回进攻"看起来正常、而暴露场景会消失：两者其实是同一条路径，
            //    差别只在用户点的是"撤回格挡"（走 recallBlocker ✓）还是"撤回进攻"（走本分支 ✗）。
            // =====================================
            // [2026-10-10 莉莉子 BUG修复 · 程实测「撤回进攻 → 黑屏」]
            //   ── 崩溃栈：`Cannot read properties of undefined (reading 'id')`，落在本函数的
            //      `combatField.filter(c => c.attacker.id …)` 上 ⇒ **某条战线的 `attacker` 是空值**。
            //      `combatField` 在类型上是 `any[]`（`types.ts:305`），而死亡漏斗
            //      （`judgeLifeAndDeath` 里 `attacker: entry.attacker ? … : null`）本来就会产出
            //      **无 attacker 的战線** ⇒ 这里绝不能裸读 `.id`。
            //   ── 修法：两处判据都改**可选链**（`?.id`）—— 空 attacker 的战線既不参与"是不是我要撤回的
            //      那条"，也不会被误删（保持既有数组内容不变，交给死亡漏斗处理）。
            const fightIndex = combatField.findIndex(c => c.attacker?.id === card.id);
            if (fightIndex !== -1 && combatField[fightIndex].blocker) {
                recallBlocker(fightIndex);
            }

            setCombatField(prev => {
                const nextField = prev.filter(c => c.attacker?.id !== card.id);
                // [Case 1 自动推进] 撤回单位后，检查战场是否已空。若空且处于进攻宣告期，自动退回主阶段
                const hasPlayerAttackers = nextField.some(c => c.owner === 'player');
                if (!hasPlayerAttackers && stateRef.current.game.phase === 'attack_declare') {
                    setGame(g => ({ ...g, phase: 'main', lastActionTimestamp: Date.now() }));
                }
                return nextField;
            });
            // [无法攻击] 撤回备战席 → 还原真实攻击力（唯一出口，幂等：没记过账就原样返回）
            // [2026-10-05 莉莉子 BUG修复 · 20261005-03] 原实现自己查 ref 再分两支，现统一走共享账本
            setPlayerBench(prev => [...prev, restoreCantAttackPower(card)]);
        }
    };

    const selectBlocker = (id: string) => {
        setGame(prev => ({...prev, selectedBlockerId: prev.selectedBlockerId === id ? null : id}));
        setMessage("选择要格挡的敌方单位");
        eventBus.emit(GameEvents.SFX_SELECT_BLOCKER_UNIT); // [教程] 通知引导步推进
    };

    const assignBlocker = (fightIndex: number, blockerId: string) => {
        if (combatField[fightIndex].blocker !== null) return;
        const blocker = playerBench.find(c => c.id === blockerId);

        if (blocker) {
            const attacker = combatField[fightIndex].attacker;
            // [2026-08-06 莉莉子 敌我修复] 归属校验：玩家只能格挡"敌方发起"的进攻者
            // （如敌方飞剑）。己方进攻者（我方单位/我方飞剑，owner==='player'）不可格挡，
            // 否则会把自己单位派去挡自己的飞剑，结算后归位错乱。
            if (combatField[fightIndex].owner !== 'enemy') {
                setMessage("不能格挡己方单位的进攻！");
                return;
            }
            // [新增] Elusive (隐秘) 判定
            // 规则：如果攻击者有隐秘，阻挡者必须也有隐秘
            // [2026-08-20 莉莉子] 不再静默拒绝：发 BLOCK_REJECTED 让表现层演出"冲上去→被吓退"+播报
            // [2026-08-26 莉莉子 BUG修复] 拒绝分支必须同步清除 selectedBlockerId——此前残留导致单挑施法选目标时点战斗区卡仍触发格挡
            if (attacker.keywords.includes('Elusive') && !blocker.keywords.includes('Elusive')) {
                setMessage("必须用【隐秘】单位阻挡【隐秘】单位！");
                eventBus.emit(GameEvents.BLOCK_REJECTED, { blocker, fightIndex, reason: 'elusive', attackerId: attacker.id });
                setGame(prev => ({ ...prev, selectedBlockerId: null }));
                return;
            }

            // [凶恶] 判定：攻击力 < 3 的单位无法阻挡凶恶单位
            if (attacker.keywords.includes('Fearsome')) {
                const blockerPower = (blocker.power || 0) + (blocker.buffs?.power || 0) + (blocker.roundBuffs?.power || 0);
                if (blockerPower < 3) {
                    setMessage("必须用攻击力大于3的单位阻挡【凶恶】单位！");
                    eventBus.emit(GameEvents.BLOCK_REJECTED, { blocker, fightIndex, reason: 'fearsome', attackerId: attacker.id });
                    setGame(prev => ({ ...prev, selectedBlockerId: null }));
                    return;
                }
            }

            // [2026-06-27 CantAttack] 格挡者进入战场时攻击力归零
            // [2026-09-19] 改走公共函数，杜绝与挑战/拉取路径口径分叉
            const finalBlocker = applyCantAttackZeroPower(blocker);

            eventBus.emit(GameEvents.SFX_BLOCK);

            setPlayerBench(prev => prev.filter(c => c.id !== finalBlocker.id));
            setCombatField(prev => {
                const n = [...prev];
                n[fightIndex] = { ...n[fightIndex], blocker: finalBlocker, isChallenged: false };
                return n;
            });
            setGame(prev => ({...prev, selectedBlockerId: null}));
        }


    };

    // [修正] 格挡撤回逻辑 (智能归位)
    const recallBlocker = (fightIndex: number) => {
        const combat = combatField[fightIndex];
        if (combat && combat.blocker) {
            // [2026-10-02 莉莉子 BUG修复] 引擎侧收口：**被敌方挑战/暴露拉走的我方单位不许撤回**。
            //   放在引擎而不是只放 UI —— 点击与拖拽是两条 UI 路径，只堵一条必然漏另一条
            //   （程的原话：「我们此前修复过，但是当时修复的好像是可以点击撤回」）。
            if (!canPlayerRetractBlocker(combat)) {
                console.log('[挑战守卫] 该 blocker 是被对方拉走的（owner=enemy + isChallenged）→ 拒绝撤回');
                setMessage('被挑战的单位无法撤回！');
                return;
            }
            let blockerCard = combat.blocker;

            eventBus.emit(GameEvents.SFX_RECALL_BLOCK);
            // 1. 移除战场上的阻挡者 (保持不变)
            setCombatField(prev => {
                const n = [...prev];
                n[fightIndex] = { ...n[fightIndex], blocker: null };
                return n;
            });

            // 2. [关键修复] 根据“战斗发起者(combat.owner)”来判断阻挡者归属
            // 逻辑：如果这场战斗是 'player' 发起的，那 blocker 必然是 'enemy' (被挑战的敌人) -> 必须回敌方备战席
            // 逻辑：如果这场战斗是 'enemy' 发起的，那 blocker 必然是 'player' (我去阻挡) -> 回我方备战席
            if (combat.owner === 'player') {
                setEnemyBench(prev => [...prev, blockerCard]);
            } else {
                // [无法攻击] 我方格挡者撤回 → 还原真实攻击力（唯一出口，幂等）
                // [2026-10-05 莉莉子 BUG修复 · 20261005-03] 原实现是内联查 ref + 手工拼对象，现统一走共享账本
                blockerCard = restoreCantAttackPower(blockerCard);
                setPlayerBench(prev => [...prev, blockerCard]);
            }
        }
    };
// [新增] 选中/取消选中 我方挑战者
    const selectChallenger = (id: string) => {
        setGame(prev => ({
            ...prev,
            selectedChallengerId: prev.selectedChallengerId === id ? null : id
        }));
        setMessage(game.selectedChallengerId === id ? "取消选择" : "选择要拉取的敌方单位");
    };

    // [新增] 执行挑战：将敌方备战席单位强行拉入战斗
    const challengeEnemy = (attackerId: string, enemyId: string) => {
        const enemyUnit = enemyBench.find(c => c.id === enemyId);
        if (!enemyUnit) return;

        // 找到攻击者所在的战场位置
        const combatIndex = combatField.findIndex(f => f.attacker.id === attackerId);
        if (combatIndex === -1) return;

        // =====================================
        // [2026-09-16 1.0.16 茉莉安 · T11] 拉取合法性最终判定（引擎侧安全网）
        // ── 挑战者 = 进攻方权限：可以拉【任意】敌方备战席单位
        // ── 暴露   = 防守方漏洞：不需要挑战者，**任意敌方单位进攻时都能拉它**
        //    （设计文档 2.3：两者方向相反、不可混为一谈）
        // ── 两种资格满足其一即可；都不满足则拒绝 —— UI 层也会拦，这里是防绕过
        // =====================================
        {
            const attacker = combatField[combatIndex].attacker;
            const isChallenger = (attacker.keywords || []).includes('Challenger');
            const isExposed = (enemyUnit.keywords || []).includes('Exposed');
            if (!isChallenger && !isExposed) {
                console.log(`[ExposedDebug] 拉取被拒：攻击者无【挑战者】且目标无【暴露】(${enemyUnit.name})`);
                return;
            }
            console.log(`[ExposedDebug] 拉取放行：${isChallenger ? '发起方带挑战者' : '目标带暴露'} → ${enemyUnit.name}`);
            // ==========================================
            // [2026-09-28 莉莉子 神格神经 · 茉莉安①③] 新触发时机「拉取暴露单位」（程授权改本文件）
            //   语义：仅当**目标是暴露单位**时触发（程的设计写的是"拉取暴露单位"；
            //   带挑战者去拉非暴露单位不触发）。加成对象 = **发起拉取的我方单位**（程 09-28 确认）。
            //   载体：本回合 +N/+M（BUFF handler 的 roundBuffs）→ 通过 info.playedCard 指过去
            // ==========================================
            if (isExposed) {
                const pullCtx: RogueTriggerCtx = {
                    game: { ...stateRef.current.game },
                    playerBench: [...stateRef.current.playerBench],
                    enemyBench: [...stateRef.current.enemyBench],
                    combatField: combatField.map(f => ({ ...f })),
                    playerHand: [...stateRef.current.playerHand],
                    enemyHand: [...stateRef.current.enemyHand],
                    playerDeck: [...stateRef.current.playerDeck],
                    enemyDeck: [...stateRef.current.enemyDeck],
                    owner: 'player',
                    trigger: 'on_pull_exposed',
                    createFullCard,
                    info: { playedCard: attacker },
                    dirty: { bench: new Set<Side>(), hand: new Set<Side>(), deck: new Set<Side>(), field: false, game: false },
                };
                runRogueTrigger(pullCtx, stateRef.current.game.rogueEnhancements, 'on_pull_exposed');
                if (pullCtx.dirty.field) {
                    const buffedAttacker = pullCtx.combatField[combatIndex]?.attacker;
                    if (buffedAttacker) setCombatField(prev => {
                        const n = [...prev];
                        if (n[combatIndex]) n[combatIndex] = { ...n[combatIndex], attacker: buffedAttacker };
                        return n;
                    });
                }
            }
        }

        // 如果该位置已经有阻挡者了，先把它踢回备战席
        const oldBlocker = combatField[combatIndex].blocker;

        eventBus.emit(GameEvents.SFX_BLOCK);

        setEnemyBench(prev => {
            const newBench = prev.filter(c => c.id !== enemyId);
            // [2026-10-05 莉莉子 BUG修复 · 20261005-03] 被顶掉的旧格挡者同样要**还原真实攻击力**
            //   —— 原来"回备战席"的出口清单里漏了这一条 ⇒ 它带着 0 攻回席
            if (oldBlocker) newBench.push(restoreCantAttackPower(oldBlocker));
            return newBench;
        });

        setCombatField(prev => {
            const n = [...prev];
            // [修正] 增加 isChallenged: true 标记，表示这是一个被迫的格挡
            // [2026-09-19 BUG修复] 被拉上场的「无法进攻」单位同样要归零攻击力 ——
            //   此前这条路径没有清零 ⇒ 逻辑上打人不掉血（正确），但卡面还显示被 BUFF 的攻击力（视觉错）。
            n[combatIndex] = {
                ...n[combatIndex],
                blocker: applyCantAttackZeroPower(enemyUnit),
                isChallenged: true
            };
            return n;
        });

        setGame(prev => ({ ...prev, selectedChallengerId: null }));
        setMessage("挑战成功！");
    };

    // [AI 挑战] AI 使用挑战者，将玩家备战席的单位拉入战场格挡
    const aiChallengeUnit = (attackerId: string, playerUnitId: string) => {
        const targetUnit = playerBench.find(c => c.id === playerUnitId);
        if (!targetUnit) return;

        const combatIndex = combatField.findIndex(f => f.attacker.id === attackerId);
        if (combatIndex === -1) return;

        const oldBlocker = combatField[combatIndex].blocker;

        setPlayerBench(prev => {
            const newBench = prev.filter(c => c.id !== playerUnitId);
            // [2026-10-05 莉莉子 BUG修复 · 20261005-03] 同 challengeEnemy：被顶掉的旧格挡者回席前先还原
            if (oldBlocker) newBench.push(restoreCantAttackPower(oldBlocker));
            return newBench;
        });

        setCombatField(prev => {
            const n = [...prev];
            n[combatIndex] = {
                ...n[combatIndex],
                // [2026-09-19 BUG修复] AI 拉取路径同样归零（与 challengeEnemy 对称）
                blocker: applyCantAttackZeroPower(targetUnit),
                isChallenged: true,
            };
            return n;
        });

        setMessage("敌方发动挑战！");
    };

    useEffect(() => {
        // [修改] 沙盒模式下，阻止自动调用 startRound (因为我们在上面的 hook 里已经手动设好第一回合状态了)
        // [2026-09-05 莉莉子 修复] initializedRef 此前从未置 true，守卫形同虚设 → StrictMode(dev) 双挂载 effect 双跑
        // 导致 startRound 在换牌期重复执行、round 被推过 1 → 换牌结束时 announcer 开局抽卡 drawCards(4) 的 round===1 条件不满足 → 卡死。
        if (!initializedRef.current && !isSandbox) {
            initializedRef.current = true; // 先置位，StrictMode 双跑第二次 effect 直接跳过
            startRound(true); // [2026-08-15] 开局（换牌前）跳过 round_start 强化，第一回合暗箭等由换牌后 triggerFirstRoundRogueEnhance 触发
            // [2026-10-03 莉莉子 · 进攻标识三层分离 ①] 原先这里有一段「firstAttacker === 'enemy' ⇒ 手动覆盖 attackToken/turnOwner」，
            //   现已收进 `calculateRoundStart(game, firstAttacker)`（先手方占奇数回合）⇒ 补偿删除，只留一处坐标系。

            // ★ 覆盖教程模式的水晶初始 HP（在 startRound 之后执行，确保最终生效）
            if (tutorialInit?.playerCrystalHp !== undefined || tutorialInit?.enemyCrystalHp !== undefined) {
                setGame(prev => ({
                    ...prev,
                    playerNexus: tutorialInit.playerCrystalHp ?? prev.playerNexus,
                    enemyNexus: tutorialInit.enemyCrystalHp ?? prev.enemyNexus,
                }));
            }

            // ★ 覆盖教程模式的初始法力（在 startRound 之后执行，确保最终生效）
            if (tutorialInit?.playerMana !== undefined || tutorialInit?.playerMaxMana !== undefined
                || tutorialInit?.enemyMana !== undefined || tutorialInit?.enemyMaxMana !== undefined) {
                setGame(prev => ({
                    ...prev,
                    playerMana: tutorialInit.playerMana ?? prev.playerMana,
                    playerMaxMana: tutorialInit.playerMaxMana ?? prev.playerMaxMana,
                    enemyMana: tutorialInit.enemyMana ?? prev.enemyMana,
                    enemyMaxMana: tutorialInit.enemyMaxMana ?? prev.enemyMaxMana,
                }));
            }
        }
    }, [isSandbox, firstAttacker, tutorialInit]);


    const replaceOpeningHand = async (indicesToReplace: number[]) => {
        if (indicesToReplace.length === 0) return;

        // 1. 获取要替换的卡牌
        const cardsToReplace = indicesToReplace.map(index => playerHand[index]);

        // 3. 将被替换的卡洗回牌库 (简单处理：加到末尾并洗牌，或者随机插入)
        // 这里我们模拟洗牌：先合并，再打乱
        let newDeck = [...playerDeck, ...cardsToReplace];
        newDeck = newDeck.sort(() => Math.random() - 0.5);

        // [新增] 触发洗牌音效
        eventBus.emit(GameEvents.SFX_SHUFFLE);

        // 4. 从新牌库中抽取等量的新卡
        const numToDraw = indicesToReplace.length;
        const newCards = newDeck.slice(0, numToDraw);
        const remainingDeck = newDeck.slice(numToDraw);

        const finalHand = [...playerHand];
        let newCardIdx = 0;
        indicesToReplace.forEach(handIndex => {
            finalHand[handIndex] = newCards[newCardIdx++];
        });

        // 模拟网络延迟或洗牌时间
        await wait(500);

        setPlayerDeck(remainingDeck);
        setPlayerHand(finalHand);
    };

    const performMulligan = async (indicesToReplace: number[]) => {
        const currentHand = [...playerHand];
        const currentDeck = [...playerDeck];

        // 1. 处理玩家换牌逻辑
        if (indicesToReplace.length > 0) {
            const cardsToReplace = indicesToReplace.map(i => currentHand[i]);
            // 从牌库顶抽新牌
            const newCards = currentDeck.splice(0, indicesToReplace.length);
            // 旧牌洗回牌库
            const newDeck = shuffleDeck([...currentDeck, ...cardsToReplace]);

            // [新增] 触发洗牌音效
            eventBus.emit(GameEvents.SFX_SHUFFLE);

            // 替换手牌中的对应位置
            let newCardIdx = 0;
            indicesToReplace.forEach(i => {
                currentHand[i] = newCards[newCardIdx++];
            });

            setPlayerDeck(newDeck);
            setPlayerHand(currentHand);
        }

        // 2. [关键] 给敌方发牌 (此时才发，确保安全)
        const currentEnemyDeck = [...stateRef.current.enemyDeck];
        const enemyStartingHand = currentEnemyDeck.splice(0, 4);
        // [修复] 修正命名冲突导致的错误拼写，使用真实的状态更新器
        setEnemyDeckState(currentEnemyDeck);
        setEnemyHand(enemyStartingHand);

        // 3. 模拟动画延迟
        await new Promise(resolve => setTimeout(resolve, 800));

        // 4. [核心修复] 强制设置 Round 1 状态
        // 不依赖 startRound()，而是直接写入第一回合的正确状态
        // 这样可以确保 Mana, AttackToken 等资源一步到位
        setGame(prev => ({
            ...prev,
            round: 1,               // 第1回合
            // [2026-10-06 独立审查修复 · 跨局泄漏] 本条同样"铺 prev + 直接写 round:1"，
            //   绕过 `calculateRoundStart` 的 round-0 清零 ⇒ 显式清授予账本，
            //   否则上一局遗留的 `seq > handled` 会在新局回合 1 触发一次**凭空的**「获得进攻标识时」。
            tokenGrantSeq: { player: 0, enemy: 0 },
            tokenGrantHandled: { player: 0, enemy: 0 },
            phase: 'main',          // 进入主阶段
            turnOwner: 'player',    // 奇数回合玩家先手
            playerMana: 1,          // 玩家1费
            playerMaxMana: 1,
            playerSpellMana: 0,
            enemyMana: 1,           // 敌方1费
            enemyMaxMana: 1,
            enemySpellMana: 0,
            attackToken: { player: 'normal', enemy: null }, // 玩家获得进攻币
            consecutivePasses: 0
        }));

        eventBus.emit(GameEvents.ROUND_START, { round: 1 });
        setMessage("ROUND 1 START");
    };

    const requeueHandToDeck = () => {
        console.log(`[Mulligan] requeueHandToDeck — 手牌数=${playerHand.length} 牌库数=${playerDeck.length} 手牌内容=${playerHand.map(c => c.key)}`);
        // 将手牌(4张)加到牌库最前面
        setPlayerDeck(prev => [...playerHand, ...prev]);
        // 清空手牌，等待 drawCards 重新抽取
        setPlayerHand([]);
    };

    // ==========================================
    // ==========================================
    // ★ 选择模式接入点 ⑨ — 每个 select_* step 的确认执行函数
    //    已实现: select_bench → confirmReplacePlay | select_discard → confirmValerieDiscard | select_hand_target → confirmHandTargetSelect
    //    未来: select_enemy_bench → confirmEnemyBenchSelect | select_enemy_hand → confirmEnemyHandSelect
    // ==========================================

    // [2026-07-20 替换打出] 确认替换 — 玩家选了要替换的备战席单位后调用
    const confirmReplacePlay = () => {
        const sc = stateRef.current.game.spellCasting;
        const activeCard = stateRef.current.game.activeCard;
        if (!sc || sc.step !== 'select_bench' || !activeCard) return;

        const selectedTarget = sc.targets[0];
        if (!selectedTarget) return;

        const oldBench = stateRef.current.playerBench;
        const oldUnitIndex = oldBench.findIndex(c => c.id === selectedTarget.id);
        if (oldUnitIndex === -1) return;

        // =====================================
        // [2026-10-05 莉莉子 BUG修复 · 20261005-04] **替换打出也要记账**（play_card 探针的补洞）
        // ── 病根：`playCard` 里的 play_card 探针写在「备战席满员 → 进 select_bench 并 return」**之后**
        //    ⇒ 走「选择一个单位替换」打出的卡**一次都不计数**，被静默吞掉的任务包括：
        //      · 15 个皮肤成就（`missionData.ts:162+`「在对局中累计打出 X 5 次」）
        //      · 各"打出指定卡牌"类任务（play_card）
        //      · 「携带 XX 小队：作战成功」的**旧**实现（查 play_card ⇒ 第三名成员常走替换 ⇒ 永远判不过）
        // ── 位置刻意放在两道守卫**之后**：只有"真的换成了"才算打出过，非法目标/取消不记。
        // =====================================
        gameLogger.logEvent({
            type: 'play_card',
            turn: stateRef.current.game.round,
            isPlayerSide: true,
            cardKey: activeCard.key,
        });

        // 1. 标记旧单位为「消亡」并发送碎裂事件
        const eliminatedUnit = { ...oldBench[oldUnitIndex], deathType: 'ELIMINATED' as const };
        eventBus.emit('unit_eliminated', { card: eliminatedUnit });

        // 2. 构建新单位，继承旧单位的 DOM id
        // [2026-08-08 莉莉子修复] 直接继承手牌单位实例而非从卡库重建——
        // 此前 createFullCard 会重置 buffs/roundBuffs=0，替换打出时把穆林等牌库 BUFF 全部清空了
        const newUnit = { ...activeCard };
        newUnit.id = eliminatedUnit.id;
        const newCardWithAbility = newUnit.ability
            ? { ...newUnit, abilityState: 'breathing' as const, abilityCharges: newUnit.ability.maxCharges }
            : newUnit;

        // 3. 替换到备战席
        const newBench = oldBench.map((c, i) => i === oldUnitIndex ? newCardWithAbility : c);
        setPlayerBench(newBench);
        setGame(prev => ({ ...prev, activeCard: null, spellCasting: null }));
        setMessage(`替换完成：${eliminatedUnit.name} → ${activeCard.name}`);
        eventBus.emit(GameEvents.SFX_PLAYER_PLAY_UNIT);

        // 4. 触发 ON_PLAY 效果（战吼）
        if (newUnit.effects && newUnit.effects.length > 0) {
            // [2026-09-22 莉莉子] 纯 GameState 快照：原写法额外塞了 playerBench，而 processEffect
            // 全程不读 context.game.playerBench（bench 走 ctx.playerBench 单独传），
            // 保留该冗余字段会让下面写回时把脏字段带进 GameState。
            let tempGame = { ...stateRef.current.game };
            let tempPlayerBench = [...newBench];
            let tempEnemyBench = [...stateRef.current.enemyBench];
            let tempCombatField = [...stateRef.current.combatField];

            newUnit.effects.forEach(effId => {
                const def = EFFECT_DB[effId];
                // [2026-10-06 程拍板 · 时机口径统一] 「替换打出」**也是从手牌打出** ⇒ 两条时机都放行
                //   （口径与 playCard 的入场发动机一致；`includes` 子串匹配已废弃）。
                if (def && (isEntryTiming(def.timing) || isPlayFromHandTiming(def.timing))) {
                    const ctx: EffectContext = {
                        game: tempGame,
                        playerBench: tempPlayerBench,
                        enemyBench: tempEnemyBench,
                        playerHand: stateRef.current.playerHand,
                        enemyHand: stateRef.current.enemyHand,
                        playerDeck: stateRef.current.playerDeck,
                        enemyDeck: stateRef.current.enemyDeck,
                        combatField: tempCombatField,
                        owner: 'player',
                        sourceCard: newUnit,
                        // [2026-10-05 莉莉子 BUG修复] 补传 `createFullCard`（满场"替换打出"的 ON_PLAY，露米飞剑2 走这里）
                        createFullCard,
                    };
                    const res = processEffect(effId, [], ctx);
                    tempGame = res.game;
                    tempPlayerBench = res.playerBench;
                    tempEnemyBench = res.enemyBench;
                    if (res.combatField) tempCombatField = res.combatField;
                    if (res.playerDeck) setPlayerDeck(res.playerDeck);
                    if (res.enemyDeck) setEnemyDeckState(res.enemyDeck);
                    if (res.playerHand) setPlayerHand(res.playerHand);
                    if (res.enemyHand) setEnemyHand(res.enemyHand);
                }
            });

            // ==========================================
            // [2026-09-22 莉莉子 BUG修复] 补齐入场（战吼）效果的写回
            // 原实现只把 res.playerDeck / playerHand / enemyHand 写回 React，
            // 而下面这些变更全部只落在局部变量上、随函数结束被静默丢弃：
            //   · res.game      → 安·校准（calibratePending）、茉莉安入场「贴重生亡语」（2026-10-02 取代原「补兵券」）、
            //                     全局光环账本（everywhereBuffs）、入场获得的法力（GRANT_MANA）等
            //   · enemyBench    → 入场效果对敌方备战席的改动（如装备3·备战爆破）
            //   · combatField   → 入场召唤直送交战区的单位（如飞剑）
            // 症状即粉丝反馈的「场面已满替换打出时，安的入场校准不触发」。
            // 口径对齐 playCard 正常上场路径（setPlayerBench / setEnemyBench / setCombatField + setGame(tempGame)）。
            // ==========================================
            setPlayerBench(tempPlayerBench);
            setEnemyBench(tempEnemyBench);
            setCombatField(tempCombatField);
            setGame(prev => ({ ...prev, ...tempGame, activeCard: null, spellCasting: null }));
        }

        // [2026-08-12 装备系统] 替换打出同样触发装备打出效果（对敌方备战席造成伤害）
        // [2026-10-04 莉莉子 BUG修复] 与 ON_PLAY 路径同口径：传「双方席位 + owner」。
        //   本函数是**玩家专用**（第 5256 行固定取 stateRef.current.playerBench、固定发玩家音效），
        //   故 owner 恒为 'player' —— 但**仍走同一个入口**，避免将来 AI 也用替换流程时再踩一次。
        const equipStruck = executeEquipmentOnPlay(
            { playerBench: stateRef.current.playerBench, enemyBench: stateRef.current.enemyBench },
            newUnit,
            'player',
        );
        if (equipStruck) {
            if (equipStruck.side === 'player') setPlayerBench(equipStruck.bench);
            else setEnemyBench(equipStruck.bench);
        }

        // 5. 触发入场语音
        eventBus.emit(GameEvents.PLAY_CARD_VOICE, newUnit);
    };

    // ==========================================
    // [2026-07-17 鸦眼小队] 确认校准 — 玩家选完卡后调用
    // ==========================================
    const confirmCalibrate = (selectedCardId?: string) => {
        const pending = game.calibratePending;
        if (!pending) return;

        let newDeck = [...pending.deckMinus];
        const drawn = [...pending.drawnCards];

        if (selectedCardId) {
            // 有选中：选中卡放牌库顶，其余回原位
            const selected = drawn.find(d => d.card.id === selectedCardId);
            if (!selected) return;

            // 选中卡放顶部
            newDeck.unshift(selected.card);

            // 剩余卡按原始索引降序排列回插，避免索引偏移
            const remaining = drawn.filter(d => d.card.id !== selectedCardId);
            remaining.sort((a, b) => b.originalIndex - a.originalIndex);

            remaining.forEach(d => {
                const cardsBefore = drawn.filter(
                    x => x.card.id !== selectedCardId && x.originalIndex < d.originalIndex
                ).length;
                const insertAt = Math.max(0, Math.min(d.originalIndex - cardsBefore, newDeck.length));
                newDeck.splice(insertAt, 0, d.card);
            });

            console.log(`[Calibrate] 玩家选择了 ${selected.card.name}，放回牌库顶`);

            // [2026-07-17 鸦眼小队] 海基校准光环：未选中的卡获得 buff
            const isPlayer = pending.owner === 'player';
            const ownerBench = isPlayer ? playerBench : enemyBench;

            // 统计海基数量（备战席 + 交战区）
            let hikiCount = ownerBench.filter(c => c.key === 'Crows_Eyest_Squad_Hiki' && !c.isDead).length;
            combatField.forEach(fight => {
                const unit = fight.owner === pending.owner ? fight.attacker : fight.blocker;
                if (unit && unit.key === 'Crows_Eyest_Squad_Hiki' && !unit.isDead) {
                    hikiCount++;
                }
            });

            if (hikiCount > 0) {
                const nonSelected = drawn.filter(d => d.card.id !== selectedCardId);
                nonSelected.forEach(d => {
                    const deckIdx = newDeck.findIndex(c => c.id === d.card.id);
                    if (deckIdx !== -1) {
                        const card = newDeck[deckIdx];
                        if (card.type?.includes('unit')) {
                            card.buffs = {
                                power: (card.buffs?.power || 0) + hikiCount,
                                health: (card.buffs?.health || 0) + hikiCount,
                            };
                        } else if (card.type?.includes('spell')) {
                            card.cost = Math.max(0, (card.cost || 0) - hikiCount);
                            card.customProgress = (card.customProgress || 0) | 2; // [2026-07-17] 标记绿色费用
                        }
                    }
                });
                console.log(`[Calibrate] 海基光环触发：${hikiCount}只海基在场，${nonSelected.length}张未选中卡获得buff`);
            }
        } else {
            // 无选中：全部回原位（按原始索引降序）
            drawn.sort((a, b) => b.originalIndex - a.originalIndex);
            drawn.forEach(d => {
                newDeck.splice(d.originalIndex, 0, d.card);
            });
            console.log(`[Calibrate] 玩家放弃选择，全部放回原位`);
        }

        // 更新牌库，清除校准状态
        if (pending.owner === 'player') {
            setPlayerDeck(newDeck);
        } else {
            setEnemyDeckState(newDeck);
        }
        // ==========================================
        // [2026-10-03 莉莉子 BUG修复 · 校准面板互相挤掉]
        //   收尾时若**队列里还有校准请求** ⇒ 立刻出队（而不是直接清空 pending），
        //   否则后触发的校准会**静默消失**（比覆盖更糟：那次校准白打了）。
        //   ⚠️ 出队时**现抽**候选牌，不再沿用排队那一刻的快照：
        //      · 同侧（如安 + 穆林同一回合）⇒ 用刚写好的 `newDeck`
        //      · 异侧（AI 的校准排在玩家之后）⇒ 用对方**当前**牌库（本次确认没动过它）
        // ==========================================
        const nextReq = (game.calibrateQueue ?? [])[0];
        if (nextReq) {
            const sameOwner = nextReq.owner === pending.owner;
            const baseDeck = sameOwner
                ? newDeck
                : (nextReq.owner === 'player' ? stateRef.current.playerDeck : stateRef.current.enemyDeck);
            const built = buildCalibrateDraw(baseDeck, nextReq.owner, nextReq.count);
            // [2026-10-03 防御] 排队期间牌库可能已被抽空 ⇒ 弹 0 张面板会让 AI 自动选择 `cards[0].card` 崩掉
            if (built.drawnCards.length === 0) {
                console.warn('[Calibrate] 出队时牌库已空 ⇒ 跳过本次及其后排队的校准');
                setGame(prev => ({ ...prev, calibratePending: undefined, calibrateQueue: [] }));
                setMessage('牌库已空，校准跳过');
                return;
            }
            // ⚠️ 同样**不在这里写牌库** —— 出队只是把下一场校准挂上，
            //    牌库仍按"确认时才落库"的既有语义走（见 effectProcessor 的 CALIBRATE 分支注释）。
            setGame(prev => ({
                ...prev,
                calibratePending: { drawnCards: built.drawnCards, deckMinus: built.deckMinus, owner: nextReq.owner },
                calibrateQueue: (prev.calibrateQueue ?? []).slice(1),
            }));
            console.log(`[Calibrate] 出队：${nextReq.owner} 的校准接着弹（剩余队列 ${(game.calibrateQueue ?? []).length - 1}）`);
            setMessage('校准完成 · 下一场校准排队中');
            return;
        }
        setGame(prev => ({ ...prev, calibratePending: undefined }));
        setMessage(selectedCardId ? '校准完成' : '放弃校准');
    };

    // ==========================================
    // [新增] 统一升级系统 - 队列操作方法
    // ==========================================
    const queueLevelUp = (card: CardData) => {
        // [新增] 阵亡隔离锁：死者严禁入队升级！
        // 即使英雄达成了条件，只要此时它的状态是死亡或消散，直接没收排队券
        // ══════════════════════════════════════════════════════════════════
        // [2026-10-10 莉莉子 BUG修复] 判据由"只看 `animState`"改为**统一存活判据**
        //   `isStrikeTargetAlive`（与升级扫描那处同口径，见本文件升级扫描段的注释）：
        //   法术路径（单挑 / 王见王）打死人**只累加 `damageTaken`**、`animState` 只写 `'hit'`
        //   ⇒ 只看 animState 拦不住，死者照样拿到排队券。
        //   `isStrikeTargetAlive` 额外覆盖 `!isDead` 与"真实血量 ≤ 0"（与 combat.ts 的 `getCurrentHP` 同构）。
        // ⚠️ 边界说明：本函数收到的是**升级后（Lv2）**的卡（唯一调用点 :4249 传的是 `leveledCard`），
        //    而 Lv2 的 `health` 比 Lv1 高（里芙 +1）⇒"刚好被打满"这种边界在 Lv2 卡上算不出来；
        //    那条边界由**上游唯一调用点自己的 Lv1 存活门**兜住（combat.ts:499 / 512 的
        //    `getCurrentHP(newAttacker) > 0`）。本函数这一道是**结构性兜底**（isDead / 消散态），
        //    且**绝无误杀**：Lv2 生命 ≥ Lv1 ⇒ 上游判活的卡在这里必然也判活。
        // ══════════════════════════════════════════════════════════════════
        // ⚠️ 先把名字取出来：`isStrikeTargetAlive` 是**类型守卫**（`c is CardData`），
        //    写成 `if (!isStrikeTargetAlive(card))` 后假分支里 `card` 会被 TS 收窄成 `never` ⇒ `card.name` 报错。
        const rejectedHeroName = card.name;
        if (!isStrikeTargetAlive(card)) {
            console.log(`[LevelUp System] 拒绝入队：英雄 ${rejectedHeroName} 已阵亡。`);
            return;
        }

        // [新增] 军功审计探针：记录英雄成功升级 (用于卜卜卡背等任务)
        // 从战场快照中确认该英雄是否属于我方
        const isPlayerHero = stateRef.current.playerBench.some(c => c.id === card.id) ||
                             stateRef.current.combatField.some(f => (f.owner === 'player' && f.attacker.id === card.id) || (f.owner === 'enemy' && f.blocker?.id === card.id));

        if (isPlayerHero) {
            gameLogger.logEvent({ type: 'level_up', turn: stateRef.current.game.round, isPlayerSide: true, cardKey: card.key });
        }

        setGame(prev => ({
            ...prev,
            pendingLevelUps: [...prev.pendingLevelUps, card]
        }));
    };

    const popLevelUp = () => {
        setGame(prev => ({
            ...prev,
            pendingLevelUps: prev.pendingLevelUps.slice(1) // 移除队列第 0 位
        }));
    };

    // [2026-07-09 瓦莱莉] 确认弃牌选择并执行召唤
    const confirmValerieDiscard = () => {
        const sc = stateRef.current.game.spellCasting;
        if (!sc || sc.step !== 'select_discard') return;
        const selectedIds = sc.targets.map((t: any) => t.id);
        const discardCount = selectedIds.length;

        // 1. 从手牌移除弃置的卡牌（**值式一次提交**：本函数后面要用同一份快照驱动门铃）
        const handNow = stateRef.current.playerHand.filter((c: any) => !selectedIds.includes(c.id));

        // 2. 瓦莱莉上场 —— ⚠️ [2026-10-06 独立审查修复 · P0 **本函数是回归点**]
        //    **必须与下面的猫头鹰合成"同一次提交"**：原来这里是函数式
        //    `setPlayerBench(prev => [...prev, valerie])`，而猫头鹰那步是**值式**提交
        //    （底取自 `stateRef`、**不含**瓦莱莉）⇒ React 里值式提交会**覆盖**排队中的函数式更新
        //    ⇒ **瓦莱莉根本不上场、位置被猫头鹰顶掉**。现改为在本地数组里先放她，再一次性提交。
        const activeCard = stateRef.current.game.activeCard;
        const benchWithValerie = activeCard
            ? [...stateRef.current.playerBench, { ...activeCard, animState: 'idle' as const }]
            : stateRef.current.playerBench;

        // 3. 召唤夜巡猫头鹰（带 +X/+X）+ 补「入场」门铃
        if (discardCount >= 0) {
            const owl = createCard('Night_Owl');
            owl.buffs = {
                power: discardCount,
                health: discardCount
            };
            owl.customProgress = discardCount;
            // =====================================
            // [2026-10-06 程拍板 · A 方案] **先落场、再补「入场」门铃**
            //   （本站点是 hook 直塞，此前召唤出来的猫头鹰拿不到入场效果 / `on_summon` 强化）
            //   ⚠️ 手牌用**过滤后**的那份（`handNow`）—— 直接读 stateRef 会把刚弃掉的牌捞回来
            //   ⚠️ 备战席用**含瓦莱莉的那份**（`benchWithValerie`）—— 见上面 P0 说明
            // =====================================
            const benchWithOwl = [...benchWithValerie, owl];
            setPlayerBench(benchWithOwl);
            stateRef.current.playerBench = benchWithOwl; // 同步快照（门铃要靠它找到这只猫头鹰）
            setPlayerHand(handNow);
            stateRef.current.playerHand = handNow;
            const entry = runSummonEntry(owl.id, 'player', {
                game: stateRef.current.game,
                playerBench: benchWithOwl,
                enemyBench: stateRef.current.enemyBench,
                playerHand: handNow,
                enemyHand: stateRef.current.enemyHand,
                playerDeck: stateRef.current.playerDeck,
                enemyDeck: stateRef.current.enemyDeck,
                combatField: stateRef.current.combatField,
            }, createFullCard);
            if (entry.applied) {
                // [2026-10-06 独立审查修复 · P1] **只在真的变了时才值式提交** ——
                //   否则会把同 tick 里排队中的更新（例如上面刚排的手牌过滤）回滚掉。
                const gameBefore = stateRef.current.game;
                if (entry.playerBench !== benchWithOwl) { setPlayerBench(entry.playerBench); stateRef.current.playerBench = entry.playerBench; }
                if (entry.enemyBench !== stateRef.current.enemyBench) { setEnemyBench(entry.enemyBench); stateRef.current.enemyBench = entry.enemyBench; }
                if (entry.playerHand !== handNow) { setPlayerHand(entry.playerHand); stateRef.current.playerHand = entry.playerHand; }
                if (entry.enemyHand !== stateRef.current.enemyHand) { setEnemyHand(entry.enemyHand); stateRef.current.enemyHand = entry.enemyHand; }
                if (entry.game !== gameBefore) { setGame(entry.game); stateRef.current.game = entry.game; }
                if (entry.playerDeck && entry.playerDeck !== stateRef.current.playerDeck) { setPlayerDeck(entry.playerDeck); stateRef.current.playerDeck = entry.playerDeck; }
                if (entry.enemyDeck && entry.enemyDeck !== stateRef.current.enemyDeck) { setEnemyDeckState(entry.enemyDeck); stateRef.current.enemyDeck = entry.enemyDeck; }
                if (entry.combatField && entry.combatField !== stateRef.current.combatField) { setCombatField(entry.combatField); stateRef.current.combatField = entry.combatField; }
            }
            setMessage(`瓦莱莉弃置了 ${discardCount} 张牌，召唤了 ${discardCount + 1}/${discardCount + 1} 的夜巡猫头鹰`);
        }

        // 4. 清除选择状态
        setGame(prev => ({
            ...prev,
            activeCard: null,
            spellCasting: null,
            phase: 'main',
            lastActionTimestamp: Date.now()
        }));
    };

    // [2026-07-14 通用] 统一手牌选择确认 — 上场 activeCard + processEffect 执行效果
    const confirmHandTargetSelect = () => {
        const sc = stateRef.current.game.spellCasting;
        const activeCard = stateRef.current.game.activeCard;
        if (!sc || sc.step !== 'select_hand_target' || !activeCard) return;

        const selectedIds = sc.targets.map((t: any) => t.id);
        if (selectedIds.length === 0) { setMessage("请选择手牌"); return; }

        // 1. activeCard 上场
        const updatedBench = [...stateRef.current.playerBench, { ...activeCard, animState: 'idle' as const }];

        // 2. 构造 context（bench 已包含 activeCard，手牌保留以供 processEffect 处理）
        const effectKey = activeCard.effects?.[0];
        const targets = selectedIds.map(id => ({ type: 'ally' as const, id }));
        const ctx: EffectContext = {
            game: stateRef.current.game,
            playerBench: updatedBench,
            enemyBench: stateRef.current.enemyBench,
            playerHand: stateRef.current.playerHand,
            enemyHand: stateRef.current.enemyHand,
            playerDeck: stateRef.current.playerDeck,
            enemyDeck: stateRef.current.enemyDeck,
            combatField: stateRef.current.combatField,
            owner: 'player',
            sourceCard: activeCard,
            // [2026-10-05 莉莉子] 与其它 EffectContext 站点保持一致（防御性补传；本路径当前不触达 FLYING_SWORD）
            createFullCard,
        };

        // 3. 执行效果（如果有）
        if (effectKey) {
            const res = processEffect(effectKey, targets, ctx);
            if (res.playerBench) setPlayerBench(res.playerBench);
            if (res.playerHand) setPlayerHand(res.playerHand);
            if (res.playerDeck) setPlayerDeck(res.playerDeck);
            if (res.enemyHand) setEnemyHand(res.enemyHand);
            if (res.combatField) setCombatField(res.combatField);
            if (res.game) setGame(res.game);
            relayEffectEvents(res.events); // [2026-09-19] 转发伤害事件（飘字 + 受击音都靠它）
            res.events?.forEach(evt => {
                if (evt.type === 'summon') {
                    eventBus.emit(GameEvents.SFX_SUMMON);
                }
            });
        } else {
            // 没有 effectKey → 只上场（安全 fallback）
            setPlayerBench(updatedBench);
        }

        // 4. 清除施法状态
        setGame(prev => ({
            ...prev,
            activeCard: null,
            spellCasting: null,
            phase: 'main',
            lastActionTimestamp: Date.now()
        }));
    };

    // [2026-07-22 莉莉子] 手牌卡片动画完成 → 从手牌移除
    const onHandAnimComplete = useCallback((cardId: string, owner: 'player' | 'enemy') => {
        // [2026-08-04 莉莉子] 广播手牌离场动画完成，供 useRoundLifecycle 等待瞬逝动画播完
        eventBus.emit(GameEvents.HAND_DISCARD_ANIM_DONE, { cardId, owner });
        if (owner === 'player') {
            setPlayerHand(prev => prev.filter(c => c.id !== cardId));
            stateRef.current.playerHand = stateRef.current.playerHand.filter(c => c.id !== cardId);
        } else {
            setEnemyHand(prev => prev.filter(c => c.id !== cardId));
            stateRef.current.enemyHand = stateRef.current.enemyHand.filter(c => c.id !== cardId);
        }
    }, []);

    // ==========================================
    // [2026-09-11 莉莉子 死锁逃生·第三道] 交战区不变量守卫
    // 设计铁律：main（静默阶段）时交战区必须为空——单位只在一脚打击的生命周期内进交战区。
    // 但既有三道保险各有盲区，合起来漏掉了"phase 非 animating 却残留单位"这一格：
    //   · try/catch/finally 逃生 → 只管 animating 异步链抛异常的场合
    //   · animating 看门狗（下方）→ 只在 phase==='animating' 时工作，main 直接 return
    //   · 回合末归位安全网 → 要等这一回合真的结束才跑得到；而 passTurn 的白名单又规定
    //     "只有 main 才允许结束回合"（见 passTurn 残留阶段 warn 分支）→ 两边互相等，
    //     单位就杵在交战区里，玩家看到"非进攻/格挡回合中单位卡死在战场上"。
    // 本守卫专盯"phase=main 但交战区有人"这种自相矛盾态，稳定超时后把幸存者领回备战席。
    //
    // 三重防误伤：
    //   1) 只认 main —— attack_declare/block_declare/react_to_block 合法持人（玩家正在点选/格挡），
    //      一律不碰；这几个阶段即便异常也由玩家"取消进攻/确认进攻"和自动推进引擎兜住，不是死锁。
    //   2) 排除飞剑 —— 飞剑有专属守卫 effect 负责拉回 block_declare（见文件上方飞剑守卫），
    //      两处若同时动手会抢节奏，故此处让位。
    //      [2026-09-26 T17 猎影标记] 同理排除「额外攻击战线」：settleStack 把 phase 切到 block_declare
    //      之前，交战区会先带着该战线短暂停留在 main —— 而 settleStack 排在 resolveStack 的**升级等待
    //      循环之后**（最长 20s），一旦超 1200ms，本守卫会把强制战斗**静默收回备战席**。
    //   3) 稳定窗口 —— 先挂起再复核：正常路径 setGame(phase:'main') 与 setCombatField([])
    //      是同一批次提交的，绝不会被这个窗口误判；只有"矛盾态真的持续"才动手。
    // 应急归位本身幂等（已在备战席的按 id 跳过），与其它三道保险可共存、无重复入席风险。
    // ==========================================
    const COMBAT_ORPHAN_STABLE_MS = 1200;
    useEffect(() => {
        // [2026-09-13 莉莉子 L2-A] 沙盒默认不干预；打开「守卫照跑」后照常执行，用于贴近真机复现
        if (isSandbox && !sandboxGuardEnabled) return;
        if (game.gameResult) return;                    // 对局已结束
        if (game.phase !== 'main') return;              // 战斗/结算阶段合法持人
        if (combatField.length === 0) return;
        if (combatHasFlyingSword(combatField)) return;  // 飞剑让位给专属守卫
        if (combatHasExtraAttack(combatField)) return;  // [2026-09-26 T17] 额外攻击战线同样让位（待 settleStack 切格挡）
        const timer = setTimeout(() => {
            const ref = stateRef.current;
            // 复核实时状态：期间若已回到战斗阶段 / 交战区已清空 / 飞剑现身 / 对局结束，都视作正常，放行
            if (ref.game.gameResult || ref.game.phase !== 'main') return;
            if (ref.combatField.length === 0) return;
            if (combatHasFlyingSword(ref.combatField)) return;
            if (combatHasExtraAttack(ref.combatField)) return; // [2026-09-26 T17] 同上：额外攻击战线让位
            console.warn('[CombatOrphanGuard] ⚠️ main 阶段交战区仍有单位滞留，执行应急归位', {
                round: ref.game.round, turnOwner: ref.game.turnOwner, consecutivePasses: ref.game.consecutivePasses,
                combatFieldLen: ref.combatField.length,
                units: ref.combatField.map((f: any) => `${f?.owner === 'player' ? 'P' : 'E'}:${f?.attacker?.key}${f?.blocker ? ' vs ' + f.blocker.key : ''}`),
            });
            recoverCombatSurvivors(ref.combatField, ref.playerBench, ref.enemyBench, {
                setPlayerBench, setEnemyBench, setCombatField, setGame,
            });
        }, COMBAT_ORPHAN_STABLE_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [game.phase, game.gameResult, combatField.length, isSandbox, sandboxGuardEnabled]);

    // ==========================================
    // [2026-09-03 莉莉子 死锁逃生] animating 停滞看门狗
    // phase 停在 animating 且超过 ANIM_STALL_MS 无心跳推进（正常长演出由 bumpAnimProgress 打点、
    // 升级影片/队列走下方豁免）→ 强制恢复 main + 交战区应急归位，防对局永久死锁。
    // 与各 try/finally 逃生互补：两处恢复都带 phase==='animating' 门 + 幂等，
    // 先触发者把 phase 置 main 后，另一侧读到非 animating 即空转。
    //
    // [2026-10-04 莉莉子 · AI 停机保护性修复] **豁免改为"限时 + 进展感知"**：
    //   病根：原实现只要 levelUpCard/队列非空就整体 return，连 interval 都不建 ⇒
    //   升级链一旦断掉（画面中途被撤、onComplete 没来），phase 停在 animating 就再无兜底 ——
    //   **唯一会永久卡死的状态，恰好被唯一的看门狗豁免掉了。**
    //   现在：豁免照旧（正常长演出不被误伤），但必须"看得见进展" ——
    //   以 (levelUpCard.id + 队列长度) 为进展指纹，指纹一变即刷新计时；
    //   连续 LEVELUP_STALL_GRACE_MS 不变 ⇒ 判定断链，强拆（**同时清队列 + 恢复 phase**，
    //   绝不再把 phase 留在 animating —— 那正是"AI 永久停机"的宿主状态）。
    // ==========================================
    const levelUpProgressRef = useRef<{ stamp: number; key: string }>({ stamp: Date.now(), key: '' });
    // [2026-10-04 独立审查 #5 修复] 暂停 / 页面不可见期间**不判定停滞**：
    //   60s 宽限是墙钟时间，而升级影片在暂停时会被按住（GameSession.tsx:275-290 会暂停根容器内所有 <video>），
    //   指纹自然不变 ⇒ 原实现会把"玩家暂停了一分钟"误判成断链，强拆掉一次**合法**升级
    //   （还会吞掉 TUTORIAL_LEVEL_UP_COMPLETE，让教程 resume_upgrade 永远等下去）。
    //   后台标签页节流 / 系统休眠是同一个签名，一并挡掉。
    const watchdogPausedRef = useRef(false);
    useEffect(() => {
        const onPause = () => { watchdogPausedRef.current = true; };
        const onResume = () => {
            watchdogPausedRef.current = false;
            // 恢复时刷新计时起点，避免把暂停时长算进宽限
            levelUpProgressRef.current = { stamp: Date.now(), key: '' };
        };
        eventBus.on(GameEvents.GAME_PAUSE, onPause);
        eventBus.on(GameEvents.GAME_RESUME, onResume);
        return () => {
            eventBus.off(GameEvents.GAME_PAUSE, onPause);
            eventBus.off(GameEvents.GAME_RESUME, onResume);
        };
    }, []);
    useEffect(() => {
        if (game.gameResult) return;
        // [2026-10-04 独立审查 #4 修复] 布防条件放宽：
        //   原来只在 `phase === 'animating'` 时布防，但 `levelUpCard` 会在别处写 phase 时**留在场上**
        //   （passTurn→confirmBlock 写 react_to_block、额外攻击守卫写 block_declare、回合末序列……），
        //   而 AI 的闸门这次新增了 `levelUpCard` ⇒ 那种组合会变成**没有任何兜底**的永久冻死。
        //   现在：只要"有人在升级"或"仍在 animating"，就布防。
        const levelUpPendingNow = !!game.levelUpCard || (game.pendingLevelUps ?? []).length > 0;
        if (game.phase !== 'animating' && !levelUpPendingNow) return;
        const iv = setInterval(() => {
            const g = stateRef.current.game;
            if (g.gameResult) return;
            const busy = !!g.levelUpCard || (g.pendingLevelUps ?? []).length > 0;
            if (g.phase !== 'animating' && !busy) return;

            // 暂停 / 不可见：不计时，并刷新计时起点（恢复后重新获得完整宽限）
            if (watchdogPausedRef.current || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) {
                levelUpProgressRef.current = { stamp: Date.now(), key: levelUpProgressRef.current.key };
                return;
            }

            // 进展指纹：升级链是否还在往前走（换人 / 出队都会改变它）
            const fp = `${g.levelUpCard?.id ?? '-'}|${(g.pendingLevelUps ?? []).length}`;
            if (fp !== levelUpProgressRef.current.key) {
                levelUpProgressRef.current = { stamp: Date.now(), key: fp };
            }
            const levelUpBusy = busy;

            if (levelUpBusy) {
                // 升级链豁免：但指纹迟迟不变 ⇒ 断链，强拆并**恢复 phase**（这一步原实现整个缺失）
                if (Date.now() - levelUpProgressRef.current.stamp < LEVELUP_STALL_GRACE_MS) return;
                console.error('[AnimWatchdog] 🚨 升级链停滞超时（演出已断链），强制清队列 + 恢复 main', {
                    round: g.round, turnOwner: g.turnOwner,
                    levelUpCard: g.levelUpCard?.key ?? null,
                    pendingLevelUps: (g.pendingLevelUps ?? []).map(c => c.key),
                    combatFieldLen: stateRef.current.combatField.length,
                });
                levelUpProgressRef.current = { stamp: Date.now(), key: '-|0' };
                setGame(prev => ({
                    ...prev,
                    levelUpCard: null,
                    pendingLevelUps: [],
                    phase: 'main' as const,
                    spellStack: [],
                    spellCasting: null,
                    activeCard: null,
                    consecutivePasses: 0,
                    lastActionTimestamp: Date.now(),
                }));
                // [2026-10-04 独立审查 #5 附带] 强拆绕过了 `LevelUpOverlay.onClose`
                //   （GameSession.tsx:2547 在那里发教程的"升级演出已完整播完"信号）
                //   ⇒ 教程的 resume_upgrade 会永远等下去。这里补发同一个信号。
                eventBus.emit(GameEvents.TUTORIAL_LEVEL_UP_COMPLETE);
                return;
            }

            // [2026-10-04 独立审查 #4 完成] 非 animating 阶段**不做** animating 停滞判定：
            //   上方 busy 分支已按"有人在升级"独立处理；这里恢复 animating 专属语义，
            //   免得 `animGuard.lastBump` 陈旧时对非 animating 阶段误跑战斗区应急归位。
            if (g.phase !== 'animating') return;

            if (Date.now() - animGuard.lastBump < ANIM_STALL_MS) return; // 仍在推进
            console.warn('[AnimWatchdog] ⚠️ animating 停滞超时，强制恢复 main', {
                phase: g.phase, round: g.round, turnOwner: g.turnOwner,
                spellStack: g.spellStack.map((s: any) => s.card?.key),
                combatFieldLen: stateRef.current.combatField.length,
                attackToken: g.attackToken,
                // [2026-10-10 莉莉子] 补**连斩链现场**（与 AI 看门狗同字段）——
                //   用来分辨"大招连斩还在逐击推进（只是慢）"还是"链死在半路"。
                //   📏 量级（已按程指正修正）：链最多清 6~7 个单位、每击 1s ⇒ **链本身只有几秒**；
                //      `MAX_CHAIN = 20` 只是护栏、不可达 ⇒ 别再把 20s 当解释。
                // [2026-10-10 莉莉子 · 二轮审查建议③] 补 `prevPhase` / `casterSide` / `skipBeacon` ——
                //   `prevPhase` 是本类问题（"链收尾还原成 animating"）**唯一**的判据，务必带上。
                pendingChain: g.pendingChain
                    ? {
                        step: g.pendingChain.step, done: g.pendingChain.done,
                        victimId: g.pendingChain.victimId,
                        prevPhase: g.pendingChain.prevPhase,
                        casterSide: g.pendingChain.casterSide,
                        skipBeacon: !!g.pendingChain.skipBeacon,
                      }
                    : null,
            });
            recoverCombatSurvivors(stateRef.current.combatField, stateRef.current.playerBench, stateRef.current.enemyBench, {
                setPlayerBench, setEnemyBench, setCombatField, setGame,
            });
            setGame(prev => prev.phase === 'animating'
                ? { ...prev, phase: 'main' as const, spellStack: [], spellCasting: null, activeCard: null,
                    consecutivePasses: 0, lastActionTimestamp: Date.now(),
                    // [2026-10-10 莉莉子 · 二轮独立审查后**撤回**] 这里刻意**不碰 `pendingChain`**：
                    //   曾试过"停滞时把未完成的链标 `done`"，审查证明它既没用又有害 ——
                    //   ① 正常链收尾时 `done` 已是 true ⇒ 三元返回**同一引用** ⇒ 驱动器不重跑 ⇒ 空操作；
                    //   ② 它用**新引用**唤醒驱动器 ⇒ 收尾分支按 `prevPhase` 写回时会把看门狗刚设的
                    //      `main` 顶掉 ⇒ 死链恢复反而慢一拍；
                    //   ③ 切后台 / 休眠唤醒后墙钟一跳，看门狗可能在**活链中途**开火 ⇒ 标 done 会
                    //      **掐掉剩余击数**（改动前不会）。
                    //   ⇒ 根因在别处：连斩把"链之前的 phase"录成了 `animating` 本身
                    //      （`effectProcessor.ts` 的 `prevPhase` 取值已修）；活链防误伤见连斩驱动器的**每击心跳**。
                  }
                : prev);
        }, 5000);
        return () => clearInterval(iv);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [game.phase, game.gameResult, game.levelUpCard, game.pendingLevelUps]);

    return {
        onHandAnimComplete,
        isAutoAdvancing, // [新增] 暴露出托管状态，供前台按钮实现"微反馈"补偿
        game, setGame,
        playerHand, setPlayerHand,
        enemyHand, setEnemyHand,
        playerBench, setPlayerBench,
        enemyBench, setEnemyBench,
        combatField, setCombatField,
        winningHeroKeys,
        message, setMessage,
        playerDeck,
        setPlayerDeck,     // [2026-09-13 P0] 沙盒造场：向玩家牌库投放卡牌
        enemyDeckState, // ✅ 敌方牌库的正确变量名
        setEnemyDeckState, // [2026-09-13 P0] 沙盒造场：向敌方牌库投放卡牌
        playerInitialDeckInfo,
        enemyInitialDeckInfo,

        actions: {
            startRound,
            triggerFirstRoundRogueEnhance, // [2026-08-15] 换牌后第一回合触发 round_start 强化（暗箭等）
            resetGame,
            initiateAttack,
            commitAttack,
            confirmBlock, // [核心修复 4] 暴露给 UI 层的按钮绑定！
            passTurn,
            playCard,
            resolveCombatAnimation,
            drawCards,
            instantDrawCards,
            startSpellCasting,
            updateSpellCasting,
            finalizeSpell: commitSpell, // 兼容 UI 层的旧版接口调用
            commitSpell,
            withdrawSpellFromStack,     // [新增] 暴露给前台用于点击撤回栈内法术
            toggleAttacker,
            judgeLifeAndDeath,  // [SBA] 生死簿同步判决
            selectBlocker,
            assignBlocker,
            recallBlocker,
            resolveStack,
            closeLevelUp: () => setGame(prev => ({...prev, levelUpCard: null})),
            resolveChoice,
            cancelChoice,      // [新增] 将取消抉择的权利正式赋予引擎内部动作
            selectChallenger, // [关键] 导出新增的函数
            challengeEnemy,    // [关键] 导出新增的函数
            aiChallengeUnit,   // [AI 挑战] AI 侧挑战玩家单位
            replaceOpeningHand,
            performMulligan, // [新增]
            confirmPendingSpell,
            cancelPendingSpell,
            confirmValerieDiscard, // [2026-07-09] 瓦莱莉弃牌确认
            confirmHandTargetSelect, // [2026-07-14] 统一手牌选择确认
            requeueHandToDeck,
            triggerGameStartGenerate, // [2026-07-27 安卡希雅] 第一回合开始时生成库效卡牌
            confirmCalibrate, // [2026-07-17 鸦眼小队] 确认校准
            confirmReplacePlay, // [2026-07-20 替换打出] 确认替换
            queueLevelUp,    // [新增] 暴露给战斗推演或事件监听，用于让英雄拿号排队
            popLevelUp,       // [新增] 暴露给 UI 层，用于在视频播放完毕后请英雄离场
            // [2026-09-13 莉莉子 L2-A] 沙盒守卫开关：打开后沙盒里的真机守卫照常执行
            setSandboxGuard: setSandboxGuardEnabled,
            sandboxGuardEnabled,
            // [2026-09-25 莉莉子 投降] 把玩家水晶清零 → 命中既有的战败判定（1106 行 finalResult='defeat'），
            //   于是结算/战绩/账号经验全部走"正常失败"那条路，**不需要改任何结算代码**
            surrenderGame: () => setGame(prev => ({ ...prev, playerNexus: 0 })),
        }
    };
};
