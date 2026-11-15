// ==========================================
// [2026-11-14 莉莉子 ✨新功能 · 凯茜娅·狂诗「养攻」L2 地基]
// ──────────────────────────────────────────
// ── 口径（程拍板，数值不许改）：
//      S = 本局**我方**已打出的法术总数（从对局开始算，含“倾泻”，含**被反制**的法术）
//      D = 本局**我方**“倾泻”累计扣掉的攻击力
//      任何一张「凯茜娅·狂诗」的有效攻击力 = 2 + S − D
//      （卡面基础 `power: 2` —— `data/cards.ts:570`）
//  ── [2026-11-14 L3] 追加第三本账 `damage`（**升级进度**：本局她本体累计造成 18 点 → Lv2）：
//      只算「倾泻的伤害 + 她本体进攻的战斗伤害」，**不算**别的法术卡（冻结弹幕等）打的伤害
//      ⇒ 记账钩子只有两处（见 `KATYA_UPGRADE_DAMAGE` 的注释），不做全局受伤钩子。
//
// ── 为什么是**全局计数**、不是记在每张卡上：
//    同一个阵营会有**多张本体**同时存在（手牌 / 备战席 / 战场 / 牌库），
//    它们共用同一本账 ⇒ 「牌库里的那张也涨、抽到即战力」，而且第二张“倾泻”
//    落地时**继承**第一张扣掉的 D（既不是回到 2，也不是变回法术前的值）。
//
// ── 为什么真源放「模块级账本」（照 `utils/mauxirProgress.ts:18-23` 的同一判据）：
//    · 放卡上 → 被“整数组写回”覆盖（`setPlayerBench(累积数组)` 这类**值式**写回很多）
//    · 放 `game` → `setGame(res.game)` 同样是**值式**写回，同样会被覆盖
//    ⇒ 唯一稳的家是 **React state 之外**。
//
// ── 结构（与猫汐尔 / 茉莉安完全同构）：
//    真源 = 本模块的 `ledger`（**单一自增**：`bumpKatyaSpell` / `bumpKatyaDrain`）
//    镜像 = 卡上的 `buffs.power`（净成长 S−D，**幂等贴值**）+ `katyaSpellGrowth`（S，显示用）
//    ⇒ 漏贴/被覆盖只会让**显示**短暂落后，**绝不丢账**（下一处贴值即自愈）。
//
// ── ⚠️ 幂等贴值（程拍板的硬要求）：每次重算 `buffs.power`，**绝不累加** ——
//    否则“生成 / 回库 / 变形”产生的新实例会各自 +1，同一份账分裂成 N 份。
//    读取口径仍是 `logic/keywords.ts:89-95` 的 `getPower`：
//      `power + buffs.power + roundBuffs.power`（≥0 钳制）⇒ 本文件只写 `buffs.power`。
//
// ── ⚠️ 账本必须在**每一场对局开局**清零 —— 两个建局入口：
//    `useGameState` 的初始构建 effect（`:651`）与 `resetGame`（`:1923`），
//    与 `resetMauxirProgress` 完全同源（历史上正是漏了一处才出过 2026-08-25 那类事故）。
//
// ── ⚠️ `buffs.power` 由本系统**独占**：`stampKatyaCard` 每次重算都把它**覆盖**成 S − D。
//    所以任何“给凯茜娅 +N/+0”的效果（L3 的「穿云激流」+4/+0、「倾泻」扣减…）
//    **必须记进账本**（扣减 → `bumpKatyaDrain`；加攻 → 另立一段账，由程定），
//    直接改 `buffs.power` 会在下一次贴值时被静默抹掉 —— 那不是 bug，是“幂等贴值”的代价。
// ==========================================
import type { CardData } from '../types';

/** 凯茜娅的战力 key（与 `data/cards.ts:570` 同源） */
export const KATYA_KEY = 'katya_klein_rhapsody';

/** 卡面基础攻击力（`data/cards.ts:570` 的 `power: 2`）；净成长 = S − D 相对它而言 */
export const KATYA_BASE_POWER = 2;

