// ==========================================
// 悖论迷宫 · 天启者信息内容组件集合
// ①英雄手牌样式 ②牌库列表（手牌样式卡牌） ③等级效果条目（1-30 横条） ④神格神经图（占位）
// [2026-08-13 莉莉子] 由 RogueHeroSelect 内容区内联渲染（不弹窗）
// ==========================================
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom'; // [2026-08-26 莉莉子] 拖拽跟手图标 Portal 到 body，逃出 ScaleWrapper 缩放容器保证 1:1 跟手
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Sword, Shield, Zap, Ghost, Bird, X, RefreshCw, ChevronsRight, ChevronsLeft, Minus, Lock, type LucideIcon } from 'lucide-react';
import { CARD_DB } from '../../data/cards';
import { LORE_DB } from '../../data/loreData'; // [2026-08-13] 总览背景故事
import type { CardData } from '../../types';
import { Card } from '../Card'; // [2026-08-13] 复用完整手牌样式卡牌渲染
import { CroppedAvatar } from '../CroppedAvatar'; // [2026-08-13] 圆环头像
import { getConfiguredStarterDeck } from '../../data/roguelike/rogueStarterDecks';
import { MAX_HERO_LEVEL, HERO_LEVEL_BONUS, getLevelColor, getLevelNumberColor, getHeroLevelBonus, combineArmamentRarity } from '../../data/roguelike/heroProgression'; // [2026-09-07] combineArmamentRarity：重修每槽品质档
import { readArmStock } from '../../data/roguelike/armamentStock'; // [2026-09-07] 武装数量库存
import type { HeroLevelBonus, ArmamentRarity } from '../../data/roguelike/heroProgression'; // [2026-09-07] ArmamentRarity：每槽可装备品质上限
import { getBuffById } from '../../data/roguelike/buffs';
import { getEquipmentById, getArmamentDefs, EQUIPMENT_DEFS, attachEquipment, type EquipmentDef } from '../../data/equipment';
import { getHeroArchetype, DIFFICULTY_LABELS, DIFFICULTY_COLORS } from '../../data/roguelike/heroArchetype'; // [2026-08-13] 流派档案
import { HERO_THEMES } from '../../data/roguelike/heroTheme'; // [2026-08-13] 主题色（阵营背景色，单一来源）
import { useHeroProgression } from '../../hooks/useHeroProgression'; // [2026-08-13] 等级界面经验数据
import { useArmamentConfig } from '../../hooks/useArmamentConfig'; // [2026-08-14 武装] 武装槽配置持久化
import { useCardGaze } from '../../hooks/useCardGaze'; // [2026-08-13] 悬停卡牌大图检视
import { FloatingCardPreview } from '../FloatingCardPreview'; // [2026-08-13] 悬停大图预览
import { eventBus, GameEvents } from '../../utils/eventBus'; // [2026-08-13] 弹窗音效
import { bindArmamentGaze } from './ArmamentPreview'; // [2026-08-26 莉莉子] 武装悬停大卡预览

// [2026-08-13] 流派图标映射（lucide + 阵营主题色，对齐 heroTheme 单一来源）
const FACTION_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
    lyfe: { icon: Shield, color: HERO_THEMES.lyfe.color },                   // Lyfe 蓝
    fenny: { icon: Zap, color: HERO_THEMES.fenny.color },                    // Fenny 橙
    pupu_specular_soul: { icon: Sparkles, color: HERO_THEMES.pupu_specular_soul.color }, // Pupu 红
    mauxir_lotus_drive: { icon: Ghost, color: HERO_THEMES.mauxir_lotus_drive.color },    // Mauxir 紫
    acacia_chrono_echo: { icon: Sword, color: HERO_THEMES.acacia_chrono_echo.color },    // Acacia 天蓝
    // [2026-09-16 茉莉安] 霄鹰 → Bird；品红阵营色。不放这里的话会落到 Shield 兜底（与里芙撞）
    marian: { icon: Bird, color: HERO_THEMES.marian.color },                  // Marian 品红
};

// [2026-08-13] 总览界面几何常量（程可微调，px）
export const OVERVIEW_GEOMETRY = {
    topGap: 200,           // 三个窗口离内容区顶部的距离（程可微调，px）
    topRowHeight: 300,    // 上排（流派/难度）窗口高度（≈ 初始牌组按钮顶部对齐；背景故事从此向下延伸到底部）
    rightWidth: 400,      // 卡牌样式区域宽度（≈ 画面右侧 1/3，设计宽 1680）
    handScale: 2.5,       // 卡牌样式放大倍数（180px × 2.4 ≈ 432px，抵画面右侧 1/3）
    handOffsetTop: 60,     // [2026-08-14] 右侧卡牌样式垂直位置偏移 px（正向下/负向上，程可微调）
    armamentGap: 36,      // [2026-08-14] 卡面与右侧武装槽组的间隔 px（程可微调）
    gap: 136,              // [2026-08-14] 卡面与左侧栏位（流派/难度/背景故事）的间距 px（程可微调，对齐 DECK_GEOMETRY.gap）
};

// [2026-08-13] 等级界面几何（程可微调，px）
export const LEVELS_GEOMETRY = {
    topGap: 100,           // 三个区域离内容区顶部的距离（程可微调，px）
    avatarSize: 400,       // 区域1 圆环头像直径 px（缩放大小）
    rewardWidth: 1000,      // 区域2 下一个等级奖励长方形宽度 px
};

// [2026-08-13] 初始牌组界面几何（程可微调，px）
export const DECK_GEOMETRY = {
    topGap: 75,            // 整体距离内容区顶部 px
    listWidth: 800,        // 左侧卡牌列表宽度 px（[2026-08-26] 收窄，武装图标放每行卡牌后方独立区）
    gap: 150,               // 手牌样式与左侧列表间距 px
    handScale: 2.5,        // 右侧手牌样式缩放大小
    handOffsetTop: 100,      // 右侧手牌样式垂直位置偏移 px
    armamentGap: 24,       // [2026-08-14] 卡面与右侧武装槽组的间隔 px（程可微调）
};

// 内容类型：总览 / 初始牌组 / 天启者等级 / 武装 / 神格神经图 / 个性化（null = 未选）
export type HeroInfoWindow = 'overview' | 'deck' | 'levels' | 'divinity' | 'armament' | 'personalize' | null;

// [2026-08-13] 静态卡 → 完整手牌样式数据（虚拟运行时字段，对齐 DeckBuilder/ShopModal 做法）
// id 参数：[2026-08-13 BUG 修复] 每张预览卡用 card.key 唯一 id，避免 Card 身份闸门把不同英雄误判同卡导致 BUFF/受击特效重复播放
const toFullCardData = (staticData: any, id?: string): CardData => ({
    ...staticData,
    id: id ?? 'preview_id',
    strikeCount: 0,
    animState: 'idle',
    damageTaken: 0,
    buffs: { power: 0, health: 0 },
});

