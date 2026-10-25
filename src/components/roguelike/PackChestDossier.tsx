// ==========================================
// 悖论迷宫 · 匣子档案卡浮窗（悬停 / 长按 / 点击钉住）
// [2026-10-21 莉莉子 🎨 视觉层优化] 取代转盘格子上的**浏览器原生 `title`**：
//   原生 tooltip 样式不可控，而且**触屏设备根本不显示** ⇒
//   手机玩家完全看不到匣子是什么、会开出什么，而手机是开包最频繁的端。
//
// ⚠️ 为什么必须 portal 到 body（结论照抄 KeywordPreview / ArmamentPreview）：
//   1. 面板根是 `overflow-hidden`（`PackOpenModal` 里那个带 `panelWidth` 的 motion.div）⇒ 浮窗会被裁掉
//   2. 主面板整块在 `transform: scale(gameScale × panelScale)` 里 ⇒ 画布坐标与屏幕坐标两套系统会打架
//   ⇒ 定位吃**屏幕坐标**（父组件传 getBoundingClientRect），内容按**逻辑尺寸**渲染，
//     外层再 `scale(getGameScale())` 缩放到屏幕（见 技术手册/design-guide.md §3「分辨率适配铁律」）
//
// ⚠️ 内容口径（产品方 2026-10-21 拍板）：
//   · 武装匣只列「可能产出」的武装，**最多 4 件**（固定取前 4，不随机 —— 随机会让"预览"变抽奖）
//   · 超出 4 件补「仅列出前 4 件 · 共 N 件」（只列 4 个却不提还有更多 = 欺骗性预览；
//     原稿写的是「等 N 件」，中文两义容易被读成"还有 N 件"，已改）
//   · 只剩 1 件可选时说「必定获得」而不是「从 1 件中随机」，别假装还有抽的成分
//   · 整档集齐 ⇒ 改显示「开匣改发匣券 +N」（口径与 `pickArmamentFromChest` 的溢出分支同源）
//   · **不显示概率**：转盘格是 `randChest()` 均匀 12 选 1，与真实权重无关，显示必误导
//   · **不放任何按钮**（尤其不能放「去开匣子」—— 它的语义是 `onClose(); onOpenChest();`，会直接杀掉演出）
//
// ⚠️ 尺寸 / 字号 / 间距 / 延时**全部**来自 `PackOpenModal.tsx` 顶部的 `PACK_OPEN_UI`（本文件不写死 px），
//   由 `PackOpenModal` 通过 `ui` prop 传入 ⇒ 本文件对它只有 **type-only import**，不产生运行时循环依赖。
//   程要调这张卡的观感，去改 `PACK_OPEN_UI` 里的 `dossier*` 那一段。
// ==========================================
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Package } from 'lucide-react';
import { RARITY_META, RarityIcon } from './RarityIcon';
import {
    CHEST_KIND_LABEL, describeChestContent, SHARD_GROUP_SIZE,
    type ChestKind,
} from '../../data/roguelike/divinityShards';
import type { EnhancementRarity } from '../../data/roguelike/buffs';
import { getChestArt, getChestArtName } from '../../data/roguelike/chestArt';
import { getArmamentChestPool } from '../../logic/armamentChestPool';
import { hasArmamentRoom, type ArmStockMap } from '../../data/roguelike/armamentStock';
import { voucherYieldOf } from '../../data/roguelike/armamentVoucher';
import { getGameScale } from '../../utils/gameScale'; // [2026-10-21] 逃出 scale 容器后按 gameScale 补偿
import type { PackOpenUi } from './PackOpenModal';

/** 本轮「匣子档案卡」最多列几件 —— 产品方拍板的硬口径 */
const DOSSIER_MAX_NAMES = 4;

