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
import { getRogueDefs, flashRogueBuff, applyPermanentBuff, pickRandomAlly, findStrongestUnit, applyStatBalance, applyStrikeEnhancement, isStrikeTargetAlive, isRallyByAttackPowerMet } from './rogueBattle';
import { applyFrostbite, getPower, getHealth } from './keywords';
import { isQuestDone, questKey } from './questTracker'; // [2026-09-25 莉莉子] 三线任务化框架：任务解锁判定
import { runSummonEntry } from './summonEntry'; // [2026-10-06 程拍板 · A 方案] 「入场」门铃唯一实现（依赖由 effectProcessor 注入 ⇒ 本 import 不成环）
// [2026-10-03 莉莉子 · 进攻标识三层分离 ②] 「追加一次进攻权」的唯一出口（备战们统一走它）
import { grantExtraAttackTurn } from './core';
import { eventBus, GameEvents } from '../utils/eventBus';
// [2026-10-05 莉莉子 BUG修复 · 20261005-12] 「unit_die 已派发」账本（字段版；复活点必须 clear，见 utils/deathLedger.ts 头注释）
import { clearUnitDieDispatched } from '../utils/deathLedger';
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
    SET_RANDOM_STATS: 30,     // [2026-10-06 程拍板] 「衰弱蔓延」收尾：随机目标是"弱化版"，排在两条"最强"之后
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
    // [2026-10-06 莉莉子 · 程拍板 口径②/旁支②] **本次事件的主体是谁**。
    //   为什么必须显式传：`trigger` 不再足以推出目标 ——
    //   口径② 让"攻击者挨反击"也走 `after_attacked`，旁支② 让"阻挡者的反击"也走 `after_attack`
    //   ⇒ 同一 trigger 现在有**两个可能的主体**，再靠 `fight.owner` 反推就会 buff 到对面单位。
    //   缺省（不传）时回退到旧映射：after_attack→attacker / after_attacked→blocker。
    subject?: 'attacker' | 'blocker';
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
    createFullCard: (key: string, side: 'player' | 'enemy') => CardData;
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
        const hand = sideHand(ctx, ctx.owner);

        // ==========================================
        // [2026-10-12 莉莉子 BUG修复 · 莲台无垠「顷刻莲潮」每回合无条件多发一张]
        // ── 症状（程实测）：`divfx_mauxir_6`「莲台无垠」每回合开始都往手牌塞一张「顷刻莲潮」，
        //    手牌里明明已经有，照样再给一张（程口径："似乎会无限给"）。
        // ── 根因：**本 handler 从未实现 `reduceCostIfDuplicate`**。
        //    `buffs.ts:852` 传的 `{ generateKey:'mauxir_lotus_ultimate', count:1, reduceCostIfDuplicate:true }`
        //    里那个标志位被静默忽略 ⇒ 直接落到下方**无条件**的生成循环。
        //    而 `buffs.ts:849-851` 的注释写的是"复用 `effectProcessor` 里 GENERATE 的既有分支"
        //    —— **复用错了对象**：卡牌效果走 `effectProcessor.ts:3815-3827`（那里有实现），
        //    迷宫强化走的是本文件这一份（没有实现）。**同语义两套实现，新参数只加在其中一套。**
        // ── 程的口径（唯一正确语义）：
        //      · 回合开始时**手牌里已有** ⇒ **只把那张费用 -1**，**不再给新的一张**；
        //      · 手牌里**没有**       ⇒ **只给一张**，且**不减费**。
        //    （实现与 `effectProcessor.ts:3815-3827` 逐字同构，含 `customProgress |= 2` 绿色费用标记。）
        // ==========================================
        if (def.battleEffect?.params?.reduceCostIfDuplicate) {
            const existingIdx = hand.findIndex(c => c.key === genKey);
            if (existingIdx !== -1) {
                const updated = { ...hand[existingIdx] };
                const oldCost = updated.cost || 0;
                updated.cost = Math.max(0, oldCost - 1);
                updated.customProgress = (updated.customProgress || 0) | 2; // 标记绿色费用
                hand[existingIdx] = updated;
                ctx.dirty.hand.add(ctx.owner);
                eventBus.emit('sfx_generate', updated);
                flashRogueBuff(def);
                console.log(`[Generate·迷宫强化] 手牌中已有 ${updated.name}，费用 ${oldCost}→${updated.cost}（不重复生成）`);
                return;
            }
        }

        const count = Math.max(1, (def.battleEffect?.params?.count as number) ?? 1);
        let added = 0;
        for (let i = 0; i < count; i++) {
            if (hand.length >= 10) break; // 手牌上限兜底（满了就少发，不爆牌）
            const card = ctx.createFullCard(genKey, ctx.owner); // [2026-10-13 F3·L1] ctx 里本就有 owner
            if (!card) break;
            // [2026-10-06 程实测 BUG修复] 追加 `Volatile` 前**先去重**：
            //   卡面**自带** `Volatile` 的卡（安卡的扩散 / 月镰剑势）会被堆成 `['Volatile','Volatile']`
            //   ⇒ 卡面出现**两个「瞬逝」图标**。全项目其余追加点早已用 Set
            //   （`useRoundLifecycle.ts:544` / `keywords.ts:503`），这里与 `effectProcessor` 是漏网的两处。
            if (def.battleEffect?.params?.isVolatile) {
                card.keywords = Array.from(new Set([...(card.keywords || []), 'Volatile' as any]));
            }
            // [2026-09-28 莉莉子 神格神经] costOverride：生成时改写费用
            //   （里芙 ④「0 费单挑」/ ⑥「0 费专注」/ 安卡希雅 ⑥「0 费灵轨月轮·扩散」）
            // [2026-10-06 程拍板 ②] 同时记 `costOverride` 标记 —— 否则「圆缺有律 / 升级 / 退级」
            //   那三条**整卡重建**链会用裸 `createCard` 把费用打回卡面原价（0 费变 2 费）。
            //   消费方统一走 `carryCostOverride`（见 `utils/gameRules.ts`）。
            const costOverride = def.battleEffect?.params?.costOverride as number | undefined;
            if (costOverride !== undefined) {
                card.cost = costOverride;
                card.costOverride = costOverride;
            }
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
        // [2026-10-03 莉莉子 · 进攻标识三层分离 ②] 统一走 `grantExtraAttackTurn` 唯一出口：
        //   · 不覆盖该侧已有的 `normal`（老实现无条件写 rally，会污染侦察判据）
        //   · 只作用于**本回合**（跨回合由 calculateRoundStart 硬覆盖）
        ctx.game = grantExtraAttackTurn(ctx.game, ctx.owner, def.name ?? '备战');
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
            // [2026-10-03 莉莉子 · ②] 同 RALLY：统一出口（不覆盖已有标识 / 只作用于本回合）
            ctx.game = grantExtraAttackTurn(ctx.game, ctx.owner, def.name ?? '备战(ALL_BUFF)');
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

    SET_RANDOM_STATS: (def, ctx) => {
        // [2026-10-06 程拍板 · 新增强化「衰弱蔓延」] 衰弱诅咒的**原品质替身**：
        //   目标从"当前最强"改为"**随机一个**"，其余完全同口径
        //   （`roundBuffs` 等额偏移 → 回合末还原；冻结/衰弱那两条照旧先跑）。
        const opp: Side = ctx.owner === 'player' ? 'enemy' : 'player';
        // 与 `findStrongestUnit` 同款存活过滤 + 同款"归属即查表"约定
        //   （`f.owner` 是**进攻发起方** ⇒ 对方的单位 = owner===opp 的 attacker，或 owner!==opp 的 blocker）
        const units: CardData[] = [
            ...sideBench(ctx, opp).filter(u => !u.isDead && u.animState !== 'dying' && u.animState !== 'ephemeral_dying'),
            ...ctx.combatField.flatMap((f: any) => {
                const u = f.owner === opp ? f.attacker : f.blocker;
                return (u && !u.isDead && u.animState !== 'dying' && u.animState !== 'ephemeral_dying') ? [u as CardData] : [];
            }),
        ];
        if (units.length === 0) return;
        const target = units[Math.floor(Math.random() * units.length)];
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
        const summoned = { ...ctx.createFullCard(summonKey, ctx.owner), animState: 'summoning' as const }; // [2026-10-13 F3·L1]
        bench.push(summoned);
        ctx.dirty.bench.add(ctx.owner);
        // ⚠️ [2026-10-06 独立审查 · 次要项] 闪图标的时机放在**入场结算之后** ——
        //   否则"图标已经闪了、入场效果还没跑完"，观感上像是生效了两次/先后错位。
        // =====================================
        // [2026-10-06 程拍板 · A 方案] 迷宫强化召唤也要响「入场」/「召唤时」——
        //   本 handler 是"开局召唤类"强化的落点（幽灵行动 / 精锐动员），此前是**直塞、不派发** ⇒
        //   召唤出来的单位拿不到入场效果，也吃不到「机不可失」「莲脉增殖」这类 `on_summon` 强化。
        //   ⚠️ 依赖由 `effectProcessor` 在模块初始化时注入（本文件**不能** import 它 —— 会成环）。
        // =====================================
        const entry = runSummonEntry(summoned.id, ctx.owner, {
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
            // 保守起见全量标脏（同一数组重复提交无害；漏标才会丢改动）
            ctx.dirty.game = true;
            ctx.dirty.bench.add('player');
            ctx.dirty.bench.add('enemy');
            ctx.dirty.hand.add('player');
            ctx.dirty.hand.add('enemy');
            ctx.dirty.deck.add('player');
            ctx.dirty.deck.add('enemy');
        }
        flashRogueBuff(def); // 闪图标放在入场结算之后（见上方说明）
    },

    // ---- game_start：**从牌库召唤**（「世纪和解」→ 里芙 + 芬妮）----
    // [2026-10-08 莉莉子 · 瓦尔基里大赛]
    //   ⚠️ 与上方 SUMMON 的**关键区别**：SUMMON 用 `createFullCard` **造白板卡**；
    //      本 handler 从**牌库取实例** —— 那实例在开局构建时**已挂好装备 / 武装**，随卡而来
    //      ⇒ 天然满足"召唤出来的天启者要带装备"（不必额外补挂）。
    //   ⚠️ 语义是**移出**牌库（程拍板，不是复制）；牌库里没有该 key 就**跳过**（有谁召谁，不报错）。
    //   ⚠️ 走 `runSummonEntry`「入场」门铃，与 SUMMON 同口径（拿入场效果 + `on_summon` 类强化）。
    SUMMON_FROM_DECK: (def, ctx) => {
        const keys = (def.battleEffect?.params?.summonKeys ?? []) as string[];
        if (!keys.length) return;

        const bench = sideBench(ctx, ctx.owner);
        // 用**副本**做 splice 再整体写回 —— 不原地改 ctx 里的数组
        const deck = ctx.owner === 'player' ? [...ctx.playerDeck] : [...ctx.enemyDeck];
        // ══════════════════════════════════════════════════════════════════
        // [2026-10-10 莉莉子 BUG修复 · 程实测「世纪和解有时只召出里芙和芬妮其中一个」]
        //   ── 病根：原实现**只查牌库**（`deck.findIndex(...)`，查不到就 `continue`）⇒
        //      里芙 / 芬妮 只要有一张被**起手抽到手牌**，那一次就不会被召唤。
        //      （程的怀疑成立：确实等价于"只从牌库召唤"，代码已证实。）
        //   ── 修法：**牌库 + 手牌都查**（顺序固定：**牌库优先**，保持既有行为）；
        //      两处都是**移出**（与牌库同口径，不是复制），两边都没有才跳过。
        //   ── 敌我同款（本 handler 全程按 `ctx.owner` 分侧）⇒ 敌方那张也一并修好。
        // ══════════════════════════════════════════════════════════════════
        const hand = ctx.owner === 'player' ? [...ctx.playerHand] : [...ctx.enemyHand];
        const placedIds: string[] = [];
        let deckChanged = false;
        let handChanged = false;

        for (const key of keys) {
            if (bench.length >= 6) break;          // 备战席满 ⇒ 剩余不召（程：开局不会发生，留作兜底）
            // ① 先查牌库 ② 再查手牌
            let fromDeck = true;
            let idx = deck.findIndex(c => c.key === key);
            if (idx < 0) { fromDeck = false; idx = hand.findIndex(c => c.key === key); }
            if (idx < 0) continue;                 // 两处都没有 ⇒ 跳过
            const [card] = fromDeck ? deck.splice(idx, 1) : hand.splice(idx, 1); // **移出**原处
            if (fromDeck) deckChanged = true; else handChanged = true;
            bench.push({ ...card, animState: 'summoning' as const });
            placedIds.push(card.id);
        }
        if (!placedIds.length) return;

        // 只回写**真正取过卡**的那一侧（另一侧保持原数组身份，避免无谓的脏提交）
        if (deckChanged) {
            if (ctx.owner === 'player') ctx.playerDeck = deck; else ctx.enemyDeck = deck;
            ctx.dirty.deck.add(ctx.owner);
        }
        if (handChanged) {
            if (ctx.owner === 'player') ctx.playerHand = hand; else ctx.enemyHand = hand;
            ctx.dirty.hand.add(ctx.owner);
        }
        ctx.dirty.bench.add(ctx.owner);

        // 逐个走「入场」门铃（照 SUMMON 的既有口径；返回的数组可能被整体替换，故每次都从 ctx 重取）
        for (const id of placedIds) {
            const entry = runSummonEntry(id, ctx.owner, {
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
                // 保守起见全量标脏（同 SUMMON 的理由：漏标才丢改动）
                ctx.dirty.game = true;
                ctx.dirty.bench.add('player');
                ctx.dirty.bench.add('enemy');
                ctx.dirty.hand.add('player');
                ctx.dirty.hand.add('enemy');
                ctx.dirty.deck.add('player');
                ctx.dirty.deck.add('enemy');
            }
        }
        flashRogueBuff(def);
    },

    CHAMPION_TO_HAND: (def, ctx) => {
        // 天启共鸣：开局从牌库随机抽一张天启者到手牌（提高上手率）
        // ⚠️ [2026-10-12 莉莉子] 下面的 `c.isChampion ?` 是**反向筛选（只要天启者）** —— 它是本效果的语义本身，
        //   与"手牌池误排天启者"那一类 BUG **方向相反、不是同一回事**：
        //   卡面（`buffs.ts:602` 天启共鸣 / `:624` 王权之证）写的就是"随机抽一张**天启者**"/"**天启者**必定入手"。
        //   ⇒ **别把它当成同类 BUG 一起"修"掉。**
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
        // ==========================================
        // [2026-10-12 莉莉子 BUG修复 · 芬妮②④ 100% 不生效]
        // ── 病根：本 handler 由 `on_attack_declare`（**宣告进攻**）分发，而**进攻标识要到本次战斗
        //    结算才被消耗**（`useGameState.ts:4670` 是全项目唯一置 null 处）。发备战的唯一出口
        //    `grantExtraAttackTurn` 的语义是「**已有标识 ⇒ 不重复授予**」（`core.ts:74`，2026-10-03 拍板）
        //    ⇒ 宣告时攻击方必然还持着 `normal` ⇒ **必然被拒** ⇒ 芬妮②④ 从实装起就没生效过。
        // ── 修法（**不动标识设计**，只挪"预约点"）：判定与下发改在**本次战斗结算的备战下发点**做
        //    （`useGameState.ts` 结算段 → 并入既有的 `ralliedOwners`，与"激励之声"同一条路）。
        //    那里标识已被收走 ⇒ 按 2026-10-03 的口径**正好该补一张** ✅
        //    而"额外攻击"那一路不改标识 ⇒ 结算段 `ralliedOwners` 的守卫天然挡住 ✅
        // ── 本 handler 保留为"宣告时"的实现（当前不会被分发到实处），并顺手修掉一个**假播报**：
        //    原写法在 `grantExtraAttackTurn` **没授予成功**时，也无条件 `dirty.game = true`
        //    + `gain_token_rally` 播报 + 强化图标闪 ⇒ 玩家会看到"备战了"但标识根本没变。
        // ==========================================
        const attackers = ctx.combatField
            .flatMap(f => (f.owner === ctx.owner ? [f.attacker] : []))
            .filter(Boolean) as CardData[];
        const enhIds = ctx.owner === 'player' ? ctx.game.rogueEnhancements : ctx.game.enemyEnhancements;
        if (!isRallyByAttackPowerMet(enhIds, attackers)) return;
        // [2026-10-03 莉莉子 · ②] 统一出口（芬妮②④「发起进攻时备战」= 本回合追加一次进攻）
        const granted = grantExtraAttackTurn(ctx.game, ctx.owner, def.name ?? '备战(进攻时)');
        if (granted === ctx.game) return; // 未真正授予（已有标识）⇒ 不标脏、不播报、不闪
        ctx.game = granted;
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
        // [2026-10-06 程拍板 · C1 修复] 交战区**按归属取己方**：
        //   `f.owner` 是**进攻发起方**（权威约定：`utils/combatRecovery.ts:49` 注释 +
        //   `logic/rogueBattle.ts:58-62` 的同款写法）⇒ 己方 =
        //     `f.owner === ctx.owner` 时的 `attacker` ／ `f.owner !== ctx.owner` 时的 `blocker`。
        //   ❌ 旧写法 `f.owner === ctx.owner ? [f.attacker, f.blocker] : []` **两个方向都错**：
        //      把**敌方 blocker** 当自己人盖章，又**漏掉我方 blocker**（与下方注释宣称的正好相反）。
        const allUnitsOfOwner = () => [
            ...sideBench(ctx, ctx.owner),
            ...ctx.combatField.flatMap((f: any) => (f.owner === ctx.owner ? [f.attacker] : [f.blocker])),
        ].filter((c): c is CardData => !!c
            // [2026-10-06 程拍板 · C2] **滤掉已阵亡 / 濒死的单位** —— 与同目录兄弟查询同口径
            //   （`rogueBattle.ts` 的 findStrongestUnit / pickRandomAlly 都这么滤）。
            //   旧写法只 `.filter(Boolean)` ⇒ **尸体会被盖上关键词**，还会白闪一次（体验层瑕疵）。
            && !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying');
        // [2026-10-06 莉莉子 · 审计收口] **补上 `round_start` = 我方全体**：
        //   该类原有契约（buffs.ts:83 注释）只写了 `game_start`（我方全体）/ `on_summon`（刚召唤的单位），
        //   而 `divfx_acacia_6`「剑舞长空」把它挂在 `round_start` 上 ⇒ 落进 else 分支、退化成
        //   `[ctx.info.playedCard ?? benchLast(ctx, ctx.owner)]` = **只给备战席最后一个单位**，
        //   与卡面"我方**所有**单位获得【侦察】"完全不符（且 round_start 的 `info` 是空对象）。
        //   ⇒ 现按卡面口径：`round_start` 与 `game_start` 同义 = 我方全体（含交战区己方单位）。
        const targets = (ctx.trigger === 'game_start' || ctx.trigger === 'round_start')
            ? allUnitsOfOwner()
            : [ctx.info.playedCard ?? benchLast(ctx, ctx.owner)].filter(Boolean) as CardData[];
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
        // [2026-10-12 莉莉子 口径统一 · 程拍板] **天启者也算"单位卡"** —— 删掉原先的 `!c.isChampion`
        //   卡面（`buffs.ts:630`）写的是"敌方手牌中随机 3 张**单位卡**费用 +2"，未提"不含天启者"；
        //   与今天统一的 `DEATH_GIFT` 口径一致。天启者卡 `type:'unit'`（`cards.ts:8/273`）⇒ 去掉后能入选。
        const idxs = hand.map((c, i) => (!c.type?.includes('spell') ? i : -1)).filter(i => i >= 0);
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
        // =====================================
        // [2026-10-05 莉莉子 BUG修复 · 20261005-08] **同一 trigger 的多个 BUFF 类强化必须叠加，不能互相顶掉**
        // ── 程实测：同时持有安卡神格①「月轮·引剑」+1/+0、③「满月·锋芒」+2/+0 与强化「机不可失」+1/+1 时，
        //    飞剑**只吃到其中一个**（他说"只会吃到机不可失"）；单独持有任一都正常 ⇒ 典型的"后一个抹掉前一个"。
        // ── 两个成因叠加：
        //    ① `ctx.info.playedCard` 是**分发前捕获的同一个快照**（`useGameState.ts:4577` 打出单位 /
        //       `:5131` 拉取暴露 / `effectProcessor.ts:2570` 飞剑召唤，三处都这么传）
        //       ⇒ 第二个 def 读到的仍是**还没加成的原物**；
        //    ② 原写法 `updateUnitById(ctx, card.id, () => updated)` **忽略当前值、整体替换**
        //       —— 而 `updateUnitById`（本文件 :135）本来就会把**当前单位**作为参数交给回调，原实现直接丢弃。
        //    ⇒ 后一个 def 拿"原物 + 自己那一份"覆盖，前一个 def 的加成被静默抹掉。
        // ── 修法：回调参数 `u` = **当前单位**，在它上面累加 ⇒ 天然叠加；也不再覆盖同批次的其他改动
        //    （例如飞剑的 `animState:'summoning'` 入场演出态）。
        // ── 覆盖面 = 全部 6 条 `effectClass: 'BUFF'`：on_summon 的
        //    机不可失 / 蜂拥而至 / 月轮·引剑 / 满月·锋芒 ＋ on_pull_exposed 的
        //    猎影援护 / 猎影疾袭（**茉莉安 ①③ 是同一个坑**）。
        // =====================================
        // [2026-10-10 莉莉子 · 程拍板] **`params.permanent: true` ⇒ 加成写进 `buffs`（永久）**，
        //   否则维持原语义写 `roundBuffs`（本回合）。首个使用方：神格①③「猎影援护 / 猎影疾袭」
        //   （程：「调整一下这个 BUFF 的加成效果，从本回合调整为永久」）。
        //   ⚠️ 阈值/口径一行未改——只是**换桶**：`buffs` 与 `roundBuffs` 在 `getPower/getHealth`
        //      （`logic/keywords.ts`）里**同权相加**，故数值表现连续。
        const isPermanent = (def.battleEffect?.params as any)?.permanent === true;
        updateUnitById(ctx, card.id, (u) => ({
            ...u,
            ...(isPermanent
                ? {
                    buffs: {
                        power: (u.buffs?.power || 0) + power,
                        health: (u.buffs?.health || 0) + health,
                    },
                  }
                : {
                    roundBuffs: {
                        power: (u.roundBuffs?.power || 0) + power,
                        health: (u.roundBuffs?.health || 0) + health,
                    },
                  }),
            ...(extraKeywords.length
                ? { keywords: Array.from(new Set([...(u.keywords || []), ...extraKeywords])) }
                : {}),
        }));
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
        // [2026-10-06 程拍板 · 模式 B] 按方判重：暗影双生是"**该侧**每回合首次打出单位"⇒ 只看自己那份账本
        if (!ctx.game.rogueFirstSummonDone?.[ctx.owner] && bench.length < 6) {
            const card = ctx.info.playedCard ?? benchLast(ctx, ctx.owner);
            if (card) {
                bench.push({
                    ...card,
                    id: Math.random().toString(36).substr(2, 9),
                    keywords: [...(card.keywords || []), 'Ephemeral' as any],
                    animState: 'summoning' as const,
                });
                ctx.game = { ...ctx.game, rogueFirstSummonDone: { ...(ctx.game.rogueFirstSummonDone || {}), [ctx.owner]: true } };
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
        // =====================================
        // [2026-10-05 莉莉子 BUG修复 · 20261005-14] **候选来源必须包含"正在进攻的己方单位"**
        // ── 症状（程实测 + 日志）：卜卜①镜爻随征/③万象镜身**从不召唤**；同一局里他自己那只镜爻（英雄能力）正常。
        // ── 取证：`[RogueDecl] … 卜卜神格=[divfx_bubu_1,divfx_bubu_2] 可复制备战席=0`
        //    ⇒ 神格 id 在表里 ✓、分发也跑到了 ✓，但**备战席是空的**（卜卜自己上场进攻 = 场上唯一单位）。
        // ── 病根：原实现只从 `sideBench`（备战席）取复制源 ⇒ **空场单人进攻时 `alive.length === 0` 直接 return**
        //    ⇒ "每次我方进攻时召唤"退化成"只有备战席有人时才召唤"。
        // ── 修法：候选 = **交战区里正在进攻的己方单位** ∪ 备战席存活单位。
        //    这样单手进攻时 ③「攻击力的最高者」自然选中卜卜本人 ⇒ 与卡面「召唤一个进攻中的……复制单位」
        //    以及卜卜 Lv2「完全复制自身」的设计口径一致 ✓
        // =====================================
        const isAliveUnit = (c: CardData | null | undefined): c is CardData =>
            !!c && !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying';
        const attacking = ctx.combatField
            .flatMap(f => (f.owner === ctx.owner ? [f.attacker as CardData] : []))
            .filter(isAliveUnit);
        const benchAlive = sideBench(ctx, ctx.owner).filter(isAliveUnit);
        const candidates = [...attacking, ...benchAlive];
        if (candidates.length === 0) return;
        const p = def.battleEffect?.params ?? {};
        const source = p.strongest === true
            ? candidates.reduce((a, b) => (getPower(a) >= getPower(b) ? a : b))
            : candidates[Math.floor(Math.random() * candidates.length)];
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
        // [2026-10-05 莉莉子 BUG修复 · 20261005-12 · 字段版账本] **复制出的新单位 = 新的一条命** ⇒ 擦掉标记
        //   （必须放在上面那句 `applyPermanentBuff` **之后**：它会 `{ ...card }` 把标记带过来）
        clearUnitDieDispatched(clone);
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
        // [2026-10-13 F3·L3 · **键必须带侧别**]
        //   ── 病根：原键 `div:bubu6:r<round>` **不含 owner** ⇒ 敌我共用同一本账：
        //      A 方打击水晶记了账，B 方 `round_end` 兑现时也读到同一格 ⇒ **替对方多打一记**。
        //   ── 本 handler 的**全部读写**（记账 `:1064` / 兑现 `:1069` / 清零 `:1085`）
        //      都经这个局部 `key` ⇒ **只此一处收口**。
        //   ── ⚠️ 防回归：questProgress 是**扁平共享表**（`types.ts:333`），
        //      **凡是"我方进度"语义的计数键都必须带侧别段**（与命名空间
        //      `enh:<id>` / `gear:<卡实例id>:<装备id>` 的前缀分段约定一致）。
        const key = `div:bubu6:r${round}:${ctx.owner}`;
        const qp = ctx.game?.questProgress ?? {};
        if (ctx.trigger === 'on_nexus_strike') {
            // ══════════════════════════════════════════════════════════════════
            // [2026-10-10 莉莉子 · 程拍板平衡调整] **只在"本回合首次"打击水晶时记账**
            //   ── 原实现是**每次**打击都累加（`(qp[key] ?? 0) + 1`），而 round_end 按次数
            //      **乘法结算**（下面 `total = perHit * times`）⇒ 一回合打 3 次水晶，
            //      回合结束就一次性打出 **3 倍攻击力** ⇒ 程实测"很多时候直接就秒杀了"。
            //   ── 现改为：本回合已记过就直接返回 ⇒ `times` 只可能是 0 或 1
            //      ⇒ 每回合最多结算**一次**（由备战席最强单位再打一记）。
            //   ── 键仍带回合号（`div:bubu6:r<round>:<owner>`）⇒ 天然按回合重置，无需额外清理。
            // ══════════════════════════════════════════════════════════════════
            if ((qp[key] ?? 0) > 0) return; // 本回合已记过 ⇒ 不再累加（零副作用）
            ctx.game.questProgress = { ...qp, [key]: 1 };
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
        // ══════════════════════════════════════════════════════════════════
        // [2026-10-10 莉莉子 BUG修复 · 程实测「镜阵回响造成的伤害没有飘字」]
        //   ── 病根：原先发的是 `unit_damage` + 水晶锚点（`nexus_enemy`），而
        //      ①**单位飘字**（`Card.tsx:737`）按**卡 id** 查卡 ⇒ 水晶锚点查不到任何卡；
        //      ②**水晶飘字/震屏**（`GameUI.tsx:83`）只听 `NEXUS_STRIKED`；
        //      ③微队列的 `UNIT_DAMAGED` 也按单位 id 找（`useGameState.ts:2802`）⇒ 同样找不到。
        //      ⇒ 这一击**三方都不认**：无飘字、无音效、无震屏，也不记账（整段静默）。
        //   ── 为什么当初不发 `NEXUS_STRIKED`：怕再次触发 `on_nexus_strike` 形成回环
        //      （`useGameState.ts:1263` 会把它排进微队列 ⇒ 卜卜目睹计数 + 强化触发）。
        //   ── 修法：**照发正牌 `NEXUS_STRIKED`（飘字 / 震屏 / 音效一次到位），但带 `floatOnly: true`** ——
        //      微队列见标记直接跳过 ⇒ 演出齐全，记账与回环都不会发生。
        // ══════════════════════════════════════════════════════════════════
        eventBus.emit(GameEvents.NEXUS_STRIKED, {
            target: ctx.owner === 'player' ? 'enemy' : 'player',
            amount: total,
            floatOnly: true, // [2026-10-10] 只演出：不排微队列（不计数、不重触发）
        });
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
        //   ⚠️ 旧实现"只计数、不直接改法力"（生效点 `startManaBonusOf` 只在**回合开始**被读）。
        // [2026-10-06 程实测 BUG修复 · 两处叠加]
        //   ① **库效召唤那条路根本不派发 `on_summon`**（已修：`useRoundLifecycle` 的库效扫描处补门铃）
        //      ⇒ 这个 handler **从来没被调用过**（实测日志里一行 `[莲脉增殖]` 都没有）。
        //   ② 即便调到了，**只计数也要等到下个回合才涨**；卡面写的是「本场战斗最大法力**永久** +1」
        //      ⇒ 必须**当场生效**。现口径：**计数 + 当场给本回合 +1**。
        //   ⚠️ 不会与查询重复计：`calculateRoundStart` 每回合**从零重算**（`min(10, round + bonus)`），
        //      当场的 +1 只补"本回合"，下回合那份由计数统一给。
        const summoned = ctx.info.playedCard ?? benchLast(ctx, ctx.owner);
        if (!summoned || !(summoned.race || []).includes('summon')) return;
        // [2026-10-13 F3·L4 · **键必须带侧别**]
        //   ── 病根：原键 `div:mauxir:mana` **不含 owner**，而读取端 `core.ts:44` 的
        //      `startManaBonusOf` 是**玩家侧专用查询**（敌方那份是另一个
        //      `enemyStartManaBonusOf`，只累加 START_MANA_BONUS）
        //      ⇒ **敌方召唤会把玩家的最大法力一起加**。
        //   ── ⚠️ 顺带记录（未处理）：切分后敌方那份计数**当前无人读取** ⇒
        //      敌方持有 `divfx_mauxir_3` 时，这条强化在"下回合起的查询"上不再见效
        //      （本回合那 +1 仍由下方 `maxField` 的 owner 分支照常给）。
        //      这是**原有功能缺口**（敌方侧从未实现过查询端），不是本次引入；
        //      要不要给敌方补上查询，已列入待办请程定。
        const key = `div:mauxir:mana:${ctx.owner}`;
        const cur = ctx.game?.questProgress?.[key] ?? 0;
        if (cur >= 10) return; // 法力上限本身是 10（calculateRoundStart 内 min(10,…)），计数到顶即可
        ctx.game.questProgress = { ...(ctx.game?.questProgress ?? {}), [key]: cur + 1 };
        // [2026-10-06 自审修复 · 法力上限] 当场那 +1 也要**受 10 点上限约束** ——
        //   计数封顶只管"下回合起的查询"，管不住"同一回合内连续召唤"的即时叠加
        //   （`calculateRoundStart` 只在回合边界钳 min(10,…)）⇒ 这里自己钳一下，别让本回合涨过 10。
        const maxField = ctx.owner === 'player' ? 'playerMaxMana' : 'enemyMaxMana';
        const manaField = ctx.owner === 'player' ? 'playerMana' : 'enemyMana';
        if ((ctx.game[maxField] || 0) < 10) {
            ctx.game = {
                ...ctx.game,
                [maxField]: (ctx.game[maxField] || 0) + 1,
                [manaField]: (ctx.game[manaField] || 0) + 1,
            } as typeof ctx.game;
        }
        ctx.dirty.game = true;
        flashRogueBuff(def);
    },

    SPELL_COST_DOWN_ALL: (def, ctx) => {
        // [2026-09-28 神格神经 · 猫汐尔⑥] 开局：我方**手牌 + 牌库**里所有法术魔耗 -N
        // [2026-10-06 莉莉子 BUG修复 · 莲台无垠] **职责已收窄**：本条现在只负责"**改开局那份数据**"
        //   （让卡面能显示绿色减费、玩家看得见）；**真正吃到减费靠 `getEffectiveSpellCost` 的查询时判定**
        //   ⇒ 战斗中**新生成**的法术（梦莲无人机等）也能减 ✓（原先它们一张都吃不到，玩家侧观感＝完全没生效）。
        //   ⚠️ 改数据时**必须同时记 `spellCostDown`**：查询那边据此只补差额 ⇒ **不会双减**。
        const amount = (def.battleEffect?.params?.amount as number) ?? 1;
        const isSpell = (c: CardData) => !!c.type?.startsWith('spell');
        let touched = false;
        for (const arr of [sideHand(ctx, ctx.owner), sideDeck(ctx, ctx.owner)]) {
            arr.forEach((c, i) => {
                if (!isSpell(c) || (c.cost || 0) <= 0) return;
                // 幂等：本场对这张卡已应用过同样额度就跳过（防开局这份被重复减）
                if ((c.spellCostDown ?? 0) >= amount) return;
                arr[i] = {
                    ...c,
                    cost: Math.max(0, (c.cost || 0) - amount),
                    spellCostDown: (c.spellCostDown ?? 0) + amount,
                    customProgress: (c.customProgress || 0) | 2,
                };
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
        // [2026-10-12 莉莉子 口径统一 · 程拍板] **天启者也算"单位卡"** —— 删掉原先的 `!c.isChampion`
        //   卡面（`buffs.ts:468`）写的是"手牌中随机一张**单位卡**费用减少"，未提"不含天启者"。
        //   ⚠️ 本条是**敌我双开关**（`playerEligible/enemyEligible` 均为 true），影响面最大。
        const unitHand = hand.map((c, i) => (c.type?.includes('unit') ? i : -1)).filter(i => i >= 0);
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
            // =====================================
            // [2026-10-06 莉莉子 · 程拍板 **口径② + 旁支②**] 目标改由 **`info.subject`** 决定：
            //   口径②：「被打击」= 当阻挡者挨打 **或** 进攻被反击 ⇒ 攻击者也可能走 after_attacked
            //   旁支②：**阻挡者的反击也算「打击」** ⇒ 阻挡者也可能走 after_attack
            //   ⇒ `trigger` **不再足以推出目标**！必须由派发方（战斗站点）显式告知"这次是谁"。
            //   ⚠️ 缺省回退到**旧映射**（after_attack→attacker / after_attacked→blocker），
            //      保证任何没传 subject 的老路径逐字不变。
            // =====================================
            const subject: 'attacker' | 'blocker' = ctx.info.subject
                ?? (ctx.trigger === 'after_attack' ? 'attacker' : 'blocker');
            target = subject === 'attacker' ? fight.attacker : fight.blocker;
            if (!target) return;
            // [2026-09-15 莉莉子 BUG修复] 改用统一存活判据（叠加真实血量）。
            // 原判据只看 animState，漏掉"伤害已致死但尚未标 dying"的单位 → 被 +1/+1 救活。
            if (!isStrikeTargetAlive(target)) return;
            // 直接改 updatedFight 对象（站点统一 setCombatField 提交），无散装 set
            const buffed = grow(target);
            if (subject === 'attacker') fight.attacker = buffed;
            else fight.blocker = buffed;
            flashRogueBuff(def);
            return;
        }
        if (!target) return;
        // [2026-10-05 莉莉子 BUG修复 · 20261005-08] **与 BUFF 同源**：原写法
        //   `const buffed = grow(target); updateUnitById(ctx, id, () => buffed)` 里的 `target` 可能是
        //   **分发前捕获的快照**（`on_first_play_unit` 传 `ctx.info.playedCard`）⇒ 同一 trigger 上的多个
        //   `BUFF_SELF` 会互相顶掉（**芬妮神格①「聚光灯下」+2/+0 与 ③「全场焦点」+4/+0【碾压】**、
        //   或与强化「先锋之锐」同持时，只有最后一个生效）。
        //   直接把纯函数 `grow` 交给 `updateUnitById`（它会把**当前单位**作为参数）⇒ 天然叠加。
        //   （里芙 ①③ 走上面的 `after_attack` 分支、改的是 `fight.attacker` 原地对象，本来就不受影响。）
        updateUnitById(ctx, target.id, grow);
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
        // =====================================
        // [2026-10-03 莉莉子 BUG修复] **不能取 `getHealth`（= 当前血量）**
        // ── 症状（粉丝实测）：英魂传承会把**负数血量**加到继承者身上 ⇒ 继承者反而掉血。
        // ── 根因：`getHealth(c) = health + buffs.health + roundBuffs.health - damageTaken`
        //    （`logic/keywords.ts:88`）—— 对一个**阵亡单位**，它必然 ≤ 0，实际常是**负数**
        //    （例：5 血单位吃 8 点伤害 ⇒ -3）⇒ 直接当"加成"传进 `applyPermanentBuff`。
        // ── 正解：取**身材**（基础生命 + 增益），**不含致死伤害** ——
        //    与同族 `DEATH_STRIKE_RANDOM_ENEMY`（献祭回响，本文件 :532「取身材，不含致死伤害」）**同口径**。
        //    `Math.max(0, …)` 对齐该处的下限写法。
        // ── 攻击力那一半不动：`getPower` 本身就有 0 下限（`keywords.ts:86`）⇒ 不可能为负。
        // =====================================
        const health = p.powerOnly === true
            ? 0
            : Math.max(0, (dead.health || 0) + (dead.buffs?.health || 0) + (dead.roundBuffs?.health || 0));
        if (power === 0 && health === 0) return;
        const hand = sideHand(ctx, ctx.owner);
        // [2026-10-12 莉莉子 口径统一 · 程拍板「该给」] **天启者也算"单位"** —— 删掉原先的 `!c.isChampion`
        // ── 程的判定：给。依据三条 ——
        //    ① 卡面文案写的就是"单位"，一个字没提"不含天启者"（`buffs.ts:474/790/797`）；
        //    ② 项目里所有「随机一个我方单位」类强化（回旋余力/回合加护/战意高涨/军势鼓舞…）
        //       都走 `pickRandomAlly`（`rogueBattle.ts:71-88`），其过滤只有"没死/不在死亡动画/非指定排除"，
        //       **从不排天启者** ⇒ 这里原先的排除是全项目唯一的例外；
        //    ③ 手册无任何"排除天启者"的设计记录（`设计-神格神经.md:728-729` 只写了 powerOnly / targets）。
        // ── 影响面：英魂传承 `death_gift` · 卜骨遗响 `divfx_bubu_2` · 龟甲承魂 `divfx_bubu_4`
        //    这三条的手牌候选池。⚠️ `targets:'all'` 的备战席/交战区候选**本来就没排除天启者**
        //    ⇒ 改完这三条口径才真正一致（此前是"手牌不给、场上给"的自相矛盾）。
        // ── 已核实：天启者卡 `type: 'unit'`（`cards.ts:8` 里芙 / `:273` 猫汐尔）⇒ 去掉 `!isChampion` 后确实能入选。
        const handIdx = hand.map((c, i) => (c.type?.includes('unit') ? i : -1)).filter(i => i >= 0);
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
        // [2026-10-05 莉莉子 BUG修复 · 20261005-12 · 字段版账本] **复活 = 新的一条命** ⇒ 擦掉「unit_die 已派发」标记，
        //   否则它下一次阵亡将不再触发任何 unit_die 强化（字段随 `{ ...dead }` 被带过来了）
        clearUnitDieDispatched(revived);
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
        // [2026-10-06 莉莉子 · 审查 Q6-c 反例]**这里还漏了 `after_attacked`**：
        //   王见王是**双方必然互殴**（上面两发 `applyDuelHit` 无条件调用）⇒ 按口径②
        //   「进攻被反击也算被打击」/ 旁支②「互打 ⇒ 双方既打击又被打击」，
        //   两侧都该再走一次 `after_attacked` —— 否则「以守为攻 / 愈战愈勇」类成长在**王见王永不触发**。
        if (isStrikeTargetAlive(hitP.target)) {
            const afterAtkP = applyStrikeEnhancement(ctx.game.rogueEnhancements, 'after_attack', hitP.target);
            hitP = { ...hitP, target: applyStrikeEnhancement(ctx.game.rogueEnhancements, 'after_attacked', afterAtkP) };
        }
        if (isStrikeTargetAlive(hitE.target)) {
            const afterAtkE = applyStrikeEnhancement(ctx.game.enemyEnhancements, 'after_attack', hitE.target);
            hitE = { ...hitE, target: applyStrikeEnhancement(ctx.game.enemyEnhancements, 'after_attacked', afterAtkE) };
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
// [2026-10-06 莉莉子 BUG修复 · 莲台无垠] 「全法术减费」合计（**数据驱动**：扫 SPELL_COST_DOWN_ALL 的 params.amount）
//   建局时算一次、塞进 `gameRules` 的只读快照 ⇒ 查询口径据此给**所有**法术（含战斗中生成的）减费。
// ==========================================
export const getSpellCostDownAll = (enhIds: string[] | undefined): number => {
    let n = 0;
    for (const def of getRogueDefs(enhIds, 'game_start')) {
        for (const be of getBattleEffects(def)) {
            if (be.effectClass === 'SPELL_COST_DOWN_ALL') n += ((be.params?.amount as number) ?? 1);
        }
    }
    return n;
};

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
