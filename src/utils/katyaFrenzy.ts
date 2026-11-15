// ==========================================
// [2026-11-14 莉莉子 ✨新功能 · 凯茜娅卡「溯时双翼·狂乱」]
// ──────────────────────────────────────────
// 卡面：「本回合内“凯茜娅·狂诗”每倾泻 3 次，对敌方全体造成 1 点伤害。」
//
// ── 口径（程 2026-11-14 修订，**最终版**）：
//      「每倾泻 3 次」的「次」= 倾泻打出的**一发**，不是"一张倾泻卡"。
//      · 一次倾泻结算会连打 `max(1, ceil(N/2))` 发（N = 她的攻击力），**每发算 1 次**；
//      · 埋点在**发循环内部**（`logic/effectProcessor.ts` 的 `case 'BARRAGE'`：
//        打单位档 `:6168` 的 for 循环、打水晶档 `:6099` 的 for 循环），**每发结算即 +1**；
//      · `pierced % 3 === 0` 时敌方全体 1 点：
//        打 4 发 ⇒ 触发 1 次、余 1 发；打 6 发 ⇒ 触发 2 次。
//      · 持续到**回合结束**（回合开始清零，见 `resetFrenzyRound()` 的两个调用点）。
//
// ── 为什么 AOE 本身仍不在发循环里炸：
//      发循环里只**记账**（本模块只累数），真正的 `effect_katya_frenzy_aoe` 由
//      `BARRAGE` case 收尾统一补 —— 否则 AOE 可能在连打中途清场，
//      让「4 发」变成「2 发」，「每 3 发一次」的算术当场自相矛盾。
//
// ── 为什么真源放「模块级账本」（与 `utils/katyaProgress.ts` 同构）：
//    ① `BARRAGE` 在 `effectProcessor` 里是**纯结算**，拿不到 React state；
//    ② 放卡上会被"整数组写回"覆盖（`setPlayerBench(累积数组)` 这类值式写回很多）；
//    ③ 放 `game` 同样被 `setGame(res.game)` 的值式写回覆盖。
//    ⇒ 唯一稳的家是 React state 之外（判据与 `katyaProgress` / `mauxirProgress` 逐字同源）。
//
// ── 结构（两本账 + 一条恒等式）：
//    `shots[side]`   = 本回合**已打出的倾泻发数** R —— 不管有没有武装，一路累加（单一自增）
//    `settled[side]` = 已被狂乱「消费」掉的发数（**恒为 N 的整数倍**，内部量）
//    对外显示的 `pierced = shots − settled`（距下一跳还差几发）
//    ⇒ 触发一律走同一条式子：`triggers = floor((shots − settled) / N)`，然后 `settled += triggers × N`。
//      这样「武装时回溯」与「之后每发推进」**共用同一份算术**，不会两套口径打架，
//      也不会因为同回合同一张狂乱打两次而重复触发（幂等：settled 已推进过就不会再算）。
//
// ── ⚠️ 与 `Volatile` 的关系（别混）：
//    `Volatile` 只决定**手牌瞬逝**（打不出来就弃掉），与"效果持续到回合末"是两件事。
//    本模块管的是后者的寿命（`resetFrenzyRound`）。
// ==========================================

/** 「每倾泻 N 次」的 N —— **单一真源**（数据侧的 `params.every` 只作为声明，缺省即取本值） */
export const FRENZY_EVERY = 3;

/**
 * 单次结算最多补几跳的**告警阈值**（不是设计上限）。
 * 按"发"计数后，一次倾泻最多 64 发（`BR_COUNT_HARD_CAP`）⇒ 最多 21 跳，故阈值取 32；
 * 越过它只 `console.warn` 自证"异常数据"，**不截断**（截断会让账本与实伤分叉）。
 */
export const FRENZY_MAX_TRIGGERS_PER_SETTLE = 32;

type Side = 'player' | 'enemy';

