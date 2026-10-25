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
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, X, Ticket } from 'lucide-react'; // [2026-10-20 匣券] 移除 Coins（结果页不再展示折算数据金）
import { ShardIcon } from './ShardIcon'; // [2026-09-29 程拍板] 神格碎片图标（头像裁进菱形 / 万能橙菱形）
import { RARITY_META } from './RarityIcon';
import { getEquipmentById } from '../../data/equipment';
import { getArmamentChestPool } from '../../logic/armamentChestPool'; // [2026-10-02] 预览与实际抽取共用同一个池
import { hasArmamentRoom } from '../../data/roguelike/armamentStock'; // [2026-10-04 ②] 预览按库存标注（与抽取同源）· [2026-10-20] 重复改发匣券（不再折数据金）⇒ 移除 MAX_ARMAMENT_STOCK / getArmamentOverflowDataGold
import { voucherYieldOf, VOUCHER_RARITY_LABEL } from '../../data/roguelike/armamentVoucher'; // [2026-10-20 程拍板] 重复武装 → 匣券
import { CARD_DB } from '../../data/cards';
import { getGameScale } from '../../utils/gameScale';
// [2026-10-21 手机实测修复] 画布内 / portal 内的内层缩放统一走 platform 层（组件里禁写 isNative）
import { pickPortalContainScale, pickPortalScale } from '../../platform/tuning';
import { eventBus, GameEvents } from '../../utils/eventBus'; // [2026-10-14 莉莉子 🖱️] 关闭/详情 音效
import { BulkOpenSummaryModal, type BulkSummaryItem } from './BulkOpenSummaryModal'; // [2026-10-04 程拍板] 一键开匣的完整结果汇总窗
import { CHEST_KIND_LABEL, SHARD_CHEST_AMOUNT, SHARD_GROUP_SIZE,
    type ChestInstance,
} from '../../data/roguelike/divinityShards';
// [2026-10-20 莉莉子 🎨 视觉层优化] 匣子插画唯一真源（UI 侧不出现裸图片路径）
import { getChestArt, getChestArtName, VOUCHER_ART } from '../../data/roguelike/chestArt';

/** openChest 的返回结构（与 useUserSystem.openChest 对齐） */
export interface ChestOpenResult {
    kind: ChestInstance['kind'];
    rarity: ChestInstance['rarity'];
    armamentId?: string;
    /** [2026-10-20 匣券] 该档武装已全部拥有时获得的**匣券数量**（有值 = 本次没发武装、发的是券） */
    voucherGained?: number;
    /** @deprecated [2026-10-20] 重复已改发匣券，本字段不再产生；保留以兼容旧读取方 */
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
     * ⚡ 一键全开用的**批量结算**（= `userSystem.openAllChests()`）。
     *
     * 🔄 [2026-10-21 程拍板 · 架构改造] 语义已变，**不再**是"逐个播演出的数据源"：
     *   · 逐个开（边播边开）走的是 `onOpenChest(0)`——**可以**逐个调，见下
     *   · 本函数现在**只被「⏭ 跳过」用**：把剩余匣子一次性结算掉（最快），一起进汇总
     *
     * ⚠️ 订正一条**已过时**的旧注释（原文写「必须用它，不要在这里循环调 `onOpenChest(0)`」）：
     *   那条理由（`openChest` 用闭包 settings 取下标 ⇒ 连调会反复开同一个）在
     *   **2026-10-20 加同步镜像之后已不成立** —— `openChest` 现在读 `pendingChestsRef.current`
     *   取件、并在移除时同步回写该 ref（见 `useUserSystem.openChest`）。
     *   ⇒ 本组件正是靠"逐发异步调 `onOpenChest(0)`"实现边播边开；**千万别按旧注释把它改回
     *     一次性预开**，那会让「⏹ 停止」重新退化成假中止（包早被消耗光）。
     *   ⚠️ 但**结算**那一步（`readArmStock(settings)`）仍读闭包 settings ⇒ 必须逐发异步
     *     （本组件靠 700ms 间隔 + 每次渲染刷新 `onOpenChestRef` 保证拿到新闭包）。
     */
    onOpenAllChests?: () => ChestOpenResult[];
    /**
     * [2026-10-04 ②] 武装库存（`armamentStock`）—— **只为"详情预览说真话"**：
     *   实际抽取已改为"优先抽库存未满的、**整档集齐**才换匣券"（`pickArmamentFromChest`），
     *   预览必须按同一口径标注，否则又变成"UI 承诺 ≠ 实际产出"。
     * 未传（向后兼容）时预览退回旧文案。
     */
    armamentStock?: Record<string, number>;
}

const HEXAGON = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
const OPEN_DUR = 1200; // [2026-10-02 #12] 开盖光爆演出时长（ms），到点才真正开匣

/**
 * [2026-10-20 莉莉子 🎨] 插画兜底：图加载失败 ⇒ 隐藏 img，并把同一格里带 `data-art-fallback` 的 lucide 图标显形。
 * 说明：兜底图标平时 `opacity-0`（垫在插画底下）—— 券/万能碎片这两张图**带透明通道**，
 *   若兜底常显会从插画透出来；匣子插画则是不透明的方形整图，正常永远盖住兜底。
 */
