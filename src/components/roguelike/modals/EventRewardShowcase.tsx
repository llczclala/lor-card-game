// ==========================================
// 悖论迷宫 · 事件奖励展示（屏幕中央弹出）
// [2026-10-10 莉莉子 · 事件演出 v2 · 程需求 3]
// [2026-10-10 程实测反馈修复] 六项：
//   ① **去掉滚动滑块**（多奖励时中间冒出一条滑块，不要）
//   ② **整体尺寸可调** —— 见下方 `SHOWCASE_SCALE` / `CARD_SCALE` 两个常量，直接改数值即可
//   ③ **代价用红色**（数据金减少还沿用金色的边框/文字，观感不对）
//   ④ **用游戏内图标**（数据金＝CURRENCY_ICONS.dataGold、治疗＝EFFECT_IMAGES.healing/生命＝buffLife）
//   ⑤ 入场动画改成**放大弹出**（此前带 `y` 位移，看起来像上下震动）
//   ⑥ 装备 A+B→C 的「原卡牌」要包含**该卡已有的装备与武装**（此前只读 run.equippedCards，
//      拿不到局外带入的武装 ⇒ 里芙看起来"什么装备都没有"，与程的实际配置不符）
// [2026-10-10 第 5 轮独立审查修复] 四项：
//   ⑦ 奖励行补 `pointer-events-auto` —— 否则外层 `pointer-events-none` 会让滚轮落不到这个滚动容器，
//      被 `max-h` 裁掉的内容**既看不到滑块也滚不动**（滑块被隐藏后连"有内容被裁"的线索都没了）
//   ⑧ `max-h/max-w` 按 `SHOWCASE_SCALE` **反向补偿**（transform: scale 不参与布局 ⇒ 不补偿就会溢出被根层裁掉）
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

