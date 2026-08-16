import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Zap, List as ListIcon, Play, Trash2, Wand2, Box, Save, Plus, ShoppingCart, Eraser, AlertTriangle, Filter, X, User, Palette, Shuffle, LayoutGrid, GalleryHorizontalEnd, BarChart3, Clock } from 'lucide-react';
import { CARD_DB } from '../data/cards';
import { KEYWORD_DB } from '../data/keywords';
import { PERSONALIZATION_ASSETS, SKIN_IMAGES, getSkinImage } from '../data/imageData'; // [皮肤检视] 引入 SKIN_IMAGES
import { DeskMedia } from './DeskMedia'; // [2026-08-13] 动态牌桌媒体组件（兜底静态图 + 日志）
import { Card } from './Card';
import type { CardData } from '../types';
import type { PoolId } from '../logic/gachaLogic'; // [2026-08-02] 卡池跳转
import { eventBus, GameEvents } from '../utils/eventBus';
import { FullArtOverlay } from './Overlays';
// [移除] 彻底废弃 PersonalizationDrawer 的引入
import { StyleSelector } from './StyleSelector'; // [核心新增] 直接复用原生的全屏选择器
import type { useUserSystem } from '../hooks/useUserSystem';
import { ArrowLeft, Home } from 'lucide-react'; // [新增]
// [新增] 悬停预览统一方案
import { useCardGaze } from '../hooks/useCardGaze';
import { FloatingCardPreview } from './FloatingCardPreview';



interface DeckBuilderProps {
    onStartGame: (deck: string[]) => void;
    userSystem: ReturnType<typeof useUserSystem>;
    onBack?: () => void;
    // [新增] 接收来源属性（[2026-08-13] 含肉鸽编辑来源）
    fromSource: 'lobby' | 'mode_select' | 'rogue_edit';
    // [2026-08-02] 卡牌详情页"前往卡池"回调
    onGachaNav?: (poolId: PoolId) => void;
    // [2026-08-06] 标准对战 AI 难度选择回调
    onDifficultyChange?: (d: 'easy' | 'normal' | 'hard') => void;
    // [2026-08-07] 备战界面直达大厅
    onBackToLobby?: () => void;
    // [2026-08-13] 个性化编辑：外部指定初始编辑牌组（进入即编辑，开发者专用）
    initialEditDeckId?: string | null;
}

// 转全量卡牌数据
const toFullCardData = (staticData: any): CardData => ({
    ...staticData,
    id: 'preview_id', // 虚拟 ID
    strikeCount: 0,
    animState: 'idle',
    damageTaken: 0,
    buffs: { power: 0, health: 0 }
});

