// ==========================================
// 悖论迷宫 · 事件奖励展示（屏幕中央弹出）
// [2026-10-10 莉莉子 · 事件演出 v2 · 程需求 3]
// [2026-10-10 程实测反馈修复] 六项：
//   ① **去掉滚动滑块**（多奖励时中间冒出一条滑块，不要）
//   ② **整体尺寸可调** —— 见下方 `EVENT_REWARD_UI.showcaseScale` / `.cardScale`，直接改数值即可
//   ③ **代价用红色**（数据金减少还沿用金色的边框/文字，观感不对）
//   ④ **用游戏内图标**（数据金＝CURRENCY_ICONS.dataGold、治疗＝EFFECT_IMAGES.healing/生命＝buffLife）
//   ⑤ 入场动画改成**放大弹出**（此前带 `y` 位移，看起来像上下震动）
//   ⑥ 装备 A+B→C 的「原卡牌」要包含**该卡已有的装备与武装**（此前只读 run.equippedCards，
//      拿不到局外带入的武装 ⇒ 里芙看起来"什么装备都没有"，与程的实际配置不符）
// [2026-10-10 第 5 轮独立审查修复] 四项：
//   ⑦ 奖励行补 `pointer-events-auto` —— 否则外层 `pointer-events-none` 会让滚轮落不到这个滚动容器，
//      被 `max-h` 裁掉的内容**既看不到滑块也滚不动**（滑块被隐藏后连"有内容被裁"的线索都没了）
//   ⑧ `max-h/max-w` 按 `showcaseScale` **反向补偿**（transform: scale 不参与布局 ⇒ 不补偿就会溢出被根层裁掉）
//   ⑨ 结果行**去重**（深层回响可能连发同一件装备 ⇒ 会出现两行完全相同的 A+B→C）
//   ⑩ 武装改走 `getArmament(key, level)`（**按等级过滤未解锁槽**）且顺序对齐战斗侧 `[...局内, ...武装]`
//
// 形态（按 `EventApplyResult.showcase` 分派）：
//   · stat  → 游戏内图标 + 数值（代价红 / 收益绿 / 纯信息灰）
//   · buff  → 迷宫强化卡（复用 `EnhancementCard`，与强化三选一**同一张脸**）
//   · card  → 完整卡面（`Card`）
//   · equip → **三栏对照 A(挂载前) + B(装备) → C(挂载后)** —— 程点名的那个形态
//   · 无 showcase 的（含 `info`）→ 文字条
//
// ⚠️ 本组件**只读**：奖励的发放早在 `App.handleRogueEvent` 里由注册表完成了。
// ==========================================
import React, { useMemo } from 'react';
import { eventBus, GameEvents } from '../../../utils/eventBus'; // [2026-10-14 莉莉子] 交互音效
import { motion } from 'framer-motion';
import { Plus, ArrowRight, RotateCcw, RefreshCw, HeartCrack } from 'lucide-react';
import type { CardData } from '../../../types';
import { CARD_DB } from '../../../data/cards';
import { attachEquipment, getEquipmentById, type EquipmentDef } from '../../../data/equipment';
import { getBuffById } from '../../../data/roguelike/buffs';
import { CURRENCY_ICONS, EFFECT_IMAGES } from '../../../data/imageData';
import { useArmamentConfig } from '../../../hooks/useArmamentConfig';
import { RARITY_META, RarityIcon } from '../RarityIcon';
import { Card } from '../../Card';
import { EnhancementCard } from './EnhancementCard';
import type { EventApplyResult, EventShowcaseItem } from '../../../data/roguelike/eventAppliers';
import type { RoguelikeRunState } from '../../../hooks/useRoguelikeRun';

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 悖论迷宫 · **事件奖励展示**（`EventRewardShowcase`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 事件选完之后**画面中央弹出**的「所得入囊 / 命运已定」奖励层：
//   标题 → 一排奖励体（数值方块 · 迷宫强化卡 · 完整卡面 · 装备 A+B→C）→ 「收下」。
// 管：①整体 ②标题与空态 ③奖励行 ④数值方块 ⑤装备卡面 ⑥卡面槽与箭头 ⑦「收下」
// 改完存盘即生效（HMR —— 雷电/电脑上 1~3 秒看到，不用出包）。
// 命名与用法**对齐 `TITLE_UI`**：值是**绝对画布 px**、直接进 style；注释标注**原 Tailwind 类**。
// ✅ 原有的两个裸常量 `SHOWCASE_SCALE` / `CARD_SCALE` 已**收编**进本块
//   （→ `showcaseScale` / `cardScale`，**值一个没变**：1.32 / 1.28）。
// ⚠️ `rowMaxWidthVw` / `rowMaxHeightVh` 是**刻意保留的视口口径**：`transform: scale` 不参与布局，
//   必须把上限**反向补偿**成 `calc(NNvw / scale)`，否则内容会被根层裁掉；净效果 = 真实视口的 88% / 62%。
//   它**不属于**「容器内混用 vh」那类违规（见《规范-界面调参区》§2 末尾的"刻意保留"清单）。
// ⚠️ `statMaxWidth` 原类是 `max-w-[260px]`，被 `index.css:56` 的
//   `[class*="max-w-"]{max-width:none!important}` 打死过 ⇒ 默认必须 `'none'` 锁住现状，
//   填数字会「突然真的生效、方块变窄」（`StyleSelector` / `MODE_UI` 都踩过同款）。
// ══════════════════════════════════════════════════════════════════════
export const EVENT_REWARD_UI = {
    /** 【主旋钮】整层缩放（原 `SHOWCASE_SCALE` = 1.32 · 1 = 基准） */
    showcaseScale: 1.32,
    /** 卡面单独缩放（原 `CARD_SCALE` = 1.28 —— `Card` 基准比强化卡小，不放大会挤在一起） */
    cardScale: 1.28,

    // ══ ① 整体 ═══════════════════════════════════════════════════════
    /** 外层左右留白 px（原 px-8 = 32） */
    rootPadX: 32,
    /** 标题 / 奖励行 / 收下 之间的行距 px（原 gap-7 = 28） */
    columnGap: 28,

    // ══ ② 标题与空态 ═════════════════════════════════════════════════
    /** 标题字号 px（原 text-2xl = 24） */
    titleFontSize: 24,
    /** 「什么也没有发生。」字号 px（原 text-sm = 14） */
    emptyFontSize: 14,

    // ══ ③ 奖励行（内容多时可滚轮滚动） ════════════════════════════════
    /** 奖励体之间间距 px（原 gap-8 = 32） */
    rowGapX: 32,
    /** 奖励行左右内边距 px（原 px-10 = 40 · 留够给装备 pip 外扩 ~31px） */
    rowPadX: 40,
    /** 奖励行上下内边距 px（原 py-5 = 20） */
    rowPadY: 20,
    /** 奖励行上限：真实视口宽的百分之几（原 `88vw`）—— 改比例就改这个数 */
    rowMaxWidthVw: 88,
    /** 奖励行上限：真实视口高的百分之几（原 `62vh`）—— 改比例就改这个数 */
    rowMaxHeightVh: 62,

    // ══ ④ 数值 / 文字奖励方块 ════════════════════════════════════════
    /** 最小宽 px（原 min-w-[150px] = 150） */
    statMinWidth: 150,
    /** 最大宽（原 max-w-[260px] —— **被 index.css:56 打死过**，默认 'none' 锁住现状） */
    statMaxWidth: 'none',
    /** 左右内边距 px（原 px-6 = 24） */
    statPadX: 24,
    /** 上下内边距 px（原 py-5 = 20） */
    statPadY: 20,
    /** 圆角 px（原 rounded-2xl = 16） */
    statRadius: 16,
    /** 行内间距 px（原 gap-1.5 = 6） */
    statGap: 6,
    /** 图片图标尺寸 px（原 w-10 h-10 = 40） */
    statIconSize: 40,
    /** lucide 图标尺寸 px（原 `<HeartCrack size={34} />` 等 = 34） */
    statLucideSize: 34,
    /** emoji 图标字号 px（原 text-3xl = 30） */
    statEmojiFontSize: 30,
    /** 数值字号 px（原 text-2xl = 24） */
    statValueFontSize: 24,
    /** 数值注释字号 px（原 text-[11px] = 11） */
    statLabelFontSize: 11,
    /** 长文字字号 px（原 text-[13px] = 13） */
    statTextFontSize: 13,

    // ══ ⑤ 装备卡面（A+B→C 里的「B」） ════════════════════════════════
    /** 装备卡宽 px（原 w-[168px] = 168） */
    equipWidth: 168,
    /** 装备卡高 px（原 h-[212px] = 212） */
    equipHeight: 212,
    /** 圆角 px（原 rounded-xl = 12） */
    equipRadius: 12,
    /** 描边 px（原 border-[3px] = 3） */
    equipBorderWidth: 3,
    /** 卡内行距 px（原 gap-2 = 8） */
    equipGap: 8,
    /** 稀有度图标距顶 px（原 top-2 = 8） */
    equipRarityTop: 8,
    /** 稀有度图标距右 px（原 right-2 = 8） */
    equipRarityRight: 8,
    /** 稀有度图标尺寸 px（原 `<RarityIcon size={18} />` = 18） */
    equipRaritySize: 18,
    /** 图标框边长 px（原 w-24 h-24 = 96） */
    equipIconBoxSize: 96,
    /** 图标框圆角 px（原 rounded-lg = 8） */
    equipIconRadius: 8,
    /** 名称左右内边距 px（原 px-2 = 8） */
    equipNamePadX: 8,
    /** 名称字号 px（原 text-[14px] = 14） */
    equipNameFontSize: 14,
    /** 描述四边内缩 px（原 bottom-2 / inset-x-2 = 8） */
    equipDescInset: 8,
    /** 描述字号 px（原 text-[11px] = 11） */
    equipDescFontSize: 11,
    /** 装备占位块描边 px（原代位块 `border` = 1） */
    equipPlaceholderBorderWidth: 1,
    /** 装备占位块字号 px（原代位块 `text-xs` = 12） */
    equipPlaceholderFontSize: 12,

    // ══ ⑥ 卡面槽位与箭头（A / + / B / → / C） ════════════════════════
    /** 三栏之间间距 px（原 gap-2 = 8） */
    stripGap: 8,
    /** 卡面槽左右内边距 px（原 px-5 = 20） */
    slotPadX: 20,
    /** 卡面槽上下内边距 px（原 py-4 = 16） */
    slotPadY: 16,
    /** 槽内行距 px（原 gap-2 = 8） */
    slotGap: 8,
    /** 槽标签与卡面之间 px（原 mt-3 = 12） */
    slotLabelMarginTop: 12,
    /** 槽标签字号 px（原 text-[12px] = 12） */
    slotLabelFontSize: 12,
    /** 箭头图标尺寸 px（原 `<Plus size={30} />` / `<ArrowRight size={30} />` = 30） */
    arrowIconSize: 30,
    /** 箭头距底 px（原 pb-28 = 112 · 让箭头对齐卡面中线） */
    arrowPadBottom: 112,
    /** 箭头左右内边距 px（原 px-1 = 4） */
    arrowPadX: 4,

    // ══ ⑦ 「收下」按钮 ═══════════════════════════════════════════════
    /** 左右内边距 px（原 px-12 = 48） */
    btnPadX: 48,
    /** 上下内边距 px（原 py-3.5 = 14） */
    btnPadY: 14,
    /** 圆角 px（原 rounded-xl = 12） */
    btnRadius: 12,
} as const;

