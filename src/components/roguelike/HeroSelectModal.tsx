// ==========================================
// 悖论迷宫 · 更换天启者（全屏界面版）
// [2026-08-14 莉莉子] 覆盖整个画面的全屏弹窗（对齐 RogueHeroSelect 沉浸式风格）
//   顶部工具条：搜索名字 / 排序下拉 4 种（牌库顺序默认）/ 顺序倒序切换 / 高级筛选 / 清空
//   高级筛选参考备战 DeckBuilder：阵营 / 难度 / 关键词多选 + 状态标签（占位留接口）
//   下方放大卡面网格：名字紧贴卡面上方 · 左下圆形黑框等级数字 · 右侧神格神经空槽（4 星）
// ==========================================
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, ChevronDown, Star, ArrowUpNarrowWide, ArrowDownWideNarrow, RotateCcw, ArrowLeft } from 'lucide-react';
import { CARD_DB } from '../../data/cards';
import { ROGUE_HEROES } from '../../data/roguelike/rogueStarterDecks';
import { HERO_ARCHETYPES, DIFFICULTY_LABELS, DIFFICULTY_COLORS } from '../../data/roguelike/heroArchetype';
import { getLevelNumberColor } from '../../data/roguelike/heroProgression';
import { getHeroTheme } from '../../data/roguelike/heroTheme'; // [2026-08-14] 选中高亮随天启者主题色
import { KEYWORD_DB } from '../../data/keywords';
import type { Keyword } from '../../types';
import {
    MAX_DIVINITY_LEVEL,
    getHeroDivinityLevel,
    HERO_STATUS_LABELS,
    getHeroStatus,
    type HeroStatus,
} from '../../data/roguelike/heroDivinity';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { useHeroProgression } from '../../hooks/useHeroProgression';

interface HeroSelectModalProps {
    isOpen: boolean;
    selectedKey: string | null;
    onSelect: (heroKey: string) => void;
    onClose: () => void;
}

// ── 排序方式 ──
type SortMode = 'order' | 'level' | 'divinity' | 'name';
const SORT_LABELS: Record<SortMode, string> = {
    order: '牌库顺序',        // cards 里定义先后（默认）
    level: '等级',
    divinity: '神格神经等级',
    name: '名字 A-Z',
};

const REGION_LABELS: Record<string, string> = {
    Lyfe: '里芙', Fenny: '芬妮', Pupu: '卜卜', Mauxir: '猫汐尔', Acacia: '安卡希雅',
};

// 从 5 天启者英雄卡收集实际关键词作为筛选选项（无则该项自然为空）
const HERO_KEYWORD_OPTIONS: string[] = (() => {
    const set = new Set<string>();
    ROGUE_HEROES.forEach(h => (CARD_DB[h.key]?.keywords ?? []).forEach(k => set.add(k)));
    return Array.from(set);
})();

