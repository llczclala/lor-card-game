import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Plus, Trash2, Save, Download, X,
    Swords, Box, Zap, AlertTriangle, Filter, LayoutGrid, User
} from 'lucide-react';
import { CARD_DB } from '../../data/cards';
import { ENEMY_ARCHETYPES } from '../../data/enemies/archetypes';
import { Card } from '../Card';
import { FullArtOverlay } from '../Overlays'; // [植入精髓] 右键大图检视
import type { EnemyArchetype } from '../../data/enemies/archetypes';
import type { CardData } from '../../types';
import { HERO_IMAGES, PERSONALIZATION_ASSETS } from '../../data/imageData'; // [植入精髓]

// ============================================================
// 常量 & 辅助工具
// ============================================================
const STORAGE_KEY = 'dev_enemy_archetypes';
const AI_PERSONALITIES: EnemyArchetype['aiPersonality'][] = ['aggressive', 'control', 'balanced'];
const AI_LABELS: Record<string, string> = {
    aggressive: '🎯 激进',
    control: '🛡️ 控制',
    balanced: '⚖️ 均衡',
};

type CategoryFilter = 'ALL' | 'HERO' | 'SPELL' | 'UNIT';

const toFullCardData = (staticData: any): CardData => ({
    ...staticData,
    id: 'preview_id',
    strikeCount: 0,
    animState: 'idle',
    damageTaken: 0,
    buffs: { power: 0, health: 0 },
    roundBuffs: { power: 0, health: 0 },
    roundStrikes: 0,
});

// ============================================================
// [核心重构 1] 移植 2.5D 微缩景观 (DeckDiorama)
// ============================================================
const getDeckCovers = (arch: EnemyArchetype): string[] => {
    const covers: string[] = [];
    const champ = CARD_DB[arch.champion];
    covers.push(champ?.imageUrl || HERO_IMAGES.fenny.base); // 主封面必为英雄

    // 智能抓取核心池中最贵的两张卡作为左右副封面
    const sorted = [...arch.coreCards]
        .filter(k => CARD_DB[k] && !CARD_DB[k].isChampion)
        .sort((a, b) => CARD_DB[b].cost - CARD_DB[a].cost);

    covers.push(CARD_DB[sorted[0]]?.imageUrl || HERO_IMAGES.lyfe.base);
    covers.push(CARD_DB[sorted[1]]?.imageUrl || HERO_IMAGES.pupu_specular_soul.base);
    return covers;
};

const DIORAMA_SIZE = {
    containerWidth: 'w-64', containerHeight: 'h-64',
    cardWidth: 'w-24', cardHeight: 'h-36',
    boardWidth: 'w-[220px]', boardHeight: 'h-[120px]',
};

