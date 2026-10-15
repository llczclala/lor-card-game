// ==========================================
// 悖论迷宫 · 首战大捷 · 天启者招募（三选一）
// [2026-09-04 莉莉子 + 程拍板] 第一场战斗胜利奖励替换：
//   从卡牌三选一换成「没被选择的天启者」三选一（一次性，run.heroRecruitDone 防重复）。
//   选中 = 英雄本体卡 ×2 + 随机 2 张该阵营可收集卡（随从/法术，非衍生）永久入队；
//   机密以上难度候选英雄再随机带一件装备（穿在英雄本体卡上，attachEquipment 渲染卡面带装）。
//   观感对齐 BattleRewardModal 全屏开放式：enter(升入)→select(可交互)→exit。
//
// [2026-10-03 莉莉子 · 程拍板 BUG-20261002-21] 下方展示改为**卡牌列表**：
//   原先「左右两张 0.55 缩放的小卡」看不清（玩家反馈的核心）。
//   现改为**上方英雄大图 + 下方小卡牌列表**（本体 ×HERO_RECRUIT_HERO_COUNT + 随行 2 张阵营卡），
//   列表样式对齐**地图左下角头像抽屉**（`RogueDrawer` 的「当前牌组」页）：
//   费用圆点 + 名称 + 右侧 X数量 + **悬停出大图**（useCardGaze + FloatingCardPreview）。
// ==========================================
import React, { useState, useEffect } from 'react';
import { eventBus, GameEvents } from '../../../utils/eventBus'; // [2026-10-14 莉莉子] 交互音效
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Sparkles, Shield } from 'lucide-react';
import { CARD_DB } from '../../../data/cards';
import type { CardData } from '../../../types';
import { attachEquipment, getEquipmentById } from '../../../data/equipment';
import { RARITY_META } from '../RarityIcon';
import { HERO_RECRUIT_HERO_COUNT, type HeroRecruitOption } from '../../../data/roguelike/rewards';
// [2026-10-03 莉莉子] 多卡并排的**统一间距口径**（唯一出口，见该文件头注释）
import { cardRowGap } from '../uiSpacing';
import { useCardGaze } from '../../../hooks/useCardGaze';
import { FloatingCardPreview } from '../../FloatingCardPreview';
import { Card } from '../../Card';
import { ConfirmDialog } from '../ConfirmDialog'; // [2026-10-08 交互回响层 批次2] 通用二次确认（跳过招募）
import { FullArtOverlay } from '../../Overlays'; // [2026-10-15 莉莉子 · 触屏] 触屏详情入口（本项目既有惯例：本地 viewCard + FullArtOverlay）

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 首战招募弹窗 · 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// · 只改 `scale` 一个数 ⇒ 英雄大图 + 下方卡牌列表 **整体等比** 放大/缩小
// · 其余是"放大后仍不协调"时的细调旋钮，全部**按 scale 等比生效**（无需再乘一遍）
// · 长度单位 px；基准值 = scale 为 1 时的尺寸
// ⚠️ 三列并排 ⇒ 放大后总宽 = 3×(130×baseCardScale×scale) + 2×columnGap，
//    1920 宽下到 scale≈1.6 之前都不会挤（1280 宽建议 ≤1.35）
// ══════════════════════════════════════════════════════════════════════
export const HERO_RECRUIT_UI = {
    /** 🔍 整体放大倍数（1 = 原尺寸；当前 1.18 ≈ 比原来大一圈） */
    scale: 1.55,
    /** 手牌卡基准缩放（Card 组件原始尺寸 130×202）—— 一般只改 scale，不用动它 */
    baseCardScale: 1.55,
    /** 卡牌列表：行高 */
    listRowH: 38,
    /** 卡牌列表：行间距 */
    listRowGap: 4,
    /** 卡牌列表：与英雄大图之间的上间距 */
    listMarginTop: 8,
    /** 三候选之间的横向间距（**下限**，可往上调）
     *  [2026-10-03 莉莉子] 实际间距 = max(这里, uiSpacing 算出的安全值)：
     *  英雄卡 `location="hand"` 的装备图标是**绝对定位**、伸出卡面右侧 (84−15)×0.45 ≈ 31px，
     *  再乘外层放大（baseCardScale×scale）⇒ 你有装备的候选之间必须让开这么多，否则图标会压到隔壁。
     *  所以**改上面的 scale 不用再手动改这里**（安全值会自动跟着长）；这里填的数只在你想更宽松时起作用。 */
    columnGap: 40,
    /** 卡牌列表：行左右内边距 */
    listRowPadX: 10,
    /** 卡牌列表：卡名字号（X 数量同号） */
    listNameFont: 11,
    /** 卡牌列表：费用圆点直径 */
    costDot: 20,
    /** 卡牌列表：费用数字字号 */
    costFont: 10,
};