// ── 等级奖励 → 「简介短名 + 完整效果」拆解（[2026-08-13] 程要求「2 复活 复活次数+1」= 等级/短名/完整效果）──
function rewardParts(b: Partial<HeroLevelBonus>): { label: string; value: string } {
    if (b.maxHpBonus) return { label: '生命', value: `生命上限 +${b.maxHpBonus}` };
    if (b.goldBonus) return { label: '金币', value: `开局金币 +${b.goldBonus}` };
    if (b.reviveBonus) return { label: '复活', value: `复活次数 +${b.reviveBonus}` };
    if (b.refreshBonus) return { label: '刷新', value: `刷新次数 +${b.refreshBonus}` };
    if (b.grantedEnhancements?.length) {
        const names = b.grantedEnhancements.map(id => getBuffById(id)?.name ?? id);
        return { label: '迷宫强化', value: names.join('、') };
    }
    if (b.grantedEquipments?.length) {
        const names = b.grantedEquipments.map(id => getEquipmentById(id)?.name ?? id);
        return { label: '装备', value: names.join('、') };
    }
    if (b.armamentSlots) return { label: '武装槽位', value: `获得${b.armamentSlots === 2 ? '二号' : '三号'}武装槽位` }; // [2026-08-14 武装]
    if (b.armamentRarity === 'rare') return { label: '武装品质', value: '可以装备稀有武装' }; // [2026-08-14 武装]
    if (b.armamentRarity === 'epic') return { label: '武装品质', value: '可以装备史诗武装' }; // [2026-08-14 武装]
    if (b.armamentRarity === 'legendary') return { label: '武装品质', value: '可以装备传奇武装' }; // [2026-08-29 补] 30级金武装此前显示「——」（漏 legendary 分支）
    if (b.armamentRarity === 'mythic') return { label: '武装品质', value: '可以装备神话武装' }; // [2026-08-29] 30级解锁红 mythic（武装批量扩充后）
    if (b.rarityBonus) {
        if (b.rarityBonus.rare) return { label: '稀有度', value: `蓝品概率 +${b.rarityBonus.rare}%` };
        if (b.rarityBonus.epic) return { label: '稀有度', value: `紫品概率 +${b.rarityBonus.epic}%` };
        if (b.rarityBonus.legendary) return { label: '稀有度', value: `金品概率 +${b.rarityBonus.legendary}%` };
    }
    // [2026-08-29] 第六类「商店页签」落实：此前 rewardParts 未处理 shopTabBonus → 7/16 级显示「——」
    if (b.shopTabBonus) return { label: '商店页签', value: `随机页签 +${b.shopTabBonus}` };
    // [2026-08-29] 经验获取效率加成（6/17/23/29 级）
    if (b.expRateBonus) return { label: '经验效率', value: `经验获取效率 +${b.expRateBonus}%` };
    // [2026-08-29] 装备稀有度加成（10/19/26/29 级，战斗奖励紫金加权）
    if (b.equipRarityBonus) return { label: '装备稀有度', value: `装备稀有度 +${b.equipRarityBonus}%` };
    // [2026-08-29] 开局随机挑初始牌组卡挂装备（海基的推演手记〔原微缩回路〕 / 均衡增补 / 强攻模板）
    if (b.grantedSpellEquips?.length) {
        const names = b.grantedSpellEquips.map(id => getEquipmentById(id)?.name ?? id);
        return { label: '装备', value: `随机法术卡持有「${names.join('、')}」` };
    }
    if (b.grantedUnitEquips?.length) {
        const names = b.grantedUnitEquips.map(id => getEquipmentById(id)?.name ?? id);
        return { label: '装备', value: `随机单位获得「${names.join('、')}」` };
    }
    return { label: '——', value: '' };
}

// 全量等级奖励行（1-30；当前阶梯表每级都有奖励，仍做容错）
function buildLevelRows(): { level: number; color: string; label: string; value: string }[] {
    const rows: { level: number; color: string; label: string; value: string }[] = [];
    for (let lv = 1; lv <= MAX_HERO_LEVEL; lv++) {
        const b = HERO_LEVEL_BONUS[lv] as Partial<HeroLevelBonus> | undefined;
        const parts = b ? rewardParts(b) : { label: '——', value: '' };
        rows.push({ level: lv, color: getLevelColor(lv), label: parts.label, value: parts.value });
    }
    return rows;
}

// ════════════ 内容 ①：天启者手牌样式（主视觉，单张英雄卡）════════
// scale：放大倍数（1 原始；主体主视觉 1.35；总览右半 OVERVIEW_GEOMETRY.handScale 抵 1/3 画面）
export const HeroHandContent: React.FC<{ heroKey: string; scale?: number; noLabels?: boolean; equipIds?: string[] }> = ({ heroKey, scale = 1, noLabels, equipIds }) => {
    const card = CARD_DB[heroKey];
    if (!card) return null;
    // [2026-08-14 武装] 应用装备/武装静态修饰（+1/+1、-2 费、+4/+4 等）→ 手牌数值实时变化
    let cardData = toFullCardData(card, card.key);
    if (equipIds?.length) for (const id of equipIds) cardData = attachEquipment(cardData, id);
    return (
        <div className="flex flex-col items-center gap-3">
            {!noLabels && <p className="text-xs font-mono text-purple-300/80">天启者 · 手牌样式</p>}
            {/* [2026-08-13] transform scale 放大 + margin 按比例补偿溢出；key 强制重挂载避免切换英雄残留特效 */}
            <div style={{ transform: `scale(${scale})`, margin: `${(scale - 1) * 134}px 0` }}>
                <Card key={card.key} data={cardData} location="deck-builder" isFaceUp showShopIcon={false} isCostReduced={(cardData.customProgress || 0) & 2 ? true : false} />
            </div>
            {!noLabels && <p className="text-base font-black text-white tracking-wide">{card.name}</p>}
        </div>
    );
};

// ════════════ 圆环头像（复用：选择界面头像区 / 等级界面顶部）════════
export const HeroAvatarRing: React.FC<{
    heroKey: string;
    level: number;
    exp: number;
    expToNext: number;
    size?: number; // 直径 px（默认 144）
}> = ({ heroKey, level, exp, expToNext, size = 144 }) => {
    const expPct = expToNext > 0 ? Math.min(100, Math.round((exp / expToNext) * 100)) : 100;
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            {/* 圆环：黑色经验槽 + 蓝色经验条 */}
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(0,0,0,0.8)" strokeWidth="7" />
                <circle cx="50" cy="50" r="46" fill="none" stroke="#3b82f6" strokeWidth="7" strokeLinecap="round" pathLength={100}
                    strokeDasharray={`${expPct} ${100 - expPct}`} />
            </svg>
            {/* 头像 */}
            <CroppedAvatar cardKey={heroKey} className="absolute inset-1.5 w-[calc(100%-12px)] h-[calc(100%-12px)] rounded-full border-2 border-white/20" />
            {/* 黑圆等级数字（底部） */}
            <div className="absolute inset-x-0 bottom-1 flex justify-center pointer-events-none">
                <div className="w-10 h-10 rounded-full bg-black/85 border-2 border-white/30 flex items-center justify-center shadow-[0_0_10px_rgba(0,0,0,0.8)]">
                    <span className="text-xl font-black italic leading-none" style={{ color: getLevelNumberColor(level) }}>{level}</span>
                </div>
            </div>
        </div>
    );
};