/** 某方是否已打出「狂乱」（本回合有效） */
const armed: Record<Side, boolean> = { player: false, enemy: false };
/** 某方本回合**已打出的倾泻发数**（不看是否武装；唯一自增入口 `bumpFrenzyPierce`） */
const shots: Record<Side, number> = { player: 0, enemy: 0 };
/** 某方已被狂乱消费的发数（恒为 N 的整数倍）⇒ 余数 = shots − settled */
const settled: Record<Side, number> = { player: 0, enemy: 0 };
/** 某方的 N（缺省 = `FRENZY_EVERY`；由 `armFrenzy` 按数据声明写入） */
const everyOf: Record<Side, number> = { player: FRENZY_EVERY, enemy: FRENZY_EVERY };

/** 一次推进（武装 / 每发）之后要回给调用方的进度快照 */
export interface FrenzyProgress {
    /** 该方当前的 N */
    every: number;
    /** 本回合已打出的倾泻发数 R */
    shots: number;
    /** **本次调用**要补的 AOE 跳数（未武装时为 0） */
    triggers: number;
    /** 距下一跳还差几发（= shots − settled） */
    pierced: number;
}

const normEvery = (v: number | undefined): number => {
    const n = Math.floor(v ?? FRENZY_EVERY);
    return n >= 1 ? n : FRENZY_EVERY;
};

const shotsOf = (side: Side): number => shots[side] || 0;
const settledOf = (side: Side): number => settled[side] || 0;
const piercedOf = (side: Side): number => Math.max(0, shotsOf(side) - settledOf(side));

/** 把"已打出但还没被消费"的发数一次性换算成跳数（唯一算术出口） */
const consumePending = (side: Side): number => {
    const every = everyOf[side] || FRENZY_EVERY;
    const pending = piercedOf(side);
    const triggers = Math.floor(pending / every);
    if (triggers > 0) settled[side] = settledOf(side) + triggers * every;
    return triggers;
};

/**
 * 武装「狂乱」（本回合有效），并**回溯**本回合已经打出的发数。
 * ── 语义：`pierced = R`，若 `R >= N` ⇒ 立刻补 `floor(R / N)` 跳 AOE，余 `R % N` 保留。
 *    （「R」= 本回合已打出的**倾泻发数**，无论当时有没有武装 —— 用户口径：
 *      "本回合已经倾泻了 3 次，这时才打狂乱，那 3 次不能白打，而且否则永远找不到结算时机"。）
 * ── **幂等**：同回合同一张狂乱打第二次时，`settled` 已推进过 ⇒ 不会再触发一遍（`triggers = 0`）。
 * @param every 「每倾泻 N 次」的 N（缺省 `FRENZY_EVERY`）
 * @returns 本次武装要立刻补的跳数（`triggers`）+ 余数（`pierced`）
 */
export const armFrenzy = (side: Side, every?: number): FrenzyProgress => {
    armed[side] = true;
    everyOf[side] = normEvery(every);
    const triggers = consumePending(side);
    return {
        every: everyOf[side],
        shots: shotsOf(side),
        triggers,
        pierced: piercedOf(side),
    };
};

/** 该方本回合是否已打出「狂乱」 */
export const isFrenzyArmed = (side: Side): boolean => armed[side] === true;

/** 该方当前的 N（未武装时也返回缺省值，便于日志/调试统一读法） */
export const getFrenzyEvery = (side: Side): number => everyOf[side] || FRENZY_EVERY;

/** 该方「距下一跳还差几发」（显示/调试用；未武装时 = 本回合已打出的发数） */
export const getFrenzyPierced = (side: Side): number => piercedOf(side);

/** 该方本回合已打出的**倾泻发数**（调试/显示：武装回溯的原值 R） */
export const getFrenzyShots = (side: Side): number => shotsOf(side);