// 由调参区推导出的实际尺寸（改上面那组参数即可，下面不要手改）
const S = HERO_RECRUIT_UI.scale;
const HAND_CARD_SCALE = HERO_RECRUIT_UI.baseCardScale * S;
// [2026-10-03 莉莉子] 列间距 = max(手调值, 安全下限)。安全下限由"装备图标外扩 × 外层放大"推出
//   ⇒ 程改 scale 后不会再把装备图标压到隔壁候选身上（口径见 ../uiSpacing.ts）
const COLUMN_GAP = Math.max(HERO_RECRUIT_UI.columnGap, cardRowGap(HAND_CARD_SCALE));
const HERO_CARD_W = 130 * HAND_CARD_SCALE;
const HERO_CARD_H = 202 * HAND_CARD_SCALE;
const LIST_ROW_H = HERO_RECRUIT_UI.listRowH * S;
const LIST_ROW_GAP = HERO_RECRUIT_UI.listRowGap * S;
const LIST_MARGIN_TOP = HERO_RECRUIT_UI.listMarginTop * S;
const LIST_ROW_PAD_X = HERO_RECRUIT_UI.listRowPadX * S;
const LIST_NAME_FONT = HERO_RECRUIT_UI.listNameFont * S;
const COST_DOT = HERO_RECRUIT_UI.costDot * S;
const COST_FONT = HERO_RECRUIT_UI.costFont * S;

interface HeroRecruitModalProps {
    options: HeroRecruitOption[];
    subNote?: string; // 副题说明（难度装备提示等，App 传入）
    onPick: (heroKey: string) => void;
    onSkip: () => void;
}