// ════════════ 内容 ①.5：总览（左：流派+难度+背景故事 / 右：手牌样式+确定按钮）════════
export const OverviewContent: React.FC<{
    heroKey: string;
    onConfirm?: () => void;
    confirmDisabled?: boolean;
    themeColor?: string; // [2026-08-13] 主题色（确定按钮随所选天启者）
}> = ({ heroKey, onConfirm, confirmDisabled, themeColor }) => {
    const { getArmament, getQualityTier } = useArmamentConfig(); // [2026-08-14] 总览武装槽显示实际配置 · [2026-09-07] 每槽品质档
    // [2026-08-15] 槽位解锁随天启者等级（对齐武装界面，未解锁槽显示锁图标）
    const heroProgression = useHeroProgression();
    const level = heroProgression.getHeroLevel(heroKey);
    const heroBonus = getHeroLevelBonus(level);
    const overviewUnlockSlots = heroBonus.armamentSlots;
    // [2026-08-28 莉莉子 修复] 只取已解锁槽位武装（等级降低时未解锁槽残留武装不显示/不生效）
    const armValues = getArmament(heroKey, level);
    // [2026-09-07 重修申请] 每槽可装备品质上限（等级基础 ≤稀有 + 各槽重修额外档）
    const overviewTiers = getQualityTier(heroKey);
    const overviewCaps = useMemo<ArmamentRarity[]>(
        () => [0, 1, 2].map(i => combineArmamentRarity(heroBonus.armamentRarity, overviewTiers[i] ?? 0)),
        [heroBonus.armamentRarity, overviewTiers],
    );
    const archetype = getHeroArchetype(heroKey);
    const lore = LORE_DB[heroKey];
    const faction = FACTION_ICONS[heroKey] ?? { icon: Shield, color: '#22c55e' };
    const difficulty = archetype?.difficulty ?? 0;
    const diffColor = DIFFICULTY_COLORS[difficulty] ?? '#ffffff';
    const diffLabel = DIFFICULTY_LABELS[difficulty] ?? '轻松';
    const FIcon = faction.icon;

    return (
        <div className="flex h-full min-h-0" style={{ gap: OVERVIEW_GEOMETRY.gap }}>
            {/* 左半：上排（流派+难度等宽等高）+ 背景故事延伸到底部（paddingTop 控制离顶部距离） */}
            <div className="flex-1 flex flex-col min-w-0 shrink-0" style={{ paddingTop: OVERVIEW_GEOMETRY.topGap }}>
                {/* 上排：玩法流派 + 难度说明（等宽等高窗口，内部垂直水平居中：图标→对应颜色文字→说明） */}
                <div className="flex gap-3 shrink-0" style={{ height: OVERVIEW_GEOMETRY.topRowHeight }}>
                    {/* 流派窗口 */}
                    <div className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl flex flex-col items-center justify-center gap-2 p-3.5 text-center">
                        <FIcon size={44} style={{ color: faction.color }} />
                        <div className="text-2xl font-black italic" style={{ color: faction.color }}>
                            {archetype?.factionName ?? '未知流派'}
                        </div>
                        <p className="text-xs text-white leading-relaxed">{archetype?.factionDesc ?? '暂无流派说明'}</p>
                    </div>

                    {/* 难度窗口 */}
                    <div className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl flex flex-col items-center justify-center gap-2 p-3.5 text-center">
                        {/* 图标：5 三角槽（奇数正放/偶数镜像） */}
                        <div className="flex items-center gap-1">
                            {[0, 1, 2, 3, 4].map(i => {
                                const filled = i < difficulty;
                                return (
                                    <svg
                                        key={i}
                                        viewBox="0 0 24 24"
                                        className="w-9 h-9"
                                        style={{ transform: i % 2 === 1 ? 'scaleX(-1)' : undefined }}
                                    >
                                        <path d="M2 20 L20 12 L2 4 Z" fill={filled ? diffColor : '#374151'} />
                                    </svg>
                                );
                            })}
                        </div>
                        <div className="text-2xl font-black italic" style={{ color: diffColor, textShadow: '0 0 12px rgba(0,0,0,0.6)' }}>
                            {diffLabel}
                        </div>
                        <p className="text-xs text-white leading-relaxed">{archetype?.difficultyDesc ?? '暂无难度说明'}</p>
                    </div>
                </div>

                {/* 背景故事：上边栏对齐初始牌组按钮（topRowHeight 起），下边栏延伸到画面最下方（flex-1） */}
                <div className="flex-1 min-h-0 mt-3 bg-white/5 border border-white/10 rounded-xl p-4 overflow-y-auto custom-scrollbar">
                    <p className="text-xs font-mono text-purple-300/80 mb-2">背景故事</p>
                    <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{lore ?? '暂无背景故事'}</p>
                </div>
            </div>

            {/* 右半：卡牌样式（抵画面右侧 1/3）+ 右侧武装槽；确定按钮以卡面中心对齐（考虑武装槽占位偏移） */}
            <div
                className="shrink-0 flex items-center justify-center"
                style={{ width: OVERVIEW_GEOMETRY.rightWidth }}
            >
                <div className="flex items-center" style={{ gap: OVERVIEW_GEOMETRY.armamentGap }}>
                    {/* 卡面 + 确定按钮：以卡面中心为基准纵向居中（按钮不受武装槽占位影响） */}
                    <div className="flex flex-col items-center gap-4" style={{ marginTop: OVERVIEW_GEOMETRY.handOffsetTop }}>
                        <HeroHandContent heroKey={heroKey} noLabels scale={OVERVIEW_GEOMETRY.handScale} equipIds={armValues.filter((v): v is string => !!v)} />
                        {onConfirm && (
                            <button
                                onClick={onConfirm}
                                disabled={confirmDisabled}
                                className="px-10 py-3 rounded-xl text-lg font-black tracking-widest hover:scale-105 transition-all disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed"
                                style={themeColor ? { background: `linear-gradient(to right, ${themeColor}, ${themeColor}99)`, boxShadow: `0 0 30px ${themeColor}55` } : undefined}
                            >
                                确定选择
                            </button>
                        )}
                    </div>
                    {/* 武装槽（卡面右侧一列，总高 = 卡面高度）；[2026-08-15] 传已解锁槽位显示锁图标 */}
                    <ArmamentSlots totalHeight={HAND_CARD_HEIGHT * OVERVIEW_GEOMETRY.handScale} values={armValues} unlockSlots={overviewUnlockSlots} caps={overviewCaps} />
                </div>
            </div>
        </div>
    );
};

