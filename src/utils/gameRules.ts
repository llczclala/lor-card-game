import type { CardData, GameState, Keyword } from '../types';
import { EFFECT_DB } from '../data/effectRegistry'; // [新增] 引入效果字典以读取前置条件
import { createCard } from '../data/cards'; // [2026-07-31] 安卡升级手牌替换
import { EQUIPMENT_BY_ID } from '../data/equipment'; // [2026-10-03] 升级时保留「装备/武装授予的关键词」
import { getPower } from '../logic/keywords'; // [2026-09-26 莉莉子] 攻击力唯一口径（0 下限 + maxPower 上限）
// [2026-10-06 莉莉子 BUG修复 · BUG-20261006-01] 猫汐尔升级进度的**唯一真源**（模块级账本）
import { bumpMauxirProgress, applyMauxirProgress } from './mauxirProgress';

/** [2026-07-10 诗人] 检测凯特琳减费光环是否在场 */
export const hasPoetCaitlinAura = (bench: CardData[]): boolean => {
    return bench.some(c => c.key === 'Poet_Squad_Caitlin' && !c.isDead);
};

/** [2026-07-14 锻造者] 检测缇坦妮娅法术增伤光环是否在场（含交战区） */
export const hasForgerTatianaAura = (bench: CardData[], combatField?: any[]): boolean => {
    if (bench.some(c => c.key === 'The_Forger_Squad_Tatiana' && !c.isDead)) return true;
    if (combatField) {
        return combatField.some(fight => {
            const a = fight.attacker, b = fight.blocker;
            return (a?.key === 'The_Forger_Squad_Tatiana' && !a?.isDead) ||
                   (b?.key === 'The_Forger_Squad_Tatiana' && !b?.isDead);
        });
    }
    return false;
};

/** [2026-07-10 诗人] 获取法术卡的实际费用（扣除凯特琳减费 / 觉悟减费 / 莲台无垠的全法术减费） */
// [2026-10-08 莉莉子 · 法术专属装备 第二波] 条件减费的纯计算来自 data/equipment（读装备表）
import { getSpellConditionalCost } from '../data/equipment';

export const getEffectiveSpellCost = (
    card: CardData,
    bench: CardData[],
    maxMana?: number,
    side: 'player' | 'enemy' = 'player',
): number => {
    // [2026-07-15 梵音] 觉悟减费：巨偶一瞥在法力上限≥10时费用为0
    if (maxMana !== undefined && maxMana >= 10 && card.key === 'Shalo_Golem_Glimpse') {
        return 0;
    }
    // [2026-10-06 莉莉子 BUG修复 · 莲台无垠（神格⑥）] **全法术 −N 改为"查询时判定"**。
    //   ── 病根：原实现只在 `game_start` 对"**当时**已在手/库"的法术改数据；
    //      而猫汐尔的核心法术（「梦莲无人机」等）**全是战斗中生成的** ⇒ 一张都减不到
    //      ⇒ 玩家侧观感就是"这条效果完全没生效"（而同节点的"解除攻击力上限"另有 on_summon 兜底、照常生效）。
    //   ── 现口径：减费量 = `snapshot[side]`（本场该侧的 SPELL_COST_DOWN_ALL 合计），
    //      减去卡上**已经应用过**的 `spellCostDown` ⇒ 只补差额：开局那份已被改过数据的卡不会被双减，
    //      而**任何新生成**的法术都会在这里被减到 ⇒ 与卡面「我方**所有**法术费用 −1」一致。
    const downAll = spellCostDownAllSnapshot[side] ?? 0;
    const stillToApply = Math.max(0, downAll - (card.spellCostDown ?? 0));
    const base = stillToApply > 0
        ? Math.max(0, (card.cost || 0) - stillToApply)
        : (card.cost || 0);
    // [2026-10-08 莉莉子 · 法术专属装备 第二波] **装备的条件减费**（读对局状态快照，见下方 spellCastSnapshot）：
    //   · 活页夹页：本回合**尚未打出过法术** ⇒ −1
    //   · 双生符　：本场已打出 ≥N 个法术 ⇒ **费用归零**
    const cond = getSpellConditionalCost(card, spellCastSnapshot[side]);
    if (cond.zero) return 0;
    const condBase = Math.max(0, base + cond.mod);
    // 只有极速(burst)和快速(fast)法术受凯特琳减费影响
    if (card.type === 'spell-burst' || card.type === 'spell-fast') {
        if (hasPoetCaitlinAura(bench)) {
            return Math.max(0, condBase - 1);
        }
    }
    return condBase;
};

// ── [2026-10-08 莉莉子 · 法术专属装备 第二波] **条件减费要读的对局状态**（按方，只读快照）──
//   ⚠️ 与上面 `spellCostDownAllSnapshot` 同一惯例：`getEffectiveSpellCost` 是纯查询函数，
//      调用点遍布 hooks 与显示层 ⇒ 不塞签名，改用模块级快照。
//   ⚠️ 三处必须接线：**开局重设**（两个建局入口）· **每回合清零**（回合开始）· **每次施法累加**（commitSpell）。
//      漏任何一处 → 减费条件会算错（这正是"假参与"的典型死法）。
const spellCastSnapshot: Record<'player' | 'enemy', { thisRound: number; thisRun: number }> = {
    player: { thisRound: 0, thisRun: 0 },
    enemy: { thisRound: 0, thisRun: 0 },
};
/** 每场开局重设（两个建局入口都要调，否则跨局残留） */
export const resetSpellCastState = (): void => {
    spellCastSnapshot.player = { thisRound: 0, thisRun: 0 };
    spellCastSnapshot.enemy = { thisRound: 0, thisRun: 0 };
};
/** 每回合开始清零「本回合」计数（「本场」累计保留） */
export const resetSpellCastRoundCounters = (): void => {
    spellCastSnapshot.player.thisRound = 0;
    spellCastSnapshot.enemy.thisRound = 0;
};
/** 每次施法累加（唯一入口 = useSpellSystem.commitSpell） */
export const noteSpellCast = (side: 'player' | 'enemy'): void => {
    const s = spellCastSnapshot[side];
    if (!s) return;
    s.thisRound += 1;
    s.thisRun += 1;
};

// [2026-10-06 莉莉子 BUG修复 · 莲台无垠] 「全法术减费」的本场快照（**按方**）。
//   ⚠️ 为什么用模块级快照而不是塞进 GameState：`getEffectiveSpellCost` 是个**纯查询函数**，
//      调用点遍布 hooks 与显示层（"法术实际费用"的唯一口径）⇒ 塞签名要改一大串调用点。
//      这与本仓库既有的 `nexusMaxSnapshot` / `mauxirProgress` 是同一惯例（**查询口径的只读快照**）。
//   ⚠️ 必须**每场对局开局重设**（两个建局入口都要设，否则跨局残留）。
const spellCostDownAllSnapshot: { player: number; enemy: number } = { player: 0, enemy: 0 };
export const setSpellCostDownAllSnapshot = (player: number, enemy: number): void => {
    spellCostDownAllSnapshot.player = Math.max(0, player || 0);
    spellCostDownAllSnapshot.enemy = Math.max(0, enemy || 0);
};

/**
 * [2026-10-06 莉莉子 BUG修复 · 莲台无垠] **建卡瞬间**给法术补上"全法术 −N"（数据层）。
 *   ── 为什么要这条：费用**正确性**由上面 `getEffectiveSpellCost` 的查询口径兜底（覆盖一切来源），
 *      但**卡面显示的数字**取自 `card.cost`（`SpellCard.tsx` 直接渲染 `data.cost`）⇒
 *      只有把数据也改掉，玩家才看得到"这张法术真的便宜了"（含开局那份的绿色减费标记）。
 *   ── 与查询口径**共用 `spellCostDown` 标记** ⇒ 只补"还没减过的差额"，**天然幂等、不会双减**。
 *   ⚠️ 调用方在本仓库是唯一建卡工厂 `useGameState.createFullCard`（按玩家侧补）：
 *      敌方手牌对玩家不可见、且其**扣费**走 side-aware 查询 ⇒ 无副作用。
 */
export const applySpellCostDownToNewCard = (side: 'player' | 'enemy', card: CardData): CardData => {
    const amount = spellCostDownAllSnapshot[side] ?? 0;
    if (amount <= 0) return card;
    if (!card.type?.startsWith('spell')) return card;
    const already = card.spellCostDown ?? 0;
    const still = amount - already;
    if (still <= 0) return card;
    return {
        ...card,
        cost: Math.max(0, (card.cost || 0) - still),
        spellCostDown: already + still,
        customProgress: (card.customProgress || 0) | 2, // 绿色减费标记
    };
};

