// ==========================================
// 悖论迷宫 · 奖励匣开箱（[2026-09-29 程拍板] 匣子体系）
//
// 与「卡包开启（PackOpenModal）」的分工：
//   · PackOpenModal ：**卡包 → 匣子**（滚轮抽到一个匣子，入待打开队列）
//   · 本组件        ：**匣子 → 道具**（打开匣子，得到武装 或 神格碎片）
//
// 两类匣子：
//   · 武装匣（armament） → 按**对应品质**随机一件武装入库；未消耗品可配置
//   · 神格碎片匣（shard）→ 按**对应数量**产出碎片；碎片每 5 片为一组，随机归属一位天启者
//                          ⚠️ 万能碎片**不会**从这里开出（唯一来源：每日任务 + 溢出转化）
//
// [2026-10-02 莉莉子 · 程反馈重做] 详见 docs/检查-开卡包与开匣.md
//   · N3 程反馈「不能选择要开的匣子，只能按顺序开」→ 改为**网格选匣**（点哪个开哪个）。
//   · N4 程反馈「没有查看详情按钮和弹窗」→ 每个匣子加「查看详情」：
//        武装匣 = 列出**该品质可能开出的武装池**（与真实抽取共用 getArmamentChestPool，杜绝"假详情"）
//        碎片匣 = 开出片数 + 随机归属规则
//   · N5 程反馈「碎片结果不该是一行行横条」→ 改为**六边形图标网格 + 下方数量**（大图、逐项弹出）。
//   · #12 开匣零演出 → 新增**开盖光爆**演出（放大旋转 + 品质色冲击环 + 白光爆 + 碎片飞散，约 1.2s）。
//   · #11 opening 状态形同虚设 → 原 `handleOpen` 里 setOpening(true) 与 onOpenChest 同步走完，
//        React 永远渲染不出 true ⇒ 防连点与「开匣中不许关」**两道防护全是坏的**。
//        改为 phase 状态机（'select' | 'opening' | 'result'）+ **同步 ref** 守卫。
//   · #13 武装 id 查不到定义时结果面板整块空白 → 补兜底文案与通用图标。
//   · #14 溢出碎片只散落在每行小标签里、没有合计 → 顶部给「其中万能 +N」汇总。
//   · #15 无 ESC 支持 → 详情开着先收详情，否则关弹窗。
//   · #11 附带安全修正：**动画期间关闭 = 不消耗匣子**（改为动画结束才调 onOpenChest，
//        关掉即 clearTimeout ⇒ 那一刻还没扣，匣子留在队列里，不会"扣了但没看见结果"）。
// ==========================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, X, Coins } from 'lucide-react';
import { ShardIcon } from './ShardIcon'; // [2026-09-29 程拍板] 神格碎片图标（头像裁进菱形 / 万能橙菱形）
import { RARITY_META } from './RarityIcon';
import { getEquipmentById } from '../../data/equipment';
import { getArmamentChestPool } from '../../logic/armamentChestPool'; // [2026-10-02] 预览与实际抽取共用同一个池
import { hasArmamentRoom, getArmamentOverflowDataGold, MAX_ARMAMENT_STOCK } from '../../data/roguelike/armamentStock'; // [2026-10-04 ②] 预览按库存标注（与抽取同源）
import { CARD_DB } from '../../data/cards';
import { getGameScale } from '../../utils/gameScale';
import { eventBus, GameEvents } from '../../utils/eventBus'; // [2026-10-14 莉莉子 🖱️] 关闭/详情 音效
import { BulkOpenSummaryModal, type BulkSummaryItem } from './BulkOpenSummaryModal'; // [2026-10-04 程拍板] 一键开匣的完整结果汇总窗
import {
    CHEST_KIND_LABEL, SHARD_CHEST_AMOUNT, SHARD_GROUP_SIZE,
    type ChestInstance,
} from '../../data/roguelike/divinityShards';

/** openChest 的返回结构（与 useUserSystem.openChest 对齐） */
export interface ChestOpenResult {
    kind: ChestInstance['kind'];
    rarity: ChestInstance['rarity'];
    armamentId?: string;
    /** [2026-10-04 ②] 武装全品质库存已满时的**折算数据金**（有值 = 本次没发武装、发的是钱） */
    overflowDataGold?: number;
    shardAmount?: number;
    shardDetail?: { heroKey: string; amount: number; overflow: number }[];
    wallet?: unknown;
}