// ═══════════════════════════════════════════════════════════
//  [2026-10-10 程实测] **尺寸控制参数** —— 想让奖励界面更大/更小，直接改这两个数
// ═══════════════════════════════════════════════════════════
/** 整个奖励展示层的缩放（1 = 基准）。程要的"界面太小"就靠它调 */
const SHOWCASE_SCALE = 1.32;
/** 卡面单独缩放：`Card` 组件的基准尺寸比强化卡小很多，不单独放大会显得文字挤在一起 */
const CARD_SCALE = 1.28;

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
        <div className="flex flex-col items-center gap-2">
            <div
                className="relative w-[168px] h-[212px] rounded-xl border-[3px] flex flex-col items-center justify-center gap-2 overflow-hidden"
                style={{ borderColor: meta.color, background: meta.cardBg, boxShadow: `0 0 22px ${meta.color}55` }}
            >
                <div className="absolute top-2 right-2">
                    <RarityIcon rarity={def.rarity} size={18} />
                </div>
                <div className="w-24 h-24 rounded-lg overflow-hidden bg-black/50 border border-white/15">
                    <img src={def.icon} alt={def.name} className="w-full h-full object-cover" />
                </div>
                <div className="px-2 text-center">
                    <div className="text-[14px] font-black text-white leading-tight">{def.name}</div>
                </div>
                <div className="absolute bottom-2 inset-x-2 text-center">
                    <p className="text-[11px] text-gray-300 leading-snug line-clamp-3">{def.description}</p>
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
    if (stat === 'gold') return <img src={CURRENCY_ICONS.dataGold} alt="数据金" className="w-10 h-10 object-contain" />;
    if (stat === 'hp') {
        return amount > 0
            ? <img src={EFFECT_IMAGES.healing} alt="生命" className="w-10 h-10 object-contain" />
            : <HeartCrack size={34} className="text-red-300" />;
    }
    if (stat === 'maxHp') {
        return amount > 0
            ? <img src={EFFECT_IMAGES.buffLife} alt="生命上限" className="w-10 h-10 object-contain" />
            : <HeartCrack size={34} className="text-red-300" />;
    }
    if (stat === 'revive') return <RotateCcw size={34} className="text-green-300" />;
    return <RefreshCw size={34} className="text-cyan-300" />;
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
            <div className="flex items-end gap-2">
                <div className="flex flex-col items-center gap-2 px-5 py-4">
                    <div style={{ transform: `scale(${CARD_SCALE})` }}><Card data={before} location="hand" isFaceUp skinId={0} /></div>
                    <span className="text-[12px] font-bold text-gray-300 tracking-wider mt-3">原卡牌</span>
                </div>
                <div className="pb-28 px-1 text-violet-300"><Plus size={30} /></div>
                <div className="flex flex-col items-center gap-2">
                    {def ? <EquipmentFace def={def} /> : <div className="w-[168px] h-[212px] rounded-xl border border-white/15 bg-black/40 grid place-items-center text-xs text-gray-400">装备</div>}
                    <span className="text-[12px] font-bold text-violet-200 tracking-wider">装备</span>
                </div>
                <div className="pb-28 px-1 text-emerald-300"><ArrowRight size={30} /></div>
                <div className="flex flex-col items-center gap-2 px-5 py-4">
                    <div style={{ transform: `scale(${CARD_SCALE})` }}><Card data={after} location="hand" isFaceUp skinId={0} /></div>
                    <span className={`text-[12px] font-bold tracking-wider mt-3 ${tailTone}`}>强化后</span>
                </div>
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
        return shell(
            <div className="flex flex-col items-center gap-2 px-5 py-4">
                <div style={{ transform: `scale(${CARD_SCALE})` }}><Card data={cardWith(sc.cardKey, equippedOf(sc.cardKey))} location="hand" isFaceUp skinId={0} /></div>
                <span className={`text-[12px] font-bold tracking-wider mt-3 ${tailTone}`}>{isCost ? '牌组污染' : '卡牌'}</span>
            </div>,
        );
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
        <div className={`min-w-[150px] max-w-[260px] px-6 py-5 rounded-2xl border backdrop-blur-sm flex flex-col items-center gap-1.5 ${tone}`}>
            {sc?.shape === 'stat'
                ? <StatIcon stat={sc.stat} amount={sc.amount} />
                : <span className="text-3xl">{result.icon}</span>}
            {statText ? (
                <>
                    <span className="text-2xl font-black tabular-nums">{statText.main}</span>
                    <span className="text-[11px] font-bold tracking-widest opacity-80">{statText.sub}</span>
                </>
            ) : (
                <span className="text-[13px] font-bold text-center leading-snug">{result.text}</span>
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
            className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none px-8"
        >
            {/* [程实测②] 整体缩放由 `SHOWCASE_SCALE` 控制 */}
            <div
                className="flex flex-col items-center gap-7"
                style={{ transform: `scale(${SHOWCASE_SCALE})` }}
            >
                {/* 标题 */}
                <motion.h3
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`shrink-0 text-2xl font-black tracking-[0.3em] ${hasCost ? 'text-red-300' : 'text-emerald-300'}`}
                    style={{ textShadow: '0 2px 18px rgba(0,0,0,0.9)' }}
                >
                    {hasCost ? '命运已定' : '所得入囊'}
                </motion.h3>

                {/* 奖励行：[程实测①] **隐藏滚动条**（内容多时仍可用滚轮，但不再冒出一条滑块）
                    [第 5 轮审查⑦⑧] 补 `pointer-events-auto`（否则滚轮落不到这里、被裁内容不可达），
                      且 `max-*` 按 `SHOWCASE_SCALE` **反向补偿**（transform 不参与布局）。
                    [程实测②] 外加 `px-10`：`Card` 的装备 pip 绝对定位外扩约 31px，
                      而 `overflow-y-auto` 会让 overflow-x 也算成 auto（CSS 规范）⇒ 不留够就会裁掉 pip。 */}
                {items.length === 0 ? (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-gray-400 italic">
                        什么也没有发生。
                    </motion.p>
                ) : (
                    <div
                        className="flex items-end justify-center gap-8 flex-wrap px-10 py-5 pointer-events-auto overflow-y-auto
                            [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        style={{
                            maxWidth: `calc(88vw / ${SHOWCASE_SCALE})`,
                            maxHeight: `calc(62vh / ${SHOWCASE_SCALE})`,
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
                    className="shrink-0 pointer-events-auto px-12 py-3.5 rounded-xl font-black tracking-[0.25em] text-white border border-white/25 bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all"
                >
                    收下
                </motion.button>
            </div>
        </motion.div>
    );
};