// ==========================================
// [2026-07-10 绿灵小队] 牌库BUFF辅助函数
// ==========================================

/** 从牌库顶部查找第一个单位卡牌（跳过法术） */
export const findTopUnitInDeck = (deck: CardData[]): CardData | null => {
    for (const card of deck) {
        if (card.type?.includes('unit')) return card;
    }
    return null;
};

/** 对牌库顶部的 N 个单位施加 buff，返回更新后的牌库和最后一个被 buff 的单位 */
export const buffTopUnitInDeck = (
    deck: CardData[],
    power: number,
    health: number,
    count: number = 1
): { deck: CardData[]; buffed: boolean; buffedUnit?: CardData } => {
    const newDeck = [...deck];
    let buffed = false;
    let buffedUnit: CardData | undefined;
    let found = 0;

    for (let i = 0; i < newDeck.length && found < count; i++) {
        if (newDeck[i].type?.includes('unit')) {
            newDeck[i] = {
                ...newDeck[i],
                buffs: {
                    power: (newDeck[i].buffs?.power || 0) + power,
                    health: (newDeck[i].buffs?.health || 0) + health,
                },
            };
            buffed = true;
            buffedUnit = newDeck[i];
            found++;
        }
    }
    return { deck: newDeck, buffed, buffedUnit };
};

/** 对牌库中所有单位施加 buff */
export const buffAllUnitsInDeck = (deck: CardData[], power: number, health: number): CardData[] => {
    return deck.map(card => {
        if (card.type?.includes('unit')) {
            return {
                ...card,
                buffs: {
                    power: (card.buffs?.power || 0) + power,
                    health: (card.buffs?.health || 0) + health,
                },
            };
        }
        return card;
    });
};

export const canAffordCard = (card: CardData, mana: number, spellMana: number, bench?: CardData[]): boolean => {
  // [修正] 防御性检查：防止因"幽灵卡牌"（数据缺失）导致的崩溃
  if (!card || !card.type) {
      return false;
  }

  const cost = bench ? getEffectiveSpellCost(card, bench) : card.cost;

  if (card.type.includes('unit')) {
    return mana >= cost;
  } else {
    return (mana + spellMana) >= cost;
  }
};

export const calculateNewMana = (
    cost: number,
    currentMana: number,
    currentSpellMana: number,
    isUnit: boolean
) => {
    let newMana = currentMana;
    let newSpellMana = currentSpellMana;

    if (isUnit) {
        newMana -= cost;
    } else {
        const spellManaUsed = Math.min(cost, newSpellMana);
        newSpellMana -= spellManaUsed;
        const remainingCost = cost - spellManaUsed;
        newMana -= remainingCost;
    }

    // [2026-07-22 莉莉子] 保险钳制：法力值不允许低于 0
    return {
        newMana: Math.max(0, newMana),
        newSpellMana: Math.max(0, newSpellMana),
    };
};

// ==========================================
// [2026-10-03 莉莉子 · 系统性收口] **"全场有谁"的唯一出口**
//
// ── 病根（"收尸延迟" + "升级延迟" 的共同土壤）：
//    "看哪儿 / 看谁" 这段逻辑在仓库里被抄了至少 4 份，而且**每份的范围都不一样**：
//      · 引爆对账器（useGameState）      —— 只收「獠牙信标」这一种卡
//      · judgeLifeAndDeath 的归属推导     —— 只看备战席 + 交战区反推（各写一份）
//      · SPREAD_DAMAGE 的收集段           —— 只收 context.owner 一侧
//      · processDeaths / 升级扫描          —— **只扫两个备战席**（交战区永远看不见）
//    ⇒ 于是"人在场上时达成/发生的状态"被系统性漏掉：单位死了没人收尸、天启者达成条件不升级。
//
// ── 口径（唯一）：
//    · 备战席：归属优先用**归属戳 `unitOwner`**（召唤物写在落点，见 effectProcessor 召唤段），无戳取数组所在侧
//    · 交战区：attacker 属 `f.owner`；blocker 属 `f.owner` 的**对面**（全局统一口径）
//    · **死活都返回**（调用方自己按 isDead / animState 过滤）—— 避免"该收尸的却被过滤掉"
//
// ── [2026-10-03 P1 收口 · 第一步] 配套出口：`sideOfUnit(unit, state)`
//    「**这个单位属于哪一方**」也曾经各写各的（judgeLifeAndDeath 看戳 / SPREAD_DAMAGE 看数组侧）。
//    现已把它收成下面那个函数，**与 collectFieldUnits 共用同一份"交战区归属"知识**。
// ==========================================
export interface FieldUnitRef {
    side: 'player' | 'enemy';
    card: CardData;
    zone: 'bench' | 'field_attacker' | 'field_blocker';
}

export const collectFieldUnits = (state: {
    playerBench?: CardData[];
    enemyBench?: CardData[];
    combatField?: any[];
}): FieldUnitRef[] => {
    const out: FieldUnitRef[] = [];
    (state.playerBench || []).forEach(c => { if (c) out.push({ side: c.unitOwner ?? 'player', card: c, zone: 'bench' }); });
    (state.enemyBench || []).forEach(c => { if (c) out.push({ side: c.unitOwner ?? 'enemy', card: c, zone: 'bench' }); });
    (state.combatField || []).forEach((f: any) => {
        if (f?.attacker) out.push({ side: f.owner, card: f.attacker, zone: 'field_attacker' });
        if (f?.blocker) out.push({ side: f.owner === 'player' ? 'enemy' : 'player', card: f.blocker, zone: 'field_blocker' });
    });
    return out;
};

// ==========================================
// [2026-10-03 莉莉子 · P1 归属口径收口 · 第一步] **"这个单位属于哪一方"的唯一出口**
//
// ── 背景（P1 核实结论 · 2026-10-03 夜）：
//    同一个语义在仓库里有两套口径，**而且当前"事实上恒等"**：
//      · `judgeLifeAndDeath`（useGameState）—— **归属戳优先**（`unit.unitOwner ?? …`）
//      · `SPREAD_DAMAGE` 收集段（effectProcessor）—— **数组所在侧优先**（完全没看戳）
//    恒等的原因：戳是**落场那一刻按落点盖的**（备战席=落点阵营；交战区/手牌=施法者自己一侧，
//    不参与 summonSide 重绑），之后所有"移动"（拉上场格挡 / 撤回 / 幸存者归位 / 召回 / 复活）
//    都按它自己那一侧归位；而 `cloneUnitState` 是从 targetTemplate 展开 ⇒ 克隆体不继承源卡的戳。
//    ⇒ 当前**没有任何路径能造出「戳 ≠ 所在侧」**。
//
// ── 所以这次迁移的性质是【消重 + 防未来】，不是【修现在的 bug】：
//    唯一会打破不变式的是**将来出现"控制权转移"类效果**（把敌方单位永久变成我方的）——
//    那天两处口径会**立刻分歧**（"谁挨炸 / 谁能升级"都会错）。本函数以**戳优先**为准
//    （与 judge 一致，也符合"落场即定归属"的设计）。
//
// ── 口径（= `judgeLifeAndDeath` 迁移前的现状，**逐字对齐 · 不改任何行为**）：
//    ① 有归属戳 `unitOwner` ⇒ 直接用它
//    ② 否则查备战席：**玩家席在前、敌方席在后**（同一 id 同时在两个备战席时取玩家席，与 judge 的 find 一致）
//    ③ 否则查交战区：attacker 属 `f.owner`；blocker 属 `f.owner` 的**对面**
//    ④ 都查不到 ⇒ `'player'`（保留 judge 原来的兜底，不擅自改语义）
//
// ⚠️ **调用方必须传"工作数组"**（本次提交后的 `newPlayerBench` / `newCombatField`），
//    不能传 `stateRef` 快照 —— 否则回到"判死读旧快照"的历史老病。
// ⚠️ 内部复用 `collectFieldUnits`，故"同一 id 重复"时**备战席优先**；
//    若将来要让"戳优先"压过"备战席优先"，只需改这一个函数（这正是收口的意义）。
// ==========================================
export const sideOfUnit = (
    unit: { id: string; unitOwner?: 'player' | 'enemy' },
    state: { playerBench?: CardData[]; enemyBench?: CardData[]; combatField?: any[] },
): 'player' | 'enemy' => {
    // ① 归属戳优先（信标等召唤物走这条，一步到位）
    if (unit.unitOwner) return unit.unitOwner;
    // ②③ 复用"全场有谁"的唯一出口 —— 交战区归属规则只有那一处知道
    const refs = collectFieldUnits(state).filter(r => r.card && r.card.id === unit.id);
    const onBench = refs.find(r => r.zone === 'bench');   // 备战席（玩家席在前）优先
    if (onBench) return onBench.side;
    if (refs.length > 0) return refs[0].side;
    // ④ 未知来源：保留旧兜底
    return 'player';
};

