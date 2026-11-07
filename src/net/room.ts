/**
 * room.ts —— 超元链接 · 房间协议（主机权威）
 * ============================================================================
 * 这一层只做一件事：**让两个客户端在「同一个房间」里对齐状态**，并决定
 * 「谁先手、用什么卡组、什么时候开打」。它不认识卡牌效果，也不认识回合结算。
 *
 * 权威模型（甲案核心）：
 *   房主是唯一的**裁判**。它持有权威 `RoomState`，任何变更都广播给客方；
 *   客方只发**意图**（我要出石头 / 我要交这套卡组），由房主校验后应用。
 *   客方本地不做任何判断 —— 它显示的一定是房主那份真值。
 *
 * 为什么不在两端各跑一套（锁步）：
 *   粉丝的 MOD 用 5 个版本证明了这条路在这个游戏上不成立：大量状态变化
 *   **不经过玩家操作**（效果触发的抽牌、召唤、死亡结算、随机目标），
 *   两端各自发生必然越来越不一致。详见变更记录 v6。
 *
 * 只依赖 `Peer` 接口，不依赖 TCP —— 将来换成 WebRTC 打洞时本文件一行不用改。
 *
 * ⚠️ 客方发来的一切都是**不可信外部输入**：卡组要过 `validateDeckShape`，
 *    昵称/聊天要截断，状态转换要查合法性。房主不能因为对方乱发就崩。
 * ============================================================================
 */

import type { Peer, PeerMessage } from './transport-tcp';
// [2026-11-07 联机诊断] 房间层是「意图/快照」的交汇点：两边各打一条，就能看出是哪一侧没动。
import { nlog, nwarn } from './audit';

/** 房间协议版本。两端不一致就拒绝进房（避免用不同规则对局）。 */
export const ROOM_PROTO = 1;

/** 猜拳 / 选先后手阶段的兜底超时：卡住就退回大厅，不让双方干等。 */
const PHASE_TIMEOUT_MS = 90_000;

/** 昵称与聊天长度上限（防御对端乱发超长字符串）。 */
const MAX_NAME_LEN = 24;
const MAX_CHAT_LEN = 200;

// ══════════════════════════════════════════════════════════════════════════
// 类型
// ══════════════════════════════════════════════════════════════════════════

export type RoomPhase = 'lobby' | 'rps' | 'order' | 'battle' | 'ended';

export type RpsChoice = 'rock' | 'paper' | 'scissors';

export const RPS_LABEL: Record<RpsChoice, string> = {
    rock: '石头',
    paper: '布',
    scissors: '剪刀',
};

/** 客方提交的卡组。字段对齐 `SavedDeck`，但不带 id / 时间戳（对局用不上）。 */
export interface DeckPayload {
    name: string;
    hero: string;
    cards: Record<string, number>;
    cardBackIndex?: number;
    boardIndex?: number;
    skinOverrides?: Record<string, number>;
}

/** 房间内一名成员的公开信息（不含卡组内容）。 */
export interface RoomMemberInfo {
    id: string;
    name: string;
    role: 'host' | 'guest';
    /** 是否已提交卡组 */
    ready: boolean;
    deckName: string | null;
    /** 卡组张数，用于 UI 显示「已提交 40 张」 */
    deckSize: number;
    connected: boolean;
}

/** 房间配置。由房主决定，客方只读。 */
export interface RoomConfig {
    /** 首回合攻击限制。'off' = 不限制；'character' = 禁攻角色；'all' = 完全禁攻 */
    firstTurnAttack: 'off' | 'character' | 'all';
    /** 每回合时限（秒） */
    turnTimer: number;
}

/** 权威房间状态。主机维护，客方镜像。 */
export interface RoomState {
    proto: number;
    phase: RoomPhase;
    hostName: string;
    members: RoomMemberInfo[];
    config: RoomConfig;
    rps: {
        /** 已出拳的成员 id（只记「出过了」，不记出的是什么，防止偷看） */
        submitted: string[];
        round: number;
        winnerId: string | null;
        /** 上一轮是否平局（用于提示「平局，再来一局」） */
        draw: boolean;
    } | null;
    order: {
        firstAttackerId: string | null;
    } | null;
    battle: {
        seed: number;
        startedAt: number;
    } | null;
    /** 最近一次被拒绝的操作说明（给 UI 提示用，不参与逻辑） */
    lastNotice: string | null;
}

