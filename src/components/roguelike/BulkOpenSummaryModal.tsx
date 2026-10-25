// ==========================================
// 悖论迷宫 · 「一键全开」结果汇总窗（卡包 / 匣子共用）
//
// [2026-10-04 程拍板] 一键开包 / 一键开匣**全部开完后**，单独弹一个窗展示本次的**完整结果**。
//   程原话：「我们都做了一键开启的功能了，等全部开完再单开一个窗口展示所有的结果很难吗？」
//   → 一处实现、两个弹窗共用（避免"卡包一份、匣子又一份"）。
//
// [2026-10-21 程拍板 · **视觉重做**] 程原话：「汇总结果弹窗太丑了，我想优化改进一下」
//   旧版病根：`items.map` 一行行平铺纯文字 —— 开 200 个包会渲染 200 行，
//   而匣子名只有 12 种、说明文字同种类完全相同 ⇒ **等于没有汇总**。
//   新版三件事：**① 按品质分组 ② 同款合并 ③ 图标展示**（武装/碎片/匣子/券全都有图）
//
// 配色口径（[2026-10-21] 与两个父弹窗对齐）：
//   · **紫** = 容器 / 流程（本弹窗底色，对齐 PackOpenModal / ChestOpenModal）
//   · **青** = 数字语义色（数量、合计）—— 项目里青色本来就在干这件事
//     （`ChestOpenModal` 的碎片数量就是 cyan-200）
//   · **品质色** = 稀有度（六档形状图标 + 描边 + 竖条 + 发光，多通道编码）
// ==========================================
import React, { useMemo } from 'react';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Package, Diamond } from 'lucide-react';
import { RARITY_META } from './RarityIcon';
import { ShardIcon } from './ShardIcon';
import { getGameScale } from '../../utils/gameScale';
// [2026-10-21 手机实测修复] 画布内浮层的手机端缩放（组件里禁写 isNative）
import { pickTuning, pickCanvasContainScale } from '../../platform/tuning';
import type { EnhancementRarity } from '../../data/roguelike/enhancements';

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 「一键全开 · 结果汇总窗」视觉调参区（程微调就改这里）
// ──────────────────────────────────────────────────────────────────────
// 改完存盘即生效（HMR）。值都是**画布 px**（1680×1050 坐标系），直接进 style。
// ⚠️ 本屏无 `vh` / `vw`、无 `max-w-*`（合 `design-guide.md` §3 与 `规范-界面调参区.md`）。
// 🖥️📱 【双平台】（2026-10-21 手机实测后补）：
//    手机端**只重排、不放大字号** —— 字号会随外层 `pickCanvasContainScale` 一起放大，
//    这里再改字号就是双重放大。手机端只改两件：**面板更窄 + 列数更少**。
//    `BULK_UI_MOBILE` 是手机端全量值；`BULK_UI_PC_DIFF` 只列与手机不同的项。
// ══════════════════════════════════════════════════════════════════════
const BULK_UI_MOBILE = {
    // ── 面板本体 ─────────────────────────────────────────────
    /** 面板宽 px —— 必须容得下 `gridCols × tileWidth + (gridCols-1) × gridGap + 2 × panelPad`：
     *  手机 3×200 + 2×12 + 2×24 = **672**（取 720 留余量）；
     *  PC  5×200 + 4×12 + 2×24 = **1072**（取 1120）。
     *  ⚠️ 改 tile/gap/cols 时**必须重算**这一行，否则会横向溢出。 */
    panelWidth: 720,
    /**
     * 面板最大高 px（内容少时按内容收缩）。
     *
     * [2026-10-24 程实测 BUG修复] 原值 **880**（= 1050×0.82，按 PC 画布定的）。
     * ── 病根：内层缩放 `k` 是按"占屏 94% 宽"反解的（手机 ≈2.97），
     *    而 k 会**同时**放大高度 ⇒ `880 × 2.97 × 0.374 = 978 CSS px`，屏幕才 393 ⇒ 溢出 2.5 倍。
     * ── 修法两层：① 缩放改成"宽高都放得下"的 contain（`pickCanvasContainScale`）；
     *    ② 手机端设计高从 880 → **400** —— 设计高越小，按高算的 k 越大 ⇒ **字号越大、面板越宽**，
     *    而视觉高度不变（这才是"想字大"的正确旋钮，只调占屏比是没用的）。
     *    400 下：面板约 **580×322 CSS px（屏宽 68% × 屏高 82%）**，正文字号 10.5~12.9。
     * ⚠️ PC 端在 `BULK_UI_PC_DIFF` 里显式保留 880，观感零变化。
     */
    panelMaxHeight: 400,
    /** 面板圆角 px —— 对齐两个父弹窗的 24（原 16，比父窗小一档） */
    panelRadius: 24,
    /** 面板四周内边距 px —— 对齐父窗的 24（原 28） */
    panelPad: 24,
    /** 面板描边 px */
    panelBorderWidth: 1,

    // ── 标题行 ───────────────────────────────────────────────
    /** 标题图标 px（原 size={20}） */
    titleIconSize: 22,
    /** 标题字号 px —— 对齐开匣父窗的 30（原 20；刻意不跟开包的 36：结果页不该压过自己的父窗） */
    titleFontSize: 30,
    /** 标题与统计之间的间距 px */
    titleGap: 12,
    /** 统计行字号 px（「共 30 个 · 6 款」） */
    statFontSize: 14,
    /** 关闭按钮 px / 图标 px */
    closeBtnSize: 36,
    closeIconSize: 18,

    // ── 品质分组 ─────────────────────────────────────────────
    /** 组与组之间的间距 px */
    groupGap: 16,
    /** 组头高 px */
    groupHeaderHeight: 34,
    /** 组头与网格的间距 px */
    groupHeaderMarginBottom: 8,
    /** 组头左侧品质竖条宽 px（普通档 2 → 金色档 4，见 groupBarWidthBoost） */
    groupBarWidth: 2,
    /** 金/红两档的竖条加宽 px（Rare Boost 的一部分） */
    groupBarWidthBoost: 4,
    /** 组头圆角 px */
    groupHeaderRadius: 8,
    /** 组头内边距 px */
    groupHeaderPadX: 10,
    /** 组头品质形状图标 px */
    groupIconSize: 14,
    /** 组头品质名字号 px */
    groupLabelFontSize: 14,
    /** 组头件数字号 px（青色数字） */
    groupCountFontSize: 15,

    // ── 条目网格 ─────────────────────────────────────────────
    /** 网格列数 —— 手机 3 列（面板 720 才能放下），PC 5 列 */
    gridCols: 3,
    /** 网格横向/纵向间距 px */
    gridGap: 12,
    /** 条目卡宽 px */
    tileWidth: 200,
    /** 条目卡高 px（要容得下「图标 48~64」或「两行名字 + chip 行」，取 88） */
    tileHeight: 88,
    /** 条目卡圆角 / 内边距 px */
    tileRadius: 12,
    tilePad: 10,
    tileBorderWidth: 1,
    /** 条目内图标容器边长 px（白绿蓝紫）· 金/红见 tileIconSizeBoost */
    tileIconSize: 48,
    /** 金/红条目图标额外放大 px（Rare Boost：只放大图标，不改卡片尺寸 ⇒ 不破网格） */
    tileIconSizeBoost: 16,
    /** 图标容器圆角 px */
    tileIconRadius: 10,
    /** 条目名字号 px */
    tileNameFontSize: 13,
    /** 条目名字最多占几行（超出省略） */
    tileNameClamp: 2,
    /** ×N 徽章字号 px */
    tileBadgeFontSize: 12,
    /** 类型 chip 字号 px */
    tileChipFontSize: 10,
    /** 类型 chip 内边距 px */
    tileChipPadX: 6,
    tileChipPadY: 1,

    // ── 单品陈列（整轮只出一件金/红时）───────────────────────
    /** 单品陈列的大图标边长 px */
    heroIconSize: 132,
    /** 单品陈列的名字字号 px */
    heroNameFontSize: 22,
    /** 单品陈列的上下留白 px */
    heroPadY: 28,
    /** 单品陈列的文案字号 px */
    heroNoteFontSize: 13,

    // ── 底部按钮 ─────────────────────────────────────────────
    /** 按钮与内容区的间距 px */
    footerMarginTop: 20,
    /** 按钮左右/上下内边距 px */
    footerPadX: 56,
    footerPadY: 12,
    /** 按钮圆角 px */
    footerRadius: 12,
    /** 按钮字号 px */
    footerFontSize: 16,
};