interface ChestOpenModalProps {
    isOpen: boolean;
    /** 待打开匣子列表（队列） */
    chests: ChestInstance[];
    /** 打开队列里第 index 个匣子 */
    onOpenChest: (index: number) => ChestOpenResult | null;
    onClose: () => void;
    /** 同时持有 useHeroDivinity 的调用方注入：碎片入账 */
    onShardDrop?: (result: ChestOpenResult) => void;
    /**
     * [2026-10-04 程拍板] ⚡ 一键全开：调用方注入的**批量结算**（= `userSystem.openAllChests()`）。
     * ⚠️ 必须用它，**不要**在这里循环调 `onOpenChest(0)` —— `openChest` 用闭包里的 settings 取下标，
     *    连调会**反复开同一个匣子**（重复发道具）。未传时按钮不渲染（向后兼容）。
     */
    onOpenAllChests?: () => ChestOpenResult[];
    /**
     * [2026-10-04 ②] 武装库存（`armamentStock`）—— **只为"详情预览说真话"**：
     *   实际抽取已改为"优先抽库存未满的、全满才折算数据金"（`pickArmamentFromChest`），
     *   预览必须按同一口径标注，否则又变成"UI 承诺 ≠ 实际产出"。
     * 未传（向后兼容）时预览退回旧文案。
     */
    armamentStock?: Record<string, number>;
}

const HEXAGON = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
const OPEN_DUR = 1200; // [2026-10-02 #12] 开盖光爆演出时长（ms），到点才真正开匣

type Phase = 'select' | 'opening' | 'result';

