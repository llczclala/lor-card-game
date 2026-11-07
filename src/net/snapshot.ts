/**
 * snapshot.ts —— 超元链接 · 权威状态快照（视角翻转 + 隐藏信息裁剪）
 * ============================================================================
 * 主机是唯一真引擎，客方不跑逻辑。所以客方要看到的一切都来自这里。
 *
 * 这一层解决两个问题，而且**必须一起解决**：
 *
 *   ① **视角**：主机的 `playerXxx` 是「房主自己」，客方要看到的是「自己」。
 *      粉丝 MOD 的做法是「主机发自己视角 → 客户端整体 swap」，v10 就漏翻了
 *      14 组阵营字段，导致「复活/亡语/护盾判定全反」。
 *      这里改成**程序化翻转**，靠三条通用规则自动覆盖，不靠人肉列举：
 *        · 顶层 `playerXxx` ↔ `enemyXxx` 成对调换
 *        · 任何形如 `{ player, enemy }` 的嵌套对象整体调换
 *        · 任何白名单字段名（owner / target / casterSide / choiceOwner / side）
 *          在**深度遍历**中把 `'player'` ↔ `'enemy'` 对调
 *      ⇒ 新增字段只要遵守命名约定，**不需要改这里**。
 *
 *   ② **隐藏信息**：`enemyHand`（对手手牌）和双方 `*Deck`（牌库顺序）
 *      在真实对局里是不可见的。全量下发 = 把牌序白送给对方。
 *      MOD 是明文全发（v10 只修了「大厅阶段不下发完整卡组」），
 *      所以它只能给朋友局用。这里按接收者视角裁剪：
 *        · 自己的手牌：完整
 *        · 对手手牌：只保留**数量**（内容抹成占位）
 *        · 双方牌库：只保留**数量**
 * ============================================================================
 */

import type { GameState } from '../types';
// [2026-11-07 联机诊断] 投影层出口：入/出各一条，能分辨「房主投影抛错」与「投影后 round 没变」。
import { nlog } from './audit';

/** 不在配对命名约定里的阵营字段（历史上命名不统一，只能手工列）。 */
const IRREGULAR_PAIRS: Array<[string, string]> = [
    ['friendlyUnitDeaths', 'enemyUnitDeaths'],
    // [超元链接] 迷宫强化：玩家侧叫 `rogueEnhancements`（不以 `player` 开头），
    //   规则 1 的 `player*` ↔ `enemy*` 配不上 ⇒ 手工登记，否则客方会看到房主的强化列表。
    ['rogueEnhancements', 'enemyEnhancements'],
];

/**
 * 值本身就是阵营名的字段。深度遍历时遇到这些 key，
 * 把 `'player'` ↔ `'enemy'` 对调。
 *
 * ⚠️ 卡牌对象内部的 `owner` 也在其中 —— 那是**正确的**：
 *    客方视角下，原来属于主机的卡就应该变成"对手的卡"。
 */
const SIDE_VALUE_KEYS = new Set([
    'owner',
    'target',
    'casterSide',
    'choiceOwner',
    'side',
    'turnOwner',
]);

/**
 * [2026-11-07 超元链接] 值需要「对手视角互换」的字段 —— 这些不是阵营名，而是**胜负语义**。
 *
 * 病根：`gameResult` 走 `...game` 原样进快照，而它既不在配对翻转表、也不在 `SIDE_VALUE_KEYS` 里
 * ⇒ 房主的 `defeat` 原封不动传给客方 ⇒ **双方结算界面都显示「失败」**（实测复现）。
 */
const MIRRORED_VALUE_MAPS: Record<string, Record<string, string>> = {
    // 胜 ↔ 负 互换；`null`（进行中）与平局不映射，原样保留
    gameResult: { victory: 'defeat', defeat: 'victory' },
};

/** 隐藏信息的占位卡。保留形状，抹掉内容。 */
const HIDDEN_CARD = {
    id: '__hidden__',
    key: '__hidden__',
    name: '未知',
    type: 'unit',
    cost: 0,
    power: 0,
    health: 0,
    rarity: 'common',
    hidden: true,
} as unknown as Record<string, unknown>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

function flipSideValue(v: unknown): unknown {
    if (v === 'player') return 'enemy';
    if (v === 'enemy') return 'player';
    return v;
}

/**
 * 深度遍历，把所有「阵营语义字段」的值对调。
 * @param key 当前值所属的字段名（null 表示数组元素 / 根）
 */
function deepFlip(value: unknown, key: string | null): unknown {
    if (Array.isArray(value)) {
        return value.map(item => deepFlip(item, null));
    }
    if (!isPlainObject(value)) {
        // 叶子：先处理「胜负语义互换」的字段，再处理阵营名翻转
        if (key && MIRRORED_VALUE_MAPS[key] && typeof value === 'string') {
            const mapped = MIRRORED_VALUE_MAPS[key][value];
            if (mapped) return mapped;
        }
        // 只有字段名在白名单里、且值确实是阵营名时才翻转
        if (key && SIDE_VALUE_KEYS.has(key)) return flipSideValue(value);
        return value;
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
        out[k] = deepFlip(v, k);
    }
    return out;
}

/**
 * 生成「对方视角」的状态。
 *
 * 幂等性保证：`flip(flip(s))` 与原状态**逐字段相等**（自测里会验）。
 * 这条性质能抓到绝大部分遗漏 —— 漏翻一个配对字段，翻转两次就对不上。
 */
