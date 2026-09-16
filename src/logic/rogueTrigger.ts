// ==========================================
// 悖论迷宫 · 统一触发引擎（串行分发器）
// [2026-09-09 莉莉子] 迷宫强化触发系统底层重构：
//   - 旧架构：各 hook（useGameState / useRoundLifecycle / useSpellSystem）散落 13 处
//     `getRogueDefs(...).forEach(def => { if (effectClass==='A') ... else if ... })`，
//     同一 trigger 的强化在同一同步 tick "并发"执行、各读旧快照各写 state，
//     导致同目标 effect 互相静默覆盖（寒霜压制 + 衰弱诅咒只有前者生效）、图标并列挤压。
//   - 新架构：effectClass → handler 注册表。同一 trigger 的强化按 priority **串行**
//     作用于同一份**可变工作快照 ctx**，后一个 effect 读到前一个已生效的最新战场
//     （实时重判天然成立）；闪烁按执行序逐个 flash，由视图层（RogueBuffFlash）排队播放。
//   - handler 铁律：只读写 ctx（不读 stateRef、不散装 setState）；闪烁在真正生效处按序 flash。
//     新增迷宫强化 = 数据加一条 + 这里注册一个 handler，不再触碰任何核心 hook。
// ==========================================
import { getRogueDefs, flashRogueBuff, applyPermanentBuff, pickRandomAlly, findStrongestUnit, applyStatBalance, applyStrikeEnhancement, isStrikeTargetAlive } from './rogueBattle';
import { applyFrostbite, getPower, getHealth } from './keywords';
import { eventBus, GameEvents } from '../utils/eventBus';
import type { MazeBuff, BattleTrigger, BattleEffectClass } from '../data/roguelike/buffs';
import type { CardData, GameState } from '../types';

export type Side = 'player' | 'enemy';

// ==========================================
// effectClass 缺省优先级（同 trigger 内：小者先执行）
// 规则：显式 def.battleEffect.priority ?? 本表 ?? 获取序（getRogueDefs 保序 → 稳定回落）
// ==========================================
export const EFFECT_CLASS_PRIORITY: Partial<Record<BattleEffectClass, number>> = {
    DUEL_STRONGEST: 0,        // 回合末王见王最先（跨双方效果，一次去重）
    ALL_BUFF: 5,              // 全体增益先于单点 targeting
    FREEZE_STRONGEST: 10,     // 冻结最先（数据层 freeze_strongest 亦显式 10）
    SET_STRONGEST_STATS: 20,  // 衰弱随后 → 对实时战场重判"当前最强"
};

/** 同 trigger 强化的确定性排序（priority 升序；同值按 defs 原序 = 获取序，Array.sort 稳定） */
export const sortRogueDefs = (defs: MazeBuff[]): MazeBuff[] =>
    [...defs].sort((a, b) => {
        const pa = a.battleEffect?.priority
            ?? (a.battleEffect ? EFFECT_CLASS_PRIORITY[a.battleEffect.effectClass] : undefined)
            ?? Number.MAX_SAFE_INTEGER;
        const pb = b.battleEffect?.priority
            ?? (b.battleEffect ? EFFECT_CLASS_PRIORITY[b.battleEffect.effectClass] : undefined)
            ?? Number.MAX_SAFE_INTEGER;
        return pa - pb;
    });

// ==========================================
// 触发附带事件信息（各 trigger 站点按需填写）
// ==========================================
export interface RogueTriggerInfo {
    playedCard?: CardData;        // on_play_unit / on_summon / on_first_play_unit：刚打出的单位（含能力初始化态）
    isFirstUnitPlayedThisRound?: boolean; // 预存的"本回合首个单位"标记（防暗影双生改写后失效）
    deadUnit?: CardData;          // unit_die：阵亡单位
    struckSide?: Side;            // on_nexus_strike：被击水晶方（'enemy' 被击 → 玩家强化触发）
    fight?: any;                  // after_attack/attacked：result.updatedFight（可变对象）
    duelDone?: boolean;           // round_end 王见王：跨双方 pass 去重
    resurrectedSide?: Side;       // unit_die：非全复活强化"每批首个"去重（站点在处理批前清空）
    tryMarkSummonOnce?: (side: Side, summonKey: string) => boolean; // game_start：按侧去重"本局已尝试召唤一次"（返回 true 允许召唤并记录；false 已尝试过）
}

