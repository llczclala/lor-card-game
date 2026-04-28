import React, { useState, useMemo,useEffect} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Zap, List as ListIcon, Play, Trash2, Wand2, Box, Save, Plus, ShoppingCart, Eraser, AlertTriangle, Filter, X, User } from 'lucide-react';
import { CARD_DB } from '../data/cards';
import { HERO_IMAGES } from '../data/imageData';
import { Card } from './Card';
import type { CardData } from '../types';
import { eventBus, GameEvents } from '../utils/eventBus';
import { FullArtOverlay } from './Overlays';
import { PersonalizationDrawer } from './PersonalizationDrawer';
import type { useUserSystem } from '../hooks/useUserSystem';
import { ArrowLeft } from 'lucide-react'; // [新增]



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

// --- [新增] 封面计算工具函数 ---
const getDeckCover = (cards: Record<string, number>): string => {
    const cardKeys = Object.keys(cards);
    if (cardKeys.length === 0) return HERO_IMAGES.lyfe.base; // 空卡组默认图

    // 排序逻辑: 英雄 > 单位 > 数量多 > 数量少
    const sorted = cardKeys.sort((a, b) => {
        const cardA = CARD_DB[a];
        const cardB = CARD_DB[b];
        if (!cardA || !cardB) return 0;

        // 1. 英雄优先
        if (cardA.isChampion !== cardB.isChampion) {
            return cardA.isChampion ? -1 : 1;
        }
        // 2. 数量多的优先
        const countA = cards[a];
        const countB = cards[b];
        if (countA !== countB) {
            return countB - countA;
        }
        // 3. 单位优先于法术
        const isUnitA = cardA.type.includes('unit');
        const isUnitB = cardB.type.includes('unit');
        if (isUnitA !== isUnitB) {
            return isUnitA ? -1 : 1;
        }
        return 0; // 保持默认顺序
    });

    // 返回排在第一位的图片，如果是法术或者没图，兜底回默认
    return CARD_DB[sorted[0]]?.imageUrl || HERO_IMAGES?.lyfe?.base || "";
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


    const [hoveredCardKey, setHoveredCardKey] = useState<string | null>(null);

    // [新增] 一键重置逻辑
    const isFilterActive = category !== 'ALL' || costFilter !== 'ALL' || regionFilter !== 'ALL' || searchTerm !== '';
    const resetFilters = () => {
        setSearchTerm(''); setCategory('ALL'); setCostFilter('ALL'); setRegionFilter('ALL');
    };
    const hoverTimerRef = React.useRef<number | null>(null);
    const [viewMode, setViewMode] = useState<'SELECTION' | 'EDITOR'>('SELECTION');

    // [新增] 进入特定卡组的编辑模式
    const handleEnterDeck = (deckId: string) => {
        eventBus.emit(GameEvents.UI_CLICK);
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
    // 鼠标进入列表项
    const handleDeckItemEnter = (key: string) => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
        setHoveredCardKey(key);
    };
    const [confirmModal, setConfirmModal] = useState<{
        title: string;
        message: string;
        onConfirm: () => void;
        type: 'danger' | 'info';
    } | null>(null);


    // 鼠标离开列表项
    const handleDeckItemLeave = () => {
        hoverTimerRef.current = window.setTimeout(() => {
            setHoveredCardKey(null);
        }); // 150ms 缓冲，允许用户把鼠标移到左侧预览图上
    };

    // 鼠标进入预览图 (保持显示)
    const handlePreviewEnter = () => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
    };

    // 鼠标离开预览图 (关闭)
    const handlePreviewLeave = () => {
        hoverTimerRef.current = window.setTimeout(() => {
            setHoveredCardKey(null);
        }, 150);
    };

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
        if (currentCount >= 3) return;
        if (currentCount >= ownedCount) return;
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

        const maxPerCard = 3; // 单卡上限
        const deckLimit = 40;
        const championLimit = 6;

        let wantToAdd = Math.min(maxPerCard, ownedCount) - currentCount;

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

        const matchingKeys = Object.keys(CARD_DB).filter(key => {
            const card = CARD_DB[key];
            if (card.isChampion) return false; // 自动填充依然排除英雄
            if (getOwnedCount(key) <= 0) return false;

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
            return currentCount < 3 && currentCount < getOwnedCount(key);
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
        return Object.values(CARD_DB).filter(c => {
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
    }, [searchTerm, category, costFilter, regionFilter, userSystem.collection]); // 依赖全套新状态

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

    // 如果处于“选择模式”，直接渲染选择界面并返回，不执行下方的编辑器渲染
    if (viewMode === 'SELECTION') {
        return (
            <div className="w-full h-full bg-[#0f172a] text-white flex flex-col items-center relative overflow-hidden font-sans">
                {/* 背景装饰 (保持在最底层) */}
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 pointer-events-none z-0"></div>

                {/* ================= [新增] 固定顶部的黑色头部容器 ================= */}
                {/* 1. absolute top-0 left-0 w-full: 绝对定位占满顶部
                    2. h-28: 设定固定高度 (与下方 grid 的 pt-28 对应)
                    3. bg-black: 纯黑背景托底
                    4. z-40: 确保层级高于滚动的网格内容
                    5. flex items-center justify-center: 让标题在容器内居中
                    6. border-b border-white/10 shadow-xl: 增加一点底部边界感和阴影，提升层次
                */}
                <div className="absolute top-0 left-0 w-full h-28 bg-black z-40 flex items-end pb-6 justify-center border-b border-white/10 shadow-xl">
                    {/* 标题 (移入容器内，移除自身的 absolute 和 top-8) */}
                    <h1 className="text-4xl font-black italic tracking-tighter drop-shadow-lg">
                        DECK SELECTION
                    </h1>
                </div>
                {/* [修改] 卡组网格容器：
                    1. pt-28: 给顶部标题留出空间
                    2. h-full: 撑满高度
                    3. max-w-full px-12: 增加横向宽度利用率
                    4. grid-cols-6: 改为 6 列
                    5. content-start: 确保内容紧贴顶部
                */}
                {/* [修复] 将确认弹窗移植到选择界面，否则弹窗无法显示 */}
                <AnimatePresence>
                    {confirmModal && (
                        <div
                            className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
                            onClick={() => setConfirmModal(null)}
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="bg-slate-900 border border-red-500/30 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center relative overflow-hidden"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent"></div>
                                <div className="flex flex-col items-center gap-4 mb-6">
                                    <div className="p-4 bg-red-500/10 rounded-full">
                                        <AlertTriangle size={32} className="text-red-500" />
                                    </div>
                                    <h3 className="text-2xl font-black text-white tracking-widest">{confirmModal.title}</h3>
                                    <p className="text-gray-300 whitespace-pre-line leading-relaxed">{confirmModal.message}</p>
                                </div>
                                <div className="flex gap-4 justify-center">
                                    <button onClick={() => setConfirmModal(null)} className="flex-1 py-3 rounded-lg border border-white/10 hover:bg-white/5 text-gray-300 font-bold transition-colors">CANCEL</button>
                                    <button onClick={confirmModal.onConfirm} className="flex-1 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all hover:scale-105">CONFIRM</button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* 返回按钮 */}
                <button
                    onClick={handleGlobalBack}
                    className="absolute top-8 right-8 z-50 p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all group"
                >
                    <ArrowLeft size={24} className="text-gray-400 group-hover:text-white" />
                </button>

                <div className="grid grid-cols-6 gap-6 w-full max-w-[95%] h-full overflow-y-auto pt-28 pb-12 px-8 z-0 content-start custom-scrollbar">

                    {/* 1. 新建卡组按钮 (样式微调，适应 grid-cols-6) */}
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleCreateAndEdit}
                        className="group relative w-full aspect-[3/4] rounded-xl border-4 border-dashed border-gray-600 hover:border-blue-400 hover:bg-blue-900/10 flex flex-col items-center justify-center transition-all cursor-pointer bg-slate-800/50"
                    >
                        {/* 稍微缩小图标 */}
                        <Plus size={32} className="text-gray-600 group-hover:text-blue-400 transition-colors mb-2" />
                        <span className="text-xs text-gray-500 font-bold tracking-widest group-hover:text-blue-300">NEW DECK</span>
                    </motion.button>

                    {/* 2. 现有卡组列表 */}
                    {userSystem.decks.map(deck => {
                        const coverUrl = getDeckCover(deck.cards);
                        const cardCount = (Object.values(deck.cards) as number[]).reduce((a: number, b: number) => a + b, 0);

                        return (
                            <motion.div
                                key={deck.id}
                                layoutId={deck.id}
                                onClick={() => handleEnterDeck(deck.id)}
                                whileHover={{ y: -5 }} // 稍微减小悬浮位移
                                className="relative w-full aspect-[3/4] group cursor-pointer perspective-1000"
                            >
                                {/* ... 内部 3D 样式保持不变 ... */}
                                {/* 3D 堆叠效果 */}
                                <div className="absolute top-1.5 left-1.5 w-full h-full bg-gray-800 rounded-xl border border-gray-700 shadow-xl z-0"></div>
                                <div className="absolute top-0.5 left-0.5 w-full h-full bg-gray-700 rounded-xl border border-gray-600 z-10"></div>

                                {/* 顶层封面 */}
                                <div className="absolute inset-0 bg-gray-900 rounded-xl border-2 border-gray-600 group-hover:border-blue-500 overflow-hidden z-20 shadow-lg transition-colors">
                                    <img src={coverUrl} alt="Cover" className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-500 group-hover:scale-110" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent"></div>

                                    {/* 信息文字 (字体调小一点适配小卡片) */}
                                    <div className="absolute bottom-0 left-0 w-full p-3">
                                        <h3 className="font-bold text-sm truncate text-white drop-shadow-md">{deck.name}</h3>
                                        <div className="flex justify-between items-center mt-1">
                                            <span className="text-[10px] font-mono text-gray-400">{new Date(deck.updatedAt).toLocaleDateString()}</span>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cardCount === 40 ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>
                                                {cardCount}/40
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteDeck(deck.id);
                                        }}
                                        className="absolute top-1 right-1 p-1.5 bg-black/60 hover:bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-all z-30"
                                    >
                                        <Trash2 size={12} className="text-white" />
                                    </button>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
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
                        onClick={() => setConfirmModal(null)} // 点击背景关闭
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
                                    onClick={() => setConfirmModal(null)}
                                    className="flex-1 py-3 rounded-lg border border-white/10 hover:bg-white/5 text-gray-300 font-bold transition-colors"
                                >
                                    CANCEL
                                </button>
                                <button
                                    onClick={confirmModal.onConfirm}
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
            <AnimatePresence mode="wait">
                {hoveredCardKey && CARD_DB[hoveredCardKey] && (
                    <motion.div
                        // [关键] 使用 hoveredCardKey 作为 key
                        // 这确保了每次切换卡牌时，React 都会视为“新组件”进行重绘
                        // 1. 触发进场动画
                        // 2. 强制数值直接渲染最终值，跳过任何“数字滚动”动画
                        key={hoveredCardKey}

                        className="absolute right-[350px] top-[250px] -translate-y-1/2 z-50 pointer-events-auto"
                        onMouseEnter={handlePreviewEnter}
                        onMouseLeave={handlePreviewLeave}

                        // 定义渐入缓冲动画 (淡入 + 轻微位移)
                        initial={{ opacity: 0, x: 0, scale: 1.1 }}
                        animate={{ opacity: 1, x: 0, scale: 1.25 }} // 保持 1.25 倍放大
                        exit={{ opacity: 0, x: 10, transition: { duration: 0.1 } }} // 快速退出
                        transition={{
                            type: "spring",
                            stiffness: 300,
                            damping: 25,
                            opacity: { duration: 0.2 }
                        }}
                    >
                        <div className="drop-shadow-2xl">
                            <Card
                                data={toFullCardData(CARD_DB[hoveredCardKey])}
                                location="preview"
                                isFaceUp={true}
                                onViewArt={(c) => setViewCard(c)}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

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
                                <button onClick={()=>setCategory('HERO')} className={`p-1.5 px-3 rounded-sm text-sm font-bold flex items-center gap-1 ${category==='HERO'?'bg-yellow-600 text-white shadow-sm':'text-gray-400 hover:bg-white/5'}`}><User size={14}/> 英雄</button>
                                <button onClick={()=>setCategory('SPELL')} className={`p-1.5 px-3 rounded-sm text-sm font-bold flex items-center gap-1 ${category==='SPELL'?'bg-blue-600 text-white shadow-sm':'text-gray-400 hover:bg-white/5'}`}><Zap size={14}/> 法术</button>
                                <button onClick={()=>setCategory('UNIT')} className={`p-1.5 px-3 rounded-sm text-sm font-bold flex items-center gap-1 ${category==='UNIT'?'bg-orange-600 text-white shadow-sm':'text-gray-400 hover:bg-white/5'}`}><Box size={14}/> 单位</button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Advanced Filters */}
                            <button
                                onClick={() => setIsFilterOpen(!isFilterOpen)}
                                className={`py-2 px-4 flex items-center justify-center gap-2 text-sm font-bold rounded-md transition-colors ${isFilterOpen ? 'bg-blue-600 text-white' : 'bg-slate-800 text-gray-300 hover:bg-slate-700'}`}
                            >
                                <Filter size={16} /> 高级筛选
                            </button>
                            {/* Reset */}
                            <button
                                onClick={resetFilters} disabled={!isFilterActive}
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
                                                <button key={c} onClick={()=>setCostFilter(c)} className={`w-8 h-8 rounded-full text-xs font-mono font-bold flex items-center justify-center transition-all ${costFilter===c ? 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]':'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}>
                                                    {c}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Region */}
                                    <div>
                                        <span className="text-xs text-gray-400 font-bold tracking-widest block mb-2">阵营 (REGION)</span>
                                        <div className="flex flex-wrap gap-2">
                                            {['ALL', 'Lyfe', 'Fenny', 'Logistics', 'TEST'].map(r => (
                                                <button key={r} onClick={()=>setRegionFilter(r)} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${regionFilter===r ? 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]':'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}>
                                                    {r === 'Lyfe' ? '里芙' : r === 'Fenny' ? '芬妮' : r === 'Logistics' ? '后勤' : r === 'TEST' ? '测试' : '全部'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* 卡牌网格区域 */}
                <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                    {/* [修改] 移除了左侧边栏后空间大增，增加列数到 5~6 列 (lg:grid-cols-5 xl:grid-cols-6) */}
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 pb-32">
                    {visibleCards.map(card => {
                        const ownedCount = getOwnedCount(card.key);
                        const inDeckCount = localDeck[card.key] || 0;
                        const isLocked = ownedCount === 0;
                        const fullCard = toFullCardData(card);

                        // [判断] 是否已达到最大上限（拥有量、卡组限制等）
                        // 注意：isMaxed 控制的是“能否放入卡组”，而不是“能否购买”
                        const isMaxed = isLocked || stats.total >= 40 || inDeckCount >= 3 || inDeckCount >= ownedCount;

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

                {/* 卡牌列表 (保持不变) */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
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
                                    onMouseEnter={() => handleDeckItemEnter(key)}
                                    onMouseLeave={handleDeckItemLeave}
                                >
                                    <div className="absolute inset-0 opacity-40 bg-cover bg-center" style={{ backgroundImage: `url(${card.imageUrl})` }}></div>
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
                />
            )}
        </div>
    );
};