// ════════════ 内容 ②：初始牌组（左：卡牌列表悬停检视 / 右：手牌样式大图无按钮）════════
// 卡牌列表样式对齐 RogueDrawer 现成实现：横排行 = 卡面背景暗化 + 费用圆 + 卡名 + 数量 X1/X2
export const DeckContent: React.FC<{ heroKey: string; userSystem?: any }> = ({ heroKey, userSystem }) => {
    // [2026-08-13] 接个性化配置：rogue_starter_{heroKey} 牌组（开发者编辑）优先，否则 buildStarterDeck 默认
    const deck = useMemo(() => getConfiguredStarterDeck(userSystem?.decks, heroKey), [heroKey, userSystem?.decks]);
    const { gazeTarget, bindGazeEvents } = useCardGaze({ delay: 250 }); // [2026-08-13] 悬停大图检视
    const { getArmament } = useArmamentConfig(); // [2026-08-15] 英雄卡武装减费显示
    const heroProgression = useHeroProgression(); // [2026-08-28 莉莉子] 武装按解锁槽位生效

    // 卡牌去重计数（保持出现顺序）
    const cardCounts = new Map<string, number>();
    deck.forEach(k => cardCounts.set(k, (cardCounts.get(k) || 0) + 1));

    // [2026-08-26 莉莉子] 英雄卡的武装列表（列表项后方显示：1 个显示图标，多个显示黑色六边形 Xn）
    // [2026-08-28 莉莉子 修复] 只取已解锁槽位武装（等级降低残留不显示）
    const heroEquipIds = getArmament(heroKey, heroProgression.getHeroLevel(heroKey)).filter((v): v is string => !!v);

    return (
        <div className="flex h-full min-h-0" style={{ paddingTop: DECK_GEOMETRY.topGap, gap: DECK_GEOMETRY.gap }}>
            {/* 左：卡牌列表（宽度可调，横排行，悬停大图检视） */}
            <div className="min-w-0 overflow-y-auto custom-scrollbar pr-2 shrink-0" style={{ width: DECK_GEOMETRY.listWidth }}>
                <div className="space-y-2">
                    {[...cardCounts.entries()].map(([key, count]) => {
                        const card = CARD_DB[key];
                        if (!card) return null;
                        // CARD_DB 静态缺运行时字段，补全为完整 CardData 供悬停检视（对齐 RogueDrawer）
                        let fullCard: CardData = { ...card, id: key, strikeCount: 0, animState: 'idle' as const, damageTaken: 0, buffs: { power: 0, health: 0 } };
                        // [2026-08-15] 英雄卡应用武装：①悬停检视大图挂武装图标（减费/BUFF 生效）②列表费用显示减费后绿色
                        let displayCost = card.cost;
                        let isReduced = false;
                        if (key === heroKey) {
                            // [2026-08-28 莉莉子 修复] 只取已解锁槽位武装
                            for (const id of (getArmament(heroKey, heroProgression.getHeroLevel(heroKey)).filter((v): v is string => !!v))) fullCard = attachEquipment(fullCard, id);
                            displayCost = fullCard.cost;
                            isReduced = !!((fullCard.customProgress || 0) & 2);
                        }
                        const equips = key === heroKey ? heroEquipIds : []; // [2026-08-26] 该卡武装（当前仅英雄卡配置武装）
                        return (
                            <div key={key} className="flex items-center gap-2.5">
                                {/* 卡牌横条（flex-1 占列表内剩余，武装图标在后方独立区，不叠放） */}
                                <div
                                    className="relative flex items-center h-14 flex-1 min-w-0 bg-gray-800/90 rounded-lg border border-gray-700/60 hover:border-blue-500 overflow-hidden cursor-help"
                                    {...bindGazeEvents(fullCard)}
                                >
                                    {/* 卡面背景（暗化） */}
                                    <div className="absolute inset-0 opacity-40 bg-cover bg-center" style={{ backgroundImage: `url(${card.imageUrl})` }}></div>
                                    <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent"></div>
                                    {/* 内容：费用圆 + 卡名 + 数量 */}
                                    <div className="absolute inset-0 flex items-center justify-between px-4">
                                        <div className="flex gap-3 items-center min-w-0">
                                            <span className={`w-7 h-7 rounded-full flex justify-center items-center text-sm font-bold border shrink-0 ${isReduced ? 'bg-green-900 border-green-500 text-green-300' : 'bg-blue-900 border-blue-500 text-blue-200'}`}>{displayCost}</span>
                                            <span className="text-base font-bold truncate drop-shadow-md">{card.name}</span>
                                        </div>
                                        <span className="text-yellow-400 font-black shrink-0">X{count}</span>
                                    </div>
                                </div>
                                {/* [2026-08-26] 武装图标区（卡牌后方独立区 40px）：1 个显示对应武装图标；多个显示黑色六边形 Xn；悬停浮现武装大卡 */}
                                {/* [2026-09-10 莉莉子 修复] 摘掉原生 title：它与 bindArmamentGaze 大卡重叠 → hover 双弹（浏览器小白框 + 我们的武装大卡） */}
                                {equips.length === 1 && (
                                    <div className="w-10 h-10 shrink-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.06)' }} {...bindArmamentGaze(equips[0])}>
                                        <img src={getEquipmentById(equips[0])?.icon} alt="" className="w-full h-full object-cover" draggable={false} />
                                    </div>
                                )}
                                {equips.length > 1 && (
                                    <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-black/85 text-white text-sm font-black" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, border: '1px solid rgba(255,255,255,0.25)' }} {...bindArmamentGaze(equips)}>
                                        X{equips.length}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 右：手牌样式大图 + 武装槽（位置/缩放/间隔可调，无按钮） */}
            <div className="shrink-0" style={{ marginTop: DECK_GEOMETRY.handOffsetTop }}>
                <HandWithArmament heroKey={heroKey} noLabels scale={DECK_GEOMETRY.handScale} gap={DECK_GEOMETRY.armamentGap} />
            </div>

            {/* 悬停大图检视 */}
            <FloatingCardPreview mode="follow" gazeTarget={gazeTarget} />
        </div>
    );
};

// ════════════ 内容 ③：天启者等级界面（三区域：头像+X/N / 下一个等级奖励 / 查看所有弹窗）════════
export const LevelsContent: React.FC<{ heroKey: string; userSystem?: any }> = ({ heroKey, userSystem }) => {
    const heroProgression = useHeroProgression();
    const isDev = userSystem?.userId === 'dev_full_admin'; // [2026-08-14 开发者] 等级加减
    const progress = heroProgression.getHeroProgress(heroKey);
    const level = progress.level;
    const exp = progress.exp;
    const expToNext = progress.expToNext;
    const [showModal, setShowModal] = useState(false);

    // 下一个等级奖励（1-30；满级显示占位）
    const nextLevel = level + 1;
    const nextReward = nextLevel <= MAX_HERO_LEVEL ? HERO_LEVEL_BONUS[nextLevel] : null;
    const nextParts = nextReward ? rewardParts(nextReward) : null;

    return (
        <div className="flex flex-col items-center h-full gap-5 overflow-y-auto custom-scrollbar py-2" style={{ paddingTop: LEVELS_GEOMETRY.topGap }}>
            {/* 区域 1：圆环头像（头像+等级黑圆+圆环经验槽+蓝条）+ X/N */}
            <div className="flex flex-col items-center gap-2.5">
                <HeroAvatarRing heroKey={heroKey} level={level} exp={exp} expToNext={expToNext} size={LEVELS_GEOMETRY.avatarSize} />
                <div className="text-xl font-mono font-bold text-white tracking-wider">
                    {expToNext > 0 ? `${exp}/${expToNext}` : 'MAX'}
                </div>
            </div>

            {/* 区域 2：下一个等级奖励 */}
            <div className="flex flex-col items-center gap-2 w-full">
                <div className="text-sm font-mono text-purple-300/80">下一个等级奖励：</div>
                {nextReward && nextParts ? (
                    <div className="flex items-center gap-5 px-6 py-4 rounded-2xl bg-white/5 border border-white/15" style={{ width: LEVELS_GEOMETRY.rewardWidth }}>
                        {/* 左：等级数字圆 */}
                        <div
                            className="w-16 h-16 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: 'rgba(0,0,0,0.7)', border: `2px solid ${getLevelNumberColor(nextLevel)}`, boxShadow: `0 0 15px ${getLevelNumberColor(nextLevel)}44` }}
                        >
                            <span className="text-4xl font-black italic" style={{ color: getLevelNumberColor(nextLevel) }}>{nextLevel}</span>
                        </div>
                        {/* 右上简介 / 下具体效果 */}
                        <div className="flex flex-col gap-1">
                            <div className="text-xl font-black text-white">{nextParts.label}</div>
                            <div className="text-base text-gray-300">{nextParts.value}</div>
                        </div>
                    </div>
                ) : (
                    <div className="px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-black tracking-widest">已达最高等级（Lv.30）</div>
                )}
            </div>

            {/* 区域 3：查看所有等级奖励按钮（开发者：左右加减号按钮，升降级测试等级数字颜色） */}
            <div className="flex items-center gap-2">
                {isDev && (
                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); heroProgression.setHeroLevel(heroKey, level - 1); }}
                        disabled={level <= 1}
                        className="w-11 h-11 rounded-xl bg-slate-800 text-2xl font-black text-gray-200 border border-white/10 hover:bg-slate-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        title="降级（开发者专属）"
                    >
                        −
                    </button>
                )}
                <button
                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setShowModal(true); }}
                    className="px-8 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-purple-400 text-base font-black tracking-widest hover:scale-105 transition-all hover:shadow-[0_0_30px_rgba(168,85,247,0.6)]"
                >
                    查看所有天启者等级奖励
                </button>
                {isDev && (
                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); heroProgression.setHeroLevel(heroKey, level + 1); }}
                        disabled={level >= MAX_HERO_LEVEL}
                        className="w-11 h-11 rounded-xl bg-slate-800 text-2xl font-black text-gray-200 border border-white/10 hover:bg-slate-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        title="升级（开发者专属）"
                    >
                        +
                    </button>
                )}
            </div>

            <LevelRewardsModal isOpen={showModal} currentLevel={level} onClose={() => setShowModal(false)} />
        </div>
    );
};

