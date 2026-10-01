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
import { isQuestDone, questKey } from './questTracker'; // [2026-09-25 莉莉子] 三线任务化框架：任务解锁判定
import { eventBus, GameEvents } from '../utils/eventBus';
import type { MazeBuff, BattleTrigger, BattleEffectClass } from '../data/roguelike/buffs';
import { CHAMPION_GIFT_KEYWORDS, getBattleEffects } from '../data/roguelike/buffs'; // [2026-09-25 莉莉子 武装线] 共鸣水晶的赠予关键词池 · [2026-09-28] 多效果条目统一视图
import type { CardData, GameState, Keyword } from '../types';

export type Side = 'player' | 'enemy';

// ==========================================
// effectClass 缺省优先级（同 trigger 内：小者先执行）
// 规则：显式 def.battleEffect.priority ?? 本表 ?? 获取序（getRogueDefs 保序 → 稳定回落）
// ==========================================
export const EFFECT_CLASS_PRIORITY: Partial<Record<BattleEffectClass, number>> = {
    DUEL_STRONGEST: 0,        // 回合末王见王最先（跨双方效果，一次去重）
    ALL_BUFF: 5,              // 全体增益先于单点 targeting
    ALL_UNITS_GRANT_KEYWORD: 6, // [2026-09-28 神格神经 ⑥] 开局/召唤的全体赋予，排在单点增益之前
    FREEZE_STRONGEST: 10,     // 冻结最先（数据层 freeze_strongest 亦显式 10）
    SET_STRONGEST_STATS: 20,  // 衰弱随后 → 对实时战场重判"当前最强"
};

/** 同 trigger 强化的确定性排序（priority 升序；同值按 defs 原序 = 获取序，Array.sort 稳定）
 *  [2026-09-28 莉莉子 神格神经] 支持多效果条目：给定 trigger 时取**命中该 trigger 的那个效果**的优先级 */