export function flipSide(state: GameState): GameState {
    const src = state as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    // ── 规则 1：顶层 playerXxx ↔ enemyXxx ──────────────────────────────
    const playerKeys = Object.keys(src).filter(k => k.startsWith('player'));
    for (const pk of playerKeys) {
        const ek = 'enemy' + pk.slice('player'.length);
        if (ek in src) {
            out[pk] = src[ek];
            out[ek] = src[pk];
        }
    }
    // ── 规则 1b：命名不统一的配对（friendlyUnitDeaths ↔ enemyUnitDeaths）
    for (const [a, b] of IRREGULAR_PAIRS) {
        if (a in src && b in src) {
            out[a] = src[b];
            out[b] = src[a];
        }
    }

    // ── 其余字段 ───────────────────────────────────────────────────────
    for (const [k, v] of Object.entries(src)) {
        if (k in out) continue; // 已被配对规则处理

        // 规则 2：形如 { player, enemy } 的嵌套对象整体调换
        if (isPlainObject(v) && 'player' in v && 'enemy' in v) {
            out[k] = deepFlip({ ...v, player: v.enemy, enemy: v.player }, null);
            continue;
        }

        // 规则 3：深度遍历，翻转阵营语义字段
        out[k] = deepFlip(v, k);
    }

    return out as unknown as GameState;
}

/** 把一批卡抹成占位（保留张数）。 */
function redactCards(cards: unknown): unknown {
    if (!Array.isArray(cards)) return cards;
    // [2026-11-07 超元链接 · React key 冲突] 原来每张脱敏牌都用同一个 `HIDDEN_CARD`，
    //   `id` 全是 `__hidden__` ⇒ 10 张敌方手牌 = 10 个相同 key ⇒ React 每次都报
    //   "Encountered two children with the same key, __hidden__"，并在大量重渲染时把主线程拖死。
    //   给 id 加索引保证唯一；`key` 仍固定为 `__hidden__`（`key` 是卡牌内容标识，不能暴露真值）。
    return cards.map((_, i) => ({ ...HIDDEN_CARD, id: `__hidden_${i}__` }));
}

/**
 * 按接收者视角裁剪隐藏信息。**必须在 `flipSide` 之后调用** ——
 * 这样规则永远是「裁掉 enemyHand + 双方牌库」，不需要关心谁是主机。
 *
 * 裁剪后：
 *   · `playerHand` 张数不变、内容完整（这是接收者自己的手牌）
 *   · `enemyHand` 张数不变、内容为占位
 *   · `playerDeck` / `enemyDeck` 张数不变、内容为占位
 *
 * 为什么牌库连自己的也要裁：真实对局里玩家看不到自己的牌序，
 * 客方若能读到自己的牌库顺序，就等于提前知道接下来抽什么。
 */
export function redactForViewer(state: GameState): GameState {
    const out = { ...(state as unknown as Record<string, unknown>) };
    out.enemyHand = redactCards(out.enemyHand);
    out.playerDeck = redactCards(out.playerDeck);
    out.enemyDeck = redactCards(out.enemyDeck);
    // 坟场是公开信息（双方都能看到死了什么），不裁
    return out as unknown as GameState;
}

/**
 * 主机侧一站式：把「主机视角的状态」变成「发给客方的状态」。
 * 顺序不能反 —— 先翻转再裁剪，裁剪规则才是视角无关的。
 */
export function toGuestView(hostState: GameState): GameState {
    // [联机诊断] 入参原样取值（不解引用嵌套对象：投影的对象图里有手牌/牌库，读一下就行，别碰 undefined）
    nlog('toGuestView入', { round: hostState?.round, turnOwner: hostState?.turnOwner });
    const out = redactForViewer(flipSide(hostState));
    // [联机诊断] 出口：入和出必须成对出现 —— 只有入没有出 ⇒ 投影过程里抛了。
    nlog('toGuestView出', { round: out?.round, turnOwner: out?.turnOwner });
    return out;
}

// ══════════════════════════════════════════════════════════════════════════
// 自检：翻转幂等性
// ══════════════════════════════════════════════════════════════════════════

/**
 * 比对两份状态是否逐字段相等（只比数据，不比引用）。
 * 用于 `flip(flip(s)) === s` 的自检。
 */
export function statesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((v, i) => statesEqual(v, b[i]));
    }
    if (isPlainObject(a) && isPlainObject(b)) {
        const ka = Object.keys(a);
        const kb = Object.keys(b);
        if (ka.length !== kb.length) return false;
        return ka.every(k => statesEqual(a[k], b[k]));
    }
    return false;
}

/**
 * 找出翻转两次后仍然对不上的字段路径。
 * 空数组 = 幂等性成立。
 *
 * 用法：开发期在主机侧跑一次，任何新增的阵营字段若命名不合约定，这里会报出来。
 */
export function findFlipMismatches(state: GameState): string[] {
    const twice = flipSide(flipSide(state));
    const original = state as unknown as Record<string, unknown>;
    const after = twice as unknown as Record<string, unknown>;
    const diffs: string[] = [];

    const walk = (a: unknown, b: unknown, path: string) => {
        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) { diffs.push(`${path}（长度 ${a.length} vs ${b.length}）`); return; }
            for (let i = 0; i < a.length; i++) walk(a[i], b[i], `${path}[${i}]`);
            return;
        }
        if (isPlainObject(a) && isPlainObject(b)) {
            const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
            for (const k of keys) walk(a[k], b[k], path ? `${path}.${k}` : k);
            return;
        }
        if (!statesEqual(a, b)) diffs.push(path || '(根)');
    };

    walk(original, after, '');
    return diffs;
}