// ==========================================
// [2026-10-04 程拍板] 水晶「生命上限」快照 —— 芬妮升级口径的唯一数据源
// ==========================================
/**
 * 芬妮的升级条件 = 「**任一方水晶生命值 ≤ 其自身上限的一半**」
 * （程 2026-10-04 拍板；原为固定 `≤ 10`）。
 *
 * ⚠️ 为什么用**模块级快照**而不是显式传参：
 *   判定（`combat.ts`）与 UI 进度（`Card.tsx`）都拿不到 `game.playerNexusMax` / `enemyNexusMax`，
 *   若靠 props 层层下传（Card → FloatingCardPreview → ChampionLevelUp → Overlays → GameUI…），
 *   **漏传一处那处就静默退回 20** —— 正是本文件 `getChampionUpgradeProgress` 注释里
 *   记着的历史病（茉莉安那条规则三处全漏 ⇒ 进度恒显示 0）。
 *   ⇒ 由 `useGameState` 在对局初始化时同步一次（**一局之内上限不变**），判定/进度缺省读它，**UI 零穿透**。
 *
 * ⚠️ 快照代表"当前这一局"的上限：同一时刻只有一个对局在跑（App 状态机保证），故不会多局互相覆盖。
 *    缺省 20 = 标准对局上限 ⇒ 与旧版 `≤10` 行为完全一致（20 / 2 = 10）。
 */
let nexusMaxSnapshot: { player: number; enemy: number } = { player: 20, enemy: 20 };

/** 同步当前对局的水晶上限（由 `useGameState` 调用；缺省 20 = 标准对局） */
export const setNexusMaxSnapshot = (playerMax?: number, enemyMax?: number): void => {
    nexusMaxSnapshot = { player: playerMax ?? 20, enemy: enemyMax ?? 20 };
};

/** 读当前对局的水晶上限快照 */
export const getNexusMaxSnapshot = (): { player: number; enemy: number } => nexusMaxSnapshot;

export const checkCardLevelUp = (
    card: CardData,
    playerNexusHealth: number,
    enemyNexusHealth: number,
    /** [2026-10-04] 可选：显式指定上限（不传 = 读当前对局快照） */
    playerNexusMax?: number,
    enemyNexusMax?: number,
): boolean => {
    if (card.level >= 2 || !card.isChampion) return false;

    if (card.key === 'lyfe' && card.strikeCount >= 2) return true;

    // 芬妮升级：[2026-10-04 程拍板] 由固定「任一方水晶 ≤ 10」→「**任一方水晶 ≤ 其自身上限的一半**」
    //   为什么要改：芬妮在迷宫里太弱、极难升级 —— 迷宫玩家水晶上限 = run.maxHp（20 起，随等级/强化涨到 40+），
    //   而「≤10」是**绝对值** ⇒ 上限 40 时要被打到剩 1/4 才够，实战几乎不成立。
    //   改成"上限的一半"后：标准对局（上限恒 20）⇒ 仍是 ≤10、**行为完全不变**；
    //   迷宫 ⇒ 门槛随上限水涨船高（30→≤15 / 40→≤20），与"生命值过半"的直觉一致。
    //   ⚠️ 写成 `h * 2 <= max` 而不是 `h <= max / 2`：上限为奇数时（如 25）避免浮点比较。
    if (card.key === 'fenny') {
        const pMax = playerNexusMax ?? nexusMaxSnapshot.player;
        const eMax = enemyNexusMax ?? nexusMaxSnapshot.enemy;
        if (playerNexusHealth * 2 <= pMax || enemyNexusHealth * 2 <= eMax) return true;
    }
    // [修改] 卜卜的升级条件：场上目睹攻击敌方水晶 3 次
    if (card.key === 'pupu_specular_soul' && (card.customProgress || 0) >= 3) return true;
//     if (card.key === 'pupu_specular_soul' && card.strikeCount >= 2) return true;

    // [新增] 猫汐尔莲驱：我方召唤者和召唤物累计造成 30 点伤害
    // [2026-10-06 莉莉子 BUG修复 · BUG-20261006-01] 改读**专属镜像** `mauxirDamage`（真源 = utils/mauxirProgress）：
    //   此前读共用位域 `customProgress`，而它既是 0~30 的计数器、又被别的系统当位域写（bit1 = 降费标记）
    //   ⇒ 既会被虚增 2，也曾因"记账写不进去"而涨得极慢。详见 types.ts 的字段注释。
    if (card.key === 'mauxir_lotus_drive' && (card.mauxirDamage || 0) >= 30) return true;

    // [2026-09-16 1.0.16 茉莉安] 我方召唤的「獠牙信标」被破坏 ≥ 2 次
    //   [2026-10-02 C1] 真源已改为**全局对局状态** `game.beaconDeaths[side]`；
    //   卡上这个字段是**显示镜像**（由死亡漏斗按权威值幂等赋值）⇒ 此处读它仍然正确。
    //   ⚠️ 读的是专属字段 beaconDeaths，不是自定义位域 customProgress（目标 2 与 bit2 撞车）
    if (card.key === 'marian' && (card.beaconDeaths || 0) >= 2) return true;

    return false;
};

// ==========================================
// [2026-09-13 莉莉子] 升级标记统一读写（分阵营）
// ==========================================
/**
 * 记录英雄升级标记 —— 同时写「全局列表」与「分阵营列表」两套。
 *
 * ⚠️ 全局的 leveledChampions 现在**只作兼容镜像**：
 *    · 写入端（本函数 / unmark）必须继续同步维护两套；
 *    · 读取端只剩少数幂等守卫（如 useGameState 升级派单的 `prev.leveledChampions.includes(...) && isLeveledUpForSide(...)`）；
 *    · **变形系统 / 抉择解锁（大招）/ 法术回库 / 安卡手牌升级** 已于 **2026-10-04** 全部改为
 *      `isLeveledUpForSide(game, side, key)` **按方判定**（原先它们读全局 ⇒ 镜像对局里
 *      "我方升级会让敌方那张同名卡变 Lv2 / 我方也会被敌方的升级解锁大招" 的跨侧泄漏）。
 *    ⇒ 敌我升级进度自此在**所有**读取端相互独立。
 *    统一入口，杜绝"只写了一处、另一处漏更"造成两套数据打架。
 *
 * 注：整体赋值而非 push —— 保证对象/数组全新，不污染共享引用（React 浅拷贝语义）。
 */
export const markLeveledUp = (game: GameState, side: 'player' | 'enemy', key: string): void => {
    game.leveledChampions = Array.from(new Set([...(game.leveledChampions || []), key]));

    const bySide = game.leveledChampionsBySide || { player: [], enemy: [] };
    game.leveledChampionsBySide = {
        player: bySide.player || [],
        enemy: bySide.enemy || [],
        [side]: Array.from(new Set([...(bySide[side] || []), key])),
    };
};

/** 撤销英雄升级标记（退级用，如安卡「剑痕时空」），两套同步清除 */
export const unmarkLeveledUp = (game: GameState, side: 'player' | 'enemy', key: string): void => {
    game.leveledChampions = (game.leveledChampions || []).filter(k => k !== key);

    const bySide = game.leveledChampionsBySide || { player: [], enemy: [] };
    game.leveledChampionsBySide = {
        player: bySide.player || [],
        enemy: bySide.enemy || [],
        [side]: (bySide[side] || []).filter(k => k !== key),
    };
};

/** 查询某方的某英雄是否已锁定升级（升级流程专用，替代全局 leveledChampions 判定） */
export const isLeveledUpForSide = (game: GameState, side: 'player' | 'enemy', key: string): boolean =>
    !!game.leveledChampionsBySide?.[side]?.includes(key);

// [新增] 获取卡牌通用银价格
export const getCardPrice = (cost: number): number => {
    if (cost >= 0 && cost <= 2) return 400;
    if (cost >= 3 && cost <= 5) return 800;
    if (cost >= 6 && cost <= 8) return 1200;
    return 2400; // 9+ 费
};