export interface RogueDirty {
    bench: Set<Side>;
    hand: Set<Side>;
    deck: Set<Side>;
    field: boolean;
    game: boolean;
}

// ==========================================
// 可变工作快照：handler 全部读写这里，站点负责最终一次性 commit
// ==========================================
export interface RogueTriggerCtx {
    game: GameState;
    playerBench: CardData[];
    enemyBench: CardData[];
    combatField: any[];
    playerHand: CardData[];
    enemyHand: CardData[];
    playerDeck: CardData[];
    enemyDeck: CardData[];
    owner: Side;                       // 本 pass 强化来源方（该方享受友军增益）
    trigger: BattleTrigger;            // 当前触发时机（runRogueTrigger 每次覆盖）
    createFullCard: (key: string) => CardData;
    info: RogueTriggerInfo;
    dirty: RogueDirty;
}

export type RogueEffectHandler = (def: MazeBuff, ctx: RogueTriggerCtx) => void;

/**
 * 补丁式提交：把引擎在 seed 上做出的变更（被替换的卡 + 追加的新卡）以"函数式 updater"合成到 React 最新 prev。
 * 当 seed 来自滞后 stateRef（如快速开局：instantDrawCards 排队后同 tick 触发首回合强化）时，
 * 全量 setX(ctx 数组) 会把刚排队的抽卡覆盖掉；补丁式只改自己动的卡，prev 里的并发变化全部保留。
 * 返回是否有实际变更。
 */
export type SliceSetter = (fn: (prev: CardData[]) => CardData[]) => void;
export const commitSlicePatch = (seed: CardData[], result: CardData[], set: SliceSetter): boolean => {
    // id 级 diff：引擎对数组做 splice/push 会导致按索引比对全部错位（删除后数组位移 → 后面每张都被误判为"改过"）
    // → 一律按 id 对齐：changed=同 id 换对象、added=新 id、removed=seed 有而 result 无（如 CHAMPION 从牌库挪走）
    const seedIds = new Set(seed.map(c => c.id));
    const resultIds = new Set(result.map(c => c.id));
    const changed = new Map<string, CardData>();
    for (const c of result) {
        const s = seed.find(x => x.id === c.id);
        if (s && s !== c) changed.set(c.id, c);
    }
    const removed = new Set<string>();
    for (const c of seed) if (!resultIds.has(c.id)) removed.add(c.id);
    const added = result.filter(c => !seedIds.has(c.id));
    if (changed.size === 0 && removed.size === 0 && added.length === 0) return false;
    set(prev => {
        const out: CardData[] = [];
        for (const c of prev) {
            if (removed.has(c.id)) continue; // 引擎已从该切片移除（挪到别处）→ 从 prev 一并移除
            out.push(changed.get(c.id) ?? c);
        }
        for (const c of added) {
            if (!out.some(x => x.id === c.id)) out.push(c); // prev 已有（并发抽到同 id）则不重复补
        }
        return out;
    });
    return true;
};

// ==========================================
// 内部工具：ctx 侧访问 / 原地写回
// ==========================================
const sideBench = (ctx: RogueTriggerCtx, s: Side) => s === 'player' ? ctx.playerBench : ctx.enemyBench;
const sideHand = (ctx: RogueTriggerCtx, s: Side) => s === 'player' ? ctx.playerHand : ctx.enemyHand;
const sideDeck = (ctx: RogueTriggerCtx, s: Side) => s === 'player' ? ctx.playerDeck : ctx.enemyDeck;

