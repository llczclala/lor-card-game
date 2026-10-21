import React, { useState, useEffect } from 'react';
import { User, Plus, Trash2, Check, X } from 'lucide-react';
// [修正] 改为从 cards 导入数据，避免直接引用 imageData 可能导致的路径问题
import { CARD_DB } from '../data/cards';
import type { UserSummary } from '../utils/storageUtils';
import { eventBus, GameEvents } from '../utils/eventBus';
// [2026-10-18 跨设备同步] 存档互传地基（打包/解包/安装）· 平台判定
import {
    buildSavePack, parseSavePack, readAllAccountSaves, installSavePack,
    type SaveOrigin,
} from '../utils/saveTransfer';
import { isNative } from '../platform';
// [2026-10-18 跨设备同步] 局域网传输层（PC 当服务端 / 手机当客户端）
import {
    startLanServer, stopLanServer, syncWithPeer, isLanServerSupported,
    type LanSession,
} from '../utils/saveSync/lan';
// [2026-10-18 跨设备同步] 二维码（自己实现的最小编码器，见 qr.ts 头部说明）
import { encodeQr, qrToSvgPath } from '../utils/saveSync/qr';
import { QrScanner } from './QrScanner';

interface AccountSelectionModalProps {
    currentUserUid: string;
    userList: UserSummary[];
    onConfirmSwitch: (uid: string) => void;
    onDeleteUser: (uid: string) => void;
    onCreateUser: (name: string) => void;
    onClose: () => void;
    /** [2026-10-18 跨设备同步] 导入存档后让外层刷新账户列表（`userList` 是 state，localStorage 变了它不会自动跟） */
    onRefreshList?: () => void;
}