// ==========================================================================
// [2026-10-06 莉莉子 BUG修复 · 审计收口] **水晶免疫（不死之身）的唯一判据**
// ── 约定（`data/roguelike/buffs.ts:54` 自己写着）：`NEXUS_IMMUNE` 是标记型效果，
//    **各水晶伤害点都要查** `game.playerNexusImmune` / `game.enemyNexusImmune`。
// ── 病根：审计查出 **7 处**水晶伤害点没遵守这条约定（含**玩家普通进攻/碾压打水晶的主战斗路径**）
//    ⇒ 那个 mythic 强化的核心机制（"玩家打不动，只能靠它每回合自扣 5 熬死"）**形同虚设**。
// ── ⚠️ 唯一合法豁免（不要加检查的两处）：
//    ① `NEXUS_SELF_DAMAGE`（回合结束自扣 —— `types.ts:294` 明文"自扣不在此列"）
//    ② `nexusCost`（Pact 开局代价，性质是"代价"不是"伤害"）
// ── 用法：`if (isNexusImmune(game, 'enemy')) { /* 整段跳过，不扣血 */ }`
// ==========================================================================
export const isNexusImmune = (game: GameState | undefined | null, side: 'player' | 'enemy'): boolean =>
    side === 'player' ? !!game?.playerNexusImmune : !!game?.enemyNexusImmune;

// ==========================================================================
// [2026-10-03 莉莉子 BUG修复] 「装备/武装**授予的**关键词」—— 升级替换时的唯一口径
//
// ── 病根（群反馈：**安卡 / 猫汐尔升级后武装和装备被清空**）：
//    `attachEquipment`（`data/equipment.ts`）是把装备/武装给的关键词**并进 `card.keywords`** 的：
//        next.keywords = Array.from(new Set([...(next.keywords || []), ...def.keywords]));
//    而 `getLeveledUpCard` 里**只有安卡（`keywords: ['QuickAttack','Aura','Ability']`）
//    和猫汐尔（`keywords: []`）显式覆盖了 `keywords`**，其余天启者（茉莉安/里芙/芬妮/卜卜）
//    都不写这个字段、靠 `...card` 继承 ⇒ **只有这两位会在升级那一刻丢掉装备/武装带来的关键词**。
//    ⇒ 与粉丝点名的两位**完全吻合**。
//
// ── 为什么不能简单地「和 Lv1 关键词求并集」：
//    安卡 Lv2 去掉 `Channel`、加上 `QuickAttack` 是**有意**的，猫汐尔置空同理 ——
//    整份合并会把 Lv2 想移除的关键词又塞回去（修 BUG 顺手改语义）。
//  ⇒ 只并回**装备/武装授予的那一份**，Lv2 自身的「基础关键词」设计原封不动。
// ==========================================================================
export const withEquipKeywords = (baseLv2: Keyword[], card: CardData): Keyword[] => {
    const granted: string[] = [];
    for (const id of card.equipment || []) {
        const kw = (EQUIPMENT_BY_ID[id] as { keywords?: string[] } | undefined)?.keywords;
        if (Array.isArray(kw)) granted.push(...kw);
    }
    if (!granted.length) return baseLv2;
    return Array.from(new Set<string>([...baseLv2, ...granted])) as Keyword[];
};

export const getLeveledUpCard = (card: CardData): CardData => {
    // [2026-09-16 1.0.16 茉莉安 · T13] Lv2 变化（设计文档 4.1）：
    //   ① 攻击力 5 → 6（同时【就是大招斩杀线】，给茉莉安加攻 = 给大招加斩杀线，收益跳档）
    //   ② 之后召唤的信标附带【复活】
    if (card.key === 'marian') {
        return {
            ...card,
            level: 2,
            power: card.power + 1, // 5 → 6
            level2ImageUrl: card.level2ImageUrl,
            effects: [...(card.effects || [])],
            // [2026-10-02 程拍板 · 信标亡语化 + 光环下放 Lv1] Lv2 与 Lv1 的**贴亡语能力完全相同**（等级无关的光环）：
            //   「只要茉莉安活着在场，敌方獠牙信标就带亡语：阵亡时召唤一个信标 + 对她造成一记打击伤害」。
            //   [2026-10-04 程拍板] 那记打击伤害已由「等同她攻击力」改为**等级固定值**（Lv1 5 / Lv2 8）——
            //   原口径在肉鸽里（她能叠到 20+ 攻击力）会让信标被反复一击打死 ⇒ 无限循环爆炸。
            //   ⇒ Lv2 相对 Lv1 的区别仍是攻击力 5 → 6，但**不再**牵连打击伤害（伤害只认等级阶梯）。
            //   · 为什么敢下放到 Lv1：程的现场分析指出「入场贴一次」必然断档（见 hasLiveMarian 注释），
            //     而 Lv1 击杀 2 枚就升级、本身就是过渡态 ⇒「也没什么区别」。
            //   · **不再有回合开始兜底**；**不再有每回合节流**（光环下无限补）。
            description: '【库效】对局开始时：在敌方备战席召唤一个“獠牙信标”。\n光环：敌方“獠牙信标”获得亡语——阵亡时召唤一个“獠牙信标”，并对其造成 8 点伤害。\n入场及回合开始时：对敌方备战席的“獠牙信标”造成 8 点伤害。\n参战：变化为“茉莉安的猎场”。',
        } as CardData;
    }

    if (card.key === 'lyfe') {
        return {
            ...card,
            level: 2,
            power: card.power + 1, // 假设升级+1/+1
            health: card.health + 1,
            maxHealth: card.maxHealth + 1,
            level2ImageUrl: card.level2ImageUrl,
            description: '回合开始时：进行备战。',
            // [新增] 动态添加被动技能
            effects: ['effect_lyfe_rally_passive'],
            ability: { id: 'lyfe_lv2_rally', label: '里芙的压制', description: '回合开始时：进行备战。', trigger: 'round_start', maxCharges: -1, postTriggerState: 'recharge' },
            abilityState: 'breathing' as const,
            abilityCharges: -1,
        } as CardData;
    }

    // 芬妮升级特性：永久获得成长（[2026-10-05 莉莉子 平衡调整]，判据见下方注释）
    if (card.key === 'fenny') {
        // =====================================
        // [2026-10-05 莉莉子 · 程拍板 平衡调整] 「**未触发过 1 级成长就升级**」⇒ 升级后两者**同时**触发
        // ── 病根：旧实现无条件写 `effects: ['effect_fenny_attack_lv2']`，把 1 级效果**整个丢掉** ⇒
        //    「**还没进攻过**就升级」的芬妮（`customProgress = 0`）**永远吃不到那 +3/+0**。
        //    程：「当初我做这个调整是为了平衡芬妮的强度，但现在看来把芬妮做的太弱了，粉丝都不爱玩」。
        // ── 判据用 `customProgress` 的**位标记**（effectProcessor 的「芬妮专属拦截」）：
        //      **bit2（值 4）= 1 级成长已触发** / bit3（值 8）= 2 级成长已触发。
        // ⚠️ [2026-10-05 莉莉子] 标记**不再用 bit0/bit1** —— 低两位早被别的系统占用
        //    （bit0 鬼怪/银臂、**bit1 降费标记**），肉鸽里手牌芬妮被减费会写成 `p = 2`，
        //    旧判据 `p === 2 || p === 3` 会把别人的 bit1 误读成"2 级已触发"、导致 +5 被吞。
        // ⚠️ 一律用 `&`（位与）判断，**不要用整值相等**。
        const fennyLv1AlreadyDone = ((card.customProgress || 0) & 4) !== 0;
        // ── 两种情形：
        //    · **已触发过** 1 级 ⇒ 保持原样（只带 lv2）—— 那份 +3/+0 早已**永久**加在她身上，不能重复给；
        //    · **未触发过** 1 级 ⇒ 两个效果**都保留** ⇒ 首次进攻时 lv1(+3) 与 lv2(+5) **各触发一次 = +8/+0**。
        //      （两个 effect 由 `useGameState.ts:1753-1758` 的 ON_ATTACK_DECLARE 遍历**逐个 processEffect**，
        //        不受 `abilityCharges` 限制 ⇒ 各 BUFF 一次、自然叠加；位标记随之走到 3。）
        // ⚠️ 描述必须跟着判据动态化：否则"未触发过"的那条卡面还写着 +5，与实战 +8 不符。
        // =====================================
        const fennyGainText = fennyLv1AlreadyDone ? '+5/+0' : '+8/+0';
        return {
            ...card,
            level: 2,
            power: card.power + 1,
            health: card.health +1,
            maxHealth: card.maxHealth +1,
            level2ImageUrl: card.level2ImageUrl,
            description: `进攻：首次进攻时，永久赋予自己 ${fennyGainText}。`,
            effects: fennyLv1AlreadyDone
                ? ['effect_fenny_attack_lv2']
                : ['effect_fenny_attack_lv1', 'effect_fenny_attack_lv2'],
            ability: { id: 'fenny_lv2_first_strike', label: '绝对主角', description: `进攻：首次进攻时，永久赋予自己 ${fennyGainText}。`, trigger: 'on_attack_declare', maxCharges: 1, postTriggerState: 'dim', isLevelAbility: true },
            abilityState: 'breathing' as const,
            abilityCharges: 1,
        } as CardData;
    }

    if (card.key === 'pupu_specular_soul') {
        return {
            ...card,
            level: 2,
            power: card.power + 1, // 假设升级+1/+1
            health: card.health + 1,
            maxHealth: card.maxHealth + 1,
            level2ImageUrl: card.level2ImageUrl,
            description: '进攻时：召唤一个进攻状态的 “镜爻 卜卜” ',
            effects: ['effect_pupu_level2_attack'],
            ability: { id: 'pupu_lv2_clone_summon', label: '镜爻·复刻', description: '进攻时：召唤一个完全复制自身的”镜爻 卜卜”参与进攻。', trigger: 'on_attack_declare', maxCharges: -1, postTriggerState: 'recharge', isLevelAbility: true },
            abilityState: 'breathing' as const,
            abilityCharges: -1,
        } as CardData;
    }

    // [新增] 猫汐尔莲驱 Lv2：感知补全+
    if (card.key === 'mauxir_lotus_drive') {
        return {
            ...card,
            level: 2,
            power: card.power,
            health: card.health + 1,
            maxHealth: card.maxHealth + 1,
            level2ImageUrl: card.level2ImageUrl,
            description: '【库效】回合开始时，若己方备战席没有“臆莲基座”，则召唤一个。回合结束：对我方所有“臆莲基座”造成1点伤害，之后赋予其+0 +2，“臆莲基座”可以以敌方水晶为目标。',
            // [2026-10-04 程拍板] Lv2 **保留她自己的【坚韧】** ——
            //   小米/程 10-03 16:36 报「猫猫升级前有坚韧升级后没有了」；
            //   程 10-04 明确「**要保留猫汐尔升级后的坚韧**」。
            //   Lv1 关键词 = `['Tough','Aura']`；Lv2 只保留 **Tough（坚韧）** ——
            //   `Aura` 不重复挂（Lv2 的能力「莲华庇佑」本身就是那条光环能力）。
            //   ⚠️ 装备/武装授予的关键词仍走 `withEquipKeywords` 并回（2026-10-03 修的那条）。
            keywords: withEquipKeywords(['Tough'], card),
            effects: ['effect_mauxir_lotus_drive_lv2'],
            ability: { id: 'mauxir_lv2_aura', label: '莲华庇佑', description: '【库效】回合开始时，若己方备战席没有“臆莲基座”，则召唤一个。回合结束：对我方所有“臆莲基座”造成1点伤害，之后赋予其+0 +3，“臆莲基座”可以以敌方水晶为目标。', trigger: 'round_start', maxCharges: -1, postTriggerState: 'recharge', isLevelAbility: true },
            abilityState: 'breathing' as const,
            abilityCharges: -1,
        } as CardData;
    }

    // [2026-07-29 安卡希雅 时之重奏] 升级：飞剑强化（所有飞剑→大飞剑2/1碾压）
    if (card.key === 'acacia_chrono_echo') {
        return {
            ...card,
            level: 2,
            power: card.power + 1,
            health: card.health + 1,
            maxHealth: card.maxHealth + 1,
            level2ImageUrl: card.level2ImageUrl,
            description: '【库效】若我方手牌中没有，则在我方手牌中生成一张“安卡希雅的重锋”。\n入场及获得进攻标识时：生成一张易逝的“月镰剑势”。\n参战：变化为“安卡希雅的剑舞”。\n【飞剑强化】“飞剑”升级为“大飞剑”（2/1碾压）。',
            // [2026-10-03 莉莉子 BUG修复] 这三个是 Lv2 的**基础**关键词（相对 Lv1 是有意替换：去 Channel 加 QuickAttack），
            //   但装备/武装授予的关键词必须并回来。
            keywords: withEquipKeywords(['QuickAttack', 'Aura', 'Ability'], card),
            associatedSpellKey: 'acacia_chrono_echo_heavy', // [2026-07-31] 升级后关联法术切换为重锋
            effects: ['effect_acacia_chrono_echo_lv2', 'effect_acacia_chrono_echo_token_lv2'],
        } as CardData;
    }

    return card;
};