/**
 * 升级阈值：本局凯茜娅**本体**累计造成 18 点伤害 → Lv2（`data/cards.ts:579-580` 的
 * `levelUpCondition` / `levelUpTarget` 同源）。
 *
 * ⚠️ 口径（程拍板）—— 只有「**凯茜娅自己打出去的伤害**」进这本账：
 *   · 「倾泻」每一发的伤害（`logic/effectProcessor.ts` 的 `case 'BARRAGE'`）
 *   · 她本体进攻造成的战斗伤害（`logic/combat.ts` 的两个战斗结算函数）
 *   · **不含**任何其他法术卡造成的伤害（例如「冻结弹幕」的 1 点）——
 *     所以记账钩子刻意钉在**上面两处**，不做「全局受伤钩子」：那种钩子分不清
 *     "谁打的"，会把法术卡的伤害也算成她的。
 */
export const KATYA_UPGRADE_DAMAGE = 18;

/** 账本口径：一名玩家的 S / D / 累计伤害 */
interface KatyaRecord {
    /** 本局已打出的法术总数（含倾泻、含被反制的） */
    spell: number;
    /** 本局“倾泻”累计扣掉的攻击力 */
    drain: number;
    /** 本局凯茜娅**本体**累计造成的伤害（口径见 `KATYA_UPGRADE_DAMAGE`） */
    damage: number;
}

/** 真源：按方各一本账（镜像对局里敌我互不串味） */
const ledger: { player: KatyaRecord; enemy: KatyaRecord } = {
    player: { spell: 0, drain: 0, damage: 0 },
    enemy: { spell: 0, drain: 0, damage: 0 },
};

/**
 * 读权威账本。
 * @returns `{ spell: S, drain: D, damage, power: 2 + S − D }`
 * ⚠️ `power` 是**精确口径**（可能为负：D 理论上可以大过 2+S）；
 *    战斗读取走 `getPower`（`logic/keywords.ts:89-95`）会在那里钳到 ≥0，本函数**不替代**它。
 * ⚠️ `damage` 是新增字段（升级判定用），老调用方只解构 spell/drain/power ⇒ 天然兼容。
 */
export const getKatyaStats = (side: 'player' | 'enemy'): { spell: number; drain: number; damage: number; power: number } => {
    const rec = ledger[side] || { spell: 0, drain: 0, damage: 0 };
    const spell = rec.spell || 0;
    const drain = rec.drain || 0;
    const damage = rec.damage || 0;
    return { spell, drain, damage, power: KATYA_BASE_POWER + spell - drain };
};

/**
 * 记一张「本局打出的法术」—— **全项目唯一自增入口**。
 * 唯一调用点：`hooks/useSpellSystem.ts` 的 `dispatchSpellCastSideEffects`（函数尾部第 ⑥ 段）
 *   （它覆盖 极速法术 / 堆栈法术 / **被反制**的法术 三个出口 —— 程的口径：
 *    “被反制掉的法术也算施放过”；⚠️ 不要改挂 `SPELL_CAST_SETTLED`，那条 emit
 *    被 `owner === 'player'` 包着（见同文件该 emit 处），敌方凯茜娅会收不到）。
 * @returns 记账后的权威战力（调用方可直接拿去贴值）
 */
export const bumpKatyaSpell = (side: 'player' | 'enemy'): number => {
    const rec = ledger[side];
    rec.spell = (rec.spell || 0) + 1;
    return KATYA_BASE_POWER + rec.spell - (rec.drain || 0);
};

/**
 * 记一笔「倾泻扣掉的攻击力」—— 全项目唯一自增入口。
 * ⚠️ 供 **L3「倾泻」实现** 调用：扣攻击力时**只记 D**，不要自己去写 `buffs.power`
 *    —— 那条通道归本文件的幂等贴值，两处都写就是两份账（会互相覆盖 / 分裂）。
 * @param amount 本次被扣掉的攻击力点数（≤0 视为无效，不动账）
 * @returns 记账后的权威战力
 */