export const HeroRecruitModal: React.FC<HeroRecruitModalProps> = ({ options, subNote, onPick, onSkip }) => {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [animPhase, setAnimPhase] = useState<'enter' | 'select' | 'exit'>('enter');
    // [2026-10-08 莉莉子 · 交互回响层 批次2] 首战招募**只有这一次**（run.heroRecruitDone 一次性）⇒ 跳过要二次确认
    const [confirmSkip, setConfirmSkip] = useState(false);
    // [2026-10-03 莉莉子] 悬停检视：与地图抽屉（RogueDrawer「当前牌组」）同款 —— 列表行看不清就悬停出大图
    const { gazeTarget, bindGazeEvents, dismissGaze } = useCardGaze({ delay: 250 });
    // [2026-10-15 莉莉子 · 触屏] 触屏长按 → 浮层「📖 详情」的落点（触屏没有右键）
    const [viewCard, setViewCard] = useState<CardData | null>(null);

    useEffect(() => {
        const t = setTimeout(() => setAnimPhase('select'), 600);
        return () => clearTimeout(t);
    }, []);

    // 弹窗卸载时清理可能残留的悬停大图
    useEffect(() => () => dismissGaze(), [dismissGaze]);

    const handleConfirm = () => {
        if (!selectedKey) return;
        dismissGaze();
        setAnimPhase('exit');
        setTimeout(() => onPick(selectedKey), 500);
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[700] flex flex-col items-center justify-center">
                {/* 全屏点击拦截层 */}
                <div className="absolute inset-0 bg-black/75 pointer-events-auto" onClick={(e) => e.stopPropagation()} />

                {/* 顶部标题 */}
                {animPhase === 'select' && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                        className="absolute top-[9%] left-0 right-0 w-full text-center pointer-events-auto"
                    >
                        <div className="flex items-center justify-center gap-3 mb-1">
                            <Sparkles size={34} className="text-yellow-400" />
                            <h2 className="text-5xl font-black text-white drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] tracking-widest">天启者招募</h2>
                            <Sparkles size={34} className="text-yellow-400" />
                        </div>
                        <p className="text-yellow-200 mt-2 font-mono text-sm tracking-[0.2em] opacity-85">FIRST VICTORY · 首战大捷，招募一位天启者（本体 ×{HERO_RECRUIT_HERO_COUNT} + 阵营卡 ×2）</p>
                        {subNote && <p className="text-purple-200/90 mt-1 text-xs font-mono tracking-wider opacity-80">{subNote}</p>}
                    </motion.div>
                )}

                {/* 三候选英雄：大卡 + 卡牌列表 + 装备徽章（整体尺寸见顶部 🎛️ 调参区） */}
                <div className="relative flex items-end justify-center pointer-events-auto" style={{ marginTop: '9vh', gap: COLUMN_GAP }}>
                    {options.map((o, index) => {
                        const heroDef = CARD_DB[o.heroKey] as CardData | undefined;
                        if (!heroDef) return null;
                        const equipDef = o.equipId ? getEquipmentById(o.equipId) : undefined;
                        const equipMeta = equipDef ? RARITY_META[equipDef.rarity] : undefined;
                        const isSelected = selectedKey === o.heroKey;
                        // [2026-10-03 莉莉子] 列表行：本体 ×HERO_RECRUIT_HERO_COUNT + 随行阵营卡（与发放口径同源）
                        const listRows: { key: string; card: CardData; count: number }[] = [
                            { key: `${o.heroKey}#hero`, card: o.equipId ? attachEquipment(heroDef, o.equipId) : heroDef, count: HERO_RECRUIT_HERO_COUNT },
                        ];
                        for (const [ci, ck] of (o.companionKeys ?? []).entries()) {
                            const base = CARD_DB[ck] as CardData | undefined;
                            if (!base) continue;
                            listRows.push({
                                key: `${ck}#${ci}`,
                                card: { ...base, id: ck, strikeCount: 0, animState: 'idle' as const, damageTaken: 0, buffs: { power: 0, health: 0 } },
                                count: 1,
                            });
                        }
                        const variants: Variants = {
                            enter: {
                                x: 0, y: 90, scale: 0.3, opacity: 0,
                                transition: { delay: index * 0.1, duration: 0.65, type: 'spring', damping: 18 },
                            },
                            select: {
                                x: 0, y: isSelected ? -52 : 0,
                                scale: isSelected ? 1.02 : 0.9,
                                opacity: 1,
                                transition: { type: 'spring', stiffness: 300 },
                            },
                            exit: {
                                x: 0, y: 120, scale: 0.25, opacity: 0,
                                transition: { duration: 0.5, ease: 'easeInOut', delay: index * 0.05 },
                            },
                        };
                        return (
                            <motion.div
                                key={o.heroKey}
                                className="relative flex flex-col items-center cursor-pointer"
                                variants={variants}
                                initial="enter"
                                animate={animPhase}
                                exit="exit"
                                onClick={() => { if (animPhase === 'select') { eventBus.emit(GameEvents.SFX_SELECT_UNIT); setSelectedKey(o.heroKey); } }}
                            >
                                {/* 选中金色光晕 */}
                                {isSelected && animPhase === 'select' && (
                                    <div className="absolute -inset-2 rounded-2xl border-4 border-yellow-400 shadow-[0_0_30px_#eab308] z-0" />
                                )}
                                {/* 装备徽章（机密以上难度） */}
                                {o.equipId && equipDef && equipMeta && (
                                    <div className="absolute -top-3 right-2 z-30 flex items-center gap-1 px-2 py-0.5 rounded-full font-black text-[11px] tracking-wider"
                                        style={{ color: equipMeta.color, border: `1px solid ${equipMeta.color}66`, background: 'rgba(2,6,23,0.9)', boxShadow: `0 0 12px ${equipMeta.color}55` }}>
                                        <Shield size={11} /> 装备·{equipDef.name}
                                    </div>
                                )}
                                <div className="relative z-10 origin-bottom">
                                    <div style={{ width: HERO_CARD_W, height: HERO_CARD_H }}>
                                        <div style={{ transform: `scale(${HAND_CARD_SCALE})`, transformOrigin: 'top left' }}>
                                            {/* [2026-09-04] 机密以上：英雄本体卡直接穿戴态渲染（装备品质 pips 自带）；普通裸卡 */}
                                            <Card data={o.equipId ? attachEquipment(heroDef, o.equipId) : heroDef} location="hand" isFaceUp={true} skinId={0} />
                                        </div>
                                    </div>
                                </div>
                                {/* [2026-10-03 程拍板] 下方「卡牌列表」：本体 ×2 + 随行 2 张阵营卡
                                    样式对齐地图左下角头像抽屉（RogueDrawer「当前牌组」）：
                                    费用圆点 + 名称 + X数量，**悬停出完整大图**（原 0.55 缩放小卡看不清）
                                    尺寸全部由顶部 🎛️ HERO_RECRUIT_UI 推导 */}
                                <div
                                    className="relative z-10 flex flex-col"
                                    style={{ width: HERO_CARD_W, marginTop: LIST_MARGIN_TOP, rowGap: LIST_ROW_GAP }}
                                >
                                    {listRows.map(row => (
                                        <div
                                            key={row.key}
                                            className="relative flex items-center bg-gray-800/90 rounded-lg border border-gray-700/60 hover:border-blue-500 overflow-hidden cursor-help"
                                            style={{ height: LIST_ROW_H }}
                                            {...bindGazeEvents(row.card)}
                                        >
                                            <div className="absolute inset-0 opacity-40 bg-cover bg-center" style={{ backgroundImage: `url(${row.card.imageUrl})` }} />
                                            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent" />
                                            <div className="absolute inset-0 flex items-center justify-between" style={{ paddingLeft: LIST_ROW_PAD_X, paddingRight: LIST_ROW_PAD_X }}>
                                                <div className="flex items-center min-w-0" style={{ gap: LIST_ROW_GAP * 2 }}>
                                                    <span
                                                        className="rounded-full bg-blue-900 flex justify-center items-center font-bold border border-blue-500 text-blue-200 shrink-0"
                                                        style={{ width: COST_DOT, height: COST_DOT, fontSize: COST_FONT }}
                                                    >{row.card.cost}</span>
                                                    <span className="font-bold truncate drop-shadow-md" style={{ fontSize: LIST_NAME_FONT }}>{row.card.name}</span>
                                                </div>
                                                <span className="text-yellow-400 font-black shrink-0" style={{ fontSize: LIST_NAME_FONT, paddingLeft: 4 * S }}>X{row.count}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* 底部：招募（选定后生效） + 跳过 */}
                {animPhase === 'select' && options.length > 0 && (
                    <div className="absolute bottom-[8%] left-0 right-0 z-30 flex justify-center gap-4">
                        <motion.button
                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                            onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_CLICK); handleConfirm(); }}
                            disabled={!selectedKey}
                            className={`px-12 py-3 rounded-xl font-black text-lg tracking-widest transition-all
                                ${selectedKey
                                    ? 'bg-gradient-to-r from-yellow-600 to-amber-400 hover:scale-105 hover:shadow-[0_0_30px_rgba(245,158,11,0.6)]'
                                    : 'bg-white/10 text-gray-500 cursor-not-allowed'}`}
                        >
                            招募
                        </motion.button>
                        <motion.button
                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                            onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_CLICK); setConfirmSkip(true); }}
                            className="px-8 py-3 rounded-xl bg-white/10 hover:bg-white/20 font-black text-lg tracking-widest text-gray-300 transition-all hover:scale-105"
                        >
                            跳过
                        </motion.button>
                    </div>
                )}

                {/* [2026-10-03 莉莉子] 悬停检视大图（与地图抽屉同款）
                    z-[300] 落在本弹窗（z-[700]）自己的层叠上下文里 ⇒ 盖在候选内容之上 */}
                <FloatingCardPreview mode="follow" gazeTarget={gazeTarget} onViewArt={(c) => setViewCard(c)} />

                {/* [2026-10-15 莉莉子 · 触屏] 触屏详情入口（触屏没有右键） */}
                {viewCard && <FullArtOverlay card={viewCard} onClose={() => setViewCard(null)} />}

                {/* [2026-10-08 莉莉子 · 交互回响层 批次2] 跳过招募二次确认 */}
                {confirmSkip && (
                    <ConfirmDialog
                        title="确定放弃本次招募？"
                        desc="首战大捷的招募机会整局只有这一次，放弃后不会再出现。"
                        notes={['本次不获得新天启者（本体 ×2）与随行阵营卡', '金币照常保留']}
                        confirmLabel="确认放弃"
                        tone="danger"
                        onConfirm={() => { dismissGaze(); setConfirmSkip(false); onSkip(); }}
                        onCancel={() => setConfirmSkip(false)}
                    />
                )}
            </div>
        </AnimatePresence>
    );
};