/**
 * [2026-10-06 程拍板 ② · 修复「0 费不持久」]
 * **跨「整卡重建」携带费用覆盖**（`CardData.costOverride`）。
 *
 * ── 病根：迷宫强化生成卡时的 `costOverride`（「剑舞长空」的 0 费「灵轨月轮·扩散」）
 *    只写在**这一张实例**的 `card.cost` 上，全项目**没有任何地方重放它**。
 *    而下面三条链会**整卡重建**同一张牌：安卡「圆缺有律」切换（`effectProcessor`）·
 *    升级 `upgradeAcaciaHand` · 退级 `demoteAcaciaHand` —— 都用裸 `createCard(key)` 造新对象
 *    ⇒ 费用被打回**卡面原价**：点一次圆缺有律，0 费扩散变 **2 费集束**；切回来仍是 2 费。
 *
 * ── 口径（程）：转换链**保留**这份覆盖，新卡继续用同一个 `cost`。
 * ── 判据：只认 `src.costOverride !== undefined`；普通卡不带标记 ⇒ 行为逐字不变。
 */
export const carryCostOverride = <T extends CardData>(next: T, src: CardData): T =>
    (src.costOverride === undefined
        ? next
        : { ...next, cost: src.costOverride, costOverride: src.costOverride }) as T;

/**
 * [2026-07-31 安卡希雅] 升级后的手牌替换：剑舞→重锋、扩散/集束→月镰剑势
 * 供所有安卡升级路径（朔望之期 / 战斗升级扫描器）统一调用
 */
export const upgradeAcaciaHand = (hand: CardData[]): CardData[] => {
    return hand.map(c => {
        if (c.key === 'acacia_chrono_echo_spell') return carryCostOverride({ ...createCard('acacia_chrono_echo_heavy'), id: c.id }, c);
        if (c.key === 'acacia_sword_rain' || c.key === 'acacia_moon_focus') return carryCostOverride({ ...createCard('acacia_sword_rain_alt'), id: c.id }, c);
        // [2026-07-31] 手牌安卡英雄副本：保持 Lv1（显示升级进度、打出后由升级扫描器升到 Lv2），
        // 但标记升级条件已达成（customProgress=1）并让关联法术指向重锋（变形系统不依赖此字段，为防御）
        if (c.key === 'acacia_chrono_echo') {
            return { ...c, customProgress: Math.max(c.customProgress || 0, 1), associatedSpellKey: 'acacia_chrono_echo_heavy' };
        }
        return c;
    });
};

/**
 * [2026-08-01 莉莉子] 安卡退级后的手牌替换：重锋→剑舞、月镰剑势→扩散
 * 供剑痕时空退级路径统一调用（与 upgradeAcaciaHand 走相同逻辑层、反向执行）
 */
export const demoteAcaciaHand = (hand: CardData[]): CardData[] => {
    return hand.map(c => {
        if (c.key === 'acacia_chrono_echo_heavy') return carryCostOverride({ ...createCard('acacia_chrono_echo_spell'), id: c.id }, c);
        if (c.key === 'acacia_sword_rain_alt') return carryCostOverride({ ...createCard('acacia_sword_rain'), id: c.id }, c);
        // 手牌/牌库里的 Lv2 安卡副本：降回 Lv1（退级后抽到/打出为 Lv1），升级进度与关联法术一并回退
        if (c.key === 'acacia_chrono_echo' && c.level === 2) {
            return { ...c, level: 1, customProgress: 0, associatedSpellKey: 'acacia_chrono_echo_spell' };
        }
        return c;
    });
};

