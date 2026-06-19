import React, { useState, useMemo,useEffect} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Zap, List as ListIcon, Play, Trash2, Wand2, Box, Save, Plus, ShoppingCart, Eraser, AlertTriangle, Filter, X, User, LayoutGrid, GalleryHorizontalEnd } from 'lucide-react';
import { CARD_DB } from '../data/cards';
import { HERO_IMAGES, PERSONALIZATION_ASSETS, getSkinImage } from '../data/imageData'; // [修改] 补充引入 getSkinImage
import { Card } from './Card';
import type { CardData, SavedDeck } from '../types';
import { eventBus, GameEvents } from '../utils/eventBus';
import { FullArtOverlay } from './Overlays';
import { PersonalizationDrawer } from './PersonalizationDrawer';
import { StyleSelector } from './StyleSelector'; // [核心新增] 直接复用原生的全屏选择器
import type { useUserSystem } from '../hooks/useUserSystem';
import { ArrowLeft } from 'lucide-react'; // [新增]
// [新增] 悬停预览统一方案
import { useCardGaze } from '../hooks/useCardGaze';
import { FloatingCardPreview } from './FloatingCardPreview';



interface DeckBuilderProps {
    onStartGame: (deck: string[]) => void;
    userSystem: ReturnType<typeof useUserSystem>;
    onBack?: () => void;
    // [新增] 接收来源属性
    fromSource: 'lobby' | 'mode_select';
}