/** 开局指令：房主算好后一次性下发给客方。 */
export interface GameStartPayload {
    /** 房主视角的卡组（客方渲染对手信息用） */
    hostDeck: DeckPayload;
    /** 客方视角的卡组（客方建局用） */
    guestDeck: DeckPayload;
    /** 先手方：以**各自的本地视角**表达 —— 收到 'player' 就是「你」先手 */
    firstAttackerForGuest: 'player' | 'enemy';
    firstAttackerForHost: 'player' | 'enemy';
    seed: number;
    config: RoomConfig;
}

export type RoomEvent =
    | 'state'          // (state: RoomState)
    | 'started'        // (payload: GameStartPayload)
    | 'action'         // (action: unknown, fromId: string)
    | 'snapshot'       // (snapshot: unknown)
    | 'chat'           // (fromName: string, text: string)
    | 'notice'         // (text: string)
    | 'closed';        // (reason: string)

/** 房间对象。主机与客方共用同一套方法，非法操作在本地就被忽略。 */
export interface Room {
    readonly state: RoomState;
    readonly isHost: boolean;
    readonly myId: string;
    readonly myName: string;
    /** 注册事件监听，**返回取消订阅函数**（React 组件里务必在 cleanup 调用）。 */
    // 事件参数按事件名不同（state 带状态、chat 带两段文本），这里放宽为 any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: RoomEvent, cb: (...args: any[]) => void): () => void;
    /** 提交卡组（双方都可调） */
    submitDeck(deck: DeckPayload): void;
    /** 房主：开始猜拳 */
    startRps(): void;
    /** 出拳 */
    chooseRps(choice: RpsChoice): void;
    /** 猜拳赢家选先后手 */
    chooseOrder(order: 'first' | 'second'): void;
    /** 房主：确认开局 */
    startGame(): void;
    /** 房主：修改配置 */
    updateConfig(patch: Partial<RoomConfig>): void;
    sendChat(text: string): void;
    /** 对局操作（M2 用）：客方发给房主，房主广播给客方重放 */
    sendAction(action: unknown): void;
    /** 权威快照（M3 用）：只有房主能发 */
    sendSnapshot(snapshot: unknown): void;
    /**
     * 一局打完：把房间退回大厅，可以再来一局。
     *
     * 为什么需要它：`phase` 在 `doStartGame` 之后会一直停在 `'battle'`，
     * 而房间界面的操作区只在 `'lobby'` 渲染 ⇒ 打完一局回房间是个空界面，
     * 一个按钮都没有，只能双方退出重进。
     *
     * 只有房主能真正改状态；客方调这个方法什么都不做，等房主下发的新 state 覆盖。
     */
    finishBattle(): void;
    /** 离开房间 */
    leave(): void;
}

// ══════════════════════════════════════════════════════════════════════════
// 小工具
// ══════════════════════════════════════════════════════════════════════════

/** 极简事件总线。不用 Node 的 events，保证浏览器环境也能跑。 */
function makeEmitter() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = new Map<string, Array<(...args: any[]) => void>>();
    return {
        /** 注册监听，**返回取消订阅函数**（组件卸载时必须调用，否则会累积泄漏）。 */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        on(event: string, cb: (...args: any[]) => void): () => void {
            const list = map.get(event) ?? [];
            list.push(cb);
            map.set(event, list);
            return () => {
                const cur = map.get(event);
                if (!cur) return;
                const i = cur.indexOf(cb);
                if (i >= 0) cur.splice(i, 1);
            };
        },
        emit(event: string, ...args: unknown[]) {
            for (const cb of map.get(event) ?? []) {
                try {
                    (cb as (...a: unknown[]) => void)(...args);
                } catch { /* 单个监听器出错不能拖垮房间 */ }
            }
        },
        clear() { map.clear(); },
    };
}

/** 截断字符串并去掉首尾空白。 */
function clampText(text: unknown, max: number): string {
    if (typeof text !== 'string') return '';
    return text.trim().slice(0, max);
}

/** 猜拳判定：返回获胜者，平局返回 null。 */
function judgeRps(a: RpsChoice, b: RpsChoice): 'a' | 'b' | null {
    if (a === b) return null;
    const beats = (x: RpsChoice, y: RpsChoice) =>
        (x === 'rock' && y === 'scissors') ||
        (x === 'paper' && y === 'rock') ||
        (x === 'scissors' && y === 'paper');
    return beats(a, b) ? 'a' : 'b';
}