// --- 以下为新增代码 ---

// [新增] 命运抉择选项的通用安检机制
/**
 * [2026-10-05 莉莉子 BUG修复 · 20261005-01] 慢速子卡的「时机」枷锁
 * ── 病根：天启者抉择法术的**母卡是 burst**（`cards.ts` 里 6 张抉择基牌全是 `spell-burst`），
 *    真正慢速的是**子卡**（最终指令 / 吞噬神座 / 吉煞映照 / 顷刻莲潮…）。
 *    而 `playCard` 的三道慢速守卫（自己回合 / 堆栈为空 / 战斗阶段，`useGameState.ts:4085-4105`）
 *    判的是**手上那张卡** ⇒ 母卡把三道全躲过去了；抉择选项这里此前又只有"战斗阶段"一条枷锁
 *    ⇒ 敌人打出法术、堆栈尚未结算时（那一拍 `turnOwner` 归响应方 = 玩家，手牌可点），
 *    玩家能打出 0 费母卡、再选慢速大招 = **慢速法术越权**
 *    （正是 2026-10-02 BUG-20261002-09 那次只补了 `playCard`、漏掉的第二条路）。
 */
export interface ChoiceSlowTiming {
    owner: 'player' | 'enemy';      // 这张抉择法术的归属方（spellCasting.choiceOwner）
    turnOwner: 'player' | 'enemy';  // 当前优先权归谁
    stackLength: number;            // 法术堆栈长度（> 0 = 正在响应某个法术）
}

export const evaluateChoiceCondition = (
    choiceCardData: CardData,
    playerMana: number,
    playerSpellMana: number,
    isHeroLeveled: boolean = false,
    gamePhase?: string, // [2026-07-27 莉莉子] 阶段检查（慢速法术拦截）
    slowTiming?: ChoiceSlowTiming // [2026-10-05 莉莉子] 慢速子卡的时机检查（与普通慢速法术同口径）
): { canPlay: boolean; lockedMessage: string } => {

    // 防御性检查
    if (!choiceCardData) {
        return { canPlay: false, lockedMessage: "数据异常" };
    }

    // [枷锁判定 1：英雄等级限制]
    // 兼容处理：检查卡牌数据是否要求 2 级，或通过 key 识别大招
    const requiresLevel2 = choiceCardData.isLevel2Choice ||
        (choiceCardData.key.includes('ultimate') && choiceCardData.key !== 'acacia_chrono_echo_ultimate');
    if (requiresLevel2 && !isHeroLeveled) {
        return { canPlay: false, lockedMessage: "升级以解锁" };
    }

    // [枷锁判定 2：法力值限制]
    if (!canAffordCard(choiceCardData, playerMana, playerSpellMana)) {
        return { canPlay: false, lockedMessage: "法力值不足" };
    }

    // [枷锁判定 3：战斗阶段不能选慢速法术]
    if (gamePhase) {
        const isCombatPhase = gamePhase === 'attack_declare' || gamePhase === 'block_declare' || gamePhase === 'react_to_block';
        if (isCombatPhase && choiceCardData.type === 'spell-slow') {
            return { canPlay: false, lockedMessage: "此时无法使用慢速法术" };
        }
    }

    // =====================================
    // [枷锁判定 4：慢速子卡必须与**普通慢速法术**同口径 —— 自己回合 + 堆栈为空]
    //   （战斗阶段那条在枷锁 3；三条合起来 = `playCard` 那套慢速守卫的全集）
    //   ⚠️ 判据用**归属方**（choiceOwner）而不是 turnOwner —— 玩家可以在对方优先权阶段
    //      合法打出极速抉择法术（见 2026-10-02 BUG-20261001-01 的教训：归属 ≠ 优先权）。
    // =====================================
    if (slowTiming && choiceCardData.type === 'spell-slow') {
        if (slowTiming.turnOwner !== slowTiming.owner) {
            return { canPlay: false, lockedMessage: "慢速法术只能在自己回合施放" };
        }
        if (slowTiming.stackLength > 0) {
            return { canPlay: false, lockedMessage: "法术响应中，无法施放慢速法术" };
        }
    }

    // 校验通过，绿灯放行
    return { canPlay: true, lockedMessage: "" };
};

// ==========================================
// [新增] 状态快照与完美复印机 (Deep Clone Engine)
// ==========================================
export const cloneUnitState = (sourceCard: CardData, targetTemplate: CardData): CardData => {
    // 1. 计算源卡牌此时此刻的”真实身材” (包含永久 buffs、回合 buffs 和受到的伤害)
    // [2026-09-26 莉莉子 BUG修复] 攻击力改走 `getPower()`（0 下限 + maxPower 上限的唯一口径）——
    //   此前内联求和会把负值**原样写进克隆体的基础攻击力**，而下方又把 buffs/roundBuffs 清零
    //   ⇒ 负值被固化成永久身材，回合末的临时账本清算再也清不掉。
    const currentPower = getPower(sourceCard);
    const currentHealth = sourceCard.health + (sourceCard.buffs?.health || 0) + (sourceCard.roundBuffs?.health || 0) - (sourceCard.damageTaken || 0);

    // 2. 合并关键词：保留模板自带的词条（如'Ephemeral'），并加上源卡牌此刻的词条，最后去重
    const mergedKeywords = Array.from(new Set([...targetTemplate.keywords, ...sourceCard.keywords]));

    // 3. 返回完美复刻的新卡牌
    return {
        ...targetTemplate,
        power: currentPower,
        health: currentHealth,
        maxHealth: currentHealth, // 快照后的最大生命值即为当前真实生命值
        keywords: mergedKeywords,
        // [关键] 清空克隆体的受击与增益记录，因为它已经把这些历史记录固化为了基础身材
        damageTaken: 0,
        buffs: { power: 0, health: 0 },
        roundBuffs: { power: 0, health: 0 }
    };
};

// ==========================================
// [新增] UI 前置侦察兵：检测卡牌的前置在场条件是否满足
// ==========================================
export const checkCardConditionActive = (card: CardData, playerBench: CardData[], combatField: any[], game?: GameState): boolean => {
    if (!card.effects || card.effects.length === 0) return false;

    // [2026-07-31 圣树·阿尔维娜] 能力触发条件：本回合已飞剑（满足 → 手牌高亮描边，与歌莉娅同款）
    if (card.key === 'Sacred_Tree_Squad_Alvina' && game?.playerRoundSwordUsed) {
        return true;
    }

    // 遍历该卡牌挂载的所有效果
    for (const effId of card.effects) {
        const def = EFFECT_DB[effId];
        // 如果发现需要特定单位在场的暗号名单
        if (def && def.params && def.params.presenceRequirement && def.params.presenceRequirement.length > 0) {
            const requiredKeys = def.params.presenceRequirement;

            const isValidUnit = (c: CardData | null | undefined) =>
                c && requiredKeys.some(reqKey => c.key.includes(reqKey));

            // 1. 查备战席 (增加防御性空值判断)
            let hasRequiredUnit = (playerBench || []).some(isValidUnit);

            // 2. 查交战区 (增加防御性空值判断)
            if (!hasRequiredUnit && combatField) {
                hasRequiredUnit = (combatField || []).some(fight => {
                    const myUnit = fight.owner === 'player' ? fight.attacker : fight.blocker;
                    return isValidUnit(myUnit);
                });
            }

            if (hasRequiredUnit) return true; // 条件满足，拉响橙色警报！
        }
    }
    return false;
};
// ==========================================
// [新增] UI 侦察兵：检测卡牌是否已满足升级条件但还未升级（用于手牌橙色高光）
// ==========================================

/**
 * 检查冠军卡是否已满经验（customProgress 达标），但仍是 Lv1 待升级状态。
 * 用于手牌橙色高光提示"蓄势待发"。
 */
export const checkCardReadyToLevelUp = (card: CardData, game?: GameState): boolean => {
    if (card.level >= 2 || !card.isChampion) return false;
    // 猫汐尔：镜像 mauxirDamage ≥ 30 时满经验（[2026-10-06] 由 customProgress 改为专属镜像）
    if (card.key === 'mauxir_lotus_drive' && (card.mauxirDamage || 0) >= 30) return true;
    // [2026-07-31 安卡希雅] 场下升级：朔望之期已打出（全局标记）→ 手牌安卡橙色高亮"打出即升级"
    if (card.key === 'acacia_chrono_echo' && game?.leveledChampions?.includes('acacia_chrono_echo')) return true;
    // 未来其他以 customProgress 追踪升级的英雄可加在这里
    // if (card.key === 'xxx' && (card.customProgress || 0) >= N) return true;
    return false;
};