// --- [重构] 封面计算工具函数 (获取优先级最高的3张卡) ---
// [皮肤修复] 新增 skinOverrides 参数，让大厅封面也能穿上皮肤
const getDeckCovers = (cards: Record<string, number>, skinOverrides?: Record<string, number>): { url: string; skinId: number; isBack: boolean }[] => {
    const cardKeys = Object.keys(cards);
    if (cardKeys.length === 0) return [
        { url: 'CARD_BACK', skinId: 0, isBack: true },
        { url: 'CARD_BACK', skinId: 0, isBack: true },
        { url: 'CARD_BACK', skinId: 0, isBack: true }
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

    const covers = sorted.slice(0, 3).map(k => {
        const skinId = skinOverrides?.[k] || 0;
        const url = getSkinImage(k, skinId) || CARD_DB[k]?.imageUrl || 'CARD_BACK';
        return {
            url,
            skinId,
            isBack: url === 'CARD_BACK'
        };
    });
    while (covers.length < 3) covers.push({ url: 'CARD_BACK', skinId: 0, isBack: true });
    return covers;
};

// =========================================================================
// [高级配置项暴露] 痛点 2 & 4：你可以在这里随意微调卡组图标在大厅中的全局高宽及卡牌疏密尺寸
// =========================================================================
const DIORAMA_SIZE = {
    containerWidth: 'w-72',    // 整体容器宽度 (从 w-64 放大到 w-72)
    containerHeight: 'h-96',   // 整体容器高度 (从 h-80 放大到 h-96)
    cardWidth: 'w-36',         // 正面/卡背卡牌的基础宽度 (放大至 w-36)
    cardHeight: 'h-52',        // 正面/卡背卡牌的基础高度 (放大至 w-52)
    boardWidth: 'w-[270px]',   // 背景棋盘的平面横向铺开宽度
    boardHeight: 'h-[160px]',  // 背景棋盘的平面横向铺开高度
};

// --- [重构] 商业级微缩景观牌组组件 (2.5D 平面写实拼贴) ---
const DeckDiorama = ({ deck, covers, cardBackImg, boardImg, isCenter = false, isHub = false, isGridView = false }: any) => {
    // 痛点 4：书橱模式下，所有牌组直接默认呈现“全亮、完全激活”的放大高精样式
    const isFullyActive = isGridView || isCenter || isHub;
    const scaleAndFocus = isFullyActive
        ? 'scale-100 opacity-100 z-40 filter drop-shadow-[0_15px_35px_rgba(0,0,0,0.7)]'
        : 'scale-75 opacity-25 pointer-events-none grayscale-[20%]';

    if (deck.isNew) {
        return (
            <div className={`relative ${DIORAMA_SIZE.containerWidth} ${DIORAMA_SIZE.containerHeight} flex flex-col items-center justify-center transition-all duration-500 ${scaleAndFocus}`}>
                <div className="absolute inset-0 rounded-2xl border-4 border-dashed border-gray-600/50 bg-slate-800/30 flex flex-col items-center justify-center transition-all hover:border-blue-400 hover:bg-blue-900/20">
                    <Plus size={48} className="text-gray-600 mb-4" />
                    <span className="font-bold tracking-widest text-gray-500">新卡组</span>
                </div>
                {isFullyActive && <div className="absolute inset-0 rounded-2xl bg-yellow-400/0 hover:bg-yellow-400/10 mix-blend-overlay transition-colors pointer-events-auto cursor-pointer z-50"></div>}
            </div>
        );
    }

    const cardCount: number = Object.values(deck.cards).reduce((a: any, b: any) => a + b, 0) as number; // [2026-08-16] reduce 推断 unknown，断言为 number

    return (
        <div className={`relative ${DIORAMA_SIZE.containerWidth} ${DIORAMA_SIZE.containerHeight} transition-all duration-500 ${scaleAndFocus}`}>
            {/* 1. 最底层大棋盘背景 (痛点 3：平铺展开于正背面，展现完整棋盘原画) */}
            <div className={`${DIORAMA_SIZE.boardWidth} ${DIORAMA_SIZE.boardHeight} absolute top-4 left-1/2 -translate-x-1/2 rounded-xl overflow-hidden border border-slate-700/80 shadow-2xl z-0`}>
                <img src={boardImg} className="w-full h-full object-cover opacity-80" alt="棋盘" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent"></div>
            </div>

            {/* 2. 左侧扇形核心三卡 (痛点 3：重排 Z 轴层级，封面 1 在最顶层，2 其次，3 在最底) */}
            <div className="absolute top-12 left-6 z-20 pointer-events-none">
                {covers.map((cover: { url: string; skinId: number; isBack: boolean }, i: number) => {
                    const rotations = [-16, 0, 16];
                    const translatesX = [0, 24, 48];
                    const translatesY = [12, 0, 12];
                    const zIndexes = [25, 23, 21];

                    const isBack = cover.isBack;
                    const renderUrl = isBack ? cardBackImg : cover.url;
                    const skinId = cover.skinId;

                    return (
                        <div
                            key={i}
                            // [核心修改] 强行追加 bg-slate-950 纯黑厚重底色，彻底建立物质边界，阻断底层棋盘穿透
                            className={`${DIORAMA_SIZE.cardWidth} ${DIORAMA_SIZE.cardHeight} absolute rounded-xl border-2 shadow-[5px_5px_15px_rgba(0,0,0,0.6)] overflow-hidden transition-all duration-500 ${isBack ? 'border-slate-800/80 bg-slate-900' : 'border-slate-800 bg-slate-950'}`}
                            style={{ transform: `translateX(${translatesX[i]}px) translateY(${translatesY[i]}px) rotate(${rotations[i]}deg)`, zIndex: zIndexes[i] }}
                        >
                            {/* [兜底环境光实装] */}
                            {!isBack && (
                                <div className={`absolute inset-0 bg-gradient-to-b pointer-events-none z-0 ${
                                    skinId > 0
                                        ? 'from-yellow-600/40 via-yellow-500/20 to-yellow-300/5'
                                        : 'from-gray-300/40 via-gray-200/20 to-white/5'
                                }`}></div>
                            )}
                            {/* 提升层级到 z-10 盖住光效 */}
                            <img src={renderUrl} className={`w-full h-full object-cover relative z-10 ${isBack ? 'opacity-90 mix-blend-luminosity' : ''}`} alt={isBack ? "Card Back Fill" : "Hero Front"} />
                            {isBack && <div className="absolute inset-0 bg-black/40 mix-blend-multiply z-20"></div>}
                        </div>
                    )
                })}
            </div>

            {/* 3. 右下角厚度卡背堆叠 (痛点 3：卡背尺寸与正面完全 1:1 对齐，保持平行倾斜切入) */}
            <div className={`absolute bottom-6 right-6 ${DIORAMA_SIZE.cardWidth} ${DIORAMA_SIZE.cardHeight} z-30 pointer-events-none`} style={{ transform: 'rotate(10deg) translate(20px, 12px)' }}>
                {/* 模拟底部的卡牌实体厚度层 */}
                {[2, 1, 0].map(i => (
                    <div key={i} className="absolute inset-0 bg-slate-950 rounded-xl border border-slate-900 shadow-md" style={{ transform: `translate(-${i * 3}px, -${i * 3}px)`, zIndex: i === 0 ? 10 : 5 - i }}></div>
                ))}
                {/* 顶层主卡背 */}
                <div className="absolute inset-0 rounded-xl border-2 border-slate-600 shadow-2xl overflow-hidden z-10">
                    <img src={cardBackImg} className="w-full h-full object-cover" alt="卡背" />
                </div>
            </div>

            {/* 4. 半透明黑色信息铭牌 */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-slate-800/80 px-6 py-2 rounded-full z-40 flex flex-col items-center shadow-2xl backdrop-blur-md whitespace-nowrap min-w-[160px]">
                <span className="text-white font-black truncate w-full text-center text-sm tracking-wide">{deck.name}</span>
                <span className={`text-[10px] font-mono font-bold tracking-widest ${cardCount === 40 ? 'text-emerald-400' : 'text-rose-500'}`}>{cardCount} / 40</span>
            </div>

            {/* 5. 金色悬停高光遮罩 (痛点 3：彻底移除死板的正方形描边包装，利用全透层赋予自由卡组随形高光) */}
            {isFullyActive && (
                <div className="absolute inset-x-2 inset-y-4 rounded-3xl bg-yellow-400/0 hover:bg-yellow-400/10 mix-blend-overlay transition-colors pointer-events-auto cursor-pointer z-50"></div>
            )}
        </div>
    );
};

// [新增] 智能命名工具函数
const getUniqueDeckName = (existingDecks: { name: string }[]) => {
    let base = "New Deck";
    let name = base;
    let counter = 1;

    // 创建一个名字集合用于快速查找
    const names = new Set(existingDecks.map(d => d.name));

    // 如果名字已存在，尝试加数字直到不重复
    while (names.has(name)) {
        name = `${base} ${counter}`;
        counter++;
    }
    return name;
};

export const DeckBuilder: React.FC<DeckBuilderProps> = ({
    onStartGame,
    userSystem,
    onBack,
    fromSource, // [新增] 解构
    onGachaNav, // [2026-08-02] 解构
    onDifficultyChange, // [2026-08-06] 解构
    onBackToLobby, // [2026-08-07] 解构
    initialEditDeckId // [2026-08-13] 解构
}) => {

    const [localDeck, setLocalDeck] = useState<Record<string, number>>({});
    const [deckName, setDeckName] = useState("New Deck");
    const [isDirty, setIsDirty] = useState(false); // 标记是否有未保存的修改
    // [2026-08-06] 标准对战 AI 难度选择（三选一互斥）
    const [localDifficulty, setLocalDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');

    const [viewCard, setViewCard] = useState<CardData | null>(null);
    // [卡牌导航] 标记当前查看的卡牌来自左侧牌库还是右侧牌组列表
    const [viewCardContext, setViewCardContext] = useState<'grid' | 'list' | null>(null);
    const [viewCardIndex, setViewCardIndex] = useState(0);
    // [升级] 多选筛选状态集
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const [selectedCosts, setSelectedCosts] = useState<number[]>([]);
    const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
    const [selectedSpellSpeeds, setSelectedSpellSpeeds] = useState<string[]>([]);
    const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // [新增] 右侧列表排序模式
    type SortMode = 'default' | 'rarity' | 'cost';
    const [sortMode, setSortMode] = useState<SortMode>('default');

    // [新增] 费用分布图悬停状态
    const [isCostChartHovered, setIsCostChartHovered] = useState(false);

    // [皮肤检视] 皮肤查看模式开关
    const [showSkinView, setShowSkinView] = useState(false);
    // [皮肤检视] 皮肤悬停预览状态 — cardKey → 临时预览的 skinId
    const [hoveredSkins, setHoveredSkins] = useState<Record<string, number>>({});

    // [新增] 统一悬停预览
    const { gazeTarget, bindGazeEvents, keepAlive, scheduleDismiss } = useCardGaze({ delay: 300 });

    // [升级] 一键重置逻辑
    const isFilterActive = selectedTypes.length > 0 || selectedCosts.length > 0 || selectedRegions.length > 0 || selectedSpellSpeeds.length > 0 || selectedKeywords.length > 0 || searchTerm !== '';
    const resetFilters = () => {
        setSearchTerm(''); setSelectedTypes([]); setSelectedCosts([]); setSelectedRegions([]);
        setSelectedSpellSpeeds([]); setSelectedKeywords([]);
    };
    const [viewMode, setViewMode] = useState<'SELECTION' | 'EDITOR'>('SELECTION');

    // [2026-08-13] 个性化编辑：外部指定初始编辑牌组 → 进入即编辑（开发者专用，默认 undefined 不影响 PVE）
    useEffect(() => {
        if (initialEditDeckId) {
            userSystem.selectDeck(initialEditDeckId);
            setViewMode('EDITOR');
        }
    }, [initialEditDeckId, userSystem]);

    // [核心新增] 大厅 2.0 状态机
    const [viewStyle, setViewStyle] = useState<'GRID' | 'CAROUSEL'>('CAROUSEL');
    // [核心修复] 痛点 5：若玩家已有卡组，默认将镜头聚光灯打在第一个实体卡组（索引 1），否则停在新建按钮上
    const [carouselIndex, setCarouselIndex] = useState(userSystem.decks.length > 0 ? 1 : 0);
    const [hubDeckId, setHubDeckId] = useState<string | null>(null); // 备战枢纽被打开的卡组
    // [核心修复] 彻底废弃 subOverlay，全面对齐 PersonalizationDrawer 的原生状态机制
    const [selectorType, setSelectorType] = useState<'cardBack' | 'desk' | null>(null);
    const [hubHoverItem, setHubHoverItem] = useState<'cardBack' | 'desk' | null>(null); // 负责还原右侧面板的高级悬停预览图

    // 组合全体卡组 (包含新建入口)
    const allCarouselDecks = useMemo(() => [{ id: 'NEW_DECK', isNew: true }, ...userSystem.decks], [userSystem.decks]);

    // 劫持滚轮事件实现无限循环
    const handleWheelScroll = (e: React.WheelEvent) => {
        if (viewStyle !== 'CAROUSEL' || hubDeckId) return; // Grid模式或枢纽打开时不劫持
        const total = allCarouselDecks.length;
        if (total === 0) return;

        if (e.deltaY > 0) {
            setCarouselIndex(prev => (prev + 1) % total);
        } else if (e.deltaY < 0) {
            setCarouselIndex(prev => (prev - 1 + total) % total);
        }
    };

    // [新增] 进入特定卡组的编辑模式
    const handleEnterDeck = (deckId: string) => {
        eventBus.emit(GameEvents.UI_CLICK);
        // [核心修复] 极其关键：切入备战前，抢先一步强行将确认状态归零，彻底截断由于 React 异步延迟产生的残留弹窗
        setConfirmModal(null);
        userSystem.selectDeck(deckId);
        setViewMode('EDITOR');
    };

    // [修复] 智能新建逻辑
    const handleCreateAndEdit = () => {
        eventBus.emit(GameEvents.UI_CLICK);

        // 1. 先触发系统的“取消选中”，这会触发 useEffect 把状态重置为默认
        userSystem.selectDeck('');

        // 2. 使用 setTimeout 确保在 useEffect 之后执行我们的初始化
        // 这样可以覆盖掉 useEffect 里的默认 "New Deck" 和 isDirty: false
        setTimeout(() => {
            setLocalDeck({}); // 确保清空画板

            // 生成不重复的默认名
            const newName = getUniqueDeckName(userSystem.decks);
            setDeckName(newName);

            setIsDirty(true); // 标记为脏数据（草稿状态）
            setViewMode('EDITOR');
        }, 0);
    };

    // [修改] 统一的返回逻辑
    const handleGlobalBack = () => {
        if (viewMode === 'EDITOR') {
            // 如果在编辑器，返回选择界面
            eventBus.emit(GameEvents.UI_BACK);
            // 自动保存当前进度 (可选，视需求而定，这里建议保留原有的保存逻辑或触发一次保存)
            if (isDirty) handleSaveDeck();
            setViewMode('SELECTION');
        } else {
            // 如果在选择界面，执行外部传入的 onBack (回大厅)
            if (onBack) {
                eventBus.emit(GameEvents.UI_BACK);
                onBack();
            }
        }
    };
    const [confirmModal, setConfirmModal] = useState<{
        title: string;
        message: string;
        onConfirm: () => void;
        type: 'danger' | 'info';
    } | null>(null);

    // [2026-08-08 莉莉子] ESC 逐层退（capture 拦截全局，避免 App.tsx 呼出设置面板）：
    //   卡牌详情 → 确认弹窗 → 备战环节(EDITOR，等效返回按钮回枢纽详情) → 枢纽详情(带❌，等效❌回牌组网格) → 牌组网格(回上级)
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (viewCard) return; // 卡牌详情打开中 → 不拦截，让 FullArtOverlay 的 capture 处理器优先关详情
            if (selectorType) {
                // [2026-08-15 莉莉子] 卡背/牌桌选择窗口（StyleSelector）打开中 → ESC 只关选择窗口，下层牌组界面不动；同时清空 selectorType 防止残留导致下次进来自动弹出
                setSelectorType(null);
                e.preventDefault();
                e.stopImmediatePropagation();
                return;
            }
            if (confirmModal) {
                setConfirmModal(null); // 确认弹窗 → 先关弹窗
                e.preventDefault();
                e.stopImmediatePropagation();
                return;
            }
            e.preventDefault();
            e.stopImmediatePropagation(); // 拦截全局 ESC
            if (viewMode === 'EDITOR') {
                handleGlobalBack(); // 备战环节：等效右上角返回按钮 → 回到枢纽详情（hubDeckId 未清；内部已 emit UI_BACK）
            } else if (hubDeckId) {
                eventBus.emit(GameEvents.UI_BACK); // 对齐❌按钮
                setHubDeckId(null); // 枢纽详情（带❌界面）：等效点击❌ → 回到牌组选择网格
            } else {
                eventBus.emit(GameEvents.UI_BACK); // 对齐 handleGlobalBack
                onBack?.(); // 牌组选择网格：返回上级
            }
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [viewCard, confirmModal, viewMode, hubDeckId, selectorType, onBack]);


    const clearDeck = () => {
        if (Object.keys(localDeck).length === 0) return;
        eventBus.emit(GameEvents.UI_BACK);
        setLocalDeck({});
        setIsDirty(true);
    };

    // [新增] 监听 activeDeck 变化，同步到本地编辑器
    useEffect(() => {
        if (userSystem.activeDeck) {
            setLocalDeck(userSystem.activeDeck.cards);
            setDeckName(userSystem.activeDeck.name);
            setIsDirty(false);
        } else {
            // 如果没有选中卡组，或者新建，清空
            setLocalDeck({});
            setDeckName("New Deck");
            setIsDirty(false);
        }
    }, [userSystem.activeDeckId]); // 依赖 ID 变化

    // 2. 统计数据
    const stats = useMemo(() => {
        let total = 0;
        let champions = 0;
        let units = 0;
        let spells = 0;

        Object.entries(localDeck).forEach(([key, count]) => {
            total += count;
            const card = CARD_DB[key];
            if (card) {
                if (card.isChampion) champions += count;
                if (card.type.includes('unit')) units += count;
                else spells += count;
            }
        });
        return { total, champions, units, spells };
    }, [localDeck]);

    // [新增] 获取拥有数量 (Ownership Logic)
    const getOwnedCount = (key: string) => {
        if (!userSystem.collection) return 0;
        return userSystem.collection.ownedCards[key] || 0;
    };

    // [新增] 右侧列表排序逻辑
    const sortedDeckEntries = useMemo(() => {
        const entries = Object.entries(localDeck);
        switch (sortMode) {
            case 'default':
                return entries; // 默认按插入顺序
            case 'rarity':
                return [...entries].sort(([keyA], [keyB]) => {
                    const cardA = CARD_DB[keyA];
                    const cardB = CARD_DB[keyB];
                    const rankA = !cardA ? 99 : cardA.isChampion ? 0 : cardA.type.includes('spell') ? 2 : 1;
                    const rankB = !cardB ? 99 : cardB.isChampion ? 0 : cardB.type.includes('spell') ? 2 : 1;
                    return rankA - rankB;
                });
            case 'cost':
                return [...entries].sort(([keyA], [keyB]) => {
                    const cardA = CARD_DB[keyA];
                    const cardB = CARD_DB[keyB];
                    return (cardA?.cost ?? 0) - (cardB?.cost ?? 0);
                });
        }
    }, [localDeck, sortMode]);

    // [新增] 费用分布统计（用于柱状图）
    const costDistribution = useMemo(() => {
        const dist: Record<string, number> = {};
        Object.entries(localDeck).forEach(([key, count]) => {
            const card = CARD_DB[key];
            if (!card) return;
            const bucket = card.cost >= 10 ? '10+' : String(card.cost);
            dist[bucket] = (dist[bucket] || 0) + count;
        });
        return dist;
    }, [localDeck]);


    // --- 操作逻辑 ---

    const addToDeck = (key: string) => {
        if (stats.total >= 40) return;
        const card = CARD_DB[key];
        const currentCount = localDeck[key] || 0;
        const ownedCount = getOwnedCount(key);

        // [管理员特权] 动态识别身份，解除单卡3张与持有数量拦截
        const isAdmin = userSystem.userId === 'dev_full_admin';
        const maxLimit = isAdmin ? 40 : 3;

        if (currentCount >= maxLimit) return;
        if (!isAdmin && currentCount >= ownedCount) return;

        if (card.isChampion && stats.champions + 1 > 6) return;
        eventBus.emit(GameEvents.UI_CLICK);
        setLocalDeck(prev => ({ ...prev, [key]: currentCount + 1 }));
        setIsDirty(true);
    };

    const removeFromDeck = (key: string) => {
        eventBus.emit(GameEvents.UI_BACK);
        setLocalDeck(prev => {
            const newCount = (prev[key] || 0) - 1;
            if (newCount <= 0) {
                const { [key]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [key]: newCount };
        });
        setIsDirty(true);
    };

    // [新增] 快速添加：直接加满 3 张（受限于剩余卡位和英雄上限）
    const quickAdd = (key: string) => {
        const card = CARD_DB[key];
        const currentCount = localDeck[key] || 0;
        const ownedCount = getOwnedCount(key); // [新增]

        // [管理员特权] 动态计算加满按钮的目标数量，免除持有量和3张瓶颈
        const isAdmin = userSystem.userId === 'dev_full_admin';
        const maxPerCard = isAdmin ? 40 : 3; // 单卡上限
        const deckLimit = 40;
        const championLimit = 6;

        let wantToAdd = isAdmin ? (maxPerCard - currentCount) : (Math.min(maxPerCard, ownedCount) - currentCount);

        if (wantToAdd <= 0) return;

        // 2. 检查卡组总上限
        const remainingDeckSpace = deckLimit - stats.total;
        let actualAdd = Math.min(wantToAdd, remainingDeckSpace);

        // 3. 检查英雄上限
        if (card.isChampion) {
            const remainingHeroSpace = championLimit - stats.champions;
            actualAdd = Math.min(actualAdd, remainingHeroSpace);
        }

        if (actualAdd > 0) {
            eventBus.emit(GameEvents.UI_CLICK); // [新增] 点击音效
            setLocalDeck(prev => ({ ...prev, [key]: currentCount + actualAdd }));
            setIsDirty(true);
        }
    };

    // [新增] 快速删除：直接移除该卡所有数量
    const quickRemove = (key: string) => {
        eventBus.emit(GameEvents.UI_BACK);
        setLocalDeck(prev => {
            const { [key]: _, ...rest } = prev; // 解构赋值移除 key
            return rest;
        });
        setIsDirty(true);
    };

    const handleSaveDeck = () => {
        eventBus.emit(GameEvents.UI_CLICK);
        if (!userSystem.activeDeckId) {
            // 新建模式
            const newId = `deck_${Date.now()}`;
            userSystem.saveDeck({
                id: newId,
                name: deckName,
                hero: 'lyfe', // 简单逻辑：默认封面，或者根据卡组里最多的英雄决定
                cards: localDeck,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
            userSystem.selectDeck(newId);
        } else {
            // 更新模式
            if (userSystem.activeDeck) {
                userSystem.saveDeck({
                    ...userSystem.activeDeck,
                    name: deckName,
                    cards: localDeck,
                    updatedAt: Date.now()
                });
            }
        }
        setIsDirty(false);
    };

    const handleDeleteDeck = (id: string) => {
        // 使用自定义弹窗替代 window.confirm
        setConfirmModal({
            title: "DELETE DECK",
            message: "确认删除该卡组？此操作不可逆。",
            type: 'danger',
            onConfirm: () => {
                eventBus.emit(GameEvents.UI_BACK);
                userSystem.deleteDeck(id);
                setConfirmModal(null); // 关闭弹窗
            }
        });
    };
        const autoFillDeck = () => {
        eventBus.emit(GameEvents.UI_CLICK);
        const remaining = 40 - stats.total;
        if (remaining <= 0) return;

        const isAdmin = userSystem.userId === 'dev_full_admin';

        const matchingKeys = Object.keys(CARD_DB).filter(key => {
            const card = CARD_DB[key];

            // [核心新增] 构筑白名单拦截：防止自动填充把衍生卡或测试卡塞进卡组
            if (!isAdmin && card.isCollectible === false) return false;

            if (card.isChampion) return false; // 自动填充依然排除英雄
            // [管理员特权] 自动填充不检查卡牌是否完全未解锁
            if (!isAdmin && getOwnedCount(key) <= 0) return false;

            // [修改] 让自动填充也遵循玩家当前的高级筛选！
            if (searchTerm && !card.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            if (selectedTypes.length > 0) {
                const isHero = !!card.isChampion; // [2026-08-16] L592 已排除英雄，此处 isChampion 被收窄为 false，用 !! 规避无重叠比较（行为不变）
                const isSpell = card.type?.toLowerCase().includes('spell');
                const isUnit = !isHero && !isSpell;
                if (!((selectedTypes.includes('HERO') && isHero) || (selectedTypes.includes('SPELL') && isSpell) || (selectedTypes.includes('UNIT') && isUnit))) return false;
            }
            if (selectedRegions.length > 0 && !selectedRegions.includes(card.region)) return false;
            if (selectedCosts.length > 0) {
                const matchesCost = selectedCosts.some(c => c === 9 ? card.cost >= 9 : card.cost === c);
                if (!matchesCost) return false;
            }
            return true;
        });

        const newDeck = { ...localDeck };
        let added = 0;

        const candidates = matchingKeys.filter(key => {
            const currentCount = newDeck[key] || 0;
            const maxLimit = isAdmin ? 40 : 3;
            // [管理员特权] 扩展候选词条的填充空间至 40 张
            return currentCount < maxLimit && (isAdmin || currentCount < getOwnedCount(key));
        });

        while (added < remaining && candidates.length > 0) {
            const randomIndex = Math.floor(Math.random() * candidates.length);
            const key = candidates[randomIndex];

            const currentCount = newDeck[key] || 0;
            const newCount = currentCount + 1;
            newDeck[key] = newCount;
            added++;

            if (newCount >= 3 || newCount >= getOwnedCount(key)) {
                candidates.splice(randomIndex, 1);
            }
        }

        setLocalDeck(newDeck);
        setIsDirty(true);

        if (added < remaining) {
            console.warn("Auto fill stopped early: Not enough valid cards.");
        }
    };


    // 多选 toggle 辅助
    const toggleFilter = (setter: React.Dispatch<React.SetStateAction<any[]>>, val: any) => {
        setter(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
    };

    const visibleCards = useMemo(() => {
        const isAdmin = userSystem.userId === 'dev_full_admin';

        return Object.values(CARD_DB).filter(c => {
            // 不可收集的隐藏
            if (!isAdmin && c.isCollectible === false) return false;

            // 1. 搜索
            if (searchTerm && !c.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;

            // 2. 类型多选
            if (selectedTypes.length > 0) {
                const isHero = c.isChampion === true;
                const isSpell = c.type?.toLowerCase().includes('spell');
                const isUnit = !isHero && !isSpell;
                const matchType = (selectedTypes.includes('HERO') && isHero) ||
                                  (selectedTypes.includes('SPELL') && isSpell) ||
                                  (selectedTypes.includes('UNIT') && isUnit);
                if (!matchType) return false;
            }

            // 3. 费用多选
            if (selectedCosts.length > 0) {
                const matchCost = selectedCosts.some(cost => cost === 9 ? c.cost >= 9 : c.cost === cost);
                if (!matchCost) return false;
            }

            // 4. 阵营多选
            if (selectedRegions.length > 0) {
                if (!selectedRegions.includes(c.region)) return false;
            }

            // 5. 法术速度级联
            if (selectedTypes.includes('SPELL') && selectedSpellSpeeds.length > 0) {
                const typeStr = c.type?.toLowerCase() || '';
                if (!typeStr.includes('spell')) return false;
                const matchSpeed = selectedSpellSpeeds.some(speed => typeStr.includes(speed.toLowerCase()));
                if (!matchSpeed) return false;
            }

            // 6. 关键词级联
            if ((selectedTypes.length === 0 || selectedTypes.includes('HERO') || selectedTypes.includes('UNIT')) && selectedKeywords.length > 0) {
                if (!c.keywords || c.keywords.length === 0) return false;
                if (!selectedKeywords.some(kw => c.keywords!.includes(kw as any))) return false;
            }

            return true;
        });
    }, [searchTerm, selectedTypes, selectedCosts, selectedRegions, selectedSpellSpeeds, selectedKeywords, userSystem.collection, userSystem.userId]);

    // [修正] 将 handleViewCard 移动到 visibleCards 和 sortedDeckEntries 初始化之后！
    // 统一的查看大图处理函数，智能补全上下文
    const handleViewCard = useCallback((card: CardData, preferredContext?: 'grid' | 'list') => {
        if (preferredContext === 'grid') {
            const idx = visibleCards.findIndex(c => c.key === card.key);
            if (idx >= 0) {
                setViewCardContext('grid');
                setViewCardIndex(idx);
                setViewCard(toFullCardData(visibleCards[idx]));
                return;
            }
        } else if (preferredContext === 'list') {
            const idx = sortedDeckEntries.findIndex(([k]) => k === card.key);
            if (idx >= 0) {
                setViewCardContext('list');
                setViewCardIndex(idx);
                const c = CARD_DB[card.key];
                setViewCard(c ? toFullCardData(c) : null);
                return;
            }
        }

        // 智能兜底查找：先左侧图鉴（卡片来源优先），后右侧卡组
        const idxGrid = visibleCards.findIndex(c => c.key === card.key);
        if (idxGrid >= 0) {
            setViewCardContext('grid');
            setViewCardIndex(idxGrid);
            setViewCard(toFullCardData(visibleCards[idxGrid]));
            return;
        }
        const idxList = sortedDeckEntries.findIndex(([k]) => k === card.key);
        if (idxList >= 0) {
            setViewCardContext('list');
            setViewCardIndex(idxList);
            const c = CARD_DB[card.key];
            setViewCard(c ? toFullCardData(c) : null);
            return;
        }

        // 极小概率兜底
        setViewCardContext(null);
        setViewCardIndex(0);
        setViewCard(card);
    }, [visibleCards, sortedDeckEntries]);

    // [皮肤检视] 点击皮肤方块 → 切换选中皮肤并保存到卡组
    const handleSkinSelect = useCallback((cardKey: string, skinId: number) => {
        const deck = userSystem.activeDeck;
        if (!deck) return;
        // 如果已经是当前皮肤，不做任何事
        if ((deck.skinOverrides?.[cardKey] ?? 0) === skinId) return;
        // 不允许选择未拥有的皮肤
        const ownedSkins = userSystem.collection?.ownedSkins?.[cardKey] || [];
        if (skinId !== 0 && !ownedSkins.includes(skinId)) return;
        userSystem.saveDeck({
            ...deck,
            skinOverrides: {
                ...(deck.skinOverrides || {}),
                [cardKey]: skinId,
            },
        });
    }, [userSystem.activeDeck, userSystem.collection?.ownedSkins]);

    // [皮肤检视] 随机皮肤 — 为所有有皮肤的卡牌随机分配已拥有的皮肤
    const handleRandomSkins = useCallback(() => {
        const deck = userSystem.activeDeck;
        if (!deck) return;
        const ownedSkinsData = userSystem.collection?.ownedSkins || {};
        const newOverrides: Record<string, number> = { ...(deck.skinOverrides || {}) };

        for (const [cardKey, skinRecord] of Object.entries(SKIN_IMAGES)) {
            const skinIds = Object.keys(skinRecord).map(Number).sort((a, b) => a - b);
            if (skinIds.length <= 1) continue; // 只有默认皮肤时跳过

            // 筛选该卡牌已拥有的皮肤（skin 0 默认拥有）
            const owned = skinIds.filter(id => id === 0 || (ownedSkinsData[cardKey] || []).includes(id));
            if (owned.length <= 1) continue; // 只有默认皮肤时跳过

            // 随机选择一个已拥有的皮肤
            const randomSkin = owned[Math.floor(Math.random() * owned.length)];
            newOverrides[cardKey] = randomSkin;
        }

        userSystem.saveDeck({
            ...deck,
            skinOverrides: newOverrides,
        });
    }, [userSystem.activeDeck, userSystem.collection?.ownedSkins]);


    const handleStart = () => {
        if (stats.total !== 40) return;

        // [2026-08-06] 上报当前选择的 AI 难度
        onDifficultyChange?.(localDifficulty);

        // 如果有未保存的修改，自动保存
        if (isDirty) {
            handleSaveDeck();
        }

        const finalDeck = Object.entries(localDeck).flatMap(([key, count]) =>
            Array(count).fill(key)
        );
        onStartGame(finalDeck);
    };

    // 如果处于“选择模式”，渲染全新的“备战枢纽 2.0”
    if (viewMode === 'SELECTION') {
        const hubDeck = userSystem.decks.find((d: any) => d.id === hubDeckId);
        const hubCardCount = hubDeck ? Object.values(hubDeck.cards).reduce((a: any, b: any) => a + b, 0) : 0;
        const isFull = hubCardCount === 40;

        return (
            <div className="w-full h-full bg-[#0f172a] text-white flex flex-col relative overflow-hidden font-sans">
                {/* 1. 大厅基础视效 */}
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 pointer-events-none z-0"></div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(30,58,138,0.5)_0%,rgba(15,23,42,1)_60%)] z-0 pointer-events-none"></div>

                {/* 2. 顶部大厅 Header 控制栏 */}
                <div className="absolute top-0 left-0 w-full h-28 bg-black/60 backdrop-blur-md z-40 flex items-end pb-4 justify-center border-b border-white/10 shadow-2xl">
                    <h1 className="text-4xl font-black italic tracking-tighter drop-shadow-[0_0_20px_rgba(59,130,246,0.6)]">牌组选择</h1>
                    <div className="absolute left-32 bottom-4 flex bg-black/80 p-1 rounded-lg border border-white/10 shadow-inner">
                        <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setViewStyle('GRID'); }} className={`p-2 rounded transition-colors ${viewStyle === 'GRID' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-300'}`}><LayoutGrid size={18} /></button> {/* [新增] 音效 */}
                        <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setViewStyle('CAROUSEL'); }} className={`p-2 rounded transition-colors ${viewStyle === 'CAROUSEL' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-300'}`}><GalleryHorizontalEnd size={18} /></button> {/* [新增] 音效 */}
                    </div>
                </div>

                <div className="absolute top-8 right-8 z-50 flex items-center gap-3">
                    {onBackToLobby && (
                        <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onBackToLobby(); }} className="p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all group" title="返回大厅"><Home size={24} className="text-gray-400 group-hover:text-white" /></button>
                    )}
                    <button onClick={handleGlobalBack} className="p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all group" title="返回"><ArrowLeft size={24} className="text-gray-400 group-hover:text-white" /></button>
                </div>

                {/* 3. 核心浏览区（劫持鼠标滚轮的循环无尽舞台） */}
                {/* 痛点 1 & 3：使用 css 批量隐藏轮播图下方原生滚条 [&::-webkit-scrollbar]:hidden */}
                <div onWheel={handleWheelScroll} className={`flex-1 w-full pt-40 pb-20 relative z-10 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${viewStyle === 'GRID' ? 'overflow-y-auto px-16' : 'overflow-hidden flex items-center justify-center'}`}>

                    {viewStyle === 'GRID' ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-12 gap-y-28 content-start w-full max-w-[95%] mx-auto">
                            <div className="w-full flex justify-center mt-12" onClick={handleCreateAndEdit}><DeckDiorama deck={{ isNew: true }} isGridView={true} /></div>
                            {userSystem.decks.map((deck: any) => (
                                <div key={deck.id} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setHubDeckId(deck.id); }} className="w-full flex justify-center mt-12 relative group/del"> {/* [新增] 音效 */}
                                    <DeckDiorama deck={deck} covers={getDeckCovers(deck.cards, deck.skinOverrides)} cardBackImg={PERSONALIZATION_ASSETS.cardBacks[deck.cardBackIndex ?? userSystem.settings.customization.currentCardBackIndex]} boardImg={PERSONALIZATION_ASSETS.desks[deck.boardIndex ?? userSystem.settings.customization.currentDeskIndex]} isGridView={true} />
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteDeck(deck.id); }} className="absolute -top-6 -right-6 p-2 bg-black/80 hover:bg-red-600 rounded-full opacity-0 group-hover/del:opacity-100 transition-all z-50 border border-white/20"><Trash2 size={16} className="text-white" /></button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        // 轮播模式：横向无限环形滚动机制
                        allCarouselDecks.map((deck: any, idx: number) => {
                            const total = allCarouselDecks.length;
                            let diff = (idx - carouselIndex) % total;
                            if (diff > Math.floor(total / 2)) diff -= total;
                            if (diff < -Math.floor(total / 2)) diff += total;

                            if (Math.abs(diff) > 3) return null; // 剔除远处不可见项的渲染
                            const isCenter = diff === 0;
                            const translateX = diff * 380; // 痛点 2: 进一步扩大间距，彻底推开图标

                            return (
                                <motion.div
                                    key={deck.id} initial={false}
                                    animate={{ x: translateX, zIndex: isCenter ? 50 : 10 }}
                                    transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                                    /* [体验优化] 追加 group/del 的样式标记，赋予容器悬停监听权限 */
                                    className="absolute group/del"
                                    onClick={() => {
                                        eventBus.emit(GameEvents.UI_CLICK); // [新增] 音效
                                        if (isCenter) { deck.isNew ? handleCreateAndEdit() : setHubDeckId(deck.id); }
                                        else { setCarouselIndex(idx); }
                                    }}
                                >
                                    <DeckDiorama deck={deck} covers={deck.isNew ? [] : getDeckCovers(deck.cards, deck.skinOverrides)} cardBackImg={PERSONALIZATION_ASSETS.cardBacks[deck.cardBackIndex ?? userSystem.settings.customization.currentCardBackIndex]} boardImg={PERSONALIZATION_ASSETS.desks[deck.boardIndex ?? userSystem.settings.customization.currentDeskIndex]} isCenter={isCenter} />

                                    {/* [体验优化] 轮播图删除补导：当该卡组被推向中央聚光灯（isCenter）且非新建空壳时，允许直接悬浮删除 */}
                                    {isCenter && !deck.isNew && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation(); // [极其关键] 必须阻断冒泡，防止触发进入卡组的 onClick 动作！
                                                handleDeleteDeck(deck.id);
                                            }}
                                            className="absolute top-2 right-6 p-2 bg-black/80 hover:bg-red-600 rounded-full opacity-0 group-hover/del:opacity-100 transition-all z-50 border border-white/20 shadow-xl"
                                        >
                                            <Trash2 size={16} className="text-white" />
                                        </button>
                                    )}
                                </motion.div>
                            );
                        })
                    )}
                </div>

                {/* 4. 备战枢纽核心交互大图层 */}
                <AnimatePresence>
                    {hubDeckId && hubDeck && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 z-[100] bg-black/85 backdrop-blur-xl flex items-center justify-center select-none"
                            onContextMenu={(e) => { e.preventDefault(); setHubDeckId(null); }} // [体验核心] 背景高斯模糊处右键立刻退出
                        >
                            {/* 关闭枢纽大按钮 */}
                            <button onClick={() => { eventBus.emit(GameEvents.UI_BACK); setHubDeckId(null); }} className="absolute top-8 right-8 text-gray-400 hover:text-white bg-white/5 border border-white/10 p-3 rounded-full transition-all hover:bg-red-500/80 z-50"><X size={24} /></button> {/* [新增] 音效 */}

                            {/* 左侧翼：卡牌列表只读预览 */}
                            <motion.div initial={{ x: -60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="w-80 h-[620px] bg-slate-900/90 border border-white/10 rounded-3xl flex flex-col mr-12 shadow-[0_30px_60px_rgba(0,0,0,0.8)] relative overflow-hidden" onContextMenu={(e) => e.stopPropagation()}>
                                <div className="p-5 bg-black/40 font-black text-gray-400 tracking-[0.3em] text-center border-b border-white/10 shrink-0 z-20">卡组预览</div>

                                {/* 痛点 1 & 5：隐藏滚动条，并架设上下两层凸出的半透明黑影渐变层进行卡牌边缘裁剪虚化 */}
                                <div className="flex-1 relative overflow-hidden bg-slate-950">
                                    {/* 顶部向下凸出虚化遮罩 */}
                                    <div className="absolute top-0 left-0 w-full h-10 bg-gradient-to-b from-slate-950 via-slate-950/80 to-transparent z-10 pointer-events-none"></div>

                                    <div
                                        className="h-full overflow-y-auto px-4 py-8 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                                    >
                                        {Object.entries(hubDeck.cards).map(([key, count]: any) => {
                                            const card = CARD_DB[key];
                                            if (!card) return null;
                                            return (
                                                <div key={key} className="relative flex items-center h-12 bg-gray-800/90 rounded-lg border border-gray-700/60 hover:border-blue-500 overflow-hidden cursor-help" {...bindGazeEvents(card as CardData)}>
                                                    {/* [皮肤修复] 动态提取枢纽卡组中配置的皮肤图 */}
                                                    <div className="absolute inset-0 opacity-40 bg-cover bg-center" style={{ backgroundImage: `url(${getSkinImage(key, hubDeck.skinOverrides?.[key] || 0) || card.imageUrl})` }}></div>
                                                    <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent"></div>
                                                    <div className="absolute inset-0 flex items-center justify-between px-3">
                                                        <div className="flex gap-3 items-center"><span className="w-6 h-6 rounded-full bg-blue-900 flex justify-center items-center text-xs font-bold border border-blue-500 text-blue-200">{card.cost}</span><span className="text-sm font-bold truncate w-32 drop-shadow-md">{card.name}</span></div>
                                                        <span className="text-yellow-400 font-black text-sm">x{count}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {/* 底部向上凸出虚化遮罩 */}
                                    <div className="absolute bottom-0 left-0 w-full h-10 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent z-10 pointer-events-none"></div>
                                </div>

                                <div className="p-4 shrink-0 flex gap-2 border-t border-white/10 bg-black/40 z-20">
                                    <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setConfirmModal({ title: "DELETE DECK", message: "确认删除该卡组？此操作不可逆。", type: 'danger', onConfirm: () => { userSystem.deleteDeck(hubDeckId); setConfirmModal(null); setHubDeckId(null); } }); }} className="p-4 bg-red-950/40 hover:bg-red-600 text-red-200 rounded-xl transition-colors border border-red-900/30"><Trash2 size={20} /></button> {/* [新增] 音效 */}
                                    <button onClick={() => handleEnterDeck(hubDeckId)} className="flex-1 p-4 bg-blue-900 hover:bg-blue-600 text-white font-black tracking-widest rounded-xl transition-all">编辑卡组</button>
                                </div>
                            </motion.div>

                            {/* 正中心：主角微缩景观展示与发车按钮 */}
                            <div className="flex flex-col items-center gap-12 z-50 mx-6">
                                <DeckDiorama deck={hubDeck} covers={getDeckCovers(hubDeck.cards, hubDeck.skinOverrides)} cardBackImg={PERSONALIZATION_ASSETS.cardBacks[hubDeck.cardBackIndex ?? userSystem.settings.customization.currentCardBackIndex]} boardImg={PERSONALIZATION_ASSETS.desks[hubDeck.boardIndex ?? userSystem.settings.customization.currentDeskIndex]} isHub={true} />

                                {/* [2026-08-06 莉莉子] AI 难度选择：三选一互斥 */}
                                <div className="flex items-center gap-3">
                                    <span className="text-gray-400 text-xs font-bold tracking-[0.25em] mr-1">AI 难度</span>
                                    {([
                                        { key: 'easy', label: '简单', icon: '🌱', desc: '温和' },
                                        { key: 'normal', label: '普通', icon: '⚔️', desc: '均衡' },
                                        { key: 'hard', label: '困难', icon: '🔥', desc: '高压' },
                                    ] as const).map(opt => (
                                        <button
                                            key={opt.key}
                                            onClick={() => {
                                                eventBus.emit(GameEvents.UI_CLICK);
                                                setLocalDifficulty(opt.key);
                                                onDifficultyChange?.(opt.key);
                                            }}
                                            className={`px-5 py-2.5 rounded-xl font-black text-sm tracking-widest border-2 transition-all flex items-center gap-2
                                                ${localDifficulty === opt.key
                                                    ? 'bg-gradient-to-r from-orange-500/30 to-red-500/30 border-orange-400 text-orange-200 shadow-[0_0_20px_rgba(249,115,22,0.4)] scale-105'
                                                    : 'bg-black/40 border-white/15 text-gray-400 hover:border-white/40 hover:text-white'}`}
                                        >
                                            <span>{opt.icon}</span>
                                            <span>{opt.label}</span>
                                            <span className={`text-[10px] font-bold opacity-70 ${localDifficulty === opt.key ? 'text-orange-300' : 'text-gray-500'}`}>{opt.desc}</span>
                                        </button>
                                    ))}
                                </div>

                                {/* [修正] 根据来源区分发车/完成构筑按钮 */}
                                {fromSource === 'mode_select' ? (
                                    <button
                                        onClick={() => {
                                            eventBus.emit(GameEvents.UI_CLICK);
                                            if (isFull) {
                                                // [2026-08-06] 上报当前选择的 AI 难度
                                                onDifficultyChange?.(localDifficulty);
                                                // [核心修复] 在发车前，强行将 activeDeckId 同步为当前正在浏览的枢纽卡组 ID
                                                userSystem.selectDeck(hubDeckId!);
                                                onStartGame(Object.entries(hubDeck.cards).flatMap(([k, c]: any) => Array(c).fill(k)));
                                            }
                                        }}
                                        disabled={!isFull}
                                        className={`w-72 py-5 rounded-2xl font-black text-2xl tracking-[0.2em] flex items-center justify-center gap-3 transition-all ${isFull ? 'bg-gradient-to-r from-blue-600 to-cyan-400 text-white hover:scale-110 shadow-[0_10px_40px_rgba(59,130,246,0.6)] border border-cyan-300/20' : 'bg-gray-900/80 text-red-500 cursor-not-allowed border border-red-900/50 backdrop-blur-md'}`}
                                    >
                                        <Play fill="currentColor" size={24} /> {isFull ? '开始游戏' : '卡组未满'}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); if (isFull) { handleSaveDeck(); handleGlobalBack(); } }}
                                        disabled={!isFull}
                                        className={`w-72 py-5 rounded-2xl font-black text-2xl tracking-[0.2em] flex items-center justify-center gap-3 transition-all ${isFull ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-500/30 hover:scale-105' : 'bg-gray-900/80 text-gray-500 cursor-not-allowed border border-gray-700 backdrop-blur-md'}`}
                                    >
                                        <Save fill="currentColor" size={24} /> {isFull ? '完成构筑' : '卡组未满'}
                                    </button>
                                )}
                            </div>

                            {/* 右侧翼：完美复刻抽屉逻辑的个性化大面板 */}
                            {/* [关键修正] 去掉 overflow-hidden 改为 overflow-visible，允许悬浮预览图溢出外侧！ */}
                            {/* [修复] 将 h-[85vh] 改为 h-fit pb-10，让面板高度自适应内部的两个按钮，去除多余空白 */}
                            <motion.div initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="w-72 h-fit pb-10 bg-[#1e293b]/90 border border-white/10 rounded-3xl flex flex-col ml-12 shadow-2xl relative overflow-visible backdrop-blur-md z-40" onContextMenu={(e) => e.stopPropagation()}>
                                <div className="p-5 bg-black/40 font-black text-gray-400 tracking-[0.3em] text-center border-b border-white/10 shrink-0 mb-4">定制</div>

                                {/* [修复] 稍微缩小 gap-16 为 gap-10，让上下图标布局更紧凑 */}
                                <div className="flex-1 flex flex-col justify-center items-center gap-10 px-6 relative">
                                    {/* 悬停大图预览 (Floating Preview) - 完美复原抽屉的原生体验 */}
                                    {/* [修复] 将 right-[110%] 改为 left-[105%]，让大图朝向画面最右侧空旷区域弹出，完美避开中心卡组 */}
                                    {hubHoverItem && (
                                        <div className="absolute left-[105%] top-1/2 -translate-y-1/2 pointer-events-none animate-fade-in z-50">
                                            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl rounded-xl -m-4"></div>
                                            <div className={`relative border-2 border-orange-500/50 rounded-lg overflow-hidden shadow-2xl ${hubHoverItem === 'cardBack' ? 'w-[240px] h-[360px]' : 'w-[400px] h-[225px]'}`}>
                                                {hubHoverItem === 'cardBack' ? (
                                                    <img src={PERSONALIZATION_ASSETS.cardBacks[hubDeck.cardBackIndex ?? userSystem.settings.customization.currentCardBackIndex]} className="w-full h-full object-cover" alt="预览" />
                                                ) : (
                                                    <DeskMedia deskIndex={hubDeck.boardIndex ?? userSystem.settings.customization.currentDeskIndex} dynamic={(userSystem.settings as any)?.deskDynamic} className="w-full h-full object-cover" />
                                                )}
                                                <div className="absolute bottom-0 w-full bg-black/60 text-white text-center text-xs py-1 font-mono tracking-widest backdrop-blur-sm">PREVIEW</div>
                                            </div>
                                        </div>
                                    )}

                                    {/* 卡背更换大按钮 - 还原原生 group-hover 倾斜特效 */}
                                    <div className="flex flex-col items-center gap-4 w-full">
                                        <span className="text-xs text-yellow-600 font-bold tracking-widest uppercase">卡背</span>
                                        <div
                                            className="relative group cursor-pointer"
                                            onMouseEnter={() => setHubHoverItem('cardBack')}
                                            onMouseLeave={() => setHubHoverItem(null)}
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setSelectorType('cardBack'); }} // [新增] 音效
                                        >
                                            <div className="w-32 h-48 rounded-lg overflow-hidden border-2 border-white/20 shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-[15deg] group-hover:border-orange-500 group-hover:shadow-[0_0_20px_orange] z-10 relative bg-black">
                                                <img src={PERSONALIZATION_ASSETS.cardBacks[hubDeck.cardBackIndex ?? userSystem.settings.customization.currentCardBackIndex]} className="w-full h-full object-cover" alt="卡背" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* 棋盘桌垫更换大按钮 - 还原原生 group-hover 倾斜特效 */}
                                    <div className="flex flex-col items-center gap-4 w-full">
                                        <span className="text-xs text-yellow-600 font-bold tracking-widest uppercase">牌桌</span>
                                        <div
                                            className="relative group cursor-pointer"
                                            onMouseEnter={() => setHubHoverItem('desk')}
                                            onMouseLeave={() => setHubHoverItem(null)}
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setSelectorType('desk'); }} // [新增] 音效
                                        >
                                            <div className="w-48 h-28 rounded-lg overflow-hidden border-2 border-white/20 shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:-rotate-[15deg] group-hover:border-orange-500 group-hover:shadow-[0_0_20px_orange] z-10 relative bg-black">
                                                <DeskMedia deskIndex={hubDeck.boardIndex ?? userSystem.settings.customization.currentDeskIndex} dynamic={(userSystem.settings as any)?.deskDynamic} className="w-full h-full object-cover" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>

                            {/* 悬停预览 — 智能物理跟随 */}
                            <FloatingCardPreview
                                gazeTarget={gazeTarget}
                                mode="follow"
                                scale={1.25}
                                interactive
                                skinId={userSystem.activeDeck?.skinOverrides?.[gazeTarget?.card.key || ''] || 0}
                                onMouseEnter={keepAlive}
                                onMouseLeave={scheduleDismiss}
                                onViewArt={(c) => handleViewCard(c)}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* [核心修复] 打破层叠结界，将选择器移至视口最外层，确保 z-index 置顶且不被拦截 */}
                {selectorType && hubDeck && (
                    <div className="absolute inset-0 z-[300]">
                        <StyleSelector
                            type={selectorType}
                            currentSelected={selectorType === 'cardBack' ? (hubDeck.cardBackIndex ?? userSystem.settings.customization.currentCardBackIndex) : (hubDeck.boardIndex ?? userSystem.settings.customization.currentDeskIndex)}
                            unlockedIndices={selectorType === 'cardBack' ? userSystem.settings.unlockedCardBacks : userSystem.settings.unlockedDesks}
                            onSelect={(idx: number) => {
                                if (selectorType === 'cardBack') userSystem.saveDeck({...hubDeck, cardBackIndex: idx});
                                else userSystem.saveDeck({...hubDeck, boardIndex: idx});
                            }}
                            onClose={() => setSelectorType(null)}
                            deskDynamic={(userSystem.settings as any)?.deskDynamic} // [2026-08-13] 动态牌桌
                        />
                    </div>
                )}

                {/* [修复] SELECTION 模式缺少 confirmModal 渲染 — 现在枢纽界面也能正常显示删除确认弹窗了 */}
                <AnimatePresence>
                    {confirmModal && (
                        <div
                            className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
                            onClick={() => { eventBus.emit(GameEvents.UI_BACK); setConfirmModal(null); }}
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="bg-slate-900 border border-red-500/30 p-6 rounded-2xl shadow-2xl w-72 text-center relative overflow-hidden"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent"></div>

                                <div className="flex flex-col items-center gap-3 mb-4">
                                    <div className="p-3 bg-red-500/10 rounded-full">
                                        <AlertTriangle size={24} className="text-red-500" />
                                    </div>
                                    <h3 className="text-xl font-black text-white tracking-widest">{confirmModal.title}</h3>
                                    <p className="text-gray-300 whitespace-pre-line leading-relaxed">
                                        {confirmModal.message}
                                    </p>
                                </div>

                                <div className="flex gap-4 justify-center">
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_BACK); setConfirmModal(null); }}
                                        className="flex-1 py-3 rounded-lg border border-white/10 hover:bg-white/5 text-gray-300 font-bold transition-colors"
                                    >
                                        CANCEL
                                    </button>
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); confirmModal.onConfirm(); }}
                                        className="flex-1 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all hover:scale-105"
                                    >
                                        CONFIRM
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex bg-[#0f172a] text-white overflow-hidden font-sans">

            {onBack && (
                <button
                    onClick={() => {
                        eventBus.emit(GameEvents.UI_BACK);
                        handleGlobalBack(); // <--- 改为这个
                    }}
                    // [修复] 将 right-[340px] 改为 right-8，移至屏幕最右上角，彻底避开筛选栏
                    className="absolute top-6 right-8 z-50 p-3 bg-[#1e293b] border border-gray-600 rounded-full hover:bg-slate-700 hover:border-white/50 transition-all shadow-lg group"
                    title="返回"
                >
                    <ArrowLeft size={20} className="text-gray-400 group-hover:text-white" />
                </button>
            )}
            {/* Left Sidebar - Filters & Stats */}
            <FloatingCardPreview
                gazeTarget={gazeTarget}
                mode="follow"
                scale={1.25}
                interactive
                skinId={userSystem.activeDeck?.skinOverrides?.[gazeTarget?.card.key || ''] || 0}
                onMouseEnter={keepAlive}
                onMouseLeave={scheduleDismiss}
                onViewArt={(c) => handleViewCard(c)}
                heroDynamic={(userSystem.settings as any)?.heroDynamic || false} // [2026-08-16] 备战悬停大图动态（跟随设置，方便直观验证实装）
            />

            {/* --- [重构] 中间主内容区 (包含顶部筛选台与卡牌网格) --- */}
            {/* 注意：我们彻底删除了原先的左侧 80px 宽的旧筛选边栏，为网格腾出了巨大空间！ */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#0f172a] relative">

                {/* 顶部现代复合筛选台 (移植自 ArtStudio) */}
                <div className="p-4 border-b border-white/10 bg-slate-900 shadow-md z-10 shrink-0">
                    <div className="flex items-center justify-between gap-4 px-4">
                        <div className="flex items-center gap-4 flex-1">
                            {/* Search */}
                            <div className="relative w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <input
                                    type="text" placeholder="搜索卡牌..." value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)}
                                    className="w-full bg-slate-800 rounded-md py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                                />
                            </div>
                            {/* Category Buttons — 同步到 selectedTypes 多选 */}
                            <div className="flex gap-1 bg-slate-800 p-1 rounded-md">
                                <button onClick={()=>{ eventBus.emit(GameEvents.UI_CLICK); setSelectedTypes(prev => prev.length === 3 ? [] : ['HERO','SPELL','UNIT']); }}
                                        className={`p-1.5 px-3 rounded-sm text-sm font-bold flex items-center gap-1 ${selectedTypes.length === 0 ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-400 hover:bg-white/5'}`}>全部</button>
                                <button onClick={()=>{ eventBus.emit(GameEvents.UI_CLICK); toggleFilter(setSelectedTypes, 'HERO'); }}
                                        className={`p-1.5 px-3 rounded-sm text-sm font-bold flex items-center gap-1 ${selectedTypes.includes('HERO')?'bg-yellow-600 text-white shadow-sm':'text-gray-400 hover:bg-white/5'}`}><User size={14}/> 英雄</button>
                                <button onClick={()=>{ eventBus.emit(GameEvents.UI_CLICK); toggleFilter(setSelectedTypes, 'SPELL'); }}
                                        className={`p-1.5 px-3 rounded-sm text-sm font-bold flex items-center gap-1 ${selectedTypes.includes('SPELL')?'bg-blue-600 text-white shadow-sm':'text-gray-400 hover:bg-white/5'}`}><Zap size={14}/> 法术</button>
                                <button onClick={()=>{ eventBus.emit(GameEvents.UI_CLICK); toggleFilter(setSelectedTypes, 'UNIT'); }}
                                        className={`p-1.5 px-3 rounded-sm text-sm font-bold flex items-center gap-1 ${selectedTypes.includes('UNIT')?'bg-orange-600 text-white shadow-sm':'text-gray-400 hover:bg-white/5'}`}><Box size={14}/> 单位</button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* [皮肤检视] 随机皮肤按钮 */}
                            <button
                                onClick={() => {
                                    eventBus.emit(GameEvents.UI_CLICK);
                                    handleRandomSkins();
                                }}
                                className="py-2 px-3 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all bg-slate-800 text-gray-300 hover:bg-emerald-700 hover:text-white border border-transparent hover:border-emerald-500/50"
                                title="为所有有皮肤的卡牌随机配置已拥有的皮肤"
                            >
                                <Shuffle size={16} />
                                随机皮肤
                            </button>
                            {/* [皮肤检视] 皮肤查看按钮 */}
                            <button
                                onClick={() => {
                                    eventBus.emit(GameEvents.UI_CLICK);
                                    setShowSkinView(!showSkinView);
                                }}
                                className={`
                                    py-2 px-3 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all
                                    ${showSkinView
                                        ? 'bg-purple-600 text-white shadow-[0_0_10px_rgba(147,51,234,0.4)] border border-purple-400/50'
                                        : 'bg-slate-800 text-gray-300 hover:bg-slate-700 border border-transparent'
                                    }
                                `}
                                title="查看已拥有的皮肤"
                            >
                                <Palette size={16} />
                                皮肤配置
                            </button>
                            {/* Advanced Filters */}
                            <button
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsFilterOpen(!isFilterOpen); }} // [新增] 音效
                                className={`py-2 px-4 flex items-center justify-center gap-2 text-sm font-bold rounded-md transition-colors ${isFilterOpen ? 'bg-blue-600 text-white' : 'bg-slate-800 text-gray-300 hover:bg-slate-700'}`}
                            >
                                <Filter size={16} /> 高级筛选
                            </button>
                            {/* Reset */}
                            <button
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); resetFilters(); }} disabled={!isFilterActive} // [新增] 音效
                                className={`p-2 rounded-md transition-colors ${isFilterActive ? 'bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white' : 'bg-slate-800 text-gray-600'}`}
                                title="清空筛选"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Advanced Filters Dropdown — 多选版 */}
                    <AnimatePresence>
                        {isFilterOpen && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden w-full px-4">
                                <div className="p-4 bg-slate-800 rounded-md mt-3 border border-white/5 shadow-inner">
                                    <div className="flex flex-wrap gap-x-8 gap-y-4">
                                        {/* 费用多选 */}
                                        <div>
                                            <span className="text-xs text-gray-400 font-bold tracking-widest block mb-2">费用 (COST)</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(c => (
                                                    <button key={c} onClick={() => toggleFilter(setSelectedCosts, c)}
                                                            className={`w-8 h-8 rounded-full text-xs font-mono font-bold flex items-center justify-center transition-all ${selectedCosts.includes(c) ? 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}>
                                                        {c}{c === 10 ? '+' : ''}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {/* 阵营多选 */}
                                        <div>
                                            <span className="text-xs text-gray-400 font-bold tracking-widest block mb-2">阵营 (REGION)</span>
                                            <div className="flex flex-wrap gap-2">
                                                {[
                                                    { key: 'Lyfe', label: '里芙' },
                                                    { key: 'Fenny', label: '芬妮' },
                                                    { key: 'Pupu', label: '卜卜' },
                                                    { key: 'Mauxir', label: '猫汐尔' },
                                                    { key: 'Acacia', label: '安卡希雅' },
                                                    { key: 'Titan', label: '泰坦' },
                                                    { key: 'Analyst', label: '分析员' },
                                                    { key: 'Logistics', label: '后勤' },
                                                    { key: 'TEST', label: '测试' },
                                                ].map(r => (
                                                    <button key={r.key} onClick={() => toggleFilter(setSelectedRegions, r.key)}
                                                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedRegions.includes(r.key) ? 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}>
                                                        {r.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {/* 法术速度级联 */}
                                        {selectedTypes.includes('SPELL') && (
                                            <div>
                                                <span className="text-xs text-purple-400 font-bold tracking-widest block mb-2">法术速度</span>
                                                <div className="flex gap-2">
                                                    {[
                                                        { id: 'Burst', icon: <Zap size={16} className="text-yellow-400 fill-yellow-400" />, title: '极速' },
                                                        { id: 'Fast', icon: <Zap size={16} className="text-white" />, title: '快速' },
                                                        { id: 'Slow', icon: <Clock size={16} className="text-purple-300" />, title: '慢速' },
                                                    ].map(s => (
                                                        <button key={s.id} onClick={() => toggleFilter(setSelectedSpellSpeeds, s.id)} title={s.title}
                                                                className={`w-8 h-8 rounded flex items-center justify-center transition-all border ${selectedSpellSpeeds.includes(s.id) ? 'bg-purple-500/20 border-purple-400 shadow-[inset_0_0_10px_purple]' : 'bg-slate-700 border-transparent hover:bg-slate-600'}`}>
                                                            {s.icon}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {/* 关键词级联 */}
                                    {(selectedTypes.length === 0 || selectedTypes.includes('HERO') || selectedTypes.includes('UNIT')) && (
                                        <div className="mt-4 pt-4 border-t border-white/10">
                                            <span className="text-xs text-green-400 font-bold tracking-widest block mb-2">关键词筛选</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {Object.entries(KEYWORD_DB).map(([kw, config]) => (
                                                    <button key={kw} onClick={() => toggleFilter(setSelectedKeywords, kw)}
                                                            title={`${config.label}\n${config.description}`}
                                                            className={`w-8 h-8 rounded flex justify-center items-center transition-all border ${selectedKeywords.includes(kw) ? 'bg-green-500/20 border-green-400 shadow-[inset_0_0_10px_rgba(74,222,128,0.5)]' : 'bg-slate-700 border-transparent hover:bg-slate-600 opacity-70 hover:opacity-100'}`}>
                                                        {config.icon ? (
                                                            <img src={config.icon} alt={config.label} className="w-5 h-5 object-contain drop-shadow-md" />
                                                        ) : (
                                                            <span className="text-[8px] font-bold text-gray-300">{config.label.substring(0, 1)}</span>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* 卡牌网格区域 (引入沉浸式边缘虚化) */}
                <div className="flex-1 relative overflow-hidden bg-[#0f172a]">
                    {/* 顶部边缘虚化遮罩 */}
                    <div className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-[#0f172a] via-[#0f172a]/80 to-transparent z-20 pointer-events-none"></div>

                    <div className="h-full p-8 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {/* 游戏始终在 1680×1050 坐标系内，固定 6 列由 ScaleWrapper 统一缩放 */}
                    <div className="grid grid-cols-6 gap-6 pb-32">
                    {visibleCards.map(card => {
                        const ownedCount = getOwnedCount(card.key);
                        const inDeckCount = localDeck[card.key] || 0;

                        // [管理员特权] 动态计算卡组中该卡的锁定与上限置灰状态
                        const isAdmin = userSystem.userId === 'dev_full_admin';
                        const isLocked = !isAdmin && ownedCount === 0;
                        const fullCard = toFullCardData(card);

                        // [判断] 是否已达到最大上限（拥有量、卡组限制等）
                        // 注意：isMaxed 控制的是“能否放入卡组”，而不是“能否购买”
                        const maxLimit = isAdmin ? 40 : 3;
                        const isMaxed = isLocked || stats.total >= 40 || inDeckCount >= maxLimit || (!isAdmin && inDeckCount >= ownedCount);

                        // [新增] 是否还可以购买更多？ (只要拥有量不到3张，就显示购买按钮)
                        const canBuy = ownedCount < 3;

                        // 是否可交互（用于 hover 效果）
                        const isInteractive = !isLocked && !isMaxed;

                        return (
                            <div
                                key={card.key}
                                className={`group relative transition-all duration-300 ${isInteractive ? 'hover:scale-105 hover:z-10' : ''}`}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    handleViewCard(fullCard, 'grid');
                                }}
                            >
                                <div
                                    onClick={() => !isMaxed && addToDeck(card.key)}
                                    // 样式逻辑保持不变：满编或锁定时变灰
                                    className={`
                                        transition-all duration-300
                                        ${isLocked ? 'opacity-50 grayscale' : (isMaxed ? 'grayscale opacity-70 cursor-not-allowed' : 'cursor-pointer')}
                                    `}
                                >
                                    <Card
                                        data={fullCard}
                                        location="deck-builder"
                                        skinId={hoveredSkins[card.key] ?? (userSystem.activeDeck?.skinOverrides?.[card.key] || 0)}
                                        isFaceUp={true}
                                        onViewArt={(c) => handleViewCard(c, 'grid')}
                                        // [关键修改] 永远隐藏内部的小购物车图标
                                        // 因为我们要用外面的大按钮来统一负责购买，防止内部图标变灰
                                        showShopIcon={false}
                                        ownedCount={ownedCount}
                                    />
                                </div>

                                {/* [皮肤检视] 皮肤指示器 — 悬停预览 + 点击切换 */}
                                {showSkinView && (() => {
                                    const skinRecord = SKIN_IMAGES[card.key];
                                    if (!skinRecord) return null;
                                    const skinIds = Object.keys(skinRecord).map(Number).sort((a, b) => a - b);
                                    if (skinIds.length <= 1) return null;
                                    const ownedSkins = userSystem.collection?.ownedSkins?.[card.key] || [];
                                    const currentSkin = userSystem.activeDeck?.skinOverrides?.[card.key] ?? 0;
                                    return (
                                        <div className="flex gap-1 mt-1.5 justify-center flex-nowrap overflow-x-auto [&::-webkit-scrollbar]:hidden">
                                            {skinIds.map(id => {
                                                const isOwned = id === 0 || ownedSkins.includes(id);
                                                const isSelected = currentSkin === id;
                                                const isHovered = hoveredSkins[card.key] === id;
                                                return (
                                                    <div
                                                        key={id}
                                                        onMouseEnter={() => setHoveredSkins(prev => ({ ...prev, [card.key]: id }))}
                                                        onMouseLeave={() => setHoveredSkins(prev => {
                                                            const next = { ...prev };
                                                            delete next[card.key];
                                                            return next;
                                                        })}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            eventBus.emit(GameEvents.UI_CLICK);
                                                            handleSkinSelect(card.key, id);
                                                        }}
                                                        className={`
                                                            w-5 h-5 rounded text-[9px] font-black flex items-center justify-center shrink-0 transition-all duration-200 border cursor-pointer
                                                            ${isSelected
                                                                ? 'bg-orange-500 border-orange-400 text-white shadow-[0_0_8px_rgba(251,146,60,0.6)] scale-110'
                                                                : isOwned
                                                                    ? 'bg-blue-500 border-blue-400 text-white shadow-[0_0_6px_rgba(59,130,246,0.5)] hover:scale-110 hover:shadow-[0_0_10px_rgba(59,130,246,0.7)]'
                                                                    : 'bg-slate-800/60 border-slate-600/50 text-slate-500 hover:border-slate-400 hover:scale-105'
                                                            }
                                                            ${isHovered && !isSelected ? 'ring-2 ring-white/40' : ''}
                                                        `}
                                                        title={`皮肤 ${id}${isSelected ? ' · 当前' : isOwned ? ' · 已拥有' : ' · 未拥有'}`}
                                                    >
                                                        {id}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}

                                {/* [关键修改] 外部大购买按钮 */}
                                {/* 条件改为 canBuy：只要没买满3张，这个按钮就一直悬浮在最上层，保持彩色 */}
                                {canBuy && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleViewCard(fullCard, 'grid'); // 点击购物车打开详情页(含购买逻辑)
                                        }}
                                        // 保持 z-10 防止遮挡右侧侧边栏
                                        className="absolute -top-2 -left-2 z-10 w-10 h-10 bg-blue-600 hover:bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg border-2 border-white/20 transition-transform hover:scale-110"
                                        title="购买卡牌"
                                    >
                                        <ShoppingCart size={18} />
                                    </button>
                                )}

                                {/* LOCKED 遮罩文字 (仅在完全未解锁时显示) */}
                                {isLocked && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="bg-black/80 px-3 py-1 rounded text-xs font-bold text-gray-400">LOCKED</div>
                                    </div>
                                )}

                                {/* 数量角标 */}
                                {inDeckCount > 0 && (
                                    <div className="absolute -top-3 -right-0 w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center font-bold shadow-lg border-2 border-white z-20">
                                        {inDeckCount}
                                    </div>
                                )}

                                {/* 快速添加闪电按钮 (保持不变) */}
                                {!isLocked && !isMaxed && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); quickAdd(card.key); }}
                                        className="absolute top-1/2 right-4 -translate-y-1/2 w-12 h-12 bg-blue-600/90 hover:bg-blue-500 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all shadow-xl border-2 border-white/50 z-10 hover:scale-110 backdrop-blur-sm"
                                        title="快速添加(最多3张)"
                                    >
                                        <Zap size={24} fill="currentColor" />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                    </div>
                </div>

                {/* 底部边缘虚化遮罩 */}
                <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/80 to-transparent z-20 pointer-events-none"></div>
            </div>
            </div>

            {/* Right Sidebar - Current Deck & Customization */}
            <div className="w-80 bg-[#1e293b] border-l border-gray-700 flex flex-col z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.3)] relative">

                {/* [修改] 卡组选择与管理区域 */}
                {/* 彻底移除了 PersonalizationDrawer，并清除了多余的 mt-16 上边距 */}
                <div className="p-6 border-b border-gray-700 space-y-4">

                    {/* 卡组名称输入 + 切换按钮 */}
                    <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                            <ListIcon size={20} className="text-gray-400"/>
                            <input
                                type="text"
                                value={deckName}
                                onChange={(e) => { setDeckName(e.target.value); setIsDirty(true); }}
                                className="bg-transparent border-b border-gray-600 focus:border-blue-500 focus:outline-none text-xl font-bold w-full"
                            />
                        </div>
                    </div>

                    {/* 保存按钮 */}
                    <button
                        onClick={handleSaveDeck}
                        disabled={!isDirty}
                        className={`w-full py-2 rounded flex items-center justify-center gap-2 font-bold text-sm transition-colors ${isDirty ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-gray-700 text-gray-500 cursor-default'}`}
                    >
                        <Save size={16} /> {isDirty ? '保存修改' : '保存'}
                    </button>
                </div>

                {/* [新增] 排序按钮组 — 默认/稀有度/费用，互斥单选 */}
                <div className="px-6 py-3 border-b border-gray-700">
                    <span className="text-[10px] font-bold tracking-widest text-gray-500 block mb-2">排序方式</span>
                    <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
                        <button
                            onClick={() => setSortMode('default')}
                            className={`flex-1 py-1.5 px-2 rounded-md text-xs font-bold transition-all ${sortMode === 'default' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-slate-700'}`}
                        >
                            默认
                        </button>
                        <button
                            onClick={() => setSortMode('rarity')}
                            className={`flex-1 py-1.5 px-2 rounded-md text-xs font-bold transition-all ${sortMode === 'rarity' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-slate-700'}`}
                        >
                            稀有度
                        </button>
                        <button
                            onClick={() => setSortMode('cost')}
                            className={`flex-1 py-1.5 px-2 rounded-md text-xs font-bold transition-all ${sortMode === 'cost' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-slate-700'}`}
                        >
                            费用
                        </button>
                    </div>
                </div>

                {/* [移植] 统计面板 (Stats UI) 移至右侧，并做了现代化视觉升级 */}
                <div className="px-6 py-4 border-b border-gray-700 bg-slate-800/50">
                    <div className="flex justify-between mb-2">
                        <span className="text-gray-400 text-sm font-bold tracking-widest">卡组容量</span>
                        <span className={`font-black ${stats.total === 40 ? 'text-green-400' : 'text-white'}`}>{stats.total} / 40</span>
                    </div>
                    <div className="w-full h-2 bg-gray-900 rounded-full overflow-hidden shadow-inner mb-3">
                        <div className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-300" style={{ width: `${(stats.total / 40) * 100}%` }}></div>
                    </div>
                    <div className="flex justify-between text-xs font-mono font-bold text-gray-400 bg-black/30 p-2 rounded-md border border-white/5">
                        <span className={stats.champions > 6 ? 'text-red-400' : ''}>HERO: {stats.champions}/6</span>
                        <span>SPELL: {stats.spells}</span>
                        <span>UNIT: {stats.units}</span>
                    </div>
                </div>

                {/* 卡牌列表 (引入沉浸式边缘虚化) */}
                <div className="flex-1 relative overflow-hidden bg-[#1e293b]">
                    {/* 顶部向下凸出虚化遮罩 */}
                    <div className="absolute top-0 left-0 w-full h-6 bg-gradient-to-b from-[#1e293b] via-[#1e293b]/80 to-transparent z-20 pointer-events-none"></div>

                    <div
                        className="h-full overflow-y-auto p-4 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                    >
                        {sortedDeckEntries.map(([key, count]) => {
                        const card = CARD_DB[key];
                        // 兜底：防止 deleted cards 报错
                        if (!card) return null;

                        const fullCard = toFullCardData(card);

                        return (
                            <div
                                key={key}
                                className="relative group flex items-center gap-2 h-12"
                                // [新增] 绑定悬停事件到整个容器
                            >
                                {/* [新增] 快速删除按钮 (垃圾桶) */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); quickRemove(key); }}
                                    className="w-8 h-full bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white rounded-l-md flex items-center justify-center transition-colors border-y border-l border-gray-700 hover:border-red-500 z-10"
                                    title="移除全部"
                                >
                                    <Trash2 size={16} />
                                </button>

                                {/* 卡牌条目本体 (点击依然是减1) */}
                                <div
                                    className="flex-1 relative h-full bg-gray-800 rounded-r-md overflow-hidden border border-gray-700 hover:border-blue-500 transition-all cursor-pointer"
                                    onClick={() => removeFromDeck(key)}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        handleViewCard(fullCard, 'list');
                                    }}
                                    {...bindGazeEvents(card as CardData)}
                                >
                                    {/* [皮肤修复] 动态提取右侧正在编辑的卡组的皮肤图 */}
                                    <div className="absolute inset-0 opacity-40 bg-cover bg-center" style={{ backgroundImage: `url(${getSkinImage(key, userSystem.activeDeck?.skinOverrides?.[key] || 0) || card.imageUrl})` }}></div>
                                    <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent"></div>
                                    <div className="absolute inset-0 flex items-center justify-between px-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-6 h-6 rounded-full bg-blue-900/80 flex items-center justify-center text-xs font-bold border border-blue-500 text-blue-200">
                                                {card.cost}
                                            </div>
                                            <span className="font-bold text-sm text-shadow truncate w-32">{card.name}</span>
                                        </div>
                                        <div className="text-yellow-400 font-bold">x{count}</div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    </div>

                    {/* 底部向上凸出虚化遮罩 */}
                    <div className="absolute bottom-0 left-0 w-full h-10 bg-gradient-to-t from-[#1e293b] via-[#1e293b]/80 to-transparent z-20 pointer-events-none"></div>
                </div>

                {/* 底部操作区 */}
                <div className="p-6 bg-[#0f172a] border-t border-gray-700 space-y-3">
                    <div className="flex gap-2 relative">
                        <button
                            onClick={clearDeck}
                            className="p-3 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all flex items-center justify-center"
                            title="清空牌库"
                        >
                            <Eraser size={18} />
                        </button>
                        <button
                            onClick={autoFillDeck}
                            className="flex-1 py-3 rounded-lg border border-blue-500/30 text-blue-400 font-bold hover:bg-blue-500/10 transition-all flex items-center justify-center gap-2"
                        >
                            <Wand2 size={18} /> 快速选择
                        </button>
                        <button
                            onMouseEnter={() => setIsCostChartHovered(true)}
                            onMouseLeave={() => setIsCostChartHovered(false)}
                            className="p-3 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-slate-700 transition-all flex items-center justify-center"
                            title="费用分布"
                        >
                            <BarChart3 size={18} />
                        </button>

                        {/* [新增] 悬浮柱状统计图 — 费用分布 */}
                        <AnimatePresence>
                            {isCostChartHovered && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    transition={{ duration: 0.15 }}
                                    className="absolute bottom-full left-0 right-0 mb-2 bg-slate-900 border border-white/10 rounded-xl shadow-2xl z-50 p-4 overflow-hidden"
                                    onMouseEnter={() => setIsCostChartHovered(true)}
                                    onMouseLeave={() => setIsCostChartHovered(false)}
                                >
                                    <h4 className="text-xs font-bold tracking-widest text-gray-400 mb-3 text-center">费用分布</h4>
                                    <div className="flex items-end gap-[2px] h-28 px-1">
                                        {['0','1','2','3','4','5','6','7','8','9','10','10+'].map(cost => {
                                            const count = costDistribution[cost] || 0;
                                            const maxDist = Math.max(1, ...Object.values(costDistribution));
                                            const pct = (count / maxDist) * 100;
                                            return (
                                                <div key={cost} className="flex-1 flex flex-col items-center justify-end h-full gap-[2px]">
                                                    <span className="text-[9px] font-bold text-gray-400 leading-none">{count || ''}</span>
                                                    <div
                                                        className="w-full rounded-sm bg-gradient-to-t from-blue-600 to-cyan-400 transition-all"
                                                        style={{ height: `${Math.max(pct, count > 0 ? 6 : 0)}%` }}
                                                    />
                                                    <span className="text-[9px] text-gray-500 leading-none">{cost}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* [核心修改] 根据 fromSource 渲染不同的按钮 */}
                    {fromSource === 'lobby' ? (
                        // === 场景 A: 从大厅进入 (编队模式) ===
                        // [修复] 必须满40张卡才能点击完成构筑，防止保存空卡组
                        <button
                            onClick={() => {
                                // 如果未满40张，点击无效 (虽然 disabled 已经处理了)
                                if (stats.total !== 40) return;

                                eventBus.emit(GameEvents.UI_CLICK);
                                handleSaveDeck(); // 执行保存 (新建或更新)
                                setViewMode('SELECTION'); // 返回
                            }}
                            disabled={stats.total !== 40} // [关键] 禁用条件
                            className={`
                                w-full py-4 rounded-lg font-black text-lg tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all
                                ${stats.total === 40
                                    ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-500/30 hover:scale-105'
                                    : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700' // 禁用样式
                                }
                            `}
                        >
                            <Save fill="currentColor" size={20} />
                            {stats.total === 40 ? '完成构筑' : `还需 ${40 - stats.total} 张`}
                        </button>
                    ) : (
                        // === 场景 B: 从模式选择进入 (备战模式) ===
                        // 逻辑：必须满编 -> 开始游戏
                        <button
                            onClick={() => {
                                if (stats.total === 40) {
                                    eventBus.emit(GameEvents.LOBBY_START_BATTLE);
                                    // [核心增强] 确保无论是在草稿状态还是保存状态，发车时都安全移管
                                    handleStart();
                                }
                            }}
                            disabled={stats.total !== 40}
                            className={`
                                w-full py-4 rounded-lg font-black text-lg tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all
                                ${stats.total === 40
                                    ? 'bg-gradient-to-r from-blue-600 to-cyan-500 hover:scale-105 text-white shadow-blue-500/30'
                                    : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'}
                            `}
                        >
                            <Play fill="currentColor" /> {stats.total === 40 ? '开始游戏' : '等待构建卡组'}
                        </button>
                    )}
                </div>
            </div>
            {/* [卡牌导航] 根据来源构建导航列表 */}
            {(() => {
                // 根据 viewCardContext 构建当前导航列表
                const navList = viewCardContext === 'grid'
                    ? visibleCards.map(c => toFullCardData(c))
                    : viewCardContext === 'list'
                        ? sortedDeckEntries.map(([k]) => {
                            const c = CARD_DB[k];
                            return c ? toFullCardData(c) : null;
                        }).filter(Boolean) as CardData[]
                        : [];
                const navIndex = viewCardContext ? viewCardIndex : 0;

                if (!viewCard) return null;

                return (
                    <FullArtOverlay
                        card={viewCard}
                        onClose={() => setViewCard(null)}
                        onBuy={(count, cost) => userSystem.purchaseCard(viewCard.key, count, cost)}
                        onGachaNav={(poolId) => onGachaNav?.(poolId)}
                        ownedCount={getOwnedCount(viewCard.key)}
                        playerSilver={userSystem.collection?.resources.silverCoin || 0}
                        skinData={userSystem.activeDeck ? {
                            ownedSkins: userSystem.collection?.ownedSkins || {},
                            currentSkinId: userSystem.activeDeck.skinOverrides?.[viewCard.key] ?? 0,
                            onSkinChange: (cardKey, newSkinId) => {
                                const deck = userSystem.activeDeck;
                                if (!deck) return;
                                const updatedDeck = {
                                    ...deck,
                                    skinOverrides: {
                                        ...(deck.skinOverrides || {}),
                                        [cardKey]: newSkinId,
                                    },
                                };
                                userSystem.saveDeck(updatedDeck);
                            },
                        } : undefined}
                        navigation={navList.length > 1 ? {
                            cardList: navList,
                            currentIndex: navIndex,
                            onNavigate: (newIndex) => {
                                // 导航时直接 reconstruct navList 避免闭包陷阱
                                const freshList = viewCardContext === 'grid'
                                    ? visibleCards.map(c => toFullCardData(c))
                                    : viewCardContext === 'list'
                                        ? sortedDeckEntries.map(([k]) => {
                                            const c = CARD_DB[k];
                                            return c ? toFullCardData(c) : null;
                                        }).filter(Boolean) as CardData[]
                                        : [];
                                setViewCardIndex(newIndex);
                                if (freshList[newIndex]) setViewCard(freshList[newIndex]);
                            },
                        } : undefined}
                    />
                );
            })()}
        </div>
    );
};