/** 用**指定的**装备列表渲染一张完整卡面（补 runtime 字段；与 `NodeEventModal.deckCardToFull` 同口径） */
const cardWith = (key: string, equipIds: string[]): CardData => {
    let cur: CardData = {
        ...CARD_DB[key],
        id: key,
        strikeCount: 0,
        animState: 'idle' as const,
        damageTaken: 0,
        buffs: { power: 0, health: 0 },
    };
    for (const eid of equipIds) cur = attachEquipment(cur, eid);
    return cur;
};

/** A+B→C 里的「B」：一件装备的卡面（六边形语汇对齐游戏内其它装备位） */
const EquipmentFace: React.FC<{ def: EquipmentDef }> = ({ def }) => {
    const meta = RARITY_META[def.rarity];
    return (
        <div className="flex flex-col items-center" style={{ gap: EVENT_REWARD_UI.equipGap }}>
            <div
                className="relative flex flex-col items-center justify-center overflow-hidden"
                style={{
                    width: EVENT_REWARD_UI.equipWidth,
                    height: EVENT_REWARD_UI.equipHeight,
                    borderRadius: EVENT_REWARD_UI.equipRadius,
                    borderWidth: EVENT_REWARD_UI.equipBorderWidth,
                    borderStyle: 'solid',
                    gap: EVENT_REWARD_UI.equipGap,
                    borderColor: meta.color,
                    background: meta.cardBg,
                    boxShadow: `0 0 22px ${meta.color}55`,
                }}
            >
                <div className="absolute" style={{ top: EVENT_REWARD_UI.equipRarityTop, right: EVENT_REWARD_UI.equipRarityRight }}>
                    <RarityIcon rarity={def.rarity} size={EVENT_REWARD_UI.equipRaritySize} />
                </div>
                <div
                    className="overflow-hidden bg-black/50 border border-white/15"
                    style={{
                        width: EVENT_REWARD_UI.equipIconBoxSize,
                        height: EVENT_REWARD_UI.equipIconBoxSize,
                        borderRadius: EVENT_REWARD_UI.equipIconRadius,
                    }}
                >
                    <img src={def.icon} alt={def.name} className="w-full h-full object-cover" />
                </div>
                <div className="text-center" style={{ paddingLeft: EVENT_REWARD_UI.equipNamePadX, paddingRight: EVENT_REWARD_UI.equipNamePadX }}>
                    <div className="font-black text-white leading-tight" style={{ fontSize: EVENT_REWARD_UI.equipNameFontSize }}>{def.name}</div>
                </div>
                <div
                    className="absolute text-center"
                    style={{ bottom: EVENT_REWARD_UI.equipDescInset, left: EVENT_REWARD_UI.equipDescInset, right: EVENT_REWARD_UI.equipDescInset }}
                >
                    <p className="text-gray-300 leading-snug line-clamp-3" style={{ fontSize: EVENT_REWARD_UI.equipDescFontSize }}>{def.description}</p>
                </div>
            </div>
        </div>
    );
};