// ==========================================
// [新增] 猫汐尔专属：召唤体系伤害经验收集器
// ==========================================

/**
 * 验证单位是否具有召唤系血统
 */
export const isSummonerOrSummon = (card: CardData): boolean => {
    return card.race?.some(r => r === 'summoner' || r === 'summon') ?? false;
};

/**
 * 猫汐尔升级进度累加器 —— **[2026-10-06 重写 · BUG-20261006-01]**
 *
 * 旧实现的两个病根（粉丝症状：**交战区的召唤师/召唤衍生物的进攻与格挡伤害基本不计入**）：
 *   ① “全域广播”只扫 备战席/手牌/牌库 —— **交战区那一份从不被扫**（形参 `_field` 从未被使用）。
 *      猫汐尔本人待在交战区（进攻/格挡）时，她的进度**无处可写**；而“归位”恰好是把
 *      **交战区那份实例**写回备战席（`useGameState.ts:4197`）⇒ 这一笔进度**永久丢失**。
 *   ② 进度记在卡实例上、且用**值式** setState 写回 ⇒ 战斗链路里后续的**值式**写回
 *      （如 `setPlayerBench(res.playerBench)`，其快照取自 `stateRef.current.*`）会把它**静默盖回**。
 *
 * 新实现（与茉莉安 `beaconDeaths` 完全同构）：
 *   · 先 `bumpMauxirProgress` 让**模块级账本单一自增**（真源住在 React state 之外 ⇒ 躲得开整体覆盖）；
 *   · 再把权威值**幂等贴值**到 备战席/手牌/牌库（同值重复贴返回原数组 ⇒ 零无谓 re-render）。
 *   ⇒ 漏扫 / 被覆盖 都只会让**显示**短暂落后，**绝不丢进度**（下一处贴值即自愈）。
 *
 * ⚠️ **交战区**的贴值不在本函数内做（此处拿不到 field setter）——
 *    由调用方在记账后紧跟一行 `applyMauxirProgressToField(...)`；
 *    另有两处兜底贴值：战斗**归位**（`useGameState.ts`）与**回合开始**（`useRoundLifecycle.ts`）。
 *
 * @param amount 这一笔召唤体系造成的伤害
 * @param side   计入哪一方。缺省 `'player'` = **保持修复前口径**（本轮只修“丢进度”，
 *               不顺手改“谁的伤害算谁的”—— 敌我来源串账那条是**旁支，未动**）
 */
export const accumulateMauxirDamage = (
    bench: CardData[],
    _field: any[], // 保留形参仅为兼容既有调用点的实参位置（交战区贴值见上方说明）
    amount: number,
    setBench: (b: CardData[]) => void,
    hand?: CardData[],
    setHand?: (h: CardData[]) => void,
    deck?: CardData[],
    setDeck?: (d: CardData[]) => void,
    side: 'player' | 'enemy' = 'player',
): boolean => {
    if (!(amount > 0)) return false;

    // ① 真源：单一自增（**全项目唯一入口**）
    bumpMauxirProgress(side, amount);

    // ② 镜像：幂等贴值
    const nextBench = applyMauxirProgress(bench, side) as CardData[];
    if (hand && setHand) setHand(applyMauxirProgress(hand, side) as CardData[]);
    if (deck && setDeck) setDeck(applyMauxirProgress(deck, side) as CardData[]);
    setBench(nextBench);

    return false; // 不越权触发升级
};

/**
 * [2026-09-16 1.0.16 茉莉安] 我方召唤的「獠牙信标」被破坏 → 茉莉安的升级进度
 *
 * **纯函数**：只返回新的区域数组，不碰 setState（调用点在微队列内部，全程操作局部数组）。
 *
 * [2026-10-02 莉莉子 C1 · 改为全局进度] 由「各自 +1」改为「**按权威值赋值**」：
 * ── 旧实现的病根：每个区域**各自累加**。而茉莉安（计数挂在她身上）**同一时刻只会在一个地方**
 *    （备战席 / 手牌 / 牌库 / 交战区四选一，她去进攻时就被移出备战席）⇒
 *    漏扫她当时所在的那个区域 = 这一次进度**静默丢失**；战斗归位又把旧实例写回。
 *    这就是 09-23「信标不计数 → 茉莉安不升级」与 09-27「交战区实例」两次事故的本质。
 * ── 新口径：真源是**全局对局状态** `game.beaconDeaths[side]`（单一自增，见 useGameState 死亡漏斗），
 *    本函数只负责把那个**绝对值**贴到各区域的副本上（幂等：同值重复贴不会累加）。
 *    ⇒ 即使某个区域漏扫，也**不会多算/少算**，只可能短暂显示旧值。
 * ── 手册问题记录 I04 当初写的就是这个方向：「进度挂**全局对局状态**」。
 *
 * @param value 权威进度值（来自 `game.beaconDeaths[召唤者侧]`）
 */
export const applyBeaconDeaths = (zone: CardData[], value: number): CardData[] => {
    let changed = false;
    const next = zone.map(card => {
        if (card.key === 'marian' && (card.beaconDeaths || 0) !== value) {
            changed = true;
            return { ...card, beaconDeaths: value };
        }
        return card;
    });
    return changed ? next : zone; // 没有命中就原样返回，避免无谓 re-render
};

// ==========================================================================
// [2026-10-02 莉莉子 · 信标亡语化] 重生亡语：授予 / 查询
// ==========================================================================
/** 重生亡语的**两个**效果 id —— **数组顺序就是执行顺序**（先召唤，再补刀） */
export const BEACON_RESPAWN_EFFECTS: readonly string[] = [
    'effect_marian_beacon_respawn',
    'effect_marian_beacon_respawn_snipe',
];

/**
 * 给一枚「獠牙信标」贴上「重生亡语」（**幂等**：同一个亡语不会叠加 —— 程 2026-10-02 口径）。
 * 非信标 / 已贴全 → **原样返回同一个引用**（避免无谓 re-render）。
 */
export const grantBeaconRespawnEffect = (card: CardData): CardData => {
    if (card.key !== 'Marian_Wolf_Tooth_Beacon') return card;
    const cur = card.effects || [];
    const missing = BEACON_RESPAWN_EFFECTS.filter(id => !cur.includes(id));
    if (!missing.length) return card;
    return { ...card, effects: [...cur, ...missing] };
};

/** 该枚信标是否已带「重生亡语」 */
export const hasBeaconRespawnEffect = (card: CardData): boolean =>
    !!card.effects?.includes('effect_marian_beacon_respawn');

/**
 * [2026-10-02 莉莉子 BUG修复] **玩家是否可以撤回这条战线上的 blocker**（唯一口径，UI 与引擎共用）。
 *
 * ── 病根：被**敌方**用【挑战者】/【暴露】拉走的**我方**单位，原本两条撤回路径
 *    （点击 / 拖拽）都能把它拖回备战席 ⇒ 等于**白嫖闪避对方的强制格挡**。
 *    此前只在"点击被拉来的敌人"那一侧加了守卫（GameSession:2281），
 *    本函数把判据收成**唯一一处**，UI 与引擎共用，杜绝再分叉。
 * ── 口径：
 *    · `owner === 'enemy'`（敌方发起进攻 ⇒ blocker 是**我方**单位）+ `isChallenged`（被迫格挡）
 *      ⇒ **不允许撤回**（那是对方的挑战）
 *    · 其余情形允许：我方主动派的格挡、我方拉来的敌人（取消挑战）、我方取消自己的进攻
 */
export const canPlayerRetractBlocker = (
    fight: { owner: 'player' | 'enemy'; isChallenged?: boolean } | null | undefined,
): boolean => {
    if (!fight) return false;
    if (fight.owner === 'enemy' && fight.isChallenged) return false;
    return true;
};