/**
 * 卡组业务校验的注入点：返回 `null` 表示通过，否则返回给玩家看的拒绝原因。
 *
 * 为什么做成注入、而不是直接 import `validateDeckShape`：
 *   那个函数依赖 `CARD_DB` → `cards.ts` → `imageData.ts`（200+ 个图片 import）。
 *   一旦引入，**网络层就再也无法脱离浏览器单独跑测试**，而且协议层被绑死在游戏数据上。
 *   协议层只该管「数据结构对不对」，「这副牌合不合规则」属于游戏层。
 *   游戏层接入时传 `(cards) => validateDeckShape(cards).ok ? null : ...message` 即可。
 */
export type DeckValidator = (cards: Record<string, number>) => string | null;

/** 默认校验：只做**结构性**兜底，防止对端塞进畸形数据把房主搞崩。 */
export const defaultDeckValidator: DeckValidator = (cards) => {
    const total = Object.values(cards).reduce((a, b) => a + b, 0);
    if (total < 1) return '卡组是空的';
    if (total > 200) return `卡组张数异常（${total} 张）`;
    return null;
};

/** 校验并规范化客方卡组。不合法返回错误说明。 */
function sanitizeDeck(
    raw: unknown,
    validator: DeckValidator,
): { ok: true; deck: DeckPayload } | { ok: false; reason: string } {
    if (!raw || typeof raw !== 'object') return { ok: false, reason: '卡组数据格式不正确' };
    const d = raw as Record<string, unknown>;

    const cards = d.cards;
    if (!cards || typeof cards !== 'object' || Array.isArray(cards)) {
        return { ok: false, reason: '卡组缺少卡牌构成' };
    }

    // 逐项收敛成合法数字，防止对端塞进 NaN / 负数 / 超大值
    const clean: Record<string, number> = {};
    for (const [key, value] of Object.entries(cards as Record<string, unknown>)) {
        if (typeof key !== 'string' || !key) continue;
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) continue;
        clean[key] = Math.min(99, Math.floor(n));
    }

    const reject = validator(clean);
    if (reject) return { ok: false, reason: reject };

    return {
        ok: true,
        deck: {
            name: clampText(d.name, MAX_NAME_LEN) || '未命名卡组',
            hero: clampText(d.hero, MAX_NAME_LEN),
            cards: clean,
            cardBackIndex: Number.isFinite(Number(d.cardBackIndex)) ? Number(d.cardBackIndex) : undefined,
            boardIndex: Number.isFinite(Number(d.boardIndex)) ? Number(d.boardIndex) : undefined,
            skinOverrides: (d.skinOverrides && typeof d.skinOverrides === 'object')
                ? d.skinOverrides as Record<string, number>
                : undefined,
        },
    };
}

/** 卡组张数（用于 UI 显示）。 */
function deckCount(deck: DeckPayload): number {
    return Object.values(deck.cards).reduce((a, b) => a + b, 0);
}

/** 初始房间状态。 */
function initialState(hostName: string, hostId: string): RoomState {
    return {
        proto: ROOM_PROTO,
        phase: 'lobby',
        hostName,
        members: [{
            id: hostId,
            name: hostName,
            role: 'host',
            ready: false,
            deckName: null,
            deckSize: 0,
            connected: true,
        }],
        config: { firstTurnAttack: 'off', turnTimer: 60 },
        rps: null,
        order: null,
        battle: null,
        lastNotice: null,
    };
}

// ══════════════════════════════════════════════════════════════════════════
// 主机侧
// ══════════════════════════════════════════════════════════════════════════

interface HostInternals {
    peer: Peer | null;
    state: RoomState;
    /** 双方卡组（不放进 RoomState —— 那是公开信息，卡组内容只在对局时下发） */
    decks: Map<string, DeckPayload>;
    /** 本轮猜拳的选择，收集齐才判定 */
    rpsChoices: Map<string, RpsChoice>;
    hostId: string;
    hostName: string;
    guestId: string | null;
    guestName: string;
    phaseTimer: ReturnType<typeof setTimeout> | null;
    /** 卡组业务校验（由游戏层注入；缺省只做结构兜底） */
    validateDeck: DeckValidator;
}

/**
 * 创建房主房间。**此时还没有客方**——客方通过 `attachGuest` 接进来。
 */