/**
 * 数值类奖励的**游戏内图标**。
 * ⚠️ [第 5 轮审查] 生命**失去**不再复用"仅生命增益"的 `buffLife`（−12 生命与 +3 上限同图会读错），
 *   改用破心图标 + 红色语义。
 */
const StatIcon: React.FC<{ stat: 'gold' | 'hp' | 'maxHp' | 'revive' | 'refresh'; amount: number }> = ({ stat, amount }) => {
    const imgStyle: React.CSSProperties = { width: EVENT_REWARD_UI.statIconSize, height: EVENT_REWARD_UI.statIconSize };
    if (stat === 'gold') return <img src={CURRENCY_ICONS.dataGold} alt="数据金" className="object-contain" style={imgStyle} />;
    if (stat === 'hp') {
        return amount > 0
            ? <img src={EFFECT_IMAGES.healing} alt="生命" className="object-contain" style={imgStyle} />
            : <HeartCrack size={EVENT_REWARD_UI.statLucideSize} className="text-red-300" />;
    }
    if (stat === 'maxHp') {
        return amount > 0
            ? <img src={EFFECT_IMAGES.buffLife} alt="生命上限" className="object-contain" style={imgStyle} />
            : <HeartCrack size={EVENT_REWARD_UI.statLucideSize} className="text-red-300" />;
    }
    if (stat === 'revive') return <RotateCcw size={EVENT_REWARD_UI.statLucideSize} className="text-green-300" />;
    return <RefreshCw size={EVENT_REWARD_UI.statLucideSize} className="text-cyan-300" />;
};

