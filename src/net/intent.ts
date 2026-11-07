/**
 * intent.ts —— 超元链接 · 玩家意图（客方 → 主机的唯一输入通道）
 * ============================================================================
 * 主机权威模型下，客方**不执行任何游戏逻辑**：它只把「玩家想做什么」发出去，
 * 由房主的引擎执行，再把结果快照发回来。这个文件定义的就是「想做什么」。
 *
 * 为什么用 `cardKey` 而不是 `card.id`：
 *   每端建卡时 `id` 都是 `Math.random()` 现生成的（`useGameState.ts:59`），
 *   同一个单位在两端的 id 完全不同 ⇒ 跨端寻址只能用 `key`。
 *   粉丝 MOD 也是这么做的（`sbr-battle.js:5`：「卡牌实例 id 是随机的，
 *   因此一律用卡牌 key + 阵营寻址」）。
 *
 * ⚠️ 同名卡（如 3 张里芙）用 key 无法区分，但它们**数据完全相同**，
 *    操作哪一张效果等价。PVP 标准模式下没有装备差异，这个简化成立。
 *    （若将来 PVP 引入单卡强化，需要改成「key + 同 key 内的序号」。）
 *
 * ⚠️ 客方发来的一切都是**不可信外部输入**：主机必须过 `isValidIntent`，
 *    并且还要在引擎侧再校验一次（回合归属、费用、目标合法性）。
 * ============================================================================
 */

/**
 * 目标引用 —— **跨端可寻址**的目标描述。
 *
 * 为什么不能直接用引擎里的 `{ type, id }`：
 *   `id` 是每端建卡时 `Math.random()` 现生成的（`useGameState.ts:60` / `cards.ts:2547`），
 *   两端必然不同。直发 `id` ⇒ 房主拿到的是什么也匹配不上的数字。
 *   所以这里一律用 `cardKey`；同名卡用 `index` 消歧（与 `toggleAttacker` / `assignBlocker`
 *   既有做法一致 —— PVP 标准模式没有单卡强化，同名卡等价）。
 *
 * `side` 的语义是**施法方视角**：`'self'` = 施法方自己的单位/水晶，`'opponent'` = 对手的。
 * 房主解析时按「客方 = 自己引擎的 enemy 侧」映射，最终拼出的 `{ type, id }`
 * 与房主**自己点同一个目标**时逐字一致 ⇒ 引擎行为必然相同。
 */
export type TargetRef =
    /** 场上的单位（含手牌：房主解析时会 bench → combatField → hand 依次找） */
    | { kind: 'unit'; side: 'self' | 'opponent'; cardKey: string; index?: number }
    /** 水晶 */
    | { kind: 'nexus'; side: 'self' | 'opponent' }
    /** 法术堆叠里的法术（反制/无效化目标） */
    | { kind: 'stack'; cardKey: string; index?: number };