// ════════════ 弹窗：所有等级奖励列表（达到亮起 / 未激活灰，可滚动，ESC/叉号关闭）════════
const LevelRewardsModal: React.FC<{ isOpen: boolean; currentLevel: number; onClose: () => void }> = ({ isOpen, currentLevel, onClose }) => {
    const rows = useMemo(buildLevelRows, []);

    // ESC 关闭：capture + stopImmediatePropagation 拦截全局 ESC
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[950] flex items-center justify-center bg-black/80 backdrop-blur-sm font-sans select-none"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.92, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.92, opacity: 0, y: 20 }}
                    transition={{ type: "spring", stiffness: 260, damping: 24 }}
                    onClick={e => e.stopPropagation()}
                    className="relative w-[720px] max-h-[80%] bg-slate-900/95 border border-purple-500/30 rounded-2xl shadow-[0_0_60px_rgba(88,28,135,0.4)] flex flex-col overflow-hidden"
                >
                    {/* 头部 */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
                        <h3 className="text-xl font-black tracking-widest text-white">天启者等级奖励</h3>
                        <button onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }} className="p-2 rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-all">
                            <X size={20} />
                        </button>
                    </div>
                    {/* 列表：达到亮起 / 未激活灰 */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                        {rows.map(r => {
                            const reached = r.level <= currentLevel;
                            return (
                                <div key={r.level}
                                    className={`flex items-center gap-4 px-4 py-2.5 rounded-xl border transition-all ${reached ? 'bg-white/5 border-white/15' : 'bg-transparent border-white/5 opacity-40 grayscale'}`}>
                                    {/* 等级数字圆（激活色按 getLevelNumberColor 6 段设计） */}
                                    <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                                        style={{ background: 'rgba(0,0,0,0.7)', border: `2px solid ${reached ? getLevelNumberColor(r.level) : '#4b5563'}` }}>
                                        <span className="text-2xl font-black italic" style={{ color: reached ? getLevelNumberColor(r.level) : '#9ca3af' }}>{r.level}</span>
                                    </div>
                                    {/* 简介 + 具体效果 */}
                                    <div className="flex flex-col gap-0.5">
                                        <div className={`text-base font-black ${reached ? 'text-white' : 'text-gray-500'}`}>{r.label}</div>
                                        {r.value && <div className={`text-sm ${reached ? 'text-gray-300' : 'text-gray-600'}`}>{r.value}</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

// ════════════ 内容 ④：神格神经图（占位）════════
export const DivinityPlaceholder: React.FC<{ heroName: string }> = ({ heroName }) => {
    return (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center h-full">
            <Sparkles className="text-purple-500/60" size={48} />
            <div>
                <p className="text-lg font-black text-white">神格神经图</p>
                <p className="text-sm text-purple-300/70 mt-1 font-mono">对应 LOR「英雄之路」星力系统</p>
            </div>
            <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-400">
                {heroName} 的神格神经图 · 开发中，敬请期待
            </div>
        </div>
    );
};

// ════════════ 内容 ⑤：武装（装备系统 · 武装槽）════════
// [2026-08-14 莉莉子] 武装=特殊装备，与其他装备同在 data/equipment.ts 管理，
//   但**不能在局内获取，只能局外带入**（进入游戏前配置）。本界面先做武装槽视觉：
//   左侧当前天启者手牌样式 + 右侧从上到下 3 个武装空槽（六边形白色描边黑色空底）。
// 六边形 clip-path 对齐装备方块（Card.tsx EQUIPMENT_HEXAGON_CLIP 同款，此处独立定义避免动核心文件）
const ARMAMENT_HEXAGON_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
// 手牌样式卡牌高度（对齐 Card.tsx deck-builder 容器 w-[130px] h-[202px]；武装槽 3 槽+间隔总高 = 手牌高度 202×scale）
const HAND_CARD_HEIGHT = 202;
// 装备/武装稀有度颜色（对齐 Card.tsx EQUIPMENT_RARITY_COLOR）
// [2026-08-27] 六档品质色：白/绿/蓝/紫/金/红（对齐 Card.tsx EQUIPMENT_RARITY_COLOR）
const EQUIP_RARITY_COLOR: Record<string, string> = {
    common: '#e5e7eb',
    uncommon: '#22c55e',
    rare: '#3b82f6',
    epic: '#a855f7',
    legendary: '#facc15',
    mythic: '#ef4444',
};
// 稀有度中文（品质描述用：「史诗武装」「优秀装备」）
const RARITY_LABEL: Record<string, string> = {
    common: '普通', uncommon: '优秀', rare: '稀有', epic: '史诗', legendary: '传说', mythic: '神话',
};
// 稀有度等级（武装品质解锁判断：未解锁品质不可装备）
const RARITY_RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
// 武装/装备持有数量上限（每个最多 3 个；开发者持有所有武装和装备各 3）
const ARMAMENT_MAX_STOCK = 3;
// [2026-09-07 程拍板] 品质上限空槽 = 斜向渐变（左上品质色 → 右下渐透），通透不艳、无文字
/** 描边层渐变：左上 cap 色 b3(70%) → 中段 40 → 右下透明 */
const capSlotGradient = (hex: string): string => `linear-gradient(135deg, ${hex}b3 0%, ${hex}40 55%, ${hex}00 85%)`;
/** 玻璃上斜向品晕（左上淡染，已装武装/空槽通用背景层） */
const capSlotGlow = (hex: string): string => `linear-gradient(135deg, ${hex}4d 0%, ${hex}00 100%)`;

// [2026-08-26 莉莉子] 拖拽跟手图标偏移微调接口（dx 正=右，dy 正=下）：
// 命中检测以鼠标位置为准（鼠标移到槽位即高亮可替换），此偏移仅影响图标显示观感，可在此微调
const DRAG_ICON_OFFSET = { dx: 0, dy: 0 };

/** 武装槽：六边形。equipId 有值时显示已配置武装图标（稀有度色）。
 *  [2026-09-07 重修申请] capRarity 传该槽可装备品质上限 → 空槽呈品质色斜向渐变（左上→右下渐透），
 *  直观看到这个槽现在能装到什么品质（重修通关升档后颜色随之变化）。 */
export const ArmamentSlot: React.FC<{ height?: number; equipId?: string | null; locked?: boolean; capRarity?: ArmamentRarity }> = ({ height = 48, equipId, locked, capRarity }) => {
    const width = height * 0.88;
    const def = equipId ? getEquipmentById(equipId) : undefined;
    const capColor = capRarity ? EQUIP_RARITY_COLOR[capRarity] : undefined;
    return (
        // [2026-08-26 莉莉子] 已配置武装的槽可悬停浮现武装大卡（总览/手牌样式等共用本组件，一处绑定全生效）
        <div className="relative shrink-0" style={{ width, height }} {...(equipId ? bindArmamentGaze(equipId) : {})}>
            {locked ? (
                // [2026-08-15] 未解锁槽：灰色锁图标（对齐武装界面样式）
                <>
                    <div className="absolute inset-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: 'rgba(255,255,255,0.18)', filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.15))' }} />
                    <div className="absolute inset-[3px] flex items-center justify-center" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: '#0f172a' }}>
                        <Lock size={height * 0.3} className="text-gray-500" />
                    </div>
                </>
            ) : def ? (
                <>
                    {/* 已装武装：外层底色 = 武装品质色（对齐装备方块稀有度描边） */}
                    <div
                        className="absolute inset-0"
                        style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: EQUIP_RARITY_COLOR[def.rarity], filter: `drop-shadow(0 0 6px ${EQUIP_RARITY_COLOR[def.rarity]}55)` }}
                    />
                    {/* 内层：黑色底 + 武装图标 */}
                    <div className="absolute inset-[3px] overflow-hidden" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: 'rgba(2,6,23,0.95)' }}>
                        <img src={def.icon} alt={def.name} className="w-full h-full object-cover" draggable={false} />
                    </div>
                </>
            ) : capRarity && capColor ? (
                // [2026-09-07 程拍板] 空槽：品质色斜向渐变描边环（左上浓→右下透）+ 深玻璃内底 + 左上品晕，无文字
                <>
                    <div className="absolute inset-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: capSlotGradient(capColor), filter: `drop-shadow(0 0 8px ${capColor}4d)` }} />
                    <div className="absolute inset-[3px]" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: 'rgba(2,6,23,0.9)' }} />
                    <div className="absolute inset-[3px]" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: capSlotGlow(capColor) }} />
                </>
            ) : (
                // 旧空槽兜底（未传 capRarity 时保留白色描边 + 深色空底）
                <>
                    <div className="absolute inset-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: 'rgba(255,255,255,0.35)', filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.25))' }} />
                    <div className="absolute inset-[3px]" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: 'rgba(2,6,23,0.9)' }} />
                </>
            )}
        </div>
    );
};