export function createHostRoom(
    opts: { hostName?: string; validateDeck?: DeckValidator } = {},
): HostRoom {
    const hostId = 'host';
    const hostName = clampText(opts.hostName, MAX_NAME_LEN) || '房主';
    const bus = makeEmitter();
    const internals: HostInternals = {
        peer: null,
        state: initialState(hostName, hostId),
        decks: new Map(),
        rpsChoices: new Map(),
        hostId,
        hostName,
        guestId: null,
        guestName: '',
        phaseTimer: null,
        validateDeck: opts.validateDeck ?? defaultDeckValidator,
    };

    return buildHostRoom(internals, bus);
}

/** 房主房间的额外能力：等客方接入。 */
export interface HostRoom extends Room {
    /** 把一个新连接接入房间。重复接入会被拒绝（只支持 2 人）。 */
    attachGuest(peer: Peer): boolean;
    /** 当前是否已有客方 */
    readonly hasGuest: boolean;
}

function buildHostRoom(internals: HostInternals, bus: ReturnType<typeof makeEmitter>): HostRoom {
    const { state } = internals;

    const findMember = (id: string) => state.members.find(m => m.id === id);
    const players = () => state.members.filter(m => m.connected);
    const readyPlayers = () => players().filter(m => m.ready);

    /** 广播权威状态给客方。 */
    const pushState = () => {
        internals.peer?.send({ t: 'state', state: serializeState(state) });
        bus.emit('state', state);
    };

    /** 通知一句给双方看（不进 state，纯提示）。 */
    const notice = (text: string, onlyLocal = false) => {
        state.lastNotice = text;
        bus.emit('notice', text);
        if (!onlyLocal) internals.peer?.send({ t: 'notice', text });
    };

    const clearPhaseTimer = () => {
        if (internals.phaseTimer) {
            clearTimeout(internals.phaseTimer);
            internals.phaseTimer = null;
        }
    };

    /** 猜拳/选先后手卡住时的兜底：退回大厅。 */
    const armPhaseTimer = () => {
        clearPhaseTimer();
        internals.phaseTimer = setTimeout(() => {
            if (state.phase === 'rps' || state.phase === 'order') {
                state.phase = 'lobby';
                state.rps = null;
                state.order = null;
                internals.rpsChoices.clear();
                notice('等待超时，已退回房间大厅');
                pushState();
            }
        }, PHASE_TIMEOUT_MS);
    };

    /** 客方掉线清理：**这一步不做，房间会永久卡死**（粉丝 MOD 踩过）。 */
    const dropGuest = (reason: string) => {
        if (!internals.guestId) return;
        // 摘掉的是**客方**席位。原来这里写的是 `internals.hostId`，等于把房主自己删掉 ——
        // 表现就是「对方掉线后，房主的席位跟着一起消失」。此处在 guestId 置空之前执行，
        // 所以直接用它是对的。
        state.members = state.members.filter(m => m.id !== internals.guestId);
        internals.decks.delete(internals.guestId);
        internals.rpsChoices.delete(internals.guestId);
        internals.guestId = null;
        internals.peer = null;
        nwarn('peer清空', { 原因: reason }); // [联机诊断] 客方席位已被摘掉，此后 sendSnapshot 全是空转

        // 正在猜拳/选先后手时人走了 → 全部重置，避免永远停在等待
        if (state.phase === 'rps' || state.phase === 'order') {
            state.phase = 'lobby';
            state.rps = null;
            state.order = null;
            clearPhaseTimer();
        }
        notice(reason, true);
        pushState();
    };

    /** 猜拳判定：两边都出过才结算。 */
    const resolveRps = () => {
        if (!state.rps || !internals.guestId) return;
        if (internals.rpsChoices.size < 2) return;

        const hostChoice = internals.rpsChoices.get(internals.hostId)!;
        const guestChoice = internals.rpsChoices.get(internals.guestId)!;
        const result = judgeRps(hostChoice, guestChoice);

        if (result === null) {
            state.rps.round += 1;
            state.rps.draw = true;
            state.rps.winnerId = null;
            state.rps.submitted = [];
            internals.rpsChoices.clear();
            notice('平局，再来一局');
            pushState();
            armPhaseTimer();
            return;
        }

        const winnerId = result === 'a' ? internals.hostId : internals.guestId;
        state.rps.winnerId = winnerId;
        state.rps.draw = false;
        state.rps.submitted = [internals.hostId, internals.guestId];
        state.phase = 'order';
        state.order = { firstAttackerId: null };

        const winnerName = findMember(winnerId)?.name ?? '对手';
        notice(`${winnerName} 赢了猜拳，正在选择先后手`);
        pushState();
        armPhaseTimer();
    };

    /** 开局：算好双方的视角，一次性下发。 */
    // [2026-11-07 精简流程] 去掉「猜拳 → 胜者选先后手」两道门：
    //   双方提交卡组 + ready ⇒ 直接开局，先手随机。
    //   保留对 'order' 的兼容分支（万一还有旧路径走到这里）。
    const doStartGame = (): void => {
        if (state.phase !== 'order' && state.phase !== 'lobby') {
            notice('现在还不能开局', true);
            return;
        }
        const hostDeck = internals.decks.get(internals.hostId);
        const guestDeck = internals.decks.get(internals.guestId ?? '');
        if (!hostDeck || !guestDeck) {
            notice('双方卡组还没交齐', true);
            return;
        }

        // 种子用 crypto 拿，拿不到退回 Math.random（只在开局用一次，不参与锁步）
        const seed = pickSeed();
        state.battle = { seed, startedAt: Date.now() };
        state.phase = 'battle';
        clearPhaseTimer();

        // [2026-11-07] 先手随机 —— 由房主算一次，通过 payload 下发给客方，两边结论一致
        const hostFirst = Math.random() < 0.5;

        const payload: GameStartPayload = {
            hostDeck,
            guestDeck,
            // 各自的本地视角：房主的「我方」= player，客方的「我方」也是 player
            firstAttackerForHost: hostFirst ? 'player' : 'enemy',
            firstAttackerForGuest: hostFirst ? 'enemy' : 'player',
            seed,
            config: state.config,
        };

        internals.peer?.send({ t: 'started', payload });
        bus.emit('started', payload);
        pushState();
    };

    /**
     * [2026-11-07 精简流程] 双方卡组齐了就自动开局 —— 玩家不用再点「开始游戏」。
     * 只在 lobby 阶段生效；其余阶段（battle / 已开局）直接跳过。
     */
    const tryAutoStart = (): void => {
        if (state.phase !== 'lobby') return;
        if (!internals.guestId) return;
        if (readyPlayers().length < 2) return;
        doStartGame();
    };

    const applyGuestMessage = (msg: PeerMessage) => {
        const t = msg.t;

        switch (t) {
            case 'hello': {
                const proto = Number(msg.proto);
                if (proto !== ROOM_PROTO) {
                    internals.peer?.send({
                        t: 'rejected',
                        reason: `版本不一致（对方 v${proto}，本机 v${ROOM_PROTO}），双方需要同一个游戏版本`,
                    });
                    setTimeout(() => internals.peer?.close('版本不一致'), 120);
                    return;
                }
                if (internals.guestId) {
                    // 已有客方还发 hello → 拒绝，避免造出幽灵席位
                    internals.peer?.send({ t: 'rejected', reason: '房间已满（本模式只支持 2 人）' });
                    return;
                }
                internals.guestId = 'guest';
                internals.guestName = clampText(msg.name, MAX_NAME_LEN) || '对手';
                state.members = [
                    findMember(internals.hostId)!,
                    {
                        id: 'guest',
                        name: internals.guestName,
                        role: 'guest',
                        ready: false,
                        deckName: null,
                        deckSize: 0,
                        connected: true,
                    },
                ];
                internals.peer?.send({ t: 'welcome', state: serializeState(state), you: 'guest' });
                notice(`${internals.guestName} 加入了房间`);
                pushState();
                return;
            }

            case 'deck': {
                if (!internals.guestId) return;
                const result = sanitizeDeck(msg.deck, internals.validateDeck);
                if (!result.ok) {
                    internals.peer?.send({ t: 'deckRejected', reason: result.reason });
                    return;
                }
                internals.decks.set(internals.guestId, result.deck);
                const guest = findMember(internals.guestId);
                if (guest) {
                    guest.ready = true;
                    guest.deckName = result.deck.name;
                    guest.deckSize = deckCount(result.deck);
                }
                internals.peer?.send({ t: 'deckAccepted', name: result.deck.name, size: deckCount(result.deck) });
                notice(`${internals.guestName} 提交了卡组`);
                pushState();
                // [2026-11-07] 双方卡组齐了就直接开，不用再点「开始游戏」
                tryAutoStart();
                return;
            }

            case 'rps': {
                if (state.phase !== 'rps' || !internals.guestId) {
                    internals.peer?.send({ t: 'notice', text: '现在不是猜拳阶段' });
                    return;
                }
                const choice = msg.choice;
                if (choice !== 'rock' && choice !== 'paper' && choice !== 'scissors') return;
                internals.rpsChoices.set(internals.guestId, choice);
                if (!state.rps) return;
                state.rps.submitted = [...internals.rpsChoices.keys()];
                pushState();
                resolveRps();
                return;
            }

            case 'order': {
                if (state.phase !== 'order' || !state.order) return;
                // 只有猜拳赢家能选
                if (state.rps?.winnerId !== internals.guestId) {
                    internals.peer?.send({ t: 'notice', text: '猜拳赢家才能选先后手' });
                    return;
                }
                const order = msg.order;
                if (order !== 'first' && order !== 'second') return;
                // 「先手」= 这一局由自己先动
                state.order.firstAttackerId = order === 'first' ? internals.guestId : internals.hostId;
                const firstId = state.order.firstAttackerId;
                const name = firstId ? (findMember(firstId)?.name ?? '') : '';
                notice(`先后手已确定：${name} 先手`);
                pushState();
                return;
            }

            case 'action': {
                // 对局操作由 M2 消费；这里只做身份标注后广播给上层
                if (state.phase !== 'battle' || !internals.guestId) {
                    // [联机诊断] 房主停在非 battle 阶段时，客方的意图会被**这里**丢掉（不是没送到）
                    nlog('room收到action(丢弃)', { phase: state.phase, hasGuest: !!internals.guestId });
                    return;
                }
                nlog('room收到action', { 操作: (msg.action as { op?: string })?.op, phase: state.phase }); // [联机诊断]
                bus.emit('action', msg.action, internals.guestId);
                return;
            }

            case 'chat': {
                const text = clampText(msg.text, MAX_CHAT_LEN);
                if (!text) return;
                bus.emit('chat', internals.guestName || '对手', text);
                return;
            }

            case 'bye': {
                dropGuest(`${internals.guestName} 离开了房间`);
                return;
            }

            default:
                return;
        }
    };

    const room: HostRoom = {
        get state() { return state; },
        isHost: true,
        myId: internals.hostId,
        myName: internals.hostName,
        get hasGuest() { return !!internals.guestId; },

        on(event, cb) { return bus.on(event, cb); },

        attachGuest(peer: Peer): boolean {
            // 判据是「有没有连接」，不是 guestId —— guestId 要等收到 hello 才赋值，
            // 用后者判断会让两个连接都挤进同一个席位。
            if (internals.peer) return false;
            internals.peer = peer;
            nlog('peer赋值', { hasPeer: !!internals.peer }); // [联机诊断] 房主侧唯一一处「拿到客方连接」
            peer.onMessage((msg) => applyGuestMessage(msg));
            peer.onClose((reason) => dropGuest(`与对手的连接断开了（${reason}）`));
            return true;
        },

        submitDeck(deck: DeckPayload) {
            const result = sanitizeDeck(deck, internals.validateDeck);
            if (!result.ok) {
                notice(result.reason, true);
                return;
            }
            internals.decks.set(internals.hostId, result.deck);
            const me = findMember(internals.hostId);
            if (me) {
                me.ready = true;
                me.deckName = result.deck.name;
                me.deckSize = deckCount(result.deck);
            }
            pushState();
            // [2026-11-07] 房主自己提交完，如果客方也交了，立刻开局
            tryAutoStart();
        },

        startRps() {
            // [2026-11-07 精简流程] 猜拳阶段已移除：直接开局（先手随机）。
            //   方法名保留，避免改动调用方。
            if (!internals.guestId) {
                notice('还没有对手加入', true);
                return;
            }
            if (readyPlayers().length < 2) {
                notice('双方都提交卡组后才能开始', true);
                return;
            }
            doStartGame();
        },

        chooseRps(choice: RpsChoice) {
            if (state.phase !== 'rps' || !state.rps) return;
            if (internals.rpsChoices.has(internals.hostId)) {
                notice('你已经出过拳了', true);
                return;
            }
            internals.rpsChoices.set(internals.hostId, choice);
            state.rps.submitted = [...internals.rpsChoices.keys()];
            pushState();
            resolveRps();
        },

        chooseOrder(order: 'first' | 'second') {
            if (state.phase !== 'order' || !state.order) return;
            if (state.rps?.winnerId !== internals.hostId) {
                notice('猜拳赢家才能选先后手', true);
                return;
            }
            state.order.firstAttackerId = order === 'first' ? internals.hostId : internals.guestId;
            const firstId = state.order.firstAttackerId;
            const name = firstId ? (findMember(firstId)?.name ?? '') : '';
            notice(`先后手已确定：${name} 先手`);
            pushState();
        },

        startGame() { doStartGame(); },

        /**
         * 一局打完：退回大厅，可以再来一局。
         * 只认「对局中」这一个入口 —— 重复调用、或还没开局就调用一律忽略，
         * 避免客方连点、或超时兜底已经把 phase 打回 lobby 之后再被误触发。
         */
        finishBattle() {
            if (state.phase !== 'battle') return;
            state.phase = 'lobby';
            state.rps = null;
            state.order = null;
            state.battle = null;
            internals.rpsChoices.clear();
            // 卡组仍留在 internals.decks、ready 保持 true
            // ⇒ 回大厅后「开始猜拳」直接可点，不必重新提交；
            //   想换牌的人点「重新提交」即可覆盖自己那一份。
            notice('本局结束，可以再来一局');
            pushState();
        },

        updateConfig(patch: Partial<RoomConfig>) {
            if (patch.firstTurnAttack === 'off' || patch.firstTurnAttack === 'character' || patch.firstTurnAttack === 'all') {
                state.config.firstTurnAttack = patch.firstTurnAttack;
            }
            if (typeof patch.turnTimer === 'number' && Number.isFinite(patch.turnTimer)) {
                state.config.turnTimer = Math.max(15, Math.min(300, Math.floor(patch.turnTimer)));
            }
            pushState();
        },

        sendChat(text: string) {
            const clean = clampText(text, MAX_CHAT_LEN);
            if (!clean) return;
            internals.peer?.send({ t: 'chat', text: clean });
            bus.emit('chat', internals.hostName, clean);
        },

        sendAction(action: unknown) {
            nlog('room.sendAction', { hasPeer: !!internals.peer, 操作: (action as { op?: string })?.op }); // [联机诊断]
            internals.peer?.send({ t: 'action', action });
        },

        sendSnapshot(snapshot: unknown) {
            nlog('room.sendSnapshot', { hasPeer: !!internals.peer, round: (snapshot as { round?: number })?.round }); // [联机诊断]
            internals.peer?.send({ t: 'snapshot', snapshot });
        },

        leave() {
            clearPhaseTimer();
            internals.peer?.send({ t: 'bye' });
            internals.peer?.close('房主关闭了房间');
            internals.peer = null;
            nwarn('peer清空', { 原因: '房主主动离开' }); // [联机诊断]
            internals.guestId = null;
            bus.emit('closed', '你关闭了房间');
            bus.clear();
        },
    };

    // 快照与动作：主机收到客方的快照请求时无需处理，客方只发意图
    return room;
}