export const bumpKatyaDrain = (side: 'player' | 'enemy', amount: number): number => {
    const rec = ledger[side];
    if (!(amount > 0)) return KATYA_BASE_POWER + (rec.spell || 0) - (rec.drain || 0);
    rec.drain = (rec.drain || 0) + amount;
    return KATYA_BASE_POWER + (rec.spell || 0) - rec.drain;
};

/** 对局开局/重开清零（**两个建局入口都必须调**，见文件头） */
export const resetKatyaProgress = (): void => {
    ledger.player = { spell: 0, drain: 0, damage: 0 };
    ledger.enemy = { spell: 0, drain: 0, damage: 0 };
    // 军械员减费账本同属"一局"的生命周期 ⇒ 一起清（见上方该账本的注释）
    barrageCostDown.player = 0;
    barrageCostDown.enemy = 0;
    // [2026-11-14 尤拉莉雅] 发数加成同属一局一本 ⇒ 一起清（漏清 ⇒ 跨局残留；镜像对局还会串侧）
    barrageObserverBonus.player = 0;
    barrageObserverBonus.enemy = 0;
    // [2026-11-14 尤拉莉雅闸门] 回合配额同属一局 ⇒ 一起清（否则上一局撞过上限，新局第一回合就哑火）
    observerRoundGate.clear();
};

/**
 * 记一笔「凯茜娅**本体**造成的伤害」—— 升级进度（18 → Lv2）的唯一自增入口。
 *
 * ⚠️ 只在两处调用（口径见 `KATYA_UPGRADE_DAMAGE`）：
 *   ① `logic/effectProcessor.ts` 的 `case 'BARRAGE'`（倾泻每发的实际伤害合计）
 *   ② `logic/combat.ts` 的 `resolveSingleCombat` / `resolveDoubleStrikeCombat`
 *      （她本体进攻打出的实际战斗伤害）
 *   **不要**改成"任何单位受伤就记一笔"的全局钩子 —— 那会把别的法术卡（冻结弹幕等）
 *   造成的伤害也记到她头上，升级会莫名提前。
 *
 * @param amount 本次实际造成的伤害点数（≤0 视为无效，不动账）
 * @returns 记账后的累计伤害
 */
export const bumpKatyaDamage = (side: 'player' | 'enemy', amount: number): number => {
    const rec = ledger[side];
    if (!(amount > 0)) return rec.damage || 0;
    rec.damage = (rec.damage || 0) + amount;
    return rec.damage;
};

/** 读权威累计伤害（升级判据 `>= KATYA_UPGRADE_DAMAGE`；UI 进度环读卡上镜像 `katyaDamage`） */
export const getKatyaDamage = (side: 'player' | 'enemy'): number => ledger[side]?.damage || 0;

// ==========================================
// [2026-11-14 莉莉子 ✨新功能 · 凯茜娅「倾泻」动态费用] **军械员打击减费账本**（本批只留接口）
// ── 设计：每次「军械员打击」后，「倾泻」的**永久** −1（可叠加），归该次打击的施动方。
// ── 为什么记这里：查询腿 `getEffectiveSpellCost`（`utils/gameRules.ts:31`）是**纯查询函数**，
//    调用点遍布 10 处（卡面显示 / 门禁 / 实扣）⇒ 只能读模块级快照，不能塞签名
//    （与 `spellCostDownAllSnapshot` / `nexusMaxSnapshot` 同一惯例）。
// ── L4 接线方式：军械员打击结算处调 `addKatyaBarrageCostDown(side, 1)` 即可，
//    **查询腿这边零改动**（`gameRules.ts` 已按本账本分支）。
// ── ⚠️ 清零：跟随 `resetKatyaProgress()` 一起清（同一局的生命周期）。
// ==========================================
const barrageCostDown: { player: number; enemy: number } = { player: 0, enemy: 0 };