/** 浮窗数据（父组件一次 setState 写入；内容换格 = 换这个对象，不加 key ⇒ React 原地改文本、零闪烁） */
export interface PackChestDossierData {
    /** 触发格子的**屏幕**矩形（父组件 `getBoundingClientRect()` 取的） */
    rect: DOMRect;
    /** `window.resize` 时重新测量（父组件传格子的 rect 读取函数；返回 null = 元素已卸载 ⇒ 沿用旧值） */
    measure?: () => DOMRect | null;
    kind: ChestKind;
    rarity: EnhancementRarity;
    /** PC 点击钉住 ⇒ 常驻 + 实线描边 */
    pinned: boolean;
}

interface PackChestDossierProps {
    /** null = 不显示（退场动画由内层 AnimatePresence 负责） */
    data: PackChestDossierData | null;
    /** 武装库存（用于判断"可能抽到的"池子与"已集齐转券"）；不传 ⇒ 视为全池，且不显示集齐/券那一行 */
    armamentStock?: ArmStockMap;
    ui: PackOpenUi;
}

/**
 * 浮窗外壳：**永远挂载**，只管 portal + AnimatePresence。
 *
 * ⚠️ 不能让父组件的 AnimatePresence 管它 —— portal 不是 AnimatePresence 可识别的 motion child，
 *    进入/退出动画都不会触发（`PackOpenModal` 的定格详情弹窗就踩过同一个坑，见那里
 *    "去掉包裹 portal 的 AnimatePresence"那条注释）。
 * ⇒ 退场动画必须由**本组件内部**这一层 AnimatePresence 完成。
 *
 * 📌 约定：本文件引用别处代码时**只写符号名、不写行号** —— 行号会随改动腐烂
 *    （本次改动就让上面两处旧行号失效过一次）。
 */
export const PackChestDossier: React.FC<PackChestDossierProps> = ({ data, armamentStock, ui }) => {
    if (typeof document === 'undefined') return null;
    return createPortal(
        <AnimatePresence>
            {/* ⚠️ 故意**固定 key**：换格时让 React 原地改文本（内容零闪烁），
                也不用 mode="wait"（那会先卸载再挂载 ⇒ 一次多余的进出场动画） */}
            {data && (
                <DossierCard
                    key="pack-chest-dossier"
                    data={data}
                    armamentStock={armamentStock}
                    ui={ui}
                />
            )}
        </AnimatePresence>,
        document.body,
    );
};