/**
 * 某侧是否有**【活着在场】的茉莉安** —— 即「信标重生光环」是否生效。
 *
 * [2026-10-02 程拍板 · 光环下放到 Lv1] ⚠️ **不再要求 Lv2**：
 * ── 程的现场分析（两个必断档场景）：
 *    A. 入场时场上没信标 → 她召唤的那枚**没被贴过亡语**；它被打死正好凑满 2 次让她升级，
 *       可这一击**吃不到 Lv2 光环**（见下）⇒ 场上再无信标，**永久断档**。
 *    B. 入场时贴了第 1 枚 → 它重生出第 2 枚（**新的不带亡语**）→ 第 2 枚被打死（她升级），
 *       同样吃不到光环 ⇒ **永久断档**。
 * ── 根因二（与上两条独立）：升级标记 `markLeveledUp` 写在**死亡批次末尾**，
 *    而亡语派发在同一批次**更早** ⇒ "致死的那一击"永远看不到刚达成的 Lv2。
 * ── ⇒ 把「给敌方信标贴重生亡语」**下放到 Lv1（等级无关的光环）**，两条根因一并消失。
 *    程原话：「反正 LV1 击杀两个信标后就升级了，也没什么区别」。
 *
 * ⚠️ 仍然是**动态判定**（亡语派发那一刻查她是否活着在场），不做"贴一次就记住"的持久化 ——
 *    这样既贴合光环语义，也天然覆盖"任意时刻新召唤出来的信标"。
 */
export const hasLiveMarian = (
    side: 'player' | 'enemy',
    playerBench: CardData[],
    enemyBench: CardData[],
    combatField?: { attacker?: CardData | null; blocker?: CardData | null; owner: 'player' | 'enemy' }[],
): boolean => {
    const isLive = (c: CardData | null | undefined) =>
        !!c && c.key === 'marian' && !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying';
    const bench = side === 'player' ? playerBench : enemyBench;
    if (bench.some(isLive)) return true;
    return (combatField || []).some(f => isLive(f.attacker) || isLive(f.blocker));
};


/**
 * [2026-09-19 1.0.16 茉莉安] 「獠牙信标」落场装配器 —— 建卡之后的**唯一**一道加工工序
 *
 * **纯函数**：套用虹彩（T23）在 `game.beaconMaxHealthMod` 上累计的生命上限永久修正。
 *
 * ⚠️ **为什么必须收口在这一处**（程实测 bug）：
 *    信标有 3 条召唤路径，此前修正只写在 `effectProcessor` 的 SUMMON 分支里，
 *    另两条（回合开始④库效补信标 / 对局开始④库效）走 `createFullCard` 直建 → **完全绕过修正**。
 *    后果：两个虹彩在场（累计 −10）时，被打爆后下一回合补出来的信标仍**满血 20** 落场，
 *    再挨茉莉安一记狙击 → 剩 15，而设计预期是 20−5−5−5 = **5**。
 *    ⇒ 三条路径统一调用本函数，杜绝"每条路各抄一遍修正"。
 *
 * ⚠️ 保底 1 点：修正可能把上限压到 ≤0（多个虹彩叠加），此时不允许产生 0/负血量的信标。
 * ⚠️ 绝不改 `CARD_DB`：那是模块级常量，改它会跨局污染（修正一律走 game state）。
 */
export const assembleBeaconCard = (card: CardData, mod?: number): CardData => {
    if (card.key !== 'Marian_Wolf_Tooth_Beacon' || !mod) return card;
    const newMax = Math.max(1, (card.maxHealth || 0) + mod);
    const newHp = Math.max(1, (card.health || 0) + mod);
    console.log(`[虹彩] 信标落场套用上限修正 ${mod} → ${newHp}/${newMax}`);
    return { ...card, maxHealth: newMax, health: newHp };
};

/** [2026-07-14 梵音] 检测觉悟状态（我方法力值上限是否达到10点） */
export const hasEnlightenment = (maxMana: number): boolean => {
    return maxMana >= 10;
};

/**
 * [2026-09-19 BUG修复] 法术「打不出去」的原因（引擎与手牌高亮**共用唯一口径**）
 *
 * 返回 `null` = 可以打；返回字符串 = 不能打，且该字符串就是要弹给玩家的提示。
 *
 * ⚠️ 为什么要有这个函数：卡面写着"XXX 时无法打出"，但**条件从未实装** ⇒
 *    卡面亮着可用高光、点下去也照打，只是效果被静默跳过 —— 白花法力。
 *    两处判断（手牌高亮 / 点击拦截）必须同源，否则又会出现"高光说能打、点了打不出去"。
 */
export const getSpellPlayBlockReason = (
    card: CardData,
    ctx: { playerBench?: CardData[]; enemyBench?: CardData[]; combatField?: any[] },
): string | null => {
    const BEACON_KEY = 'Marian_Wolf_Tooth_Beacon';
    const isLive = (c: CardData | null | undefined): boolean =>
        !!c && !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying';
    const benchHasLiveBeacon = (bench?: CardData[]) =>
        (bench || []).some(c => c.key === BEACON_KEY && isLive(c));

    // [2026-09-23 莉莉子 · 重器制空重做] 已**移除**支援技「重器制空」的拦截。
    //   旧拦截是「敌方备战席已有存活信标 / 备战席满 → 无法打出」，
    //   但它与 ④库效 的开局信标互斥 ⇒ 这张牌整局打不出去（结构性死牌）。
    //   重做后该牌**永远可以打出**（有雷就炸雷、没雷就埋雷），故不再需要任何打出条件。

    // 小技能「钢羽傍身」：对信标造成伤害 —— 场上（敌我备战席 + 交战区）没有信标则无法打出
    if (card.key === 'marian_rush') {
        const fieldHasBeacon = (ctx.combatField || []).some(f =>
            (f?.attacker?.key === BEACON_KEY && isLive(f.attacker))
            || (f?.blocker?.key === BEACON_KEY && isLive(f.blocker)));
        if (!benchHasLiveBeacon(ctx.playerBench) && !benchHasLiveBeacon(ctx.enemyBench) && !fieldHasBeacon) {
            return '场上没有「獠牙信标」';
        }
        return null;
    }

    return null;
};

/**
 * [2026-09-19 BUG修复] 天启者【升级进度】的唯一口径（UI 专用）
 *
 * ⚠️ 为什么必须收成一个函数：这条规则此前被 if/else 链**在 3 处各抄一遍** ——
 *    `Card.tsx` 卡面进度环 / `Card.tsx` 牌库面板气泡 / `GameSession.tsx` 阶跃反馈仪（左侧弹小图标），
 *    结果是**新加的天启者只要漏抄一处、那处就永远显示 0**：
 *    茉莉安的进度存在专属字段 `beaconDeaths`，三处全漏 ⇒ 手牌、牌库面板、左侧弹窗统统显示 0。
 *    （三处口径还不一致：`acacia_chrono_echo` 只有一处抄了。）
 *
 * ⚠️ 茉莉安的进度**刻意不复用 `customProgress`**（那是被多个系统共用的位域，bit2 = 绿色降费标记，
 *    而她的升级目标恰好是 2 → 复用会把「降费」误判成「升级达成」）。见 types.ts 的字段注释。
 */
export const getChampionUpgradeProgress = (
    card: CardData,
    nexus?: { player?: number; enemy?: number; playerMax?: number; enemyMax?: number },
): number => {
    switch (card.key) {
        case 'fenny': {
            const p = nexus?.player ?? 20;
            const e = nexus?.enemy ?? 20;
            // [2026-10-04 程拍板] 与 checkCardLevelUp **同口径**：任一方水晶 ≤ 其自身上限的一半。
            //   上限不传时读当前对局快照（标准对局 20 ⇒ 仍是 ≤10，行为不变）。
            //   ⚠️ 两处口径必须同步改 —— 否则会出现"进度环显示 0、却突然升级"的错位。
            const pMax = nexus?.playerMax ?? nexusMaxSnapshot.player;
            const eMax = nexus?.enemyMax ?? nexusMaxSnapshot.enemy;
            return (p * 2 <= pMax || e * 2 <= eMax) ? 1 : 0;
        }
        case 'lyfe': return card.strikeCount || 0;
        case 'marian': return card.beaconDeaths || 0; // ← 专属字段
        case 'pupu_specular_soul':
        case 'acacia_chrono_echo':
            return card.customProgress || 0;
        // [2026-10-06 莉莉子 BUG修复 · BUG-20261006-01] 猫汐尔读**专属镜像**（真源见 utils/mauxirProgress）
        case 'mauxir_lotus_drive': return card.mauxirDamage || 0;
        default: return 0;
    }
};

/** [2026-07-15] 检测巨偶一瞥是否处于觉悟状态（手牌橙色高亮） */
export const checkShaloGlimpseEnlightened = (card: CardData, maxMana: number): boolean => {
    return card.key === 'Shalo_Golem_Glimpse' && hasEnlightenment(maxMana);
};