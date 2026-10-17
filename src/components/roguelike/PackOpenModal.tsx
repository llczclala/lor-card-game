// ==========================================
// 悖论迷宫 · 卡包开启演出（转盘老虎机 · 重构版）
// [2026-09-04 莉莉子 + 程拍板] 三优化：
//   ① 转盘待命型：弹窗打开滚轮匀速往复慢转（预热待命）→ 点开启 → 加速冲刺 → 减速定格在中间标记线
//   ② 滚动格改六边形图标（clip-path 扁六边形，替代原长方形卡）
//   ③ 定格瞬间自动弹出效果详情弹窗（品质 + 大类），按钮收进弹窗
//   ⚠️ [2026-10-02 莉莉子] 原注释里的「鼠标悬停格子 → 大图检视」**功能已在 09-29 匣子化改造中移除**
//      （滚轮里滚的就是匣子，没有"具体是什么"可检视）—— 本次把遗留的过时注释清掉，免得再被误导。
// [2026-09-29 程拍板 · 匣子化改造] **卡包改为开出「奖励匣」，不再直接开武装**：
//   开包 → 滚轮定格在一个**匣子**（武装匣 / 神格碎片匣 × 六档品质）→ 匣子入待打开队列
//   → 玩家随后在「待打开匣子」里开匣子，才得到对应品质武装 / 对应数量神格碎片。
// [2026-10-02 莉莉子 · 程反馈修复] 详见 docs/检查-开卡包与开匣.md
//   · #2-new 程反馈「点再开一包轮盘不转」—— 病根：`s0 = sRef.current`，而结果态 s 已停在终点 TARGET_X
//     ⇒ 冲刺位移差恒为 0。改为**动态目标位**：每次开启把目标放在"当前位置前方固定格数"，
//     且新格子**追加**到序列尾部（不重建整表 ⇒ 顺带修掉 #7「点开启瞬间可见格内容突变」）。
//   · #8 「收起」瞬移 —— 待命往复由"绝对位移"改为**以收起点为锚**的往复 ⇒ 位移连续、不再跳 2302→360。
//   · #4 缩放统一到 gameScale（原来主面板不缩放、只有详情弹窗缩放 ⇒ 非 1.0 分辨率下大小不匹配）。
//   · #2 退出动画 —— 原来 `if (!isOpen) return null` 写在 AnimatePresence **之前**，exit 永不播放。
//   · #5 结果态底部给**兜底按钮**（详情弹窗一旦关掉不再"底部空白、无处可点"）。
//   · #6 术语统一：本弹窗做的是**开卡包**，不再自称「开匣」。
//   · #9 点详情背景 = 收起详情（原来 stopPropagation 后什么都不做，像卡住）。
//   · N1 程反馈「窗口太小、中间六边形太小」→ 整体放大（窗口 640→1000、图标 68→108）。
// ==========================================
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, X } from 'lucide-react';
import { RARITY_META } from './RarityIcon';
import {
    CHEST_KIND_LABEL, describeChestContent, CHEST_RARITY_ORDER, SHARD_GROUP_SIZE,
    type ChestInstance, type ChestKind,
} from '../../data/roguelike/divinityShards';
import { getGameScale } from '../../utils/gameScale'; // [2026-09-04] 详情 portal 逃出 scale 容器后按 gameScale 补偿
import { BulkOpenSummaryModal, type BulkSummaryItem } from './BulkOpenSummaryModal'; // [2026-10-04 程拍板] 一键全开的完整结果汇总窗
import { eventBus, GameEvents } from '../../utils/eventBus'; // [2026-10-14 莉莉子 🖱️] 开卡包 / 关闭 / 详情 音效
// ══════════════════════════════════════════════════════════════════════
// 🎛️ 肉鸽「卡包开启」演出（`PackOpenModal`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 悖论迷宫「待打开卡包」点开启后弹出的老虎机转盘：转盘待命慢转 → 冲刺定格
//   → 定格瞬间弹「奖励匣」详情弹窗 → 底部可「再开一包 / 一键全开」。
// 管：①面板本体 ②标题与副标题 ③滚动展示窗（转盘）④六边形格 ⑤中奖揭示与光环
//     ⑥转盘下的提示语 ⑦底部按钮行 ⑧右上关闭 ⑨定格详情弹窗（portal）。
// 改完存盘即生效（HMR —— 雷电/电脑上 1~3 秒看到，不用出包）。
// 命名与用法**对齐 `TITLE_UI`**：值是**绝对画布 px**、直接进 style；注释标注**原 Tailwind 类**。
// ⚠️ **滚轮几何不在本块里**：本文件顶部那组裸常量 `CARD_W` / `CARD_H` / `WINDOW_W` /
//     `HEX_SIZE` / `BIG_HEX`（连同 `INITIAL_SEQ_LEN` / `ROLL_CELLS` / `IDLE_MAX` / `ROLL_DUR` …
//     的演出参数）**本来就是可调的**，本块**不重复收录**（同一部件两处各一份 = 改一处不生效）。
//     要改「窗口多大 / 格子多宽 / 六边形多大」请直接改文件顶部那组常量。
// ⚠️ 面板整体已按 `gameScale` 缩放（`getGameScale()`），本块的 px 都在**缩放之前**的坐标系里。
// ⚠️ 刻意**没搬**的类（都是"单个数值就够用"的观感量，不是尺寸）：
//     `z-[15]/z-20/z-30`（标记线、渐隐、▲ 的层序）· `p-2` 之外的小图标尺寸已单独提值 ·
//     `leading-none` / `leading-relaxed`（**行高刻意留给继承**：字号成倍放大时不压字）·
//     `tracking-*` · `font-*` · `hover:scale-105` · `drop-shadow-*` · `shadow-*` · `bg-*` / `text-<色>`
//     · `inset-0` / `inset-y-0` / `left-1/2 top-0` 等铺满与居中定位 · `will-change-transform`
// ⚠️ 本屏无 `max-w-*`，也没有 `vh` / `vw`（合 `design-guide.md` §3 铁律）。
// ══════════════════════════════════════════════════════════════════════
export const PACK_OPEN_UI = {
    // ══ ① 面板本体 ════════════════════════════════════════════════════
    /** 面板宽 px（原 w-[1180px]） */
    panelWidth: 1180,
    /** 面板圆角 px（原 rounded-3xl = 24） */
    panelRadius: 24,
    /** 面板描边 px（原 border = 1） */
    panelBorderWidth: 1,
    /** 面板四周内边距 px（原 p-8 = 32） */
    panelPad: 32,

    // ══ ② 标题与副标题 ════════════════════════════════════════════════
    /** 「卡包开启」行内图标与文字间距 px（原 gap-2 = 8） */
    titleRowGap: 8,
    /** 标题行与下方副标题的间距 px（原 mb-1 = 4） */
    titleRowMarginBottom: 4,
    /** 标题左侧礼盒图标 px（原 size={34}） */
    titleIconSize: 34,
    /** 「卡包开启」字号 px（原 text-4xl = 36） */
    titleFontSize: 36,
    /** 副标题（待打开卡包 ×N）字号 px（原 text-sm = 14） */
    subtitleFontSize: 14,
    /** 副标题与转盘之间的间距 px（原 mb-5 = 20） */
    subtitleMarginBottom: 20,

    // ══ ③ 滚动展示窗（老虎机转盘）═════════════════════════════════════
    /** 窗口圆角 px（原 rounded-xl = 12）· ⚠️ 窗口**宽高**在顶部 `WINDOW_W` / `CARD_H` */
    windowRadius: 12,
    /** 窗口描边 px（原 border = 1） */
    windowBorderWidth: 1,
    /** 中央黄色标记线宽 px（原 w-[3px] = 3） */
    markerWidth: 3,
    /** 左右两侧渐隐带宽度 px（原 w-28 = 112，左右共用） */
    fadeWidth: 112,
    /** 底部轨道条高 px（原 h-6 = 24） */
    trackHeight: 24,
    /** 轨道条顶边线 px（原 border-t = 1） */
    trackBorderWidth: 1,

    // ══ ④ 六边形格（滚动序列里每一格）═════════════════════════════════
    /** 六边形内侧深底内缩 px（原 inset-[3px] = 3）· ⚠️ 六边形**边长**在顶部 `HEX_SIZE` */
    hexInnerInset: 3,
    /** 六边形内图标与文字的间距 px（原 gap-1 = 4） */
    hexInnerGap: 4,
    /** 六边形内礼盒图标 px（原 size={32}） */
    hexIconSize: 32,
    /** 六边形内「武装 / 碎片」字号 px（原 text-[12px] = 12） */
    hexLabelFontSize: 12,

    // ══ ⑤ 中奖揭示与光环 ══════════════════════════════════════════════
    /** 定格后目标格上方「▲」字号 px（原 text-lg = 18） */
    revealMarkerFontSize: 18,
    /** 光环描边宽 px（原 style 里的 3px solid） */
    haloBorderWidth: 3,

    // ══ ⑥ 转盘下的提示语 ══════════════════════════════════════════════
    /** 「🎁 卡包开出的是奖励匣…」字号 px（原 text-xs = 12） */
    hintFontSize: 12,
    /** 该提示与转盘的间距 px（原 mt-3 = 12） */
    hintMarginTop: 12,
    /** 一键全开进度行字号 px（原 text-xs = 12） */
    bulkHintFontSize: 12,
    /** 该进度行与上一行的间距 px（原 mt-2 = 8） */
    bulkHintMarginTop: 8,

    // ══ ⑦ 底部按钮行 ══════════════════════════════════════════════════
    /** 按钮行最小高 px（原 min-h-[64px] = 64）—— 防止三种状态切换时面板跳动 */
    buttonRowMinHeight: 64,
    /** 行内按钮间距 px（原 gap-2.5 = 10） */
    buttonRowGap: 10,
    /** 按钮行与提示语的上间距 px（原 mt-1 = 4） */
    buttonRowMarginTop: 4,
    /** 「开启卡包！」左右内边距 px（原 px-12 = 48）· 与「开启中…」占位共用 */
    mainBtnPadX: 48,
    /** 该按钮上下内边距 px（原 py-3.5 = 14） */
    mainBtnPadY: 14,
    /** 该按钮圆角 px（原 rounded-xl = 12） */
    mainBtnRadius: 12,
    /** 该按钮字号 px（原 text-xl = 20） */
    mainBtnFontSize: 20,
    /** 「一键全开」左右内边距 px（原 px-7 = 28） */
    openAllBtnPadX: 28,
    /** 该按钮上下内边距 px（原 py-3.5 = 14） */
    openAllBtnPadY: 14,
    /** 该按钮圆角 px（原 rounded-xl = 12） */
    openAllBtnRadius: 12,
    /** 该按钮字号 px（原 text-lg = 18） */
    openAllBtnFontSize: 18,
    /** 结果态两个按钮左右内边距 px（原 px-6 = 24） */
    resultBtnPadX: 24,
    /** 结果态两个按钮上下内边距 px（原 py-3 = 12） */
    resultBtnPadY: 12,
    /** 结果态两个按钮圆角 px（原 rounded-xl = 12） */
    resultBtnRadius: 12,

    // ══ ⑧ 右上关闭 ════════════════════════════════════════════════════
    /** 距面板顶 px（原 top-4 = 16） */
    closeTop: 16,
    /** 距面板右 px（原 right-4 = 16） */
    closeRight: 16,
    /** 按钮内边距 px（原 p-2 = 8） */
    closePad: 8,
    /** ✕ 图标 px（原 size={20}） */
    closeIconSize: 20,

    // ══ ⑨ 定格详情弹窗（portal 到 body 的全屏浮层）═════════════════════
    /** 弹窗宽 px（原 w-[520px]） */
    detailWidth: 520,
    /** 弹窗圆角 px（原 rounded-2xl = 16） */
    detailRadius: 16,
    /** 弹窗描边 px（原 border = 1） */
    detailBorderWidth: 1,
    /** 弹窗四周内边距 px（原 p-7 = 28） */
    detailPad: 28,
    /** 弹窗内各行间距 px（原 gap-3 = 12） */
    detailGap: 12,
    /** 「✨ 获得奖励匣 ✨」字号 px（原 text-lg = 18） */
    detailTitleFontSize: 18,
    /** 大六边形内侧深底内缩 px（原 inset-[3px] = 3）· ⚠️ 其**边长**在顶部 `BIG_HEX` */
    bigHexInnerInset: 3,
    /** 大六边形内图标与文字间距 px（原 gap-1.5 = 6） */
    bigHexInnerGap: 6,
    /** 大六边形内礼盒图标 px（原 size={46}） */
    bigHexIconSize: 46,
    /** 大六边形内「武装 / 碎片」字号 px（原 text-[13px] = 13） */
    bigHexLabelFontSize: 13,
    /** 匣子名（例：紫色·神格碎片匣）字号 px（原 text-xl = 20） */
    chestNameFontSize: 20,
    /** 品质 / 大类两个 chip 的间距 px（原 gap-1.5 = 6） */
    chipsGap: 6,
    /** chip 字号 px（原 text-xs = 12） */
    chipFontSize: 12,
    /** chip 左右内边距 px（原 px-2 = 8） */
    chipPadX: 8,
    /** chip 上下内边距 px（原 py-0.5 = 2） */
    chipPadY: 2,
    /** chip 圆角 px（原 rounded = 4） */
    chipRadius: 4,
    /** chip 描边 px（原 border = 1） */
    chipBorderWidth: 1,
    /** 开出内容预告（正文）字号 px（原 text-sm = 14） */
    descFontSize: 14,
    /** 「碎片每 N 片为一组…」字号 px（原 text-[11px] = 11） */
    shardNoteFontSize: 11,
    /** 该行与正文的间距 px（原 mt-1 = 4） */
    shardNoteMarginTop: 4,
    /** 「匣子已存入『待打开匣子』…」字号 px（原 text-[11px] = 11） */
    detailFootFontSize: 11,
    /** 该行上边距 px（原 -mt-1 = -4，负值把两行拉近） */
    detailFootMarginTop: -4,
    /** 弹窗内按钮行间距 px（原 gap-2.5 = 10） */
    detailBtnRowGap: 10,
    /** 按钮行与正文的间距 px（原 mt-2 = 8） */
    detailBtnRowMarginTop: 8,
    /** 弹窗内三个按钮左右内边距 px（原 px-5 = 20） */
    detailBtnPadX: 20,
    /** 弹窗内三个按钮上下内边距 px（原 py-2.5 = 10） */
    detailBtnPadY: 10,
    /** 弹窗内三个按钮圆角 px（原 rounded-xl = 12） */
    detailBtnRadius: 12,
} as const;