/**
 * 记**一发**「本回合已打出的倾泻」—— 全项目唯一自增入口。
 * 调用点（`logic/effectProcessor.ts` 的 `case 'BARRAGE'`，**发循环内部**）：
 *   · 打单位档：`:6168` 的 `for` 循环，每轮（每发）一次
 *   · 打水晶档：`:6099` 的 `for` 循环，每轮（每发）一次
 *   ⚠️ 一**张**倾泻卡只调用 `ceil(N/2)` 次，不是 1 次 —— 「次」= 发（见文件头口径）。
 *   ⚠️ 穿云激流（`params.pierceLoop`）**计**（2026-11-14 程拍板）：它打的是"打空一整轮预算"的连续倾泻，
 *      卡面「每倾泻 3 次」指普通倾泻（⚠️ 此条为本批取舍，待程确认）。
 * @returns `{ triggers, pierced, shots }`：本次推进补了几跳（正常 0 或 1）；余数；累计发数
 */
export const bumpFrenzyPierce = (side: Side): FrenzyProgress => {
    shots[side] = shotsOf(side) + 1;
    if (!isFrenzyArmed(side)) {
        // 未武装也要计数（武装时要回溯的正是这本账），但不消费、不触发
        return { every: getFrenzyEvery(side), shots: shotsOf(side), triggers: 0, pierced: piercedOf(side) };
    }
    const triggers = consumePending(side);
    return { every: getFrenzyEvery(side), shots: shotsOf(side), triggers, pierced: piercedOf(side) };
};

/**
 * 回合开始清零（**唯一调用点**：`hooks/useRoundLifecycle.ts` 的 `resetSpellCastRoundCounters()` 旁）。
 * 语义 = 「本回合内」到期 ⇒ **两本账一起清**（`shots` / `settled`），只清一本会留下跨回合的假余数。
 */
export const resetFrenzyRound = (): void => {
    armed.player = false;
    armed.enemy = false;
    shots.player = 0;
    shots.enemy = 0;
    settled.player = 0;
    settled.enemy = 0;
    everyOf.player = FRENZY_EVERY;
    everyOf.enemy = FRENZY_EVERY;
};

/**
 * 对局开局/重开清零（**两个建局入口都调**：`useGameState.ts:658` / `:1933`，
 * 与 `resetKatyaProgress()` 同批 —— 历史上正是漏了一处才出过跨局残留）。
 */
export const resetFrenzyAll = (): void => resetFrenzyRound();

/** 读全量快照（调试 / 沙盒面板用） */
export const getFrenzySnapshot = (side: Side): { armed: boolean; pierced: number; every: number; shots: number } => ({
    armed: isFrenzyArmed(side),
    pierced: getFrenzyPierced(side),
    every: getFrenzyEvery(side),
    shots: getFrenzyShots(side),
});

/**
 * **[沙盒 / 调试专用]** 直接设定某方的狂乱状态（真机流程**不会**调用它 —— 真机只走
 * `armFrenzy` / `bumpFrenzyPierce` 的单一自增）。
 * `pierced` 语义 = 「距下一跳还差几发」⇒ 反推 `settled = shots − pierced`（等价换算，不改口径）。
 */
export const setFrenzyForSandbox = (
    side: Side,
    opts: { armed?: boolean; pierced?: number; every?: number; shots?: number } = {},
): { armed: boolean; pierced: number; every: number; shots: number } => {
    if (typeof opts.armed === 'boolean') armed[side] = opts.armed;
    if (typeof opts.every === 'number') everyOf[side] = normEvery(opts.every);
    if (typeof opts.shots === 'number') {
        shots[side] = Math.max(0, Math.floor(opts.shots) || 0);
        // 发数被改 ⇒ 已消费量必须跟着钳回合法区间，否则 pierced 可能变成负数
        settled[side] = Math.min(settledOf(side), shotsOf(side));
    }
    if (typeof opts.pierced === 'number') {
        const want = Math.max(0, Math.floor(opts.pierced) || 0);
        settled[side] = Math.max(0, shotsOf(side) - want);
    }
    return getFrenzySnapshot(side);
};