/** 在备战席 + 交战区里按 id 找到单位，用纯函数 fn 产出新对象替换（只命中一次，含 dirty 记账） */
const updateUnitById = (ctx: RogueTriggerCtx, id: string, fn: (u: CardData) => CardData): boolean => {
    const replaceInBench = (cards: CardData[], side: Side): boolean => {
        const i = cards.findIndex(c => c.id === id);
        if (i < 0) return false;
        cards[i] = fn(cards[i]);
        ctx.dirty.bench.add(side);
        return true;
    };
    if (replaceInBench(ctx.playerBench, 'player')) return true;
    if (replaceInBench(ctx.enemyBench, 'enemy')) return true;
    for (let i = 0; i < ctx.combatField.length; i++) {
        const f = ctx.combatField[i];
        if (f?.attacker?.id === id) {
            ctx.combatField[i] = { ...f, attacker: fn(f.attacker as CardData) };
            ctx.dirty.field = true;
            return true;
        }
        if (f?.blocker?.id === id) {
            ctx.combatField[i] = { ...f, blocker: fn(f.blocker as CardData) };
            ctx.dirty.field = true;
            return true;
        }
    }
    return false;
};

/** 备战席末尾最近入场的单位（BUFF 类打出时机强化目标 = 刚打出的卡） */
const benchLast = (ctx: RogueTriggerCtx, s: Side): CardData | undefined => {
    const arr = sideBench(ctx, s);
    return arr.length > 0 ? arr[arr.length - 1] : undefined;
};