interface PackOpenModalProps {
    isOpen: boolean;
    pendingPacks: number;
    /** 打开一个卡包 → 返回抽到的**匣子**（[2026-09-29] 原为返回武装 id） */
    onOpenPack: () => ChestInstance | null;
    onClose: () => void;
    /** 打开背包里的匣子（跳去待打开匣子列表 / 直接开） */
    onOpenChest?: () => void;
}

// ── 滚轮几何（可调）──
// [2026-10-02 N1] 整体放大：窗口 640→1000 / 格宽 76→112 / 格高 138→176 / 六边形 68→108
const CARD_W = 112;       // 每格宽（六边形格子贴格排列）
const CARD_H = 176;       // 每格高（滚动窗口高）
const WINDOW_W = 1000;    // 可见窗口宽（约 8.9 格）
const HEX_SIZE = 108;     // 滚动格内六边形图标边长
const BIG_HEX = 150;      // 详情弹窗大图标边长
const INITIAL_SEQ_LEN = 41;       // 初始序列长度
const INITIAL_TARGET_INDEX = 34;  // 初始目标卡位置（仅用于待命展示，不被揭示）
const SEQ_TAIL = 6;               // 目标之后至少保留的尾巴格数（保证待命往复不露出空白）
const ROLL_CELLS = 20;            // 每次开启的冲刺跨格数（目标 = 当前位置前方 N 格）
const COMPACT_LIMIT = 260;        // 序列长度上限（超过则整表重建，防无限增长）