/**
 * PC 端差异项 —— **只列与手机不同的项**（规范 §2 规矩 7）。
 * 目前只有两件：面板更宽、列数从 3 → 5。字号两端一致（不重复抄，避免漂移）。
 */
const BULK_UI_PC_DIFF = {
    panelWidth: 1120,
    gridCols: 5,
    // [2026-10-24] 手机端面板设计高改到 400（见 BULK_UI_MOBILE 的注释）；
    //   PC 端**必须显式保留 880**，否则会被手机值连带改小 ⇒ 观感变化。
    panelMaxHeight: 880,
};

/** 🖥️ PC / 📱 手机 —— 按运行平台自动二选一（平台判定在 `src/platform/tuning.ts`） */
const BULK_UI = pickTuning({ ...BULK_UI_MOBILE, ...BULK_UI_PC_DIFF }, BULK_UI_MOBILE);

/** 产物类型 → 兜底中文标签（调用方给了 `kindLabel` 就优先用它的） */
const KIND_LABEL: Record<BulkRewardKind, string> = {
    chest: '奖励匣',
    armament: '武装',
    shard: '碎片',
    universal: '万能碎片',
    voucher: '匣券',
};

/** 六档展示顺序：**稀有优先**（玩家开完第一眼想看有没有出金/红） */
const RARITY_ORDER: EnhancementRarity[] = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];