/** 读某方「倾泻」的累计减费量（0 = 无减费） */
export const getKatyaBarrageCostDown = (side: 'player' | 'enemy'): number =>
    Math.max(0, barrageCostDown[side] || 0);

/** 累加某方「倾泻」减费（L4 军械员打击调用；`amount` ≤0 无效） */
export const addKatyaBarrageCostDown = (side: 'player' | 'enemy', amount: number): number => {
    if (!(amount > 0)) return getKatyaBarrageCostDown(side);
    barrageCostDown[side] = Math.max(0, (barrageCostDown[side] || 0) + amount);
    return barrageCostDown[side];
};

/** 直接设定（沙盒 / 调试用；真机走 `addKatyaBarrageCostDown`） */
export const setKatyaBarrageCostDown = (side: 'player' | 'enemy', value: number): number => {
    barrageCostDown[side] = Math.max(0, Math.floor(value) || 0);
    return barrageCostDown[side];
};

// ==========================================
// [2026-11-14 莉莉子 ✨新功能 · 凯茜娅 L4「映现·尤拉莉雅」]
// ② 「每次受到打击 ⇒ ‘倾泻’的**发数** +1（无上限）」的账本。
// ── 记在哪：**模块账本**，与上面的 S/D、以及 `barrageCostDown` 同一本账的生命周期（一局一本）。
// ── 为什么不并进 `getKatyaStats`（那是「养攻」的账）：
//    `power` 的语义是**攻击力**（2 + S − D），而本加成是「**发数**的额外加数」——
//    `BARRAGE` 的发数 = `ceil(攻击力 / 2) + 观察员加成`。
//    混进 `power` 会让 `buffs.power` 镜像（`stampKatyaCard` 每回合整份重算）凭空涨，
//    连卡面数值、升级判定口径一起跑偏。⇒ 另开一本，**只给 `BARRAGE` 的发数读**。
// ── 为什么住模块账本而不是 `game`：`BARRAGE` 在 `effectProcessor` 里是个**纯结算**，
//    拿不到 React state；而 `katyaProgress` 正是"跨四区域、非 React"的既有真源（见文件头）。
// ── 清零：随 `resetKatyaProgress()` 一局一清（两个建局入口都已调它）。
// ==========================================
const barrageObserverBonus: { player: number; enemy: number } = { player: 0, enemy: 0 };

/** 读某方「倾泻」发数的累计额外加成（0 = 无加成） */
export const getKatyaBarrageObserverBonus = (side: 'player' | 'enemy'): number =>
    Math.max(0, Math.floor(barrageObserverBonus[side] || 0));

/** 累加某方「倾泻」发数加成（尤拉莉雅受击触发；`amount` ≤0 无效） */
export const addKatyaBarrageObserverBonus = (side: 'player' | 'enemy', amount: number): number => {
    if (!(amount > 0)) return getKatyaBarrageObserverBonus(side);
    barrageObserverBonus[side] = Math.max(0, (barrageObserverBonus[side] || 0) + Math.floor(amount));
    return barrageObserverBonus[side];
};

/** 直接设定（沙盒 / 调试用；真机走 `addKatyaBarrageObserverBonus`） */
export const setKatyaBarrageObserverBonus = (side: 'player' | 'enemy', value: number): number => {
    barrageObserverBonus[side] = Math.max(0, Math.floor(value) || 0);
    return barrageObserverBonus[side];
};

