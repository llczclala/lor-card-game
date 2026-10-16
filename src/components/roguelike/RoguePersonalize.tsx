// ==========================================
// 悖论迷宫 · 个性化界面
// [2026-08-13 莉莉子] 照搬 PVE DeckBuilder「枢纽详情」三翼布局：
//   左卡牌列表（只读 + 悬停大图检视）| 中牌组图标（DeckDiorama）| 右卡背/牌桌个性化
//   去除：开始游戏 / AI 难度 / 牌库删除
//   编辑按钮仅开发者账号可见（编辑肉鸽初始牌组）
// ==========================================
import React, { useState, useMemo } from 'react';
import { Plus, X, Pencil } from 'lucide-react';
import { CARD_DB } from '../../data/cards';
import { buildStarterDeck, isStaleRogueStarterDeck } from '../../data/roguelike/rogueStarterDecks';
import { PERSONALIZATION_ASSETS, getSkinImage } from '../../data/imageData';
import { StyleSelector } from '../StyleSelector';
import { DeskMedia } from '../DeskMedia'; // [2026-08-13] 动态牌桌媒体组件
import { useCardGaze } from '../../hooks/useCardGaze';
import { FloatingCardPreview } from '../FloatingCardPreview';
import { eventBus, GameEvents } from '../../utils/eventBus';
import type { CardData } from '../../types'; // [2026-10-15 莉莉子 · 触屏] 详情入口的 state 类型
import { FullArtOverlay } from '../Overlays'; // [2026-10-15 莉莉子 · 触屏] 触屏详情入口（本项目既有惯例：本地 viewCard + FullArtOverlay）
// [2026-10-15 莉莉子] 牌组「立体盒子」尺寸改为**共享常量**（原先照搬 DeckBuilder 各留一份）
import { DIORAMA_SIZE } from '../dioramaSpacing';

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 天启者配置 · **个性化页**（`RoguePersonalize`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一页 = 「悖论迷宫 · 天启者配置」的**个性化**页签内容（外壳在 `RogueHeroSelect.tsx` 的 `ROGUE_HERO_UI`）。
// 画面从上到下 / 从左到右：①整页三翼布局 ②左翼卡组预览列表 ③中翼牌组立体图标 ④右翼定制面板
//   ⑤右上角关闭按钮 ⑥悬停大图检视。
// 📌 单位一律 **px**（原 Tailwind 值 ×4：p-3=12 p-4=16 p-5=20 p-6=24 gap-2=8 gap-3=12 gap-4=16
//    gap-6=24 gap-10=40 h-10=40 h-12=48 w-6=24 w-32=128 text-xs=12 text-sm=14 rounded-lg=8
//    rounded-xl=12 rounded-2xl=16 rounded-3xl=24 px-6=24 py-2=8）。
// ⚠️ 中翼那个「立体盒子」本体的宽高**不在这里** —— 它走共享常量 `./dioramaSpacing` 的 `DIORAMA_SIZE`
//    （2026-10-15 已统一，本文件不再各留一份，见下方 `getDeckCovers` 上方的注释）。
// ⚠️ 字号**只搬 `fontSize`，行高交给继承的 1.5** —— 这是项目惯例（`STYLE_UI` 的 20 个字号项都这样，
//    第 7 轮审查已把继承 1.5 算进布局数学）。
//    🔴 **不要**给字号配写死的 `lineHeight`：程会把字号成倍调大，写死行高会**压字**；
//    继承 1.5 是随字号等比走的，怎么调都不会重叠。（2026-10-16 子智能体曾成对搬行高，已按此改正。）
// ══════════════════════════════════════════════════════════════════════
export const PERSONALIZE_UI = {
    // ══ ① 整页：三翼布局 ══
    /** 左翼 ↔ 中翼 ↔ 右翼 的横向间距 px（原 gap-6 = 24） */
    rootGap: 24,

    // ══ ② 左翼：卡组预览列表面板 ══
    /** 面板宽度 px（原 w-80 = 320） */
    leftPanelWidth: 320,
    /** 面板高度 px（原 h-[560px] = 560） */
    leftPanelHeight: 560,
    /** 面板圆角 px（原 rounded-3xl = 24） */
    leftPanelRadius: 24,
    /** 面板边框宽度 px（原 border = 1） */
    leftPanelBorderWidth: 1,
    /** 面板与中翼的右间距 px（原 mr-6 = 24） */
    leftPanelMarginRight: 24,
    /** 标题栏内边距 px（原 p-5 = 20；左右两个面板标题栏共用） */
    panelHeaderPad: 20,
    /** 标题栏下边框宽度 px（原 border-b = 1；左右两个面板标题栏共用） */
    panelHeaderBorderBottomWidth: 1,
    /** 列表上下渐隐遮罩高度 px（原 h-10 = 40；上、下两处共用） */
    listFadeHeight: 40,
    /** 列表左右内边距 px（原 px-4 = 16） */
    listPadX: 16,
    /** 列表上下内边距 px（原 py-8 = 32） */
    listPadY: 32,
    /** 卡牌行高 px（原 h-12 = 48） */
    cardRowHeight: 48,
    /** 卡牌行圆角 px（原 rounded-lg = 8） */
    cardRowRadius: 8,
    /** 卡牌行边框宽度 px（原 border = 1） */
    cardRowBorderWidth: 1,
    /** 卡牌行左右内边距 px（原 px-3 = 12） */
    cardRowPadX: 12,
    /** 费用圆 ↔ 卡名 的间距 px（原 gap-3 = 12） */
    costNameGap: 12,
    /** 费用圆直径 px（原 w-6 h-6 = 24） */
    costBadgeSize: 24,
    /** 费用圆全圆角 px（原 rounded-full = 9999） */
    costBadgeRadius: 9999,
    /** 费用数字字号 px（原 text-xs = 12） */
    costBadgeFontSize: 12,
    /** 费用数字行高（原 text-xs 自带 line-height = 16） */
    /** 费用圆边框宽度 px（原 border = 1） */
    costBadgeBorderWidth: 1,
    /** 卡名字号 px（原 text-sm = 14） */
    cardNameFontSize: 14,
    /** 卡名行高（原 text-sm 自带 line-height = 20） */
    /** 卡名宽度 px（原 w-32 = 128） */
    cardNameWidth: 128,
    /** 张数「xN」字号 px（原 text-sm = 14） */
    cardCountFontSize: 14,
    /** 张数「xN」行高（原 text-sm 自带 line-height = 20） */
    /** 底部编辑栏内边距 px（原 p-4 = 16） */
    footerPad: 16,
    /** 底部编辑栏上边框宽度 px（原 border-t = 1） */
    footerBorderTopWidth: 1,
    /** 编辑按钮内边距 px（原 p-4 = 16） */
    editButtonPad: 16,
    /** 编辑按钮圆角 px（原 rounded-xl = 12） */
    editButtonRadius: 12,
    /** 编辑按钮「图标 ↔ 文字」间距 px（原 gap-2 = 8） */
    editButtonGap: 8,
    /** 编辑按钮铅笔图标 px（原 `<Pencil size={16} />`） */
    pencilIconSize: 16,
    /** 只读态提示框内边距 px（原 p-4 = 16） */
    readonlyPad: 16,
    /** 只读态提示框圆角 px（原 rounded-xl = 12） */
    readonlyRadius: 12,

    // ══ ③ 中翼：牌组立体图标（DeckDiorama）══
    // ⚠️ 立体盒子本体宽高仍走共享常量 `DIORAMA_SIZE`，**本块不重复造**。
    /** 空卡组占位框圆角 px（原 rounded-2xl = 16） */
    placeholderRadius: 16,
    /** 空卡组占位框边框宽度 px（原 border-4 = 4；配 border-dashed） */
    placeholderBorderWidth: 4,
    /** 空卡组「+」图标 px（原 `<Plus size={48} />`） */
    placeholderIconSize: 48,
    /** 「+」图标与「新卡组」文字的间距 px（原 mb-4 = 16） */
    placeholderIconMarginBottom: 16,
    /** 棋盘背板圆角 px（原 rounded-xl = 12） */
    boardRadius: 12,
    /** 棋盘背板边框宽度 px（原 border = 1） */
    boardBorderWidth: 1,
    /** 三张扇面卡圆角 px（原 rounded-xl = 12） */
    fanCardRadius: 12,
    /** 三张扇面卡边框宽度 px（原 border-2 = 2） */
    fanCardBorderWidth: 2,
    /** 右下卡背堆叠底衬圆角 px（原 rounded-xl = 12） */
    stackRadius: 12,
    /** 右下卡背堆叠底衬边框宽度 px（原 border = 1） */
    stackBorderWidth: 1,
    /** 卡背堆叠顶层圆角 px（原 rounded-xl = 12） */
    stackTopRadius: 12,
    /** 卡背堆叠顶层边框宽度 px（原 border-2 = 2） */
    stackTopBorderWidth: 2,
    /** 铭牌左右内边距 px（原 px-6 = 24） */
    nameplatePadX: 24,
    /** 铭牌上下内边距 px（原 py-2 = 8） */
    nameplatePadY: 8,
    /** 铭牌全圆角 px（原 rounded-full = 9999） */
    nameplateRadius: 9999,
    /** 铭牌最小宽度 px（原 min-w-[160px] = 160） */
    nameplateMinWidth: 160,
    /** 铭牌边框宽度 px（原 border = 1） */
    nameplateBorderWidth: 1,
    /** 卡组名字号 px（原 text-sm = 14） */
    deckNameFontSize: 14,
    /** 卡组名行高（原 text-sm 自带 line-height = 20） */
    /** 「X 张」字号 px（原 text-[10px] = 10；任意值不带行高） */
    deckCountFontSize: 10,
    /** 中翼外框左右外边距 px（原 mx-6 = 24） */
    dioramaWrapMarginX: 24,

    // ══ ④ 右翼：定制面板（卡背 / 牌桌）══
    /** 面板宽度 px（原 w-72 = 288） */
    rightPanelWidth: 288,
    /** 面板底部内边距 px（原 pb-10 = 40） */
    rightPanelPadBottom: 40,
    /** 面板圆角 px（原 rounded-3xl = 24） */
    rightPanelRadius: 24,
    /** 面板边框宽度 px（原 border = 1） */
    rightPanelBorderWidth: 1,
    /** 面板与中翼的左间距 px（原 ml-6 = 24） */
    rightPanelMarginLeft: 24,
    /** 「定制」标题栏与内容的下间距 px（原 mb-4 = 16） */
    rightPanelHeaderMarginBottom: 16,
    /** 两个定制块之间的纵向间距 px（原 gap-10 = 40） */
    customizeBlockGap: 40,
    /** 定制内容区左右内边距 px（原 px-6 = 24） */
    customizePadX: 24,
    /** 「卡背」/「牌桌」小标签字号 px（原 text-xs = 12；两个标签共用） */
    selectorLabelFontSize: 12,
    /** 「卡背」/「牌桌」小标签行高（原 text-xs 自带 line-height = 16；两个标签共用） */
    /** 标签 ↔ 缩略图 的间距 px（原 gap-4 = 16；两个块共用） */
    selectorBlockGap: 16,
    /** 卡背缩略图宽 px（原 w-32 = 128） */
    cardBackThumbWidth: 128,
    /** 卡背缩略图高 px（原 h-48 = 192） */
    cardBackThumbHeight: 192,
    /** 牌桌缩略图宽 px（原 w-48 = 192） */
    deskThumbWidth: 192,
    /** 牌桌缩略图高 px（原 h-28 = 112） */
    deskThumbHeight: 112,
    /** 缩略图圆角 px（原 rounded-lg = 8；两个缩略图共用） */
    thumbRadius: 8,
    /** 缩略图边框宽度 px（原 border-2 = 2；两个缩略图共用） */
    thumbBorderWidth: 2,

    // ── 右翼：悬停大图预览（绝对定位在面板右侧外）──
    /** 预览暗底圆角 px（原 rounded-xl = 12） */
    previewBackdropRadius: 12,
    /** 预览暗底向外扩出的负外边距 px（原 -m-4 = -16） */
    previewBackdropMargin: -16,
    /** 预览框圆角 px（原 rounded-lg = 8） */
    previewRadius: 8,
    /** 预览框边框宽度 px（原 border-2 = 2） */
    previewBorderWidth: 2,
    /** 卡背预览宽 px（原 w-[240px] = 240） */
    previewCardBackWidth: 240,
    /** 卡背预览高 px（原 h-[360px] = 360） */
    previewCardBackHeight: 360,
    /** 牌桌预览宽 px（原 w-[400px] = 400） */
    previewDeskWidth: 400,
    /** 牌桌预览高 px（原 h-[225px] = 225） */
    previewDeskHeight: 225,
    /** 「PREVIEW」条上下内边距 px（原 py-1 = 4） */
    previewLabelPadY: 4,
    /** 「PREVIEW」字号 px（原 text-xs = 12） */
    previewLabelFontSize: 12,
    /** 「PREVIEW」行高（原 text-xs 自带 line-height = 16） */

    // ══ ⑤ 关闭按钮（右上角悬浮）══
    /** 内边距 px（原 p-3 = 12） */
    closeButtonPad: 12,
    /** 全圆角 px（原 rounded-full = 9999） */
    closeButtonRadius: 9999,
    /** 边框宽度 px（原 border = 1） */
    closeButtonBorderWidth: 1,
    /** 「×」图标 px（原 `<X size={24} />`） */
    closeIconSize: 24,

    // ══ ⑥ 悬停大图检视（FloatingCardPreview）══
    /** 悬停大图放大倍数（原 `scale={1.25}`） */
    floatingPreviewScale: 1.25,
} as const;

