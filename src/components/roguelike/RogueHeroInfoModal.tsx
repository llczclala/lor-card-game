// ==========================================
// 悖论迷宫 · 天启者信息内容组件集合
// ①英雄手牌样式 ②牌库列表（手牌样式卡牌） ③等级效果条目（1-30 横条） ④神格神经图（占位）
// [2026-08-13 莉莉子] 由 RogueHeroSelect 内容区内联渲染（不弹窗）
// ==========================================
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Sword, Shield, Zap, Ghost, X, RefreshCw, ChevronsRight, ChevronsLeft, Minus, Lock, type LucideIcon } from 'lucide-react';
import { CARD_DB } from '../../data/cards';
import { LORE_DB } from '../../data/loreData'; // [2026-08-13] 总览背景故事
import type { CardData } from '../../types';
import { Card } from '../Card'; // [2026-08-13] 复用完整手牌样式卡牌渲染
import { CroppedAvatar } from '../CroppedAvatar'; // [2026-08-13] 圆环头像
import { getConfiguredStarterDeck } from '../../data/roguelike/rogueStarterDecks';
import { MAX_HERO_LEVEL, HERO_LEVEL_BONUS, getLevelColor, getLevelNumberColor, getHeroLevelBonus } from '../../data/roguelike/heroProgression';
import type { HeroLevelBonus } from '../../data/roguelike/heroProgression';
import { getBuffById } from '../../data/roguelike/buffs';
import { getEquipmentById, getArmamentDefs, EQUIPMENT_DEFS, attachEquipment, type EquipmentDef } from '../../data/equipment';
import { getHeroArchetype, DIFFICULTY_LABELS, DIFFICULTY_COLORS } from '../../data/roguelike/heroArchetype'; // [2026-08-13] 流派档案
import { HERO_THEMES } from '../../data/roguelike/heroTheme'; // [2026-08-13] 主题色（阵营背景色，单一来源）
import { useHeroProgression } from '../../hooks/useHeroProgression'; // [2026-08-13] 等级界面经验数据
import { useArmamentConfig } from '../../hooks/useArmamentConfig'; // [2026-08-14 武装] 武装槽配置持久化
import { useCardGaze } from '../../hooks/useCardGaze'; // [2026-08-13] 悬停卡牌大图检视
import { FloatingCardPreview } from '../FloatingCardPreview'; // [2026-08-13] 悬停大图预览
import { eventBus, GameEvents } from '../../utils/eventBus'; // [2026-08-13] 弹窗音效