/** 3 个武装槽竖排：总高（含间隔）= totalHeight，槽高自动均分；values 传入实际配置（显示武装图标）；
 *  [2026-08-15] unlockSlots 传已解锁槽位数，未解锁槽显示锁图标（对齐武装界面）
 *  [2026-09-07] caps 传每槽可装备品质上限 → 空槽填对应品质色（重修升档后实时变化） */
export const ArmamentSlots: React.FC<{ totalHeight: number; gap?: number; values?: (string | null)[]; unlockSlots?: number; caps?: ArmamentRarity[] }> = ({ totalHeight, gap = 10, values, unlockSlots = 3, caps }) => {
    const slotHeight = (totalHeight - gap * 2) / 3;
    return (
        <div className="flex flex-col" style={{ gap }}>
            {[0, 1, 2].map(i => <ArmamentSlot key={i} height={slotHeight} equipId={values?.[i] ?? null} locked={i >= unlockSlots} capRarity={i >= unlockSlots ? undefined : caps?.[i]} />)}
        </div>
    );
};

/** 手牌样式 + 右侧武装槽组合（3 槽总高 = 手牌高度，各界面共用：总览/初始牌组/武装）
 *  [2026-08-14] 自动读取该天启者武装配置：槽位显示实际配置武装图标 + 手牌数值反映武装效果 */
export const HandWithArmament: React.FC<{ heroKey: string; scale?: number; noLabels?: boolean; gap?: number }> = ({ heroKey, scale = 1, noLabels, gap = 10 }) => {
    const { getArmament, getQualityTier } = useArmamentConfig(); // [2026-09-07] 每槽品质档
    // [2026-08-15] 槽位解锁随天启者等级（对齐武装界面，未解锁槽显示锁图标）
    const heroProgression = useHeroProgression();
    const heroBonus = getHeroLevelBonus(heroProgression.getHeroLevel(heroKey));
    const unlockSlots = heroBonus.armamentSlots;
    // [2026-08-28 莉莉子 修复] 只取已解锁槽位武装（手牌数值不反映等级降低后的残留武装）
    const values = getArmament(heroKey, heroProgression.getHeroLevel(heroKey));
    // [2026-09-07 重修申请] 每槽品质上限 → 空槽显示对应品质色
    const handTiers = getQualityTier(heroKey);
    const handCaps = useMemo<ArmamentRarity[]>(
        () => [0, 1, 2].map(i => combineArmamentRarity(heroBonus.armamentRarity, handTiers[i] ?? 0)),
        [heroBonus.armamentRarity, handTiers],
    );
    return (
        <div className="flex items-center gap-6">
            <HeroHandContent heroKey={heroKey} scale={scale} noLabels={noLabels} equipIds={values.filter((v): v is string => !!v)} />
            <ArmamentSlots totalHeight={HAND_CARD_HEIGHT * scale} gap={gap} values={values} unlockSlots={unlockSlots} caps={handCaps} />
        </div>
    );
};

// [2026-08-14] 自定义拖拽状态：拿起图标跟手 + 距离阈值（近=弹回 / 远=卸载或配置）
interface ArmDragState { type: 'slot' | 'lib'; id: string; fromSlot: number; startX: number; startY: number; x: number; y: number; }
const isPointInRect = (x: number, y: number, r: DOMRect) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

/** 武装界面：手牌样式 + 3 个武装槽（放大，对齐其他界面尺寸）+ 右侧抽屉武装库
 *  槽位右侧更换按钮 → 屏幕右侧滑出抽屉收纳武装；点击或拖拽配置；每个最多持有 3 个，用完变灰 X0
 *  普通玩家：仅武装可选；开发者：全部装备+武装可选（持有所有装备和武装各 3）
 */