// ── 牌组图标尺寸：已改为共享常量 ──
//   ⚠️ [2026-10-15 莉莉子] 原先这里「照搬 DeckBuilder」各留一份 ⇒ 改一处不生效另一处。
//      现在统一走 `./dioramaSpacing`（与本文件完全一致的那一份）。
// ── 封面提取（照搬 DeckBuilder）──
const getDeckCovers = (cards: Record<string, number>, skinOverrides?: Record<string, number>): { url: string; skinId: number; isBack: boolean }[] => {
    const cardKeys = Object.keys(cards);
    if (cardKeys.length === 0) return [
        { url: 'CARD_BACK', skinId: 0, isBack: true },
        { url: 'CARD_BACK', skinId: 0, isBack: true },
        { url: 'CARD_BACK', skinId: 0, isBack: true },
    ];
    const sorted = cardKeys.sort((a, b) => {
        const cardA = CARD_DB[a];
        const cardB = CARD_DB[b];
        if (!cardA || !cardB) return 0;
        if (cardA.isChampion !== cardB.isChampion) return cardA.isChampion ? -1 : 1;
        if (cards[a] !== cards[b]) return cards[b] - cards[a];
        const isUnitA = cardA.type.includes('unit');
        const isUnitB = cardB.type.includes('unit');
        if (isUnitA !== isUnitB) return isUnitA ? -1 : 1;
        return 0;
    });
    return sorted.slice(0, 3).map(key => {
        const skin = getSkinImage(key, skinOverrides?.[key] || 0);
        return { url: skin || CARD_DB[key].imageUrl, skinId: skinOverrides?.[key] || 0, isBack: false };
    });
};