/** 状态序列化：去掉对客方无意义的字段，避免把内部结构泄漏出去。 */
function serializeState(state: RoomState): RoomState {
    return {
        proto: state.proto,
        phase: state.phase,
        hostName: state.hostName,
        members: state.members.map(m => ({ ...m })),
        config: { ...state.config },
        rps: state.rps ? { ...state.rps, submitted: [...state.rps.submitted] } : null,
        order: state.order ? { ...state.order } : null,
        battle: state.battle ? { ...state.battle } : null,
        lastNotice: state.lastNotice,
    };
}

/** 开局种子。优先 crypto，拿不到退回 Math.random（只用于洗牌，不参与一致性校验）。 */
function pickSeed(): number {
    try {
        const c = (globalThis as unknown as { crypto?: { getRandomValues?: (a: Uint32Array) => void } }).crypto;
        if (c?.getRandomValues) {
            const buf = new Uint32Array(1);
            c.getRandomValues(buf);
            return buf[0] >>> 0;
        }
    } catch { /* 落到下面 */ }
    return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

// ══════════════════════════════════════════════════════════════════════════
// 客方
// ══════════════════════════════════════════════════════════════════════════

/**
 * 加入一个已存在的房间。返回的房间对象里，`state` 始终是**房主那份的镜像**。
 */
export function joinRoom(
    peer: Peer,
    opts: { name?: string; validateDeck?: DeckValidator } = {},
): Room {
    const myId = 'guest';
    const myName = clampText(opts.name, MAX_NAME_LEN) || '玩家';
    /** 客方的本地预检只做结构校验 —— 真正的业务校验在房主那边（权威） */
    const validator = opts.validateDeck ?? defaultDeckValidator;
    const bus = makeEmitter();

    // 客方初始状态：只知道自己在等人回话
    const state: RoomState = {
        proto: ROOM_PROTO,
        phase: 'lobby',
        hostName: '',
        members: [],
        config: { firstTurnAttack: 'off', turnTimer: 60 },
        rps: null,
        order: null,
        battle: null,
        lastNotice: null,
    };

    /** 用房主下发的状态整体覆盖本地（客方不做任何合并逻辑，避免出现第三种状态）。 */
    const applyState = (incoming: unknown) => {
        if (!incoming || typeof incoming !== 'object') return;
        const s = incoming as RoomState;
        if (!Array.isArray(s.members) || typeof s.phase !== 'string') return;
        state.proto = s.proto;
        state.phase = s.phase;
        state.hostName = s.hostName;
        state.members = s.members;
        state.config = s.config;
        state.rps = s.rps;
        state.order = s.order;
        state.battle = s.battle;
        state.lastNotice = s.lastNotice;
        bus.emit('state', state);
    };

    peer.onMessage((msg) => {
        switch (msg.t) {
            case 'welcome':
                applyState(msg.state);
                bus.emit('notice', '已进入房间');
                return;
            case 'state':
                applyState(msg.state);
                return;
            case 'started':
                bus.emit('started', msg.payload);
                return;
            case 'action':
                bus.emit('action', msg.action, 'host');
                return;
            case 'snapshot':
                nlog('room收到snapshot', { round: (msg.snapshot as { round?: number })?.round }); // [联机诊断]
                bus.emit('snapshot', msg.snapshot);
                return;
            case 'chat':
                bus.emit('chat', state.hostName || '房主', clampText(msg.text, MAX_CHAT_LEN));
                return;
            case 'notice':
                bus.emit('notice', clampText(msg.text, MAX_CHAT_LEN));
                return;
            case 'deckRejected':
                bus.emit('notice', `卡组被拒绝：${clampText(msg.reason, MAX_CHAT_LEN)}`);
                return;
            case 'deckAccepted':
                bus.emit('notice', `卡组已提交（${Number(msg.size) || 0} 张）`);
                return;
            case 'rejected':
                bus.emit('notice', clampText(msg.reason, MAX_CHAT_LEN));
                bus.emit('closed', clampText(msg.reason, MAX_CHAT_LEN));
                return;
            case 'bye':
                bus.emit('closed', '房主关闭了房间');
                return;
            default:
                return;
        }
    });

    peer.onClose((reason) => bus.emit('closed', `与房主的连接断开了（${reason}）`));

    // 进场先报到
    peer.send({ t: 'hello', proto: ROOM_PROTO, name: myName });

    return {
        get state() { return state; },
        isHost: false,
        myId,
        myName,
        on(event, cb) { return bus.on(event, cb); },

        submitDeck(deck: DeckPayload) {
            // 本地先自检一遍，省一次往返（房主还会再验一次，那才是权威）
            const result = sanitizeDeck(deck, validator);
            if (!result.ok) {
                bus.emit('notice', result.reason);
                return;
            }
            peer.send({ t: 'deck', deck: result.deck });
        },

        startRps() { /* 只有房主能开始 */ },
        chooseRps(choice: RpsChoice) {
            if (state.phase !== 'rps') return;
            peer.send({ t: 'rps', choice });
        },
        chooseOrder(order: 'first' | 'second') {
            if (state.phase !== 'order') return;
            peer.send({ t: 'order', order });
        },
        startGame() { /* 只有房主能开局 */ },
        finishBattle() { /* 只有房主能复位，客方等房主下发的 state 覆盖 */ },
        updateConfig() { /* 只有房主能改配置 */ },

        sendChat(text: string) {
            const clean = clampText(text, MAX_CHAT_LEN);
            if (!clean) return;
            peer.send({ t: 'chat', text: clean });
            bus.emit('chat', myName, clean);
        },

        sendAction(action: unknown) {
            // [联机诊断] 客方唯一出口：phase 不是 battle 时下面那行守卫会直接吞掉意图。
            nlog('room.sendAction(客方)', { hasPeer: !!peer, phase: state.phase, 操作: (action as { op?: string })?.op });
            if (state.phase !== 'battle') return;
            peer.send({ t: 'action', action });
        },

        sendSnapshot() { /* 客方没有权威，不能发快照 */ },

        leave() {
            peer.send({ t: 'bye' });
            peer.close('你离开了房间');
            bus.emit('closed', '你离开了房间');
            bus.clear();
        },
    };
}