/** 单条奖励的展示体 */
const RewardItem: React.FC<{ result: EventApplyResult; index: number; run?: RoguelikeRunState }> = ({ result, index, run }) => {
    // [程实测⑥] 局外带入的**武装**不在 `run.equippedCards` 里（那是"局内装备"）——
    //   战斗构建时由 `RogueGameWrapper` 把两者合并 attach ⇒ 这里也要合并，否则"原卡牌"看起来是白板。
    //   ⚠️ [第 5 轮审查] 必须走 `getArmament(key, level)`：它会把**未解锁槽**置空，
    //      直接读原始 config 会把"等级不够、战斗中根本不会挂"的残留在展示里算进去。
    //   ⚠️ 顺序对齐战斗侧：`[...局内装备, ...武装]`（与 `ShopModal` / `RogueGameWrapper` 同口径）。
    const { getArmament } = useArmamentConfig();
    const equippedOf = (key: string): string[] => [
        ...(run?.equippedCards?.[key] ?? []),
        ...getArmament(key, run?.heroLevel ?? 1).filter((x): x is string => !!x),
    ];

    const sc: EventShowcaseItem | undefined = result.showcase;
    const isCost = result.kind === 'cost';
    const isInfo = result.kind === 'info';
    const delay = 0.12 * index;

    /** [程实测⑤] 统一入场：**放大弹出**（此前带 `y: 28` 位移 ⇒ 看起来像上下震动） */
    const shell = (children: React.ReactNode) => (
        <motion.div
            initial={{ opacity: 0, scale: 0.55 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay, type: 'spring', stiffness: 300, damping: 20 }}
        >
            {children}
        </motion.div>
    );

    /** 卡面槽（A / C 复用同一份样式，尺寸见 🎛️ EVENT_REWARD_UI.slot*） */
    const cardSlot = (data: CardData, label: string, labelClass: string) => (
        <div
            className="flex flex-col items-center"
            style={{ gap: EVENT_REWARD_UI.slotGap, paddingLeft: EVENT_REWARD_UI.slotPadX, paddingRight: EVENT_REWARD_UI.slotPadX, paddingTop: EVENT_REWARD_UI.slotPadY, paddingBottom: EVENT_REWARD_UI.slotPadY }}
        >
            <div style={{ transform: `scale(${EVENT_REWARD_UI.cardScale})` }}><Card data={data} location="hand" isFaceUp skinId={0} /></div>
            <span
                className={`font-bold tracking-wider ${labelClass}`}
                style={{ fontSize: EVENT_REWARD_UI.slotLabelFontSize, marginTop: EVENT_REWARD_UI.slotLabelMarginTop }}
            >{label}</span>
        </div>
    );

    // ── 装备：A(挂载前) + B(装备) → C(挂载后) ──
    if (sc?.shape === 'equip') {
        const def = getEquipmentById(sc.equipId);
        const owned = equippedOf(sc.cardKey);
        // ① A 必须**排除这件新装备**（run 此时已经把它写进去了，直接用会让 A 等于 C）
        const before = cardWith(sc.cardKey, owned.filter(e => e !== sc.equipId));
        // ② C = 该卡当前的全部装备（含武装）
        const after = cardWith(sc.cardKey, owned);
        // [第 5 轮审查] 代价项（如"牌组污染"走 card 分支）也要用红色标签，不能一律 emerald
        const tailTone = isCost ? 'text-red-200' : 'text-emerald-200';
        return shell(
            <div className="flex items-end" style={{ gap: EVENT_REWARD_UI.stripGap }}>
                {cardSlot(before, '原卡牌', 'text-gray-300')}
                <div className="text-violet-300" style={{ paddingBottom: EVENT_REWARD_UI.arrowPadBottom, paddingLeft: EVENT_REWARD_UI.arrowPadX, paddingRight: EVENT_REWARD_UI.arrowPadX }}><Plus size={EVENT_REWARD_UI.arrowIconSize} /></div>
                <div className="flex flex-col items-center" style={{ gap: EVENT_REWARD_UI.stripGap }}>
                    {def ? <EquipmentFace def={def} /> : (
                        <div
                            className="grid place-items-center text-gray-400 bg-black/40 border border-white/15"
                            style={{
                                width: EVENT_REWARD_UI.equipWidth,
                                height: EVENT_REWARD_UI.equipHeight,
                                borderRadius: EVENT_REWARD_UI.equipRadius,
                                borderWidth: EVENT_REWARD_UI.equipPlaceholderBorderWidth,
                                borderStyle: 'solid',
                                fontSize: EVENT_REWARD_UI.equipPlaceholderFontSize,
                            }}
                        >装备</div>
                    )}
                    <span className="font-bold text-violet-200 tracking-wider" style={{ fontSize: EVENT_REWARD_UI.slotLabelFontSize }}>装备</span>
                </div>
                <div className="text-emerald-300" style={{ paddingBottom: EVENT_REWARD_UI.arrowPadBottom, paddingLeft: EVENT_REWARD_UI.arrowPadX, paddingRight: EVENT_REWARD_UI.arrowPadX }}><ArrowRight size={EVENT_REWARD_UI.arrowIconSize} /></div>
                {cardSlot(after, '强化后', tailTone)}
            </div>,
        );
    }

    // ── 迷宫强化：与强化三选一同款的卡面 ──
    if (sc?.shape === 'buff') {
        const buff = getBuffById(sc.buffId);
        if (buff) {
            return shell(<EnhancementCard enhancement={buff} isSelected onClick={() => {}} />);
        }
    }

    // ── 卡牌：完整卡面（装备随 run 一起更新，直接照当前状态渲染） ──
    if (sc?.shape === 'card') {
        const tailTone = isCost ? 'text-red-200' : 'text-emerald-200';
        return shell(cardSlot(cardWith(sc.cardKey, equippedOf(sc.cardKey)), isCost ? '牌组污染' : '卡牌', tailTone));
    }

    // ── 数值 / 纯文字 / 信息 ──
    //   复活·刷新是"次数"型 ⇒ 渲染成 `×N`（旧写法把数字丢了，只剩「＋×」）
    const statText = (() => {
        if (sc?.shape !== 'stat') return null;
        const v = sc.amount;
        const isCount = sc.stat === 'revive' || sc.stat === 'refresh';
        const label: Record<typeof sc.stat, string> = { gold: '数据金', hp: '生命', maxHp: '生命上限', revive: '复活', refresh: '刷新' };
        return {
            main: isCount ? `×${Math.abs(v)}` : `${v > 0 ? '+' : ''}${v}`,
            sub: label[sc.stat],
        };
    })();
    // [程实测③] 代价 = **红色**（此前沿用奖励的琥珀/金色，观感不对）
    const tone = isInfo
        ? 'border-white/20 bg-white/[0.06] text-gray-200'
        : isCost
            ? 'border-red-400/60 bg-red-500/15 text-red-200'
            : 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200';
    return shell(
        <div
            className={`border backdrop-blur-sm flex flex-col items-center ${tone}`}
            style={{
                minWidth: EVENT_REWARD_UI.statMinWidth,
                maxWidth: EVENT_REWARD_UI.statMaxWidth,
                paddingLeft: EVENT_REWARD_UI.statPadX,
                paddingRight: EVENT_REWARD_UI.statPadX,
                paddingTop: EVENT_REWARD_UI.statPadY,
                paddingBottom: EVENT_REWARD_UI.statPadY,
                borderRadius: EVENT_REWARD_UI.statRadius,
                gap: EVENT_REWARD_UI.statGap,
            }}
        >
            {sc?.shape === 'stat'
                ? <StatIcon stat={sc.stat} amount={sc.amount} />
                : <span style={{ fontSize: EVENT_REWARD_UI.statEmojiFontSize }}>{result.icon}</span>}
            {statText ? (
                <>
                    <span className="font-black tabular-nums" style={{ fontSize: EVENT_REWARD_UI.statValueFontSize }}>{statText.main}</span>
                    <span className="font-bold tracking-widest opacity-80" style={{ fontSize: EVENT_REWARD_UI.statLabelFontSize }}>{statText.sub}</span>
                </>
            ) : (
                <span className="font-bold text-center leading-snug" style={{ fontSize: EVENT_REWARD_UI.statTextFontSize }}>{result.text}</span>
            )}
        </div>,
    );
};

