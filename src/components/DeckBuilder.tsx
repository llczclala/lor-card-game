import React, { useState, useMemo,useEffect} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Zap, Shield, LayoutGrid, List as ListIcon, Play, Trash2, Wand2, Box, Save, Plus, ChevronDown, ShoppingCart, Eraser, AlertTriangle } from 'lucide-react';
import { CARD_DB } from '../data/cards';
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
    onBack?: () => void; // [新增] 返回回调
}

type FilterRegion = 'ALL' | 'LYFE' | 'FENNY' | 'LOGISTICS' | 'TEST';

const toFullCardData = (staticData: any): CardData => ({
    ...staticData,
    id: 'preview_id', // 虚拟 ID
    strikeCount: 0,
    animState: 'idle',
    damageTaken: 0,
    buffs: { power: 0, health: 0 }
});

export const DeckBuilder: React.FC<DeckBuilderProps> = ({
    onStartGame,
    userSystem,
    onBack
}) => {

    const [localDeck, setLocalDeck] = useState<Record<string, number>>({});
    const [deckName, setDeckName] = useState("New Deck");
    const [isDirty, setIsDirty] = useState(false); // 标记是否有未保存的修改

    const [viewCard, setViewCard] = useState<CardData | null>(null);
    const [filterRegion, setFilterRegion] = useState<FilterRegion>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [showDeckList, setShowDeckList] = useState(false); // 控制卡组列表下拉框
    const [hoveredCardKey, setHoveredCardKey] = useState<string | null>(null);
    const hoverTimerRef = React.useRef<number | null>(null);
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

    const handleCreateNew = () => {
        eventBus.emit(GameEvents.UI_CLICK);
        const newId = `deck_${Date.now()}`;
        userSystem.saveDeck({
            id: newId,
            name: "New Deck",
            hero: 'lyfe',
            cards: {},
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
        userSystem.selectDeck(newId); // 切换过去
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
            if (card.isChampion) return false;
            if (getOwnedCount(key) <= 0) return false;
            if (searchTerm && !card.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            if (filterRegion === 'LYFE' && card.region !== 'Lyfe') return false;
            if (filterRegion === 'FENNY' && card.region !== 'Fenny') return false;
            if (filterRegion === 'LOGISTICS' && card.region !== 'Logistics') return false;
            if (filterRegion === 'TEST' && card.region !== 'TEST') return false;
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
            // 1. 基础过滤
            if (searchTerm && !c.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;

            // 2. 阵营过滤
            if (filterRegion === 'LYFE' && c.region !== 'Lyfe') return false;
            if (filterRegion === 'FENNY' && c.region !== 'Fenny') return false;
            if (filterRegion === 'LOGISTICS' && c.region !== 'Logistics') return false;
            if (filterRegion === 'TEST' && c.region !== 'TEST') return false;

            // 3. [新增] 收集模式过滤：如果不拥有该卡，是否显示？
            // 策略：显示，但置灰/带锁。这里我们先全部显示，在渲染时处理样式。
            // 如果您希望完全隐藏未拥有的卡，可以取消注释下面这行：
            // if (getOwnedCount(c.key) <= 0) return false;

            return true;
        });
    }, [searchTerm, filterRegion, userSystem.collection]); // 依赖 collection

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
                        onBack();
                    }}
                    className="absolute top-6 right-[340px] z-50 p-3 bg-[#1e293b] border border-gray-600 rounded-full hover:bg-slate-700 hover:border-white/50 transition-all shadow-lg group"
                    title="Back to Mode Select"
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
            {/* Right Sidebar - Current Deck & Customization */}
            <div className="w-80 bg-[#1e293b] border-l border-gray-700 flex flex-col z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.3)]">
                <h2 className="text-3xl font-black mb-8 tracking-tighter italic">备战环节</h2>

                {/* Search */}
                <div className="relative mb-8">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="搜索卡牌..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-[#334155] rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                </div>

                {/* Region Filters (保持不变) */}
                <div className="space-y-4 mb-8">
                    <h3 className="text-gray-500 font-mono text-sm tracking-widest pl-1">阵营</h3>
                    <div className="flex flex-col gap-2">
                        <button onClick={() => setFilterRegion('ALL')} className={`text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${filterRegion === 'ALL' ? 'bg-white text-black font-bold' : 'text-gray-400 hover:bg-white/10'}`}>
                            <LayoutGrid size={18} /> 全部
                        </button>
                        <button onClick={() => setFilterRegion('LYFE')} className={`text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${filterRegion === 'LYFE' ? 'bg-blue-600 text-white font-bold shadow-[0_0_20px_#2563eb]' : 'text-gray-400 hover:bg-blue-900/30'}`}>
                            <Shield size={18} /> 里芙
                        </button>
                        <button onClick={() => setFilterRegion('FENNY')} className={`text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${filterRegion === 'FENNY' ? 'bg-yellow-500 text-black font-bold shadow-[0_0_20px_#eab308]' : 'text-gray-400 hover:bg-yellow-900/30'}`}>
                            <Zap size={18} /> 芬妮
                        </button>
                        <button onClick={() => setFilterRegion('LOGISTICS')} className={`text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${filterRegion === 'LOGISTICS' ? 'bg-orange-600 text-white font-bold shadow-[0_0_20px_#ea580c]' : 'text-gray-400 hover:bg-orange-900/30'}`}>
                            <Box size={18} /> 后勤
                        </button>
                        <button onClick={() => setFilterRegion('TEST')} className={`text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${filterRegion === 'TEST' ? 'bg-orange-600 text-white font-bold shadow-[0_0_20px_#ea580c]' : 'text-gray-400 hover:bg-orange-900/30'}`}>
                            <Box size={18} /> 测试
                        </button>
                    </div>
                </div>

                <div className="mt-auto">
                    {/* ... Stats UI 保持不变 ... */}
                    <div className="bg-[#0f172a] rounded-xl p-4 border border-gray-700">
                        <div className="flex justify-between mb-2">
                            <span className="text-gray-400">卡牌</span>
                            <span className={`font-bold ${stats.total === 40 ? 'text-green-400' : 'text-white'}`}>{stats.total} / 40</span>
                        </div>
                        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(stats.total / 40) * 100}%` }}></div>
                        </div>
                        <div className="flex justify-between mt-4 text-xs text-gray-500 font-mono">
                            <span>天启者: {stats.champions}/6</span>
                            <span>发饰: {stats.spells}</span>
                            <span>单位: {stats.units}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content - Card Grid */}
            <div className="flex-1 p-8 overflow-y-auto">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 pb-32">
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

                            <button onClick={() => setShowDeckList(!showDeckList)} className="p-1 hover:bg-white/10 rounded">
                                <ChevronDown size={20} className={`transition-transform ${showDeckList ? 'rotate-180' : ''}`} />
                            </button>
                        </div>

                        {/* 下拉卡组列表 */}
                        {showDeckList && (
                            <div className="absolute top-full left-0 w-full bg-slate-800 border border-gray-600 rounded-lg shadow-2xl z-50 max-h-60 overflow-y-auto mt-2">
                                {userSystem.decks.map((d: {
                                 id: string;
                                 name: string;
                                 hero: string;
                                 cards: Record<string, number>;
                                 createdAt: number;
                                 updatedAt: number;
                                })=> (
                                    <div
                                        key={d.id}
                                        className="flex items-center justify-between p-3 hover:bg-slate-700 cursor-pointer border-b border-gray-700 last:border-0"
                                        onClick={() => {
                                            eventBus.emit(GameEvents.UI_CLICK);
                                            userSystem.selectDeck(d.id);
                                            setShowDeckList(false);
                                        }}
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-bold text-sm">{d.name}</span>
                                            <span className="text-xs text-gray-500">{new Date(d.updatedAt).toLocaleDateString()}</span>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteDeck(d.id); }}
                                            className="text-gray-500 hover:text-red-500 p-1"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                                <div
                                    className="p-3 text-center text-blue-400 hover:bg-slate-700 cursor-pointer font-bold flex items-center justify-center gap-2"
                                    onClick={() => {
                                        handleCreateNew();
                                        setShowDeckList(false);
                                    }}
                                >
                                    <Plus size={16} /> 新增卡组
                                </div>
                            </div>
                        )}
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