export const sortRogueDefs = (defs: MazeBuff[], trigger?: BattleTrigger): MazeBuff[] => {
    const prioOf = (d: MazeBuff): number => {
        const list = getBattleEffects(d);
        const be = (trigger ? list.find(e => e.trigger === trigger) : undefined) ?? list[0];
        return be?.priority ?? (be ? EFFECT_CLASS_PRIORITY[be.effectClass] : undefined) ?? Number.MAX_SAFE_INTEGER;
    };
    return [...defs].sort((a, b) => prioOf(a) - prioOf(b));
};

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
        // [2026-09-28 神格神经 · 猫汐尔②④] 新增 `count`：一次生成 N 张（每张独立实例 + 独立 id）
        const genKey = def.battleEffect?.params?.generateKey as string | undefined;
        if (!genKey) return;
        const count = Math.max(1, (def.battleEffect?.params?.count as number) ?? 1);
        const hand = sideHand(ctx, ctx.owner);
        let added = 0;
        for (let i = 0; i < count; i++) {
            if (hand.length >= 10) break; // 手牌上限兜底（满了就少发，不爆牌）
            const card = ctx.createFullCard(genKey);
            if (!card) break;
            if (def.battleEffect?.params?.isVolatile) card.keywords = [...(card.keywords || []), 'Volatile' as any];
            // [2026-09-28 莉莉子 神格神经] costOverride：生成时改写费用
            //   （里芙 ④「0 费单挑」/ ⑥「0 费专注」/ 安卡希雅 ⑥「0 费剑舞」）
            const costOverride = def.battleEffect?.params?.costOverride as number | undefined;
            if (costOverride !== undefined) card.cost = costOverride;
            if (i > 0) card.id = `${card.id}_g${i}`; // 多张时确保 id 唯一（手牌查表按 id）
            hand.push(card);
            added++;
            eventBus.emit('sfx_generate', card);
        }
        if (added > 0) {
            ctx.dirty.hand.add(ctx.owner);
            flashRogueBuff(def);
        }
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

    NEXUS_IMMUNE: (def, ctx) => {
        // [2026-09-29 程拍板] 不死之身：我方水晶**免疫任何伤害**（标记型）
        //   各水晶伤害点统一查 game.playerNexusImmune / enemyNexusImmune
        ctx.game = ctx.owner === 'player'
            ? { ...ctx.game, playerNexusImmune: true }
            : { ...ctx.game, enemyNexusImmune: true };
        ctx.dirty.game = true;
        flashRogueBuff(def);
    },

    NEXUS_SELF_DAMAGE: (def, ctx) => {
        // [2026-09-29 程拍板] 不死之身的代价：回合结束**自扣我方水晶** N 点
        //   ⚠️ 刻意**不走伤害管线**（不判免疫/坚韧、不发 NEXUS_STRIKED）—— 语义是"生命值 -N"而非"受到伤害"
        //   只发 unit_damage 供飘字与受击音（表现层），不参与任何战绩/任务计数
        const v = (def.battleEffect?.params?.value as number) ?? 0;
        if (v <= 0) return;
        ctx.game = ctx.owner === 'player'
            ? { ...ctx.game, playerNexus: Math.max(0, ctx.game.playerNexus - v) }
            : { ...ctx.game, enemyNexus: Math.max(0, ctx.game.enemyNexus - v) };
        ctx.dirty.game = true;
        eventBus.emit('unit_damage', { id: ctx.owner === 'player' ? 'nexus_player' : 'nexus_enemy', amount: v });
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
        // [2026-09-28 神格神经 · 安卡希雅②④] 两处扩展：
        //   ① `anyCard: true` → 任意类型手牌（含法术），对应"随机一张手牌魔耗值-1/-2"
        //   ② 只抽 **费用 > 0** 的牌 —— 抽到 0 费牌等于白费一次（与"装备适用性"同一条原则：不做无效事）
        const amount = (def.battleEffect?.params?.amount as number) ?? 1;
        const anyCard = def.battleEffect?.params?.anyCard === true;
        const hand = sideHand(ctx, ctx.owner);
        const idxs = hand
            .map((c, i) => ((anyCard || c.type?.includes('unit')) && (c.cost || 0) > 0 ? i : -1))
            .filter(i => i >= 0);
        if (idxs.length === 0) return;
        const idx = idxs[Math.floor(Math.random() * idxs.length)];
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

    DRAW_CARDS: (def, ctx) => {
        // [2026-09-25 莉莉子 三线任务化框架] 开局抽 N 张：牌库顶 N 张进手牌（遵守 10 张手牌上限）
        //   首个使用方 = 武装「余响之匣」的整局任务兑现（armfx_echo_box）；悬赏 / 王权之证 等后续条目复用
        const n = (def.battleEffect?.params?.value as number) ?? 1;
        const deck = sideDeck(ctx, ctx.owner);
        const hand = sideHand(ctx, ctx.owner);
        const take = Math.min(n, deck.length, Math.max(0, 10 - hand.length));
        if (take <= 0) return;
        hand.push(...deck.splice(0, take));
        ctx.dirty.deck.add(ctx.owner);
        ctx.dirty.hand.add(ctx.owner);
        flashRogueBuff(def);
    },

    DISCARD_LOWEST_BUFF_CHAMPION: (def, ctx) => {
        // [2026-09-25 莉莉子 武装线] 噬牌之匣：弃掉手牌中费用最低的一张（天启者除外）→ 天启者永久 +1/+1
        //   "费用最低"让玩家可以操控结果：留着高价值牌，废牌自然被吃掉 —— 自动执行但可控（新操作维度）
        const hand = sideHand(ctx, ctx.owner);
        const idxs = hand.map((c, i) => (c.isChampion ? -1 : i)).filter(i => i >= 0);
        if (idxs.length === 0) return;
        let lowest = idxs[0];
        for (const i of idxs) if ((hand[i].cost ?? 0) < (hand[lowest].cost ?? 0)) lowest = i;
        hand.splice(lowest, 1);
        ctx.dirty.hand.add(ctx.owner);
        // 天启者本体永久 +1/+1（备战席 + 交战区攻/守两侧都找一遍）
        const side = ctx.owner;
        const champ = [
            ...sideBench(ctx, side),
            ...ctx.combatField.flatMap(f => (f.owner === side ? [f.attacker, f.blocker] : [])),
        ].find(c => c?.isChampion);
        if (champ) updateUnitById(ctx, champ.id, c => applyPermanentBuff(c, 1, 1));
        flashRogueBuff(def);
    },

    // ---- [2026-09-25 莉莉子 武装线] 武装专用效果类 ----
    SUMMON_INHERIT_LAST_DEAD: (def, ctx) => {
        // 亡者低语：此后每次召唤，新单位获得"最后阵亡单位"的攻血
        //   来源取墓地快照（含 buffs、不含致死伤害）—— 语义是"继承它的身材"，不是"继承它的血皮"
        const grave = (ctx.owner === 'player' ? ctx.game.playerGraveyard : ctx.game.enemyGraveyard) ?? [];
        const last = grave[grave.length - 1];
        if (!last) return;
        const target = ctx.info.playedCard ?? benchLast(ctx, ctx.owner);
        if (!target) return;
        const p = (last.power ?? 0) + (last.buffs?.power ?? 0);
        const h = (last.health ?? 0) + (last.buffs?.health ?? 0);
        if (p === 0 && h === 0) return;
        updateUnitById(ctx, target.id, c => applyPermanentBuff(c, p, h));
        flashRogueBuff(def);
    },

    RALLY_IF_ATTACK_POWER: (def, ctx) => {
        // [2026-09-28 莉莉子 神格神经 · 芬妮②④] 发起进攻时，若我方进攻单位攻击力**总和** > 阈值 → 备战
        //   备战 = 再给一个进攻标识（与 RALLY handler 同款写法）
        const threshold = (def.battleEffect?.params?.threshold as number) ?? 10;
        const attackers = ctx.combatField
            .flatMap(f => (f.owner === ctx.owner ? [f.attacker] : []))
            .filter(Boolean) as CardData[];
        const total = attackers.reduce((s, u) => s + getPower(u), 0);
        if (total <= threshold) return;
        ctx.game = { ...ctx.game, attackToken: { ...ctx.game.attackToken, [ctx.owner]: 'rally' } };
        ctx.dirty.game = true;
        eventBus.emit('gain_token_rally', { owner: ctx.owner });
        flashRogueBuff(def);
    },

    ALL_UNITS_GRANT_KEYWORD: (def, ctx) => {
        // [2026-09-28 莉莉子 神格神经 ⑥ 决胜] 我方全体（game_start）或刚召唤的单位（on_summon）
        //   永久 +N/+M 与关键词；已带该关键词且无数值增量时跳过（不白闪）
        // [2026-09-29 程拍板] params 支持 `keywords: string[]`（多关键词一条搞定；旧 `keyword` 单数仍兼容）
        const p = (def.battleEffect?.params?.power as number) ?? 0;
        const h = (def.battleEffect?.params?.health as number) ?? 0;
        const pms = def.battleEffect?.params;
        const kws: Keyword[] = pms?.keywords
            ? (pms.keywords as Keyword[])
            : (pms?.keyword ? [pms.keyword as Keyword] : []);
        const grant = (u: CardData): CardData => {
            const buffed = applyPermanentBuff(u, p, h);
            return kws.length
                ? { ...buffed, keywords: Array.from(new Set([...(buffed.keywords || []), ...kws])) }
                : buffed;
        };
        const targets = (ctx.trigger === 'game_start'
            ? [...sideBench(ctx, ctx.owner), ...ctx.combatField.flatMap(f => (f.owner === ctx.owner ? [f.attacker, f.blocker] : []))]
            : [ctx.info.playedCard ?? benchLast(ctx, ctx.owner)]
        ).filter(Boolean) as CardData[];
        let fired = false;
        for (const u of targets) {
            const hasAllKw = kws.every(k => (u.keywords || []).includes(k));
            if (hasAllKw && p === 0 && h === 0) continue; // 纯关键词且全都有 → 无事可做
            if (updateUnitById(ctx, u.id, grant)) fired = true;
        }
        if (fired) flashRogueBuff(def);
    },

    SPREAD_CHAMPION_KEYWORDS: (def, ctx) => {
        // 共鸣水晶：① 一次性随机赠予天启者一个关键词（每场一次，靠"候选池里一个都没有"判定）
        //           ② 把天启者的关键词扩散给所有在场友军（备战席 + 交战区，关键词去重合并）
        const side = ctx.owner;
        const bench = sideBench(ctx, side);
        const field = ctx.combatField.flatMap(f => (f.owner === side ? [f.attacker, f.blocker] : []));
        const champ = [...bench, ...field].find(c => c?.isChampion);
        if (!champ) return;
        let champCard = champ;
        if (!CHAMPION_GIFT_KEYWORDS.some(k => (champCard.keywords || []).includes(k))) {
            const gift = CHAMPION_GIFT_KEYWORDS[Math.floor(Math.random() * CHAMPION_GIFT_KEYWORDS.length)];
            champCard = { ...champCard, keywords: Array.from(new Set([...(champCard.keywords || []), gift])) };
            updateUnitById(ctx, champ.id, () => champCard);
            flashRogueBuff(def);
        }
        const ks = champCard.keywords || [];
        if (ks.length === 0) return;
        for (const u of [...bench, ...field]) {
            if (!u || u.id === champ.id) continue;
            const merged = Array.from(new Set([...(u.keywords || []), ...ks]));
            if (merged.length !== (u.keywords || []).length) updateUnitById(ctx, u.id, c => ({ ...c, keywords: merged }));
        }
    },

    TAX_ENEMY_HAND: (def, ctx) => {
        // 破晓号令：敌方手牌中随机 count 张单位卡费用 +value（配合 oncePerBattle = 每场一次）
        const value = (def.battleEffect?.params?.value as number) ?? 2;
        const count = (def.battleEffect?.params?.count as number) ?? 3;
        const hand = sideHand(ctx, 'enemy');
        const idxs = hand.map((c, i) => (!c.isChampion && !c.type?.includes('spell') ? i : -1)).filter(i => i >= 0);
        if (idxs.length === 0) return;
        for (let i = idxs.length - 1; i > 0; i--) { // 洗牌取前 count 个 = 随机 count 张
            const j = Math.floor(Math.random() * (i + 1));
            [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
        }
        idxs.slice(0, count).forEach(i => { hand[i] = { ...hand[i], cost: (hand[i].cost ?? 0) + value }; });
        ctx.dirty.hand.add('enemy');
        flashRogueBuff(def);
    },

    // ---- [2026-09-25 莉莉子 强化线 · 新效果批] 亡语系三件 ----
    DEATH_NEXUS_DAMAGE: (def, ctx) => {
        // 余烬：我方单位阵亡时，敌方水晶受到 N 点伤害（"死亡即伤害"：铺场交换开始有回报）
        //   ⚠️ 这是 game 级变更 —— unit_die 站点以前不提交 dirty.game，本轮已在 processDeaths 补上差异合并提交
        const v = (def.battleEffect?.params?.value as number) ?? 1;
        if (v <= 0) return;
        const key = (ctx.owner === 'player' ? 'enemyNexus' : 'playerNexus') as 'enemyNexus' | 'playerNexus';
        ctx.game[key] = Math.max(0, ((ctx.game[key] as number) ?? 0) - v);
        ctx.dirty.game = true;
        flashRogueBuff(def);
    },

    DEATH_STRIKE_RANDOM_ENEMY: (def, ctx) => {
        // 献祭回响：我方单位阵亡时，对敌方随机单位造成等于其攻击力的伤害（亡语炸弹）
        const dead = ctx.info.deadUnit;
        if (!dead) return;
        const dmg = Math.max(0, (dead.power ?? 0) + (dead.buffs?.power ?? 0)); // 取身材，不含致死伤害
        if (dmg <= 0) return;
        const foeSide: Side = ctx.owner === 'player' ? 'enemy' : 'player';
        const foes = sideBench(ctx, foeSide);
        if (foes.length === 0) return;
        const victim = foes[Math.floor(Math.random() * foes.length)];
        updateUnitById(ctx, victim.id, c => ({ ...c, damageTaken: (c.damageTaken ?? 0) + dmg, animState: 'hit' as const }));
        flashRogueBuff(def);
    },

    DEATH_GIFT_KEYWORD: (def, ctx) => {
        // 返祖：我方单位阵亡时，随机一个友军获得它的一个关键词（关键词传承）
        //   瞬逝不算"遗产"（那是消耗品式的存在，传承下去语义混乱），故排除
        const dead = ctx.info.deadUnit;
        if (!dead) return;
        const ks = (dead.keywords ?? []).filter(k => k !== 'Ephemeral');
        if (ks.length === 0) return;
        const gift = ks[Math.floor(Math.random() * ks.length)];
        const friends = sideBench(ctx, ctx.owner).filter(c => c.id !== dead.id);
        if (friends.length === 0) return;
        const heir = friends[Math.floor(Math.random() * friends.length)];
        updateUnitById(ctx, heir.id, c => ({ ...c, keywords: Array.from(new Set([...(c.keywords || []), gift])) }));
        flashRogueBuff(def);
    },

    // ---- [2026-09-25 莉莉子 强化线 · 新效果批（第二组）] ----
    OPENING_ZERO_COST: (def, ctx) => {
        // 终焉回响：开局随机 N 张手牌费用变 0；代价 = 同一 params 里的 nexusCost（我方水晶 -N）
        const n = (def.battleEffect?.params?.count as number) ?? 2;
        const nexusCost = (def.battleEffect?.params?.nexusCost as number) ?? 0;
        const hand = sideHand(ctx, ctx.owner);
        const idxs = hand.map((_, i) => i);
        for (let i = idxs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
        }
        const picked = idxs.slice(0, n);
        if (picked.length > 0) {
            picked.forEach(i => { hand[i] = { ...hand[i], cost: 0 }; });
            ctx.dirty.hand.add(ctx.owner);
        }
        if (nexusCost > 0) {
            const key = (ctx.owner === 'player' ? 'playerNexus' : 'enemyNexus') as 'playerNexus' | 'enemyNexus';
            ctx.game[key] = Math.max(1, ((ctx.game[key] as number) ?? 0) - nexusCost);
            ctx.dirty.game = true;
        }
        flashRogueBuff(def);
    },

    BOUNTY_CYCLE: (def, ctx) => {
        // 悬赏（自循环）：① 无标记 → 标记敌方攻击力最高的单位 ② 有标记且目标已不在场 → 结算并清空
        //   结算放在 round_start（而非死亡瞬间）的理由：round_start 站点会提交 dirty.game，
        //   而"敌方单位死亡"那一刻走的是**敌方**的强化分发（玩家侧的悬赏天然收不到），
        //   用"目标是否还在场"来判定击杀，既绕开这个方向问题，也顺带兼容"被移除/变形"等非死亡消失。
        const foeSide: Side = ctx.owner === 'player' ? 'enemy' : 'player';
        const foes = sideBench(ctx, foeSide);
        const bountyId = ctx.game.bountyId;
        if (!bountyId) {
            if (foes.length === 0) return;
            let best = foes[0];
            for (const u of foes) if (getPower(u) > getPower(best)) best = u;
            ctx.game.bountyId = best.id;
            ctx.dirty.game = true;
            flashRogueBuff(def);
            return;
        }
        const stillThere = [
            ...foes,
            ...ctx.combatField.flatMap(f => (f.owner === foeSide ? [f.attacker, f.blocker] : [])),
        ].some(c => c?.id === bountyId);
        if (stillThere) return;
        ctx.game.bountyId = undefined; // 已击杀 → 结算并清空（下回合重新标记）
        ctx.dirty.game = true;
        const deck = sideDeck(ctx, ctx.owner);
        const hand = sideHand(ctx, ctx.owner);
        const take = Math.min(2, deck.length, Math.max(0, 10 - hand.length));
        if (take > 0) {
            hand.push(...deck.splice(0, take));
            ctx.dirty.deck.add(ctx.owner);
            ctx.dirty.hand.add(ctx.owner);
        }
        eventBus.emit(GameEvents.ROGUE_GOLD_GRANT, { amount: 50, reason: '悬赏' }); // 金币是 run 层资源 → 广播出去
        flashRogueBuff(def);
    },

    LONE_GUARD_BUFF: (def, ctx) => {
        // 孤军：我方场上恰好 1 个单位时，该单位 +4/+4 并获得【屏障】（条件判定已在分发前完成，见 requireOnlyOneUnit）
        const mine = [
            ...sideBench(ctx, ctx.owner),
            ...ctx.combatField.flatMap(f => (f.owner === ctx.owner ? [f.attacker, f.blocker] : [])),
        ].filter(Boolean) as CardData[];
        if (mine.length !== 1) return;
        const p = (def.battleEffect?.params?.power as number) ?? 4;
        const h = (def.battleEffect?.params?.health as number) ?? 4;
        updateUnitById(ctx, mine[0].id, c => ({
            ...applyPermanentBuff(c, p, h),
            keywords: Array.from(new Set([...(c.keywords || []), 'Barrier'])),
        }));
        flashRogueBuff(def);
    },

    // ---- on_summon / on_play_unit：以刚打出的卡为目标 ----
    BUFF: (def, ctx) => {
        // 机不可失/蜂拥而至：本回合给刚上场单位 +N/+M
        // [2026-09-28 神格神经 · 茉莉安①③] 新增 `keywords`：本回合数值之外再赋予关键词
        //   （【快速攻击】这类关键词没有"本回合"口径 ⇒ 按永久赋予处理）
        const card = ctx.info.playedCard ?? benchLast(ctx, ctx.owner);
        if (!card) return;
        const power = (def.battleEffect?.params?.power as number) ?? 1;
        const health = (def.battleEffect?.params?.health as number) ?? 1;
        const extraKeywords = (def.battleEffect?.params?.keywords as Keyword[] | undefined) ?? [];
        const updated = {
            ...card,
            roundBuffs: {
                power: (card.roundBuffs?.power || 0) + power,
                health: (card.roundBuffs?.health || 0) + health,
            },
            ...(extraKeywords.length
                ? { keywords: Array.from(new Set([...(card.keywords || []), ...extraKeywords])) }
                : {}),
        };
        updateUnitById(ctx, card.id, () => updated);
        flashRogueBuff(def);
    },

    EXPOSE_AND_DAMAGE: (def, ctx) => {
        // [2026-09-28 神格神经 · 茉莉安②④] 回合开始：① 暴露一个敌人（**攻击力最高的未暴露者**，对齐蕈影口径）
        //                                        ② 对随机敌人 / 血量最多的敌人造成 N 点伤害（屏障/坚韧照常结算）
        const foe: Side = ctx.owner === 'player' ? 'enemy' : 'player';
        const p = def.battleEffect?.params ?? {};
        const dmg = (p.damage as number) ?? 2;
        const live = sideBench(ctx, foe).filter(c => !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying');
        if (live.length === 0) return;
        // ① 暴露
        const unexposed = live.filter(c => !(c.keywords || []).includes('Exposed'));
        if (unexposed.length > 0) {
            const exp = unexposed.reduce((a, b) => (getPower(a) >= getPower(b) ? a : b));
            updateUnitById(ctx, exp.id, c => ({
                ...c,
                keywords: Array.from(new Set([...(c.keywords || []), 'Exposed' as Keyword])),
            }));
        }
        // ② 伤害
        const pick = p.damageTarget === 'mostHp'
            ? live.reduce((a, b) => (getHealth(a) >= getHealth(b) ? a : b))
            : live[Math.floor(Math.random() * live.length)];
        const hasBarrier = (pick.keywords || []).includes('Barrier') && !(pick.depletedKeywords || []).includes('Barrier');
        if (hasBarrier && dmg > 0) {
            updateUnitById(ctx, pick.id, c => ({
                ...c,
                depletedKeywords: [...(c.depletedKeywords || []), 'Barrier'],
                animState: 'hit' as const,
            }));
        } else {
            let actual = dmg;
            if ((pick.keywords || []).includes('Tough') && actual > 0) actual = Math.max(0, actual - 1);
            if (actual > 0) {
                updateUnitById(ctx, pick.id, c => ({ ...c, damageTaken: (c.damageTaken || 0) + actual, animState: 'hit' as const }));
                eventBus.emit('unit_damage', { id: pick.id, amount: actual });
            }
        }
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

    CLONE_ON_DECLARE: (def, ctx) => {
        // [2026-09-28 莉莉子 神格神经 · 卜卜①③] 进攻宣告时：复制我方一个单位，**以"进攻中"状态参战**，并赋予【瞬逝】
        //   params.strongest=true → 复制攻击力最高者（③）；否则随机（①）
        //   params.power / health → 给复制品的追加数值（③ 的 +2/+0）
        //   落点：直接进交战区（此时还没分配格挡 ⇒ 它同样可能被格挡）
        const bench = sideBench(ctx, ctx.owner);
        const alive = bench.filter(c => !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying');
        if (alive.length === 0) return;
        const p = def.battleEffect?.params ?? {};
        const source = p.strongest === true
            ? alive.reduce((a, b) => (getPower(a) >= getPower(b) ? a : b))
            : alive[Math.floor(Math.random() * alive.length)];
        let clone: CardData = {
            ...source,
            id: `clone_${Math.random().toString(36).slice(2, 11)}`,
            isDead: false,
            damageTaken: 0,
            animState: 'idle' as const,
            roundBuffs: undefined,           // 复制品不带"本回合"临时 buff（按白板复制）
            keywords: Array.from(new Set([...(source.keywords || []), 'Ephemeral' as Keyword])),
        };
        const addP = (p.power as number) ?? 0;
        const addH = (p.health as number) ?? 0;
        if (addP || addH) clone = applyPermanentBuff(clone, addP, addH);
        ctx.combatField.push({ owner: ctx.owner, attacker: clone } as any);
        ctx.dirty.field = true;
        eventBus.emit(GameEvents.SFX_SUMMON);
        flashRogueBuff(def);
    },

    NEXUS_REPEAT_STRIKE: (def, ctx) => {
        // [2026-09-28 莉莉子 神格神经 · 卜卜⑥] 两段式（一条强化两个 battleEffects）：
        //   on_nexus_strike → 记账"本回合我方打了几次敌方水晶"（键带回合号）
        //   round_end       → 按记账次数，由我方备战席攻击力最高的单位**再次打击敌方水晶**
        // ⚠️ 兑现时不 emit NEXUS_STRIKED —— 那会再次触发 on_nexus_strike 形成回环；只发飘字。
        const round = ctx.game?.round ?? 0;
        const key = `div:bubu6:r${round}`;
        const qp = ctx.game?.questProgress ?? {};
        if (ctx.trigger === 'on_nexus_strike') {
            ctx.game.questProgress = { ...qp, [key]: (qp[key] ?? 0) + 1 };
            ctx.dirty.game = true;
            return;
        }
        // round_end
        const times = qp[key] ?? 0;
        if (times <= 0) return;
        const strongest = findStrongestUnit(sideBench(ctx, ctx.owner), ctx.combatField, ctx.owner);
        if (!strongest) return;
        const raw = getPower(strongest);
        if (raw <= 0) return;
        const nexusTough = ctx.owner === 'player' ? ctx.game.enemyNexusTough : ctx.game.playerNexusTough;
        // [2026-09-29] 不死之身：对方水晶免疫任何伤害 → 此处直接不打（免疫优先于坚韧）
        const nexusImmune = ctx.owner === 'player' ? ctx.game.enemyNexusImmune : ctx.game.playerNexusImmune;
        if (nexusImmune) return;
        const perHit = nexusTough ? Math.max(0, raw - 1) : raw;
        const total = perHit * times;
        if (total <= 0) return;
        ctx.game = ctx.owner === 'player'
            ? { ...ctx.game, enemyNexus: Math.max(0, ctx.game.enemyNexus - total) }
            : { ...ctx.game, playerNexus: Math.max(0, ctx.game.playerNexus - total) };
        ctx.game.questProgress = { ...(ctx.game.questProgress ?? {}), [key]: 0 };
        ctx.dirty.game = true;
        eventBus.emit('unit_damage', { id: ctx.owner === 'player' ? 'nexus_enemy' : 'nexus_player', amount: total });
        flashRogueBuff(def);
    },

    MANA_PER_SUMMON_ROUND: (def, ctx) => {
        // [2026-09-28 神格神经 · 猫汐尔①] 回合开始：备战席上每有 1 个召唤衍生物 → **本回合**最大法力 +1
        //   本回合口径：直接加到本轮已算好的法力上（下回合由 calculateRoundStart 从零重算 ⇒ 不累积）
        const n = sideBench(ctx, ctx.owner).filter(c => (c.race || []).includes('summon')).length;
        if (n <= 0) return;
        ctx.game = ctx.owner === 'player'
            ? { ...ctx.game, playerMaxMana: (ctx.game.playerMaxMana || 0) + n, playerMana: (ctx.game.playerMana || 0) + n }
            : { ...ctx.game, enemyMaxMana: (ctx.game.enemyMaxMana || 0) + n, enemyMana: (ctx.game.enemyMana || 0) + n };
        ctx.dirty.game = true;
        flashRogueBuff(def);
    },

    MANA_PER_SUMMON_PERMANENT: (def, ctx) => {
        // [2026-09-28 神格神经 · 猫汐尔③] 每召唤 1 个召唤衍生物 → 本场永久最大法力 +1
        //   只计数，不直接改法力：真正的生效点在 logic/core.ts 的 startManaBonusOf（每回合从此处读）
        const summoned = ctx.info.playedCard ?? benchLast(ctx, ctx.owner);
        if (!summoned || !(summoned.race || []).includes('summon')) return;
        const key = 'div:mauxir:mana';
        const cur = ctx.game?.questProgress?.[key] ?? 0;
        if (cur >= 10) return; // 法力上限本身是 10（calculateRoundStart 内 min(10,…)），计数到顶即可
        ctx.game.questProgress = { ...(ctx.game?.questProgress ?? {}), [key]: cur + 1 };
        ctx.dirty.game = true;
        flashRogueBuff(def);
    },

    SPELL_COST_DOWN_ALL: (def, ctx) => {
        // [2026-09-28 神格神经 · 猫汐尔⑥] 开局：我方**手牌 + 牌库**里所有法术魔耗 -N
        //   ⚠️ 只能覆盖开局时已在手/库里的法术；战斗中"新生成"的法术（如生成到手牌的衍生物法术）吃不到 —— 已在文档标注
        const amount = (def.battleEffect?.params?.amount as number) ?? 1;
        const isSpell = (c: CardData) => !!c.type?.startsWith('spell');
        let touched = false;
        for (const arr of [sideHand(ctx, ctx.owner), sideDeck(ctx, ctx.owner)]) {
            arr.forEach((c, i) => {
                if (!isSpell(c) || (c.cost || 0) <= 0) return;
                arr[i] = { ...c, cost: Math.max(0, (c.cost || 0) - amount), customProgress: (c.customProgress || 0) | 2 };
                touched = true;
            });
        }
        if (!touched) return;
        ctx.dirty.hand.add(ctx.owner);
        ctx.dirty.deck.add(ctx.owner);
        flashRogueBuff(def);
    },

    REMOVE_MAX_POWER: (def, ctx) => {
        // [2026-09-28 神格神经 · 猫汐尔⑥] 解除指定卡的攻击力上限（臆莲基座 maxPower:10）
        //   `getPower` 读卡上的 maxPower；把它清掉即"不再有上限"。
        //   两个触发点：game_start（已在场的）+ on_summon（此后召唤的）
        const cardKey = def.battleEffect?.params?.cardKey as string | undefined;
        if (!cardKey) return;
        const clear = (c: CardData): CardData => (c.key === cardKey && c.maxPower !== undefined ? { ...c, maxPower: undefined } : c);
        if (ctx.trigger === 'game_start') {
            let touched = false;
            const bench = sideBench(ctx, ctx.owner);
            bench.forEach((c, i) => { const n = clear(c); if (n !== c) { bench[i] = n; touched = true; } });
            if (touched) ctx.dirty.bench.add(ctx.owner);
            if (touched) flashRogueBuff(def);
            return;
        }
        const target = ctx.info.playedCard ?? benchLast(ctx, ctx.owner);
        if (!target || target.key !== cardKey || target.maxPower === undefined) return;
        updateUnitById(ctx, target.id, clear);
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
        // [2026-09-28 神格神经 · 芬妮①③] 新增可选 `keywords`：数值之外再赋予关键词（+4/+0 与【碾压】）
        const power = (def.battleEffect?.params?.power as number) ?? 0;
        const health = (def.battleEffect?.params?.health as number) ?? 0;
        const extraKeywords = (def.battleEffect?.params?.keywords as Keyword[] | undefined) ?? [];
        const grow = (u: CardData): CardData => {
            const buffed = applyPermanentBuff(u, power, health);
            return extraKeywords.length
                ? { ...buffed, keywords: Array.from(new Set([...(buffed.keywords || []), ...extraKeywords])) }
                : buffed;
        };
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
            const buffed = grow(target);
            if (ctx.trigger === 'after_attack') fight.attacker = buffed;
            else fight.blocker = buffed;
            flashRogueBuff(def);
            return;
        }
        if (!target) return;
        const buffed = grow(target);
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
        // [2026-09-28 神格神经 · 卜卜②④] 两个新参数（默认行为不变）：
        //   `powerOnly: true` → 只给攻击力（②）
        //   `targets: 'all'`  → 候选目标扩到 手牌 + 备战席 + 交战区（④）
        const dead = ctx.info.deadUnit;
        if (!dead) return;
        const p = def.battleEffect?.params ?? {};
        const power = getPower(dead);
        const health = p.powerOnly === true ? 0 : getHealth(dead);
        if (power === 0 && health === 0) return;
        const hand = sideHand(ctx, ctx.owner);
        const handIdx = hand.map((c, i) => (!c.isChampion && c.type?.includes('unit') ? i : -1)).filter(i => i >= 0);
        type Cand = { kind: 'hand'; idx: number } | { kind: 'unit'; id: string };
        const cands: Cand[] = handIdx.map(i => ({ kind: 'hand' as const, idx: i }));
        if (p.targets === 'all') {
            sideBench(ctx, ctx.owner).forEach(c => cands.push({ kind: 'unit', id: c.id }));
            ctx.combatField
                .flatMap(f => (f.owner === ctx.owner ? [f.attacker, f.blocker] : []))
                .filter(Boolean)
                .forEach(c => cands.push({ kind: 'unit', id: (c as CardData).id }));
        }
        if (cands.length === 0) return;
        const pick = cands[Math.floor(Math.random() * cands.length)];
        if (pick.kind === 'hand') {
            hand[pick.idx] = applyPermanentBuff(hand[pick.idx], power, health);
            ctx.dirty.hand.add(ctx.owner);
        } else {
            updateUnitById(ctx, pick.id, c => applyPermanentBuff(c, power, health));
        }
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
        // [2026-09-28 神格神经 · 芬妮⑥] 三个新参数（默认行为不变）：
        //   `oncePerRound` 每回合一次（账本键带回合号 → 下回合自动恢复）
        //   `keywords`     复活后额外赋予关键词（【凶恶】【坚韧】）
        //   `noEphemeral`  不带【幻象】（芬妮⑥ 是"救回来"，不是"再死一次"）
        const dead = ctx.info.deadUnit;
        if (!dead) return;
        const p = def.battleEffect?.params ?? {};
        const resurrectAll = p.all === true;
        if (p.oncePerRound === true) {
            const key = `used:${def.id}:r${ctx.game?.round ?? 0}`;
            const used = (ctx.game?.questProgress ?? {})[key] ?? 0;
            if (used > 0) return;
            ctx.game.questProgress = { ...(ctx.game?.questProgress ?? {}), [key]: 1 };
            ctx.dirty.game = true;
        } else if (!resurrectAll) {
            // 非全复活：每批(processDeaths 一次调用)每侧只复活首个阵亡者
            if (ctx.info.resurrectedSide === ctx.owner) return;
            ctx.info.resurrectedSide = ctx.owner;
        }
        const bench = sideBench(ctx, ctx.owner);
        const aliveCount = bench.filter(c => !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying').length;
        if (aliveCount >= 6) return;
        const extraKeywords = (p.keywords as Keyword[] | undefined) ?? [];
        const revived: CardData = {
            ...dead,
            isDead: false,
            damageTaken: 0, // 满血（血量 = maxHealth − damageTaken）
            animState: 'idle' as const,
            keywords: Array.from(new Set([
                ...(dead.keywords || []),
                ...(p.noEphemeral === true ? [] : ['Ephemeral' as Keyword]),
                ...extraKeywords,
            ])),
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
        //   [2026-09-29] 不死之身：对方水晶免疫伤害时整段跳过（不飘字/不发受击）
        if (hitE.overflow > 0 && !ctx.game.enemyNexusImmune) {
            const finalOverflow = ctx.game.enemyNexusTough ? Math.max(0, hitE.overflow - 1) : hitE.overflow;
            ctx.game = { ...ctx.game, enemyNexus: Math.max(0, ctx.game.enemyNexus - finalOverflow) };
            ctx.dirty.game = true;
            eventBus.emit('unit_damage', { id: 'nexus_enemy', amount: finalOverflow });
            eventBus.emit(GameEvents.NEXUS_STRIKED, { target: 'enemy', amount: finalOverflow });
        }
        if (hitP.overflow > 0 && !ctx.game.playerNexusImmune) {
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
    // [2026-09-25 莉莉子 三线任务化框架] 任务版强化：quest 未达成的【不分发】。
    //   解锁判定收口在这一处 —— 数据层只写 quest，各触发站点无需关心；进度读 ctx.game.questProgress。
    const questProgress = ctx.game?.questProgress;
    const defs = sortRogueDefs(getRogueDefs(enhIds, trigger), trigger).filter(def => {
        const q = def.quest;
        return !q || isQuestDone(questProgress, questKey.enh(def.id), q.threshold);
    });
    defs.forEach(def => {
        // [2026-09-28 莉莉子 神格神经] **一条强化可有多个效果**（battleEffects）：
        //   逐个命中本 trigger 的效果执行；执行时把 def **克隆**一份、battleEffect 指向当前效果，
        //   这样所有 handler 仍照旧读 `def.battleEffect.params`，**无需改动任何一个 handler**。
        for (const be of getBattleEffects(def)) {
            if (be.trigger !== trigger) continue;
            if (restrict && !restrict(be.effectClass)) continue;
            // [2026-09-25 莉莉子 强化线] 苛刻条件：我方场上恰好 1 个单位（孤军）
            //   判定放在 oncePerBattle **之前** —— 否则条件不满足时也会把"每场一次"用掉
            if (be.requireOnlyOneUnit) {
                const mine = [
                    ...sideBench(ctx, ctx.owner),
                    ...ctx.combatField.flatMap(f => (f.owner === ctx.owner ? [f.attacker, f.blocker] : [])),
                ].filter(Boolean);
                if (mine.length !== 1) continue;
            }
            // [2026-09-25 莉莉子 三线任务化框架] oncePerBattle：本场只生效一次
            //   账本借用 questProgress 表的 `used:<id>` 键（round_start 站点会提交 dirty.game，故能落盘）
            //   [2026-09-28] 键带效果序号：多效果条目里"每场一次"的只锁那一条效果，不误伤同条目的其他效果
            if (be.oncePerBattle) {
                const usedKey = `used:${def.id}:${be.effectClass}`;
                const used = (ctx.game?.questProgress ?? {})[usedKey] ?? 0;
                if (used > 0) continue;
                ctx.game.questProgress = { ...(ctx.game?.questProgress ?? {}), [usedKey]: 1 };
                ctx.dirty.game = true;
            }
            const handler = ROGUE_EFFECT_HANDLERS[be.effectClass];
            if (handler) handler({ ...def, battleEffect: be }, ctx);
            // 未注册 effectClass（SPELL_DOUBLE / NEXUS_HP_BOOST 等常驻查询型）静默忽略
        }
    });
};