/** 玩家能发起的操作。引擎内部流程（抽牌/结算/升级）**不在其中**。 */
export type PlayerIntent =
    /** 从手牌打出（单位或法术） */
    | { op: 'playCard'; cardKey: string }
    /** 打出需要选目标的法术（进入瞄准阶段） */
    | { op: 'startSpell'; cardKey: string }
    /** 选/取消进攻单位 */
    | { op: 'toggleAttacker'; cardKey: string; on: boolean }
    /** 选格挡者 */
    | { op: 'selectBlocker'; cardKey: string }
    /** 指派格挡者：把本侧某个单位派去挡第 fightIndex 条战线 */
    | { op: 'assignBlocker'; fightIndex: number; cardKey: string }
    /** 让过（结束本回合行动） */
    | { op: 'passTurn' }
    /**
     * 进入**进攻宣告阶段**（点「进攻」按钮 / 拖单位上场前的那个入口）。
     * ⚠️ 与 `commitAttack` 是两件事：
     *   · `initiateAttack` = `main` → `attack_declare`（还没选进攻单位）
     *   · `commitAttack`   = `attack_declare` → `block_declare`（宣告完毕）
     *   客方点「进攻」按钮时房主引擎里的阶段仍停在 main，`commitAttack` 会被
     *   引擎守卫（phase !== 'attack_declare'）弹掉 ⇒ 客方**永远进不了进攻宣告**。
     */
    | { op: 'initiateAttack' }
    /** 提交进攻（宣告完毕，进入格挡阶段） */
    | { op: 'commitAttack' }
    /** 确认格挡方案 */
    | { op: 'confirmBlock' }
    /** 结算法术堆叠 */
    | { op: 'resolveStack' }
    /** 撤回进攻宣言 */
    | { op: 'cancelAttack' }
    /** 换牌完成（indices 为空 = 不换牌，等价于放弃） */
    | { op: 'mulliganDone'; indices: number[] }
    /** 抉择类法术选中某一项 */
    | { op: 'confirmChoice'; choiceKey: string }
    /** 取消抉择 */
    | { op: 'cancelChoice' }
    /** 确认待提交法术 */
    | { op: 'confirmPendingSpell' }
    /** 取消待提交法术 */
    | { op: 'cancelPendingSpell' }
    /**
     * 投降（认输）。
     * [2026-11-07 超元链接] 此前客方投降是**纯本地行为**（`App.tsx` 的 `surrenderSignal`
     *   → `GameSession` 清 `playerNexus`），而客方 `authoritative:false` 时引擎不推进胜负，
     *   房主完全收不到任何信号 ⇒ "客方投了、房主没赢、快照还把水晶回填回来"。
     *   现在改为上报意图，由房主清掉**客方那侧**（= 房主引擎里的 `enemy`）的水晶。
     */
    | { op: 'surrender' }
    /**
     * 提交「选好的目标」——这是需要选目标的卡（法术 / 带目标战吼）**唯一缺失的那一环**。
     *
     * [2026-11-07 超元链接] 此前客方点目标走的是本地 `spellSystem.handleTargetClick`，
     *   选满后 `onComplete → actions.finalizeSpell(card, 'player', targets)`：
     *     · 不发意图 ⇒ 房主永远不知道该打谁
     *     · owner 写死 'player' ⇒ 即使本地跑也只是自娱自乐，随后被快照抹掉
     *   于是「客方施法 = 双向卡死」。本 op 就是补这条通道。
     *
     * 顺序敏感：`targets` 必须按 `targetRequirements` 的**选取顺序**排列（多步骤法术靠位置对应）。
     */
    | { op: 'castSpellAt'; spellCardKey: string; targets: TargetRef[] }
    /**
     * 挑战：把**对手备战席**的一个单位强行拉上战线（【挑战者】/【暴露】机制）。
     *
     * [2026-11-08 超元链接 · 挑战者失效] 病根：客方点「拉取」走的是本地
     *   `actions.challengeEnemy(...)`，**完全不上报**（`GameSession.tsx` 的
     *   `handleEnemyBenchCardClick`）。于是房主引擎的 `combatField` 里那条战线
     *   从未被挑战过 ⇒ 客方一提交进攻，房主按"没有挑战目标"的正常逻辑收掉战线
     *   ⇒ 玩家看到的就是「单位被撤回」。
     *
     * 寻址用 key（id 两端不同，见本文件头注释）：
     *   · `attackerKey` = 己方（客方）已上阵的攻击者
     *   · `targetKey`   = 想拉的**对手**备战席单位
     * 房主侧解析成 `act.aiChallengeUnit(attackerId, playerUnitId)` —— 那个函数
     * 正是「enemy 侧攻击者 + player 侧目标」的语义，与客方视角严格对称。
     */
    | { op: 'challengeEnemy'; attackerKey: string; targetKey: string };

/** 所有合法的 op，用于主机侧快速过滤。 */
const VALID_OPS = new Set<PlayerIntent['op']>([
    'playCard', 'startSpell', 'toggleAttacker', 'selectBlocker', 'assignBlocker',
    'passTurn', 'commitAttack', 'confirmBlock', 'resolveStack',
    'cancelAttack', 'mulliganDone', 'confirmChoice', 'cancelChoice',
    'confirmPendingSpell', 'cancelPendingSpell', 'initiateAttack', 'surrender', 'castSpellAt',
    'challengeEnemy',
]);