// [修改] 废弃旧的 FilterRegion，引入现代复合类型
type CategoryFilter = 'ALL' | 'HERO' | 'SPELL' | 'UNIT';

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
                    <span className="font-bold tracking-widest text-gray-500">NEW DECK</span>
                </div>
                {isFullyActive && <div className="absolute inset-0 rounded-2xl bg-yellow-400/0 hover:bg-yellow-400/10 mix-blend-overlay transition-colors pointer-events-auto cursor-pointer z-50"></div>}
            </div>
        );
    }

    const cardCount = Object.values(deck.cards).reduce((a: any, b: any) => a + b, 0);

    return (
        <div className={`relative ${DIORAMA_SIZE.containerWidth} ${DIORAMA_SIZE.containerHeight} transition-all duration-500 ${scaleAndFocus}`}>
            {/* 1. 最底层大棋盘背景 (痛点 3：平铺展开于正背面，展现完整棋盘原画) */}
            <div className={`${DIORAMA_SIZE.boardWidth} ${DIORAMA_SIZE.boardHeight} absolute top-4 left-1/2 -translate-x-1/2 rounded-xl overflow-hidden border border-slate-700/80 shadow-2xl z-0`}>
                <img src={boardImg} className="w-full h-full object-cover opacity-80" alt="Board" />
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
                    <img src={cardBackImg} className="w-full h-full object-cover" alt="Card Back" />
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
    fromSource // [新增] 解构
}) => {

    const [localDeck, setLocalDeck] = useState<Record<string, number>>({});
    const [deckName, setDeckName] = useState("New Deck");
    const [isDirty, setIsDirty] = useState(false); // 标记是否有未保存的修改

    const [viewCard, setViewCard] = useState<CardData | null>(null);
    // [修改] 引入现代复合状态集
    const [searchTerm, setSearchTerm] = useState('');
    const [category, setCategory] = useState<CategoryFilter>('ALL');
    const [costFilter, setCostFilter] = useState<string>('ALL');
    const [regionFilter, setRegionFilter] = useState<string>('ALL');
    const [isFilterOpen, setIsFilterOpen] = useState(false);


    // [新增] 统一悬停预览
    const { gazeTarget, bindGazeEvents, keepAlive, scheduleDismiss } = useCardGaze({ delay: 300 });

    // [新增] 一键重置逻辑
    const isFilterActive = category !== 'ALL' || costFilter !== 'ALL' || regionFilter !== 'ALL' || searchTerm !== '';
    const resetFilters = () => {
        setSearchTerm(''); setCategory('ALL'); setCostFilter('ALL'); setRegionFilter('ALL');
    };
    const [viewMode, setViewMode] = useState<'SELECTION' | 'EDITOR'>('SELECTION');

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


    const clearDeck = () => {
        if (Object.keys(localDeck).length === 0) return;

        setConfirmModal({
            title: "CLEAR DECK",
            message: "确定要清空当前卡组中的所有卡牌吗？\n(Are you sure you want to clear the current deck?)",
            type: 'danger',
            onConfirm: () => {
                eventBus.emit(GameEvents.UI_BACK); // 播放撤回/删除音效
                setLocalDeck({});
                setIsDirty(true);
                setConfirmModal(null); // 关闭弹窗
            }
        });
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
            message: "Are you sure you want to delete this deck? This action cannot be undone.",
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
            if (category === 'SPELL' && !card.type.includes('spell')) return false;
            if (category === 'UNIT' && card.type.includes('spell')) return false;

            if (regionFilter !== 'ALL' && card.region !== regionFilter) return false;
            if (costFilter !== 'ALL') {
                if (costFilter === '10+' && card.cost < 10) return false;
                if (costFilter !== '10+' && card.cost.toString() !== costFilter) return false;
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


    const visibleCards = useMemo(() => {
        const isAdmin = userSystem.userId === 'dev_full_admin'; // [新增] 识别开发者权限

        return Object.values(CARD_DB).filter(c => {
            // [核心新增] 构筑白名单拦截：如果不是开发者，且该卡被标记为不可收集，则直接隐藏！
            if (!isAdmin && c.isCollectible === false) return false;

            // 1. 基础搜索
            if (searchTerm && !c.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;

            // 2. 类型过滤
            if (category === 'HERO' && !c.isChampion) return false;
            if (category === 'SPELL' && !c.type.includes('spell')) return false;
            if (category === 'UNIT' && (c.isChampion || c.type.includes('spell'))) return false;

            // 3. 阵营过滤
            if (regionFilter !== 'ALL' && c.region !== regionFilter) return false;

            // 4. 费用过滤
            if (costFilter !== 'ALL') {
                if (costFilter === '10+' && c.cost < 10) return false;
                if (costFilter !== '10+' && c.cost.toString() !== costFilter) return false;
            }

            return true;
        });
    }, [searchTerm, category, costFilter, regionFilter, userSystem.collection, userSystem.userId]); // [修改] 补充 userId 依赖

    const handleStart = () => {
        if (stats.total !== 40) return;

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
                    <h1 className="text-4xl font-black italic tracking-tighter drop-shadow-[0_0_20px_rgba(59,130,246,0.6)]">PREPARATION HUB</h1>
                    <div className="absolute right-32 bottom-4 flex bg-black/80 p-1 rounded-lg border border-white/10 shadow-inner">
                        <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setViewStyle('GRID'); }} className={`p-2 rounded transition-colors ${viewStyle === 'GRID' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-300'}`}><LayoutGrid size={18} /></button> {/* [新增] 音效 */}
                        <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setViewStyle('CAROUSEL'); }} className={`p-2 rounded transition-colors ${viewStyle === 'CAROUSEL' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-300'}`}><GalleryHorizontalEnd size={18} /></button> {/* [新增] 音效 */}
                    </div>
                </div>

                <button onClick={handleGlobalBack} className="absolute top-8 right-8 z-50 p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all group"><ArrowLeft size={24} className="text-gray-400 group-hover:text-white" /></button>

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
                            <motion.div initial={{ x: -60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="w-80 h-[85vh] bg-slate-900/90 border border-white/10 rounded-3xl flex flex-col mr-12 shadow-[0_30px_60px_rgba(0,0,0,0.8)] relative overflow-hidden" onContextMenu={(e) => e.stopPropagation()}>
                                <div className="p-5 bg-black/40 font-black text-gray-400 tracking-[0.3em] text-center border-b border-white/10 shrink-0 z-20">DECK PREVIEW</div>

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
                                                <div key={key} className="relative flex items-center h-12 bg-gray-800/90 rounded-lg border border-gray-700/60 hover:border-blue-500 overflow-hidden cursor-help" {...bindGazeEvents(card)}>
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
                                    <button onClick={() => handleEnterDeck(hubDeckId)} className="flex-1 p-4 bg-blue-900 hover:bg-blue-600 text-white font-black tracking-widest rounded-xl transition-all">EDIT DECK</button>
                                </div>
                            </motion.div>

                            {/* 正中心：主角微缩景观展示与发车按钮 */}
                            <div className="flex flex-col items-center gap-12 z-50 mx-6">
                                <DeckDiorama deck={hubDeck} covers={getDeckCovers(hubDeck.cards, hubDeck.skinOverrides)} cardBackImg={PERSONALIZATION_ASSETS.cardBacks[hubDeck.cardBackIndex ?? userSystem.settings.customization.currentCardBackIndex]} boardImg={PERSONALIZATION_ASSETS.desks[hubDeck.boardIndex ?? userSystem.settings.customization.currentDeskIndex]} isHub={true} />

                                {/* 拦截拦截发车按钮 */}
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); if (isFull) onStartGame(Object.entries(hubDeck.cards).flatMap(([k, c]: any) => Array(c).fill(k))); }} // [新增] 音效
                                    disabled={!isFull}
                                    className={`w-72 py-5 rounded-2xl font-black text-2xl tracking-[0.2em] flex items-center justify-center gap-3 transition-all ${isFull ? 'bg-gradient-to-r from-blue-600 to-cyan-400 text-white hover:scale-110 shadow-[0_10px_40px_rgba(59,130,246,0.6)] border border-cyan-300/20' : 'bg-gray-900/80 text-red-500 cursor-not-allowed border border-red-900/50 backdrop-blur-md'}`}
                                >
                                    <Play fill="currentColor" size={24} /> {isFull ? 'START GAME' : '卡组未满 (ERROR)'}
                                </button>
                            </div>

                            {/* 右侧翼：完美复刻抽屉逻辑的个性化大面板 */}
                            {/* [关键修正] 去掉 overflow-hidden 改为 overflow-visible，允许悬浮预览图溢出外侧！ */}
                            {/* [修复] 将 h-[85vh] 改为 h-fit pb-10，让面板高度自适应内部的两个按钮，去除多余空白 */}
                            <motion.div initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="w-72 h-fit pb-10 bg-[#1e293b]/90 border border-white/10 rounded-3xl flex flex-col ml-12 shadow-2xl relative overflow-visible backdrop-blur-md z-40" onContextMenu={(e) => e.stopPropagation()}>
                                <div className="p-5 bg-black/40 font-black text-gray-400 tracking-[0.3em] text-center border-b border-white/10 shrink-0 mb-4">CUSTOMIZE</div>

                                {/* [修复] 稍微缩小 gap-16 为 gap-10，让上下图标布局更紧凑 */}
                                <div className="flex-1 flex flex-col justify-center items-center gap-10 px-6 relative">
                                    {/* 悬停大图预览 (Floating Preview) - 完美复原抽屉的原生体验 */}
                                    {/* [修复] 将 right-[110%] 改为 left-[105%]，让大图朝向画面最右侧空旷区域弹出，完美避开中心卡组 */}
                                    {hubHoverItem && (
                                        <div className="absolute left-[105%] top-1/2 -translate-y-1/2 pointer-events-none animate-fade-in z-50">
                                            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl rounded-xl -m-4"></div>
                                            <div className={`relative border-2 border-orange-500/50 rounded-lg overflow-hidden shadow-2xl ${hubHoverItem === 'cardBack' ? 'w-[240px] h-[360px]' : 'w-[400px] h-[225px]'}`}>
                                                <img src={hubHoverItem === 'cardBack' ? PERSONALIZATION_ASSETS.cardBacks[hubDeck.cardBackIndex ?? userSystem.settings.customization.currentCardBackIndex] : PERSONALIZATION_ASSETS.desks[hubDeck.boardIndex ?? userSystem.settings.customization.currentDeskIndex]} className="w-full h-full object-cover" alt="Preview" />
                                                <div className="absolute bottom-0 w-full bg-black/60 text-white text-center text-xs py-1 font-mono tracking-widest backdrop-blur-sm">PREVIEW</div>
                                            </div>
                                        </div>
                                    )}

                                    {/* 卡背更换大按钮 - 还原原生 group-hover 倾斜特效 */}
                                    <div className="flex flex-col items-center gap-4 w-full">
                                        <span className="text-xs text-yellow-600 font-bold tracking-widest uppercase">Card Back</span>
                                        <div
                                            className="relative group cursor-pointer"
                                            onMouseEnter={() => setHubHoverItem('cardBack')}
                                            onMouseLeave={() => setHubHoverItem(null)}
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setSelectorType('cardBack'); }} // [新增] 音效
                                        >
                                            <div className="w-32 h-48 rounded-lg overflow-hidden border-2 border-white/20 shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-[15deg] group-hover:border-orange-500 group-hover:shadow-[0_0_20px_orange] z-10 relative bg-black">
                                                <img src={PERSONALIZATION_ASSETS.cardBacks[hubDeck.cardBackIndex ?? userSystem.settings.customization.currentCardBackIndex]} className="w-full h-full object-cover" alt="Card Back" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* 棋盘桌垫更换大按钮 - 还原原生 group-hover 倾斜特效 */}
                                    <div className="flex flex-col items-center gap-4 w-full">
                                        <span className="text-xs text-yellow-600 font-bold tracking-widest uppercase">Battlefield Mat</span>
                                        <div
                                            className="relative group cursor-pointer"
                                            onMouseEnter={() => setHubHoverItem('desk')}
                                            onMouseLeave={() => setHubHoverItem(null)}
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setSelectorType('desk'); }} // [新增] 音效
                                        >
                                            <div className="w-48 h-28 rounded-lg overflow-hidden border-2 border-white/20 shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:-rotate-[15deg] group-hover:border-orange-500 group-hover:shadow-[0_0_20px_orange] z-10 relative bg-black">
                                                <img src={PERSONALIZATION_ASSETS.desks[hubDeck.boardIndex ?? userSystem.settings.customization.currentDeskIndex]} className="w-full h-full object-cover" alt="Board" />
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
                                onViewArt={(c) => setViewCard(c)}
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
                        />
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="w-full h-full flex bg-[#0f172a] text-white overflow-hidden font-sans">
             {/* [新增] 右上角返回按钮 (绝对定位，位于最上层) */}
             <AnimatePresence>
                {confirmModal && (
                    <div
                        className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
                        onClick={() => { eventBus.emit(GameEvents.UI_BACK); setConfirmModal(null); }} // [新增] 音效 点击背景关闭
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-slate-900 border border-red-500/30 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center relative overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* 红色警示光效 */}
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent"></div>

                            <div className="flex flex-col items-center gap-4 mb-6">
                                <div className="p-4 bg-red-500/10 rounded-full">
                                    <AlertTriangle size={32} className="text-red-500" />
                                </div>
                                <h3 className="text-2xl font-black text-white tracking-widest">{confirmModal.title}</h3>
                                <p className="text-gray-300 whitespace-pre-line leading-relaxed">
                                    {confirmModal.message}
                                </p>
                            </div>

                            <div className="flex gap-4 justify-center">
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_BACK); setConfirmModal(null); }} // [新增] 音效
                                    className="flex-1 py-3 rounded-lg border border-white/10 hover:bg-white/5 text-gray-300 font-bold transition-colors"
                                >
                                    CANCEL
                                </button>
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); confirmModal.onConfirm(); }} // [新增] 音效
                                    className="flex-1 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all hover:scale-105"
                                >
                                    CONFIRM
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {onBack && (
                <button
                    onClick={() => {
                        eventBus.emit(GameEvents.UI_BACK);
                        handleGlobalBack(); // <--- 改为这个
                    }}
                    // [修复] 将 right-[340px] 改为 right-8，移至屏幕最右上角，彻底避开筛选栏
                    className="absolute top-6 right-8 z-50 p-3 bg-[#1e293b] border border-gray-600 rounded-full hover:bg-slate-700 hover:border-white/50 transition-all shadow-lg group"
                    title="Back"
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
                onViewArt={(c) => setViewCard(c)}
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
                            {/* Category Buttons */}
                            <div className="flex gap-1 bg-slate-800 p-1 rounded-md">
                                <button onClick={()=>{ eventBus.emit(GameEvents.UI_CLICK); setCategory('HERO'); }} className={`p-1.5 px-3 rounded-sm text-sm font-bold flex items-center gap-1 ${category==='HERO'?'bg-yellow-600 text-white shadow-sm':'text-gray-400 hover:bg-white/5'}`}><User size={14}/> 英雄</button> {/* [新增] 音效 */}
                                <button onClick={()=>{ eventBus.emit(GameEvents.UI_CLICK); setCategory('SPELL'); }} className={`p-1.5 px-3 rounded-sm text-sm font-bold flex items-center gap-1 ${category==='SPELL'?'bg-blue-600 text-white shadow-sm':'text-gray-400 hover:bg-white/5'}`}><Zap size={14}/> 法术</button> {/* [新增] 音效 */}
                                <button onClick={()=>{ eventBus.emit(GameEvents.UI_CLICK); setCategory('UNIT'); }} className={`p-1.5 px-3 rounded-sm text-sm font-bold flex items-center gap-1 ${category==='UNIT'?'bg-orange-600 text-white shadow-sm':'text-gray-400 hover:bg-white/5'}`}><Box size={14}/> 单位</button> {/* [新增] 音效 */}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
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

                    {/* Advanced Filters Dropdown */}
                    <AnimatePresence>
                        {isFilterOpen && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden w-full px-4">
                                <div className="p-4 bg-slate-800 rounded-md mt-3 flex gap-8 border border-white/5 shadow-inner">
                                    {/* Cost */}
                                    <div>
                                        <span className="text-xs text-gray-400 font-bold tracking-widest block mb-2">费用 (COST)</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {['ALL', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '10+'].map(c => (
                                                <button key={c} onClick={()=>{ eventBus.emit(GameEvents.UI_CLICK); setCostFilter(c); }} className={`w-8 h-8 rounded-full text-xs font-mono font-bold flex items-center justify-center transition-all ${costFilter===c ? 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]':'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}> {/* [新增] 音效 */}
                                                    {c}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Region */}
                                    <div>
                                        <span className="text-xs text-gray-400 font-bold tracking-widest block mb-2">阵营 (REGION)</span>
                                        <div className="flex flex-wrap gap-2">
                                            {['ALL', 'Lyfe', 'Fenny', 'Pupu', 'Logistics', 'TEST'].map(r => (
                                                <button key={r} onClick={()=>{ eventBus.emit(GameEvents.UI_CLICK); setRegionFilter(r); }} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${regionFilter===r ? 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]':'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}> {/* [新增] 音效 */}
                                                    {r === 'Lyfe' ? '里芙' : r === 'Pupu' ? '卜卜' :r === 'Fenny' ? '芬妮' : r === 'Logistics' ? '后勤' : r === 'TEST' ? '测试' : '全部'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
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
                        {/* [修改] 移除了左侧边栏后空间大增，增加列数到 5~6 列 (lg:grid-cols-5 xl:grid-cols-6) */}
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 pb-32">
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
                                onContextMenu={(e) => { e.preventDefault(); setViewCard(fullCard); }}
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
                                        skinId={userSystem.activeDeck?.skinOverrides?.[card.key] || 0} // [核心修复] 给中间网格的卡牌通电！让它读取当前选中卡组的皮肤！
                                        isFaceUp={true}
                                        onViewArt={(c) => setViewCard(c)}
                                        // [关键修改] 永远隐藏内部的小购物车图标
                                        // 因为我们要用外面的大按钮来统一负责购买，防止内部图标变灰
                                        showShopIcon={false}
                                        ownedCount={ownedCount}
                                    />
                                </div>

                                {/* [关键修改] 外部大购买按钮 */}
                                {/* 条件改为 canBuy：只要没买满3张，这个按钮就一直悬浮在最上层，保持彩色 */}
                                {canBuy && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setViewCard(fullCard); // 点击购物车打开详情页(含购买逻辑)
                                        }}
                                        // 保持 z-10 防止遮挡右侧侧边栏
                                        className="absolute -top-2 -left-2 z-10 w-10 h-10 bg-blue-600 hover:bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg border-2 border-white/20 transition-transform hover:scale-110"
                                        title="Purchase Card"
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

                                {/* 数量角标 (保持不变) */}
                                {inDeckCount > 0 && (
                                    <div className="absolute -top-3 -right-3 w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center font-bold shadow-lg border-2 border-white z-20">
                                        {inDeckCount}
                                    </div>
                                )}

                                {/* 快速添加闪电按钮 (保持不变) */}
                                {!isLocked && !isMaxed && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); quickAdd(card.key); }}
                                        className="absolute top-1/2 right-4 -translate-y-1/2 w-12 h-12 bg-blue-600/90 hover:bg-blue-500 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all shadow-xl border-2 border-white/50 z-10 hover:scale-110 backdrop-blur-sm"
                                        title="Quick Add (Max 3)"
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
            <div className="w-80 bg-[#1e293b] border-l border-gray-700 flex flex-col z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.3)]">

                <PersonalizationDrawer
                    currentCardBackIndex={userSystem.settings.customization.currentCardBackIndex}
                    currentDeskIndex={userSystem.settings.customization.currentDeskIndex}
                    unlockedCardBacks={userSystem.settings.unlockedCardBacks}
                    unlockedDesks={userSystem.settings.unlockedDesks}
                    onSetCardBack={userSystem.setCardBack}
                    onSetDesk={userSystem.setDesk}
                />

                {/* [修改] 卡组选择与管理区域 */}
                <div className="p-6 border-b border-gray-700 mt-16 space-y-4">

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
                            {/* [新增] 清空按钮 */}
                            <button
                                onClick={clearDeck}
                                className="p-2 hover:bg-red-500/20 text-gray-500 hover:text-red-500 rounded transition-colors"
                                title="Clear Deck"
                            >
                                <Eraser size={18} />
                            </button>
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

                {/* [移植] 统计面板 (Stats UI) 移至右侧，并做了现代化视觉升级 */}
                <div className="px-6 py-4 border-b border-gray-700 bg-slate-800/50">
                    <div className="flex justify-between mb-2">
                        <span className="text-gray-400 text-sm font-bold tracking-widest">DECK SIZE</span>
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
                        {Object.entries(localDeck).map(([key, count]) => {
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
                                    title="Remove All"
                                >
                                    <Trash2 size={16} />
                                </button>

                                {/* 卡牌条目本体 (点击依然是减1) */}
                                <div
                                    className="flex-1 relative h-full bg-gray-800 rounded-r-md overflow-hidden border border-gray-700 hover:border-blue-500 transition-all cursor-pointer"
                                    onClick={() => removeFromDeck(key)}
                                    onContextMenu={(e) => { e.preventDefault(); setViewCard(fullCard); }}
                                    {...bindGazeEvents(card)}
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
                    <button
                        onClick={autoFillDeck}
                        className="w-full py-3 rounded-lg border border-blue-500/30 text-blue-400 font-bold hover:bg-blue-500/10 transition-all flex items-center justify-center gap-2"
                    >
                        <Wand2 size={18} /> 快速选择
                    </button>

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
                                if (stats.total === 40) eventBus.emit(GameEvents.LOBBY_START_BATTLE);
                                handleStart();
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
            {viewCard && (
                <FullArtOverlay
                    card={viewCard}
                    onClose={() => setViewCard(null)}
                    onBuy={(count, cost) => userSystem.purchaseCard(viewCard.key, count, cost)}
                    ownedCount={getOwnedCount(viewCard.key)}
                    playerSilver={userSystem.collection?.resources.silverCoin || 0}
                    // [皮肤] 传递皮肤数据
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
                />
            )}
        </div>
    );
};