// ── 待命慢转参数 ──
const IDLE_MAX = 720;     // 待命往复带宽度（相对收起点/起点）
const IDLE_PERIOD = 10;   // 往复一个完整周期（秒）

// ── 冲刺参数 ──
const ROLL_DUR = 2.6;     // 冲刺减速时长
const REVEAL_DELAY = 1500; // 定格后停留展示（放大发光揭示）多久，再自动弹详情弹窗 (ms)

const HEXAGON = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'; // 对齐 Card.tsx EQUIPMENT_HEXAGON_CLIP 同款
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

type Phase = 'idle' | 'rolling' | 'result';

/** [2026-09-29] 匣子序列项 = 大类 + 品质（滚轮里滚的就是匣子） */
type ChestEntry = ChestInstance;

export const PackOpenModal: React.FC<PackOpenModalProps> = ({ isOpen, pendingPacks, onOpenPack, onClose, onOpenChest }) => {
    const [phase, setPhase] = useState<Phase>('idle');
    const [sequence, setSequence] = useState<ChestEntry[]>([]);
    const [targetIndex, setTargetIndex] = useState(INITIAL_TARGET_INDEX);
    const [result, setResult] = useState<ChestEntry | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    const stripRef = useRef<HTMLDivElement | null>(null);
    // [2026-09-29] 滚轮素材 = 12 种匣子（2 大类 × 6 品质）
    const chestPoolRef = useRef<ChestEntry[]>(
        (['armament', 'shard'] as ChestKind[]).flatMap(kind =>
            CHEST_RARITY_ORDER.map(rarity => ({ kind, rarity }))),
    );
    const phaseRef = useRef<Phase>('idle');
    const sRef = useRef(0);        // 当前 strip 位移（px）
    const s0Ref = useRef(0);       // rolling 触发瞬间的起始位移
    const targetXRef = useRef(0);  // 本次 rolling 的终点位移（动态目标位）
    const phRef = useRef(0);       // idle 正弦相位
    const idleAnchorRef = useRef(0); // [2026-10-02 #8] 待命往复的锚点（收起点）—— 位移连续，不再瞬移
    const tRef = useRef(0);        // rolling 已播放时长
    const isOpenRef = useRef(false);
    const seqRef = useRef<ChestEntry[]>([]); // 序列镜像（供 handleOpen 同步读取，避免闭包读到旧值）

    const setPh = (p: Phase) => { phaseRef.current = p; setPhase(p); };

    const paint = (s: number) => {
        if (stripRef.current) stripRef.current.style.transform = `translate3d(${-Math.round(s)}px,0,0)`;
    };

    const randChest = (): ChestEntry => {
        const a = chestPoolRef.current;
        return a[Math.floor(Math.random() * a.length)];
    };

    /** 序列写入（state + 镜像一起更新，保证同步可读） */
    const applySequence = (next: ChestEntry[]) => { seqRef.current = next; setSequence(next); };

    /**
     * 保证序列至少 n 格（不足则**追加**随机格 —— 追加不会改变已有格子的内容与位移，
     * 这正是 #7「内容突变」的修法：不再整表重建）。
     */
    const ensureLength = (n: number) => {
        const cur = seqRef.current;
        if (cur.length >= n) return;
        const next = cur.slice();
        while (next.length < n) next.push(randChest());
        applySequence(next);
    };

    // isOpen：重建序列 + 启动 rAF 主循环
    useEffect(() => {
        if (!isOpen) return;
        isOpenRef.current = true;
        sRef.current = 0; phRef.current = 0; tRef.current = 0; idleAnchorRef.current = 0;
        const fresh: ChestEntry[] = [];
        for (let i = 0; i < INITIAL_SEQ_LEN; i++) fresh.push(randChest());
        applySequence(fresh);
        setTargetIndex(INITIAL_TARGET_INDEX);
        setPh('idle');
        setResult(null);
        setDetailOpen(false);
        let raf = 0;
        let last = performance.now();
        const tick = (ts: number) => {
            if (!isOpenRef.current) return;
            const dt = Math.min(0.05, (ts - last) / 1000);
            last = ts;
            const st = phaseRef.current;
            if (st === 'idle') {
                // [2026-10-02 #8] 以 idleAnchor 为锚往复：收起瞬间 ph=0 ⇒ s 与收起点完全相等，无跳变
                phRef.current += dt * (Math.PI * 2 / IDLE_PERIOD);
                const s = idleAnchorRef.current + (IDLE_MAX / 2) * (1 - Math.cos(phRef.current));
                sRef.current = s; paint(s);
                raf = requestAnimationFrame(tick);
            } else if (st === 'rolling') {
                tRef.current += dt * rollSpeedRef.current; // [2026-10-04] 一键全开时倍率 >1 ⇒ 滚得更快
                const p = tRef.current / ROLL_DUR;
                const TX = targetXRef.current;
                if (p >= 1) {
                    sRef.current = TX; paint(TX);
                    setPh('result');
                    raf = requestAnimationFrame(tick); // [2026-09-07 修复] 定格后必须续帧保活循环——否则「收起回 idle / 再开一个」时 rAF 已死,第二次永远停在 ROLLING/不弹
                    return;
                }
                const e = easeOutQuart(Math.min(1, p));
                const s = s0Ref.current + (TX - s0Ref.current) * e;
                sRef.current = s; paint(s);
                raf = requestAnimationFrame(tick);
            } else if (st === 'result') {
                // 定格展示：不移动，但保持循环存活 → 「收起」回 idle 时无缝续转
                raf = requestAnimationFrame(tick);
            }
        };
        raf = requestAnimationFrame(tick);
        return () => {
            isOpenRef.current = false;
            cancelAnimationFrame(raf);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // result → 延迟自动弹详情弹窗
    useEffect(() => {
        if (phase !== 'result') { setDetailOpen(false); return; }
        const t = setTimeout(() => setDetailOpen(true), REVEAL_DELAY);
        return () => clearTimeout(t);
    }, [phase]);

    // [2026-10-02 #15] ESC：详情开着先收详情，否则关弹窗（rolling 中不响应，与其余入口一致）
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return; eventBus.emit(GameEvents.UI_BACK);
            if (detailOpen) { e.stopImmediatePropagation(); setDetailOpen(false); return; }
            if (phaseRef.current === 'rolling') return;
            e.stopImmediatePropagation();
            onClose();
        };
        window.addEventListener('keydown', onKey, { capture: true });
        return () => window.removeEventListener('keydown', onKey, { capture: true });
    }, [isOpen, detailOpen, onClose]);

    // ═══ [2026-10-04 程拍板 · 重做] 一键全开 ═══════════════════════════
    //   ❌ 上一版的两个错（程实测反馈）：
    //     ① **演出中断**：直接 `setPh('result')` ⇒ 跳过 `rolling`，而滚动是 rAF 主循环在
    //        `st === 'rolling'` 分支里驱动的（滚到 `p>=1` 才转 result）⇒ 滚轮根本不动
    //     ② **只见一次结果**：把"批量抽干"与"逐个展示"做成了两件脱钩的事
    //   ✅ 现在的做法：**先一次性抽干入队**（`openPack` 用同步 ref 先判后扣，连调安全），
    //      然后让**每一发都走完整的「startRoll → rAF 滚动 → result」**；
    //      定格停 SETTLE_MS 让玩家看清结果，再自动接下一个；队列空 ⇒ 出汇总。
    const queueRef = useRef<ChestEntry[]>([]);   // 排队等播的匣子（已抽出）
    // [2026-10-04 程拍板 · 方案B] 一键全开时**加速滚动**（单开恒为 1）：
    //   滚动进度由 rAF 里的 `tRef` 累积驱动，乘一个倍率即可提速 ——
    //   不必动 `ROLL_DUR` 那个常量（它是单开的基准，改了会连单开一起变）。
    const rollSpeedRef = useRef(1);
    const ROLL_SPEED_BULK = 2.5;   // 一键时的滚动倍率（≈ 单发 0.6s 滚完）
    const [bulkTotal, setBulkTotal] = useState(0); // 本次一键总数（0 = 非批量）
    const [bulkDone, setBulkDone] = useState(0);   // 已播完几发（进度/汇总用）
    // [2026-10-04 程拍板] 本次一键的**完整结果** —— 全部播完后单开一个窗展示（不再"只有最后一次有弹窗"）
    const [bulkList, setBulkList] = useState<ChestEntry[]>([]);
    const [summaryOpen, setSummaryOpen] = useState(false);

    /** 只负责「让滚轮滚到这一枚」（不含抽包）—— 从原 handleOpen 拆出，供「一键全开」逐步复用 */
    const startRoll = (pick: ChestEntry) => {
        const prev = seqRef.current;
        const startIdx = Math.ceil(sRef.current / CARD_W);
        let target = Math.max(prev.length, startIdx + ROLL_CELLS);

        if (target + 1 + SEQ_TAIL > COMPACT_LIMIT) {
            // 兜底：滚了太多次 → 整表重建 + 位移归零（允许一次跳变，正常情况下十几次才会走到）
            target = INITIAL_TARGET_INDEX;
            const fresh: ChestEntry[] = [];
            for (let i = 0; i < INITIAL_SEQ_LEN; i++) fresh.push(randChest());
            fresh[target] = pick;
            applySequence(fresh);
            sRef.current = 0;
            idleAnchorRef.current = 0;
        } else {
            // 正路：**追加**到尾部（可见格内容不变 ⇒ 无突变），目标落在新格上
            const next = prev.slice();
            while (next.length < target + 1 + SEQ_TAIL) next.push(randChest());
            next[target] = pick;
            applySequence(next);
        }

        // [2026-10-02 #2-new] 终点按**动态目标位**算 —— 起点永远在终点之前，位移差 > 0 ⇒ 一定会转
        targetXRef.current = target * CARD_W + CARD_W / 2 - WINDOW_W / 2;
        s0Ref.current = sRef.current;
        tRef.current = 0;
        setTargetIndex(target);
        setResult(pick);
        setDetailOpen(false);
        setPh('rolling');
    };

    /** 点开启 / 再开一个：抽一个匣子（入库）→ 交给 startRoll 滚过去 */
    const handleOpen = () => {
        if (phaseRef.current === 'rolling') return;
        rollSpeedRef.current = 1;     // [2026-10-04] 单开：标准速度
        queueRef.current = [];        // 单开：清掉批量队列与统计
        setBulkTotal(0);
        setBulkDone(0);
        const pick = onOpenPack?.();
        if (!pick) return;
        // [2026-10-14 莉莉子 🖱️交互层革新] 开卡包音效（单抽）—— 放在**拿到结果之后**：
        //   若放在 onOpenPack 之前，"没包可开"（返回 null）时也会空响一声。
        eventBus.emit(GameEvents.GACHA_START_SINGLE);
        startRoll(pick);
    };

    /** ⚡ 一键全开：抽干入队 → 立刻播第一发（其余排队，rAF 逐个播） */
    const handleOpenAll = () => {
        if (phaseRef.current === 'rolling') return;
        const list: ChestEntry[] = [];
        for (let i = 0; i < 200; i++) {
            const pick = onOpenPack?.();
            if (!pick) break;         // 抽干（返回 null = 没有可开的卡包了）
            list.push(pick);
        }
        if (list.length === 0) return;
        // [2026-10-14 莉莉子 🖱️交互层革新] 一键全开音效（十连抽）—— 整批只响这一声
        eventBus.emit(GameEvents.GACHA_START_TEN);
        rollSpeedRef.current = ROLL_SPEED_BULK;   // [2026-10-04 方案B] 一键：加速滚动
        queueRef.current = list.slice(1);   // 第一发立刻滚，其余排队
        setBulkList(list);                  // [2026-10-04 程拍板] 留档完整结果 → 全部播完后开汇总窗
        setSummaryOpen(false);
        setBulkTotal(list.length);
        setBulkDone(0);
        startRoll(list[0]);
    };

    // 每一发定格（phase→result）后：队列还有 ⇒ 停一拍接着播；没了 ⇒ 标记批量结束（出汇总）
    useEffect(() => {
        if (phase !== 'result') return;
        if (bulkTotal === 0) return;                        // 非批量模式：不插手
        // [2026-10-04 程拍板] 全部播完 ⇒ 单开一个**汇总窗**展示本次完整结果
        //   （修掉"连播一路只有最后一次有弹窗"的问题）
        if (queueRef.current.length === 0) { setBulkDone(bulkTotal); setSummaryOpen(true); return; }
        const t = setTimeout(() => {
            const nextPick = queueRef.current.shift();
            if (nextPick) { setBulkDone(d => d + 1); startRoll(nextPick); }
        }, 900);                                            // 定格停留：让玩家看清这一发的结果
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, bulkTotal]);

    /** [2026-10-02 #8] 回到待命：以**当前位移**为锚继续慢转（不再重置到绝对位移 360） */
    const backToIdle = () => {
        queueRef.current = [];   // [2026-10-04] 回待命：清掉批量队列与统计
        setBulkTotal(0);
        setBulkDone(0);
        const anchor = sRef.current;
        idleAnchorRef.current = anchor;
        phRef.current = 0;
        // 待命往复要往前多走 IDLE_MAX，保证尾巴够长不露白
        ensureLength(Math.ceil((anchor + IDLE_MAX + WINDOW_W) / CARD_W) + 1);
        setDetailOpen(false);
        setPh('idle');
    };

    const resultMeta = result ? RARITY_META[result.rarity] : undefined;
    const canOpen = pendingPacks > 0;
    const gameScale = getGameScale(); // [2026-10-02 #4] 主面板与详情弹窗统一按此补偿

    /** 匣子显示名：品质 + 大类（例：紫色 神格碎片匣） */
    const chestName = (c: ChestEntry): string => `${RARITY_META[c.rarity].label}·${CHEST_KIND_LABEL[c.kind]}`;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="pack-open-root"
                    className="fixed inset-0 z-[1200] flex items-center justify-center font-sans select-none"
                >
                    {/* 全屏遮罩：滚动中不响应点击关闭 */}
                    <motion.div
                        className="absolute inset-0 bg-black/85 backdrop-blur-md"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => { if (phase !== 'rolling') { eventBus.emit(GameEvents.UI_BACK); onClose(); } }}
                    />
                    {/* [2026-10-02 #4] 面板整体按 gameScale 缩放 —— 与详情弹窗、开匣弹窗统一 */}
                    <div style={{ transform: `scale(${gameScale})` }}>
                        <motion.div
                            initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                            className="relative bg-gradient-to-b from-slate-900 via-purple-950/50 to-slate-900 border-purple-500/30 flex flex-col items-center shadow-[0_0_80px_rgba(88,28,135,0.5)] overflow-hidden" style={{ width: PACK_OPEN_UI.panelWidth, borderRadius: PACK_OPEN_UI.panelRadius, borderWidth: PACK_OPEN_UI.panelBorderWidth, borderStyle: 'solid', padding: PACK_OPEN_UI.panelPad }}
                        >
                            {/* 标题 */}
                            <div className="flex items-center" style={{ gap: PACK_OPEN_UI.titleRowGap, marginBottom: PACK_OPEN_UI.titleRowMarginBottom }}>
                                <Package size={PACK_OPEN_UI.titleIconSize} className="text-purple-300" />
                                {/* [2026-10-02 #6] 术语统一：这里做的是**开卡包**，不叫「开匣」 */}
                                <h3 className="font-black tracking-widest text-white" style={{ fontSize: PACK_OPEN_UI.titleFontSize }}>卡包开启</h3>
                            </div>
                            <p className="text-purple-300/70 font-mono tracking-wider" style={{ fontSize: PACK_OPEN_UI.subtitleFontSize, marginBottom: PACK_OPEN_UI.subtitleMarginBottom }}>
                                {phase === 'idle'
                                    ? `待打开卡包 ×${pendingPacks} · 点击开启`
                                    : phase === 'rolling' ? '开启中…' : '已获得奖励匣'}
                            </p>

                            {/* ── 滚动展示窗（老虎机转盘）── */}
                            <div
                                className="relative overflow-hidden bg-black/60 border-white/10"
                                style={{borderRadius: PACK_OPEN_UI.windowRadius, borderWidth: PACK_OPEN_UI.windowBorderWidth, borderStyle: 'solid', width: WINDOW_W, height: CARD_H }}
                            >
                                {/* 中间标记线（+ 停住脉冲光） */}
                                <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 bg-yellow-400 shadow-[0_0_14px_rgba(250,204,21,0.9)] z-20" style={{ width: PACK_OPEN_UI.markerWidth }} />
                                {/* 两侧渐隐 */}
                                <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-black/80 to-transparent z-10 pointer-events-none" style={{ width: PACK_OPEN_UI.fadeWidth }} />
                                <div className="absolute inset-y-0 right-0 bg-gradient-to-l from-black/80 to-transparent z-10 pointer-events-none" style={{ width: PACK_OPEN_UI.fadeWidth }} />
                                {/* 底部轨道条 */}
                                <div className="absolute bottom-0 left-0 right-0 bg-black/50 border-white/5 z-10 pointer-events-none" style={{ height: PACK_OPEN_UI.trackHeight, borderTopWidth: PACK_OPEN_UI.trackBorderWidth, borderTopStyle: 'solid' }} />

                                {/* 滚动序列（rAF 手动 transform） */}
                                <div ref={stripRef} className="absolute top-0 left-0 flex will-change-transform">
                                    {sequence.map((chest, i) => {
                                        const meta = RARITY_META[chest.rarity];
                                        const isTarget = i === targetIndex;
                                        const isReveal = isTarget && phase === 'result';
                                        return (
                                            <div
                                                key={i}
                                                className="relative shrink-0 flex items-center justify-center"
                                                style={{ width: CARD_W, height: CARD_H }}
                                            >
                                                {/* 六边形图标：外层铺品质色（clip 露 2px 环 = 品质描边）+ 内层深底 + 匣子标识 */}
                                                <motion.div
                                                    className="relative"
                                                    style={{
                                                        width: HEX_SIZE,
                                                        height: HEX_SIZE,
                                                        clipPath: HEXAGON,
                                                        background: meta.color,
                                                        filter: `drop-shadow(0 0 ${isReveal ? 24 : 8}px ${meta.color}${isReveal ? 'ee' : '66'})`,
                                                    }}
                                                    animate={isReveal ? { scale: 1.6 } : { scale: 1 }}
                                                    transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                                                >
                                                    <div className="absolute overflow-hidden flex flex-col items-center justify-center" style={{inset: PACK_OPEN_UI.hexInnerInset, gap: PACK_OPEN_UI.hexInnerGap, clipPath: HEXAGON, background: '#0d1320' }}>
                                                        <Package size={PACK_OPEN_UI.hexIconSize} className="text-white/80" />
                                                        <span className="font-black leading-none" style={{fontSize: PACK_OPEN_UI.hexLabelFontSize, color: meta.color }}>
                                                            {chest.kind === 'armament' ? '武装' : '碎片'}
                                                        </span>
                                                    </div>
                                                </motion.div>
                                                {/* 停住后目标加选中标记 */}
                                                {isReveal && (
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.18 }}
                                                        className="absolute top-0 left-1/2 -translate-x-1/2 z-30 text-yellow-300 drop-shadow-[0_0_8px_rgba(250,204,21,0.9)]" style={{ fontSize: PACK_OPEN_UI.revealMarkerFontSize }}
                                                    >
                                                        ▲
                                                    </motion.div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* [2026-09-04] 中奖揭示：定格后目标格扩散品质色六边形光环（在放大发光之上再强调一次被抽中） */}
                                {phase === 'result' && resultMeta && (
                                    <motion.div
                                        className="pointer-events-none absolute z-[15]"
                                        style={{
                                            left: '50%', top: '50%',
                                            width: HEX_SIZE, height: HEX_SIZE,
                                            marginLeft: -HEX_SIZE / 2, marginTop: -HEX_SIZE / 2,
                                            clipPath: HEXAGON,
                                            border: `${PACK_OPEN_UI.haloBorderWidth}px solid ${resultMeta.color}`,
                                            filter: `drop-shadow(0 0 14px ${resultMeta.color})`,
                                        }}
                                        initial={{ opacity: 0, scale: 0.7 }}
                                        animate={{ opacity: [0.95, 0], scale: 1.9 }}
                                        transition={{ duration: 1.1, ease: 'easeOut', repeat: 1, repeatDelay: 0.45 }}
                                    />
                                )}
                            </div>

                            <p className="text-gray-500 font-mono tracking-wider pointer-events-none" style={{ fontSize: PACK_OPEN_UI.hintFontSize, marginTop: PACK_OPEN_UI.hintMarginTop }}>
                                🎁 卡包开出的是**奖励匣** · 停下中间的即为抽中，随后可在「待打开匣子」里开启
                            </p>

                            {/* [2026-10-04 程拍板] 一键全开：连播中显示进度（已播 n/总数），全部播完显示汇总 */}
                            {bulkTotal > 1 && (
                                <p className="font-mono tracking-wider pointer-events-none" style={{fontSize: PACK_OPEN_UI.bulkHintFontSize, marginTop: PACK_OPEN_UI.bulkHintMarginTop, color: '#a5f3fc' }}>
                                    {bulkDone < bulkTotal
                                        ? `⚡ 一键开启中… ${Math.min(bulkDone + 1, bulkTotal)}/${bulkTotal}`
                                        : `⚡ 本次一键开启 ${bulkTotal} 个卡包 —— 已全部存入「待打开匣子」`}
                                </p>
                            )}

                            {/* ── 底部按钮：待命 / 滚动中 / 结果兜底 ── */}
                            <div className="flex items-center" style={{ minHeight: PACK_OPEN_UI.buttonRowMinHeight, gap: PACK_OPEN_UI.buttonRowGap, marginTop: PACK_OPEN_UI.buttonRowMarginTop }}>
                                {phase === 'idle' && (
                                    <>
                                        <button onClick={handleOpen} disabled={!canOpen}
                                            className={`font-black tracking-widest transition-all ${
                                                canOpen
                                                    ? 'bg-gradient-to-r from-purple-600 to-purple-400 text-white hover:scale-105 shadow-[0_0_30px_rgba(168,85,247,0.5)]'
                                                    : 'bg-white/5 text-gray-500 cursor-not-allowed'
                                            }`} style={{ paddingLeft: PACK_OPEN_UI.mainBtnPadX, paddingRight: PACK_OPEN_UI.mainBtnPadX, paddingTop: PACK_OPEN_UI.mainBtnPadY, paddingBottom: PACK_OPEN_UI.mainBtnPadY, borderRadius: PACK_OPEN_UI.mainBtnRadius, fontSize: PACK_OPEN_UI.mainBtnFontSize }}>
                                            🎁 开启卡包！
                                        </button>
                                        {/* [2026-10-04 程拍板] 一键全开（≥2 个时才出现 —— 1 个时与单开无差别） */}
                                        {pendingPacks > 1 && (
                                            <button onClick={handleOpenAll}
                                                className="font-black tracking-widest bg-gradient-to-r from-cyan-600 to-teal-400 text-white hover:scale-105 transition-all shadow-[0_0_30px_rgba(34,211,238,0.5)]" style={{ paddingLeft: PACK_OPEN_UI.openAllBtnPadX, paddingRight: PACK_OPEN_UI.openAllBtnPadX, paddingTop: PACK_OPEN_UI.openAllBtnPadY, paddingBottom: PACK_OPEN_UI.openAllBtnPadY, borderRadius: PACK_OPEN_UI.openAllBtnRadius, fontSize: PACK_OPEN_UI.openAllBtnFontSize }}>
                                                ⚡ 一键全开（×{pendingPacks}）
                                            </button>
                                        )}
                                    </>
                                )}
                                {phase === 'rolling' && (
                                    <div className="bg-white/5 text-gray-500 font-black tracking-widest cursor-wait" style={{ paddingLeft: PACK_OPEN_UI.mainBtnPadX, paddingRight: PACK_OPEN_UI.mainBtnPadX, paddingTop: PACK_OPEN_UI.mainBtnPadY, paddingBottom: PACK_OPEN_UI.mainBtnPadY, borderRadius: PACK_OPEN_UI.mainBtnRadius, fontSize: PACK_OPEN_UI.mainBtnFontSize }}>开启中…</div>
                                )}
                                {/* [2026-10-02 #5] 结果态兜底：详情弹窗关掉后这里仍有可点，不再"底部空白" */}
                                {phase === 'result' && (
                                    <>
                                        <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setDetailOpen(true); }}
                                            className="bg-white/10 hover:bg-white/20 text-white font-black tracking-widest transition-all" style={{ paddingLeft: PACK_OPEN_UI.resultBtnPadX, paddingRight: PACK_OPEN_UI.resultBtnPadX, paddingTop: PACK_OPEN_UI.resultBtnPadY, paddingBottom: PACK_OPEN_UI.resultBtnPadY, borderRadius: PACK_OPEN_UI.resultBtnRadius }}>
                                            🔍 查看详情
                                        </button>
                                        <button onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                                            className="bg-gradient-to-r from-purple-600 to-purple-400 text-white font-black tracking-widest hover:scale-105 transition-all shadow-[0_0_25px_rgba(168,85,247,0.45)]" style={{ paddingLeft: PACK_OPEN_UI.resultBtnPadX, paddingRight: PACK_OPEN_UI.resultBtnPadX, paddingTop: PACK_OPEN_UI.resultBtnPadY, paddingBottom: PACK_OPEN_UI.resultBtnPadY, borderRadius: PACK_OPEN_UI.resultBtnRadius }}>
                                            {canOpen ? '收起' : '完成'}
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* 右上关闭（滚动中禁用） */}
                            {phase !== 'rolling' && (
                                <button onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }} className="absolute rounded-full text-gray-500 hover:bg-white/10 hover:text-white transition-all" style={{ top: PACK_OPEN_UI.closeTop, right: PACK_OPEN_UI.closeRight, padding: PACK_OPEN_UI.closePad }}>
                                    <X size={PACK_OPEN_UI.closeIconSize} />
                                </button>
                            )}

                        </motion.div>
                    </div>

                    {/* ── 详情效果弹窗（portal 到 body 全屏浮层，脱离 modal 高度与 overflow 裁剪）
                     [2026-09-07 修复] 去掉包裹 portal 的 AnimatePresence：portal 不是 AnimatePresence 可识别的 motion child，
                     进入动画不触发 → 弹窗停在 opacity:0 全透明却仍拦截点击（"定格后没弹窗、点不动"）；改普通条件渲染，portal 内 motion 自播进入动画。
                     分辨率补偿 scale 移入独立纯 div，避免被 framer 的 transform 动画覆盖。 */}
                    {detailOpen && phase === 'result' && result && resultMeta && createPortal(
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/70"
                            // [2026-10-02 #9] 点背景 = 收起详情（原来 stopPropagation 后什么都不做，像卡住了）
                            onClick={(e) => { e.stopPropagation(); setDetailOpen(false); }}
                        >
                            <div style={{ transform: `scale(${gameScale})` }}>
                                <motion.div
                                    initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
                                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                                    className="flex flex-col items-center shadow-[0_0_60px_rgba(0,0,0,0.9)]"
                                    style={{width: PACK_OPEN_UI.detailWidth, borderRadius: PACK_OPEN_UI.detailRadius, borderWidth: PACK_OPEN_UI.detailBorderWidth, borderStyle: 'solid', padding: PACK_OPEN_UI.detailPad, gap: PACK_OPEN_UI.detailGap, background: resultMeta.cardBg, borderColor: `${resultMeta.color}66`, boxShadow: `0 0 40px ${resultMeta.color}44` }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="font-black tracking-widest" style={{fontSize: PACK_OPEN_UI.detailTitleFontSize, color: resultMeta.color, textShadow: `0 0 18px ${resultMeta.color}88` }}>
                                        ✨ 获得奖励匣 ✨
                                    </div>
                                    {/* 六边形大图标（外层品质色环 + 内层深底 + 匣子标识） */}
                                    <div className="relative"
                                        style={{ width: BIG_HEX, height: BIG_HEX, clipPath: HEXAGON, background: resultMeta.color, filter: `drop-shadow(0 0 18px ${resultMeta.color}aa)` }}>
                                        <div className="absolute overflow-hidden flex flex-col items-center justify-center" style={{inset: PACK_OPEN_UI.bigHexInnerInset, gap: PACK_OPEN_UI.bigHexInnerGap, clipPath: HEXAGON, background: '#0d1320' }}>
                                            <Package size={PACK_OPEN_UI.bigHexIconSize} className="text-white/85" />
                                            <span className="font-black" style={{fontSize: PACK_OPEN_UI.bigHexLabelFontSize, color: resultMeta.color }}>
                                                {result.kind === 'armament' ? '武装' : '碎片'}
                                            </span>
                                        </div>
                                    </div>
                                    {/* 名称 */}
                                    <div className="font-black tracking-wide text-center" style={{fontSize: PACK_OPEN_UI.chestNameFontSize, color: '#fff', textShadow: `0 0 10px ${resultMeta.color}88` }}>
                                        {chestName(result)}
                                    </div>
                                    {/* 品质 + 大类 chips */}
                                    <div className="flex flex-wrap justify-center" style={{ gap: PACK_OPEN_UI.chipsGap }}>
                                        <span className="font-mono" style={{fontSize: PACK_OPEN_UI.chipFontSize, paddingLeft: PACK_OPEN_UI.chipPadX, paddingRight: PACK_OPEN_UI.chipPadX, paddingTop: PACK_OPEN_UI.chipPadY, paddingBottom: PACK_OPEN_UI.chipPadY, borderRadius: PACK_OPEN_UI.chipRadius, color: resultMeta.color, border: `1px solid ${resultMeta.color}55`, background: `${resultMeta.color}11` }}>
                                            {resultMeta.label}
                                        </span>
                                        <span className="font-mono text-amber-200 border-amber-300/30 bg-amber-400/10" style={{ fontSize: PACK_OPEN_UI.chipFontSize, paddingLeft: PACK_OPEN_UI.chipPadX, paddingRight: PACK_OPEN_UI.chipPadX, paddingTop: PACK_OPEN_UI.chipPadY, paddingBottom: PACK_OPEN_UI.chipPadY, borderRadius: PACK_OPEN_UI.chipRadius, borderWidth: PACK_OPEN_UI.chipBorderWidth, borderStyle: 'solid' }}>
                                            {CHEST_KIND_LABEL[result.kind]}
                                        </span>
                                    </div>
                                    {/* 开出内容预告 */}
                                    <p className="text-gray-200 leading-relaxed text-center" style={{ fontSize: PACK_OPEN_UI.descFontSize }}>
                                        {describeChestContent(result.kind, result.rarity)}
                                        {result.kind === 'shard' && (
                                            <span className="block text-cyan-300/80" style={{ fontSize: PACK_OPEN_UI.shardNoteFontSize, marginTop: PACK_OPEN_UI.shardNoteMarginTop }}>
                                                {/* [2026-10-02 #10] 用常量，别硬编码 5 */}
                                                碎片每 {SHARD_GROUP_SIZE} 片为一组，随机归属一位天启者 · 万能碎片不会从这里开出
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-purple-200/70 text-center" style={{ fontSize: PACK_OPEN_UI.detailFootFontSize, marginTop: PACK_OPEN_UI.detailFootMarginTop }}>
                                        匣子已存入「待打开匣子」，开启后才会得到道具
                                    </p>
                                    {/* 按钮：去开匣子 / 再开一包 / 收起 */}
                                    <div className="flex flex-wrap justify-center" style={{ gap: PACK_OPEN_UI.detailBtnRowGap, marginTop: PACK_OPEN_UI.detailBtnRowMarginTop }}>
                                        {onOpenChest && (
                                            <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onClose(); onOpenChest(); }}
                                                className="bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-black tracking-widest hover:scale-105 transition-all shadow-[0_0_25px_rgba(250,204,21,0.5)]" style={{ paddingLeft: PACK_OPEN_UI.detailBtnPadX, paddingRight: PACK_OPEN_UI.detailBtnPadX, paddingTop: PACK_OPEN_UI.detailBtnPadY, paddingBottom: PACK_OPEN_UI.detailBtnPadY, borderRadius: PACK_OPEN_UI.detailBtnRadius }}>
                                                🔓 去开匣子
                                            </button>
                                        )}
                                        {canOpen && (
                                            <button onClick={handleOpen}
                                                className="bg-gradient-to-r from-purple-600 to-purple-400 text-white font-black tracking-widest hover:scale-105 transition-all shadow-[0_0_25px_rgba(168,85,247,0.5)]" style={{ paddingLeft: PACK_OPEN_UI.detailBtnPadX, paddingRight: PACK_OPEN_UI.detailBtnPadX, paddingTop: PACK_OPEN_UI.detailBtnPadY, paddingBottom: PACK_OPEN_UI.detailBtnPadY, borderRadius: PACK_OPEN_UI.detailBtnRadius }}>
                                                🎁 再开一包（×{pendingPacks}）
                                            </button>
                                        )}
                                        <button onClick={() => { if (canOpen) { eventBus.emit(GameEvents.UI_CLICK); backToIdle(); } else { eventBus.emit(GameEvents.UI_BACK); onClose(); } }}
                                            className="bg-white/10 hover:bg-white/20 text-white font-black tracking-widest transition-all" style={{ paddingLeft: PACK_OPEN_UI.detailBtnPadX, paddingRight: PACK_OPEN_UI.detailBtnPadX, paddingTop: PACK_OPEN_UI.detailBtnPadY, paddingBottom: PACK_OPEN_UI.detailBtnPadY, borderRadius: PACK_OPEN_UI.detailBtnRadius }}>
                                            {canOpen ? '收起' : '完成'}
                                        </button>
                                    </div>
                                </motion.div>
                            </div>
                        </motion.div>,
                        document.body,
                    )}
                </motion.div>
            )}
            {/* [2026-10-04 程拍板] 一键开包 · **完整结果汇总窗**（连播全部播完后弹出）
                ⚠️ 必须放在 `</AnimatePresence>` **之内** —— 它是 return 的根元素，
                   同级并列会破坏 JSX 单根（本次踩过）*/}
            <BulkOpenSummaryModal
                key="bulk-summary"
                open={summaryOpen}
                title="本次一键开包结果"
                items={bulkList.map<BulkSummaryItem>(c => ({
                    name: chestName(c),
                    rarity: c.rarity,
                    kindLabel: CHEST_KIND_LABEL[c.kind],
                    note: describeChestContent(c.kind, c.rarity).split('\n')[0],
                }))}
                onClose={() => setSummaryOpen(false)}
            />
        </AnimatePresence>
    );
};