/** 需要携带 cardKey 的操作。 */
const NEEDS_CARD_KEY = new Set<PlayerIntent['op']>([
    'playCard', 'startSpell', 'toggleAttacker', 'selectBlocker', 'assignBlocker',
]);

/** 需要携带 choiceKey 的操作。 */
const NEEDS_CHOICE_KEY = new Set<PlayerIntent['op']>(['confirmChoice']);

/** 需要携带 indices（手牌下标数组）的操作。 */
const NEEDS_INDICES = new Set<PlayerIntent['op']>(['mulliganDone']);

/** 单个字符串字段的长度上限（防对端塞超长字符串）。 */
const MAX_KEY_LEN = 128;

/** 手牌下标数组的长度上限（起手最多 4 张，留足余量；超出必是对端伪造）。 */
const MAX_INDICES_LEN = 16;

/** 一次法术最多携带多少个目标引用（卡面最多两三步，8 已远超实际）。 */
const MAX_TARGETS_LEN = 8;

/**
 * 校验一条从网络来的意图。
 * 返回 `null` 表示合法；否则返回拒绝原因（可直接用于日志/提示）。
 */
export function validateIntent(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '意图格式不正确';
    const obj = raw as Record<string, unknown>;

    const op = obj.op;
    if (typeof op !== 'string' || !VALID_OPS.has(op as PlayerIntent['op'])) {
        return `未知的操作类型：${String(op)}`;
    }

    if (NEEDS_CARD_KEY.has(op as PlayerIntent['op'])) {
        const k = obj.cardKey;
        if (typeof k !== 'string' || !k || k.length > MAX_KEY_LEN) {
            return `操作 ${op} 缺少合法的 cardKey`;
        }
    }

    if (NEEDS_CHOICE_KEY.has(op as PlayerIntent['op'])) {
        const k = obj.choiceKey;
        if (typeof k !== 'string' || !k || k.length > MAX_KEY_LEN) {
            return `操作 ${op} 缺少合法的 choiceKey`;
        }
    }

    if (op === 'toggleAttacker' && typeof obj.on !== 'boolean') {
        return 'toggleAttacker 缺少 on 参数';
    }

    // assignBlocker：战线下标必须是非负整数（这条战线是否真的存在，交给引擎自己把关）
    if (op === 'assignBlocker') {
        const fi = obj.fightIndex;
        if (typeof fi !== 'number' || !Number.isInteger(fi) || fi < 0) {
            return 'assignBlocker 缺少合法的 fightIndex';
        }
    }

    if (NEEDS_INDICES.has(op as PlayerIntent['op'])) {
        const idx = obj.indices;
        if (!Array.isArray(idx)) return `操作 ${op} 缺少合法的 indices`;
        if (idx.length > MAX_INDICES_LEN) return `操作 ${op} 的 indices 过长`;
        for (const n of idx) {
            if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
                return `操作 ${op} 的 indices 含非法的下标`;
            }
        }
    }

    // castSpellAt：携带「哪张法术 + 选了哪些目标」，目标一律 key 寻址
    if (op === 'castSpellAt') {
        const sk = obj.spellCardKey;
        if (typeof sk !== 'string' || !sk || sk.length > MAX_KEY_LEN) {
            return 'castSpellAt 缺少合法的 spellCardKey';
        }
        const ts = obj.targets;
        if (!Array.isArray(ts) || ts.length > MAX_TARGETS_LEN) {
            return 'castSpellAt 的 targets 不合法';
        }
        for (const t of ts) {
            if (!t || typeof t !== 'object' || Array.isArray(t)) return 'castSpellAt 的某个目标格式不正确';
            const tt = t as Record<string, unknown>;
            const kind = tt.kind;
            if (kind !== 'unit' && kind !== 'nexus' && kind !== 'stack') {
                return 'castSpellAt 的目标 kind 非法';
            }
            if (kind === 'nexus') {
                if (tt.side !== 'self' && tt.side !== 'opponent') return 'castSpellAt 的水晶目标 side 非法';
            } else {
                const ck = tt.cardKey;
                if (typeof ck !== 'string' || !ck || ck.length > MAX_KEY_LEN) {
                    return 'castSpellAt 的目标缺少合法的 cardKey';
                }
                if (kind === 'unit' && tt.side !== 'self' && tt.side !== 'opponent') {
                    return 'castSpellAt 的单位目标 side 非法';
                }
                if (tt.index !== undefined) {
                    const i = tt.index;
                    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0) return 'castSpellAt 的目标 index 非法';
                }
            }
        }
    }

    // challengeEnemy：两个 key 都必须合法（战线/目标是否真的存在交给引擎把关）
    if (op === 'challengeEnemy') {
        const ak = obj.attackerKey;
        const tk = obj.targetKey;
        if (typeof ak !== 'string' || !ak || ak.length > MAX_KEY_LEN) {
            return 'challengeEnemy 缺少合法的 attackerKey';
        }
        if (typeof tk !== 'string' || !tk || tk.length > MAX_KEY_LEN) {
            return 'challengeEnemy 缺少合法的 targetKey';
        }
    }

    return null;
}