const hideBrokenChestArt = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    img.style.visibility = 'hidden';
    const fb = img.parentElement?.querySelector<HTMLElement>('[data-art-fallback]');
    if (fb) fb.style.opacity = '1';
};

type Phase = 'select' | 'opening' | 'result';

export const ChestOpenModal: React.FC<ChestOpenModalProps> = ({
    isOpen, chests, onOpenChest, onClose, onShardDrop, onOpenAllChests, armamentStock,
}) => {
    const [phase, setPhase] = useState<Phase>('select');
    // [2026-10-21 修复] 原 `const [openingIndex, setOpeningIndex] = useState(0)` 已删除：
    //   演出块改用 `openingChestRef` 直存"这一枚匣子"后，该 state 再无任何**读取点**
    //   （批量时它本来也恒为 0 ⇒ 就算队列没空也会指错人）。
    const [result, setResult] = useState<ChestOpenResult | null>(null);
    const [detailIndex, setDetailIndex] = useState<number | null>(null); // 详情弹窗看的是第几个匣子
    const gameScale = getGameScale();

    /**
     * [2026-10-24 莉莉子 · 手机端「窗口太大」修复] 面板**实测高度**，喂给 contain 缩放。
     * ── 病根：内层缩放原来只按「占屏 94% 宽」反解（手机 k ≈ 2.38），
     *    高度被同一个 k 一起抬上去 ⇒ 面板视觉高约 570 CSS px，而手机横屏只有 393 ⇒ 溢出。
     * ── 为什么不写死一个"设计高"：本弹窗高度**随内容在 420~640 之间浮动**
     *    （网格 `max-h-[420px]` / 开场 `minHeight:300` / 结果 `max-h-[400px]`），
     *    写死会要么算小（浪费空间）要么算大（继续溢出）⇒ 直接量 `offsetHeight`。
     * ── 用 `useLayoutEffect`：测量与修正发生在**绘制前**，不会闪一下大窗。
     *    `ResizeObserver` 兜住阶段切换／图片加载导致的高度变化。
     */
    const panelRef = useRef<HTMLDivElement>(null);
    const [panelH, setPanelH] = useState(640); // 初值取"内容最坏情况"的估算，实际值在首帧绘制前就会被量出来
    useLayoutEffect(() => {
        const el = panelRef.current;
        if (!el) return;
        const update = () => setPanelH(el.offsetHeight || 640);
        update();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

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
        openingChestRef.current = null;   // [2026-10-21] 复位演出目标（原为 setOpeningIndex(0)）
        // [2026-10-21 P0-② 修复] 批量状态**必须一起复位**。
        //   原来只清了单发那几个，漏了 bulk* 一族 ⇒ 中途关闭再打开时：
        //     ① 进度行照旧渲染「⚡ 一键开启中… k/N」，而「⚡ 一键全开」按钮也在 ⇒ 自相矛盾的 UI
        //     ② 关闭恰好发生在队列刚空那一刻 ⇒ **下次打开才弹上一批的汇总窗**
        // [2026-10-21 P0-③] 顺带把批量排队定时器收掉（关窗并不改 phase/bulkTotal，那条 effect 的 cleanup 收不走它）
        bulkRef.current = false;
        setBulkTotal(0);
        setBulkDone(0);
        setBulkList([]);
        setSummaryOpen(false);
        if (bulkQueueTimerRef.current !== null) { clearTimeout(bulkQueueTimerRef.current); bulkQueueTimerRef.current = null; }
        return clearTimer;
        // 🔎 [2026-10-21 审查 P3] 原有 `eslint-disable-next-line` 已被判 unused（消费的都是 ref/稳定 setter）
        //   ⇒ 删掉，让 `npm run lint` 能过。
    }, [isOpen]);

    // [2026-10-02 #15] ESC：详情 → 关详情；开启中 → 忽略；其余 → 关弹窗
    // [2026-10-21 P0-①] 批量连播中：ESC 也要**先给结果**（否则整批汇总就永久丢了）
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return; eventBus.emit(GameEvents.UI_BACK);
            e.stopImmediatePropagation();
            if (detailIndex !== null) { setDetailIndex(null); return; }
            if (phaseRef.current === 'opening') return;
            if (bulkBusyRef.current) {
                // 与「停止播放」同一收口
                clearTimer();
                if (bulkQueueTimerRef.current !== null) { clearTimeout(bulkQueueTimerRef.current); bulkQueueTimerRef.current = null; }
                bulkRef.current = false;
                setBulkDone(bulkTotalRef.current);
                setSummaryOpen(true);
                return;
            }
            onClose();
        };
        window.addEventListener('keydown', onKey, { capture: true });
        return () => window.removeEventListener('keydown', onKey, { capture: true });
        // ⚠️ 这里读 ref 而不是 state：它们声明在本 effect 之下（进依赖数组会踩 TDZ），ref 每次触发都是最新值
    }, [isOpen, detailIndex, onClose]);

    const next = useMemo(() => chests[0], [chests]);
    const safeMeta = (r: ChestInstance['rarity']) => RARITY_META[r] ?? RARITY_META.common;

    /** [2026-10-02 #12 / #11] 点某个匣子：先播演出，**演出结束才真正开**（关掉即不消耗） */
    const handleOpen = (index: number) => {
        if (phaseRef.current === 'opening') return; // 同步守卫：同一帧内连点也拦得住
        if (!chests[index]) return;
        bulkRef.current = false;        // [2026-10-04] 单开：退出批量模式并清队列
        setBulkTotal(0);
        setBulkDone(0);
        openingChestRef.current = chests[index] ?? null;   // [2026-10-21] 演出渲染只认它（见 ref 处注释）
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
    const bulkRef = useRef(false);             // 是否批量模式（只用来决定演出时长）
    /**
     * [2026-10-21 修复 · 程确认「这个确实有点严重」] **正在演出的是哪一枚匣子**。
     *
     * 🐛 病根：演出块的开关条件是 `phase === 'opening' && chests[openingIndex]`，而
     *   `openAllChests()` 会**一次把待开队列清空**（`useUserSystem` 里先清 ref 再逐个结算）
     *   ⇒ 批量时 `chests === []` ⇒ **整段开盖演出（白光爆 / 品质色冲击环 / 匣体放大晃动 /
     *   碎片飞散）一次都不渲染**，420ms 的 opening 期屏幕上只剩一个标题栏。
     *   而且 `playOne` 从不更新 `openingIndex`，所以就算队列没空也会指错人。
     *   这条红线（「每发必须播完整 opening 演出」）从 2026-10-04 起就一直在破。
     *
     * ✅ 修法：演出开始时把"这一枚"存下来，单开 / 批量两条路都写它，渲染只认它。
     */
    const openingChestRef = useRef<{ kind: ChestInstance['kind']; rarity: ChestInstance['rarity'] } | null>(null);
    /**
     * [2026-10-21 P0-③ 修复] 批量排队的 `setTimeout` id。
     * 病根与前一轮 `PackOpenModal` 同型：那个定时器只由「phase / bulkTotal 变化」的 cleanup 收走，
     * **关窗并不改这两个值** ⇒ 关窗后它照样到点执行 `playOne` ⇒ 幽灵演出/幽灵汇总。
     */
    const bulkQueueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** [2026-10-21 P0-①] 供上面的 ESC 监听读取（二者声明在本 effect 之下，直接进依赖数组会踩 TDZ） */
    const bulkBusyRef = useRef(false);
    const bulkTotalRef = useRef(0);
    /**
     * [2026-10-21 架构改造] `onOpenChest` 的**最新镜像**。
     *
     * 为什么必须有：`openChest`（`useUserSystem`）里 `readArmStock(settings)` 读的是**闭包 settings**，
     * 而 `setTimeout` 回调捕获的是**创建那次渲染的 prop** ⇒ 逐个开匣时若用旧闭包，
     * 同批第二个武装匣的"该档是否已集满"会算错（多发/误判溢出）。
     * ⇒ 每次渲染把最新 prop 写进 ref，异步回调统一读 `onOpenChestRef.current`。
     */
    const onOpenChestRef = useRef(onOpenChest);
    onOpenChestRef.current = onOpenChest;
    const [bulkTotal, setBulkTotal] = useState(0);
    const [bulkDone, setBulkDone] = useState(0);
    // [2026-10-04 程拍板] 本次一键的**完整结果** —— 全部播完后单开一个窗展示
    const [bulkList, setBulkList] = useState<ChestOpenResult[]>([]);
    const [summaryOpen, setSummaryOpen] = useState(false);

    /** 收尾：退出批量 + 弹汇总（**只含已经播过演出的那些**） */
    const finishBulk = () => {
        bulkRef.current = false;
        setBulkDone(bulkTotalRef.current);
        // [2026-10-21 BUG 修复] 收掉可能开着的匣子详情窗（它是 z-[1600]，比汇总窗 z-[1400] 高，
        //   开着就会盖住汇总结果）。批量中玩家确实可能手动点开某个匣子的详情。
        setDetailIndex(null);
        setSummaryOpen(true);
    };

    /**
     * 播**下一发**（批量专用）：拿队首匣子放演出，**到点才真正开那一个**。
     *
     * [2026-10-21 程拍板 · **架构改造：边播边开**]
     *   原来 `handleOpenAll` 用 `onOpenAllChests()` **一次结算全部**并清空队列 ⇒
     *   「停止」不可能真中止（匣子早被消耗光），产物也已经全发出去了。
     *   现在演出时才开那一个 ⇒ 停止时剩下的匣子**原封不动**留在 `pendingChests`。
     *
     * ✅ 顺带彻底满足 2026-10-04 审查 #8 那条「碎片入账不能依赖播放进度」：
     *   改成"开了才入账"之后，**没开的匣子根本没消耗**，不可能出现"队列删了、碎片没到"。
     */
    const playOneNext = () => {
        const chest = chests[0];
        if (!chest) { finishBulk(); return; }          // 真的没有匣子了
        openingChestRef.current = chest;
        setPh('opening');
        clearTimer();
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            const res = onOpenChestRef.current(0);     // 开队首；用**最新**闭包保证库存判定正确
            if (!res) { finishBulk(); return; }        // 竞态兜底：队列其实已经空了
            // 碎片入账：**开了才入账**（单开/批量同一口径，不再需要在 handleOpenAll 里预入账）
            if (res.kind === 'shard' && onShardDrop) onShardDrop(res);
            setResult(res);
            setPh('result');
        }, bulkRef.current ? BULK_OPEN_DUR : OPEN_DUR);
    };

    /**
     * ⚡ 一键全开 —— [2026-10-21 程拍板 · **架构改造：边播边开**]
     *
     * 🔄 原来用 `onOpenAllChests()` 一次结算全部并清空队列 ⇒「停止」不可能真中止。
     * ✅ 现在只开**第一个**，之后每播完一发再开下一个。于是
     *   ·「停止开匣」= 不再开 ⇒ 剩下的匣子**原封不动**留在 `pendingChests`
     *   ·「⏭ 跳过」   = 把剩余的一次结算掉（走 `onOpenAllChests`，最快）⇒ 一起汇总
     */
    const handleOpenAll = () => {
        if (phaseRef.current === 'opening') return;
        if (!onOpenChest) return;
        if (!chests[0]) return;                 // 一个匣子都没有
        bulkRef.current = true;
        setBulkList([]);                        // 结果从零累积：开一个记一个
        setSummaryOpen(false);
        setBulkTotal(chests.length);            // 计划开几个（进度行用）
        setBulkDone(0);
        setDetailIndex(null);
        playOneNext();
    };

    // 每一发定格后：记进汇总 → 停一拍 → 播下一发（没有就收尾出汇总）
    useEffect(() => {
        if (phase !== 'result') return;
        if (bulkTotalRef.current <= 0) return;               // 非批量（单开）
        // ① 先记账，再判断要不要继续（与开包侧同口径，避免"已开未记"被丢掉）
        if (result) setBulkList(prev => [...prev, result]);
        // ② 已停止 / 已跳过 ⇒ 只记账，不再开下一个
        if (!bulkRef.current) return;
        // ③ 继续开下一个
        const t = setTimeout(() => {
            bulkQueueTimerRef.current = null;
            setBulkDone(d => d + 1);
            playOneNext();                                   // 没匣子了会自动 finishBulk()
        }, 700);                                             // 定格停留：看清这一发
        // [2026-10-21 P0-③] 登记给复位/关窗收口 —— 只靠本 effect 的 cleanup 收不走（关窗不改 phase/bulkTotal）
        bulkQueueTimerRef.current = t;
        return () => { clearTimeout(t); bulkQueueTimerRef.current = null; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    // ⚠️ [2026-10-02] 刻意**不在这里早退** `return null`：早退会让 AnimatePresence 见不到子树被移除，
    //   下面 motion.div 上的 exit 永远不会播放（PackOpenModal 犯过同一个错，见 docs/检查-开卡包与开匣.md #2）。
    //   改为在 JSX 里条件渲染 `{isOpen && ...}`，交给 AnimatePresence 管进出场。

    /**
     * [2026-10-21 P0-① 修复] 是否处于「批量连播中」（已开抽、还没播完）。
     *
     * 批量途中玩家点「收起 / X / 背景 / ESC」原本直接 `onClose()` ⇒ 汇总窗**永不出现**
     * （产物早已入账，丢的只是展示），而程 2026-10-04 的拍板是"全部开完必须汇总"。
     */
    const bulkBusy = bulkTotal > 0 && bulkDone < bulkTotal;
    bulkBusyRef.current = bulkBusy;      // 渲染期同步，供上面的 ESC 监听读
    bulkTotalRef.current = bulkTotal;

    /**
     * 【⏹ 停止开匣】—— 程拍板：这是**中止**。
     *   不再开下一个 ⇒ 剩下的匣子**原封不动**留在 `pendingChests`（未开启、未消耗）。
     *   汇总窗只含**已经播过演出**的那些。
     *
     * ⚠️ [2026-10-21 审查 P0 修复] 若此刻正在 `opening`（420ms 演出），**必须离开这个态**：
     *   `opening` 期没有底部按钮、右上 X 不渲染、背景点击直接 return、ESC 被吞，
     *   而 `finishBulk()` 又会把 `bulkBusy` 拉成 false ⇒「⏭ 跳过」按钮随之消失
     *   ⇒ **整个弹窗软锁死**：只剩一个静止的"开 启 中…"，没有任何可点元素，只能重开面板。
     *   ⚠️ 落点必须是 `select` 而不是 `result`：`result` 分支带 `result && meta` 守卫，
     *      而此刻 `result` 可能还是 null ⇒ 回 result 照样"什么都不渲染"。
     *      `select` 态有匣子网格 / 一键全开 / 关闭按钮，是安全落点。
     */
    const stopBulk = () => {
        clearTimer();                    // 正在跑的单发演出计时器也停掉
        if (bulkQueueTimerRef.current !== null) { clearTimeout(bulkQueueTimerRef.current); bulkQueueTimerRef.current = null; }
        setDetailIndex(null);            // 详情窗若开着先收，否则会和汇总窗叠两层
        if (phaseRef.current === 'opening') setPh('select');   // ← P0 修复：必须离开 opening
        finishBulk();
    };

    /**
     * 【⏭ 跳过】—— 不想看演出了：把**剩下的匣子也全部开掉**（走 `onOpenAllChests` 一次性结算，最快），
     * 一起进汇总。与「停止开匣」的唯一区别：**跳过会把剩余的匣子消耗掉**，停止不会。
     *
     * ⚠️ 同样必须先离开 `opening`（理由同 stopBulk，否则一样软锁）。
     *   好在"先演后开"意味着 opening 期那一枚**还没被消耗**，仍在队列里 ⇒ `onOpenAllChests` 会把它一起结算，不会丢。
     */
    const skipRest = () => {
        clearTimer();
        if (bulkQueueTimerRef.current !== null) { clearTimeout(bulkQueueTimerRef.current); bulkQueueTimerRef.current = null; }
        setDetailIndex(null);
        if (phaseRef.current === 'opening') setPh('select');   // ← P0 修复：必须离开 opening
        const drained = onOpenAllChests ? onOpenAllChests() : [];
        // 这些是"跳过演出、直接开掉"的，碎片照同一口径入账
        if (onShardDrop) for (const r of drained) { if (r?.kind === 'shard') onShardDrop(r); }
        if (drained.length) setBulkList(prev => [...prev, ...drained]);
        finishBulk();
    };

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
                    onClick={() => {
                        if (phaseRef.current === 'opening') return;
                        eventBus.emit(GameEvents.UI_BACK);
                        // [2026-10-21 P0-①] 批量中先给结果 —— 一次手滑点背景不该让整批汇总永久消失
                        if (bulkBusy) stopBulk(); else onClose();
                    }}
                >
                    {/* 🔴 [2026-10-21 手机实测修复] 原写法 `scale(gameScale)` 是**双重缩放**：
                        本面板在 `ScaleWrapper` 内，祖先已经 `scale(s)`，而 `gameScale` 就是同一个 s
                        ⇒ 实际是 s²。PC 上 s≈1 无感，手机上 s≈0.23 ⇒ 900px 的面板只剩 **48px 宽、字 1.5px**，
                        这就是「开匣界面一塌糊涂」的直接原因。
                        ⇒ 手机端改用 `pickCanvasInnerScale`（按"占屏 94%"反算、不再乘 gameScale）；
                          **PC 端仍原样 `scale(gameScale)`**。
                        （面板宽 900 = 下面 `w-[900px]`，改宽度请同步改这个 900） */}
                    <div style={{
                        // [2026-10-24 莉莉子 · 手机端「窗口太大」修复]
                        //   ⚠️ 本组件是 `createPortal(…, document.body)` 的 ⇒ **在画布之外**，
                        //      祖先的 `scale(s)` 不生效。此前用的 `pickCanvasInnerScale` 会**除 s**，
                        //      而这里没有 s 可除 ⇒ 被额外放大 1/s（手机 ≈2.67 倍）：
                        //      900 宽的面板算出 k≈2.38 ⇒ 视觉宽 2139 CSS px（屏宽才 851）。
                        //   ⇒ 换成 portal 版 contain（除以屏宽/屏高，不除 s），并用**实测高**兜住竖屏溢出。
                        //   PC 端 legacy 仍传 `gameScale`（= 原表达式，观感零变化）。
                        transform: `scale(${pickPortalContainScale(900, panelH, 0.92, 0.86, gameScale)})`,
                    }} onClick={(e) => e.stopPropagation()}>
                        <motion.div
                            ref={panelRef}
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
                            {/* 一键进度 / 汇总（逐个播期间显示进度，播完显示汇总）
                                [2026-10-21 架构改造]「停止开匣」后 `bulkDone` 会被拉满（让 bulkBusy 转 false），
                                但**实际只开了 bulkList.length 个** ⇒ 收尾文案必须按实际数判断。 */}
                            {bulkTotal > 1 && (
                                <p className="text-xs font-mono tracking-wider" style={{ color: '#a5f3fc' }}>
                                    {bulkDone < bulkTotal
                                        ? `⚡ 一键开启中… ${Math.min(bulkDone + 1, bulkTotal)}/${bulkTotal}`
                                        : bulkList.length >= bulkTotal
                                            ? `⚡ 本次共开启 ${bulkList.length} 个匣子 —— 已全部入账`
                                            : `⚡ 已开启 ${bulkList.length} 个匣子 · 其余 ${bulkTotal - bulkList.length} 个未开启，仍在待开区`}
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
                                                    {/* [2026-10-20 莉莉子 🎨 视觉层优化] 匣子插画（整图显示）
                                                        ⚠️ 插画**本身已画好六边形外框** ⇒ 不再套 clipPath/纯色块，否则会切掉设计师画的框角。
                                                        尺寸 104 保持不变（它是布局锚点）；object-contain 保证正方形图不被裁切。 */}
                                                    <div className="relative z-10 pointer-events-none" style={{ width: 104, height: 104 }}>
                                                        {/* 兜底：插画加载失败时隐藏 img，露出这枚 lucide 图标（图坏了也不白板） */}
                                                        <div data-art-fallback className="absolute inset-0 flex items-center justify-center opacity-0">
                                                            <Package size={32} className="text-white/40" />
                                                        </div>
                                                        <img
                                                            src={getChestArt(c.kind, c.rarity)}
                                                            alt={getChestArtName(c.kind, c.rarity)}
                                                            title={`${cm.label}·${getChestArtName(c.kind, c.rarity)}`}
                                                            className="relative w-full h-full object-contain"
                                                            // [2026-10-20 莉莉子 🎨] 品质色外发光：插画去背景后六边形彩框没了，
                                                            // 用 drop-shadow 沿物体轮廓补一圈品质光（颜色取自 safeMeta → RARITY_META，无硬编码色表）
                                                            style={{ filter: `drop-shadow(0 0 10px ${cm.color}99)` }}
                                                            draggable={false}
                                                            onError={hideBrokenChestArt}
                                                        />
                                                    </div>
                                                    {/* [2026-10-20 莉莉子 🎨] 匣子专名为**主名**（大字），「品质·类别」降为**小字副名**。
                                                        格内宽约 165px（卡片 197 - p-3×2 - px-1×2），最长专名 10 字 × 14px = 140px
                                                        ⇒ 单行放得下；`px-1` 留边、`break-words` 兜底极端宽度下折行不撑破格子。 */}
                                                    <div className="relative z-10 pointer-events-none text-center leading-tight">
                                                        <div className="text-sm font-black text-white px-1 break-words">{getChestArtName(c.kind, c.rarity)}</div>
                                                        <div className="text-[10px] font-bold text-gray-400 mt-0.5">{cm.label}·{CHEST_KIND_LABEL[c.kind]}</div>
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
                            {/* [2026-10-21 修复] 演出只认 `openingChestRef`：批量开匣时 `chests` 已被
                                `openAllChests` 清空，原来写 `chests[openingIndex]` ⇒ 整段开盖演出
                                （光爆/冲击环/放大晃动/碎片飞散）一次都不渲染，420ms 只剩标题栏。 */}
                            {phase === 'opening' && (() => {
                                const oc = openingChestRef.current;
                                if (!oc) return null;
                                const om = safeMeta(oc.rarity);
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
                                            {/* [2026-10-20 莉莉子 🎨] 开匣演出主视觉 = 匣子插画（全场最大、最显眼）
                                                尺寸 168 与放大/旋转动画全部沿用；去掉 clipPath 与纯色底，整图显示。 */}
                                            <div data-art-fallback className="absolute inset-0 flex items-center justify-center opacity-0">
                                                <Package size={54} className="text-white/40" />
                                            </div>
                                            <img
                                                src={getChestArt(oc.kind, oc.rarity)}
                                                alt={getChestArtName(oc.kind, oc.rarity)}
                                                title={getChestArtName(oc.kind, oc.rarity)}
                                                className="relative w-full h-full object-contain"
                                                style={{ filter: `drop-shadow(0 0 14px ${om.color}aa)` }}
                                                draggable={false}
                                                onError={hideBrokenChestArt}
                                            />
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

                            {/* [2026-10-21 审查 P1 修复] opening 期**必须给「停止」**。
                                原来这一整段（420ms/发）底部按钮行整块不渲染、右上 X 不渲染、
                                背景点击 return、ESC 被吞 ⇒ 唯一能点的反而是「⏭ 跳过」（= 把剩余全开掉），
                                正是程指出的"想中止却只能跳过"那个反直觉。 */}
                            {phase === 'opening' && bulkBusy && (
                                <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); stopBulk(); }}
                                    className="px-8 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black tracking-widest transition-all">
                                    ⏹ 停止开匣
                                </button>
                            )}

                            {/* ══ 结果 ══ */}
                            {phase === 'result' && result && meta && (
                                <>
                                    <div className="text-lg font-black tracking-widest" style={{ color: meta.color, textShadow: `0 0 18px ${meta.color}88` }}>
                                        {result.kind === 'shard'
                                            ? '💠 获得神格碎片 💠'
                                            : result.voucherGained
                                                ? '🎟️ 本档已集齐 · 获得匣券 🎟️'
                                                : '✨ 获得武装 ✨'}
                                    </div>

                                    {/* 武装匣结果 —— [2026-10-20 匣券] 重复分支从"折算数据金"改为"发匣券"。
                                        口径：数据金买不到武装（商店只卖局内装备）⇒ 对收集党是死钱；
                                        改成匣券后"重复"变成"攒高级匣的进度"。 */}
                                    {result.kind === 'armament' && (
                                        result.voucherGained ? (
                                            <>
                                                <div className="relative flex items-center justify-center rounded-2xl border border-cyan-300/40 bg-cyan-400/10" style={{ width: 132, height: 132 }}>
                                                    {/* [2026-10-20 莉莉子 🎨] 匣券插画（132 容器尺寸不变）；Ticket 作为加载失败的兜底 */}
                                                    <span data-art-fallback className="absolute inset-0 flex items-center justify-center opacity-0">
                                                        <Ticket size={56} className="text-cyan-300" />
                                                    </span>
                                                    <img
                                                        src={VOUCHER_ART}
                                                        alt="武装匣兑换券"
                                                        title="武装匣兑换券"
                                                        className="relative w-full h-full object-contain"
                                                        draggable={false}
                                                        onError={hideBrokenChestArt}
                                                    />
                                                </div>
                                                <div className="text-xl font-black text-cyan-200">匣券 +{result.voucherGained}</div>
                                                <span className="text-xs px-2 py-0.5 rounded font-mono text-cyan-200 border border-cyan-300/40 bg-cyan-400/10">
                                                    {meta.label} · 本档武装已集齐
                                                </span>
                                                <p className="text-sm text-gray-200 text-center leading-relaxed max-w-[620px]">
                                                    该品质的武装你<b className="text-cyan-200">已经全部拥有</b>了 ⇒ 本匣换成
                                                    <b className="text-cyan-200"> {result.voucherGained} 张匣券</b>。
                                                    攒够之后可以去<b className="text-cyan-200">评估嘉勉</b>里兑换更高品质的武装匣。
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

                                    {/* 碎片匣结果（[2026-10-02 N5] 大图标网格 + 下方数量；[2026-10-20] 图标统一为**菱形**，不再套六边形） */}
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
                                                                {/* [2026-10-20 程拍板] **统一菱形** —— 神格碎片不再套六边形底座。
                                                                    六边形是"匣子"的视觉语言，套在碎片上会串味（截图实测：菱形被金边六边形压得很小）。
                                                                    去掉品质色外环与深色内底，菱形放大到 96px 保住视觉重量；容器 104 不动（网格对齐）。 */}
                                                                <div className="flex items-center justify-center" style={{ width: 104, height: 104 }}>
                                                                    <ShardIcon heroKey={d.heroKey} size={96} />
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
                                        {/* [2026-10-21 审查 P2 修复] `!bulkBusy` 守卫：
                                            批量中若让它出现，点一下会 `setPh('select')` 而 `bulkRef/bulkBusy`
                                            仍是 true ⇒ 屏幕上同时挂着"开启中…"＋"一键全开"＋"跳过"＋匣子网格
                                            （自相矛盾的 UI），且本批汇总丢失（排队定时器被 effect cleanup 清掉）。 */}
                                        {chests.length > 0 && !bulkBusy && (
                                            <button
                                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setResult(null); setPh('select'); }}
                                                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-black tracking-widest hover:scale-105 transition-all shadow-[0_0_25px_rgba(250,204,21,0.45)]"
                                            >
                                                🔓 继续开匣（×{chests.length}）
                                            </button>
                                        )}
                                        <button
                                            onClick={() => {
                                                eventBus.emit(GameEvents.UI_BACK);
                                                // [2026-10-21 P0-①] 批量连播中 ⇒ **跳过剩余动画，但一定出汇总**
                                                //   （原来直接 onClose() ⇒ 整批结果永远看不到；产物其实早已入账）
                                                if (bulkBusy) stopBulk(); else onClose();
                                            }}
                                            className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black tracking-widest transition-all"
                                        >
                                            {/* [2026-10-21 程定] 批量播放中这里是「**停止播放**」而不是「收起」——
                                                「收起」= 开完之后关窗；播放途中玩家要的是"别播了，给我结果"。 */}
                                            {bulkBusy ? '⏹ 停止开匣' : (chests.length > 0 ? '收起' : '完成')}
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* 关闭 */}
                            {phase !== 'opening' && (
                                <button onClick={() => {
                                        eventBus.emit(GameEvents.UI_BACK);
                                        // [2026-10-21] 批量中先给结果（等同「⏹ 停止开匣」：不再开、剩下的保留）
                                        if (bulkBusy) stopBulk(); else onClose();
                                    }} className="absolute top-4 right-4 p-2 rounded-full text-gray-500 hover:bg-white/10 hover:text-white transition-all">
                                    <X size={20} />
                                </button>
                            )}

                            {/* [2026-10-21 程拍板] 右上角「⏭ 跳过」—— 与底部「⏹ 停止开匣」是**两件事**：
                                · 停止 = 不再开，剩下的匣子**保留未开启**，汇总只含已播过的
                                · 跳过 = 不想看演出了，把**剩余的匣子也全开掉**（一次性结算），一起汇总
                                放在关闭按钮左边，只在批量连播中显示。 */}
                            {bulkBusy && (
                                <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); skipRest(); }}
                                    className="absolute top-4 right-16 px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white text-xs font-black tracking-widest transition-all">
                                    ⏭ 跳过
                                </button>
                            )}
                        </motion.div>
                    </div>

                    {/* ══ [2026-10-02 N4] 匣子详情弹窗（portal 到 body，z 高于本弹窗）
                        🔴 [2026-10-21 BUG 修复] `!summaryOpen` 是硬守卫：它的 z-[1600] 高于汇总窗
                        z-[1400]，开着就会把汇总结果盖住 —— 渲染层直接禁掉，不依赖任何时序推断。 */}
                    {!summaryOpen && detailChest && (() => {
                        const dm = safeMeta(detailChest.rarity);
                        const isArm = detailChest.kind === 'armament';
                        const pool = isArm ? getArmamentChestPool(detailChest.rarity) : [];
                        // [2026-10-04 ②] 预览必须与**实际抽取**同源：实际口径是"优先抽库存未满的、整档集齐才换匣券"
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
                                {/* [2026-10-21 手机实测修复] portal 到 body ⇒ 逃出 ScaleWrapper，
                                    祖先 s 不再生效 ⇒ 手机端改用 `pickPortalScale`（占屏 92%）；PC 不变。 */}
                                <div style={{ transform: `scale(${pickPortalScale(640, 0.92, gameScale)})` }}>
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
                                        {/* [2026-10-20 莉莉子 🎨] 标题同口径：专名为主（原字号 20px 不变），「品质·类别」为小字副名 */}
                                        <div className="flex flex-col items-center leading-tight">
                                            <div className="text-xl font-black text-white">{getChestArtName(detailChest.kind, detailChest.rarity)}</div>
                                            <div className="text-[11px] font-bold text-gray-400 mt-0.5">{dm.label}·{CHEST_KIND_LABEL[detailChest.kind]}</div>
                                        </div>

                                        {isArm ? (
                                            <>
                                                <p className="text-sm text-gray-200 text-center leading-relaxed">
                                                    {allFull ? (
                                                        <>本品质武装你<b className="text-cyan-200">已全部拥有</b>
                                                            ⇒ 开启后换成<b className="text-cyan-200">匣券 +{voucherYieldOf(detailChest.rarity)}</b>（可在评估嘉勉兑换更高品质武装匣）</>
                                                    ) : (
                                                        <>开启后从下列 <span className="text-amber-200 font-black">{withRoom.length}</span> 件<b className="text-amber-200">库存未满</b>的武装中随机获得 1 件；
                                                            <span className="text-gray-400">标「已满」的本次<b className="text-amber-200">不会</b>被抽到（整档集齐时才换成匣券）。</span></>
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
                                                    {/* [2026-10-20 莉莉子 🎨] 碎片匣详情 = 该品质神经匣插画（108 容器不变）；ShardIcon 作兜底 */}
                                                    <div className="relative" style={{ width: 108, height: 108 }}>
                                                        <span data-art-fallback className="absolute inset-0 flex items-center justify-center opacity-0">
                                                            <ShardIcon size={56} />
                                                        </span>
                                                        <img
                                                            src={getChestArt('shard', detailChest.rarity)}
                                                            alt={getChestArtName('shard', detailChest.rarity)}
                                                            title={getChestArtName('shard', detailChest.rarity)}
                                                            className="relative w-full h-full object-contain"
                                                            // [2026-10-20 莉莉子 🎨] 品质色外发光（色取 dm.color = safeMeta(detailChest.rarity)）
                                                            style={{ filter: `drop-shadow(0 0 10px ${dm.color}99)` }}
                                                            draggable={false}
                                                            onError={hideBrokenChestArt}
                                                        />
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
                items={bulkList.flatMap<BulkSummaryItem>(r => {
                    if (r.kind === 'armament') {
                        // [2026-10-20 匣券] 同时修掉"未知武装"这个既有 BUG：
                        //   重复件返回 `voucherGained`（**没有 armamentId**），旧代码只认 armamentId
                        //   ⇒ 这些行会被显示成「未知武装」。
                        if (r.voucherGained) {
                            return [{
                                // [2026-10-21 视觉重做] 归一成「匣券 +26」：数量走 `amount`，
                                //   由汇总窗统一渲染成 ×N 徽章，不再把数字写进名字里。
                                name: '匣券',
                                rarity: r.rarity,
                                kind: 'voucher',
                                amount: r.voucherGained,
                                icon: VOUCHER_ART,
                                note: `${VOUCHER_RARITY_LABEL[r.rarity]}档武装已全部拥有 ⇒ 换成匣券（评估嘉勉可兑换更高品质武装匣）`,
                            }];
                        }
                        const d = r.armamentId ? getEquipmentById(r.armamentId) : undefined;
                        return [{
                            name: d?.name ?? '未知武装',
                            rarity: r.rarity,
                            kind: 'armament',
                            amount: 1,
                            icon: d?.icon ?? getChestArt('armament', r.rarity),
                            note: d?.description,
                        }];
                    }
                    // ── 神格碎片 ──────────────────────────────────────────────
                    // [2026-10-04 BUG修复] 溢出（已 1:1 转万能）的那部分**不能算作该英雄所得**。
                    // [2026-10-21 视觉重做] **按天启者拆成独立条目**（而不是压成一行「神格碎片 ×N」）：
                    //   汇总窗会再按 `heroKey` **跨匣合并** ⇒ 30 个白碎片匣能收成「里芙 ×25」这样的几行。
                    // 🔴 [2026-10-21 程指正] **碎片条目不传 `rarity`**：
                    //   天启者的神格碎片**没有品质之分** —— 入账后就是同一个计数器，
                    //   匣子的品质只决定"这一匣给几片"。
                    //   若在这里传 `r.rarity`（匣品质），稀有匣开出的芬妮碎片就会和
                    //   普通匣开出的芬妮碎片被分进两个品质组 —— 那是错的。
                    //   ⇒ 不传 rarity，汇总窗会把它们全部归入「神格碎片」组并按英雄合并。
                    const details = r.shardDetail ?? [];
                    const out: BulkSummaryItem[] = [];
                    for (const x of details) {
                        const ov = x.overflow > 0 ? x.overflow : 0;
                        const credited = Math.max(0, x.amount - ov);
                        const heroName = CARD_DB[x.heroKey]?.name ?? x.heroKey;
                        if (credited > 0) {
                            out.push({
                                name: heroName,
                                kind: 'shard',
                                heroKey: x.heroKey,      // ← 交给 `<ShardIcon heroKey>` 渲染头像菱形
                                amount: credited,
                            });
                        }
                        if (ov > 0) {
                            // 溢出转来的万能碎片：独立成条（橙色菱形，`heroKey` 不传，同样无品质）
                            out.push({ name: '万能碎片', kind: 'universal', amount: ov });
                        }
                    }
                    return out;
                })}
                onClose={() => setSummaryOpen(false)}
            />
        </AnimatePresence>,
        document.body,
    );
};