interface EventRewardShowcaseProps {
    results: EventApplyResult[];
    run?: RoguelikeRunState;
    /** 点「收下」后回调（由事件弹窗把右侧切成「离开」按钮） */
    onClose: () => void;
}

export const EventRewardShowcase: React.FC<EventRewardShowcaseProps> = ({ results, run, onClose }) => {
    // `info` 类（如"⚔️ 迎战"）以中性文字条呈现，**不再整类丢弃**
    // [第 5 轮审查⑨] 同内容**去重**：深层回响可能因 `pickNewEquipForHero` 读到旧 run 而重复发同一件装备，
    //   旧写法会渲染出两行完全一样的 A+B→C（且第二行的"挂载前"是一个从未存在过的状态）。
    const items = useMemo(() => {
        const seen = new Set<string>();
        return results.filter(r => {
            if (!(r.showcase || r.text)) return false;
            const key = r.showcase ? JSON.stringify(r.showcase) : `t:${r.kind}:${r.text}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [results]);
    const hasCost = items.some(r => r.kind === 'cost');

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
            style={{ paddingLeft: EVENT_REWARD_UI.rootPadX, paddingRight: EVENT_REWARD_UI.rootPadX }}
        >
            {/* [程实测②] 整体缩放由 `EVENT_REWARD_UI.showcaseScale` 控制 */}
            <div
                className="flex flex-col items-center"
                style={{ transform: `scale(${EVENT_REWARD_UI.showcaseScale})`, gap: EVENT_REWARD_UI.columnGap }}
            >
                {/* 标题 */}
                <motion.h3
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`shrink-0 font-black tracking-[0.3em] ${hasCost ? 'text-red-300' : 'text-emerald-300'}`}
                    style={{ textShadow: '0 2px 18px rgba(0,0,0,0.9)', fontSize: EVENT_REWARD_UI.titleFontSize }}
                >
                    {hasCost ? '命运已定' : '所得入囊'}
                </motion.h3>

                {/* 奖励行：[程实测①] **隐藏滚动条**（内容多时仍可用滚轮，但不再冒出一条滑块）
                    [第 5 轮审查⑦⑧] 补 `pointer-events-auto`（否则滚轮落不到这里、被裁内容不可达），
                      且 `max-*` 按 `showcaseScale` **反向补偿**（transform 不参与布局）。
                    [程实测②] 外加左右内边距：`Card` 的装备 pip 绝对定位外扩约 31px，
                      而 `overflow-y-auto` 会让 overflow-x 也算成 auto（CSS 规范）⇒ 不留够就会裁掉 pip。 */}
                {items.length === 0 ? (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-gray-400 italic" style={{ fontSize: EVENT_REWARD_UI.emptyFontSize }}>
                        什么也没有发生。
                    </motion.p>
                ) : (
                    <div
                        className="flex items-end justify-center flex-wrap pointer-events-auto overflow-y-auto
                            [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        style={{
                            gap: EVENT_REWARD_UI.rowGapX,
                            paddingLeft: EVENT_REWARD_UI.rowPadX,
                            paddingRight: EVENT_REWARD_UI.rowPadX,
                            paddingTop: EVENT_REWARD_UI.rowPadY,
                            paddingBottom: EVENT_REWARD_UI.rowPadY,
                            maxWidth: `calc(${EVENT_REWARD_UI.rowMaxWidthVw}vw / ${EVENT_REWARD_UI.showcaseScale})`,
                            maxHeight: `calc(${EVENT_REWARD_UI.rowMaxHeightVh}vh / ${EVENT_REWARD_UI.showcaseScale})`,
                        }}
                    >
                        {items.map((r, i) => <RewardItem key={i} result={r} index={i} run={run} />)}
                    </div>
                )}

                {/* 收下 */}
                <motion.button
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.12 * items.length + 0.25 }}
                    onClick={() => {eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                    className="shrink-0 pointer-events-auto font-black tracking-[0.25em] text-white border border-white/25 bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all"
                    style={{
                        paddingLeft: EVENT_REWARD_UI.btnPadX,
                        paddingRight: EVENT_REWARD_UI.btnPadX,
                        paddingTop: EVENT_REWARD_UI.btnPadY,
                        paddingBottom: EVENT_REWARD_UI.btnPadY,
                        borderRadius: EVENT_REWARD_UI.btnRadius,
                    }}
                >
                    收下
                </motion.button>
            </div>
        </motion.div>
    );
};