/** 把任意对象收敛成一条合法意图；不合法返回 null。 */
export function normalizeIntent(raw: unknown): PlayerIntent | null {
    return validateIntent(raw) === null ? (raw as PlayerIntent) : null;
}

/** 给日志/调试用的简短描述。 */
export function describeIntent(intent: PlayerIntent): string {
    switch (intent.op) {
        case 'playCard': return `出牌 ${intent.cardKey}`;
        case 'startSpell': return `施法 ${intent.cardKey}`;
        case 'toggleAttacker': return `${intent.on ? '选中' : '取消'}进攻单位 ${intent.cardKey}`;
        case 'selectBlocker': return `选择格挡者 ${intent.cardKey}`;
        case 'assignBlocker': return `指派格挡者 ${intent.cardKey} → 战线 ${intent.fightIndex}`;
        case 'initiateAttack': return '进入进攻宣告';
        case 'surrender': return '投降';
        case 'castSpellAt': return `提交法术目标 ${intent.spellCardKey}（${intent.targets.length} 个）`;
        case 'challengeEnemy': return `挑战拉取 ${intent.targetKey}（攻击者 ${intent.attackerKey}）`;
        case 'confirmChoice': return `抉择 ${intent.choiceKey}`;
        case 'mulliganDone': return `换牌完成（换 ${intent.indices.length} 张）`;
        default: return intent.op;
    }
}

// ══════════════════════════════════════════════════════════════════════════
// 游戏内使用的通道接口
// ══════════════════════════════════════════════════════════════════════════

/**
 * 战斗组件需要知道的全部联机信息。
 *
 * 设计成「两个字段」而不是把整个网络对象塞进来，是为了让 `GameSession`
 * 对网络层零依赖 —— 它不知道 TCP、不知道房间，只知道「要不要本地执行」
 * 和「怎么上报」。
 */
export interface NetIntentChannel {
    /**
     * 本地是否为权威（房主）。
     *   · `true`  —— 操作照常本地执行（结果由快照同步给客方）
     *   · `false` —— 客方：只上报，**不执行**，等房主算完把状态发回来
     */
    authoritative: boolean;
    /** 上报一条玩家意图。主机侧通常是空实现（它自己就是权威）。 */
    emit: (intent: PlayerIntent) => void;
    /**
     * **仅主机**：订阅客方发来的意图。客方不传。
     *
     * 主机收到后会在自己引擎的 `enemy` 侧执行 —— 因为对主机的引擎来说，
     * 客方就是 `enemy`。执行前仍会过一遍引擎自身的合法性校验
     * （回合归属、费用、目标），所以客方伪造意图也做不了非法操作。
     */
    subscribeRemote?: (cb: (intent: PlayerIntent) => void) => () => void;
    /**
     * **仅主机**：把当前权威状态发布出去（客方不传）。
     * 由战斗组件在 `game` 变化时调用，内部应当做防抖/节流。
     */
    publish?: (snapshot: unknown) => void;
}