// ── 牌组图标微缩景观（照搬 DeckBuilder，肉鸽版铭牌显示「X 张」）──
const DeckDiorama = ({ deck, covers, cardBackImg, boardImg }: any) => {
    if (deck.isNew) {
        return (
            <div className={`relative ${DIORAMA_SIZE.containerWidth} ${DIORAMA_SIZE.containerHeight} flex flex-col items-center justify-center transition-all duration-500 scale-100 opacity-100 z-40`}>
                <div
                    className="absolute inset-0 border-dashed border-gray-600/50 bg-slate-800/30 flex flex-col items-center justify-center"
                    style={{
                        borderRadius: PERSONALIZE_UI.placeholderRadius,
                        borderWidth: PERSONALIZE_UI.placeholderBorderWidth,
                        borderStyle: 'dashed',
                    }}
                >
                    <Plus
                        size={PERSONALIZE_UI.placeholderIconSize}
                        className="text-gray-600"
                        style={{ marginBottom: PERSONALIZE_UI.placeholderIconMarginBottom }}
                    />
                    <span className="font-bold tracking-widest text-gray-500">新卡组</span>
                </div>
            </div>
        );
    }

    const cardCount: number = (Object.values(deck.cards ?? {}) as number[]).reduce((a: number, b: number) => a + b, 0);

    return (
        <div className={`relative ${DIORAMA_SIZE.containerWidth} ${DIORAMA_SIZE.containerHeight} transition-all duration-500 scale-100 opacity-100 z-40`}>
            {/* 底层大棋盘背景 */}
            <div
                className={`${DIORAMA_SIZE.boardWidth} ${DIORAMA_SIZE.boardHeight} absolute top-4 left-1/2 -translate-x-1/2 overflow-hidden border-slate-700/80 shadow-2xl z-0`}
                style={{
                    borderRadius: PERSONALIZE_UI.boardRadius,
                    borderWidth: PERSONALIZE_UI.boardBorderWidth,
                    borderStyle: 'solid',
                }}
            >
                <img src={boardImg} className="w-full h-full object-cover opacity-80" alt="棋盘" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent"></div>
            </div>

            {/* 左侧扇形核心三卡 */}
            <div className="absolute top-12 left-6 z-20 pointer-events-none">
                {covers.map((cover: { url: string; skinId: number; isBack: boolean }, i: number) => {
                    const rotations = [-16, 0, 16];
                    const translatesX = [0, 24, 48];
                    const translatesY = [12, 0, 12];
                    const zIndexes = [25, 23, 21];
                    const isBack = cover.isBack;
                    const renderUrl = isBack ? cardBackImg : cover.url;
                    return (
                        <div
                            key={i}
                            className={`${DIORAMA_SIZE.cardWidth} ${DIORAMA_SIZE.cardHeight} absolute shadow-[5px_5px_15px_rgba(0,0,0,0.6)] overflow-hidden ${isBack ? 'border-slate-800/80 bg-slate-900' : 'border-slate-800 bg-slate-950'}`}
                            style={{
                                transform: `translateX(${translatesX[i]}px) translateY(${translatesY[i]}px) rotate(${rotations[i]}deg)`,
                                zIndex: zIndexes[i],
                                borderRadius: PERSONALIZE_UI.fanCardRadius,
                                borderWidth: PERSONALIZE_UI.fanCardBorderWidth,
                                borderStyle: 'solid',
                            }}
                        >
                            {!isBack && (
                                <div className={`absolute inset-0 bg-gradient-to-b pointer-events-none z-0 ${cover.skinId > 0 ? 'from-yellow-600/40 via-yellow-500/20 to-yellow-300/5' : 'from-gray-300/40 via-gray-200/20 to-white/5'}`}></div>
                            )}
                            <img src={renderUrl} className={`w-full h-full object-cover relative z-10 ${isBack ? 'opacity-90 mix-blend-luminosity' : ''}`} alt={isBack ? "Card Back Fill" : "Hero Front"} />
                            {isBack && <div className="absolute inset-0 bg-black/40 mix-blend-multiply z-20"></div>}
                        </div>
                    );
                })}
            </div>

            {/* 右下角卡背堆叠 */}
            <div className={`absolute bottom-6 right-6 ${DIORAMA_SIZE.cardWidth} ${DIORAMA_SIZE.cardHeight} z-30 pointer-events-none`} style={{ transform: 'rotate(10deg) translate(20px, 12px)' }}>
                {[2, 1, 0].map(i => (
                    <div
                        key={i}
                        className="absolute inset-0 bg-slate-950 border-slate-900 shadow-md"
                        style={{
                            transform: `translate(-${i * 3}px, -${i * 3}px)`,
                            zIndex: i === 0 ? 10 : 5 - i,
                            borderRadius: PERSONALIZE_UI.stackRadius,
                            borderWidth: PERSONALIZE_UI.stackBorderWidth,
                            borderStyle: 'solid',
                        }}
                    ></div>
                ))}
                <div
                    className="absolute inset-0 border-slate-600 shadow-2xl overflow-hidden z-10"
                    style={{
                        borderRadius: PERSONALIZE_UI.stackTopRadius,
                        borderWidth: PERSONALIZE_UI.stackTopBorderWidth,
                        borderStyle: 'solid',
                    }}
                >
                    <img src={cardBackImg} className="w-full h-full object-cover" alt="卡背" />
                </div>
            </div>

            {/* 信息铭牌（肉鸽版：X 张） */}
            <div
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-slate-950/95 border-slate-800/80 z-40 flex flex-col items-center shadow-2xl backdrop-blur-md whitespace-nowrap"
                style={{
                    paddingLeft: PERSONALIZE_UI.nameplatePadX,
                    paddingRight: PERSONALIZE_UI.nameplatePadX,
                    paddingTop: PERSONALIZE_UI.nameplatePadY,
                    paddingBottom: PERSONALIZE_UI.nameplatePadY,
                    borderRadius: PERSONALIZE_UI.nameplateRadius,
                    minWidth: PERSONALIZE_UI.nameplateMinWidth,
                    borderWidth: PERSONALIZE_UI.nameplateBorderWidth,
                    borderStyle: 'solid',
                }}
            >
                <span className="text-white font-black truncate w-full text-center tracking-wide" style={{ fontSize: PERSONALIZE_UI.deckNameFontSize }}>{deck.name}</span>
                <span className="font-mono font-bold tracking-widest text-purple-300" style={{ fontSize: PERSONALIZE_UI.deckCountFontSize }}>{cardCount} 张</span>
            </div>
        </div>
    );
};