// ==========================================
// 效果 handler 注册表
// ==========================================
export const ROGUE_EFFECT_HANDLERS: Partial<Record<BattleEffectClass, RogueEffectHandler>> = {
    // ---- round_start / game_start：无条件生效类（总是闪） ----
    GENERATE: (def, ctx) => {
        // 暗箭难防：回合开始在手牌生成一张（可瞬逝）暗箭
        const genKey = def.battleEffect?.params?.generateKey as string | undefined;
        if (!genKey) return;
        const card = ctx.createFullCard(genKey);
        if (!card) return;
        if (def.battleEffect?.params?.isVolatile) card.keywords = [...(card.keywords || []), 'Volatile' as any];
        const hand = sideHand(ctx, ctx.owner);
        if (hand.length >= 10) return;
        hand.push(card);
        ctx.dirty.hand.add(ctx.owner);
        eventBus.emit('sfx_generate', card);
        flashRogueBuff(def);
    },

    RALLY: (def, ctx) => {
        // 战意盎然/狼群战术：回合开始备战
        const next = { ...ctx.game, attackToken: { ...ctx.game.attackToken } };
        next.attackToken[ctx.owner] = 'rally';
        ctx.game = next;
        ctx.dirty.game = true;
        eventBus.emit('gain_token_rally', { owner: ctx.owner });
        flashRogueBuff(def);
    },

    NEXUS_TOUGH: (def, ctx) => {
        // 固若金汤：我方水晶坚韧（受击伤害永久 -1）
        ctx.game = ctx.owner === 'player'
            ? { ...ctx.game, playerNexusTough: true }
            : { ...ctx.game, enemyNexusTough: true };
        ctx.dirty.game = true;
        flashRogueBuff(def);
    },

    NEXUS_HEAL: (def, ctx) => {
        // 愈战愈勇/不死之身：回合开始我方水晶回复
        const heal = (def.battleEffect?.params?.value as number) ?? 2;
        if (ctx.owner === 'player') {
            ctx.game = { ...ctx.game, playerNexus: Math.min(ctx.game.playerNexusMax ?? 20, ctx.game.playerNexus + heal) };
        } else {
            ctx.game = { ...ctx.game, enemyNexus: Math.min(ctx.game.enemyNexusMax ?? 20, ctx.game.enemyNexus + heal) };
        }
        ctx.dirty.game = true;
        eventBus.emit(GameEvents.NEXUS_HEALED, { target: ctx.owner, amount: heal });
        flashRogueBuff(def);
    },

    // ---- 条件生效类：有实际目标/动作才闪（对齐 2026-08-31 "仅实际生效才闪" 修复，并推广到全类）----
    RANDOM_ALLY_BUFF: (def, ctx) => {
        // 回合加护/战意高涨/法术共鸣/军势鼓舞/召唤浪潮/法术渗透/水晶共鸣/连击之势/回旋余力...
        // 随机我方单位永久 +N/+M（打出时机排除触发强化的打出卡）
        const power = (def.battleEffect?.params?.power as number) ?? 1;
        const health = (def.battleEffect?.params?.health as number) ?? 1;
        const excludeId = ctx.trigger === 'on_play_unit' ? ctx.info.playedCard?.id : undefined;
        const pick = pickRandomAlly(sideBench(ctx, ctx.owner), ctx.combatField, ctx.owner, excludeId);
        if (!pick) return;
        const buffed = applyPermanentBuff(pick, power, health);
        updateUnitById(ctx, pick.id, () => buffed);
        flashRogueBuff(def);
    },

    HAND_COST_DOWN: (def, ctx) => {
        // 战术储备：回合开始手牌随机单位卡费用 -1
        const amount = (def.battleEffect?.params?.amount as number) ?? 1;
        const unitIdx = sideHand(ctx, ctx.owner)
            .map((c, i) => (c.type?.includes('unit') ? i : -1)).filter(i => i >= 0);
        if (unitIdx.length === 0) return;
        const idx = unitIdx[Math.floor(Math.random() * unitIdx.length)];
        const hand = sideHand(ctx, ctx.owner);
        hand[idx] = {
            ...hand[idx],
            cost: Math.max(0, (hand[idx].cost || 0) - amount),
            customProgress: (hand[idx].customProgress || 0) | 2,
        };
        ctx.dirty.hand.add(ctx.owner);
        flashRogueBuff(def);
    },

    ALL_BUFF: (def, ctx) => {
        // 钢铁洪流/战争领主：我方全体单位永久 +N/+M（可带备战）
        const power = (def.battleEffect?.params?.power as number) ?? 0;
        const health = (def.battleEffect?.params?.health as number) ?? 0;
        const rally = def.battleEffect?.params?.rally === true;
        const bench = sideBench(ctx, ctx.owner);
        let applied = false;
        for (let i = 0; i < bench.length; i++) {
            bench[i] = applyPermanentBuff(bench[i], power, health);
            applied = true;
        }
        ctx.combatField.forEach((f, i) => {
            // 我方单位 = 我方进攻方的 attacker / 对方进攻方的 blocker
            if (f.owner === ctx.owner && f.attacker) {
                ctx.combatField[i] = { ...f, attacker: applyPermanentBuff(f.attacker as CardData, power, health) };
                applied = true;
            } else if (f.owner !== ctx.owner && f.blocker) {
                ctx.combatField[i] = { ...f, blocker: applyPermanentBuff(f.blocker as CardData, power, health) };
                applied = true;
            }
        });
        if (applied) ctx.dirty.bench.add(ctx.owner);
        if (applied) ctx.dirty.field = true;
        if (rally) {
            ctx.game = { ...ctx.game, attackToken: { ...ctx.game.attackToken } };
            ctx.game.attackToken[ctx.owner] = 'rally';
            ctx.dirty.game = true;
            eventBus.emit('gain_token_rally', { owner: ctx.owner });
        }
        if (applied || rally) flashRogueBuff(def);
    },

    FREEZE_STRONGEST: (def, ctx) => {
        // 霜寒压制：冻结对方攻击力最高的单位（优先级在衰弱前 → 归零后衰弱实时重判到次强）
        const opp: Side = ctx.owner === 'player' ? 'enemy' : 'player';
        const target = findStrongestUnit(sideBench(ctx, opp), ctx.combatField, opp);
        if (!target) return;
        const frozen = applyFrostbite(target);
        updateUnitById(ctx, target.id, () => frozen);
        flashRogueBuff(def);
    },

    SET_STRONGEST_STATS: (def, ctx) => {
        // 衰弱诅咒：将对方"当前最强"单位设为 1/1（roundBuffs 等额偏移，回合末还原）
        const opp: Side = ctx.owner === 'player' ? 'enemy' : 'player';
        // 实时重判：对 ctx 当前战场找最强（若冻结已把原最强归零，这里会命中次强）
        const target = findStrongestUnit(sideBench(ctx, opp), ctx.combatField, opp);
        if (!target) return;
        const weakened: CardData = {
            ...target,
            roundBuffs: {
                power: (target.roundBuffs?.power || 0) + (1 - getPower(target)),
                health: (target.roundBuffs?.health || 0) + (1 - getHealth(target)),
            },
        };
        updateUnitById(ctx, target.id, () => weakened);
        flashRogueBuff(def);
    },

    // ---- game_start：开局召唤 / 抽天启者 ----
    SUMMON: (def, ctx) => {
        // 幽灵行动/精锐动员：开局召唤单位（按侧"本局召唤一次"去重，防死后每回合复活）
        const summonKey = def.battleEffect?.params?.summonKey as string | undefined;
        if (!summonKey) return;
        const once = ctx.info.tryMarkSummonOnce;
        if (once && !once(ctx.owner, summonKey)) return; // 该侧本局已召唤过该单位
        const bench = sideBench(ctx, ctx.owner);
        if (bench.some(c => c.key === summonKey) || bench.length >= 6) return;
        bench.push({ ...ctx.createFullCard(summonKey), animState: 'summoning' as const });
        ctx.dirty.bench.add(ctx.owner);
        flashRogueBuff(def);
    },

    CHAMPION_TO_HAND: (def, ctx) => {
        // 天启共鸣：开局从牌库随机抽一张天启者到手牌（提高上手率）
        const deck = sideDeck(ctx, ctx.owner);
        const champIdxs = deck.map((c, i) => (c.isChampion ? i : -1)).filter(i => i >= 0);
        if (champIdxs.length === 0) return;
        const idx = champIdxs[Math.floor(Math.random() * champIdxs.length)];
        const champ = deck[idx];
        deck.splice(idx, 1);
        const hand = sideHand(ctx, ctx.owner);
        if (hand.length < 10) hand.push(champ);
        ctx.dirty.deck.add(ctx.owner);
        ctx.dirty.hand.add(ctx.owner);
        flashRogueBuff(def);
    },

    // ---- on_summon / on_play_unit：以刚打出的卡为目标 ----
    BUFF: (def, ctx) => {
        // 机不可失/蜂拥而至：本回合给刚上场单位 +N/+M
        const card = ctx.info.playedCard ?? benchLast(ctx, ctx.owner);
        if (!card) return;
        const power = (def.battleEffect?.params?.power as number) ?? 1;
        const health = (def.battleEffect?.params?.health as number) ?? 1;
        const updated = {
            ...card,
            roundBuffs: {
                power: (card.roundBuffs?.power || 0) + power,
                health: (card.roundBuffs?.health || 0) + health,
            },
        };
        updateUnitById(ctx, card.id, () => updated);
        flashRogueBuff(def);
    },

    CLONE_AND_SUMMON: (def, ctx) => {
        // 暗影双生：每回合首次打出单位 → 召唤临时复制（Ephemeral）
        const bench = sideBench(ctx, ctx.owner);
        if (!ctx.game.rogueFirstSummonDone && bench.length < 6) {
            const card = ctx.info.playedCard ?? benchLast(ctx, ctx.owner);
            if (card) {
                bench.push({
                    ...card,
                    id: Math.random().toString(36).substr(2, 9),
                    keywords: [...(card.keywords || []), 'Ephemeral' as any],
                    animState: 'summoning' as const,
                });
                ctx.game = { ...ctx.game, rogueFirstSummonDone: true };
                ctx.dirty.bench.add(ctx.owner);
                ctx.dirty.game = true;
                eventBus.emit(GameEvents.SFX_SUMMON);
            }
        }
        // 保持旧语义：每张召唤动作都闪一次图标（含非首次召唤时）
        flashRogueBuff(def);
    },

    KEYWORD_POWER: (def, ctx) => {
        // 万夫莫敌：刚打出单位每有 1 个关键词 +1/+1（一次性，杜绝滚雪球）
        const card = benchLast(ctx, ctx.owner);
        if (!card) return;
        const count = card.keywords?.length || 0;
        const updated = applyPermanentBuff(card, count, count);
        updateUnitById(ctx, card.id, () => updated);
        flashRogueBuff(def);
    },

    HAND_DISCOUNT: (def, ctx) => {
        // 传承武备：手牌随机单位卡费用减少（减量 = 打出单位的费用）
        const played = ctx.info.playedCard;
        if (!played) return;
        const hand = sideHand(ctx, ctx.owner);
        const unitHand = hand.map((c, i) => (!c.isChampion && c.type?.includes('unit') ? i : -1)).filter(i => i >= 0);
        if (unitHand.length === 0) return;
        const idx = unitHand[Math.floor(Math.random() * unitHand.length)];
        hand[idx] = {
            ...hand[idx],
            cost: Math.max(0, (hand[idx].cost || 0) - (played.cost || 0)),
            customProgress: (hand[idx].customProgress || 0) | 2,
        };
        ctx.dirty.hand.add(ctx.owner);
        flashRogueBuff(def);
    },

    DECK_TOP_BUFF: (def, ctx) => {
        // 牌库灌注/锋锐补给：牌库最上方单位永久 +N/+M
        const power = (def.battleEffect?.params?.power as number) ?? 0;
        const health = (def.battleEffect?.params?.health as number) ?? 1;
        const deck = sideDeck(ctx, ctx.owner);
        const idx = deck.findIndex(c => c.type?.includes('unit'));
        if (idx < 0) return;
        deck[idx] = applyPermanentBuff(deck[idx], power, health);
        ctx.dirty.deck.add(ctx.owner);
        flashRogueBuff(def);
    },

    // ---- after_attack / after_attacked / on_first_play_unit：BUFF 自身 ----
    BUFF_SELF: (def, ctx) => {
        // 以战养战/以守为攻/狂怒印记/铁壁反击/先锋之锐/斩杀协议：触发单位自身永久 +N/+M
        const power = (def.battleEffect?.params?.power as number) ?? 0;
        const health = (def.battleEffect?.params?.health as number) ?? 0;
        let target: CardData | undefined;

        if (ctx.trigger === 'on_first_play_unit') {
            // 每回合首个打出单位（先锋之锐/斩杀协议）：打出卡在备战席
            target = ctx.info.playedCard ?? benchLast(ctx, ctx.owner);
        } else if (ctx.trigger === 'after_attack' || ctx.trigger === 'after_attacked') {
            // 打击/被打击结算点：目标 = 交战对象（result.updatedFight，可变）
            const fight = ctx.info.fight;
            if (!fight) return;
            target = ctx.trigger === 'after_attack' ? fight.attacker : fight.blocker;
            if (!target) return;
            // [2026-09-15 莉莉子 BUG修复] 改用统一存活判据（叠加真实血量）。
            // 原判据只看 animState，漏掉"伤害已致死但尚未标 dying"的单位 → 被 +1/+1 救活。
            if (!isStrikeTargetAlive(target)) return;
            // 直接改 updatedFight 对象（站点统一 setCombatField 提交），无散装 set
            const buffed = applyPermanentBuff(target, power, health);
            if (ctx.trigger === 'after_attack') fight.attacker = buffed;
            else fight.blocker = buffed;
            flashRogueBuff(def);
            return;
        }
        if (!target) return;
        const buffed = applyPermanentBuff(target, power, health);
        updateUnitById(ctx, target.id, () => buffed);
        flashRogueBuff(def);
    },

    STAT_BALANCE: (def, ctx) => {
        // 生命壁垒/攻守易形：进攻宣告确认时对每个我方进攻者攻血互等（只增不减）
        const mode = (def.battleEffect?.params?.mode as string) ?? 'health_to_power';
        let applied = false;
        ctx.combatField.forEach((f, i) => {
            if (f.owner !== ctx.owner || !f.attacker) return;
            const buffed = applyStatBalance(f.attacker as CardData, mode);
            if (buffed !== f.attacker) {
                ctx.combatField[i] = { ...f, attacker: buffed };
                ctx.dirty.field = true;
                applied = true;
            }
        });
        if (applied) flashRogueBuff(def);
    },

    // ---- unit_die：以阵亡单位为目标 ----
    DEATH_GIFT: (def, ctx) => {
        // 英魂传承：阵亡单位攻血赋予手牌随机单位
        const dead = ctx.info.deadUnit;
        if (!dead) return;
        const power = getPower(dead);
        const health = getHealth(dead);
        const hand = sideHand(ctx, ctx.owner);
        const unitHand = hand.map((c, i) => (!c.isChampion && c.type?.includes('unit') ? i : -1)).filter(i => i >= 0);
        if (unitHand.length === 0) return;
        const idx = unitHand[Math.floor(Math.random() * unitHand.length)];
        hand[idx] = applyPermanentBuff(hand[idx], power, health);
        ctx.dirty.hand.add(ctx.owner);
        flashRogueBuff(def);
    },

    DEATH_DISCOUNT: (def, ctx) => {
        // 献祭仪式：阵亡时手牌费用最高的单位卡费用 -1
        const dead = ctx.info.deadUnit;
        if (!dead) return;
        const amount = (def.battleEffect?.params?.amount as number) ?? 1;
        const hand = sideHand(ctx, ctx.owner);
        const unitHand = hand.map((c, i) => (c.type === 'unit' ? i : -1)).filter(i => i >= 0);
        if (unitHand.length === 0) return;
        const topIdx = unitHand.reduce((a, b) => ((hand[a].cost || 0) > (hand[b].cost || 0) ? a : b));
        hand[topIdx] = {
            ...hand[topIdx],
            cost: Math.max(0, (hand[topIdx].cost || 0) - amount),
            customProgress: (hand[topIdx].customProgress || 0) | 2,
        };
        ctx.dirty.hand.add(ctx.owner);
        flashRogueBuff(def);
    },

    RESURRECT: (def, ctx) => {
        // 亡灵军团(首个)/不死军团(全部)：复活阵亡单位回备战席（保留数值清死亡态，附幻象）
        const dead = ctx.info.deadUnit;
        if (!dead) return;
        const resurrectAll = def.battleEffect?.params?.all === true;
        if (!resurrectAll) {
            // 非全复活：每批(processDeaths 一次调用)每侧只复活首个阵亡者
            if (ctx.info.resurrectedSide === ctx.owner) return;
            ctx.info.resurrectedSide = ctx.owner;
        }
        const bench = sideBench(ctx, ctx.owner);
        const aliveCount = bench.filter(c => !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying').length;
        if (aliveCount >= 6) return;
        const revived: CardData = {
            ...dead,
            isDead: false,
            damageTaken: 0,
            animState: 'idle' as const,
            keywords: [...(dead.keywords || []), 'Ephemeral' as any],
        };
        // 原实现：remove 死者 + concat revived（死者仍在数组中的墓碑态），对齐处理
        const i = bench.findIndex(c => c.id === dead.id);
        if (i >= 0) bench.splice(i, 1);
        bench.push(revived);
        ctx.dirty.bench.add(ctx.owner);
        flashRogueBuff(def);
    },

    // ---- round_end：王见王 ----
    DUEL_STRONGEST: (def, ctx) => {
        // 王见王：敌我双方攻击力最高的单位相互打击（完整结算：屏障/坚韧/碾压/after_attack 成长）
        if (ctx.info.duelDone) return; // 跨双方 pass 只执行一次
        const pStrong = findStrongestUnit(ctx.playerBench, ctx.combatField, 'player');
        const eStrong = findStrongestUnit(ctx.enemyBench, ctx.combatField, 'enemy');
        ctx.info.duelDone = true;
        if (!pStrong || !eStrong) return;

        const pAtk = getPower(pStrong);
        const eAtk = getPower(eStrong);

        const applyDuelHit = (target: CardData, dmg: number, attacker: CardData): { target: CardData; overflow: number } => {
            let finalDmg = dmg;
            const hasActiveBarrier = target.keywords.includes('Barrier') && !(target.depletedKeywords || []).includes('Barrier');
            if (hasActiveBarrier && finalDmg > 0) {
                return { target: { ...target, depletedKeywords: [...(target.depletedKeywords || []), 'Barrier'], animState: 'hit' as const }, overflow: 0 };
            }
            if (target.keywords.includes('Tough') && finalDmg > 0) finalDmg = Math.max(0, finalDmg - 1);
            const currentHealth = getHealth(target);
            let overflow = 0;
            if (attacker.keywords.includes('Overwhelm') && finalDmg > currentHealth) {
                overflow = finalDmg - currentHealth;
            }
            if (finalDmg > 0) eventBus.emit('unit_damage', { id: target.id, amount: finalDmg });
            return { target: { ...target, damageTaken: (target.damageTaken || 0) + finalDmg, animState: 'hit' as const }, overflow };
        };

        // 我方最强打敌方最强（敌方受 pAtk）；敌方最强打我方最强（我方受 eAtk）
        let hitE = applyDuelHit(eStrong, pAtk, pStrong);
        let hitP = applyDuelHit(pStrong, eAtk, eStrong);
        // after_attack 强化全覆盖：王见王双方最强都挥击了（存活才成长）
        // [2026-09-15 莉莉子 BUG修复] 存活判据改用统一版本（叠加真实血量），与单挑/战斗路径口径一致
        if (isStrikeTargetAlive(hitP.target)) {
            hitP = { ...hitP, target: applyStrikeEnhancement(ctx.game.rogueEnhancements, 'after_attack', hitP.target) };
        }
        if (isStrikeTargetAlive(hitE.target)) {
            hitE = { ...hitE, target: applyStrikeEnhancement(ctx.game.enemyEnhancements, 'after_attack', hitE.target) };
        }
        // 碾压溢出写水晶（固若金汤水晶坚韧：溢出减 1，飘字同步实际伤害）
        if (hitE.overflow > 0) {
            const finalOverflow = ctx.game.enemyNexusTough ? Math.max(0, hitE.overflow - 1) : hitE.overflow;
            ctx.game = { ...ctx.game, enemyNexus: Math.max(0, ctx.game.enemyNexus - finalOverflow) };
            ctx.dirty.game = true;
            eventBus.emit('unit_damage', { id: 'nexus_enemy', amount: finalOverflow });
            eventBus.emit(GameEvents.NEXUS_STRIKED, { target: 'enemy', amount: finalOverflow });
        }
        if (hitP.overflow > 0) {
            const finalOverflow = ctx.game.playerNexusTough ? Math.max(0, hitP.overflow - 1) : hitP.overflow;
            ctx.game = { ...ctx.game, playerNexus: Math.max(0, ctx.game.playerNexus - finalOverflow) };
            ctx.dirty.game = true;
            eventBus.emit('unit_damage', { id: 'nexus_player', amount: finalOverflow });
            eventBus.emit(GameEvents.NEXUS_STRIKED, { target: 'player', amount: finalOverflow });
        }
        // 写回战场（attacker + blocker 两侧都覆盖，防交战区格挡单位）
        updateUnitById(ctx, eStrong.id, () => hitE.target);
        updateUnitById(ctx, pStrong.id, () => hitP.target);
        flashRogueBuff(def);
    },
};

// ==========================================
// 主入口：同一 trigger 的强化串行执行
// restrict：可选的类白名单（如 animating 打击段只想跑 BUFF_SELF、跳过已在进攻宣告段触发的 STAT_BALANCE）
// ==========================================
export const runRogueTrigger = (
    ctx: RogueTriggerCtx,
    enhIds: string[] | undefined,
    trigger: BattleTrigger,
    restrict?: (be: BattleEffectClass) => boolean,
): void => {
    ctx.trigger = trigger;
    const defs = sortRogueDefs(getRogueDefs(enhIds, trigger));
    defs.forEach(def => {
        const be = def.battleEffect;
        if (!be) return;
        if (restrict && !restrict(be.effectClass)) return;
        const handler = ROGUE_EFFECT_HANDLERS[be.effectClass];
        if (handler) handler(def, ctx);
        // 未注册 effectClass（SPELL_DOUBLE / NEXUS_HP_BOOST 等常驻查询型）静默忽略
    });
};