// ==========================================
// [2026-11-14 莉莉子 ✨ · 程拍板] 尤拉莉雅「受击 ⇒ 倾泻发数 +1」的**每回合上限闸门**
//
// 👤 程的口径：「让她的受击后倾泻次数增加的能力，每回合最多只能触发 1 次或两次，不再每回合无限触发」
//    ⇒ 取上限 **2**（`KATYA_OBSERVER_MAX_PER_ROUND`，单一常量，不散写）。
//
// ── 为什么闸门住**模块账本**，而不是学 `barrierGrantedRound` 写卡上字段（两种都想过）：
//    ① **同源**：派发点 `KATYA_BARRAGE_OBSERVER` 本来就在这本账里记账（`addKatyaBarrageObserverBonus`）
//       闸门与账目同处一文件 ⇒ 不可能出现「账记了、闸没放」这种分裂。
//    ② **不改契约**：`processEffect` 的 `KATYA_BARRAGE_OBSERVER` case **不返回任何卡改动**
//       （它只动账本 + 发金光）。要写卡上字段就必须让 case 返回新 `bench`/`combatField`，
//       而这一批返回要被微队列（`useGameState.ts` 的 `UNIT_DAMAGED`）逐区吸收 ——
//       那条吸收链是**所有 ON_DAMAGE_SURVIVE 消费者共用**的，为一个上限去动它，风险远大于收益。
//    ③ **抗重建**：卡实例会被 `stampKatyaCard`（四区域兜底贴值）/ 变形 / 克隆整份重建，
//       卡上字段跟着对象走；账本按**实例 id** 记，重建不影响归属。
//    ④ **零清理**：过期靠比较 `game.round`，与 `barrierGrantedRound`（`types.ts:154`）同一范式，
//       不需要在建局 / 回合清 / 快照里各接一根线 —— 那三处漏一处就会永久锁死。
//
// ── 记账键 = 受伤单位的**实例 id**（`context.sourceCard.id`，缺省回落阵营）：
//    场上两张同名卡各算各的，与卡面「**每当我方**单位受到打击」的主体一致。
// ── 清零：`resetKatyaProgress()` 一局一清（两个建局入口都已调它）。
// ==========================================

/** 尤拉莉雅「受击 ⇒ 倾泻发数 +1」每回合最多触发次数（**唯一真源**，改上限只改这里） */
export const KATYA_OBSERVER_MAX_PER_ROUND = 2;

/** 闸门账：key（卡实例 id / 阵营）→ 最近一次触发的回合 + 该回合已触发次数 */
const observerRoundGate = new Map<string, { round: number; count: number }>();

/**
 * 取一次「受击 +1」的配额。
 *
 * 回合换了就**整条自然过期**（`round !== 当前回合` ⇒ count 从 0 重来），所以没有任何清理接线。
 * 超限返回 `false`（调用方**静默**跳过，不打 warn —— 倾泻多发时每回合都会撞上限）。
 *
 * @param gateKey 卡实例 id（缺省用 `side:xxx`）
 * @param round   当前 `game.round`
 * @param max     本回合上限（缺省 `KATYA_OBSERVER_MAX_PER_ROUND`）
 */
export const tryTakeKatyaObserverShot = (
    gateKey: string,
    round: number,
    max: number = KATYA_OBSERVER_MAX_PER_ROUND,
): boolean => {
    const key = gateKey || 'side:unknown';
    const safeRound = Number.isFinite(round) ? Math.floor(round) : 0;
    const limit = Math.max(1, Math.floor(max) || KATYA_OBSERVER_MAX_PER_ROUND);
    const cur = observerRoundGate.get(key);
    const entry = cur && cur.round === safeRound ? cur : { round: safeRound, count: 0 };
    if (entry.count >= limit) {
        observerRoundGate.set(key, entry);
        return false;
    }
    entry.count += 1;
    observerRoundGate.set(key, entry);
    return true;
};

/** 只读：某键本回合已触发次数（调试 / 卡面预览用；不消耗配额） */
export const getKatyaObserverShotsUsed = (gateKey: string, round: number): number => {
    const cur = observerRoundGate.get(gateKey || 'side:unknown');
    return cur && cur.round === (Number.isFinite(round) ? Math.floor(round) : 0) ? cur.count : 0;
};