/** 单张档案卡：定位碰撞 + 钳制 + 箭头补偿 + 内容规则 */
const DossierCard: React.FC<{
    data: PackChestDossierData;
    armamentStock?: ArmStockMap;
    ui: PackOpenUi;
}> = ({ data, armamentStock, ui }) => {
    const { kind, rarity, pinned, measure } = data;
    const meta = RARITY_META[rarity];
    const color = meta.color;

    // ── resize 自监听 ───────────────────────────────────────────────
    // `getGameScale()` 只在渲染那一刻取值，本身**没有** resize 监听（gameScale.ts:15）
    // ⇒ 这里自己监听：一个 tick 触发重渲染，位置与缩放一起重算。
    const [, setResizeTick] = useState(0);
    const measureRef = useRef(measure);
    measureRef.current = measure;
    useEffect(() => {
        const onResize = () => setResizeTick(t => t + 1);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // 每次渲染都向父组件要一次**最新**矩形（resize 后旧 rect 已过期）；拿不到就沿用传入的
    const liveRect = (measureRef.current?.() ?? null) ?? data.rect;

    // ── 逻辑尺寸（内容自适应，`dossierHeight` 只是初始估算值）────────
    const cardRef = useRef<HTMLDivElement | null>(null);
    const gs = getGameScale();
    const [logicalH, setLogicalH] = useState(ui.dossierHeight);
    useLayoutEffect(() => {
        const el = cardRef.current;
        if (!el) return;
        // ⚠️ 只量 `offsetHeight`，**不要再除 gs**：
        //   `offsetHeight` 是**布局尺寸**（逻辑 px），它**不含**任何 transform；
        //   会把 transform 算进去的是 `getBoundingClientRect()`。
        //   项目权威注释同口径：`GuideLayer.tsx:133`「offsetHeight * scale」、`RoguePersonalize.tsx:517-518`。
        //   [2026-10-21 独立审查 P1 修正] 原写法 `offsetHeight / gs` 把逻辑高缩成 1/gs 倍，
        //   再经 `H = logicalH * gs` **恰好抵掉** ⇒ H 恒等于"逻辑高"而非"屏幕高"，
        //   于是纵向居中、innerHeight 钳制、arrowOffsetY 全偏（gs≠1 时肉眼可见，箭头指不回目标格）。
        const h = el.offsetHeight;
        if (Number.isFinite(h) && h > 0 && Math.abs(h - logicalH) > 0.5) setLogicalH(h);
    }, [gs, kind, rarity, armamentStock, logicalH]);

    const W = ui.dossierWidth * gs;
    const H = logicalH * gs;
    // ⚠️ 单位纪律（这张卡最容易踩的坑）：
    //   · 外层 `position: fixed` 的 left/top、以及钳制用的 W/H/margin 是**屏幕 px**
    //   · 卡片内部的一切（含箭头偏移、间距）是**逻辑 px**（外层还有 scale(gs)）
    //   ⇒ 凡是"逻辑值要参与屏幕计算"的，必须先 `× gs`；凡是"屏幕值要进卡片"的，必须 `÷ gs`。
    const margin = ui.dossierMargin;      // 视口安全边距：屏幕 px（同规范里的字面 8）
    const gap = ui.dossierGap * gs;       // 浮窗与触发格的水平间距：逻辑值折算到屏幕
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

    // ── 横向：优先贴右侧；右侧放不下 ⇒ 翻到左侧；翻完再钳一次 ─────────
    const fitsRight = liveRect.right + gap + W <= window.innerWidth - margin;
    const left = fitsRight
        ? clamp(liveRect.right + gap, margin, window.innerWidth - W - margin)
        : clamp(liveRect.left - gap - W, margin, window.innerWidth - W - margin);
    // ── 纵向：与触发格垂直居中，再钳到屏幕内 ─────────────────────────
    const top = clamp(liveRect.top + liveRect.height / 2 - H / 2, margin, window.innerHeight - H - margin);

    // 箭头：`目标中心 − 浮窗中心` 的反向补偿（浮窗被钳制后箭头仍指回目标）。
    //   ⚠️ 这里是**屏幕**差值，而箭头定位在 `scale(gs)` 的内层 ⇒ 必须 ÷ gs 换回逻辑 px。
    const arrowOffsetY = ((liveRect.top + liveRect.height / 2) - (top + H / 2)) / (gs || 1);
    const arrowHalf = ui.dossierArrowSize / 2;
    // 翻面后箭头方向跟着换：浮窗在右 ⇒ 箭头贴左边框、**指向左**（指回格子）；
    //                            浮窗在左 ⇒ 箭头贴右边框、**指向右**。
    // [2026-10-21 独立审查 P2 修正] 原写 `left+top` / `right+bottom`，整体偏 90°：
    //   8×8 方块 `rotate(45deg)` 后成菱形，四个顶点落在正上/下/左/右。露在**左侧**的那半个
    //   由「原左边 → 左上斜边」+「原下边 → 左下斜边」围成 ⇒ 要描的是 **left + bottom**；
    //   露在**右侧**的那半个由「原上边 → 右上斜边」+「原右边 → 右下斜边」围成 ⇒ **right + top**。
    //   （这是纯几何推导；真机观感仍建议程看一眼，若反了就把这两对边对调。）
    const arrowSideStyle: React.CSSProperties = fitsRight
        ? { left: -arrowHalf, borderLeftWidth: ui.dossierArrowBorderWidth, borderBottomWidth: ui.dossierArrowBorderWidth }
        : { right: -arrowHalf, borderRightWidth: ui.dossierArrowBorderWidth, borderTopWidth: ui.dossierArrowBorderWidth };

    // ── 内容规则 ───────────────────────────────────────────────────
    const name = getChestArtName(kind, rarity);
    const isArmament = kind === 'armament';
    const pool = isArmament ? getArmamentChestPool(rarity) : [];
    // stock 为 undefined ⇒ 视为全池（"可能产出"无从收敛，也不能凭空说"已集齐"）
    const withRoom = armamentStock ? pool.filter(a => hasArmamentRoom(armamentStock, a.id)) : pool;
    const shown = withRoom.slice(0, DOSSIER_MAX_NAMES);
    const allOwned = isArmament && armamentStock !== undefined && withRoom.length === 0;
    const voucherYield = voucherYieldOf(rarity);

    const descText = !isArmament
        ? describeChestContent(kind, rarity)
        : allOwned
            ? `本档已全部拥有 · 开匣改发匣券 +${voucherYield}`
            // [2026-10-21 独立审查 P1 修正] 这里必须是 `withRoom.length`（**真实候选数**），
            //   不是 `shown.length` —— 后者被 `DOSSIER_MAX_NAMES` 截到 4，而紫档池实测 8 件、金档 5 件
            //   ⇒ 原写法会写"从下列 4 件中随机获得 1 件"却在 8 件里抽，与紧邻的截断提示自相矛盾。
            //   这恰恰是本需求要消灭的「UI 承诺 ≠ 实际产出」。
            // [2026-10-21 复核补充] 只剩 1 件可选时（紫档拥 7 件即复现）"从 1 件中随机获得 1 件"
            //   既不随机也啰嗦 ⇒ 单独成句说死，别让玩家以为还有抽的成分。
            : withRoom.length === 1
                ? '开启后必定获得下面这 1 件'
                : `开启后从 ${withRoom.length} 件中随机获得 1 件`;
    // 底部条：仅武装匣且**库存数据可用**时才谈"已集齐 / 转券"
    const showFoot = isArmament && armamentStock !== undefined && pool.length > 0;
    const ownedCount = pool.length - withRoom.length;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            // 退场：不用 spring（退场要快），140ms tween
            exit={{ opacity: 0, transition: { duration: ui.dossierExitMs / 1000, ease: 'easeOut' } }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            style={{ position: 'fixed', left, top, zIndex: 10001, pointerEvents: 'none' }}
            className="text-white font-sans select-none"
        >
            {/* 内层按 gameScale 缩放到屏幕：内部一切 px 都是**逻辑尺寸** */}
            <div style={{ transform: `scale(${gs})`, transformOrigin: 'top left', position: 'relative' }}>
                {/* 箭头（先画 ⇒ 内半截被卡片本体盖住）：8×8 方块 rotate-45
                    ⚠️ `borderWidth: 0` 必须写在 `...arrowSideStyle` **之前**：React 按对象键序写 style，
                       而 `borderWidth` 是四边长度的**简写**，写在后面会把上面刚给的两条边宽重新清成 0。 */}
                <div
                    className="absolute"
                    style={{
                        borderWidth: 0,
                        borderStyle: 'solid',
                        borderColor: `${color}66`,
                        ...arrowSideStyle,
                        top: `calc(50% + ${arrowOffsetY}px)`,
                        width: ui.dossierArrowSize,
                        height: ui.dossierArrowSize,
                        marginTop: -arrowHalf,
                        background: '#10141c',
                        transform: 'rotate(45deg)',
                        zIndex: 0,
                    }}
                />
                <div
                    ref={cardRef}
                    className="flex flex-col"
                    style={{
                        position: 'relative',
                        zIndex: 1,
                        width: ui.dossierWidth,
                        borderRadius: ui.dossierRadius,
                        borderWidth: ui.dossierBorderWidth,
                        borderStyle: 'solid',
                        // 钉住 = 实线描边（不透明的品质色），未钉住 = 半透明
                        borderColor: pinned ? color : `${color}66`,
                        padding: ui.dossierPad,
                        background: meta.cardBg,
                        boxShadow: `0 0 ${ui.dossierGlowRadius}px ${color}44`,
                    }}
                >
                    {/* ── 上半：插画 + 右栏（专名 / chip / 分隔线 / 正文 / 名单）── */}
                    <div className="flex" style={{ gap: ui.dossierArtGap, alignItems: 'flex-start' }}>
                        {/* 匣子插画（插画自带六边形外框 ⇒ 整图 object-contain，不再套 clipPath） */}
                        <div
                            style={{
                                position: 'relative',
                                width: ui.dossierArtSize,
                                height: ui.dossierArtSize,
                                flexShrink: 0,
                                filter: `drop-shadow(0 0 ${ui.dossierArtGlowRadius}px ${color}99)`,
                            }}
                        >
                            <div data-art-fallback className="absolute inset-0 flex items-center justify-center opacity-0">
                                <Package size={ui.dossierArtIconSize} className="text-white/40" />
                            </div>
                            <img
                                src={getChestArt(kind, rarity)}
                                alt={name}
                                className="relative w-full h-full object-contain"
                                draggable={false}
                                onError={hideBrokenChestArt}
                            />
                        </div>

                        {/* 右栏 */}
                        <div className="flex flex-col" style={{ flex: 1, minWidth: 0 }}>
                            {/* 专名 + 右上品质图标（品质三重编码之「形状」） */}
                            <div className="flex items-center" style={{ gap: ui.dossierTitleGap }}>
                                <span
                                    className="font-black tracking-wide"
                                    style={{
                                        flex: 1,
                                        minWidth: 0,
                                        fontSize: ui.dossierTitleFontSize,
                                        color: '#fff',
                                        textShadow: `0 0 10px ${color}66`,
                                    }}
                                >
                                    {name}
                                </span>
                                <RarityIcon rarity={rarity} size={ui.dossierRarityIconSize} />
                            </div>

                            {/* 品质 / 大类 两个 chip（三重编码之「文字」+「颜色」） */}
                            <div
                                className="flex flex-wrap items-center"
                                style={{ gap: ui.dossierChipGap, marginTop: ui.dossierChipsMarginTop }}
                            >
                                <span
                                    className="font-mono"
                                    style={{
                                        fontSize: ui.dossierChipFontSize,
                                        color,
                                        borderWidth: ui.dossierChipBorderWidth,
                                        borderStyle: 'solid',
                                        borderColor: `${color}44`,
                                        // 品质色左竖条（3px）
                                        borderLeftWidth: ui.dossierChipBarWidth,
                                        borderLeftColor: color,
                                        background: `${color}11`,
                                        paddingLeft: ui.dossierChipPadX,
                                        paddingRight: ui.dossierChipPadX,
                                        paddingTop: ui.dossierChipPadY,
                                        paddingBottom: ui.dossierChipPadY,
                                        borderRadius: ui.dossierChipRadius,
                                    }}
                                >
                                    {meta.label}
                                </span>
                                <span
                                    className="font-mono text-amber-200"
                                    style={{
                                        fontSize: ui.dossierChipFontSize,
                                        borderWidth: ui.dossierChipBorderWidth,
                                        borderStyle: 'solid',
                                        borderColor: 'rgba(252, 211, 77, 0.3)',
                                        background: 'rgba(251, 191, 36, 0.1)',
                                        paddingLeft: ui.dossierChipPadX,
                                        paddingRight: ui.dossierChipPadX,
                                        paddingTop: ui.dossierChipPadY,
                                        paddingBottom: ui.dossierChipPadY,
                                        borderRadius: ui.dossierChipRadius,
                                    }}
                                >
                                    {CHEST_KIND_LABEL[kind]}
                                </span>
                            </div>

                            {/* 分隔线 */}
                            <div
                                style={{
                                    height: ui.dossierDividerHeight,
                                    background: 'rgba(255,255,255,0.14)',
                                    marginTop: ui.dossierDividerMargin,
                                    marginBottom: ui.dossierDividerMargin,
                                }}
                            />

                            {/* 正文：产出预告 */}
                            <p style={{ fontSize: ui.dossierDescFontSize, color: '#e5e7eb' }}>{descText}</p>

                            {/* 碎片匣副文案（每 N 片一组 · 随机归属，N 用常量不硬编码） */}
                            {!isArmament && (
                                <p
                                    className="text-gray-400"
                                    style={{ fontSize: ui.dossierSubNoteFontSize, marginTop: ui.dossierSubNoteMarginTop }}
                                >
                                    每 {SHARD_GROUP_SIZE} 片一组 · 随机归属一位天启者
                                </p>
                            )}

                            {/* 武装匣：可能产出的前 4 件。
                                顺序 = `getArmamentDefs()` 的**定义顺序**（不随机），
                                ⚠️ 它**不代表强弱或推荐度** —— 别让玩家读成"最好的 4 件"。
                                池子 > 4 时下方会补「仅列出前 4 件 · 共 N 件」。 */}
                            {isArmament && shown.length > 0 && (
                                <div
                                    className="flex flex-wrap"
                                    style={{ gap: ui.dossierNameGap, marginTop: ui.dossierNameMarginTop }}
                                >
                                    {shown.map(a => (
                                        <span
                                            key={a.id}
                                            className="flex items-center"
                                            style={{
                                                gap: ui.dossierNameBulletGap,
                                                fontSize: ui.dossierNameFontSize,
                                                color: '#fde68a',
                                            }}
                                        >
                                            <span style={{ color }}>▪</span>
                                            {a.name}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* 截断提示：只列 4 个却不提还有更多 = 欺骗性预览。
                                [2026-10-21 独立审查 P2 修正] 原写「等 N 件」，而 N 是**候选总数**
                                ⇒ 中文两义（"还有 N 件" vs "共 N 件"），玩家会数错。改成明确的一句。 */}
                            {isArmament && withRoom.length > DOSSIER_MAX_NAMES && (
                                <span
                                    className="text-gray-400 font-mono"
                                    style={{
                                        fontSize: ui.dossierMoreFontSize,
                                        marginTop: ui.dossierMoreMarginTop,
                                    }}
                                >
                                    仅列出前 {DOSSIER_MAX_NAMES} 件 · 共 {withRoom.length} 件
                                </span>
                            )}
                        </div>
                    </div>

                    {/* ── 下半：已集齐进度 + 集齐后转匣券（仅武装匣且库存数据可用）── */}
                    {showFoot && (
                        <div
                            className="flex flex-wrap items-center text-gray-300"
                            style={{
                                gap: ui.dossierFootGap,
                                marginTop: ui.dossierFootMarginTop,
                                paddingTop: ui.dossierFootPadTop,
                                borderTopWidth: ui.dossierFootBorderWidth,
                                borderTopStyle: 'solid',
                                borderTopColor: `${color}44`,
                                fontSize: ui.dossierFootFontSize,
                            }}
                        >
                            <span>
                                本档已集齐 {ownedCount}/{pool.length}
                            </span>
                            <span className="text-gray-500">·</span>
                            <span className="text-cyan-200">集齐后开匣改发 匣券 +{voucherYield}</span>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

/** [2026-10-20 同款兜底] 插画加载失败 ⇒ 隐藏 img，并露出下面那枚 lucide 图标（不白板） */
const hideBrokenChestArt = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    img.style.visibility = 'hidden';
    const fb = img.parentElement?.querySelector<HTMLElement>('[data-art-fallback]');
    if (fb) fb.style.opacity = '1';
};