/** Rare Boost 只给这两档 */
const isTopRarity = (r?: EnhancementRarity | null) => r === 'mythic' || r === 'legendary';

/** 碎片类产物：**没有品质概念**（入账后是某英雄同一个计数器） */
const isShardKind = (k?: BulkRewardKind) => k === 'shard' || k === 'universal';

/** 「神格碎片」专用组的中性色（碎片没有品质色可用） */
const SHARD_GROUP_COLOR = '#a78bfa';
const SHARD_GROUP_LABEL = '神格碎片';

/** 产物类型（决定 chip 文案与图标怎么渲染） */
export type BulkRewardKind = 'chest' | 'armament' | 'shard' | 'universal' | 'voucher';

export interface BulkSummaryItem {
    /** 主标题（匣子专名 / 武装名 / 天启者名 / 「匣券」） */
    name: string;
    /**
     * 品质。**碎片类产物不要传**（见下）。
     *
     * 🔴 [2026-10-21 程指正] **天启者的神格碎片没有品质之分**：
     *   碎片入账后就是**同一个计数器**（某英雄的神格碎片总数），
     *   匣子的品质只决定"这一匣给几片"，不是碎片自身的属性。
     *   ⇒ 传了 `rarity` 会让"稀有匣开出的芬妮碎片"和"普通匣开出的芬妮碎片"
     *     被分到两个品质组里 —— 那是错的，它们必须**合并到一起**。
     *   ⇒ 所以本字段对 `kind: 'shard' | 'universal'` 一律**留空**，
     *     这类条目会被归入「神格碎片」专用组（不参与六档品质分组）。
     */
    rarity?: EnhancementRarity;
    /**
     * [2026-10-21 视觉重做] **数量**。旧版没有这个字段 ⇒ "共 N 项"只能表示**行数**，
     * 30 个白碎片匣（实际 150 片）会显示成"共 30 项"。合并时按此累加。
     */
    amount?: number;
    /** 图标 URL（武装本体图 / 匣子插画 / 券图） */
    icon?: string;
    /** 碎片专用：交给 `<ShardIcon heroKey />` 渲染（头像裁进菱形） */
    heroKey?: string;
    /** 产物类型（chip 文案 + 图标兜底） */
    kind?: BulkRewardKind;
    /** 自定义小标签（优先于 `kind` 的兜底文案） */
    kindLabel?: string;
    /** 副文案（可省略；合并后只保留第一条的） */
    note?: string;
}