// [2026-08-13] 流派图标映射（lucide + 阵营主题色，对齐 heroTheme 单一来源）
const FACTION_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
    lyfe: { icon: Shield, color: HERO_THEMES.lyfe.color },                   // Lyfe 蓝
    fenny: { icon: Zap, color: HERO_THEMES.fenny.color },                    // Fenny 橙
    pupu_specular_soul: { icon: Sparkles, color: HERO_THEMES.pupu_specular_soul.color }, // Pupu 红
    mauxir_lotus_drive: { icon: Ghost, color: HERO_THEMES.mauxir_lotus_drive.color },    // Mauxir 紫
    acacia_chrono_echo: { icon: Sword, color: HERO_THEMES.acacia_chrono_echo.color },    // Acacia 天蓝
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
    topGap: 300,            // 整体距离内容区顶部 px
    listWidth: 820,        // 左侧卡牌列表宽度 px
    gap: 150,               // 手牌样式与左侧列表间距 px
    handScale: 2.5,        // 右侧手牌样式缩放大小
    handOffsetTop: -200,      // 右侧手牌样式垂直位置偏移 px
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
    if (b.rarityBonus) {
        if (b.rarityBonus.rare) return { label: '稀有度', value: `稀有卡概率 +${b.rarityBonus.rare}%` };
        if (b.rarityBonus.epic) return { label: '稀有度', value: `史诗卡概率 +${b.rarityBonus.epic}%` };
        if (b.rarityBonus.legendary) return { label: '稀有度', value: `传说卡概率 +${b.rarityBonus.legendary}%` };
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
    const { getArmament } = useArmamentConfig(); // [2026-08-14] 总览武装槽显示实际配置
    const armValues = getArmament(heroKey);
    // [2026-08-15] 槽位解锁随天启者等级（对齐武装界面，未解锁槽显示锁图标）
    const heroProgression = useHeroProgression();
    const heroBonus = getHeroLevelBonus(heroProgression.getHeroLevel(heroKey));
    const overviewUnlockSlots = heroBonus.armamentSlots;
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
                    <ArmamentSlots totalHeight={HAND_CARD_HEIGHT * OVERVIEW_GEOMETRY.handScale} values={armValues} unlockSlots={overviewUnlockSlots} />
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

    // 卡牌去重计数（保持出现顺序）
    const cardCounts = new Map<string, number>();
    deck.forEach(k => cardCounts.set(k, (cardCounts.get(k) || 0) + 1));

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
                            for (const id of (getArmament(heroKey).filter((v): v is string => !!v))) fullCard = attachEquipment(fullCard, id);
                            displayCost = fullCard.cost;
                            isReduced = !!((fullCard.customProgress || 0) & 2);
                        }
                        return (
                            <div
                                key={key}
                                className="relative flex items-center h-14 bg-gray-800/90 rounded-lg border border-gray-700/60 hover:border-blue-500 overflow-hidden cursor-help"
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
                    className="relative w-[720px] max-h-[80vh] bg-slate-900/95 border border-purple-500/30 rounded-2xl shadow-[0_0_60px_rgba(88,28,135,0.4)] flex flex-col overflow-hidden"
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
const EQUIP_RARITY_COLOR: Record<string, string> = {
    common: '#22c55e',
    rare: '#3b82f6',
    epic: '#a855f7',
    legendary: '#facc15',
};
// 稀有度中文（品质描述用：「史诗武装」「普通装备」）
const RARITY_LABEL: Record<string, string> = {
    common: '普通', rare: '稀有', epic: '史诗', legendary: '传说',
};
// 稀有度等级（武装品质解锁判断：未解锁品质不可装备）
const RARITY_RANK: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
// 武装/装备持有数量上限（每个最多 3 个；开发者持有所有武装和装备各 3）
const ARMAMENT_MAX_STOCK = 3;

/** 武装槽：六边形白色描边 + 黑色空底；equipId 有值时显示已配置武装图标（稀有度描边） */
export const ArmamentSlot: React.FC<{ height?: number; equipId?: string | null; locked?: boolean }> = ({ height = 48, equipId, locked }) => {
    const width = height * 0.88;
    const def = equipId ? getEquipmentById(equipId) : undefined;
    const rColor = def ? EQUIP_RARITY_COLOR[def.rarity] : 'rgba(255,255,255,0.9)';
    return (
        <div className="relative shrink-0" style={{ width, height }}>
            {locked ? (
                // [2026-08-15] 未解锁槽：灰色锁图标（对齐武装界面样式）
                <>
                    <div className="absolute inset-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: 'rgba(255,255,255,0.18)', filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.15))' }} />
                    <div className="absolute inset-[3px] flex items-center justify-center" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: '#0f172a' }}>
                        <Lock size={height * 0.3} className="text-gray-500" />
                    </div>
                </>
            ) : (
                <>
                    {/* 外层：白色描边 / 稀有度描边（clip-path 底色做边框，对齐装备方块） */}
                    <div
                        className="absolute inset-0"
                        style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: rColor, filter: `drop-shadow(0 0 6px ${def ? rColor + '55' : 'rgba(255,255,255,0.25)'})` }}
                    />
                    {/* 内层：黑色空槽底 + 已配置武装图标 */}
                    <div className="absolute inset-[3px] overflow-hidden" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: 'rgba(2,6,23,0.95)' }}>
                        {def && <img src={def.icon} alt={def.name} className="w-full h-full object-cover" draggable={false} />}
                    </div>
                </>
            )}
        </div>
    );
};

/** 3 个武装槽竖排：总高（含间隔）= totalHeight，槽高自动均分；values 传入实际配置（显示武装图标）；
 *  [2026-08-15] unlockSlots 传已解锁槽位数，未解锁槽显示锁图标（对齐武装界面） */
export const ArmamentSlots: React.FC<{ totalHeight: number; gap?: number; values?: (string | null)[]; unlockSlots?: number }> = ({ totalHeight, gap = 10, values, unlockSlots = 3 }) => {
    const slotHeight = (totalHeight - gap * 2) / 3;
    return (
        <div className="flex flex-col" style={{ gap }}>
            {[0, 1, 2].map(i => <ArmamentSlot key={i} height={slotHeight} equipId={values?.[i] ?? null} locked={i >= unlockSlots} />)}
        </div>
    );
};

/** 手牌样式 + 右侧武装槽组合（3 槽总高 = 手牌高度，各界面共用：总览/初始牌组/武装）
 *  [2026-08-14] 自动读取该天启者武装配置：槽位显示实际配置武装图标 + 手牌数值反映武装效果 */