interface RoguePersonalizeProps {
    heroKey: string;
    userSystem: any;
    onEditDeck: (heroKey: string) => void; // [2026-08-13] 编辑肉鸽初始牌组（仅开发者可见按钮触发）
}

export const RoguePersonalize: React.FC<RoguePersonalizeProps> = ({ heroKey, userSystem, onEditDeck }) => {
    const heroName = CARD_DB[heroKey]?.name ?? heroKey;

    // [2026-08-13] 数据源：userSystem 中注册的肉鸽初始牌组（开发者编辑过）优先，否则 buildStarterDeck 默认
    // [2026-09-09 净化] 卡组组成过时（isStaleRogueStarterDeck）→ 展示用官方默认组成，但保留该卡组自身的
    // 个性化字段（卡背/牌桌/皮肤/名字等）——净化只改组成、不写本地存档、不动个性化配置。
    const deck = useMemo(() => {
        const existing = userSystem.decks?.find((d: any) => d.id === `rogue_starter_${heroKey}`);
        const stale = existing ? isStaleRogueStarterDeck(heroKey, existing.cards) : false;
        let cards = (!existing || stale) ? null : existing.cards;
        if (!cards) {
            const starter = buildStarterDeck(heroKey);
            const c: Record<string, number> = {};
            starter.forEach(k => { c[k] = (c[k] || 0) + 1; });
            cards = c;
        }
        return {
            id: `rogue_starter_${heroKey}`,
            name: existing?.name ?? `肉鸽·${heroName}`,
            hero: heroKey,
            cards,
            skinOverrides: existing?.skinOverrides ?? {},
            createdAt: existing?.createdAt ?? 0,
            updatedAt: existing?.updatedAt ?? 0,
            cardBackIndex: existing?.cardBackIndex ?? userSystem.settings?.customization?.currentCardBackIndex,
            boardIndex: existing?.boardIndex ?? userSystem.settings?.customization?.currentDeskIndex,
        };
    }, [heroKey, heroName, userSystem.decks, userSystem.settings]);

    const covers = useMemo(() => getDeckCovers(deck.cards, deck.skinOverrides), [deck]);
    const cardBackImg = PERSONALIZATION_ASSETS.cardBacks[deck.cardBackIndex ?? userSystem.settings?.customization?.currentCardBackIndex ?? 0];
    const boardImg = PERSONALIZATION_ASSETS.desks[deck.boardIndex ?? userSystem.settings?.customization?.currentDeskIndex ?? 0];

    // 悬停大图检视
    const { gazeTarget, bindGazeEvents, dismissGaze } = useCardGaze({ delay: 250 });
    // [2026-10-15 莉莉子 · 触屏] 触屏长按 → 浮层「📖 详情」的落点（触屏没有右键）
    const [viewCard, setViewCard] = useState<CardData | null>(null);

    // 右侧个性化选择器
    const [selectorType, setSelectorType] = useState<'cardBack' | 'desk' | null>(null);
    const [hubHoverItem, setHubHoverItem] = useState<'cardBack' | 'desk' | null>(null);

    // 是否开发者账号（编辑按钮仅 dev 可见）
    const isDev = userSystem.userId === 'dev_full_admin';

    // 更新个性化（卡背/牌桌）→ 注册并保存到 userSystem 肉鸽牌组
    const updateCustomization = (patch: Partial<{ cardBackIndex: number; boardIndex: number }>) => {
        userSystem.saveDeck({ ...deck, ...patch });
    };

    return (
        <div className="relative flex items-center justify-center h-full min-h-0" style={{ gap: PERSONALIZE_UI.rootGap }}>
            {/* 左翼：卡牌列表只读预览（悬停大图检视） */}
            <div
                className="bg-slate-900/90 border-white/10 flex flex-col shadow-[0_30px_60px_rgba(0,0,0,0.8)] relative overflow-hidden"
                style={{
                    width: PERSONALIZE_UI.leftPanelWidth,
                    height: PERSONALIZE_UI.leftPanelHeight,
                    borderRadius: PERSONALIZE_UI.leftPanelRadius,
                    borderWidth: PERSONALIZE_UI.leftPanelBorderWidth,
                    borderStyle: 'solid',
                    marginRight: PERSONALIZE_UI.leftPanelMarginRight,
                }}
            >
                <div
                    className="bg-black/40 font-black text-gray-400 tracking-[0.3em] text-center border-white/10 shrink-0 z-20"
                    style={{ padding: PERSONALIZE_UI.panelHeaderPad, borderBottomWidth: PERSONALIZE_UI.panelHeaderBorderBottomWidth, borderStyle: 'solid' }}
                >卡组预览</div>
                <div className="flex-1 relative overflow-hidden bg-slate-950">
                    <div className="absolute top-0 left-0 w-full bg-gradient-to-b from-slate-950 via-slate-950/80 to-transparent z-10 pointer-events-none" style={{ height: PERSONALIZE_UI.listFadeHeight }}></div>
                    {/* ⚠️ 这里保留 Tailwind 的 `space-y-2`（= 8px），未改成 flex+gap：
                        列方向 flex 会压扁定高行、把滚动区搞坏，收益不值得（见本轮约定）。 */}
                    <div
                        className="h-full overflow-y-auto space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                        style={{ paddingLeft: PERSONALIZE_UI.listPadX, paddingRight: PERSONALIZE_UI.listPadX, paddingTop: PERSONALIZE_UI.listPadY, paddingBottom: PERSONALIZE_UI.listPadY }}
                    >
                        {Object.entries(deck.cards).map(([key, count]: any) => {
                            const card = CARD_DB[key];
                            if (!card) return null;
                            const fullCard = { ...card, id: key, strikeCount: 0, animState: 'idle' as const, damageTaken: 0, buffs: { power: 0, health: 0 } };
                            return (
                                <div
                                    key={key}
                                    className="relative flex items-center bg-gray-800/90 border-gray-700/60 hover:border-blue-500 overflow-hidden cursor-help"
                                    style={{
                                        height: PERSONALIZE_UI.cardRowHeight,
                                        borderRadius: PERSONALIZE_UI.cardRowRadius,
                                        borderWidth: PERSONALIZE_UI.cardRowBorderWidth,
                                        borderStyle: 'solid',
                                    }}
                                    {...bindGazeEvents(fullCard)}
                                >
                                    <div className="absolute inset-0 opacity-40 bg-cover bg-center" style={{ backgroundImage: `url(${getSkinImage(key, deck.skinOverrides?.[key] || 0) || card.imageUrl})` }}></div>
                                    <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent"></div>
                                    <div className="absolute inset-0 flex items-center justify-between" style={{ paddingLeft: PERSONALIZE_UI.cardRowPadX, paddingRight: PERSONALIZE_UI.cardRowPadX }}>
                                        <div className="flex items-center" style={{ gap: PERSONALIZE_UI.costNameGap }}>
                                            <span
                                                className="bg-blue-900 flex justify-center items-center font-bold border-blue-500 text-blue-200"
                                                style={{
                                                    width: PERSONALIZE_UI.costBadgeSize,
                                                    height: PERSONALIZE_UI.costBadgeSize,
                                                    borderRadius: PERSONALIZE_UI.costBadgeRadius,
                                                    fontSize: PERSONALIZE_UI.costBadgeFontSize,
                                                    borderWidth: PERSONALIZE_UI.costBadgeBorderWidth,
                                                    borderStyle: 'solid',
                                                }}
                                            >{card.cost}</span>
                                            <span className="font-bold truncate drop-shadow-md" style={{ fontSize: PERSONALIZE_UI.cardNameFontSize, width: PERSONALIZE_UI.cardNameWidth }}>{card.name}</span>
                                        </div>
                                        <span className="text-yellow-400 font-black" style={{ fontSize: PERSONALIZE_UI.cardCountFontSize }}>x{count}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent z-10 pointer-events-none" style={{ height: PERSONALIZE_UI.listFadeHeight }}></div>
                </div>
                {/* [2026-08-13] 底部：编辑按钮（仅开发者账号可见） */}
                <div className="shrink-0 border-white/10 bg-black/40 z-20" style={{ padding: PERSONALIZE_UI.footerPad, borderTopWidth: PERSONALIZE_UI.footerBorderTopWidth, borderStyle: 'solid' }}>
                    {isDev ? (
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onEditDeck(heroKey); }}
                            className="w-full bg-blue-900 hover:bg-blue-600 text-white font-black tracking-widest transition-all flex items-center justify-center"
                            style={{ padding: PERSONALIZE_UI.editButtonPad, borderRadius: PERSONALIZE_UI.editButtonRadius, gap: PERSONALIZE_UI.editButtonGap }}
                        >
                            <Pencil size={PERSONALIZE_UI.pencilIconSize} /> 编辑肉鸽初始牌组
                        </button>
                    ) : (
                        <div className="w-full bg-slate-800/60 text-gray-500 font-bold tracking-widest text-center" style={{ padding: PERSONALIZE_UI.readonlyPad, borderRadius: PERSONALIZE_UI.readonlyRadius }}>初始牌组（只读）</div>
                    )}
                </div>
            </div>

            {/* 中翼：牌组图标（DeckDiorama） */}
            <div className="flex flex-col items-center z-50" style={{ marginLeft: PERSONALIZE_UI.dioramaWrapMarginX, marginRight: PERSONALIZE_UI.dioramaWrapMarginX }}>
                <DeckDiorama
                    deck={deck}
                    covers={covers}
                    cardBackImg={cardBackImg}
                    boardImg={boardImg}
                />
            </div>

            {/* 右翼：卡背 / 牌桌个性化 */}
            <div
                className="h-fit bg-[#1e293b]/90 border-white/10 flex flex-col shadow-2xl relative overflow-visible backdrop-blur-md z-40"
                style={{
                    width: PERSONALIZE_UI.rightPanelWidth,
                    paddingBottom: PERSONALIZE_UI.rightPanelPadBottom,
                    borderRadius: PERSONALIZE_UI.rightPanelRadius,
                    borderWidth: PERSONALIZE_UI.rightPanelBorderWidth,
                    borderStyle: 'solid',
                    marginLeft: PERSONALIZE_UI.rightPanelMarginLeft,
                }}
            >
                <div
                    className="bg-black/40 font-black text-gray-400 tracking-[0.3em] text-center border-white/10 shrink-0"
                    style={{
                        padding: PERSONALIZE_UI.panelHeaderPad,
                        borderBottomWidth: PERSONALIZE_UI.panelHeaderBorderBottomWidth,
                        borderStyle: 'solid',
                        marginBottom: PERSONALIZE_UI.rightPanelHeaderMarginBottom,
                    }}
                >定制</div>
                <div className="flex-1 flex flex-col justify-center items-center relative" style={{ gap: PERSONALIZE_UI.customizeBlockGap, paddingLeft: PERSONALIZE_UI.customizePadX, paddingRight: PERSONALIZE_UI.customizePadX }}>
                    {/* 悬停预览（卡背/牌桌大图） */}
                    {hubHoverItem && (
                        <div className="absolute left-[105%] top-1/2 -translate-y-1/2 pointer-events-none animate-fade-in z-50">
                            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" style={{ borderRadius: PERSONALIZE_UI.previewBackdropRadius, margin: PERSONALIZE_UI.previewBackdropMargin }}></div>
                            <div
                                className="relative border-orange-500/50 overflow-hidden shadow-2xl"
                                style={{
                                    borderRadius: PERSONALIZE_UI.previewRadius,
                                    borderWidth: PERSONALIZE_UI.previewBorderWidth,
                                    borderStyle: 'solid',
                                    width: hubHoverItem === 'cardBack' ? PERSONALIZE_UI.previewCardBackWidth : PERSONALIZE_UI.previewDeskWidth,
                                    height: hubHoverItem === 'cardBack' ? PERSONALIZE_UI.previewCardBackHeight : PERSONALIZE_UI.previewDeskHeight,
                                }}
                            >
                                {hubHoverItem === 'cardBack' ? (
                                    <img src={cardBackImg} className="w-full h-full object-cover" alt="预览" />
                                ) : (
                                    <DeskMedia deskIndex={deck.boardIndex ?? userSystem.settings?.customization?.currentDeskIndex ?? 0} dynamic={(userSystem.settings as any)?.deskDynamic} className="w-full h-full object-cover" />
                                )}
                                <div
                                    className="absolute bottom-0 w-full bg-black/60 text-white text-center font-mono tracking-widest backdrop-blur-sm"
                                    style={{ fontSize: PERSONALIZE_UI.previewLabelFontSize, paddingTop: PERSONALIZE_UI.previewLabelPadY, paddingBottom: PERSONALIZE_UI.previewLabelPadY }}
                                >PREVIEW</div>
                            </div>
                        </div>
                    )}

                    {/* 卡背更换大按钮 */}
                    <div className="flex flex-col items-center w-full" style={{ gap: PERSONALIZE_UI.selectorBlockGap }}>
                        <span className="text-yellow-600 font-bold tracking-widest uppercase" style={{ fontSize: PERSONALIZE_UI.selectorLabelFontSize }}>卡背</span>
                        <div
                            className="relative group cursor-pointer"
                            onMouseEnter={() => setHubHoverItem('cardBack')}
                            onMouseLeave={() => setHubHoverItem(null)}
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setSelectorType('cardBack'); }}
                        >
                            <div
                                className="overflow-hidden border-white/20 shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-[15deg] group-hover:border-orange-500 group-hover:shadow-[0_0_20px_orange] z-10 relative bg-black"
                                style={{
                                    width: PERSONALIZE_UI.cardBackThumbWidth,
                                    height: PERSONALIZE_UI.cardBackThumbHeight,
                                    borderRadius: PERSONALIZE_UI.thumbRadius,
                                    borderWidth: PERSONALIZE_UI.thumbBorderWidth,
                                    borderStyle: 'solid',
                                }}
                            >
                                <img src={cardBackImg} className="w-full h-full object-cover" alt="卡背" />
                            </div>
                        </div>
                    </div>

                    {/* 棋盘桌垫更换大按钮 */}
                    <div className="flex flex-col items-center w-full" style={{ gap: PERSONALIZE_UI.selectorBlockGap }}>
                        <span className="text-yellow-600 font-bold tracking-widest uppercase" style={{ fontSize: PERSONALIZE_UI.selectorLabelFontSize }}>牌桌</span>
                        <div
                            className="relative group cursor-pointer"
                            onMouseEnter={() => setHubHoverItem('desk')}
                            onMouseLeave={() => setHubHoverItem(null)}
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setSelectorType('desk'); }}
                        >
                            <div
                                className="overflow-hidden border-white/20 shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:-rotate-[15deg] group-hover:border-orange-500 group-hover:shadow-[0_0_20px_orange] z-10 relative bg-black"
                                style={{
                                    width: PERSONALIZE_UI.deskThumbWidth,
                                    height: PERSONALIZE_UI.deskThumbHeight,
                                    borderRadius: PERSONALIZE_UI.thumbRadius,
                                    borderWidth: PERSONALIZE_UI.thumbBorderWidth,
                                    borderStyle: 'solid',
                                }}
                            >
                                <DeskMedia deskIndex={deck.boardIndex ?? userSystem.settings?.customization?.currentDeskIndex ?? 0} dynamic={(userSystem.settings as any)?.deskDynamic} className="w-full h-full object-cover" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 悬停大图预览 */}
            <FloatingCardPreview gazeTarget={gazeTarget} mode="follow" scale={PERSONALIZE_UI.floatingPreviewScale} interactive
                onMouseEnter={() => {}}
                onMouseLeave={() => {}}
                // [2026-10-15 莉莉子 · 触屏] 详情入口。
                //   ⚠️ 独立审查指出：本处是全项目唯一 `interactive` 的 follow 浮层，
                //   所以补 onViewArt 会**同时改变 PC 右键语义** —— PC 上右键这张悬停大图
                //   从「无反应」变成「打开详情」。这是**刻意接受**的：与既有
                //   DeckBuilder:1071 / EnemyDeckEditor:806 的行为一致（那两处也是 interactive + onViewArt）。
                onViewArt={(c) => { dismissGaze(); setViewCard(c); }}
            />

            {/* [2026-10-15 莉莉子 · 触屏] 触屏详情入口（触屏没有右键） */}
            {viewCard && <FullArtOverlay card={viewCard} onClose={() => setViewCard(null)} />}

            {/* 卡背/牌桌选择器 */}
            {selectorType && (
                <div className="absolute inset-0 z-[300]">
                    <StyleSelector
                        type={selectorType}
                        currentSelected={selectorType === 'cardBack' ? (deck.cardBackIndex ?? userSystem.settings?.customization?.currentCardBackIndex ?? 0) : (deck.boardIndex ?? userSystem.settings?.customization?.currentDeskIndex ?? 0)}
                        unlockedIndices={selectorType === 'cardBack' ? userSystem.settings?.unlockedCardBacks : userSystem.settings?.unlockedDesks}
                        onSelect={(idx: number) => {
                            if (selectorType === 'cardBack') updateCustomization({ cardBackIndex: idx });
                            else updateCustomization({ boardIndex: idx });
                        }}
                        onClose={() => setSelectorType(null)}
                        deskDynamic={(userSystem.settings as any)?.deskDynamic} // [2026-08-13] 动态牌桌
                        cardBackDynamic={(userSystem.settings as any)?.cardBackDynamic} // [2026-08-23] 动态卡背
                    />
                </div>
            )}

            {/* 关闭按钮（右上角） */}
            <button
                onClick={() => { eventBus.emit(GameEvents.UI_BACK); setSelectorType(null); }}
                className="absolute top-8 right-8 text-gray-400 hover:text-white bg-white/5 border-white/10 transition-all hover:bg-red-500/80 z-50"
                style={{ borderWidth: PERSONALIZE_UI.closeButtonBorderWidth, borderStyle: 'solid', padding: PERSONALIZE_UI.closeButtonPad, borderRadius: PERSONALIZE_UI.closeButtonRadius }}
                title="关闭"
            >
                <X size={PERSONALIZE_UI.closeIconSize} />
            </button>
        </div>
    );
};
