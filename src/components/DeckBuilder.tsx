import React, { useState, useMemo,useEffect} from 'react';
import { Search, Zap, Shield, LayoutGrid, List as ListIcon, Play, Trash2, Wand2, Box, Save, Plus, ChevronDown } from 'lucide-react';
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

        // 1. 规则限制 (每种最多3张)
        if (currentCount >= 3) return;
        // 2. 英雄限制 (最多6张)
        if (card.isChampion && stats.champions + 1 > 6) return;

        // 3. [新增] 资产限制 (不能添加未拥有的卡)
        // const ownedCount = getOwnedCount(key);
        // if (currentCount >= ownedCount) {
        //     // alert("你没有更多的该卡牌了！"); // 可选提示
        //     return;
        // }

        setLocalDeck(prev => ({ ...prev, [key]: currentCount + 1 }));
        setIsDirty(true);
    };

    const removeFromDeck = (key: string) => {
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

    const handleSaveDeck = () => {
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
        // 创建一个全新的空卡组
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
        if (confirm("Are you sure you want to delete this deck?")) {
            userSystem.deleteDeck(id);
        }
    };
    const autoFillDeck = () => {
        const remaining = 40 - stats.total;
        if (remaining <= 0) return;

        // [修改] 仅从拥有的卡牌中，且符合当前筛选条件（阵营/搜索）的卡牌中随机填充
        const available = Object.keys(CARD_DB).filter(key => {
            const card = CARD_DB[key];

            // 1. 基础限制
            if (card.isChampion) return false; // 简单起见不填英雄
            if (getOwnedCount(key) <= 0) return false; // 必须拥有

            // 2. [新增] 联动搜索框
            if (searchTerm && !card.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;

            // 3. [新增] 联动左侧阵营筛选
            if (filterRegion === 'LYFE' && card.region !== 'Lyfe') return false;
            if (filterRegion === 'FENNY' && card.region !== 'Fenny') return false;
            if (filterRegion === 'LOGISTICS' && card.region !== 'Logistics') return false;
            // TEST 或 ALL 则不拦截

            return true;
        });

        const newDeck = { ...localDeck };
        let added = 0;

        while (added < remaining && available.length > 0) {
            const randomKey = available[Math.floor(Math.random() * available.length)];
            const currentCount = newDeck[randomKey] || 0;
            // 确保不超过拥有上限且不超过3张
            if (currentCount < 3 && currentCount < getOwnedCount(randomKey)) {
                newDeck[randomKey] = currentCount + 1;
                added++;
            }
        }
        setLocalDeck(newDeck);
        setIsDirty(true);
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
        <div className="w-full h-screen flex bg-[#0f172a] text-white overflow-hidden font-sans">
             {/* [新增] 右上角返回按钮 (绝对定位，位于最上层) */}
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
            <div className="w-80 bg-[#1e293b] border-r border-gray-700 flex flex-col p-6 z-20 shadow-xl">
                <h2 className="text-3xl font-black mb-8 tracking-tighter italic">DECK BUILDER</h2>

                {/* Search */}
                <div className="relative mb-8">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Search cards..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-[#334155] rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                </div>

                {/* Region Filters (保持不变) */}
                <div className="space-y-4 mb-8">
                    <h3 className="text-gray-500 font-mono text-sm tracking-widest pl-1">FACTION</h3>
                    <div className="flex flex-col gap-2">
                        <button onClick={() => setFilterRegion('ALL')} className={`text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${filterRegion === 'ALL' ? 'bg-white text-black font-bold' : 'text-gray-400 hover:bg-white/10'}`}>
                            <LayoutGrid size={18} /> ALL CARDS
                        </button>
                        <button onClick={() => setFilterRegion('LYFE')} className={`text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${filterRegion === 'LYFE' ? 'bg-blue-600 text-white font-bold shadow-[0_0_20px_#2563eb]' : 'text-gray-400 hover:bg-blue-900/30'}`}>
                            <Shield size={18} /> LYFE
                        </button>
                        <button onClick={() => setFilterRegion('FENNY')} className={`text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${filterRegion === 'FENNY' ? 'bg-yellow-500 text-black font-bold shadow-[0_0_20px_#eab308]' : 'text-gray-400 hover:bg-yellow-900/30'}`}>
                            <Zap size={18} /> FENNY
                        </button>
                        <button onClick={() => setFilterRegion('LOGISTICS')} className={`text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${filterRegion === 'LOGISTICS' ? 'bg-orange-600 text-white font-bold shadow-[0_0_20px_#ea580c]' : 'text-gray-400 hover:bg-orange-900/30'}`}>
                            <Box size={18} /> LOGISTICS
                        </button>
                        <button onClick={() => setFilterRegion('TEST')} className={`text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${filterRegion === 'TEST' ? 'bg-orange-600 text-white font-bold shadow-[0_0_20px_#ea580c]' : 'text-gray-400 hover:bg-orange-900/30'}`}>
                            <Box size={18} /> TEST
                        </button>
                    </div>
                </div>

                <div className="mt-auto">
                    {/* ... Stats UI 保持不变 ... */}
                    <div className="bg-[#0f172a] rounded-xl p-4 border border-gray-700">
                        <div className="flex justify-between mb-2">
                            <span className="text-gray-400">Cards</span>
                            <span className={`font-bold ${stats.total === 40 ? 'text-green-400' : 'text-white'}`}>{stats.total} / 40</span>
                        </div>
                        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(stats.total / 40) * 100}%` }}></div>
                        </div>
                        <div className="flex justify-between mt-4 text-xs text-gray-500 font-mono">
                            <span>CHAMP: {stats.champions}/6</span>
                            <span>SPELL: {stats.spells}</span>
                            <span>UNIT: {stats.units}</span>
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
                        // [新增] 如果该卡未拥有，显示锁定样式
                        const isLocked = ownedCount === 0;

                        return (
                            <div
                                key={card.key}
                                className={`group relative transition-all duration-300 ${isLocked ? 'opacity-50 grayscale' : 'hover:scale-105 hover:z-10'}`}
                                onContextMenu={(e) => { e.preventDefault(); setViewCard(card); }}
                            >
                                <div onClick={() => !isLocked && addToDeck(card.key)}>
                                    <Card
                                        data={card}
                                        location="deck-builder"
                                        isFaceUp={true}
                                        onViewArt={(c) => {const fullCard: CardData = {
                                        ...c,
                                        id: c.key + '_fullart', // 补全必选 id
                                        strikeCount: 0, // 补全必选 strikeCount
                                        animState: 'idle' as const, // 补全可选属性（解决类型缺失）
                                        damageTaken: 0,
                                        buffs: { power: 0, health: 0 },
                                        };
                                        setViewCard(fullCard);
                                        }}
                                    />
                                </div>

                                {isLocked && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="bg-black/80 px-3 py-1 rounded text-xs font-bold text-gray-400">LOCKED</div>
                                    </div>
                                )}

                                {/* Counter Badge */}
                                {inDeckCount > 0 && (
                                    <div className="absolute -top-3 -right-3 w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center font-bold shadow-lg border-2 border-white z-20">
                                        {inDeckCount}
                                    </div>
                                )}

                                {/* Remove Button */}
                                {inDeckCount > 0 && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeFromDeck(card.key); }}
                                        className="absolute -top-3 -left-3 w-8 h-8 bg-red-600 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg border-2 border-white z-20"
                                    >
                                        <Trash2 size={14} />
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
                                    <Plus size={16} /> NEW DECK
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
                        <Save size={16} /> {isDirty ? 'SAVE CHANGES' : 'SAVED'}
                    </button>
                </div>

                {/* 卡牌列表 (保持不变) */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {Object.entries(localDeck).map(([key, count]) => {
                        const card = CARD_DB[key];
                        // 兜底：防止 deleted cards 报错
                        if (!card) return null;

                        return (
                            <div
                                key={key}
                                className="relative group bg-gray-800 rounded-md overflow-hidden border border-gray-700 hover:border-blue-500 transition-all cursor-pointer h-12"
                                onClick={() => removeFromDeck(key)}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  const fullCard: CardData = {
                                    ...card,
                                    id: card.key + '_context', // 补全必选 id
                                    strikeCount: 0, // 补全必选 strikeCount
                                    animState: 'idle' as const, // 补全可选属性（解决类型缺失）
                                    damageTaken: 0,
                                    buffs: { power: 0, health: 0 },
                                 };
                                 setViewCard(fullCard);
                                }}
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
                        );
                    })}
                </div>

                {/* 底部操作区 */}
                <div className="p-6 bg-[#0f172a] border-t border-gray-700 space-y-3">
                    <button
                        onClick={autoFillDeck}
                        className="w-full py-3 rounded-lg border border-blue-500/30 text-blue-400 font-bold hover:bg-blue-500/10 transition-all flex items-center justify-center gap-2"
                    >
                        <Wand2 size={18} /> 快速选择 (Auto Fill)
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
                        <Play fill="currentColor" /> {stats.total === 40 ? 'START GAME' : 'INVALID DECK'}
                    </button>
                </div>
            </div>
            {viewCard && (
                <FullArtOverlay
                    card={viewCard}
                    onClose={() => setViewCard(null)}
                />
            )}
        </div>
    );
};