export const ArmamentContent: React.FC<{ heroKey: string; userSystem?: any }> = ({ heroKey, userSystem }) => {
    const { config, getArmament, setArmamentSlot, getQualityTier } = useArmamentConfig(); // [2026-09-07] config：数量库存全局占用计算
    const isDev = userSystem?.userId === 'dev_full_admin'; // [2026-08-14] 开发者账号独有：全装备可装
    const [activeSlot, setActiveSlot] = useState<number | null>(null); // 正在更换的槽（null=收起抽屉）
    const [dragOverSlot, setDragOverSlot] = useState<number | null>(null); // [2026-08-14] 正在拖入的槽（白框反馈）
    // [2026-08-14 武装] 槽位数量随等级解锁；[2026-09-07] 可装备品质改为每槽独立上限（等级基础 ≤稀有 + 重修额外档）
    const heroProgression = useHeroProgression();
    const heroBonus = getHeroLevelBonus(heroProgression.getHeroLevel(heroKey));
    const unlockSlots = heroBonus.armamentSlots; // 已解锁槽位数（默认 1）
    const tiers = getQualityTier(heroKey);
    const capRarities = useMemo<ArmamentRarity[]>(
        () => [0, 1, 2].map(i => combineArmamentRarity(heroBonus.armamentRarity, tiers[i] ?? 0)),
        [heroBonus.armamentRarity, tiers],
    );
    const slotCap = (i: number): ArmamentRarity => capRarities[Math.max(0, Math.min(2, i))];
    const slots = getArmament(heroKey); // 全量 3 槽（槽位渲染用：未解锁槽画锁）
    // [2026-08-28 莉莉子 修复] 生效武装只算已解锁槽（未解锁槽残留不占库存/不进手牌）
    const activeSlots = slots.slice(0, unlockSlots);
    // refs：供 useEffect(空依赖) 的 onMove 读取最新解锁状态（等级变化实时生效）
    const unlockSlotsRef = useRef(unlockSlots); unlockSlotsRef.current = unlockSlots;
    // [2026-08-28 莉莉子 修复] 等级降低 → 武装格重新封上：自动卸载封上槽里的武装（配置干净，重新升级后是空槽）
    const slotsRef = useRef(slots); slotsRef.current = slots;
    useEffect(() => {
        slotsRef.current.forEach((id, i) => {
            if (id && i >= unlockSlots) setArmamentSlot(heroKey, i, null);
        });
    }, [unlockSlots, heroKey]); // 只在解锁槽位数/英雄变化时清理一次

    // [2026-08-14] 自定义拖拽：拿起图标跟手 + 距离阈值（近=弹回 / 远=卸载或配置）
    const DRAG_THRESHOLD = 40; // px
    const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
    const dragRef = useRef<ArmDragState | null>(null);
    const [drag, setDrag] = useState<ArmDragState | null>(null);
    const beginDrag = (type: 'slot' | 'lib', id: string, fromSlot: number, x: number, y: number) => {
        dragRef.current = { type, id, fromSlot, startX: x, startY: y, x, y };
        setDrag(dragRef.current);
    };
    // 拖拽结束处理（经 ref 取最新，window 监听只挂一次）
    const handleDragUpRef = useRef<(e: PointerEvent) => void>(() => {});
    handleDragUpRef.current = (e: PointerEvent) => {
        const cur = dragRef.current;
        if (!cur) return;
        const dist = Math.hypot(e.clientX - cur.startX, e.clientY - cur.startY);
        setDragOverSlot(null);
        if (dist >= DRAG_THRESHOLD) {
            const hitIdx = slotRefs.current.findIndex((el, i) => el && i !== cur.fromSlot && isPointInRect(e.clientX, e.clientY, el.getBoundingClientRect()));
            if (hitIdx >= 0) {
                if (hitIdx >= unlockSlots) { /* [2026-08-14] 未解锁槽：弹回不装备 */ }
                else {
                    const hitDef = getEquipmentById(cur.id);
                    const isMove = cur.type === 'slot';
                    // [2026-08-26 莉莉子] 槽→槽=移动（不占新数量）；库→槽=新装（需品质解锁且有库存）
                    // [2026-09-07 重修申请] 品质上限按槽独立：移动也校验目标槽上限（高品质武装移到低上限槽弹回）
                    const ok = isMove
                        ? RARITY_RANK[hitDef!.rarity] <= RARITY_RANK[slotCap(hitIdx)]
                        : (hitDef && isEquippable(hitDef, hitIdx));
                    if (ok && hitDef) {
                        setArmamentSlot(heroKey, hitIdx, cur.id);
                        if (isMove) setArmamentSlot(heroKey, cur.fromSlot, null); // 槽位拖到另一槽 = 移动
                    }
                }
            } else if (cur.type === 'slot') {
                // 槽位拖出且未落到其他槽 → 卸载（装备自动回武器库）
                setArmamentSlot(heroKey, cur.fromSlot, null);
            }
            // lib 拖出未命中 → 取消（不配置不扣数量）
        }
        dragRef.current = null;
        setDrag(null);
    };
    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            const cur = dragRef.current;
            if (!cur) return;
            dragRef.current = { ...cur, x: e.clientX, y: e.clientY };
            setDrag(dragRef.current);
            const hit = slotRefs.current.findIndex((el, i) => el && i !== (dragRef.current?.fromSlot ?? -1) && isPointInRect(e.clientX, e.clientY, el.getBoundingClientRect()));
            setDragOverSlot(hit >= 0 && hit < unlockSlotsRef.current ? hit : null);
        };
        const onUp = (e: PointerEvent) => handleDragUpRef.current(e);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    }, []);

    // 武装界面手牌 scale 1.9 → 槽总高 = 手牌高度 202×1.9（对齐其他界面）
    const slotH = (HAND_CARD_HEIGHT * 1.9 - ARMAMENT_MAX_STOCK) / 3;

    // 可选列表：开发者=全部装备+武装；普通玩家=库存>0 的武装（[2026-09-07] 数量库存）
    const armStockMap = readArmStock(userSystem?.settings as any);
    const options = useMemo(() => {
        if (isDev) return EQUIPMENT_DEFS;
        return getArmamentDefs().filter(def => (armStockMap[def.id] ?? 0) > 0);
    }, [isDev, armStockMap]);

    // [2026-09-07 数量库存] 可用数量 = 库存份数 − 全局已占用槽位份数（库存共享：同一天启者可三槽各放 1 个、也可跨英雄分装）
    const stockOf = (def: EquipmentDef) => {
        if (!def.isArmament && !isDev) return 0;
        // [2026-09-08 修复] 占用跨全英雄统计；消耗品/普通都尊重真实库存——
        //  开发者普通武装库存为 0 时给 3 份便于白嫖测试；但消耗品一律看真实库存（福利领 6 就该显示 ×6，不被开发者上限盖掉）
        let occupied = 0;
        for (const arr of Object.values(config ?? {})) for (const id of arr ?? []) if (id === def.id) occupied++;
        const have = armStockMap[def.id] ?? 0;
        const base = isDev && !def.consumable && have === 0 ? 3 : have;
        // [2026-09-08] 碳原子板=整局型单次效果：同一天启者限装 1 份（多槽各装一份会重复浪费）
        if (def.id === 'arm_resonance_crystal' && (activeSlots ?? []).includes(def.id)) return 0;
        return Math.max(0, base - occupied);
    };
    // [2026-08-26 莉莉子] 可装备判断：某武装能否装进第 slotIdx 个槽（[2026-09-07] 品质上限按槽独立 + 数量）
    const isEquippable = (def: EquipmentDef, slotIdx: number) => {
        if (slotIdx < 0 || slotIdx >= unlockSlots) return false;
        if (RARITY_RANK[def.rarity] > RARITY_RANK[slotCap(slotIdx)]) return false; // 目标槽品质上限不足
        return stockOf(def) > 0;
    };

    const handleChoose = (id: string) => {
        if (activeSlot === null) return;
        const def = getEquipmentById(id);
        if (def && !isEquippable(def, activeSlot)) return; // 目标槽品质上限不足或无库存不可配
        setArmamentSlot(heroKey, activeSlot, id);
        // [2026-08-26 莉莉子] 装备后不关闭武装库抽屉，方便继续选择其他武装
    };

    return (
        <div className="relative flex h-full w-full">
            {/* 左侧：手牌 + 槽（抽屉展开时 margin-right 让位，手牌被往左挤） */}
            <div
                className="flex-1 min-w-0 flex items-center justify-center gap-10 transition-[margin] duration-300"
                style={{ marginRight: activeSlot !== null ? 420 : 0 }}
            >
                {/* [2026-08-28 莉莉子 修复] 手牌只反映已解锁槽位武装 */}
                <HeroHandContent heroKey={heroKey} scale={1.9} noLabels equipIds={activeSlots.filter((v): v is string => !!v)} />
                {/* 3 个武装槽（放大到与手牌同高对齐） */}
                <div className="flex flex-col" style={{ gap: 8 }}>
                {[0, 1, 2].map(i => {
                    const locked = i >= unlockSlots; // [2026-08-14] 未达等级未解锁（所有账号按等级）
                    const slotId = slots[i] ?? null;
                    const def = slotId ? getEquipmentById(slotId) : undefined;
                    // [2026-09-07 重修申请] 空槽底色 = 该槽可装备品质上限色（等级基础 + 重修档）；已装 = 武装自身品质色
                    const capColor = EQUIP_RARITY_COLOR[slotCap(i)] ?? '#22c55e';
                    const rColor = def ? EQUIP_RARITY_COLOR[def.rarity] : capColor;
                    return (
                        <div key={i} className="flex items-center gap-3">
                            {/* 六边形槽：已解锁=显示配置/空槽可拖放；未解锁=灰色锁（拖上去弹回） */}
                            <div
                                ref={el => { slotRefs.current[i] = el; }}
                                className="relative shrink-0 transition-[filter]"
                                style={{ width: slotH * 0.88, height: slotH }}
                                /* [2026-09-10 莉莉子 修复] 只在「无自定义大卡」时留原生提示：锁定槽/空槽保留操作提示，
                                   已装槽（def 有值）里层 img 挂了 bindArmamentGaze → 摘掉 title 防双弹 */
                                title={locked ? '需要更高天启者等级解锁（在等级界面升级）' : def ? undefined : '拖拽武装到此处配置'}
                            >
                                {locked ? (
                                    <>
                                        <div className="absolute inset-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: 'rgba(255,255,255,0.18)', filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.15))' }} />
                                        <div className="absolute inset-[3px] flex items-center justify-center" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: '#0f172a' }}>
                                            <Lock size={slotH * 0.3} className="text-gray-500" />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* 拖入时槽位边框变白；空槽=品质上限色斜向渐变（重修升档实时变色）；已装=武装品质色 */}
                                        <div className="absolute inset-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: dragOverSlot === i ? '#ffffff' : (def ? rColor : capSlotGradient(capColor)), filter: `drop-shadow(0 0 10px ${dragOverSlot === i ? 'rgba(255,255,255,0.85)' : ((def ? rColor : capColor) + '4d')})` }} />
                                        <div className="absolute inset-[3px] overflow-hidden" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: def ? '#020617' : 'rgba(2,6,23,0.9)' }}>
                                            {def ? (
                                                <img
                                                    src={def.icon}
                                                    alt={def.name}
                                                    className="w-full h-full object-cover cursor-grab active:cursor-grabbing"
                                                    onPointerDown={e => { e.stopPropagation(); e.preventDefault(); beginDrag('slot', slotId!, i, e.clientX, e.clientY); }}
                                                    /* [2026-09-10 莉莉子 修复] 摘掉「拿起拖出可卸载」原生提示（与武装大卡双弹）；
                                                       旁边的红色减号卸载按钮本就带同样文案的 title，信息不丢 */
                                                    {...bindArmamentGaze(slotId!)}
                                                />
                                            ) : (
                                                <div className="absolute inset-0" style={{ background: capSlotGlow(capColor) }} />
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                            {/* 更换 + 卸载按钮（锁定槽不显示） */}
                            {!locked && (
                            <div className="flex flex-col gap-1.5">
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setActiveSlot(activeSlot === i ? null : i); }}
                                    className={`p-2.5 rounded-md border transition-all ${activeSlot === i ? 'bg-purple-600 text-white border-purple-400' : 'bg-slate-800/80 text-gray-300 border-white/10 hover:bg-slate-700'}`}
                                    title={slotId ? '更换武装' : '配置武装'}
                                >
                                    <RefreshCw size={16} />
                                </button>
                                {/* 红色减号：快速卸载（装备自动回武器库） */}
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setArmamentSlot(heroKey, i, null); }}
                                    disabled={!slotId}
                                    className="p-2.5 rounded-md border border-red-500/30 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white transition-all disabled:opacity-25 disabled:cursor-not-allowed"
                                    title={slotId ? '卸载武装（自动回武器库）' : '空槽'}
                                >
                                    <Minus size={16} />
                                </button>
                            </div>
                            )}
                        </div>
                    );
                })}
            </div>
            </div>

            {/* 右侧武装抽屉：fixed 画面右缘全高（无上方留空），从右向左撑开；左边缘收起按钮 */}
            <AnimatePresence>
                {activeSlot !== null && (
                    <motion.div
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 420, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                        className="fixed right-0 top-0 bottom-0 z-[610] overflow-hidden flex flex-col"
                    >
                        <div className="w-[420px] h-full flex flex-col bg-slate-900/95 border-l border-white/10">
                            {/* 头部（开合由抽屉外侧常驻按钮控制） */}
                            <div className="p-4 border-b border-white/10 shrink-0">
                                <h3 className="font-black text-white tracking-widest">{isDev ? '武装库 · 全部装备/武装' : '武装库'}</h3>
                            </div>
                            {/* 列表（六边形图标 + X数量 + 名称描述 + 品质描述） */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                {options.map(def => {
                                    const stock = stockOf(def);
                                    // [2026-08-26 莉莉子] disabled=目标槽上限不足或无库存；数量仍按 stockOf 正常显示
                                    // [2026-09-07 重修申请] 品质上限按槽独立：以「当前选中槽」判断（抽屉由选槽打开时 activeSlot 恒有值）
                                    const disabled = !isEquippable(def, activeSlot ?? 0);
                                    return (
                                        <button
                                            key={def.id}
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); handleChoose(def.id); }}
                                            disabled={disabled}
                                            className={`flex items-center gap-4 w-full px-4 py-5 rounded-xl border transition-colors text-left ${
                                                disabled
                                                    ? 'bg-gray-800/50 border-white/5 opacity-50 cursor-not-allowed'
                                                    : 'bg-white/5 border-white/10 hover:bg-purple-600/30'
                                            }`}
                                            /* [2026-09-10 莉莉子 修复] 摘掉原生 title：列表项名称/描述画面已直出、内层六边形又挂了武装大卡，
                                               原 title 的「描述 + 点击或拖拽配置」纯属重复 → hover 只剩一层检视 */
                                        >
                                            {/* 六边形图标 + 右下角数量（拖拽从六边形图标开始）；[2026-08-26] 悬停浮现武装大卡 */}
                                            <div
                                                className="relative shrink-0 cursor-grab active:cursor-grabbing"
                                                style={{ width: 60, height: 60 * 1.14 }}
                                                onPointerDown={disabled ? undefined : (e) => { e.stopPropagation(); e.preventDefault(); beginDrag('lib', def.id, -1, e.clientX, e.clientY); }}
                                                {...bindArmamentGaze(def.id)}
                                            >
                                                <div className="absolute inset-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: disabled ? '#374151' : EQUIP_RARITY_COLOR[def.rarity] }} />
                                                <div className="absolute inset-[3px] overflow-hidden" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: '#020617' }}>
                                                    <img src={def.icon} alt="" className="w-full h-full object-cover opacity-80" draggable={false} />
                                                </div>
                                                <span className="absolute -bottom-1 -right-0.5 text-xs font-mono font-black" style={{ color: disabled ? '#6b7280' : '#facc15' }}>
                                                    X{stock}
                                                </span>
                                            </div>
                                            {/* 名称 + 描述 */}
                                            <span className="flex-1 min-w-0">
                                                <span className={`block text-lg font-bold truncate ${disabled ? 'text-gray-500' : 'text-white'}`}>{def.name}</span>
                                                <span className="block text-sm text-gray-400 truncate">{def.description}</span>
                                            </span>
                                            {/* 品质描述：史诗武装 / 普通装备 */}
                                            <span className="text-xs font-mono shrink-0" style={{ color: disabled ? '#6b7280' : EQUIP_RARITY_COLOR[def.rarity] }}>
                                                {RARITY_LABEL[def.rarity]}{def.isArmament ? '武装' : '装备'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 抽屉外侧常驻开合按钮：收起=画面右缘（点击打开）；打开=抽屉左外侧（点击收起） */}
            <button
                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setActiveSlot(activeSlot === null ? 0 : null); }}
                className="fixed top-1/2 -translate-y-1/2 z-[620] w-8 h-14 flex items-center justify-center rounded-l-lg border transition-all duration-300"
                style={{
                    right: activeSlot === null ? 0 : 420,
                    background: activeSlot === null ? 'rgba(30,27,75,0.9)' : 'rgba(30,27,75,0.95)',
                    borderColor: activeSlot === null ? 'rgba(255,255,255,0.15)' : 'rgba(168,85,247,0.4)',
                    color: activeSlot === null ? '#d1d5db' : '#e9d5ff',
                }}
                title={activeSlot === null ? '打开武装库' : '收起武装库'}
            >
                {activeSlot === null ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
            </button>

            {/* 拖拽跟手图标：Portal 渲染到 document.body，逃出 ScaleWrapper 缩放容器保证 1:1 跟手（同卡牌 DragGhostCard）；DRAG_ICON_OFFSET 仅调观感 */}
            {drag && createPortal(
                <div className="fixed z-[700] pointer-events-none select-none" style={{ left: drag.x + DRAG_ICON_OFFSET.dx, top: drag.y + DRAG_ICON_OFFSET.dy, transform: 'translate(-50%, -50%)' }}>
                    <div className="relative" style={{ width: slotH * 0.88, height: slotH }}>
                        <div className="absolute inset-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: EQUIP_RARITY_COLOR[getEquipmentById(drag.id)?.rarity ?? 'common'] ?? '#22c55e', filter: 'drop-shadow(0 0 14px rgba(255,255,255,0.6))' }} />
                        <div className="absolute inset-[3px] overflow-hidden" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: '#020617' }}>
                            <img src={getEquipmentById(drag.id)?.icon} alt="" className="w-full h-full object-cover" />
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
