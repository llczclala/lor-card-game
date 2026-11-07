import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// [2026-11-07 精简流程] 猜拳/选先后手已移除 ⇒ `Play`（原「进入对决」按钮）、`Wifi`（原「等待对方连接」）不再使用
// import { ArrowLeft, Copy, DoorOpen, Play, Swords, Users, Wifi } from 'lucide-react';
import { ArrowLeft, Copy, DoorOpen, Swords, Users } from 'lucide-react';
import { eventBus, GameEvents } from '../../utils/eventBus';
// [2026-11-07 精简流程] 连接码直连通道已移除 ⇒ 只留 ref 类型；`startHost` / `connectTo` 不再调用
// import { startHost, connectTo, type HostServer, type Peer } from '../../net/transport-tcp';
import { type HostServer, type Peer } from '../../net/transport-tcp';
// [2026-11-07 精简流程] 信令服务器通道已移除 ⇒ 只留手动交换（createManual*）与 ref 类型
// import { hostViaIce, joinViaIce, type IceHostSession, createManualHost, createManualGuest, type ManualHostSession, type ManualGuestSession } from '../../net/transport-ice';
import { type IceHostSession, createManualHost, createManualGuest, type ManualHostSession, type ManualGuestSession } from '../../net/transport-ice';
// [2026-11-07 精简流程] 信令地址读写随「信令服务器」入口一并停用
// import {
//     normalizeSignalingUrl, loadSignalingUrl, saveSignalingUrl, isRoomCode,
// } from '../../net/signaling';
import {
    createHostRoom, joinRoom,
    // RPS_LABEL, // [2026-11-07 精简流程] 猜拳块已移除
    type Room, type HostRoom, type RoomState,
    // type RpsChoice, // [2026-11-07 精简流程] 猜拳块已移除
    type GameStartPayload,
} from '../../net/room';
// [2026-11-07 精简流程] 连接码编解码随「连接码直连」入口一并停用
// import { encodeCode, decodeCode, looksLikeCode, CodeError } from '../../net/code';
// [2026-11-07 精简流程] 本机网络自检随「连接码直连」入口一并停用
// import { describeEnvironment, listConnectCandidates } from '../../net/addresses';

// ══════════════════════════════════════════════════════════════════════════
// 🎛️ 超元链接 · 房间界面 视觉调参区
// ══════════════════════════════════════════════════════════════════════════
// ⚠️ 本屏跑在 `ScaleWrapper` 的 1680×1050 画布内 ⇒ **禁 vh/vw**，一律绝对 px。
const ROOM_UI = {
    panelWidth: 1080,
    panelMinHeight: 640,
    panelPad: 40,
    panelRadius: 20,
    titleFontSize: 40,
    subtitleFontSize: 15,
    sectionTitleFontSize: 18,
    bodyFontSize: 15,
    smallFontSize: 13,
    codeFontSize: 17,
    buttonFontSize: 17,
    buttonPadX: 26,
    buttonPadY: 13,
    seatSize: 200,
    seatGap: 48,
    chatHeight: 150,
    gapL: 24,
    gapM: 16,
    gapS: 10,
};

/** 玩家卡组的最小形状（对齐 SavedDeck，但不要求 id/时间戳）。 */
export interface RoomDeckPayload {
    name: string;
    hero: string;
    cards: Record<string, number>;
    cardBackIndex?: number;
    boardIndex?: number;
    skinOverrides?: Record<string, number>;
}

interface OnlineRoomScreenProps {
    onBack: () => void;
    /** 双方就位、先后手已定 —— 交给 App 去渲染对局 */
    onStartBattle: (payload: {
        room: Room;
        myDeck: string[];
        opponentDeck: string[];
        firstAttacker: 'player' | 'enemy';
    }) => void;
    /** 玩家昵称 */
    playerName: string;
    /** 我的卡组（当前编队） */
    activeDeck: RoomDeckPayload | null;
    /**
     * 进入对局时由 App 置 true：**只隐藏、不卸载**。
     *
     * 为什么不能卸载：本组件的卸载 cleanup 会 `room.leave()` + `peer.close()`，
     * 那会把正在对局的两端连接一起掐断 —— 对局用的就是同一个 `room`、同一条 TCP。
     * 所以「房间 ↔ 对局」期间本组件必须一直挂在树上。
     */
    suspended?: boolean;
    /**
     * 备战界面交出来的卡组（已展开成 key 数组）。
     * 传了就用它提交 —— 编辑器视图里玩家可能还没把它保存进 activeDeck。
     */
    preparedDeck?: string[];
    /**
     * 进房间界面后自动做什么：`create` 直接建房、`join` 直接进「输房间号」页。
     * 不传就停在菜单（旧行为）。
     */
    initialAction?: 'create' | 'join';
}

type Stage = 'menu' | 'hosting' | 'joining' | 'room' | 'manual-host' | 'manual-join';

/** 把 {key:count} 展开成 string[]（喂给 GameSession）。 */
function expandCards(cards: Record<string, number>): string[] {
    return Object.entries(cards || {}).flatMap(([k, n]) =>
        Array(Math.max(0, Math.floor(n))).fill(k) as string[],
    );
}

/** 把展开的 key[] 折回 {key:count}（喂给 submitDeck）。`expandCards` 的逆运算。 */
function collapseCards(keys: string[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const k of keys) out[k] = (out[k] ?? 0) + 1;
    return out;
}

/**
 * 拼出要提交给房间的卡组。
 *
 * 优先用备战界面交出来的那一份（`preparedDeck`）—— 编辑器视图里玩家可能还没保存，
 * `activeDeck` 会是旧的。没有交出来的就退回当前编队（旧行为）。
 */
function buildDeckPayload(
    prepared: string[] | undefined,
    active: RoomDeckPayload | null,
): RoomDeckPayload | null {
    if (prepared && prepared.length > 0) {
        return {
            name: active?.name ?? '联机卡组',
            hero: active?.hero ?? '',
            cards: collapseCards(prepared),
            cardBackIndex: active?.cardBackIndex,
            boardIndex: active?.boardIndex,
            skinOverrides: active?.skinOverrides,
        };
    }
    return active;
}