export const HeroSelectModal: React.FC<HeroSelectModalProps> = ({ isOpen, selectedKey, onSelect, onClose }) => {
    const heroProgression = useHeroProgression();

    // 工具条状态
    const [searchTerm, setSearchTerm] = useState('');
    const [sortMode, setSortMode] = useState<SortMode>('order'); // 默认牌库顺序
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    // 高级筛选多选
    const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
    const [selectedDifficulties, setSelectedDifficulties] = useState<number[]>([]);
    const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
    const [selectedStatuses, setSelectedStatuses] = useState<HeroStatus[]>([]);

    // ESC 关闭：capture + stopImmediatePropagation 拦截 App.tsx 全局 ESC
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopImmediatePropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [isOpen, onClose]);

    // 多选切换（对齐备战 DeckBuilder 的 toggleFilter）
    const toggle = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, val: T) =>
        setter(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));

    const isFilterActive =
        searchTerm !== '' ||
        selectedRegions.length > 0 ||
        selectedDifficulties.length > 0 ||
        selectedKeywords.length > 0 ||
        selectedStatuses.length > 0;

    const resetFilters = () => {
        setSearchTerm('');
        setSelectedRegions([]);
        setSelectedDifficulties([]);
        setSelectedKeywords([]);
        setSelectedStatuses([]);
    };

    // 过滤 + 排序后的天启者列表
    const heroList = useMemo(() => {
        const cards = ROGUE_HEROES.filter(hero => {
            const card = CARD_DB[hero.key];
            // 搜索（按名字）
            if (searchTerm && !hero.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            // 阵营
            if (selectedRegions.length && !selectedRegions.includes(hero.region)) return false;
            // 难度档
            const arch = HERO_ARCHETYPES.find(a => a.heroKey === hero.key);
            if (selectedDifficulties.length && !(arch && selectedDifficulties.includes(arch.difficulty))) return false;
            // 关键词（英雄卡含任一选中关键词）
            const kws = card?.keywords ?? [];
            if (selectedKeywords.length && !selectedKeywords.some(k => kws.includes(k as Keyword))) return false;
            // 状态（占位：getHeroStatus 恒 null → 该状态下无匹配）
            if (selectedStatuses.length) {
                const st = getHeroStatus(hero.key);
                if (st === null || !selectedStatuses.includes(st)) return false;
            }
            return true;
        });

        return [...cards].sort((a, b) => {
            let cmp = 0;
            switch (sortMode) {
                case 'level': cmp = heroProgression.getHeroLevel(a.key) - heroProgression.getHeroLevel(b.key); break;
                case 'divinity': cmp = getHeroDivinityLevel(a.key) - getHeroDivinityLevel(b.key); break;
                case 'name': cmp = a.name.localeCompare(b.name, 'zh'); break;
                default: cmp = ROGUE_HEROES.indexOf(a) - ROGUE_HEROES.indexOf(b); break;
            }
            return sortDirection === 'desc' ? -cmp : cmp;
        });
    }, [searchTerm, sortMode, sortDirection, selectedRegions, selectedDifficulties, selectedKeywords, selectedStatuses, heroProgression]);

    if (!isOpen) return null;

    const statusFilterActive = selectedStatuses.length > 0;

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[1000] text-white font-sans select-none overflow-hidden"
                style={{ background: 'linear-gradient(to bottom, #020617 0%, #1e1b4b 55%, #020617 100%)' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
                {/* 左上返回 */}
                <button
                    onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                    className="absolute top-6 left-6 z-[999] p-3 rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/50 transition-all group"
                    title="返回"
                >
                    <ArrowLeft size={22} className="text-gray-300 group-hover:text-white transition-colors" />
                </button>

                <div className="w-full h-full flex flex-col px-10 pt-24 pb-8 min-h-0">
                    {/* 标题 */}
                    <h3 className="text-2xl font-black tracking-widest text-white mb-5 shrink-0">更换天启者</h3>

                    {/* ═══ 顶部工具条：搜索 + 排序 + 方向 + 筛选 ═══ */}
                    <div className="flex items-center gap-2 mb-3 shrink-0">
                        {/* 搜索框（按名字） */}
                        <div className="relative w-56 shrink-0">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="text"
                                placeholder="搜索天启者..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-slate-800/80 rounded-md py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all"
                            />
                        </div>

                        {/* 排序下拉 */}
                        <div className="relative shrink-0">
                            <button
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsSortOpen(o => !o); }}
                                className="flex items-center gap-2 py-2 px-3 rounded-md bg-slate-800/80 text-sm font-bold text-gray-200 hover:bg-slate-700 transition-colors"
                            >
                                {SORT_LABELS[sortMode]}
                                <ChevronDown size={14} className={isSortOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                            </button>
                            <AnimatePresence>
                                {isSortOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                                        className="absolute top-full left-0 mt-1 w-44 rounded-md bg-slate-800 border border-white/10 shadow-xl z-20 overflow-hidden"
                                    >
                                        {(Object.keys(SORT_LABELS) as SortMode[]).map(m => (
                                            <button
                                                key={m}
                                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setSortMode(m); setIsSortOpen(false); }}
                                                className={`w-full text-left px-3 py-2 text-sm font-bold transition-colors ${sortMode === m ? 'bg-purple-600/40 text-white' : 'text-gray-300 hover:bg-white/5'}`}
                                            >
                                                {SORT_LABELS[m]}
                                            </button>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* 排序方向切换（顺序/倒序） */}
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setSortDirection(d => (d === 'asc' ? 'desc' : 'asc')); }}
                            title={sortDirection === 'asc' ? '当前顺序排列，点击切换倒序' : '当前倒序排列，点击切换顺序'}
                            className={`p-2 rounded-md transition-colors ${sortDirection === 'desc' ? 'bg-purple-600/40 text-white' : 'bg-slate-800/80 text-gray-300 hover:bg-slate-700'}`}
                        >
                            {sortDirection === 'asc' ? <ArrowUpNarrowWide size={16} /> : <ArrowDownWideNarrow size={16} />}
                        </button>

                        <div className="flex-1" />

                        {/* 高级筛选 + 清空 */}
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsFilterOpen(o => !o); }}
                            className={`py-2 px-4 flex items-center justify-center gap-2 text-sm font-bold rounded-md transition-colors ${isFilterOpen ? 'bg-purple-600 text-white' : 'bg-slate-800/80 text-gray-300 hover:bg-slate-700'}`}
                        >
                            <Filter size={16} /> 高级筛选
                        </button>
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); resetFilters(); }}
                            disabled={!isFilterActive}
                            title="清空筛选"
                            className={`p-2 rounded-md transition-colors ${isFilterActive ? 'bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white' : 'bg-slate-800 text-gray-600'}`}
                        >
                            <RotateCcw size={16} />
                        </button>
                    </div>

                    {/* ═══ 高级筛选面板（参考备战 DeckBuilder）═══ */}
                    <AnimatePresence>
                        {isFilterOpen && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden shrink-0">
                                <div className="p-4 bg-slate-800/60 rounded-md mb-3 border border-white/10 shadow-inner">
                                    <div className="flex flex-wrap gap-x-8 gap-y-4">
                                        {/* 阵营多选 */}
                                        <div>
                                            <span className="text-xs text-gray-400 font-bold tracking-widest block mb-2">阵营 (REGION)</span>
                                            <div className="flex flex-wrap gap-2">
                                                {ROGUE_HEROES.map(h => (
                                                    <button key={h.region} onClick={() => toggle(setSelectedRegions, h.region)}
                                                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedRegions.includes(h.region) ? 'bg-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}>
                                                        {REGION_LABELS[h.region] ?? h.region}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {/* 难度档多选 */}
                                        <div>
                                            <span className="text-xs text-gray-400 font-bold tracking-widest block mb-2">难度 (DIFFICULTY)</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {DIFFICULTY_LABELS.map((label, i) => (
                                                    <button key={label} onClick={() => toggle(setSelectedDifficulties, i)}
                                                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedDifficulties.includes(i) ? 'text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}
                                                            style={selectedDifficulties.includes(i) ? { backgroundColor: DIFFICULTY_COLORS[i] } : {}}>
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {/* 关键词多选（天启者卡实际关键词） */}
                                        <div>
                                            <span className="text-xs text-green-400 font-bold tracking-widest block mb-2">关键词 (KEYWORD)</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {HERO_KEYWORD_OPTIONS.map(kw => (
                                                    <button key={kw} onClick={() => toggle(setSelectedKeywords, kw)}
                                                            title={KEYWORD_DB[kw as Keyword]?.description ?? ''}
                                                            className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-all ${selectedKeywords.includes(kw) ? 'bg-green-500/30 text-green-300 border border-green-400/50' : 'bg-slate-700 text-gray-400 hover:bg-slate-600 border border-transparent'}`}>
                                                        {KEYWORD_DB[kw as Keyword]?.label ?? kw}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {/* 状态标签（占位留接口） */}
                                        <div>
                                            <span className="text-xs text-amber-400 font-bold tracking-widest block mb-2">状态 (STATUS)</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {(Object.keys(HERO_STATUS_LABELS) as HeroStatus[]).map(st => (
                                                    <button key={st} onClick={() => toggle(setSelectedStatuses, st)}
                                                            title="状态功能开发中（占位留接口）"
                                                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedStatuses.includes(st) ? 'bg-amber-500/30 text-amber-300 border border-amber-400/50' : 'bg-slate-700 text-gray-400 hover:bg-slate-600 border border-transparent'}`}>
                                                        {HERO_STATUS_LABELS[st]}
                                                    </button>
                                                ))}
                                            </div>
                                            {statusFilterActive && (
                                                <p className="mt-1.5 text-[10px] text-amber-400/70">状态筛选功能开发中，暂未开放</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ═══ 卡面网格（放大，全屏铺开）═══ */}
                    <div className="flex-1 min-h-0 overflow-y-auto pr-1 mt-2">
                        {heroList.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 py-16">
                                <Search size={32} className="mb-2 opacity-40" />
                                <p className="text-sm font-bold">{statusFilterActive ? '状态筛选功能开发中，暂未开放' : '没有符合条件的天启者'}</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-5 gap-x-4 gap-y-4 justify-items-center content-start">
                                {heroList.map(hero => {
                                    const card = CARD_DB[hero.key];
                                    const isSelected = selectedKey === hero.key;
                                    const progress = heroProgression.getHeroProgress(hero.key);
                                    const level = progress.level;
                                    const divinityLevel = getHeroDivinityLevel(hero.key);
                                    const theme = getHeroTheme(hero.key); // [2026-08-14] 选中高亮随天启者主题色
                                    return (
                                        <button
                                            key={hero.key}
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onSelect(hero.key); onClose(); }}
                                            className={`group relative transition-transform hover:scale-[1.03] ${isSelected ? 'scale-[1.03]' : ''}`}
                                        >
                                            {/* 卡面 */}
                                            <div
                                                className={`relative rounded-lg overflow-hidden border-2 transition-all ${isSelected ? '' : 'border-white/10 group-hover:border-white/40'}`}
                                                style={isSelected ? { borderColor: theme.color, boxShadow: `0 0 30px ${theme.glow}` } : undefined}
                                            >
                                                <img src={card.imageUrl} className="w-52 h-80 object-cover" alt={hero.name} draggable={false} />
                                                {/* 底部黑色透明遮罩：兜住等级/名字/槽位区域，保证可读 */}
                                                <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/90 via-black/55 to-transparent pointer-events-none" />
                                                {/* 左下角：等级黑圆 + 右侧（名字上 / 神格槽位下）——对齐选择界面头像区排布 */}
                                                <div className="absolute left-2 bottom-2 flex items-center gap-2 pointer-events-none">
                                                    {/* 圆形黑框等级数字（参考圆环头像） */}
                                                    <div className="w-11 h-11 rounded-full bg-black/85 border-2 border-white/30 flex items-center justify-center shadow-[0_0_10px_rgba(0,0,0,0.8)] shrink-0">
                                                        <span className="text-xl font-black italic leading-none" style={{ color: getLevelNumberColor(level) }}>{level}</span>
                                                    </div>
                                                    {/* 右侧竖排：名字（上） + 神格神经槽位（下） */}
                                                    <div className="flex flex-col gap-1">
                                                        <span
                                                            className="text-base font-black leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                                                            style={isSelected ? { color: theme.color } : undefined}
                                                        >
                                                            {hero.name}
                                                        </span>
                                                        <div className="flex gap-1">
                                                            {Array.from({ length: MAX_DIVINITY_LEVEL }).map((_, i) => (
                                                                <Star key={i} size={15} className={`${i < divinityLevel ? 'text-amber-400 fill-amber-400' : 'text-gray-600 fill-gray-600/30'}`} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