export const ChestOpenModal: React.FC<ChestOpenModalProps> = ({
    isOpen, chests, onOpenChest, onClose, onShardDrop, onOpenAllChests, armamentStock,
}) => {
    const [phase, setPhase] = useState<Phase>('select');
    const [openingIndex, setOpeningIndex] = useState(0); // 正在开启第几个（演出用）
    const [result, setResult] = useState<ChestOpenResult | null>(null);
    const [detailIndex, setDetailIndex] = useState<number | null>(null); // 详情弹窗看的是第几个匣子
    const gameScale = getGameScale();

    const phaseRef = useRef<Phase>('select');   // [2026-10-02 #11] 同步守卫（不用 state 做锁）
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
    const setPh = (p: Phase) => { phaseRef.current = p; setPhase(p); };

    // 打开面板 / 关闭面板 → 复位（含清理未完成的开匣计时器：**关闭即不消耗**）
    useEffect(() => {
        clearTimer();
        setPh('select');
        setResult(null);
        setDetailIndex(null);
        setOpeningIndex(0);
        return clearTimer;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // [2026-10-02 #15] ESC：详情 → 关详情；开启中 → 忽略；其余 → 关弹窗
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return; eventBus.emit(GameEvents.UI_BACK);
            e.stopImmediatePropagation();
            if (detailIndex !== null) { setDetailIndex(null); return; }
            if (phaseRef.current === 'opening') return;
            onClose();
        };
        window.addEventListener('keydown', onKey, { capture: true });
        return () => window.removeEventListener('keydown', onKey, { capture: true });
    }, [isOpen, detailIndex, onClose]);

    const next = useMemo(() => chests[0], [chests]);
    const safeMeta = (r: ChestInstance['rarity']) => RARITY_META[r] ?? RARITY_META.common;

    /** [2026-10-02 #12 / #11] 点某个匣子：先播演出，**演出结束才真正开**（关掉即不消耗） */
    const handleOpen = (index: number) => {
        if (phaseRef.current === 'opening') return; // 同步守卫：同一帧内连点也拦得住
        if (!chests[index]) return;
        bulkRef.current = false;        // [2026-10-04] 单开：退出批量模式并清队列
        queueRef.current = [];
        setBulkTotal(0);
        setBulkDone(0);
        setOpeningIndex(index);
        setDetailIndex(null);
        setPh('opening');
        clearTimer();
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            const res = onOpenChest(index);
            // 碎片匣：把分配结果交给调用方入账（依赖方向：调用方同时持有 divinity）
            if (res?.kind === 'shard' && onShardDrop) onShardDrop(res);
            setResult(res);
            setPh('result');
        }, OPEN_DUR);
    };

    // ═══ [2026-10-04 程拍板] ⚡ 一键全开：批量结算 → **逐个播完整的开匣演出** ═══════════
    //   与单开的唯一区别：单开是「演出 → 到点才真开」，批量是「先一次结算好 → 每发演出到点展示结果」。
    //   演出时长批量时压缩（BULK_OPEN_DUR），但**每一发都照常播 `opening`**（绝不跳过演出 ——
    //   卡包那边就是因为直接跳到 result 被程实测打回过）。
    const BULK_OPEN_DUR = 420;                 // 批量每发的开盖演出（单开仍是 OPEN_DUR = 1200）
    const queueRef = useRef<ChestOpenResult[]>([]);
    const bulkRef = useRef(false);             // 是否批量模式（只用来决定演出时长）
    const [bulkTotal, setBulkTotal] = useState(0);
    const [bulkDone, setBulkDone] = useState(0);
    // [2026-10-04 程拍板] 本次一键的**完整结果** —— 全部播完后单开一个窗展示
    const [bulkList, setBulkList] = useState<ChestOpenResult[]>([]);
    const [summaryOpen, setSummaryOpen] = useState(false);

    /** 播一发：开盖演出 → 到点展示结果
     *  [2026-10-04 独立审查 #8 修复] 碎片入账**只在单开模式**在这一刻做；批量模式已在 handleOpenAll 里
     *  一次入账完毕（见那里的注释）—— 入账绝不能挂在播放进度上。 */
    const playOne = (res: ChestOpenResult | null) => {
        setPh('opening');
        clearTimer();
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            if (!bulkRef.current && res?.kind === 'shard' && onShardDrop) onShardDrop(res);
            setResult(res);
            setPh('result');
        }, bulkRef.current ? BULK_OPEN_DUR : OPEN_DUR);
    };

    /** ⚡ 一键全开：一次结算完队列，然后逐个播 */
    const handleOpenAll = () => {
        if (phaseRef.current === 'opening') return;
        if (!onOpenAllChests) return;
        const list = onOpenAllChests();        // ← 一次性结算 + 清空队列（内部已落盘）
        if (list.length === 0) return;
        // ==========================================
        // [2026-10-04 独立审查 #8 修复] **碎片入账不能依赖播放进度**
        //   病根：`onOpenAllChests()` 已经把队列**清空**（匣子已消耗），而碎片原本要等"播到那一条"
        //     的定时器才经 `onShardDrop` 入账。而 700ms 停留窗内 **X 按钮 / 背景点击 / 收起** 三个入口都活着，
        //     玩家一关窗 ⇒ 剩下几条**永远不会播** ⇒ **队列删了、碎片没到**（静默丢失）。
        //   修法：批量在**这里**一次入账（与播放无关）；`playOne` 在批量模式只展示、不再重复入账。
        // ==========================================
        if (onShardDrop) for (const r of list) { if (r?.kind === 'shard') onShardDrop(r); }
        bulkRef.current = true;
        queueRef.current = list.slice(1);      // 第一发立刻播，其余排队
        setBulkList(list);                     // [2026-10-04 程拍板] 留档完整结果 → 全部播完后开汇总窗
        setSummaryOpen(false);
        setBulkTotal(list.length);
        setBulkDone(0);
        setOpeningIndex(0);
        setDetailIndex(null);
        playOne(list[0]);
    };

    // 每一发定格后：队列还有 ⇒ 自动接下一发；没有 ⇒ 标记完成（出汇总）
    useEffect(() => {
        if (phase !== 'result') return;
        if (bulkTotal === 0) return;                       // 非批量：不插手
        // [2026-10-04 程拍板] 全部播完 ⇒ 单开一个**汇总窗**展示本次完整结果
        if (queueRef.current.length === 0) { setBulkDone(bulkTotal); setSummaryOpen(true); return; }
        const t = setTimeout(() => {
            const nextRes = queueRef.current.shift();
            if (nextRes) { setBulkDone(d => d + 1); playOne(nextRes); }
        }, 700);                                           // 定格停留：看清这一发
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, bulkTotal]);

    // ⚠️ [2026-10-02] 刻意**不在这里早退** `return null`：早退会让 AnimatePresence 见不到子树被移除，
    //   下面 motion.div 上的 exit 永远不会播放（PackOpenModal 犯过同一个错，见 docs/检查-开卡包与开匣.md #2）。
    //   改为在 JSX 里条件渲染 `{isOpen && ...}`，交给 AnimatePresence 管进出场。

    const meta = result ? safeMeta(result.rarity) : (next ? safeMeta(next.rarity) : undefined);
    const armDef = result?.armamentId ? getEquipmentById(result.armamentId) : undefined;
    // [2026-10-02 #14] 溢出（转万能）合计 —— 原来只散落在每行小标签里
    const totalUniversal = (result?.shardDetail ?? []).reduce((s, d) => s + (d.overflow > 0 ? d.overflow : 0), 0);
    const detailChest = detailIndex !== null ? chests[detailIndex] : undefined;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="chest-open-root"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/85 backdrop-blur-md"
                    onClick={() => { if (phaseRef.current !== 'opening') { eventBus.emit(GameEvents.UI_BACK); onClose(); } }}
                >
                    <div style={{ transform: `scale(${gameScale})` }} onClick={(e) => e.stopPropagation()}>
                        <motion.div
                            initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                            className="relative w-[900px] min-h-[420px] rounded-3xl bg-gradient-to-b from-slate-900 via-purple-950/40 to-slate-900 border border-purple-500/30 p-8 flex flex-col items-center gap-4 shadow-[0_0_80px_rgba(88,28,135,0.5)]"
                        >
                            {/* 标题 */}
                            <div className="flex items-center gap-2">
                                <Package size={28} className="text-purple-300" />
                                <h3 className="text-3xl font-black tracking-widest text-white">奖励匣</h3>
                            </div>
                            <p className="text-xs text-purple-300/70 font-mono tracking-wider">
                                待打开匣子 ×{chests.length}
                            </p>

                            {/* ══ [2026-10-04 程拍板] ⚡ 一键全开（≥2 个时才出现 —— 1 个时与单开无差别）══ */}
                            {onOpenAllChests && phase === 'select' && chests.length > 1 && (
                                <button
                                    onClick={handleOpenAll}
                                    className="px-7 py-2.5 rounded-xl font-black tracking-widest bg-gradient-to-r from-cyan-600 to-teal-400 text-white hover:scale-105 transition-all shadow-[0_0_25px_rgba(34,211,238,0.5)]"
                                >
                                    ⚡ 一键全开（×{chests.length}）
                                </button>
                            )}
                            {/* 一键进度 / 汇总（逐个播期间显示进度，播完显示汇总） */}
                            {bulkTotal > 1 && (
                                <p className="text-xs font-mono tracking-wider" style={{ color: '#a5f3fc' }}>
                                    {bulkDone < bulkTotal
                                        ? `⚡ 一键开启中… ${Math.min(bulkDone + 1, bulkTotal)}/${bulkTotal}`
                                        : `⚡ 本次一键开启 ${bulkTotal} 个匣子 —— 已全部入账`}
                                </p>
                            )}

                            {/* ══ 选择匣子（N3：点哪个开哪个）══ */}
                            {phase === 'select' && chests.length > 0 && (
                                <>
                                    <p className="text-sm text-gray-300 -mt-1">选择要开启的匣子</p>
                                    <div className="grid grid-cols-4 gap-4 w-full max-h-[420px] overflow-y-auto pr-1">
                                        {chests.map((c, i) => {
                                            const cm = safeMeta(c.rarity);
                                            return (
                                                <motion.div
                                                    key={`${c.kind}_${c.rarity}_${i}`}
                                                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                                                    transition={{ delay: Math.min(i, 11) * 0.03 }}
                                                    className="relative rounded-2xl border border-white/10 bg-black/30 hover:bg-black/10 hover:border-white/30 transition-all p-3 flex flex-col items-center gap-2 group"
                                                >
                                                    {/* 点卡片任意处 = 开启这个匣子 */}
                                                    <button
                                                        onClick={() => handleOpen(i)}
                                                        className="absolute inset-0 rounded-2xl z-0 cursor-pointer"
                                                        title={`开启：${cm.label}·${CHEST_KIND_LABEL[c.kind]}`}
                                                    />
                                                    <div className="relative z-10 pointer-events-none" style={{ width: 104, height: 104 }}>
                                                        <div className="absolute inset-0" style={{ clipPath: HEXAGON, background: cm.color, filter: `drop-shadow(0 0 16px ${cm.color}aa)` }} />
                                                        <div className="absolute inset-[3px] flex flex-col items-center justify-center gap-1" style={{ clipPath: HEXAGON, background: '#0d1320' }}>
                                                            <Package size={32} className="text-white/85" />
                                                            <span className="text-[11px] font-black" style={{ color: cm.color }}>
                                                                {c.kind === 'armament' ? '武装' : '碎片'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="relative z-10 pointer-events-none text-sm font-black text-white text-center leading-tight">
                                                        {cm.label}·{CHEST_KIND_LABEL[c.kind]}
                                                    </div>
                                                    {/* [2026-10-02 N4] 查看详情（阻止冒泡，避免误触发开启） */}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_CLICK); setDetailIndex(i); }}
                                                        className="relative z-10 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/25 text-white/85 text-[11px] font-bold tracking-wider transition-all"
                                                    >
                                                        🔍 查看详情
                                                    </button>
                                                    <span className="relative z-10 pointer-events-none text-[10px] text-amber-200/80 font-bold opacity-0 group-hover:opacity-100 transition-all">
                                                        点击卡片开启
                                                    </span>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            {/* 队列空 */}
                            {phase === 'select' && chests.length === 0 && (
                                <div className="flex flex-col items-center gap-4 py-10">
                                    <p className="text-gray-400">没有待打开的匣子了</p>
                                    <button onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                                        className="px-8 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black tracking-widest transition-all">
                                        完成
                                    </button>
                                </div>
                            )}

                            {/* ══ 开盖光爆演出（#12）══ */}
                            {phase === 'opening' && chests[openingIndex] && (() => {
                                const om = safeMeta(chests[openingIndex].rarity);
                                return (
                                    <div className="relative flex flex-col items-center justify-center gap-6 py-6" style={{ minHeight: 300 }}>
                                        {/* 白光爆 */}
                                        <motion.div
                                            className="pointer-events-none absolute"
                                            style={{ width: 420, height: 420, borderRadius: '50%', background: `radial-gradient(circle, #fff 0%, ${om.color}cc 35%, transparent 70%)` }}
                                            initial={{ opacity: 0, scale: 0.4 }}
                                            animate={{ opacity: [0, 0.85, 0], scale: [0.4, 1.15, 1.6] }}
                                            transition={{ duration: 1.1, ease: 'easeOut' }}
                                        />
                                        {/* 品质色冲击环 */}
                                        <motion.div
                                            className="pointer-events-none absolute"
                                            style={{ width: 220, height: 220, clipPath: HEXAGON, border: `4px solid ${om.color}`, filter: `drop-shadow(0 0 20px ${om.color})` }}
                                            initial={{ opacity: 0.95, scale: 0.7, rotate: 0 }}
                                            animate={{ opacity: 0, scale: 2.6, rotate: 40 }}
                                            transition={{ duration: 1.05, ease: 'easeOut' }}
                                        />
                                        {/* 匣体：放大 + 旋转 + 晃动 */}
                                        <motion.div
                                            className="relative z-10"
                                            style={{ width: 168, height: 168 }}
                                            initial={{ scale: 1, rotate: 0 }}
                                            animate={{ scale: [1, 1.14, 1.32], rotate: [0, -10, 8] }}
                                            transition={{ duration: 1.1, ease: 'easeInOut' }}
                                        >
                                            <div className="absolute inset-0" style={{ clipPath: HEXAGON, background: om.color, filter: `drop-shadow(0 0 26px ${om.color})` }} />
                                            <div className="absolute inset-[4px] flex flex-col items-center justify-center gap-1.5" style={{ clipPath: HEXAGON, background: '#0d1320' }}>
                                                <Package size={54} className="text-white/90" />
                                                <span className="text-sm font-black" style={{ color: om.color }}>
                                                    {chests[openingIndex].kind === 'armament' ? '武装' : '碎片'}
                                                </span>
                                            </div>
                                        </motion.div>
                                        {/* 碎片飞散 */}
                                        {Array.from({ length: 8 }).map((_, i) => {
                                            const a = (Math.PI * 2 * i) / 8;
                                            return (
                                                <motion.span
                                                    key={i}
                                                    className="absolute z-20 w-2 h-2 rounded-full"
                                                    style={{ background: om.color, boxShadow: `0 0 10px ${om.color}` }}
                                                    initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
                                                    animate={{ opacity: [0, 1, 0], x: Math.cos(a) * 150, y: Math.sin(a) * 150, scale: [0.6, 1.2, 0.4] }}
                                                    transition={{ duration: 0.95, delay: 0.18, ease: 'easeOut' }}
                                                />
                                            );
                                        })}
                                        <motion.p
                                            className="relative z-10 text-lg font-black tracking-[0.3em]"
                                            style={{ color: om.color, textShadow: `0 0 18px ${om.color}aa` }}
                                            initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1] }} transition={{ duration: 1.0 }}
                                        >
                                            开 启 中…
                                        </motion.p>
                                    </div>
                                );
                            })()}

                            {/* ══ 结果 ══ */}
                            {phase === 'result' && result && meta && (
                                <>
                                    <div className="text-lg font-black tracking-widest" style={{ color: meta.color, textShadow: `0 0 18px ${meta.color}88` }}>
                                        {result.kind === 'shard'
                                            ? '💠 获得神格碎片 💠'
                                            : result.overflowDataGold
                                                ? '💰 库存已满 · 折算数据金 💰'
                                                : '✨ 获得武装 ✨'}
                                    </div>

                                    {/* 武装匣结果 —— [2026-10-04 ②] 新增"库存全满 ⇒ 折算数据金"分支：
                                        原先没有这个分支 ⇒ 会把折算结果当成"未知武装"报错文案糊弄过去（审查 #9）。 */}
                                    {result.kind === 'armament' && (
                                        result.overflowDataGold ? (
                                            <>
                                                <div className="flex items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-400/10" style={{ width: 132, height: 132 }}>
                                                    <Coins size={56} className="text-amber-300" />
                                                </div>
                                                <div className="text-xl font-black text-amber-200">数据金 +{result.overflowDataGold}</div>
                                                <span className="text-xs px-2 py-0.5 rounded font-mono text-amber-200 border border-amber-300/40 bg-amber-400/10">
                                                    {meta.label} · 武装库存已满
                                                </span>
                                                <p className="text-sm text-gray-200 text-center leading-relaxed max-w-[620px]">
                                                    该品质武装的库存都已达上限（同种 {MAX_ARMAMENT_STOCK} 份）⇒ 本匣<b className="text-amber-200">自动折算为数据金</b>，没有白开。
                                                </p>
                                            </>
                                        ) : (
                                        <>
                                            <div className="relative" style={{ width: 132, height: 132 }}>
                                                <div className="absolute inset-0" style={{ clipPath: HEXAGON, background: meta.color, filter: `drop-shadow(0 0 18px ${meta.color}aa)` }} />
                                                <div className="absolute inset-[3px] overflow-hidden flex items-center justify-center" style={{ clipPath: HEXAGON, background: '#0d1320' }}>
                                                    {armDef
                                                        ? <img src={armDef.icon} alt={armDef.name} className="w-full h-full object-cover" draggable={false} />
                                                        : <Package size={52} className="text-white/70" />}
                                                </div>
                                            </div>
                                            {/* [2026-10-02 #13] 兜底：armDef 查不到时不再整块空白 */}
                                            <div className="text-xl font-black text-white">{armDef?.name ?? '未知武装'}</div>
                                            <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ color: meta.color, border: `1px solid ${meta.color}55`, background: `${meta.color}11` }}>
                                                {meta.label}
                                            </span>
                                            <p className="text-sm text-gray-200 text-center leading-relaxed max-w-[620px]">
                                                {armDef?.description ?? '该武装的定义已缺失（可能被改名或移除），已按原品质随机发放，请查看武装库存。'}
                                            </p>
                                        </>
                                        )
                                    )}

                                    {/* 碎片匣结果（[2026-10-02 N5] 六边形大图标网格 + 下方数量，不再一行行横条） */}
                                    {result.kind === 'shard' && (
                                        <>
                                            <div className="flex items-center gap-2 text-sm text-gray-300">
                                                <span>共开出 <span className="text-cyan-300 font-black text-base">{result.shardAmount}</span> 片</span>
                                                {totalUniversal > 0 && (
                                                    <span className="px-2 py-0.5 rounded bg-amber-400/15 text-amber-200 border border-amber-300/30 text-[11px] font-bold"
                                                        title="有英雄已练满六格神格神经，其后再获得的专属碎片 1:1 转为万能碎片">
                                                        其中万能 +{totalUniversal}
                                                    </span>
                                                )}
                                                <span className="text-[11px] text-gray-500">每 {SHARD_GROUP_SIZE} 片一组 · 随机归属</span>
                                            </div>
                                            <div className="w-full max-h-[400px] overflow-y-auto pr-1">
                                                <div className="grid grid-cols-4 gap-x-3 gap-y-5 justify-items-center">
                                                    {(result.shardDetail ?? []).map((d, i) => {
                                                        const heroName = CARD_DB[d.heroKey]?.name ?? d.heroKey;
                                                        return (
                                                            <motion.div
                                                                key={d.heroKey}
                                                                className="flex flex-col items-center gap-1.5 w-[130px]"
                                                                initial={{ opacity: 0, scale: 0.6, y: 12 }}
                                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                transition={{ delay: i * 0.07, type: 'spring', stiffness: 320, damping: 20 }}
                                                            >
                                                                {/* 六边形（品质色环）+ 内部菱形神格碎片图标 */}
                                                                <div className="relative" style={{ width: 104, height: 104 }}>
                                                                    <div className="absolute inset-0" style={{ clipPath: HEXAGON, background: meta.color, filter: `drop-shadow(0 0 16px ${meta.color}aa)` }} />
                                                                    <div className="absolute inset-[3px]" style={{ clipPath: HEXAGON, background: '#0d1320' }} />
                                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                                        <ShardIcon heroKey={d.heroKey} size={56} />
                                                                    </div>
                                                                </div>
                                                                <div className="text-xs font-bold text-white text-center leading-tight">{heroName}</div>
                                                                <div className="font-mono font-black text-cyan-200 text-xl leading-none">×{d.amount}</div>
                                                                {d.overflow > 0 && (
                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-200 border border-amber-300/30"
                                                                        title="该英雄已练满六格神格神经，超出部分 1:1 转为万能碎片">
                                                                        溢出 +{d.overflow} 万能
                                                                    </span>
                                                                )}
                                                            </motion.div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* 按钮：继续开 / 完成 */}
                                    <div className="flex gap-2.5 mt-1">
                                        {chests.length > 0 && (
                                            <button
                                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setResult(null); setPh('select'); }}
                                                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-black tracking-widest hover:scale-105 transition-all shadow-[0_0_25px_rgba(250,204,21,0.45)]"
                                            >
                                                🔓 继续开匣（×{chests.length}）
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                                            className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black tracking-widest transition-all"
                                        >
                                            {chests.length > 0 ? '收起' : '完成'}
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* 关闭 */}
                            {phase !== 'opening' && (
                                <button onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }} className="absolute top-4 right-4 p-2 rounded-full text-gray-500 hover:bg-white/10 hover:text-white transition-all">
                                    <X size={20} />
                                </button>
                            )}
                        </motion.div>
                    </div>

                    {/* ══ [2026-10-02 N4] 匣子详情弹窗（portal 到 body，z 高于本弹窗）══ */}
                    {detailChest && (() => {
                        const dm = safeMeta(detailChest.rarity);
                        const isArm = detailChest.kind === 'armament';
                        const pool = isArm ? getArmamentChestPool(detailChest.rarity) : [];
                        // [2026-10-04 ②] 预览必须与**实际抽取**同源：实际口径是"优先抽库存未满的、全满才折算数据金"
                        //   （`pickArmamentFromChest`）⇒ 这里也按库存标注，否则又是"UI 承诺 ≠ 实际产出"。
                        const stockNow = armamentStock ?? {};
                        const withRoom = pool.filter(a => hasArmamentRoom(stockNow, a.id));
                        const allFull = isArm && pool.length > 0 && withRoom.length === 0;
                        return createPortal(
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/70"
                                onClick={(e) => { e.stopPropagation(); setDetailIndex(null); }}
                            >
                                <div style={{ transform: `scale(${gameScale})` }}>
                                    <motion.div
                                        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                                        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                                        className="w-[640px] max-h-[840px] rounded-2xl border p-6 flex flex-col items-center gap-3 shadow-[0_0_60px_rgba(0,0,0,0.9)]"
                                        style={{ background: dm.cardBg, borderColor: `${dm.color}66`, boxShadow: `0 0 40px ${dm.color}44` }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="text-lg font-black tracking-widest" style={{ color: dm.color, textShadow: `0 0 18px ${dm.color}88` }}>
                                            🔍 匣子详情
                                        </div>
                                        <div className="text-xl font-black text-white">
                                            {dm.label}·{CHEST_KIND_LABEL[detailChest.kind]}
                                        </div>

                                        {isArm ? (
                                            <>
                                                <p className="text-sm text-gray-200 text-center leading-relaxed">
                                                    {allFull ? (
                                                        <>本品质武装<b className="text-amber-200">库存均已满</b>（同种上限 {MAX_ARMAMENT_STOCK}）
                                                            ⇒ 开启后<b className="text-amber-200">折算为数据金 +{getArmamentOverflowDataGold(detailChest.rarity)}</b>，不会白开。</>
                                                    ) : (
                                                        <>开启后从下列 <span className="text-amber-200 font-black">{withRoom.length}</span> 件<b className="text-amber-200">库存未满</b>的武装中随机获得 1 件；
                                                            <span className="text-gray-400">标「已满」的本次<b className="text-amber-200">不会</b>被抽到（它们满到上限才折算数据金）。</span></>
                                                    )}
                                                </p>
                                                <div className="w-full max-h-[483px] overflow-y-auto pr-1">
                                                    <div className="grid grid-cols-3 gap-3">
                                                        {pool.map(a => {
                                                            const full = !hasArmamentRoom(stockNow, a.id);
                                                            return (
                                                            <div key={a.id} className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-black/40 border ${full ? 'border-amber-400/30 opacity-60' : 'border-white/10'}`}>
                                                                <div className="relative shrink-0" style={{ width: 40, height: 40 }}>
                                                                    <div className="absolute inset-0" style={{ clipPath: HEXAGON, background: RARITY_META[a.rarity]?.color ?? dm.color }} />
                                                                    <div className="absolute inset-[2px] overflow-hidden flex items-center justify-center" style={{ clipPath: HEXAGON, background: '#0d1320' }}>
                                                                        <img src={a.icon} alt={a.name} className="w-full h-full object-cover" draggable={false} />
                                                                    </div>
                                                                </div>
                                                                <span className="text-xs font-bold text-white leading-tight">{a.name}</span>
                                                                {full && <span className="ml-auto shrink-0 text-[10px] font-black text-amber-300/90">已满</span>}
                                                            </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="flex flex-col items-center gap-2 py-2">
                                                    <div className="relative" style={{ width: 108, height: 108 }}>
                                                        <div className="absolute inset-0" style={{ clipPath: HEXAGON, background: dm.color, filter: `drop-shadow(0 0 16px ${dm.color}aa)` }} />
                                                        <div className="absolute inset-[3px]" style={{ clipPath: HEXAGON, background: '#0d1320' }} />
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <ShardIcon size={56} />
                                                        </div>
                                                    </div>
                                                    <div className="text-2xl font-black text-cyan-200">×{SHARD_CHEST_AMOUNT[detailChest.rarity]}</div>
                                                    <div className="text-sm text-gray-200">片神格碎片</div>
                                                </div>
                                                <p className="text-sm text-gray-200 text-center leading-relaxed">
                                                    每 {SHARD_GROUP_SIZE} 片为一组，<b className="text-cyan-200">每组随机归属一位天启者</b>（可能一组给同一人、也可能分散给多人）。
                                                </p>
                                                <p className="text-[11px] text-cyan-300/80 text-center">
                                                    万能碎片不会从这里开出（唯一来源：每日任务 + 专属碎片溢出转化）
                                                </p>
                                            </>
                                        )}

                                        <button
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setDetailIndex(null); }}
                                            className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black tracking-widest transition-all mt-1"
                                        >
                                            关闭
                                        </button>
                                    </motion.div>
                                </div>
                            </motion.div>,
                            document.body,
                        );
                    })()}
                </motion.div>
            )}

            {/* [2026-10-04 程拍板] 一键开匣 · **完整结果汇总窗**（连播全部播完后弹出）
                ⚠️ 必须放在 `</AnimatePresence>` 之内：本组件 return 的是 createPortal(单个根)，同级并列会破坏 JSX 单根 */}
            <BulkOpenSummaryModal
                key="bulk-summary"
                open={summaryOpen}
                title="本次一键开匣结果"
                items={bulkList.map<BulkSummaryItem>(r => {
                    if (r.kind === 'armament') {
                        const d = r.armamentId ? getEquipmentById(r.armamentId) : undefined;
                        return { name: d?.name ?? '未知武装', rarity: r.rarity, icon: d?.icon, kindLabel: '武装', note: d?.description };
                    }
                    // [2026-10-04 莉莉子 BUG修复] 溢出（已 1:1 转万能）的那部分**不能算作该英雄所得**。
                    //   旧写法直接把 `x.amount`（gross 分配量）写成"该英雄 +N" ⇒
                    //   练满的英雄在汇总窗里显示成"还在涨"，而实际全进了万能、窗口里也看不到万能。
                    const details = r.shardDetail ?? [];
                    const overflowSum = details.reduce((s, x) => s + (x.overflow > 0 ? x.overflow : 0), 0);
                    const detail = details
                        .map(x => {
                            const heroName = CARD_DB[x.heroKey]?.name ?? x.heroKey;
                            const ov = x.overflow > 0 ? x.overflow : 0;
                            const credited = Math.max(0, x.amount - ov);
                            return ov > 0
                                ? `${heroName} +${credited}（溢出 ${ov} 万能）`
                                : `${heroName} +${credited}`;
                        })
                        .join(' · ');
                    return {
                        name: `神格碎片 ×${r.shardAmount ?? 0}`,
                        rarity: r.rarity,
                        kindLabel: '碎片',
                        note: overflowSum > 0 ? `${detail} ｜ 其中万能 +${overflowSum}` : detail,
                    };
                })}
                onClose={() => setSummaryOpen(false)}
            />
        </AnimatePresence>,
        document.body,
    );
};
