// ==========================================
// 悖论迷宫 / 战斗引擎 · 「等升级播完」的唯一实现（刹车片）
// [2026-10-03 莉莉子 · 收口] 原先这段逻辑在 `useGameState`（战斗收尾）与
//   `useSpellSystem`（堆栈结算）**各抄了一份** —— 本次系统收口的同一主题：
//   同一语义多处实现 ⇒ 必漏一处。
//
// 语义（程 2026-10-03 拍板）：
//   升级影片**可以在战斗演出期间插播**，并**暂停当前战斗演出**，
//   直到天启者升级动画（含影片）完整播放完毕，再接着播放战斗演出。
//   ⇒ 任何"演出序列"想表达"这里要停下来等升级"，调本函数即可。
//
// 死锁护栏（两层）：
//   ① 单次上限 `max(40000, 队列长度 × 16000)`（单英雄 16s，起步 40s）—— 取值依据见下方注释
//   ② [可选] **累计预算** `budget`（默认 120s）—— 同一场战斗里会被调用多次（每一路战斗后各一次），
//      单次上限管不住"被反复填充"的极端情形 ⇒ 给整场战斗一个总预算，超出就截断演出放行。
//   超时/超预算的处置都是：**清空升级队列、放行**（升级数值与效果早已入账，只截断演出，绝不冻结对局）。
//   ⚠️ 两点口径（2026-10-04 独立审查 #7 澄清，避免后人误读）：
//     · "放行" = **调用方**接着往下走；本函数**不碰 phase**。若调用链自己没能恢复 phase，
//       由 `useGameState` 的 animating 看门狗（限时 + 进展感知）兜底。
//     · 在 animating 路径上，那个 60s 看门狗通常**先于本预算**生效 ⇒ 预算是第二道保险，
//       不是"耐心"的主要来源。
//
// ⚠️ 调用方注意（本文件存在的主要理由）：
//   `useSpellSystem` 在本项目有**两个实例** —— useGameState 层完整传参；
//   GameSession 的 UI 层**只传 onComplete**，其余参数靠 `as` 强转绕过类型（全是 undefined）。
//   所以这里对三个回调**逐个判空**：参数不全就打印告警并**直接返回**（宁可不等待，也不能崩）。
// ==========================================

export interface LevelUpDrainDeps {
    /** 读当前升级挂起状态：`{ isPending, queueLen }`（必须读**实时**来源，如 stateRef.current.game） */
    readPending: () => { isPending: boolean; queueLen: number };
    /** 超时/超预算时清空升级队列（放行用） */
    clearLevelUp: () => void;
    /** 等待（毫秒） */
    wait: (ms: number) => Promise<void>;
    /** 调用点标识（进日志，便于排查"到底谁在等"） */
    tag: string;
    /** [可选] 累计预算（同一场战斗多次调用共享同一个对象） */
    budget?: { used: number; limit: number };
}

// [2026-10-04 莉莉子 · AI 停机保护性修复] 上限必须 ≥ 真实演出时长，否则**必然**截断：
//   ChampionLevelUp.tsx:116-118 记录的真实影片时长是 9.83s ~ 12.38s（里芙/安卡希雅 12.38s、
//   猫汐尔 10.11s、卜卜 9.83s、茉莉安 12.01s），另加 spin 入场 + burst 爆发展示。
//   原值 `max(20s, 队列×12s)`：两个英雄排队（≈29s 演出 > 24s 上限）就会稳定超时截断 ⇒
//   画面中途被撤、`onComplete` 永不触发、phase 停在 animating。
//   ⚠️ 后果**不是**"永久丢数据"（2026-10-04 独立审查 #5 更正）：那位英雄的 L2 替换确实没跑，
//      但它已被标记升级（useGameState.ts:1233），而升级扫描会在"已标记但仍是 Lv1 的天启者"
//      重新出现在备战席 / 交战区时把它重新入队 ⇒ 会自愈（手牌 / 牌库里的实例不在扫描范围）。
//      真正的代价是：一段时间内"升级标记与卡面数据不一致" + 玩家看不到那段演出。
//   现按 16s/英雄 + 40s 起步余量（正常演出不再被砍，兜底仍然存在）。
/** 单英雄 16s（≈12.4s 影片 + spin/burst），起步 40s */
const perCallLimit = (queueLen: number) => Math.max(40000, queueLen * 16000);

export const awaitLevelUpDrain = async (deps: LevelUpDrainDeps): Promise<void> => {
    // ── 判空防御：UI 层简版实例（只传 onComplete）会传进 undefined ⇒ 不能崩
    if (!deps
        || typeof deps.readPending !== 'function'
        || typeof deps.clearLevelUp !== 'function'
        || typeof deps.wait !== 'function') {
        console.warn(`[awaitLevelUpDrain] 参数不完整（调用点=${deps?.tag ?? '未知'}）→ 跳过等待（宁可不等待，也不崩）`);
        return;
    }

    const { readPending, clearLevelUp, wait, tag, budget } = deps;
    const first = readPending();
    if (!first.isPending) return; // 没人在升级 ⇒ 立刻放行（绝大多数情况走这里）

    const limit = perCallLimit(first.queueLen);
    let waited = 0;
    while (readPending().isPending) {
        if (waited >= limit) {
            console.warn(`[${tag}] ⏱️ 升级等待超时(${limit}ms)，强制清空升级队列放行，防止死锁`);
            clearLevelUp();
            break;
        }
        if (budget && budget.used >= budget.limit) {
            console.warn(`[${tag}] ⏱️ 本场战斗升级等待已达累计预算(${budget.limit}ms)，截断演出放行`);
            clearLevelUp();
            break;
        }
        await wait(200);
        waited += 200;
        if (budget) budget.used += 200;
    }
};

/**
 * 新建一份"本场战斗累计预算"（每次进入一场战斗时创建，跨路共享）。
 * [2026-10-04 莉莉子] 45s → 120s：升级是**逐英雄**播的（~15s/位），而本预算**整场战斗累计**、
 *   跨多次 drain 调用共享 ⇒ 一场里升级 3~4 次就会把合法演出算超支而截断。
 * [2026-10-04 独立审查 #7 澄清] 放宽预算**不等于**换来更多耐心：animating 路径上
 *   60s 进展看门狗会先动手（useGameState 的升级链分支）。本预算主要保护**法术结算路径**
 *   （useSpellSystem:1517 不传 budget ⇒ 那条路只受单次上限约束）。
 */
export const makeLevelUpDrainBudget = (limitMs = 120000): { used: number; limit: number } =>
    ({ used: 0, limit: limitMs });