export const AccountSelectionModal: React.FC<AccountSelectionModalProps> = ({
    currentUserUid,
    userList,
    onConfirmSwitch,
    onDeleteUser,
    onCreateUser,
    onClose,
    onRefreshList
}) => {
    const [selectedUid, setSelectedUid] = useState<string>(currentUserUid);
    const [isCreating, setIsCreating] = useState(false);
    const [newUserName, setNewUserName] = useState('');

    // ── [2026-10-18 跨设备同步] 存档互传（自测闭环）──────────────────────────
    //   为什么先做"文本框"而不是直接上局域网：
    //     网络出问题时，分不清是"存档格式错了"还是"网络没通" ⇒ 先把地基单测通，再接传输。
    //   为什么不用 navigator.clipboard：本机正式跑在 `file://`（Electron）上，
    //     Clipboard API 需要安全上下文，不一定可用 ⇒ 文本框是**全平台都稳**的方案。
    const [syncOpen, setSyncOpen] = useState(false);
    const [syncText, setSyncText] = useState('');
    const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);

    /** 本机平台 —— 决定导出信封里的来源标记。安卓壳 = mobile，其余（Electron/浏览器）= pc */
    const localOrigin: SaveOrigin = isNative() ? 'mobile' : 'pc';

    const handleExport = () => {
        try {
            const saves = readAllAccountSaves();
            if (saves.length === 0) {
                setSyncMsg({ ok: false, text: '本机没有可导出的账号（账户索引是空的）' });
                return;
            }
            const pack = buildSavePack(saves, localOrigin, {
                platform: localOrigin,
                appVersion: String(import.meta.env.PACKAGE_VERSION ?? ''),
            });
            const json = JSON.stringify(pack, null, 1);
            setSyncText(json);
            // 顺手试一下剪贴板；失败**不报错**（文本框才是主通道）
            try { navigator.clipboard?.writeText(json).catch(() => { }); } catch { /* 忽略 */ }
            setSyncMsg({
                ok: true,
                text: `已导出 ${saves.length} 个账号 · ${(json.length / 1024).toFixed(1)} KB（上面的文本可直接复制）`,
            });
        } catch (e) {
            setSyncMsg({ ok: false, text: `导出失败：${e instanceof Error ? e.message : String(e)}` });
        }
    };

    const handleImport = () => {
        try {
            const pack = parseSavePack(syncText);
            const { installed, skipped } = installSavePack(pack);
            onRefreshList?.();
            const added = installed.filter(i => i.action === 'added').length;
            const updated = installed.length - added;
            setSyncMsg({
                ok: true,
                text: `来自「${pack.origin === 'pc' ? 'PC' : '手机'}」：新增 ${added} 个`
                    + (updated ? ` · 覆盖 ${updated} 个` : '')
                    + (skipped.length ? ` · **已存在跳过 ${skipped.length} 个**（首次同步不覆盖）` : ''),
            });
        } catch (e) {
            setSyncMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
        }
    };

    // ── [2026-10-18 跨设备同步] 局域网直连 ────────────────────────────────
    const [peerUrl, setPeerUrl] = useState('');
    const [peerToken, setPeerToken] = useState('');
    const [lanBusy, setLanBusy] = useState(false);
    const [lanSession, setLanSession] = useState<LanSession | null>(null);
    /** 二维码渲染数据（只在会话建立时算一次，别每次 render 重算） */
    const [lanQr, setLanQr] = useState<{ path: string; size: number; payload: string } | null>(null);
    const [lanLog, setLanLog] = useState<string[]>([]);
    // [2026-10-18 改版] 三个折叠开关：扫码是全屏覆盖层；手输与文本互传退到"兜底"位置
    const [scannerOpen, setScannerOpen] = useState(false);
    const [manualOpen, setManualOpen] = useState(false);
    const [textOpen, setTextOpen] = useState(false);

    /**
     * [2026-10-18 跨设备同步] 游戏内自带扫码。
     *
     * 做法：`<input type="file" capture="environment">` 让**系统相机**拍一张
     * → 画到 canvas 取像素 → 用自己写的解码器（`qrDecode.ts`）解出 `snowbreak://pair?...`。
     *
     * 为什么不直接靠"系统相机扫码"：国产 ROM 对**自定义 scheme** 的支持不一致
     *   （有的只认 http 链接）。这条路 **不装相机插件、不要相机权限**，
     *   也不依赖 OS 怎么处理 snowbreak://。
     */
    /**
     * [2026-10-18 改版] 扫到二维码后：解析 → **立刻连接**。
     * 程的要求是"点了扫描就直接连，不要一堆步骤" ⇒ 这里**不再让玩家点第二次**。
     */
    const handleScannedText = async (text: string) => {
        setLanBusy(true);
        setSyncMsg(null);
        try {
            const u = new URL(text);
            if (u.protocol !== 'snowbreak:') throw new Error('这不是本游戏的配对码');
            const hh = u.searchParams.get('h');
            const pp = u.searchParams.get('p');
            const tt = u.searchParams.get('t');
            if (!hh || !pp || !tt) throw new Error('配对码内容不完整');

            // 🔴 配对码只留数字（界面显示的也是这个）—— 旧版把原始串交给 syncWithPeer，
            //    显示正常、连接却报「配对码应该是 6 位数字」。
            const token = tt.replace(/\D/g, '').slice(0, 6);

            // PC 可能有多张网卡（虚拟网卡 / VPN / 直连公网口），二维码里已经把
            // 备选地址放在 `alt` 里 ⇒ 这里**按顺序逐个试**，第一个通的就是对的。
            // （2026-10-21：此前 PC 只报一个地址，选错就必然连不上。）
            const alts = (u.searchParams.get('alt') ?? '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            const hosts = [hh, ...alts];

            setPeerToken(token);
            setSyncMsg({ ok: true, text: hosts.length > 1 ? `扫到了，正在连接（共 ${hosts.length} 个地址备选）…` : '扫到了，正在连接…' });

            let lastErr: unknown = null;
            for (const host of hosts) {
                const url = `http://${host}:${pp}`;
                try {
                    const rep = await syncWithPeer(url, token);
                    setPeerUrl(url);
                    onRefreshList?.();
                    setSyncMsg({
                        ok: true,
                        text: `同步完成：对方 ${rep.receivedAccounts} 个账号 · 本机新增 ${rep.added.length} 个 · 跳过 ${rep.skipped} 个`,
                    });
                    return;
                } catch (e) {
                    lastErr = e;
                }
            }
            throw lastErr ?? new Error('所有备选地址都连不上');
        } catch (e) {
            setSyncMsg({ ok: false, text: `连接失败：${e instanceof Error ? e.message : String(e)}` });
        } finally {
            setLanBusy(false);
        }
    };

    const pushLog = (line: string) => setLanLog(prev => [...prev.slice(-4), line]);

    /** PC 侧：起服务端等手机连进来（成功一次自动关闭） */
    const handleStartServer = async () => {
        setLanLog([]);
        setSyncMsg(null);
        try {
            const session = await startLanServer(pushLog, (rep) => {
                setLanSession(null);
                onRefreshList?.();
                setSyncMsg({
                    ok: true,
                    text: `同步完成：收到对方 ${rep.receivedAccounts} 个账号 · 本机新增 ${rep.added.length} 个 · 跳过 ${rep.skipped} 个`,
                });
            });
            setLanSession(session);
            // 生成配对二维码：手机用**系统相机**扫它 ⇒ 系统用 snowbreak:// 把本 App 调起来
            //   （清单里已注册 intent-filter；这样手机端不需要相机插件、不需要相机权限）
            try {
                // 备选地址：PC 上常有虚拟网卡 / VPN，第一个不一定通 ⇒ 都塞进码里让手机挨个试
                const alts = session.candidates
                    .filter((c) => c.private && c.address !== session.ip)
                    .slice(0, 2)
                    .map((c) => c.address);
                const payload = `snowbreak://pair?h=${session.ip}&p=${session.port}&t=${session.token}`
                    + (alts.length ? `&alt=${alts.join(',')}` : '');
                const qr = encodeQr(payload);
                setLanQr({ path: qrToSvgPath(qr), size: qr.size, payload });
            } catch (e) {
                setLanQr(null);
                pushLog(`⚠️ 二维码生成失败（可改用下面的地址手输）：${e instanceof Error ? e.message : String(e)}`);
            }
        } catch (e) {
            setSyncMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
        }
    };

    const handleStopServer = () => {
        stopLanServer();
        setLanSession(null);
        setLanQr(null);
        pushLog('已取消等待');
    };

    /** 手机侧：主动连 PC 并互传 */
    const handleConnect = async () => {
        setLanBusy(true);
        setSyncMsg(null);
        try {
            const rep = await syncWithPeer(peerUrl, peerToken);
            onRefreshList?.();
            setSyncMsg({
                ok: true,
                text: `同步完成：对方 ${rep.receivedAccounts} 个账号 · 本机新增 ${rep.added.length} 个 · 跳过 ${rep.skipped} 个`,
            });
        } catch (e) {
            setSyncMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
        } finally {
            setLanBusy(false);
        }
    };

    // 面板关掉时务必收摊（不留一个开着的端口）
    useEffect(() => () => stopLanServer(), []);

    /**
     * [2026-10-18 跨设备同步] 手机端接住 `snowbreak://pair?...` 深链。
     * 手机用系统相机扫 PC 屏幕上的二维码 ⇒ 系统用这个 scheme 调起本 App
     * ⇒ 这里解析出地址与配对码并自动填进输入框（玩家只需再点一下「连接」）。
     * ⚠️ 只在安卓壳里有效；清单里已注册对应的 intent-filter。
     */
    useEffect(() => {
        if (!isNative()) return;
        let removed = false;
        let remove: (() => void) | null = null;
        void (async () => {
            try {
                const { App } = await import('@capacitor/app');
                const handle = await App.addListener('appUrlOpen', (ev) => {
                    try {
                        const u = new URL(ev.url);
                        if (u.protocol !== 'snowbreak:') return;
                        const h = u.searchParams.get('h');
                        const p = u.searchParams.get('p');
                        const t = u.searchParams.get('t');
                        if (!h || !p || !t) return;
                        setPeerUrl(`http://${h}:${p}`);
                        setPeerToken(t.replace(/\D/g, '').slice(0, 6));
                        setSyncOpen(true);
                        setSyncMsg({ ok: true, text: '已从二维码读入地址与配对码 —— 点「连接」即可开始互传' });
                    } catch { /* 不是本应用的链接，忽略 */ }
                });
                if (removed) { handle.remove(); return; }
                remove = () => handle.remove();
            } catch {
                /* @capacitor/app 不可用（浏览器）⇒ 静默跳过 */
            }
        })();
        return () => { removed = true; remove?.(); };
    }, []);

    const handleCreate = () => {
        if (!newUserName.trim()) return;
        eventBus.emit(GameEvents.UI_CLICK);
        onCreateUser(newUserName);
        setIsCreating(false);
        setNewUserName('');
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in" onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}>
            <div
                className="w-[600px] bg-slate-900 border border-white/20 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* 标题栏 */}
                <div className="p-6 border-b border-white/10 bg-slate-800/50 flex justify-between items-center">
                    <h2 className="text-xl font-black tracking-widest text-white flex items-center gap-3">
                        <User className="text-blue-400" /> SELECT ACCOUNT
                    </h2>
                    <button onClick={() => {
                        eventBus.emit(GameEvents.UI_BACK); // [新增] 音效
                        onClose();
                    }}
                     className="text-gray-400 hover:text-white transition-colors"
                     >
                     <X size={24} />
                    </button>
                </div>

                {/* 账户列表 */}
                <div className="flex-1 p-6 overflow-y-auto max-h-[400px] space-y-3 custom-scrollbar">
                    {userList.map(user => {
                        const isSelected = selectedUid === user.uid;
                        const isCurrent = currentUserUid === user.uid;

                        // [修正] 从 CARD_DB 获取头像图片 (默认里芙)
                        const avatarId = user.avatarId || 'lyfe';
                        const avatar = CARD_DB[avatarId]?.imageUrl || CARD_DB['lyfe'].imageUrl;

                        return (
                            <div
                                key={user.uid}
                                onClick={() => {
                                eventBus.emit(GameEvents.UI_CLICK); // [新增] 音效
                                setSelectedUid(user.uid);
                                }}
                                className={`
                                    relative flex items-center gap-4 p-3 rounded-xl border-2 cursor-pointer transition-all
                                    ${isSelected
                                        ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                                        : 'border-white/5 bg-white/5 hover:border-white/20 hover:bg-white/10'}
                                `}
                            >
                                {/* 头像 */}
                                <div className="w-12 h-12 rounded-full overflow-hidden border border-white/20 bg-black">
                                    <img src={avatar} className="w-full h-full object-cover" alt="头像" />
                                </div>

                                {/* 信息 */}
                                <div className="flex-1">
                                    <div className="font-bold text-white flex items-center gap-2">
                                        {user.displayName}
                                        {user.type === 'full' && <span className="text-[10px] bg-yellow-600/50 px-1 rounded text-yellow-200">DEV</span>}
                                        {/* [2026-10-18 跨设备同步] 来源角标：只有"外来户"才带，本机原生账号不标 */}
                                        {user.origin && (
                                            <span
                                                className={`text-[10px] px-1 rounded ${user.origin === 'pc'
                                                    ? 'bg-sky-600/50 text-sky-200'
                                                    : 'bg-fuchsia-600/50 text-fuchsia-200'}`}
                                                title={user.origin === 'pc' ? '从 PC 同步过来' : '从手机同步过来'}
                                            >
                                                {user.origin === 'pc' ? 'PC' : '手游'}
                                            </span>
                                        )}
                                        {isCurrent && <span className="text-[10px] bg-green-600/50 px-1 rounded text-green-200">CURRENT</span>}
                                    </div>
                                    <div className="text-xs font-mono text-gray-500">
                                        UID: {user.uid.slice(0, 8).toUpperCase()}
                                    </div>
                                </div>

                                {/* 选中标记 */}
                                {isSelected && <Check className="text-blue-400" size={20} />}
                            </div>
                        );
                    })}

                    {/* 新建账户输入框 */}
                    {isCreating ? (
                        <div className="flex gap-2 animate-fade-in-up">
                            <input
                                type="text"
                                autoFocus
                                placeholder="Enter Agent Name..."
                                value={newUserName}
                                onChange={e => setNewUserName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                className="flex-1 bg-black/40 border border-white/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                            />
                            <button
                                onClick={handleCreate}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-4 rounded-lg font-bold transition-colors"
                            >
                                OK
                            </button>
                            <button
                                onClick={() => {
                                eventBus.emit(GameEvents.UI_BACK); // [新增] 音效
                                setIsCreating(false);
                                }}
                                className="bg-gray-700 hover:bg-gray-600 text-white px-3 rounded-lg transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => {
                                eventBus.emit(GameEvents.UI_CLICK); // [新增] 音效
                                setIsCreating(true);
                            }}
                            className="w-full py-3 border-2 border-dashed border-white/10 hover:border-white/30 rounded-xl flex items-center justify-center gap-2 text-gray-400 hover:text-white transition-all hover:bg-white/5"
                        >
                            <Plus size={16} /> CREATE NEW ACCOUNT
                        </button>
                    )}
                </div>

                {/* ── [2026-10-18 跨设备同步] 存档互传（局域网/二维码接上前的过渡通道，也是地基自测入口）── */}
                <div className="border-t border-white/10 bg-black/20">
                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setSyncOpen(v => !v); }}
                        className="w-full px-6 py-2 flex items-center justify-between text-xs font-mono text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        <span>⇄ 存档互传（PC ⇄ 手机）</span>
                        <span className="text-gray-500">{syncOpen ? '收起' : '展开'}</span>
                    </button>

                    {syncOpen && (
                        <div className="px-6 pb-6 space-y-4">
                            {isNative() ? (
                                /* ── 手机端：一个按钮 → 实时扫码 → 自动连上 ── */
                                <div className="space-y-3">
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setScannerOpen(true); }}
                                        disabled={lanBusy}
                                        className={`w-full py-5 rounded-2xl text-xl font-black tracking-wide transition-all ${lanBusy
                                            ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                            : 'bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-500 hover:to-violet-500 text-white shadow-lg shadow-fuchsia-900/40'}`}
                                    >
                                        {lanBusy ? '正在连接…' : '📷 扫描电脑上的二维码'}
                                    </button>

                                    <div className="text-sm text-gray-400 text-center leading-relaxed">
                                        电脑上点「让手机连进来」→ 手机点上面按钮去扫那个码<br />
                                        <b className="text-gray-200">扫到就自动连上，不用填任何东西</b>
                                    </div>

                                    <button
                                        onClick={() => setManualOpen(v => !v)}
                                        className="w-full text-sm text-gray-500 hover:text-gray-300 underline transition-colors"
                                    >
                                        {manualOpen ? '收起手动输入' : '扫不了？手动输入地址和配对码'}
                                    </button>

                                    {manualOpen && (
                                        <div className="space-y-2 pt-1">
                                            <input
                                                value={peerUrl}
                                                onChange={e => setPeerUrl(e.target.value)}
                                                placeholder="http://192.168.1.23:8710"
                                                spellCheck={false}
                                                className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-base font-mono text-gray-200 focus:outline-none focus:border-sky-500"
                                            />
                                            <div className="flex gap-2">
                                                <input
                                                    value={peerToken}
                                                    onChange={e => setPeerToken(e.target.value.replace(/\D/g, ''))}
                                                    placeholder="6 位配对码"
                                                    inputMode="numeric"
                                                    maxLength={6}
                                                    className="flex-1 bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-base font-mono text-gray-200 text-center tracking-[0.3em] focus:outline-none focus:border-sky-500"
                                                />
                                                <button
                                                    onClick={handleConnect}
                                                    disabled={lanBusy || !peerUrl.trim() || peerToken.length !== 6}
                                                    className={`px-6 rounded-xl text-base font-bold transition-colors ${lanBusy || !peerUrl.trim() || peerToken.length !== 6
                                                        ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                                                        : 'bg-sky-700/70 hover:bg-sky-600 text-sky-100'}`}
                                                >
                                                    连接
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* ── PC 端：出大码，等手机来扫 ── */
                                <div className="space-y-3">
                                    {lanSession ? (
                                        <>
                                            {lanQr && (
                                                /* 码要大、静区要够：220px 时 v3 只有 7.6px/模块，手机拍屏幕容易糊；
                                                   静区按标准留 ≥4 个模块（少了定位图形会被旁边的深色背景"吃掉"） */
                                                <div className="flex justify-center">
                                                    <div
                                                        className="bg-white rounded-2xl shadow-2xl"
                                                        style={{ padding: Math.ceil((340 / lanQr.size) * 4) }}
                                                    >
                                                        <svg
                                                            viewBox={`0 0 ${lanQr.size} ${lanQr.size}`}
                                                            width={340}
                                                            height={340}
                                                            shapeRendering="crispEdges"
                                                            aria-label="存档配对二维码"
                                                        >
                                                            <path d={lanQr.path} fill="#000" />
                                                        </svg>
                                                    </div>
                                                </div>
                                            )}
                                            <div className="text-lg text-amber-300 text-center font-bold">
                                                ● 等手机扫这个码（5 分钟内有效）
                                            </div>
                                            <button
                                                onClick={handleStopServer}
                                                className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-gray-200 text-base font-bold transition-colors"
                                            >
                                                取消等待
                                            </button>
                                            <div className="text-xs text-gray-500 text-center font-mono break-all leading-relaxed">
                                                扫不了？手输：{lanSession.url}<br />配对码 {lanSession.token}
                                            </div>
                                            {/* 多网卡时把候选地址全列出来 —— 二维码里已经带了备选（手机会自动挨个试），
                                                这里列出来是为了手输/排查时能一眼看到本机有哪些地址 */}
                                            {lanSession.candidates.length > 1 && (
                                                <div className="text-xs text-gray-500 font-mono leading-relaxed">
                                                    本机地址（手机连不上时换一个试试）：
                                                    {lanSession.candidates.map((c, i) => (
                                                        <div key={c.address} className={i === 0 ? 'text-emerald-400/80' : 'text-gray-500'}>
                                                            · {c.address} <span className="text-gray-600">({c.iface}{c.private ? '' : ' · 非局域网'})</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                onClick={handleStartServer}
                                                disabled={!isLanServerSupported()}
                                                className={`w-full py-5 rounded-2xl text-xl font-black tracking-wide transition-all ${isLanServerSupported()
                                                    ? 'bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 text-white shadow-lg shadow-sky-900/40'
                                                    : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
                                                title={isLanServerSupported() ? undefined : '当前环境不支持（需要 Electron 桌面端）'}
                                            >
                                                {isLanServerSupported() ? '让手机连进来' : '当前环境不可用（需桌面版）'}
                                            </button>
                                            {!isLanServerSupported() && (
                                                <div className="text-sm text-amber-500/90 leading-relaxed">
                                                    ⚠️ 现在是<b className="text-amber-300">浏览器</b>环境（没有 Node），当不了服务端 —— 这是浏览器本身的限制。
                                                    <br />请跑桌面版：<code className="text-gray-300">npm run electron:dev</code>，或直接用装好的游戏。
                                                </div>
                                            )}
                                        </>
                                    )}
                                    {lanLog.length > 0 && (
                                        <div className="text-xs font-mono text-gray-400 leading-relaxed max-h-24 overflow-y-auto custom-scrollbar">
                                            {lanLog.map((l, i) => <div key={i}>{l}</div>)}
                                        </div>
                                    )}
                                </div>
                            )}

                            {syncMsg && (
                                <div className={`text-base leading-relaxed text-center font-bold ${syncMsg.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                                    {syncMsg.ok ? '✅ ' : '❌ '}{syncMsg.text}
                                </div>
                            )}

                            <div className="text-sm text-gray-500 leading-relaxed">
                                只同步<b className="text-gray-300">游戏进度</b>（档案 / 收藏 / 卡组 / 通行证 / 战绩 / 肉鸽 / 任务 / 教程），不同步音量画质。
                                首次导入是<b className="text-gray-300">新增账号</b>，不会覆盖本机现有账号。
                            </div>

                            {/* 高级：文本互传（跨网 / 无相机）—— 默认收起，别占视线 */}
                            <button
                                onClick={() => setTextOpen(v => !v)}
                                className="w-full text-sm text-gray-500 hover:text-gray-300 underline transition-colors"
                            >
                                {textOpen ? '收起文本互传' : '高级：用文本互传（跨网 / 无相机时）'}
                            </button>
                            {textOpen && (
                                <div className="space-y-2">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleExport}
                                            className="flex-1 py-3 rounded-xl bg-sky-700/60 hover:bg-sky-600 text-sky-100 text-base font-bold transition-colors"
                                        >
                                            导出本机全部账号
                                        </button>
                                        <button
                                            onClick={handleImport}
                                            disabled={!syncText.trim()}
                                            className={`flex-1 py-3 rounded-xl text-base font-bold transition-colors ${syncText.trim()
                                                ? 'bg-emerald-700/60 hover:bg-emerald-600 text-emerald-100'
                                                : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
                                        >
                                            导入下面的存档
                                        </button>
                                    </div>
                                    <textarea
                                        value={syncText}
                                        onChange={e => { setSyncText(e.target.value); setSyncMsg(null); }}
                                        spellCheck={false}
                                        placeholder="点「导出」生成存档文本；或把对面设备导出的文本粘到这里，再点「导入」。"
                                        className="w-full h-28 resize-none bg-black/50 border border-white/10 rounded-xl p-3 text-xs font-mono text-gray-300 focus:outline-none focus:border-blue-500 custom-scrollbar"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* [2026-10-18] 全屏实时扫码覆盖层：扫到即自动连接 */}
                {scannerOpen && (
                    <QrScanner
                        onResult={(text) => { setScannerOpen(false); void handleScannedText(text); }}
                        onClose={() => setScannerOpen(false)}
                    />
                )}

                {/* 底部按钮栏 */}
                <div className="p-6 border-t border-white/10 bg-slate-800/50 flex justify-between items-center gap-4">
                    <button
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_BACK); // [新增] 删除=撤回音效
                            onDeleteUser(selectedUid);
                        }}
                        disabled={selectedUid === currentUserUid} // 禁止删除当前登录的账号
                        className={`
                            px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition-all
                            ${selectedUid === currentUserUid
                                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                                : 'bg-red-900/50 text-red-200 hover:bg-red-800 hover:text-white'}
                        `}
                    >
                        <Trash2 size={18} /> DELETE
                    </button>

                    <button
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_CLICK); // [新增] 音效
                            onConfirmSwitch(selectedUid);
                        }}
                        disabled={selectedUid === currentUserUid} // 如果选的是自己，禁用确定按钮
                        className={`
                            flex-1 py-3 rounded-lg font-black tracking-widest text-lg transition-all shadow-lg
                            ${selectedUid === currentUserUid
                                ? 'bg-gray-700 text-gray-400 cursor-default'
                                : 'bg-blue-600 hover:bg-blue-500 text-white hover:scale-105 shadow-blue-900/50'}
                        `}
                    >
                        {selectedUid === currentUserUid ? 'CURRENT' : 'CONFIRM SWITCH'}
                    </button>
                </div>
            </div>
        </div>
    );
};