export const HandWithArmament: React.FC<{ heroKey: string; scale?: number; noLabels?: boolean; gap?: number }> = ({ heroKey, scale = 1, noLabels, gap = 10 }) => {
    const { getArmament } = useArmamentConfig();
    const values = getArmament(heroKey);
    // [2026-08-15] 槽位解锁随天启者等级（对齐武装界面，未解锁槽显示锁图标）
    const heroProgression = useHeroProgression();
    const heroBonus = getHeroLevelBonus(heroProgression.getHeroLevel(heroKey));
    const unlockSlots = heroBonus.armamentSlots;
    return (
        <div className="flex items-center gap-6">
            <HeroHandContent heroKey={heroKey} scale={scale} noLabels={noLabels} equipIds={values.filter((v): v is string => !!v)} />
            <ArmamentSlots totalHeight={HAND_CARD_HEIGHT * scale} gap={gap} values={values} unlockSlots={unlockSlots} />
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
    const { config, getArmament, setArmamentSlot } = useArmamentConfig();
    const isDev = userSystem?.userId === 'dev_full_admin'; // [2026-08-14] 开发者账号独有：全装备可装
    const [activeSlot, setActiveSlot] = useState<number | null>(null); // 正在更换的槽（null=收起抽屉）
    const [dragOverSlot, setDragOverSlot] = useState<number | null>(null); // [2026-08-14] 正在拖入的槽（白框反馈）
    const slots = getArmament(heroKey);
    // [2026-08-14 武装] 槽位数量与可装备品质随天启者等级解锁（所有账号含开发者均按等级，便于等级按钮测试）
    const heroProgression = useHeroProgression();
    const heroBonus = getHeroLevelBonus(heroProgression.getHeroLevel(heroKey));
    const unlockSlots = heroBonus.armamentSlots; // 已解锁槽位数（默认 1）
    const unlockRarity = heroBonus.armamentRarity; // 可装备武装最高品质
    // refs：供 useEffect(空依赖) 的 onMove 读取最新解锁状态（等级变化实时生效）
    const unlockSlotsRef = useRef(unlockSlots); unlockSlotsRef.current = unlockSlots;

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
                    const stock = (!hitDef?.isArmament && !isDev) ? 0 : Math.max(0, ARMAMENT_MAX_STOCK - (globalUsed[cur.id] || 0));
                    if (stock > 0) {
                        setArmamentSlot(heroKey, hitIdx, cur.id);
                        if (cur.type === 'slot') setArmamentSlot(heroKey, cur.fromSlot, null); // 槽位拖到另一槽 = 移动
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

    // 全局占用（跨英雄槽位配置计数，用于数量上限）
    const globalUsed = useMemo(() => {
        const used: Record<string, number> = {};
        Object.values(config).forEach(slotsArr => slotsArr.forEach(id => { if (id) used[id] = (used[id] || 0) + 1; }));
        return used;
    }, [config]);

    // 可选列表：开发者=全部装备+武装；普通玩家=仅武装
    const options = useMemo(() => (isDev ? EQUIPMENT_DEFS : getArmamentDefs()), [isDev]);

    // 某装备/武装可用数量：上限3 - 全局占用；普通玩家装备恒 0；[2026-08-14] 未解锁品质不可装备（所有账号按等级）
    const stockOf = (def: EquipmentDef) => {
        if (!def.isArmament && !isDev) return 0;
        if (RARITY_RANK[def.rarity] > RARITY_RANK[unlockRarity]) return 0; // 品质未解锁
        return Math.max(0, ARMAMENT_MAX_STOCK - (globalUsed[def.id] || 0));
    };

    const handleChoose = (id: string) => {
        if (activeSlot === null) return;
        const def = getEquipmentById(id);
        if (def && stockOf(def) <= 0) return; // 无库存不可配
        setArmamentSlot(heroKey, activeSlot, id);
        setActiveSlot(null);
    };

    return (
        <div className="relative flex h-full w-full">
            {/* 左侧：手牌 + 槽（抽屉展开时 margin-right 让位，手牌被往左挤） */}
            <div
                className="flex-1 min-w-0 flex items-center justify-center gap-10 transition-[margin] duration-300"
                style={{ marginRight: activeSlot !== null ? 420 : 0 }}
            >
                <HeroHandContent heroKey={heroKey} scale={1.9} noLabels equipIds={slots.filter((v): v is string => !!v)} />
                {/* 3 个武装槽（放大到与手牌同高对齐） */}
                <div className="flex flex-col" style={{ gap: 8 }}>
                {[0, 1, 2].map(i => {
                    const locked = i >= unlockSlots; // [2026-08-14] 未达等级未解锁（所有账号按等级）
                    const slotId = slots[i] ?? null;
                    const def = slotId ? getEquipmentById(slotId) : undefined;
                    const rColor = def ? EQUIP_RARITY_COLOR[def.rarity] : 'rgba(255,255,255,0.45)';
                    return (
                        <div key={i} className="flex items-center gap-3">
                            {/* 六边形槽：已解锁=显示配置/空槽可拖放；未解锁=灰色锁（拖上去弹回） */}
                            <div
                                ref={el => { slotRefs.current[i] = el; }}
                                className="relative shrink-0 transition-[filter]"
                                style={{ width: slotH * 0.88, height: slotH }}
                                title={locked ? '需要更高天启者等级解锁（在等级界面升级）' : '拖拽武装到此处配置'}
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
                                        {/* 拖入时槽位边框变白，提示放到位 */}
                                        <div className="absolute inset-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: dragOverSlot === i ? '#ffffff' : rColor, filter: `drop-shadow(0 0 10px ${dragOverSlot === i ? 'rgba(255,255,255,0.85)' : (def ? rColor + '66' : 'rgba(255,255,255,0.2)')})` }} />
                                        <div className="absolute inset-[3px] overflow-hidden" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: '#020617' }}>
                                            {def && (
                                                <img
                                                    src={def.icon}
                                                    alt={def.name}
                                                    className="w-full h-full object-cover cursor-grab active:cursor-grabbing"
                                                    onPointerDown={e => { e.stopPropagation(); e.preventDefault(); beginDrag('slot', slotId!, i, e.clientX, e.clientY); }}
                                                    title="拿起拖出可卸载，装备自动回武器库"
                                                />
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
                            <div className="flex-1 overflow-y-auto p-3 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                {options.map(def => {
                                    const stock = stockOf(def);
                                    const disabled = stock <= 0;
                                    return (
                                        <button
                                            key={def.id}
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); handleChoose(def.id); }}
                                            disabled={disabled}
                                            className={`flex items-center gap-3 w-full px-2.5 py-2 rounded-lg border transition-colors text-left ${
                                                disabled
                                                    ? 'bg-gray-800/50 border-white/5 opacity-50 cursor-not-allowed'
                                                    : 'bg-white/5 border-white/10 hover:bg-purple-600/30'
                                            }`}
                                            title={`${def.description}\n（点击或拖拽配置${disabled ? '，数量已用完' : ''}）`}
                                        >
                                            {/* 六边形图标 + 右下角数量（拖拽从六边形图标开始） */}
                                            <div
                                                className="relative shrink-0 cursor-grab active:cursor-grabbing"
                                                style={{ width: 52, height: 52 * 1.14 }}
                                                onPointerDown={disabled ? undefined : (e) => { e.stopPropagation(); e.preventDefault(); beginDrag('lib', def.id, -1, e.clientX, e.clientY); }}
                                            >
                                                <div className="absolute inset-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: disabled ? '#374151' : EQUIP_RARITY_COLOR[def.rarity] }} />
                                                <div className="absolute inset-[3px] overflow-hidden" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: '#020617' }}>
                                                    <img src={def.icon} alt="" className="w-full h-full object-cover opacity-80" draggable={false} />
                                                </div>
                                                <span className="absolute -bottom-1 -right-0.5 text-[10px] font-mono font-black" style={{ color: disabled ? '#6b7280' : '#facc15' }}>
                                                    X{stock}
                                                </span>
                                            </div>
                                            {/* 名称 + 描述 */}
                                            <span className="flex-1 min-w-0">
                                                <span className={`block text-sm font-bold truncate ${disabled ? 'text-gray-500' : 'text-white'}`}>{def.name}</span>
                                                <span className="block text-[10px] text-gray-400 truncate">{def.description}</span>
                                            </span>
                                            {/* 品质描述：史诗武装 / 普通装备 */}
                                            <span className="text-[10px] font-mono shrink-0" style={{ color: disabled ? '#6b7280' : EQUIP_RARITY_COLOR[def.rarity] }}>
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

            {/* 拖拽跟手图标：拿起的大尺寸武装图标（和槽位一样大，只有图标不带数量） */}
            {drag && (
                <div className="fixed z-[700] pointer-events-none select-none" style={{ left: drag.x, top: drag.y, transform: 'translate(-50%, -50%)' }}>
                    <div className="relative" style={{ width: slotH * 0.88, height: slotH }}>
                        <div className="absolute inset-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: EQUIP_RARITY_COLOR[getEquipmentById(drag.id)?.rarity ?? 'common'] ?? '#22c55e', filter: 'drop-shadow(0 0 14px rgba(255,255,255,0.6))' }} />
                        <div className="absolute inset-[3px] overflow-hidden" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: '#020617' }}>
                            <img src={getEquipmentById(drag.id)?.icon} alt="" className="w-full h-full object-cover" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