interface BulkOpenSummaryModalProps {
    open: boolean;
    title: string;
    items: BulkSummaryItem[];
    onClose: () => void;
}

// ── 合并 + 分组（纯函数，组件内 useMemo 兜住）─────────────────────────
interface MergedItem extends BulkSummaryItem {
    amount: number;
}

/** 合并键：
 *  · **碎片类 → `类型|天启者`（刻意不含品质）** —— 程 2026-10-21 指正：
 *    稀有匣开出的芬妮碎片与普通匣开出的芬妮碎片是**同一个计数器**，必须并成一条。
 *  · 其它（匣 / 武装 / 券）→ `类型|名字|品质|天启者`（同款同品质才合并） */
const mergeKeyOf = (it: BulkSummaryItem) =>
    isShardKind(it.kind)
        ? `${it.kind}|${it.heroKey ?? ''}`
        : `${it.kind ?? ''}|${it.name}|${it.rarity ?? ''}|${it.heroKey ?? ''}`;

function mergeItems(items: BulkSummaryItem[]): MergedItem[] {
    const map = new Map<string, MergedItem>();
    for (const it of items) {
        const key = mergeKeyOf(it);
        const prev = map.get(key);
        if (prev) {
            prev.amount += it.amount ?? 1;
            // 副文案取第一条（同款同品质的说明文字本来就一样）
        } else {
            map.set(key, { ...it, amount: it.amount ?? 1 });
        }
    }
    return Array.from(map.values());
}

interface RarityGroup {
    /** `null` = 「神格碎片」专用组（碎片无品质，不参与六档分组） */
    rarity: EnhancementRarity | null;
    items: MergedItem[];
    /** 该组**总件数**（不是条目数） */
    total: number;
}

function groupByRarity(merged: MergedItem[]): RarityGroup[] {
    const buckets = new Map<EnhancementRarity | null, MergedItem[]>();
    for (const it of merged) {
        // 碎片类一律进 `null` 桶 —— 它们**不按品质分组**，而是按天启者各一条
        const bucket = isShardKind(it.kind) ? null : (it.rarity ?? null);
        const arr = buckets.get(bucket);
        if (arr) arr.push(it);
        else buckets.set(bucket, [it]);
    }
    const sortInGroup = (arr: MergedItem[]) =>
        arr.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'zh'));

    const groups: RarityGroup[] = [];
    // ① 先出六档品质组（稀有优先）
    for (const rarity of RARITY_ORDER) {
        const arr = buckets.get(rarity);
        if (!arr || arr.length === 0) continue;
        sortInGroup(arr);
        groups.push({ rarity, items: arr, total: arr.reduce((s, x) => s + x.amount, 0) });
    }
    // ② 碎片组放**最后**：它是养成材料，不该抢"到手了什么装备"的视线
    const shards = buckets.get(null);
    if (shards && shards.length > 0) {
        sortInGroup(shards);
        groups.push({ rarity: null, items: shards, total: shards.reduce((s, x) => s + x.amount, 0) });
    }
    return groups;
}