const EnemyDeckDiorama = ({ archetype }: { archetype: EnemyArchetype }) => {
    const covers = getDeckCovers(archetype);
    const cardBackImg = PERSONALIZATION_ASSETS.cardBacks[1]; // 固定采用反派质感卡背
    const boardImg = PERSONALIZATION_ASSETS.desks[0];

    return (
        <div className={`relative ${DIORAMA_SIZE.containerWidth} ${DIORAMA_SIZE.containerHeight} transition-all duration-500 scale-100 opacity-100 z-40 filter drop-shadow-[0_15px_35px_rgba(0,0,0,0.7)]`}>
            {/* 底层大棋盘背景 (压暗处理) */}
            <div className={`${DIORAMA_SIZE.boardWidth} ${DIORAMA_SIZE.boardHeight} absolute top-8 left-1/2 -translate-x-1/2 rounded-xl overflow-hidden border border-slate-700/80 shadow-2xl z-0`}>
                <img src={boardImg} className="w-full h-full object-cover opacity-50 grayscale-[40%]" alt="Board" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent"></div>
            </div>

            {/* 左侧扇形核心三卡 */}
            <div className="absolute top-10 left-6 z-20 pointer-events-none">
                {covers.map((url, i) => {
                    const rotations = [-16, 0, 16], translatesX = [0, 24, 48], translatesY = [12, 0, 12], zIndexes = [25, 23, 21];
                    return (
                        <div key={i} className={`${DIORAMA_SIZE.cardWidth} ${DIORAMA_SIZE.cardHeight} absolute rounded-xl border-2 border-slate-950 shadow-[5px_5px_15px_rgba(0,0,0,0.6)] overflow-hidden`}
                             style={{ transform: `translateX(${translatesX[i]}px) translateY(${translatesY[i]}px) rotate(${rotations[i]}deg)`, zIndex: zIndexes[i] }}>
                            <img src={url} className="w-full h-full object-cover" alt="Hero" />
                        </div>
                    )
                })}
            </div>

            {/* 右下角写实卡背堆叠 */}
            <div className={`absolute bottom-6 right-2 ${DIORAMA_SIZE.cardWidth} ${DIORAMA_SIZE.cardHeight} z-30 pointer-events-none`} style={{ transform: 'rotate(10deg) translate(20px, 12px)' }}>
                {[2, 1, 0].map(i => (
                    <div key={i} className="absolute inset-0 bg-slate-950 rounded-xl border border-slate-900 shadow-md" style={{ transform: `translate(-${i * 3}px, -${i * 3}px)`, zIndex: i === 0 ? 10 : 5 - i }}></div>
                ))}
                <div className="absolute inset-0 rounded-xl border-2 border-red-900/50 shadow-2xl overflow-hidden z-10">
                    <img src={cardBackImg} className="w-full h-full object-cover" alt="Card Back" />
                    <div className="absolute inset-0 bg-red-900/20 mix-blend-overlay"></div>
                </div>
            </div>

            {/* 铭牌 */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-slate-800/80 px-6 py-2 rounded-full z-40 flex flex-col items-center shadow-2xl backdrop-blur-md whitespace-nowrap min-w-[140px]">
                <span className="text-white font-black truncate w-full text-center text-sm tracking-wide text-red-400">{archetype.name}</span>
                <span className="text-[10px] font-mono font-bold tracking-widest text-gray-500">🎯 {archetype.coreCards.length} | 🃏 {archetype.preferredPool.length}</span>
            </div>
        </div>
    );
};

// ============================================================
// 主组件: 敌方大本营重构版
// ============================================================
export const EnemyDeckEditor: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
    // --- 状态流 ---
    const [archetypes, setArchetypes] = useState<Record<string, EnemyArchetype>>({});
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    // [核心重构 2] UI 排版流：拆分 目标池 和 查看 Tab，消灭弹窗
    const [targetPool, setTargetPool] = useState<'coreCards' | 'preferredPool'>('coreCards');
    const [activeListTab, setActiveListTab] = useState<'coreCards' | 'preferredPool'>('coreCards');
    const [searchTerm, setSearchTerm] = useState('');
    const [category, setCategory] = useState<CategoryFilter>('ALL');

    // [核心重构 3] 防卡死与悬浮大图机制接入
    const [hoveredCardKey, setHoveredCardKey] = useState<string | null>(null);
    const hoverTimerRef = useRef<number | null>(null);
    const [viewCard, setViewCard] = useState<CardData | null>(null);

    // --- 数据加载 ---
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            setArchetypes(stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(ENEMY_ARCHETYPES)));
        } catch { setArchetypes(JSON.parse(JSON.stringify(ENEMY_ARCHETYPES))); }
    }, []);

    useEffect(() => {
        const keys = Object.keys(archetypes);
        if (keys.length > 0 && (!selectedId || !archetypes[selectedId])) setSelectedId(keys[0]);
    }, [archetypes, selectedId]);

    const selected = selectedId ? archetypes[selectedId] : null;
    const championOptions = useMemo(() => Object.values(CARD_DB).filter(c => c.isChampion), []);

    // --- 增删改查 ---
    const updateArchetype = useCallback((updates: Partial<EnemyArchetype>) => {
        if (!selectedId) return;
        setArchetypes(prev => ({ ...prev, [selectedId]: { ...prev[selectedId], ...updates } }));
        setIsDirty(true);
    }, [selectedId]);

    const createArchetype = useCallback(() => {
        const newId = `new_archetype_${Date.now()}`;
        setArchetypes(prev => ({ ...prev, [newId]: { id: newId, name: '新流派', champion: 'fenny', description: '流派描述...', coreCards: ['fenny', 'fenny', 'fenny'], preferredPool: [], apocalypseTags: [], aiPersonality: 'balanced' } }));
        setSelectedId(newId); setIsDirty(true);
    }, []);

    const deleteArchetype = useCallback((id: string) => {
        if (!confirm(`确定要删除流派「${archetypes[id]?.name || id}」吗？此操作不可撤销。`)) return;
        setArchetypes(prev => { const n = { ...prev }; delete n[id]; return n; });
        setSelectedId(null); setIsDirty(true);
    }, [archetypes]);

    const addCardToPool = useCallback((cardKey: string) => {
        if (!selectedId || !selected) return;
        const current = [...selected[targetPool]];
        current.push(cardKey);
        updateArchetype({ [targetPool]: current });
        if (activeListTab !== targetPool) setActiveListTab(targetPool); // 智能切切页
    }, [selectedId, selected, targetPool, activeListTab, updateArchetype]);

    const removeCardFromPool = useCallback((field: 'coreCards' | 'preferredPool', index: number) => {
        if (!selectedId || !selected) return;
        const current = [...selected[field]];
        current.splice(index, 1);
        updateArchetype({ [field]: current });
    }, [selectedId, selected, updateArchetype]);

    // --- 防卡死悬停雷达 ---
    const handleCardEnter = useCallback((key: string) => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        setHoveredCardKey(key);
    }, []);

    const handleCardLeave = useCallback(() => {
        hoverTimerRef.current = window.setTimeout(() => setHoveredCardKey(null), 150);
    }, []);

    const handleContainerLeave = useCallback(() => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = window.setTimeout(() => setHoveredCardKey(null), 1000);
    }, []);

    // --- 导出与保存 ---
    const saveToLocal = useCallback(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(archetypes)); setIsDirty(false);
        const t = document.createElement('div');
        t.textContent = '✅ 已保存到本地存储';
        t.className = 'fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-[9999] text-sm animate-fade-in';
        document.body.appendChild(t); setTimeout(() => t.remove(), 2000);
    }, [archetypes]);

    const exportToClipboard = useCallback(() => {
        const lines: string[] = [ `import type { EnemyArchetype } from './archetypes';`, '', `export const ENEMY_ARCHETYPES: Record<string, EnemyArchetype> = {` ];
        for (const [id, arch] of Object.entries(archetypes)) {
            lines.push(`    '${id}': {`, `        id: '${id}',`, `        name: '${arch.name}',`, `        champion: '${arch.champion}',`, `        description: '${arch.description}',`, `        coreCards: [${arch.coreCards.map(c => `'${c}'`).join(', ')}],`, `        preferredPool: [${arch.preferredPool.map(c => `'${c}'`).join(', ')}],`, `        apocalypseTags: [${arch.apocalypseTags.map(t => `'${t}'`).join(', ')}],`, `        aiPersonality: '${arch.aiPersonality}',`, `    },`);
        }
        lines.push('};');
        navigator.clipboard.writeText(lines.join('\n')).then(() => {
            const t = document.createElement('div');
            t.innerHTML = '✅ TS 代码已复制！<br><span style="font-size:11px;opacity:0.8">粘贴至 archetypes.ts</span>';
            t.className = 'fixed top-4 right-4 bg-blue-600 text-white px-5 py-3 rounded-lg shadow-lg z-[9999] text-sm';
            document.body.appendChild(t); setTimeout(() => t.remove(), 3000);
        });
    }, [archetypes]);

    // 网格数据计算
    const visibleCards = useMemo(() => {
        return Object.values(CARD_DB).filter(c => {
            if (searchTerm && !c.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            if (category === 'HERO' && !c.isChampion) return false;
            if (category === 'SPELL' && !c.type?.includes('spell')) return false;
            if (category === 'UNIT' && (c.isChampion || c.type?.includes('spell'))) return false;
            return true;
        });
    }, [searchTerm, category]);

    const getCardCountInTargetPool = useCallback((key: string) => {
        if (!selected) return 0;
        return selected[targetPool].filter(k => k === key).length;
    }, [selected, targetPool]);

    return (
        <div className="w-full h-full flex bg-[#0f172a] text-white overflow-hidden font-sans relative">

            {/* ==================== 1. 左栏：流派列表 ==================== */}
            <div className="w-[280px] h-full border-r border-white/10 flex flex-col bg-slate-900/90 backdrop-blur-md shrink-0 relative z-20">
                <div className="p-5 border-b border-white/10 bg-black/40">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-black text-gray-300 uppercase tracking-[0.2em]">敌方流派</h2>
                        <span className="text-xs text-gray-500 bg-slate-800 px-2 py-0.5 rounded-full">{Object.keys(archetypes).length}</span>
                    </div>
                    <button onClick={createArchetype}
                        className="w-full py-2.5 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold tracking-wider transition-all shadow-[0_0_20px_rgba(37,99,235,0.2)]">
                        <Plus size={18} /> 新建流派
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {Object.entries(archetypes).map(([id, arch]) => (
                        <div key={id} onClick={() => setSelectedId(id)}
                            className={`group relative cursor-pointer border-b border-white/5 transition-all ${selectedId === id ? 'bg-slate-800/80 border-l-4 border-l-red-500 shadow-inner' : 'hover:bg-slate-800/50 border-l-4 border-l-transparent'}`}>
                            <div className="px-5 py-4">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-bold tracking-wide">{arch.name}</span>
                                    <button onClick={e => { e.stopPropagation(); deleteArchetype(id); }}
                                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-600/20 text-gray-500 hover:text-red-400 transition-all">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                                <div className="text-xs text-gray-500 space-y-0.5 font-mono">
                                    <div>👑 {CARD_DB[arch.champion]?.name || arch.champion}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ==================== 2. 中栏：卡牌网格大舞台 ==================== */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#0f172a] relative z-10">
                {selected ? (
                    <>
                        <div className="p-4 border-b border-white/10 bg-slate-900 shadow-md z-10 shrink-0">
                            <div className="flex items-center justify-between gap-4 px-4">
                                {/* 目标投递点切换 (极简 Toggle) */}
                                <div className="flex items-center gap-2 bg-slate-800 p-1.5 rounded-lg border border-white/5">
                                    <button onClick={() => setTargetPool('coreCards')}
                                        className={`px-4 py-2 rounded-md font-black text-sm tracking-widest transition-all flex items-center gap-2 ${targetPool === 'coreCards' ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'text-gray-500 hover:text-white'}`}>
                                        🎯 添至核心池
                                    </button>
                                    <button onClick={() => setTargetPool('preferredPool')}
                                        className={`px-4 py-2 rounded-md font-black text-sm tracking-widest transition-all flex items-center gap-2 ${targetPool === 'preferredPool' ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.5)]' : 'text-gray-500 hover:text-white'}`}>
                                        🃏 添至倾向池
                                    </button>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="relative w-48 xl:w-64">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                        <input type="text" placeholder="搜索卡牌..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                            className="w-full bg-slate-800 rounded-md py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all" />
                                    </div>
                                    <div className="flex gap-1 bg-slate-800 p-1 rounded-md">
                                        <button onClick={()=>setCategory('HERO')} className={`p-1.5 px-3 rounded-sm text-sm font-bold flex items-center gap-1 ${category==='HERO'?'bg-yellow-600 text-white shadow-sm':'text-gray-400 hover:bg-white/5'}`}><User size={14}/> 英雄</button>
                                        <button onClick={()=>setCategory('SPELL')} className={`p-1.5 px-3 rounded-sm text-sm font-bold flex items-center gap-1 ${category==='SPELL'?'bg-blue-600 text-white shadow-sm':'text-gray-400 hover:bg-white/5'}`}><Zap size={14}/> 法术</button>
                                        <button onClick={()=>setCategory('UNIT')} className={`p-1.5 px-3 rounded-sm text-sm font-bold flex items-center gap-1 ${category==='UNIT'?'bg-orange-600 text-white shadow-sm':'text-gray-400 hover:bg-white/5'}`}><Box size={14}/> 单位</button>
                                        {category !== 'ALL' && (<button onClick={()=>setCategory('ALL')} className="p-1.5 px-2 rounded-sm text-gray-400 hover:bg-red-500 hover:text-white transition-colors"><X size={14}/></button>)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 卡牌网格区域 (支持左键添加，右键看大图) */}
                        <div className="flex-1 p-8 overflow-y-auto custom-scrollbar relative">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(30,58,138,0.1)_0%,transparent_70%)] pointer-events-none"></div>
                            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 pb-32 relative z-10">
                                {visibleCards.map(c => {
                                    const count = getCardCountInTargetPool(c.key);
                                    return (
                                        <div key={c.key} className="group relative hover:scale-105 transition-all duration-300 cursor-pointer"
                                             onClick={() => addCardToPool(c.key)}
                                             onContextMenu={(e) => { e.preventDefault(); setViewCard(toFullCardData(c)); }}>
                                            <div className={`ring-2 ring-transparent rounded-xl transition-all shadow-lg ${targetPool === 'coreCards' ? 'group-hover:ring-blue-500 group-hover:shadow-[0_0_20px_rgba(59,130,246,0.4)]' : 'group-hover:ring-purple-500 group-hover:shadow-[0_0_20px_rgba(147,51,234,0.4)]'}`}>
                                                <Card data={toFullCardData(c)} location="deck-builder" isFaceUp={true} showShopIcon={false} />
                                            </div>
                                            {/* 已加数量角标 */}
                                            {count > 0 && (
                                                <div className={`absolute -top-3 -right-3 w-8 h-8 rounded-full text-white font-black flex items-center justify-center border-2 border-slate-900 shadow-lg z-20 ${targetPool === 'coreCards' ? 'bg-blue-600' : 'bg-purple-600'}`}>
                                                    {count}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                        <LayoutGrid size={64} className="opacity-20 mb-4" />
                        <span className="text-xl font-bold tracking-widest uppercase">请从左侧选择或新建流派</span>
                    </div>
                )}
            </div>

            {/* ==================== 3. 右栏：深度设置与卡牌管理 ==================== */}
            {selected && (
                <div className="w-[400px] bg-slate-900 border-l border-white/10 flex flex-col z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.5)] shrink-0">

                    {/* 头部信息与保存 */}
                    <div className="p-5 border-b border-gray-700 bg-black/40 flex flex-col gap-4">
                        <input type="text" value={selected.name} onChange={e => updateArchetype({ name: e.target.value })}
                            className="w-full bg-transparent text-2xl font-black border-b border-gray-600 focus:border-red-500 focus:outline-none text-red-400 transition-colors" placeholder="流派名称" />
                        <input type="text" value={selected.description} onChange={e => updateArchetype({ description: e.target.value })}
                            className="w-full bg-transparent text-sm border-b border-gray-700 focus:border-blue-500 focus:outline-none text-gray-400 transition-colors" placeholder="一句话描述该流派..." />

                        <div className="flex gap-2">
                            <button onClick={saveToLocal} disabled={!isDirty} className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 font-bold text-sm transition-all ${isDirty ? 'bg-green-600 text-white hover:bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}>
                                <Save size={16} /> 保存
                            </button>
                            <button onClick={exportToClipboard} className="flex-1 py-2 rounded-lg flex items-center justify-center gap-2 font-bold text-sm bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)]">
                                <Download size={16} /> 导出
                            </button>
                        </div>
                    </div>

                    {/* Diorama 预览与高定属性选择器 (取代旧 <select>) */}
                    <div className="p-5 flex flex-col items-center border-b border-gray-700 bg-slate-800/20">
                        <div className="mb-4">
                            <EnemyDeckDiorama archetype={selected} />
                        </div>

                        <div className="w-full space-y-5">
                            {/* 横向滚动英雄头像库 */}
                            <div>
                                <div className="text-[10px] text-yellow-500 font-bold mb-2 tracking-widest uppercase flex items-center gap-1"><User size={12}/> CORE CHAMPION</div>
                                <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2 px-1">
                                    {championOptions.map(c => (
                                        <div key={c.key} onClick={() => updateArchetype({ champion: c.key })}
                                             className={`shrink-0 w-12 h-12 rounded-full border-2 transition-all cursor-pointer ${selected.champion === c.key ? 'border-yellow-400 scale-110 shadow-[0_0_15px_rgba(250,204,21,0.5)] z-10 relative' : 'border-transparent opacity-40 hover:opacity-100 hover:border-gray-500'}`}>
                                            <img src={c.imageUrl} className="w-full h-full object-cover rounded-full" alt={c.name} title={c.name} />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* AI 性格并排 Toggle */}
                            <div>
                                <div className="text-[10px] text-yellow-500 font-bold mb-2 tracking-widest uppercase flex items-center gap-1"><Zap size={12}/> AI PERSONALITY</div>
                                <div className="flex bg-black/60 p-1 rounded-lg border border-white/5">
                                    {AI_PERSONALITIES.map(p => (
                                        <button key={p} onClick={() => updateArchetype({ aiPersonality: p })}
                                            className={`flex-1 py-2 text-xs font-bold rounded-md transition-all tracking-wider ${selected.aiPersonality === p ? 'bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-lg' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>
                                            {AI_LABELS[p].split('—')[0]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 卡牌列表区 (带有渐变隐入黑影的边缘虚化) */}
                    <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 relative">
                        {/* Tab 切换控制 */}
                        <div className="flex bg-black border-b border-gray-800 shrink-0">
                            <button onClick={() => setActiveListTab('coreCards')}
                                className={`flex-1 py-3 text-sm font-black tracking-widest transition-all border-b-2 ${activeListTab === 'coreCards' ? 'text-blue-400 border-blue-400 bg-blue-900/10' : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-white/5'}`}>
                                🎯 核心 ({selected.coreCards.length})
                            </button>
                            <button onClick={() => setActiveListTab('preferredPool')}
                                className={`flex-1 py-3 text-sm font-black tracking-widest transition-all border-b-2 ${activeListTab === 'preferredPool' ? 'text-purple-400 border-purple-400 bg-purple-900/10' : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-white/5'}`}>
                                🃏 倾向 ({selected.preferredPool.length})
                            </button>
                        </div>

                        {/* 顶端虚化遮罩 */}
                        <div className="absolute top-[46px] left-0 w-full h-8 bg-gradient-to-b from-slate-950 to-transparent z-10 pointer-events-none"></div>

                        {/* 隐藏系统滚动条的丝滑列表 */}
                        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" onMouseLeave={handleContainerLeave}>
                            {selected[activeListTab].map((cardKey, index) => {
                                const card = CARD_DB[cardKey];
                                const isValid = !!card;
                                return (
                                    <div key={`${cardKey}-${index}`}
                                         className="relative flex items-center h-12 bg-gray-800/90 rounded-lg border border-gray-700/60 hover:border-blue-500 overflow-hidden cursor-help group transition-colors"
                                         onMouseEnter={() => isValid && handleCardEnter(cardKey)}
                                         onMouseLeave={handleCardLeave}
                                         onContextMenu={(e) => { e.preventDefault(); if (isValid) setViewCard(toFullCardData(card)); }}>
                                        {isValid && card.imageUrl && (
                                            <div className="absolute inset-0 opacity-40 bg-cover bg-center" style={{ backgroundImage: `url(${card.imageUrl})` }}></div>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent"></div>
                                        <div className="absolute inset-0 flex items-center justify-between px-3 z-10">
                                            <div className="flex gap-3 items-center">
                                                <span className={`w-6 h-6 rounded-full flex justify-center items-center text-xs font-bold border ${isValid ? 'bg-blue-900 border-blue-500 text-blue-200' : 'bg-red-900 border-red-500 text-red-300'}`}>
                                                    {isValid ? card.cost : '?'}
                                                </span>
                                                <span className={`text-sm font-bold truncate w-40 drop-shadow-md ${!isValid ? 'text-red-400 line-through' : 'text-white'}`}>
                                                    {isValid ? card.name : cardKey}
                                                </span>
                                            </div>
                                            {/* 右侧悬浮垃圾桶移除操作 */}
                                            <button onClick={(e) => { e.stopPropagation(); removeCardFromPool(activeListTab, index); }}
                                                className="opacity-0 group-hover:opacity-100 p-2 rounded-lg bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white transition-all border border-red-500/30">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {selected[activeListTab].length === 0 && (
                                <div className="text-center py-10 text-gray-600 text-sm font-bold tracking-widest">
                                    列表为空，请从中栏网格加入卡牌
                                </div>
                            )}
                        </div>

                        {/* 底端虚化遮罩 */}
                        <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-slate-950 to-transparent z-10 pointer-events-none"></div>
                    </div>
                </div>
            )}

            {/* ==================== 4. 全局悬浮与检视系统 ==================== */}

            {/* 带有唯一 Key 和 1秒防卡死保险的高级悬停大图 */}
            <AnimatePresence mode="wait">
                {hoveredCardKey && CARD_DB[hoveredCardKey] && (
                    <motion.div
                        key={hoveredCardKey}
                        className="absolute right-[430px] top-1/2 -translate-y-1/2 z-[300] pointer-events-auto"
                        onMouseEnter={() => handleCardEnter(hoveredCardKey)}
                        onMouseLeave={handleCardLeave}
                        initial={{ opacity: 0, x: 20, scale: 1.1 }}
                        animate={{ opacity: 1, x: 0, scale: 1.25 }}
                        exit={{ opacity: 0, x: 10, transition: { duration: 0.1 } }}
                        transition={{ type: "spring", stiffness: 300, damping: 25, opacity: { duration: 0.2 } }}
                    >
                        <div className="drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
                            <Card data={toFullCardData(CARD_DB[hoveredCardKey])} location="preview" isFaceUp={true} onViewArt={setViewCard} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 右键无缝下钻沉浸式检视 */}
            {viewCard && (
                <FullArtOverlay card={viewCard} onClose={() => setViewCard(null)} />
            )}
        </div>
    );
};