/**
 * **[沙盒 / Studio DNA 面板专用]** 直接设定权威账本（“一键设定 S/D”用）。
 * 真机流程**不会**调用它 —— 真机只走 `bumpKatyaSpell` / `bumpKatyaDrain`（单一自增）。
 *
 * ⚠️ 沙盒写进度时必须**同时写账本与镜像**：只写卡上字段的话，
 *    下一次“四区域兜底贴值”（任何一方施法 / 变形重建）会拿账本值把它覆盖回去。
 *    ⇒ 三种用法，任选其一：
 *      · 传 `zones`：本函数顺手把 手牌/备战席/牌库/战场 贴好并返回（一次调用全搞定）——
 *        `const z = setKatyaProgressForSandbox(5, 2, 'player', { hand, bench, deck, field });`
 *      · 只改**一张** DNA 卡：`setKatyaProgressForSandbox(5, 2, 'player');`
 *        `updateDnaCard(stampKatyaCard(activeDnaCard, 'player'));`
 *      · 自己 setState：先 `setKatyaProgressForSandbox(...)`，再逐区 `stampKatyaZone(prev, side)`。
 *    真机流程**永远不用**这个入口（它绕过单一自增）。
 *
 * @param spell 本局已施放法术数 S
 * @param drain 本局倾泻累计扣减 D
 * @param side  归属方（默认玩家）
 * @param zones 可选：给了就把 手牌 / 备战席 / 牌库 / 战场 一起贴值并返回
 */
export const setKatyaProgressForSandbox = (
    spell: number,
    drain: number,
    side: 'player' | 'enemy' = 'player',
    zones?: KatyaZones,
): KatyaZones | undefined => {
    const s = Math.max(0, Math.floor(spell) || 0);
    const d = Math.max(0, Math.floor(drain) || 0);
    // ⚠️ 保留 `damage`（不随"设定 S/D"被清零）：沙盒调 S/D 只是为了看卡面数值，
    //    顺手把升级进度抹掉会让"进度环"莫名其妙归零 —— 那是两个独立的账。
    ledger[side] = { spell: s, drain: d, damage: ledger[side]?.damage || 0 };
    if (!zones) return undefined;
    return stampKatyaZones(zones, side);
};

/** 四区域的容器形状（手牌 / 备战席 / 牌库是平区，战场是 `{ owner, attacker, blocker }` 战线） */
export interface KatyaZones {
    hand?: CardData[] | null;
    bench?: CardData[] | null;
    deck?: CardData[] | null;
    field?: any[] | null;
}

/**
 * 幂等贴值（**单卡**）：把权威值贴到一张「凯茜娅·狂诗」上。
 * 同值重复贴**返回原对象**（不产生新对象 ⇒ 不引起无谓 re-render）。
 *
 * 写三处镜像：
 *   · `buffs.power` = S − D（净成长；配合基础 2 得到 `getPower` 的 2+S−D）
 *   · `katyaSpellGrowth` = S（本局施法数，显示用；与 `mauxirDamage`
 *     `types.ts:80` 同款的“卡上显示镜像”，真源仍是本文件账本）
 *   · `katyaDamage` = 累计伤害（升级进度环 + 三处升级判定读的就是它 ——
 *     `gameRules.checkCardLevelUp` / `getChampionUpgradeProgress` / `checkCardReadyToLevelUp`
 *     都拿不到 side，只能读卡上镜像；真源仍是本文件账本 `getKatyaDamage(side)`）
 */
export const stampKatyaCard = <T extends CardData>(card: T, side: 'player' | 'enemy'): T => {
    if (!card || card.key !== KATYA_KEY) return card;
    const { spell, power, damage } = getKatyaStats(side);
    const growth = power - KATYA_BASE_POWER; // = spell − drain
    const buffHealth = card.buffs?.health || 0;
    // 已经贴好？· 有 buffs 就要求 power 已等于净成长；干净实例则要求净成长为 0（不凭空造 `{0,0}`）
    const buffsOk = card.buffs ? (card.buffs.power || 0) === growth : growth === 0;
    if (buffsOk && (card.katyaSpellGrowth ?? 0) === spell && (card.katyaDamage ?? 0) === damage) {
        return card; // 幂等：原样返回同一对象
    }
    // 只在“本来就有 buffs”或“净成长非 0”时写 buffs —— 避免给干净实例凭空造一个 `{0,0}`
    const patch: Partial<CardData> = { katyaSpellGrowth: spell };
    if (card.buffs || growth !== 0) patch.buffs = { power: growth, health: buffHealth };
    // 同理：伤害为 0 时不写字段（干净实例保持干净；`?? 0` 让判据仍然成立）
    if (damage !== 0 || card.katyaDamage !== undefined) patch.katyaDamage = damage;
    return { ...card, ...patch } as T;
};