export const OnlineRoomScreen: React.FC<OnlineRoomScreenProps> = ({
    onBack, onStartBattle, playerName, activeDeck, suspended = false,
    preparedDeck, initialAction,
}) => {
    const [stage, setStage] = useState<Stage>('menu');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 房间与传输
    const roomRef = useRef<Room | null>(null);
    const serverRef = useRef<HostServer | null>(null);
    const peerRef = useRef<Peer | null>(null);

    // 镜像房间状态（room 是可变对象，靠事件驱动重渲染）
    const [roomState, setRoomState] = useState<RoomState | null>(null);
    const [isHost, setIsHost] = useState(false);

    // 连接信息
    // [2026-11-07 精简流程] 连接码直连入口已移除 ⇒ 这串码不再被写入（`handleCopy` 的缺省值仍读它），
    //   只去掉无人引用的 setter，避免 noUnusedLocals 报错
    const [connectCode] = useState('');
    // [2026-11-07 精简流程] 连接码输入框已随「连接码直连」入口移除
    // const [joinInput, setJoinInput] = useState('');
    const [copied, setCopied] = useState(false);
    // [2026-11-07 精简流程] 本机网络自检提示随「连接码直连」入口移除
    // const [envHint, setEnvHint] = useState('');
    // const [candidates, setCandidates] = useState<Array<{ address: string; label: string }>>([]);

    // ── 打洞（默认通道）──
    /** 房主的 6 位房间号 */
    // [2026-11-07 精简流程] 房间号 / 信令地址属「信令服务器」入口，已移除（ref 保留：离开时的清理链不动）
    // const [roomId, setRoomId] = useState('');
    /** 信令地址（部署 Worker 后得到的那串 wss 地址） */
    // const [signalInput, setSignalInput] = useState(() => loadSignalingUrl());
    const iceHostRef = useRef<IceHostSession | null>(null);
    /** 是否切到「连接码直连」这个备用通道 */
    /**
     * 进入方式：
     *   · manual — 手动交换两段文本（默认，零成本、不装软件、手机也能用）
     *   · code   — 连接码直连（需要双方已经能互相访问：同一 WiFi 或虚拟局域网）
     *   · signal — 房间号 + 信令服务器（需要一台公网可达的服务器，暂时作为备选）
     */
    // [2026-11-07 精简流程] 连接方式只剩「手动交换文本」，入口固定 manual。
    //   类型与初始值**刻意原样保留**：建房/加入的内部链路（含 buildDeckPayload、bindRoom）不用大改，
    //   将来要恢复 code / signal，把切换按钮与对应渲染块的注释解开即可。
    const [entryMode, setEntryMode] = useState<'manual' | 'code' | 'signal'>('manual');

    // ── 手动交换（零服务器方案，默认通道）──
    /** 房主：要发给对方的那段 */
    const [manualOffer, setManualOffer] = useState('');
    /** 客方：要发回去的回执 */
    const [manualAnswer, setManualAnswer] = useState('');
    /** 粘进来的内容（房主收 answer / 客方收 offer，共用一个输入框） */
    const [manualInput, setManualInput] = useState('');
    const manualHostRef = useRef<ManualHostSession | null>(null);
    const manualGuestRef = useRef<ManualGuestSession | null>(null);

    // 聊天
    const [chatLines, setChatLines] = useState<Array<{ from: string; text: string }>>([]);
    const [chatInput, setChatInput] = useState('');
    const chatEndRef = useRef<HTMLDivElement | null>(null);

    // 对局已开始（防止重复触发）
    const startedRef = useRef(false);

    /** 本机网络环境自检（建房时用） */
    // [2026-11-07 精简流程] 只服务于「连接码直连」建房（handleCreateTcp），随该入口一并停用
    // const inspectEnv = useCallback(() => {
    //     const env = describeEnvironment();
    //     setEnvHint(env.hint);
    //     setCandidates(listConnectCandidates().slice(0, 6).map(a => ({ address: a.address, label: a.label })));
    //     return env;
    // }, []);

    /** 订阅房间事件（主机/客方通用） */
    const bindRoom = useCallback((room: Room) => {
        roomRef.current = room;
        setIsHost(room.isHost);
        setRoomState({ ...room.state });

        room.on('state', (s: RoomState) => {
            setRoomState({ ...s });
            // 回到大厅 = 上一局彻底结束（房主刚调过 finishBattle）⇒ 放行下一次开局。
            // 不复位的话 startedRef 会一直停在 true，第二局点「进入对决」不会有任何反应。
            if (s.phase === 'lobby') startedRef.current = false;
        });
        room.on('notice', (text: string) => {
            const t = String(text);
            if (t) setChatLines(prev => [...prev, { from: '系统', text: t }]);
        });
        room.on('chat', (from: string, text: string) => {
            setChatLines(prev => [...prev, { from: String(from), text: String(text) }]);
        });
        room.on('closed', (reason: string) => {
            setError(String(reason));
            setStage('menu');
            setRoomState(null);
            roomRef.current = null;
        });
        room.on('started', (payload: GameStartPayload) => {
            if (startedRef.current) return;
            startedRef.current = true;
            const p = payload as GameStartPayload;
            const hostFirst = p.firstAttackerForHost === 'player';
            const firstAttacker = room.isHost
                ? p.firstAttackerForHost
                : p.firstAttackerForGuest;
            // 本地视角：我的卡组 / 对方的卡组
            const myDeckObj = room.isHost ? p.hostDeck : p.guestDeck;
            const oppDeckObj = room.isHost ? p.guestDeck : p.hostDeck;
            void hostFirst;
            onStartBattle({
                room,
                myDeck: expandCards(myDeckObj.cards),
                opponentDeck: expandCards(oppDeckObj.cards),
                firstAttacker,
            });
        });
    }, [onStartBattle]);

    /**
     * [2026-11-07 超元链接] 手动交换建房 —— 零服务器方案。
     *
     * WebRTC 的信令本来只干一件事：把双方的连接信息互相递一下。
     * 服务器存在的唯一理由就是让这一步自动化；那就干脆让玩家自己递 ——
     * 房主发一段、对面回一段，照样直连，一分钱不花、不用装任何软件、手机也能用。
     */
    const handleManualCreate = async () => {
        setBusy(true);
        setError(null);
        try {
            const session = createManualHost();
            manualHostRef.current = session;
            const offer = await session.createOffer(); // 等 ICE 收集完，1~3 秒
            setManualOffer(offer);
            setStage('manual-host');

            void session.peer.then((peer) => {
                peerRef.current = peer;
                const room = createHostRoom({ hostName: playerName || '房主' });
                (room as HostRoom).attachGuest(peer);
                bindRoom(room);
                setStage('room');
                const ready = buildDeckPayload(preparedDeck, activeDeck);
                if (ready) room.submitDeck(ready);
            }).catch((e: Error) => setError(e.message));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    /** 房主：把对方回执喂进去，触发连接。 */
    const handleAcceptAnswer = async () => {
        const session = manualHostRef.current;
        if (!session) return;
        setBusy(true);
        setError(null);
        try {
            await session.acceptAnswer(manualInput);
            setManualInput('');
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    /** 客方：粘房主的邀请 → 生成回执。 */
    const handleManualJoin = async () => {
        setBusy(true);
        setError(null);
        try {
            const session = createManualGuest();
            manualGuestRef.current = session;
            const answer = await session.acceptOffer(manualInput);
            setManualAnswer(answer);

            void session.peer.then((peer) => {
                peerRef.current = peer;
                const room = joinRoom(peer, { name: playerName || '玩家' });
                bindRoom(room);
                setStage('room');
                const ready = buildDeckPayload(preparedDeck, activeDeck);
                if (ready) room.submitDeck(ready);
            }).catch((e: Error) => setError(e.message));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    /** 创建房间（备用通道：本机监听 + 连接码。只有双方网络本来就互通时才用得上） */
    // [2026-11-07 精简流程] 「连接码直连」入口已移除 ⇒ 整段停用（恢复：解开注释 + 解开菜单里的切换按钮）
    /*
    const handleCreateTcp = async () => {
        setBusy(true);
        setError(null);
        try {
            const env = inspectEnv();
            const server = await startHost();
            serverRef.current = server;

            const room = createHostRoom({ hostName: playerName || '房主' });
            server.onConnection((peer) => {
                peerRef.current = peer;
                if (!(room as HostRoom).attachGuest(peer)) {
                    peer.close('房间已满');
                }
            });
            bindRoom(room);

            // 连接码：优先用「虚拟局域网」那条地址（跨网唯一可行的路）
            const rec = listConnectCandidates()[0] ?? null;
            if (rec) {
                setConnectCode(encodeCode({ mode: rec.mode, address: rec.address, port: server.port }));
            } else {
                setConnectCode('');
                setError('没有找到可用于联机的网络地址');
            }
            void env;
            setStage('hosting');
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    */

    /**
     * 创建房间（默认通道：WebRTC 打洞）。
     * 玩家只需要把 6 位房间号念给对方，不需要填 IP、不需要装任何东西。
     */
    // [2026-11-07 精简流程] 「信令服务器」入口已移除 ⇒ 整段停用（恢复：解开注释 + 解开菜单里的切换按钮）
    /*
    const handleCreate = async () => {
        setBusy(true);
        setError(null);
        try {
            const url = normalizeSignalingUrl(signalInput);
            if (!url) { setError('请先填写信令地址（部署 Worker 后得到的那串 wss:// 地址）'); return; }
            saveSignalingUrl(signalInput);

            const session = await hostViaIce({
                url,
                handlers: {
                    onError: (r) => setError(r),
                },
            });
            iceHostRef.current = session;
            setRoomId(session.room);
            setStage('hosting');

            // 对方打通之后才拿得到 Peer —— 拿到了再建房间对象
            void session.peer.then((peer) => {
                peerRef.current = peer;
                const room = createHostRoom({ hostName: playerName || '房主' });
                (room as HostRoom).attachGuest(peer);
                bindRoom(room);
                // [2026-11-07] 备战界面已经选好卡组 ⇒ 自动提交，玩家不用再点一次
                const ready = buildDeckPayload(preparedDeck, activeDeck);
                if (ready) room.submitDeck(ready);
            }).catch((e: Error) => {
                // 对方没来 / 打不通：留在建房页，把原因显示出来即可
                if (iceHostRef.current === session) setError(e.message);
            });
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    */

    /** 加入房间（备用通道：粘贴连接码） */
    // [2026-11-07 精简流程] 「连接码直连」入口已移除 ⇒ 整段停用
    /*
    const handleJoinTcp = async () => {
        const raw = joinInput.trim();
        if (!raw) { setError('请先粘贴对方发来的连接码'); return; }
        if (!looksLikeCode(raw)) {
            setError('这不是超元链接的连接码（应以 SBR2 开头）');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const info = decodeCode(raw);
            if (info.mode === 'ice') { setError('这个连接码使用了尚未支持的连接方式'); return; }
            const peer = await connectTo(info.address, info.port, { timeoutMs: 12000 });
            peerRef.current = peer;
            const room = joinRoom(peer, { name: playerName || '玩家' });
            bindRoom(room);
            setStage('room');
            // [2026-11-07] 备战界面已经选好卡组 ⇒ 自动提交
            const ready = buildDeckPayload(preparedDeck, activeDeck);
            if (ready) room.submitDeck(ready);
        } catch (e) {
            setError(e instanceof CodeError ? e.message : (e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    */

    /** 加入房间（默认通道：输 6 位房间号，走打洞） */
    // [2026-11-07 精简流程] 「信令服务器」入口已移除 ⇒ 整段停用
    /*
    const handleJoin = async () => {
        const raw = joinInput.trim();
        if (!isRoomCode(raw)) { setError('房间号是 6 位数字'); return; }
        setBusy(true);
        setError(null);
        try {
            const url = normalizeSignalingUrl(signalInput);
            if (!url) { setError('请先填写信令地址（部署 Worker 后得到的那串 wss:// 地址）'); return; }
            saveSignalingUrl(signalInput);

            const peer = await joinViaIce({
                url,
                room: raw,
                handlers: { onError: (r) => setError(r) },
            });
            peerRef.current = peer;
            const room = joinRoom(peer, { name: playerName || '玩家' });
            bindRoom(room);
            setStage('room');
            // [2026-11-07] 备战界面已经选好卡组 ⇒ 自动提交
            const ready = buildDeckPayload(preparedDeck, activeDeck);
            if (ready) room.submitDeck(ready);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    */

    /** 提交卡组。优先用备战界面交出来的那份，没有就退回当前编队。 */
    const handleSubmitDeck = () => {
        const room = roomRef.current;
        if (!room) return;
        const payload = buildDeckPayload(preparedDeck, activeDeck);
        if (!payload) { setError('你还没有可用的卡组，请先去「编队」配一套'); return; }
        room.submitDeck(payload);
    };

    /** 离开 */
    const handleLeave = () => {
        eventBus.emit(GameEvents.UI_CLICK);
        try { roomRef.current?.leave(); } catch { /* ignore */ }
        try { peerRef.current?.close('离开房间'); } catch { /* ignore */ }
        try { void serverRef.current?.close(); } catch { /* ignore */ }
        try { iceHostRef.current?.close(); } catch { /* ignore */ }
        roomRef.current = null;
        peerRef.current = null;
        serverRef.current = null;
        iceHostRef.current = null;
        startedRef.current = false;
        setRoomState(null);
        setChatLines([]);
        // setRoomId(''); // [2026-11-07 精简流程] 房间号 state 已随「信令服务器」入口移除
        setStage('menu');
    };

    /** 复制一段文本（房间号或连接码） */
    const handleCopy = async (text?: string) => {
        const payload = (text ?? connectCode).trim();
        if (!payload) return;
        try {
            await navigator.clipboard.writeText(payload);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            setError('复制失败，请手动选中复制');
        }
    };

    const handleSendChat = () => {
        const t = chatInput.trim();
        if (!t) return;
        roomRef.current?.sendChat(t);
        setChatInput('');
    };

    // [2026-11-07] 备战界面已经把「创建房间 / 加入房间」选好了 ⇒ 进来自动执行一次。
    // 只在首次挂载跑；之后玩家在房间里的操作不受影响。
    const autoActionRanRef = useRef(false);
    useEffect(() => {
        if (autoActionRanRef.current) return;
        autoActionRanRef.current = true;
        // [2026-11-07 精简流程] 只剩「手动交换文本」一条路 ⇒ 备战界面的选择直接落进手动流程
        //   （原先 join 进的是连接码 / 房间号页、create 走的是信令服务器建房，两条都已移除）
        // 入口在这里强制成 manual：切换按钮已注释，写同一个值不会触发多余渲染，但让 setter 保有一个真实使用点
        setEntryMode('manual');
        if (initialAction === 'join') {
            setManualAnswer('');
            setStage('manual-join');
        } else if (initialAction === 'create') {
            void handleManualCreate();
        }
        // 只在挂载时执行一次：这里要的是"进房那一刻的选择"，不需要跟着 props 重跑
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 卸载清理
    useEffect(() => () => {
        try { roomRef.current?.leave(); } catch { /* ignore */ }
        try { peerRef.current?.close('退出界面'); } catch { /* ignore */ }
        try { void serverRef.current?.close(); } catch { /* ignore */ }
        try { iceHostRef.current?.close(); } catch { /* ignore */ }
    }, []);

    // 聊天自动滚到底
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatLines.length]);

    const me = useMemo(() => {
        if (!roomState) return null;
        return roomState.members.find(m => m.role === (isHost ? 'host' : 'guest')) ?? null;
    }, [roomState, isHost]);
    const opponent = useMemo(() => {
        if (!roomState) return null;
        return roomState.members.find(m => m.role === (isHost ? 'guest' : 'host')) ?? null;
    }, [roomState, isHost]);

    const phase = roomState?.phase ?? 'lobby';
    // [2026-11-07 精简流程] 猜拳/选先后手已移除 ⇒ 这条「我是否赢了猜拳」的推导不再被引用
    // const iWonRps = !!(roomState?.rps && roomState.rps.winnerId === (isHost ? 'host' : 'guest'));

    // ── 样式片段 ─────────────────────────────────────────────────────────
    const panelStyle: React.CSSProperties = {
        width: ROOM_UI.panelWidth,
        minHeight: ROOM_UI.panelMinHeight,
        padding: ROOM_UI.panelPad,
        borderRadius: ROOM_UI.panelRadius,
    };
    const btn = (primary = false): React.CSSProperties => ({
        padding: `${ROOM_UI.buttonPadY}px ${ROOM_UI.buttonPadX}px`,
        fontSize: ROOM_UI.buttonFontSize,
        borderRadius: 10,
        cursor: 'pointer',
        fontWeight: 700,
        letterSpacing: '0.05em',
        border: `1px solid ${primary ? 'rgba(248,113,113,0.55)' : 'rgba(255,255,255,0.14)'}`,
        background: primary
            ? 'linear-gradient(180deg, rgba(185,28,28,0.85), rgba(127,29,29,0.85))'
            : 'rgba(255,255,255,0.05)',
        color: primary ? '#fff' : 'rgba(255,255,255,0.82)',
        transition: 'all .18s',
    });

    return (
        <div className="absolute inset-0 flex items-center justify-center"
            style={{
                background: 'radial-gradient(circle at 50% 30%, #2a0d0d 0%, #08080c 70%)',
                // 进入对局时只隐藏、不卸载 —— 保住 room / TCP / 聊天记录（见 props 注释）
                display: suspended ? 'none' : undefined,
            }}>

            <div className="relative flex flex-col"
                style={{
                    ...panelStyle,
                    background: 'linear-gradient(180deg, rgba(24,10,10,0.96), rgba(10,10,14,0.98))',
                    border: '1px solid rgba(248,113,113,0.22)',
                    boxShadow: '0 30px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)',
                }}>

                {/* 顶栏 */}
                <div className="flex items-center justify-between" style={{ marginBottom: ROOM_UI.gapL }}>
                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); stage === 'menu' ? onBack() : handleLeave(); }}
                        className="flex items-center hover:opacity-80 transition-opacity"
                        style={{ gap: ROOM_UI.gapS, color: 'rgba(255,255,255,0.7)', fontSize: ROOM_UI.bodyFontSize }}>
                        <ArrowLeft size={22} />
                        {stage === 'menu' ? '返回' : '离开房间'}
                    </button>
                    <div className="flex items-center" style={{ gap: ROOM_UI.gapM }}>
                        <Swords size={26} className="text-red-400" />
                        <span className="font-black tracking-[0.2em] text-red-100"
                            style={{ fontSize: ROOM_UI.titleFontSize }}>超元链接</span>
                    </div>
                    <div className="font-mono text-red-300/40" style={{ fontSize: ROOM_UI.smallFontSize }}>
                        {isHost ? '房主' : stage === 'room' ? '客方' : '1V1 真人对抗'}
                    </div>
                </div>

                {/* 错误条 */}
                {error && (
                    <div className="font-mono"
                        style={{
                            marginBottom: ROOM_UI.gapM, padding: '10px 14px', borderRadius: 8,
                            background: 'rgba(185,28,28,0.18)', border: '1px solid rgba(248,113,113,0.35)',
                            color: '#fca5a5', fontSize: ROOM_UI.smallFontSize, lineHeight: 1.6,
                        }}>
                        {error}
                    </div>
                )}

                {/* ── 菜单 ── */}
                {stage === 'menu' && (
                    <div className="flex-1 flex flex-col items-center justify-center"
                        style={{ gap: ROOM_UI.gapL, paddingTop: 40, paddingBottom: 40 }}>
                        <p className="text-center text-white/50 font-mono"
                            style={{ fontSize: ROOM_UI.bodyFontSize, lineHeight: 1.9, maxWidth: 760 }}>
                            {entryMode === 'manual' && (
                                <>一方建房、一方加入，**交换两段文本**就能连。<br />
                                    <span className="text-red-300/60">不需要服务器，不用装任何软件，手机电脑都能用。</span></>
                            )}
                            {/* [2026-11-07 精简流程] 「连接码直连」「信令服务器」两个入口已移除 ⇒ 说明文案只留手动交换
                            {entryMode === 'code' && (
                                <>一方建房、一方加入，把连接码发给对方。<br />
                                    <span className="text-red-300/60">需要双方已经能互相访问（同一 WiFi 或虚拟局域网）。</span></>
                            )}
                            {entryMode === 'signal' && (
                                <>一方建房、一方加入，房间号念给对方就行。<br />
                                    <span className="text-red-300/60">需要一台公网可达的信令服务器。</span></>
                            )}
                            */}
                        </p>

                        {/* 只有信令模式才需要填服务器地址 */}
                        {/* [2026-11-07 精简流程] 「信令服务器」入口已移除 ⇒ 地址输入框不再渲染
                        {entryMode === 'signal' && (
                            <div style={{ width: '100%', maxWidth: 820 }}>
                                <div className="font-mono text-white/35"
                                    style={{ fontSize: ROOM_UI.smallFontSize, marginBottom: 6 }}>
                                    信令地址
                                </div>
                                <input
                                    value={signalInput}
                                    onChange={(e) => setSignalInput(e.target.value)}
                                    placeholder="ws://[IPv6地址]:8787/ws"
                                    className="font-mono outline-none"
                                    style={{
                                        padding: '10px 14px', borderRadius: 10, width: '100%',
                                        background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(248,113,113,0.25)',
                                        color: '#fecaca', fontSize: ROOM_UI.smallFontSize,
                                    }}
                                />
                            </div>
                        )}
                        */}

                        <div className="flex" style={{ gap: ROOM_UI.gapM, marginTop: 12 }}>
                            <button style={btn(true)} disabled={busy}
                                onClick={() => {
                                    eventBus.emit(GameEvents.UI_CLICK);
                                    // [2026-11-07 精简流程] 只剩「手动交换文本」一条路 ⇒ 直接生成 SDP 文本、进 manual-host
                                    // 原分流（entryMode === 'manual' / 'code' / 'signal' 三选一）随两个入口一并移除
                                    void handleManualCreate();
                                }}>
                                {busy ? '准备中…' : '创建房间'}
                            </button>
                            <button style={btn()} disabled={busy}
                                onClick={() => {
                                    eventBus.emit(GameEvents.UI_CLICK);
                                    setError(null);
                                    // [2026-11-07 精简流程] 只剩「手动交换文本」一条路 ⇒ 直接进粘贴对方文本的界面
                                    // （原先按 entryMode 分流到 'joining'：那是房间号 / 连接码页，已停用）
                                    setManualInput('');
                                    setManualAnswer('');
                                    setStage('manual-join');
                                }}>
                                加入房间
                            </button>
                        </div>

                        {/* [2026-11-07 精简流程] 连接方式切换按钮随「连接码直连」「信令服务器」两个入口一并移除
                        <div className="flex items-center" style={{ gap: ROOM_UI.gapL, marginTop: 4 }}>
                            {([
                                { key: 'manual' as const, label: '文本交换（零成本）' },
                                { key: 'code' as const, label: '连接码直连' },
                                { key: 'signal' as const, label: '信令服务器' },
                            ]).map(opt => (
                                <button
                                    key={opt.key}
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setEntryMode(opt.key); setError(null); }}
                                    className="font-mono hover:opacity-80 transition-opacity"
                                    style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: entryMode === opt.key ? 'rgba(252,165,165,0.95)' : 'rgba(252,165,165,0.3)',
                                        fontSize: ROOM_UI.smallFontSize,
                                        fontWeight: entryMode === opt.key ? 700 : 400,
                                    }}>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        */}
                    </div>
                )}

                {/* ── 手动交换：房主 ── */}
                {stage === 'manual-host' && (
                    <div className="flex-1 flex flex-col" style={{ gap: ROOM_UI.gapM, maxWidth: 900, margin: '0 auto', width: '100%' }}>
                        <div className="font-bold text-red-200" style={{ fontSize: ROOM_UI.sectionTitleFontSize }}>
                            第 1 步 · 把下面这段发给对方
                        </div>
                        <textarea
                            readOnly
                            value={manualOffer || '（生成中…）'}
                            rows={4}
                            className="font-mono outline-none resize-none"
                            style={{
                                padding: '12px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.5)',
                                border: '1px solid rgba(248,113,113,0.3)', color: '#fecaca',
                                fontSize: 12, lineHeight: 1.6, width: '100%',
                            }}
                        />
                        <div>
                            <button style={btn(true)} disabled={!manualOffer}
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); void handleCopy(manualOffer); }}>
                                <Copy size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
                                {copied ? '已复制' : '复制这段'}
                            </button>
                        </div>

                        <div className="font-bold text-red-200" style={{ marginTop: 8, fontSize: ROOM_UI.sectionTitleFontSize }}>
                            第 2 步 · 把对方发回来的那段粘到这里
                        </div>
                        <textarea
                            value={manualInput}
                            onChange={(e) => setManualInput(e.target.value)}
                            rows={4}
                            placeholder="粘贴对方回执…"
                            className="font-mono outline-none resize-none"
                            style={{
                                padding: '12px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.5)',
                                border: '1px solid rgba(248,113,113,0.3)', color: '#fecaca',
                                fontSize: 12, lineHeight: 1.6, width: '100%',
                            }}
                        />
                        <div className="flex items-center" style={{ gap: ROOM_UI.gapM }}>
                            <button style={btn(true)} disabled={busy || !manualInput.trim()}
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); void handleAcceptAnswer(); }}>
                                {busy ? '连接中…' : '连接'}
                            </button>
                            <span className="font-mono text-white/40" style={{ fontSize: ROOM_UI.smallFontSize }}>
                                填好之后点连接，等 3~10 秒
                            </span>
                        </div>
                    </div>
                )}

                {/* ── 手动交换：客方 ── */}
                {stage === 'manual-join' && (
                    <div className="flex-1 flex flex-col" style={{ gap: ROOM_UI.gapM, maxWidth: 900, margin: '0 auto', width: '100%' }}>
                        {!manualAnswer ? (
                            <>
                                <div className="font-bold text-red-200" style={{ fontSize: ROOM_UI.sectionTitleFontSize }}>
                                    第 1 步 · 粘贴房主发来的那段
                                </div>
                                <textarea
                                    value={manualInput}
                                    onChange={(e) => setManualInput(e.target.value)}
                                    rows={5}
                                    placeholder="粘贴房主的邀请…"
                                    className="font-mono outline-none resize-none"
                                    style={{
                                        padding: '12px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.5)',
                                        border: '1px solid rgba(248,113,113,0.3)', color: '#fecaca',
                                        fontSize: 12, lineHeight: 1.6, width: '100%',
                                    }}
                                />
                                <div className="flex items-center" style={{ gap: ROOM_UI.gapM }}>
                                    <button style={btn(true)} disabled={busy || !manualInput.trim()}
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); void handleManualJoin(); }}>
                                        {busy ? '生成中…' : '生成回执'}
                                    </button>
                                    <button style={btn()} onClick={() => setStage('menu')}>返回</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="font-bold text-red-200" style={{ fontSize: ROOM_UI.sectionTitleFontSize }}>
                                    第 2 步 · 把下面这段发回给房主
                                </div>
                                <textarea
                                    readOnly
                                    value={manualAnswer}
                                    rows={5}
                                    className="font-mono outline-none resize-none"
                                    style={{
                                        padding: '12px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.5)',
                                        border: '1px solid rgba(74,222,128,0.35)', color: '#bbf7d0',
                                        fontSize: 12, lineHeight: 1.6, width: '100%',
                                    }}
                                />
                                <div>
                                    <button style={btn(true)}
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); void handleCopy(manualAnswer); }}>
                                        <Copy size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
                                        {copied ? '已复制' : '复制这段'}
                                    </button>
                                </div>
                                <div className="font-mono text-white/45" style={{ fontSize: ROOM_UI.smallFontSize, lineHeight: 1.8 }}>
                                    发回去之后等房主点「连接」，双方就连上了。这一步不用再做别的。
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ── 建房 ── */}
                {/* [2026-11-07 精简流程] 「连接码直连 / 信令服务器」通道已移除 ⇒ 建房页整块保留、不再渲染（要恢复就解开本注释）
                {stage === 'hosting' && (
                    <div className="flex-1 flex flex-col" style={{ gap: ROOM_UI.gapM }}>
                        {entryMode === 'code' ? (
                            <>
                                <div className="font-bold text-red-200" style={{ fontSize: ROOM_UI.sectionTitleFontSize }}>
                                    把下面这串连接码发给对方
                                </div>
                                <div className="flex items-center" style={{ gap: ROOM_UI.gapM }}>
                                    <div className="flex-1 font-mono break-all"
                                        style={{
                                            padding: '14px 16px', borderRadius: 10,
                                            background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(248,113,113,0.3)',
                                            color: '#fecaca', fontSize: ROOM_UI.codeFontSize, letterSpacing: '0.06em', lineHeight: 1.7,
                                        }}>
                                        {connectCode || '（生成中…）'}
                                    </div>
                                    <button style={btn(true)} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); void handleCopy(); }}>
                                        <Copy size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
                                        {copied ? '已复制' : '复制'}
                                    </button>
                                </div>

                                <div className="font-mono text-white/40" style={{ fontSize: ROOM_UI.smallFontSize, lineHeight: 1.8 }}>
                                    {envHint}
                                </div>

                                {candidates.length > 1 && (
                                    <div className="font-mono text-white/30" style={{ fontSize: ROOM_UI.smallFontSize, lineHeight: 1.8 }}>
                                        检测到多个可用地址（码里用的是第一个）：
                                        {candidates.map(c => c.address).join(' · ')}
                                        <br />对方连不上时，可以在建房前换一条试试。
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="font-bold text-red-200" style={{ fontSize: ROOM_UI.sectionTitleFontSize }}>
                                    把房间号念给对方
                                </div>
                                <div className="flex items-center" style={{ gap: ROOM_UI.gapM }}>
                                    <div className="flex-1 font-mono text-center"
                                        style={{
                                            padding: '18px 16px', borderRadius: 12,
                                            background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(248,113,113,0.3)',
                                            color: '#fecaca', fontSize: 42, fontWeight: 900, letterSpacing: '0.32em',
                                        }}>
                                        {roomId || '······'}
                                    </div>
                                    <button style={btn(true)} disabled={!roomId}
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); void handleCopy(roomId); }}>
                                        <Copy size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
                                        {copied ? '已复制' : '复制'}
                                    </button>
                                </div>
                                <div className="font-mono text-white/40" style={{ fontSize: ROOM_UI.smallFontSize, lineHeight: 1.8 }}>
                                    让对方点「加入房间」，输入这 6 位数字。双方网络会自动尝试点对点直连。
                                </div>
                            </>
                        )}

                        <div className="flex items-center justify-center flex-1" style={{ gap: ROOM_UI.gapM }}>
                            <Wifi size={22} className="text-red-400/70 animate-pulse" />
                            <span className="text-white/60" style={{ fontSize: ROOM_UI.bodyFontSize }}>
                                {roomState && roomState.members.length > 1 ? '对方已连接，正在进入房间…' : '等待对方连接…'}
                            </span>
                        </div>

                        {roomState && roomState.members.length > 1 && (
                            <div className="flex justify-center">
                                <button style={btn(true)} onClick={() => setStage('room')}>进入房间</button>
                            </div>
                        )}
                    </div>
                )}
                */}
                {/* ── 加入 ── */}
                {/* [2026-11-07 精简流程] 「连接码直连 / 信令服务器」通道已移除 ⇒ 加入页整块保留、不再渲染（要恢复就解开本注释）
                {stage === 'joining' && (
                    <div className="flex-1 flex flex-col justify-center" style={{ gap: ROOM_UI.gapM, maxWidth: 820, margin: '0 auto', width: '100%' }}>
                        {entryMode === 'code' ? (
                            <>
                                <div className="font-bold text-red-200" style={{ fontSize: ROOM_UI.sectionTitleFontSize }}>
                                    粘贴房主发给你的连接码
                                </div>
                                <textarea
                                    value={joinInput}
                                    onChange={(e) => setJoinInput(e.target.value)}
                                    placeholder="SBR2-XXXXX-XXXXX-…"
                                    rows={3}
                                    className="font-mono outline-none resize-none"
                                    style={{
                                        padding: '14px 16px', borderRadius: 10, width: '100%',
                                        background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(248,113,113,0.3)',
                                        color: '#fecaca', fontSize: ROOM_UI.bodyFontSize, lineHeight: 1.7,
                                    }}
                                />
                                <div className="flex" style={{ gap: ROOM_UI.gapM }}>
                                    <button style={btn(true)} disabled={busy} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); void handleJoinTcp(); }}>
                                        {busy ? '连接中…' : '连接'}
                                    </button>
                                    <button style={btn()} onClick={() => setStage('menu')}>返回</button>
                                </div>
                                <div className="font-mono text-white/35" style={{ fontSize: ROOM_UI.smallFontSize, lineHeight: 1.8 }}>
                                    连接失败最常见的原因：双方不在同一个虚拟局域网，或对方的防火墙拦住了入站连接。
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="font-bold text-red-200" style={{ fontSize: ROOM_UI.sectionTitleFontSize }}>
                                    输入房主念给你的房间号
                                </div>
                                <input
                                    value={joinInput}
                                    onChange={(e) => setJoinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="······"
                                    inputMode="numeric"
                                    maxLength={6}
                                    className="font-mono outline-none text-center"
                                    style={{
                                        padding: '18px 16px', borderRadius: 12, width: '100%',
                                        background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(248,113,113,0.3)',
                                        color: '#fecaca', fontSize: 42, fontWeight: 900, letterSpacing: '0.32em',
                                    }}
                                />
                                <div className="flex" style={{ gap: ROOM_UI.gapM }}>
                                    <button style={btn(true)} disabled={busy || joinInput.length !== 6}
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); void handleJoin(); }}>
                                        {busy ? '连接中…' : '连接'}
                                    </button>
                                    <button style={btn()} onClick={() => setStage('menu')}>返回</button>
                                </div>
                                <div className="font-mono text-white/35" style={{ fontSize: ROOM_UI.smallFontSize, lineHeight: 1.8 }}>
                                    连不上通常有两种原因：房间号不对，或者双方网络环境让点对点直连打不通（多见于校园网）。
                                </div>
                            </>
                        )}
                    </div>
                )}
                */}

                {/* ── 房间 ── */}
                {stage === 'room' && roomState && (
                    <div className="flex-1 flex flex-col" style={{ gap: ROOM_UI.gapM }}>
                        {/* 席位 */}
                        <div className="flex items-center justify-center" style={{ gap: ROOM_UI.seatGap }}>
                            {[me, opponent].map((m, i) => (
                                <React.Fragment key={i}>
                                    {i === 1 && <div className="text-red-400/50 font-black" style={{ fontSize: 28 }}>VS</div>}
                                    <div className="flex flex-col items-center justify-center"
                                        style={{
                                            width: ROOM_UI.seatSize, height: ROOM_UI.seatSize,
                                            borderRadius: 16, gap: ROOM_UI.gapS,
                                            background: m
                                                ? (m.role === (isHost ? 'host' : 'guest')
                                                    ? 'rgba(185,28,28,0.16)' : 'rgba(255,255,255,0.04)')
                                                : 'rgba(255,255,255,0.02)',
                                            border: `1px solid ${m?.ready ? 'rgba(74,222,128,0.45)' : 'rgba(255,255,255,0.1)'}`,
                                        }}>
                                        <Users size={30} className={m ? 'text-red-200' : 'text-white/20'} />
                                        <div className="font-bold" style={{ fontSize: ROOM_UI.bodyFontSize, color: m ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                                            {m ? m.name : '等待对手…'}
                                        </div>
                                        <div className="font-mono" style={{ fontSize: ROOM_UI.smallFontSize, color: m?.ready ? '#86efac' : 'rgba(255,255,255,0.35)' }}>
                                            {m ? (m.ready ? `卡组就绪 · ${m.deckSize} 张` : '未提交卡组') : '—'}
                                        </div>
                                    </div>
                                </React.Fragment>
                            ))}
                        </div>

                        {/* 操作区 */}
                        <div className="flex items-center justify-center flex-wrap" style={{ gap: ROOM_UI.gapM }}>
                            {phase === 'lobby' && (
                                <>
                                    <button style={btn()} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); handleSubmitDeck(); }}>
                                        提交卡组{me?.ready ? '（重新提交）' : ''}
                                    </button>
                                    {/* [2026-11-07 精简流程] 猜拳/选先后手已移除 ⇒ 双方提交卡组即自动开局（先手随机），
                                        房主不再需要「开始猜拳」，客方也不再需要「等待房主开始…」
                                    {isHost && (
                                        <button style={btn(true)} disabled={!roomState.members.every(m => m.ready)}
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); roomRef.current?.startRps(); }}>
                                            开始猜拳
                                        </button>
                                    )}
                                    {!isHost && (
                                        <span className="font-mono text-white/40" style={{ fontSize: ROOM_UI.smallFontSize }}>
                                            等待房主开始…
                                        </span>
                                    )}
                                    */}
                                </>
                            )}

                            {/* [2026-11-07 精简流程] 猜拳/选先后手已移除 —— room.ts 里双方提交卡组后自动开局、先手随机
                            {phase === 'rps' && (
                                <>
                                    <span className="font-mono text-red-200" style={{ fontSize: ROOM_UI.bodyFontSize }}>
                                        猜拳定先后手{roomState.rps ? `（第 ${roomState.rps.round} 局）` : ''}：
                                    </span>
                                    {(['rock', 'paper', 'scissors'] as RpsChoice[]).map(c => (
                                        <button key={c} style={btn()}
                                            disabled={!!roomState.rps?.submitted.includes(isHost ? 'host' : 'guest')}
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); roomRef.current?.chooseRps(c); }}>
                                            {RPS_LABEL[c]}
                                        </button>
                                    ))}
                                    {roomState.rps?.draw && (
                                        <span className="font-mono text-amber-300/80" style={{ fontSize: ROOM_UI.smallFontSize }}>
                                            平局，再来一局
                                        </span>
                                    )}
                                </>
                            )}

                            {phase === 'order' && (
                                <>
                                    {iWonRps ? (
                                        <>
                                            <span className="font-mono text-green-300" style={{ fontSize: ROOM_UI.bodyFontSize }}>
                                                你赢了猜拳，选择先后手：
                                            </span>
                                            <button style={btn(true)} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); roomRef.current?.chooseOrder('first'); }}>我先手</button>
                                            <button style={btn()} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); roomRef.current?.chooseOrder('second'); }}>我后手</button>
                                        </>
                                    ) : (
                                        <span className="font-mono text-white/50" style={{ fontSize: ROOM_UI.smallFontSize }}>
                                            对方赢了猜拳，等待其选择先后手…
                                        </span>
                                    )}
                                </>
                            )}

                            {phase === 'order' && !!roomState.order?.firstAttackerId && isHost && (
                                <button style={btn(true)} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); roomRef.current?.startGame(); }}>
                                    <Play size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
                                    进入对决
                                </button>
                            )}
                            */}
                        </div>

                        {/* 聊天 */}
                        <div className="flex-1 flex flex-col"
                            style={{
                                minHeight: ROOM_UI.chatHeight, borderRadius: 10, overflow: 'hidden',
                                background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)',
                            }}>
                            <div className="flex-1 overflow-y-auto" style={{ padding: '10px 14px', maxHeight: ROOM_UI.chatHeight }}>
                                {chatLines.length === 0 && (
                                    <div className="font-mono text-white/20" style={{ fontSize: ROOM_UI.smallFontSize }}>
                                        还没有消息
                                    </div>
                                )}
                                {chatLines.map((l, i) => (
                                    <div key={i} className="font-mono" style={{ fontSize: ROOM_UI.smallFontSize, lineHeight: 1.9 }}>
                                        <span style={{ color: l.from === '系统' ? 'rgba(252,165,165,0.75)' : 'rgba(147,197,253,0.9)' }}>
                                            {l.from}：
                                        </span>
                                        <span style={{ color: 'rgba(255,255,255,0.75)' }}>{l.text}</span>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>
                            <div className="flex items-center" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: 8, gap: 8 }}>
                                <input
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSendChat(); }}
                                    placeholder="说点什么…"
                                    className="flex-1 bg-transparent outline-none font-mono"
                                    style={{ color: '#fff', fontSize: ROOM_UI.smallFontSize, padding: '6px 8px' }}
                                />
                                <button style={{ ...btn(), padding: '6px 14px', fontSize: ROOM_UI.smallFontSize }}
                                    onClick={handleSendChat}>发送</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 底栏 */}
                {stage !== 'menu' && (
                    <div className="flex justify-end" style={{ marginTop: ROOM_UI.gapM }}>
                        <button style={btn()} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); handleLeave(); }}>
                            <DoorOpen size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
                            离开房间
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