export const BulkOpenSummaryModal: React.FC<BulkOpenSummaryModalProps> = ({ open, title, items, onClose }) => {
    const merged = useMemo(() => mergeItems(items), [items]);
    const groups = useMemo(() => groupByRarity(merged), [merged]);
    const totalCount = useMemo(() => merged.reduce((s, x) => s + x.amount, 0), [merged]);
    /** 整轮只出一件、且是金/红 ⇒ 走「单品陈列」（那种时刻值得给足画面） */
    const heroMode = merged.length === 1 && isTopRarity(merged[0].rarity);
    const hero = heroMode ? merged[0] : null;
    const heroMeta = hero ? RARITY_META[hero.rarity ?? 'common'] : null;

    const close = () => { eventBus.emit(GameEvents.UI_BACK); onClose(); };

    /** 条目图标：碎片走 ShardIcon（菱形），有图用图，都没有则品质形状兜底 */
    const renderIcon = (it: MergedItem, size: number) => {
        if (it.kind === 'shard' || it.kind === 'universal') {
            return <ShardIcon heroKey={it.heroKey} size={size} />;
        }
        if (it.icon) {
            return (
                <img src={it.icon} alt="" draggable={false}
                    className="h-full w-full object-contain" />
            );
        }
        const meta = it.rarity ? RARITY_META[it.rarity] : null;
        if (!meta) return <Package size={size * 0.55} className="text-white/40" />;
        const FallbackIcon = meta.Icon;
        return <FallbackIcon size={size * 0.55} fill="currentColor" strokeWidth={1.5} style={{ color: meta.color }} />;
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/80"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={close}
                >
                    {/* 🔴 [2026-10-21 手机实测修复] 画布内弹窗必须补偿手机缩放：
                        本层在 `ScaleWrapper` 内（祖先已 `scale(s)`，手机 s≈0.23），
                        原来**没有任何内层缩放** ⇒ 1120px 的面板在手机上只有约 260px、字号 7px。
                    🔴 [2026-10-24 程实测修复] 上一版**只按宽度**反解（占屏 94%）⇒ 高度被同一个 k 放大到
                        978 CSS px（屏高仅 393）⇒ 窗口铺满整个画面。改成**宽高同时约束**的 contain。
                        手机 0.88/0.82 ⇒ 约 580×322 CSS（屏宽 68% × 屏高 82%）；
                        **PC 端 legacy 传 1（等于不改，观感零变化）**。 */}
                    <div style={{
                        transform: `scale(${pickCanvasContainScale(BULK_UI.panelWidth, BULK_UI.panelMaxHeight, 0.88, 0.82, getGameScale(), 1)})`,
                    }}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.94, y: 14 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 240, damping: 24 }}
                        onClick={e => e.stopPropagation()}
                        className="relative flex flex-col overflow-hidden border border-purple-500/35 bg-gradient-to-b from-slate-900 via-purple-950/40 to-slate-950"
                        style={{
                            width: BULK_UI.panelWidth,
                            maxHeight: BULK_UI.panelMaxHeight,
                            borderRadius: BULK_UI.panelRadius,
                            borderWidth: BULK_UI.panelBorderWidth,
                            borderStyle: 'solid',
                            padding: BULK_UI.panelPad,
                            boxShadow: '0 0 60px rgba(88,28,135,0.45)',
                        }}
                    >
                        {/* ── 标题行：紫色系（容器/流程），统计数字用青色 ── */}
                        <div className="flex shrink-0 items-center" style={{ gap: BULK_UI.titleGap }}>
                            <Sparkles size={BULK_UI.titleIconSize} className="text-purple-300" />
                            <h3 className="font-black tracking-widest text-white" style={{ fontSize: BULK_UI.titleFontSize }}>
                                {title}
                            </h3>
                            <span className="font-mono text-cyan-200" style={{ fontSize: BULK_UI.statFontSize }}>
                                共 {totalCount} 个 · {merged.length} 款
                            </span>
                            <button onClick={close}
                                className="ml-auto flex items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                                style={{ width: BULK_UI.closeBtnSize, height: BULK_UI.closeBtnSize }}>
                                <X size={BULK_UI.closeIconSize} />
                            </button>
                        </div>

                        {/* ── 内容区（整体滚动 + sticky 组头；绝不每组独立滚动 = 触屏卡死感）
                            ⚠️ `min-h-0` 是必需的：flex 子项默认 `min-height:auto`，
                               不加它滚动区会被内容撑破、`maxHeight` 失效。 */}
                        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
                            {merged.length === 0 ? (
                                /* 空态（正常路径不可达：两个调用方都在 items 为空时提前 return，
                                   但补上成本极低，免得将来某个入口改动后露出一片空白） */
                                <div className="flex flex-col items-center justify-center text-gray-500"
                                    style={{ paddingTop: 48, paddingBottom: 48 }}>
                                    <Package size={44} className="text-white/15" />
                                    <div style={{ marginTop: 12, fontSize: BULK_UI.statFontSize }}>
                                        本次没有获得任何物品
                                    </div>
                                </div>
                            ) : hero && heroMeta ? (
                                /* ══ 单品陈列：整轮只有一件金/红 ══ */
                                <div className="flex flex-col items-center" style={{ paddingTop: BULK_UI.heroPadY, paddingBottom: BULK_UI.heroPadY }}>
                                    <div className="flex items-center justify-center"
                                        style={{
                                            width: BULK_UI.heroIconSize, height: BULK_UI.heroIconSize,
                                            filter: `drop-shadow(0 0 24px ${heroMeta.color}aa)`,
                                        }}>
                                        {renderIcon(hero, BULK_UI.heroIconSize)}
                                    </div>
                                    <div className="font-black text-white" style={{ fontSize: BULK_UI.heroNameFontSize, marginTop: 14 }}>
                                        {hero.name} ×{hero.amount}
                                    </div>
                                    <div className="font-mono" style={{ fontSize: BULK_UI.statFontSize, marginTop: 6, color: heroMeta.color }}>
                                        {heroMeta.label} · {hero.kindLabel ?? KIND_LABEL[hero.kind ?? 'chest']}
                                    </div>
                                    <div className="text-gray-400" style={{ fontSize: BULK_UI.heroNoteFontSize, marginTop: 10 }}>
                                        本次出率高于常规上限，值得记一笔 ✨
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {groups.map((g, gi) => {
                                        // 碎片组（rarity === null）走中性紫 + 菱形图标，
                                        // 与六档品质组在视觉上明确分开（程：要区分武装和碎片）
                                        const isShardGroup = g.rarity === null;
                                        const meta = g.rarity ? RARITY_META[g.rarity] : null;
                                        const accent = meta?.color ?? SHARD_GROUP_COLOR;
                                        const groupLabel = meta?.label ?? SHARD_GROUP_LABEL;
                                        const boost = isTopRarity(g.rarity);
                                        const GroupIcon = meta?.Icon ?? Diamond;
                                        return (
                                            <div key={g.rarity ?? 'shard-group'} style={{ marginTop: gi === 0 ? 0 : BULK_UI.groupGap }}>
                                                {/* 组头：sticky，实底不透明（否则内容会从底下透出来） */}
                                                <div className="sticky top-0 z-10 flex items-center"
                                                    style={{
                                                        height: BULK_UI.groupHeaderHeight,
                                                        marginBottom: BULK_UI.groupHeaderMarginBottom,
                                                        borderRadius: BULK_UI.groupHeaderRadius,
                                                        paddingLeft: BULK_UI.groupHeaderPadX,
                                                        paddingRight: BULK_UI.groupHeaderPadX,
                                                        gap: 8,
                                                        background: 'rgba(17,20,28,0.97)',
                                                        borderLeft: `${boost ? BULK_UI.groupBarWidthBoost : BULK_UI.groupBarWidth}px solid ${accent}`,
                                                        boxShadow: boost ? `0 0 18px ${accent}44, inset 0 0 24px ${accent}11` : 'none',
                                                    }}>
                                                    <GroupIcon size={BULK_UI.groupIconSize} fill="currentColor" strokeWidth={1.5} style={{ color: accent }} />
                                                    <span className="font-black tracking-widest" style={{ fontSize: BULK_UI.groupLabelFontSize, color: accent }}>
                                                        {groupLabel}
                                                    </span>
                                                    <span className="font-mono text-cyan-200" style={{ fontSize: BULK_UI.groupCountFontSize }}>
                                                        ×{g.total}{isShardGroup ? ' 片' : ''}
                                                    </span>
                                                    <span className="ml-auto font-mono text-gray-500" style={{ fontSize: BULK_UI.tileChipFontSize }}>
                                                        {g.items.length} 款
                                                    </span>
                                                </div>

                                                {/* 组内网格：条目卡尺寸恒定，金/红只放大图标（Rare Boost 不破网格） */}
                                                <div className="grid" style={{
                                                    gridTemplateColumns: `repeat(${BULK_UI.gridCols}, ${BULK_UI.tileWidth}px)`,
                                                    gap: BULK_UI.gridGap,
                                                }}>
                                                    {g.items.map(it => {
                                                        const iconSize = boost
                                                            ? BULK_UI.tileIconSize + BULK_UI.tileIconSizeBoost
                                                            : BULK_UI.tileIconSize;
                                                        // 碎片条目没有品质 ⇒ 用组的中性紫兜底
                                                        const itAccent = it.rarity ? RARITY_META[it.rarity].color : accent;
                                                        const chip = it.kindLabel ?? KIND_LABEL[it.kind ?? 'chest'];
                                                        return (
                                                            <div key={mergeKeyOf(it)}
                                                                className="relative flex items-center"
                                                                style={{
                                                                    width: BULK_UI.tileWidth,
                                                                    height: BULK_UI.tileHeight,
                                                                    borderRadius: BULK_UI.tileRadius,
                                                                    borderWidth: BULK_UI.tileBorderWidth,
                                                                    borderStyle: 'solid',
                                                                    borderColor: `${itAccent}44`,
                                                                    background: 'rgba(255,255,255,0.04)',
                                                                    padding: BULK_UI.tilePad,
                                                                    gap: 10,
                                                                    boxShadow: boost ? `0 0 16px ${itAccent}33` : 'none',
                                                                }}>
                                                                <div className="flex shrink-0 items-center justify-center"
                                                                    style={{
                                                                        width: iconSize, height: iconSize,
                                                                        borderRadius: BULK_UI.tileIconRadius,
                                                                        background: `${itAccent}14`,
                                                                    }}>
                                                                    {renderIcon(it, iconSize)}
                                                                </div>
                                                                <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
                                                                    <div className="font-black text-white"
                                                                        style={{
                                                                            fontSize: BULK_UI.tileNameFontSize,
                                                                            display: '-webkit-box',
                                                                            WebkitLineClamp: BULK_UI.tileNameClamp,
                                                                            WebkitBoxOrient: 'vertical',
                                                                            overflow: 'hidden',
                                                                        }}>
                                                                        {it.name}
                                                                    </div>
                                                                    <div className="flex items-center" style={{ gap: 5 }}>
                                                                        <span className="rounded border font-mono"
                                                                            style={{
                                                                                fontSize: BULK_UI.tileChipFontSize,
                                                                                padding: `${BULK_UI.tileChipPadY}px ${BULK_UI.tileChipPadX}px`,
                                                                                color: itAccent,
                                                                                borderColor: `${itAccent}55`,
                                                                                background: `${itAccent}11`,
                                                                            }}>
                                                                            {chip}
                                                                        </span>
                                                                        {/* 数量徽章：青色 = 数字语义色；碎片带"片"单位 */}
                                                                        <span className="font-mono font-black text-cyan-200"
                                                                            style={{ fontSize: BULK_UI.tileBadgeFontSize }}>
                                                                            ×{it.amount}{isShardGroup ? ' 片' : ''}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>

                        {/* ── 底部按钮 ── */}
                        <button onClick={close}
                            className="shrink-0 self-center bg-gradient-to-r from-purple-600 to-purple-400 font-black tracking-widest text-white transition hover:scale-[1.02]"
                            style={{
                                marginTop: BULK_UI.footerMarginTop,
                                paddingLeft: BULK_UI.footerPadX, paddingRight: BULK_UI.footerPadX,
                                paddingTop: BULK_UI.footerPadY, paddingBottom: BULK_UI.footerPadY,
                                borderRadius: BULK_UI.footerRadius,
                                fontSize: BULK_UI.footerFontSize,
                                boxShadow: '0 0 25px rgba(168,85,247,0.45)',
                            }}>
                            完成
                        </button>
                    </motion.div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