/**
 * 幂等贴值（**平区**）：手牌 / 备战席 / 牌库 —— 整数组都是同一归属方。
 * 没命中时**返回原数组**（同引用 ⇒ 调用方可直接 `changed ? next : prev`）。
 */
export const stampKatyaZone = <T extends CardData>(
    zone: T[] | undefined | null,
    side: 'player' | 'enemy',
): T[] | undefined | null => {
    if (!zone || zone.length === 0) return zone;
    let changed = false;
    const next = zone.map(card => {
        if (card.key !== KATYA_KEY) return card;
        const stamped = stampKatyaCard(card, side);
        if (stamped !== card) changed = true;
        return stamped;
    });
    return changed ? next : zone;
};

/**
 * 幂等贴值（**交战区**）——**按各自归属方贴各自的值**。
 *
 * 交战区是 `{ owner, attacker, blocker }` 数组：`attacker` 属 `owner`，`blocker` 属其对面
 * （归属推导口径与 `utils/mauxirProgress.ts:98-110` 一致；同一读法见
 *  `useSpellSystem.ts:1016` 的 `fieldUnits` 收集）。
 *
 * ⚠️ `owner` 不是 'player'/'enemy' 时**整条跳过**（不猜归属 —— 禁止脑补）。
 * 没命中时**返回原数组**。
 */
export const stampKatyaField = <T extends { owner?: string; attacker?: CardData | null; blocker?: CardData | null }>(
    field: T[] | undefined | null,
): T[] | undefined | null => {
    if (!field || field.length === 0) return field;
    let changed = false;
    const stamp = (u: CardData | null | undefined, side: 'player' | 'enemy'): CardData | null | undefined => {
        if (!u || u.key !== KATYA_KEY) return u;
        const next = stampKatyaCard(u, side);
        if (next !== u) changed = true;
        return next;
    };
    const next = field.map(fight => {
        if (fight.owner !== 'player' && fight.owner !== 'enemy') return fight;
        const ownerSide: 'player' | 'enemy' = fight.owner;
        const otherSide: 'player' | 'enemy' = ownerSide === 'player' ? 'enemy' : 'player';
        const attacker = stamp(fight.attacker, ownerSide);
        const blocker = stamp(fight.blocker, otherSide);
        if (attacker === fight.attacker && blocker === fight.blocker) return fight;
        return { ...fight, attacker, blocker };
    });
    return changed ? next : field;
};

/**
 * 幂等贴值（**四区域一次过**）：给沙盒 / Studio DNA 面板这种“改了 S/D 之后立刻刷全场”的场合用。
 * 真机流程不用它 —— 真机由 `useSpellSystem.dispatchSpellCastSideEffects` 逐区函数式写回
 * （函数式写回是为了躲开 `mauxirProgress.ts:12-16` 记的那种“值式写回被覆盖”）。
 */
export const stampKatyaZones = (zones: KatyaZones, side: 'player' | 'enemy'): KatyaZones => {
    const hand = stampKatyaZone(zones.hand, side);
    const bench = stampKatyaZone(zones.bench, side);
    const deck = stampKatyaZone(zones.deck, side);
    const field = stampKatyaField(zones.field);
    return {
        hand: hand === zones.hand ? zones.hand : hand,
        bench: bench === zones.bench ? zones.bench : bench,
        deck: deck === zones.deck ? zones.deck : deck,
        field: field === zones.field ? zones.field : field,
    };
};
