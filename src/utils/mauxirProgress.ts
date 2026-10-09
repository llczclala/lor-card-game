// ==========================================
// [2026-10-06 莉莉子 BUG修复 · BUG-20261006-01] 猫汐尔「召唤体系伤害」升级进度的**唯一真源**
// ──────────────────────────────────────────
// ── 症状（粉丝反馈，程转述）：
//    「涨得很慢，在交战区的召唤师以及召唤衍生物的进攻和格挡的伤害数值基本不计入升级进度」
//
// ── 病根（代码层，两处叠加）：
//   ① `accumulateMauxirDamage` 的“全域广播”**只扫 备战席/手牌/牌库** ——
//      第 2 个形参（交战区）**从未被使用**（形参名就写着 `_field`）。
//      ⇒ 猫汐尔本人在交战区（进攻/格挡）时，交战区那份实例拿不到进度；
//        而“归位”是把**交战区那份实例**写回备战席（`useGameState` 的归位处）
//        ⇒ 这一笔进度**永久丢失**。
//   ② 进度此前记在**卡实例**的 `customProgress` 上，而记账用的是**值式**写回
//      （`setPlayerBench(累积数组)`）。战斗结算链路里另有多处**值式**写回
//      （如 `setPlayerBench(res.playerBench)`，其快照取自 `stateRef.current.*`，
//        早于本次记账）⇒ 刚记上的进度会被**静默盖回**。
//
// ── 为什么真源放「模块级账本」而不是 `game`、也不是卡上：
//    · 放卡上 → 被“整数组写回”覆盖（病根②）
//    · 放 `game` → `setGame(res.game)` 同样是**值式**写回，同样会被覆盖
//    ⇒ 唯一稳的家是 **React state 之外**。这与 `cantAttackLedger`
//      （2026-10-05 为【无法攻击】归零/还原立的账本）是**同一条判据**：
//      「会跨越多趟 setState 存活的真源，不能住在会被整体替换的容器里」。
//
// ── 结构（与茉莉安 `beaconDeaths` 完全同构）：
//    真源 = 本模块的 `ledger`（**单一自增**，见 `bumpMauxirProgress`）
//    镜像 = 卡上的 `mauxirDamage` 字段（**幂等贴值**，见 `applyMauxirProgress`）
//    ⇒ 漏贴/被覆盖只会让**显示**短暂落后，**绝不丢进度**（下一处贴值即自愈）。
//
// ⚠️ 台账必须在**每一场对局开局**清零 —— 见 `resetMauxirProgress()` 的两个调用点
//    （`useGameState` 的初始构建 effect 与 `resetGame`；与装备/武装“两个建局入口”同源，
//      历史上正是漏了一处才出过 2026-08-25 那类事故）。
//
// ⚠️ 台账**不区分敌我来源**（保持修复前的口径）：本轮只修“丢进度”，
//    不顺手改“谁的伤害算谁的”。旁支（未动）见修复说明。
// ==========================================
import type { CardData } from '../types';

/** 升级目标（与 `data/cards.ts` 的 `levelUpTarget: 30` 同源；此处用作镜像封顶） */
export const MAUXIR_PROGRESS_TARGET = 30;

/** 真源：按方各一个计数器（镜像对局里敌我互不串味） */
const ledger: { player: number; enemy: number } = { player: 0, enemy: 0 };

/** 读权威进度 */
export const getMauxirProgress = (side: 'player' | 'enemy'): number => ledger[side] || 0;

/**
 * 记一笔「召唤体系造成的伤害」—— **全项目唯一自增入口**。
 * @returns 记账后的**权威值**（调用方可直接拿去贴值）
 */
export const bumpMauxirProgress = (side: 'player' | 'enemy', amount: number): number => {
    if (!(amount > 0)) return getMauxirProgress(side);
    // 封顶与修复前的口径一致（原实现 `Math.min(30, current + amount)`）⇒ 不做数值平衡改动
    ledger[side] = Math.min(MAUXIR_PROGRESS_TARGET, getMauxirProgress(side) + amount);
    return ledger[side];
};

/** 对局开局/重开清零（**两个建局入口都必须调**） */
export const resetMauxirProgress = (): void => {
    ledger.player = 0;
    ledger.enemy = 0;
};

/**
 * **[沙盒 / Studio DNA 面板专用]** 直接设定权威值（"一键达标"用）。
 * 真机流程**不会**调用它 —— 真机只走 `bumpMauxirProgress`（单一自增）。
 * ⚠️ 沙盒写进度时必须同时写账本与镜像：只写卡上字段的话，
 *    下一次"全域兜底贴值"（回合开始 / 归位）会拿账本值把它覆盖回去。
 */
export const setMauxirProgressForSandbox = (value: number, side: 'player' | 'enemy' = 'player'): void => {
    const v = Math.max(0, Math.min(MAUXIR_PROGRESS_TARGET, Math.floor(value) || 0));
    ledger[side] = v;
};

/**
 * 幂等贴值：把权威值贴到某区域里猫汐尔的副本上。
 * 同值重复贴**返回原数组**（不产生新对象 ⇒ 不会引起无谓 re-render）。
 */
export const applyMauxirProgress = (
    zone: CardData[] | undefined | null,
    side: 'player' | 'enemy',
): CardData[] | undefined | null => {
    if (!zone || zone.length === 0) return zone;
    const value = getMauxirProgress(side);
    let changed = false;
    const next = zone.map(card => {
        if (card.key === 'mauxir_lotus_drive' && (card.mauxirDamage || 0) !== value) {
            changed = true;
            return { ...card, mauxirDamage: value };
        }
        return card;
    });
    return changed ? next : zone;
};

/**
 * 幂等贴值（交战区版）——**按各自归属方贴各自的值**。
 *
 * 交战区是 `{ owner, attacker, blocker }` 数组：`attacker` 属 `owner`，`blocker` 属其对面
 * （归属推导口径与 `useRoundLifecycle.ts` / `gameRules.ts` 的既有读法一致）。
 *
 * 🔴 [2026-10-06 · 独立审查回执 R.3] **必须判归属**：本函数早先的版本对全数组一律贴
 *    "玩家账本" ⇒ 会把玩家的进度贴到**敌方**猫汐尔身上；而升级扫描（`gameRules.getChampionUpgradeProgress`
 *    + `checkCardLevelUp` 派单）敌我双方都扫 ⇒ 镜面对局里**敌方猫汐尔可能白拿一次升级**。
 *    （敌方确实会有猫汐尔：`data/enemies/archetypes.ts` 的镜像流派。）
 *
 * ⚠️ `owner` 不是 'player'/'enemy' 时**整条跳过**（不猜归属 —— 禁止脑补）。
 * 没命中时**返回原数组**。
 */
export const applyMauxirProgressToField = <T extends { owner?: string; attacker?: CardData | null; blocker?: CardData | null }>(
    field: T[] | undefined | null,
): T[] | undefined | null => {
    if (!field || field.length === 0) return field;
    let changed = false;
    const stamp = (u: CardData | null | undefined, side: 'player' | 'enemy'): CardData | null | undefined => {
        if (!u || u.key !== 'mauxir_lotus_drive') return u;
        const value = getMauxirProgress(side);
        if ((u.mauxirDamage || 0) === value) return u;
        changed = true;
        return { ...u, mauxirDamage: value };
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
