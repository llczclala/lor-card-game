import React, {useState, useMemo} from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // [2026-09-26 莉莉子] 全览网格进出场动画
import { X, Check, Lock, Search, Filter, ChevronDown, ChevronRight, RotateCcw, LayoutGrid } from 'lucide-react';
import { PERSONALIZATION_ASSETS } from '../data/imageData';
import { DeskMedia } from './DeskMedia'; // [2026-08-13] 动态牌桌媒体组件
import { getCardBackVideo } from '../data/cardBackVideos'; // [2026-08-23] 动态卡背视频
import { CardBackVideo } from './Card'; // [2026-08-23] 卡背动态视频组件
import { COSMETIC_REGISTRY, type CosmeticSource } from '../data/skinData'; // [2026-09-26 莉莉子] 名称/来源/价格元数据（此前界面完全没用上 registry）
import { getCosmeticTone } from '../data/cosmeticTones'; // [2026-09-26 莉莉子] 色调分类（脚本按主色+亮度自动生成）
import { eventBus, GameEvents } from '../utils/eventBus';

// ==========================================
// [2026-09-26 莉莉子] 筛选 + 排序
//   形态：工具条抄武装库；全览网格 + 侧边抽屉按钮抄大厅「背景选择」（GameLobby 的 isGridOpen 面板）
//   维度差异：卡背有 registry 的「来源」可用；牌桌来源几乎全是 BOTH ⇒ 改用「色调」维度（自动分类，零人工）
// ==========================================
type StyleSortMode = 'order' | 'name' | 'price' | 'newest';
const STYLE_SORT_LABELS: Record<StyleSortMode, string> = {
    order: '默认顺序',
    name: '名称',
    price: '价格',
    newest: '新 → 旧',
};
const TEMP_LABELS: Record<string, string> = { cool: '冷色调', warm: '暖色调', neutral: '中性' };
const LIGHT_LABELS: Record<string, string> = { bright: '明亮', dark: '深色' };
const TEMP_COLORS: Record<string, string> = { cool: '#38bdf8', warm: '#fb923c', neutral: '#94a3b8' };
const LIGHT_COLORS: Record<string, string> = { bright: '#fde047', dark: '#64748b' };
const SOURCE_LABELS: Record<string, string> = { SHOP: '商店', GACHA: '卡包', BOTH: '通用', MISSION: '任务', HIDDEN: '隐藏' };
const SOURCE_COLORS: Record<string, string> = { SHOP: '#fbbf24', GACHA: '#a855f7', BOTH: '#38bdf8', MISSION: '#34d399', HIDDEN: '#6b7280' };

interface StyleSelectorProps {
    type: 'cardBack' | 'desk'; // 当前选择的是卡背还是牌桌
    currentSelected: number;   // 当前生效的索引 (0-4)
    unlockedIndices: number[];
    onSelect: (index: number) => void; // 确认选择回调
    onClose: () => void;       // 关闭回调
    deskDynamic?: boolean;     // [2026-08-13] 动态牌桌开关（牌桌类型时生效）
    cardBackDynamic?: boolean; // [2026-08-23] 动态卡背开关（卡背类型时生效）
}

export const StyleSelector: React.FC<StyleSelectorProps> = ({
    type,
    currentSelected,
    unlockedIndices,
    onSelect,
    onClose,
    deskDynamic = false,
    cardBackDynamic = false
}) => {
    // 临时预览索引 (用户在模态框里随便点，点"确认"前不生效)
    const [previewIndex, setPreviewIndex] = useState(currentSelected);

    const assets = type === 'cardBack' ? PERSONALIZATION_ASSETS.cardBacks : PERSONALIZATION_ASSETS.desks;
    const title = type === 'cardBack' ? '卡背选择' : '牌桌选择';

    // ── [2026-09-26 莉莉子] 筛选 + 排序状态 ──
    const [search, setSearch] = useState('');
    const [sortMode, setSortMode] = useState<StyleSortMode>('order');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isGridOpen, setIsGridOpen] = useState(false);
    const [tempFilter, setTempFilter] = useState<('cool' | 'warm' | 'neutral')[]>([]);
    const [lightFilter, setLightFilter] = useState<('bright' | 'dark')[]>([]);
    const [sourceFilter, setSourceFilter] = useState<CosmeticSource[]>([]);
    const [onlyUnlocked, setOnlyUnlocked] = useState(false);
    const [onlyDynamic, setOnlyDynamic] = useState(false);

    // 每条款式汇总：registry 元数据（名称/来源/价格）+ 色调 + 解锁 + 动态
    const items = useMemo(() => assets.map((img, index) => {
        const reg = COSMETIC_REGISTRY.find(r => r.type === type && r.index === index);
        const tone = getCosmeticTone(type, index);
        return {
            index,
            img,
            name: reg?.name ?? (index === 0 ? '默认' : `#${String(index).padStart(2, '0')}`),
            source: reg?.source as CosmeticSource | undefined,
            price: reg?.price,
            tone,
            unlocked: unlockedIndices.includes(index),
            // 牌桌 15 张全部有动态视频；卡背只有默认款（index 0）没有
            hasVideo: type === 'cardBack' ? !!getCardBackVideo(index) : true,
        };
    }), [assets, type, unlockedIndices]);

    // 可见列表 = 筛选 + 排序结果（左侧列表与全览网格共用同一份）
    const visible = useMemo(() => {
        const kw = search.trim().toLowerCase();
        const list = items.filter(it => {
            if (kw && !it.name.toLowerCase().includes(kw)) return false;
            if (onlyUnlocked && !it.unlocked) return false;
            if (onlyDynamic && !it.hasVideo) return false;
            if (tempFilter.length > 0 && !(it.tone && tempFilter.includes(it.tone.temp))) return false;
            if (lightFilter.length > 0 && !(it.tone && lightFilter.includes(it.tone.light))) return false;
            if (sourceFilter.length > 0 && !(it.source && sourceFilter.includes(it.source))) return false;
            return true;
        });
        return [...list].sort((a, b) => {
            let cmp = 0;
            switch (sortMode) {
                case 'name': cmp = a.name.localeCompare(b.name, 'zh'); break;
                case 'price': cmp = (a.price ?? 0) - (b.price ?? 0); break;
                case 'newest': cmp = b.index - a.index; break;
                default: cmp = a.index - b.index; break;
            }
            return sortDir === 'desc' ? -cmp : cmp;
        });
    }, [items, search, onlyUnlocked, onlyDynamic, tempFilter, lightFilter, sourceFilter, sortMode, sortDir]);

    // 「来源」维度只对卡背有意义（牌桌 registry 里几乎全是 BOTH）；「色调」两者都有
    const hasSourceDim = type === 'cardBack';

    const isFilterActive = search !== '' || tempFilter.length > 0 || lightFilter.length > 0
        || sourceFilter.length > 0 || onlyUnlocked || onlyDynamic;
    const resetFilters = () => {
        setSearch(''); setTempFilter([]); setLightFilter([]); setSourceFilter([]);
        setOnlyUnlocked(false); setOnlyDynamic(false);
    };
    const toggle = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, val: T) =>
        setter(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));

    // 鼠标滚轮切换 —— [2026-09-26] 改为在「筛选后的可见列表」内循环，避免滚到被筛掉的款式
    const handleWheel = (e: React.WheelEvent) => {
        if (visible.length === 0) return;
        const pos = visible.findIndex(it => it.index === previewIndex);
        const base = pos < 0 ? 0 : pos;
        if (e.deltaY > 0) {
            setPreviewIndex(visible[(base + 1) % visible.length].index);
        } else {
            setPreviewIndex(visible[(base - 1 + visible.length) % visible.length].index);
        }
    };
    const isPreviewUnlocked = unlockedIndices.includes(previewIndex);

    return (
        <>
            {/* 关闭按钮 - 独立 fixed 定位，完全脱离 flex 布局，永不被遮挡 */}
            <button
                onClick={onClose}
                className="fixed top-8 right-8 z-[999] p-3 rounded-full
                           bg-black/70 border border-white/20 text-white
                           hover:bg-white/20 hover:border-white/60
                           shadow-2xl transition-all"
            >
                <X size={32} />
            </button>

            <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-fade-in text-white">
            <div className="flex w-full h-full max-w-[1600px] p-12 gap-12">

                {/* --- 左侧：缩略图列表 + [2026-09-26 莉莉子] 筛选排序工具条 --- */}
                <div className="relative w-64 flex flex-col min-h-0 py-4 pr-4">
                    {/* 工具条：搜索 + 筛选 + 排序 + 方向 + 清空 */}
                    <div className="flex items-center gap-1.5 mb-2 shrink-0">
                        <div className="relative flex-1 min-w-0">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" size={14} />
                            <input
                                type="text"
                                placeholder="搜索名称..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full bg-black/50 border border-white/15 rounded-md py-1.5 pl-8 pr-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-orange-400/60 transition-all"
                            />
                        </div>
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsFilterOpen(o => !o); }}
                            title="筛选"
                            className={`p-1.5 rounded-md transition-colors shrink-0 border border-white/10 ${isFilterOpen ? 'bg-orange-600 text-white' : isFilterActive ? 'bg-orange-600/40 text-orange-200' : 'bg-black/50 text-white/60 hover:bg-black/70'}`}
                        >
                            <Filter size={14} />
                        </button>
                        <div className="relative shrink-0">
                            <button
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsSortOpen(o => !o); }}
                                title={`排序：${STYLE_SORT_LABELS[sortMode]}`}
                                className={`p-1.5 rounded-md transition-colors border border-white/10 ${isSortOpen ? 'bg-orange-600 text-white' : 'bg-black/50 text-white/60 hover:bg-black/70'}`}
                            >
                                <ChevronDown size={14} className={isSortOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                            </button>
                            {isSortOpen && (
                                <div className="absolute left-0 top-full mt-1 w-28 rounded-md bg-slate-900 border border-white/15 shadow-xl z-40 overflow-hidden">
                                    {(Object.keys(STYLE_SORT_LABELS) as StyleSortMode[]).map(m => (
                                        <button
                                            key={m}
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setSortMode(m); setIsSortOpen(false); }}
                                            className={`w-full text-left px-2.5 py-1.5 text-[11px] font-bold transition-colors ${sortMode === m ? 'bg-orange-600/50 text-white' : 'text-gray-300 hover:bg-white/5'}`}
                                        >
                                            {STYLE_SORT_LABELS[m]}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setSortDir(d => (d === 'asc' ? 'desc' : 'asc')); }}
                            title={sortDir === 'asc' ? '顺序排列（点击倒序）' : '倒序排列（点击顺序）'}
                            className={`p-1.5 rounded-md transition-colors shrink-0 border border-white/10 ${sortDir === 'desc' ? 'bg-orange-600/40 text-white' : 'bg-black/50 text-white/60 hover:bg-black/70'}`}
                        >
                            <span className="block text-[12px] font-black leading-none">{sortDir === 'asc' ? '↑' : '↓'}</span>
                        </button>
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); resetFilters(); }}
                            disabled={!isFilterActive}
                            title="清空筛选"
                            className={`p-1.5 rounded-md transition-colors shrink-0 border border-white/10 ${isFilterActive ? 'bg-red-600/30 text-red-300 hover:bg-red-600 hover:text-white' : 'bg-black/40 text-white/20'}`}
                        >
                            <RotateCcw size={14} />
                        </button>
                    </div>

                    {/* 计数 + 筛选面板 */}
                    <div className="shrink-0 mb-2">
                        <div className="flex items-center justify-between text-[10px] text-white/40 font-bold mb-1.5">
                            <span>共 {visible.length} / {assets.length} 款</span>
                            {isFilterActive && <span className="text-orange-400">已筛选</span>}
                        </div>
                        {isFilterOpen && (
                            <div className="space-y-2.5 p-2.5 bg-black/50 border border-white/10 rounded-md mb-2">
                                <div>
                                    <span className="text-[10px] text-white/40 font-bold tracking-widest block mb-1">色调</span>
                                    <div className="flex flex-wrap gap-1">
                                        {(['cool', 'warm', 'neutral'] as const).map(t => {
                                            const on = tempFilter.includes(t);
                                            return (
                                                <button key={t} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); toggle(setTempFilter, t); }}
                                                    className="px-2 py-0.5 rounded text-[11px] font-bold border transition-all"
                                                    style={on ? { background: TEMP_COLORS[t], borderColor: TEMP_COLORS[t], color: '#0f172a' } : { color: TEMP_COLORS[t], borderColor: 'transparent' }}>
                                                    {TEMP_LABELS[t]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-[10px] text-white/40 font-bold tracking-widest block mb-1">明暗</span>
                                    <div className="flex flex-wrap gap-1">
                                        {(['bright', 'dark'] as const).map(t => {
                                            const on = lightFilter.includes(t);
                                            return (
                                                <button key={t} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); toggle(setLightFilter, t); }}
                                                    className="px-2 py-0.5 rounded text-[11px] font-bold border transition-all"
                                                    style={on ? { background: LIGHT_COLORS[t], borderColor: LIGHT_COLORS[t], color: '#0f172a' } : { color: LIGHT_COLORS[t], borderColor: 'transparent' }}>
                                                    {LIGHT_LABELS[t]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                {hasSourceDim && (
                                    <div>
                                        <span className="text-[10px] text-white/40 font-bold tracking-widest block mb-1">来源</span>
                                        <div className="flex flex-wrap gap-1">
                                            {(['SHOP', 'GACHA', 'BOTH', 'MISSION'] as CosmeticSource[]).map(s => {
                                                const on = sourceFilter.includes(s);
                                                return (
                                                    <button key={s} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); toggle(setSourceFilter, s); }}
                                                        className="px-2 py-0.5 rounded text-[11px] font-bold border transition-all"
                                                        style={on ? { background: SOURCE_COLORS[s], borderColor: SOURCE_COLORS[s], color: '#0f172a' } : { color: SOURCE_COLORS[s], borderColor: 'transparent' }}>
                                                        {SOURCE_LABELS[s]}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-1 pt-0.5 border-t border-white/10">
                                    <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setOnlyUnlocked(v => !v); }}
                                        className={`mt-1.5 px-2 py-0.5 rounded text-[11px] font-bold transition-all ${onlyUnlocked ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/50 hover:bg-white/20'}`}>
                                        只看已解锁
                                    </button>
                                    <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setOnlyDynamic(v => !v); }}
                                        className={`mt-1.5 px-2 py-0.5 rounded text-[11px] font-bold transition-all ${onlyDynamic ? 'bg-sky-600 text-white' : 'bg-white/10 text-white/50 hover:bg-white/20'}`}>
                                        只看动态款
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {visible.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <Search size={24} className="text-white/20 mb-2" />
                                <p className="text-xs text-white/50 font-bold mb-1">没有符合条件的款式</p>
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); resetFilters(); }}
                                    className="mt-2 px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white/70 transition-colors"
                                >
                                    清空筛选
                                </button>
                            </div>
                        ) : (
                        <div className="flex flex-col gap-4">
                            {visible.map(it => {
                                const isUnlocked = it.unlocked;
                                const active = previewIndex === it.index;
                                return (
                                    <div
                                        key={it.index}
                                        onClick={() => setPreviewIndex(it.index)}
                                        className={`
                                            relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-300 group
                                            ${active ? 'border-orange-500 scale-105 shadow-[0_0_20px_orange]' : 'border-white/10 hover:border-white/50 opacity-60 hover:opacity-100'}
                                            ${type === 'cardBack' ? 'aspect-[2/3]' : 'aspect-video'}
                                        `}
                                    >
                                        {type === 'cardBack' ? (
                                            <img
                                                src={it.img}
                                                className={`w-full h-full object-contain ${!isUnlocked ? 'grayscale' : ''}`}
                                                alt={it.name}
                                            />
                                        ) : (
                                            <DeskMedia deskIndex={it.index} className={`w-full h-full object-contain ${!isUnlocked ? 'grayscale' : ''}`} />
                                        )}

                                        {/* 名称条：[2026-09-26] registry 已有命名，此前列表完全无名、只能靠编号认 */}
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent px-2 pt-4 pb-1 pointer-events-none">
                                            <span className="block text-[11px] font-bold text-white/90 truncate">{it.name}</span>
                                        </div>

                                        {/* 当前生效标记 */}
                                        {currentSelected === it.index && (
                                            <div className="absolute top-2 right-2 bg-green-500 text-black p-1 rounded-full shadow-lg z-10">
                                                <Check size={12} strokeWidth={4} />
                                            </div>
                                        )}

                                        {/* 未解锁标记 (锁图标) */}
                                        {!isUnlocked && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                                <Lock size={24} className="text-white/80" />
                                            </div>
                                        )}

                                        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors pointer-events-none"></div>
                                    </div>
                                );
                            })}
                        </div>
                        )}
                    </div>

                    {/* 侧边抽屉按钮：展开 4 列全览网格（形态对齐大厅「背景选择」的半透明三角箭头） */}
                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsGridOpen(true); }}
                        title="展开全览网格"
                        className="absolute -right-3 top-1/2 -translate-y-1/2 w-7 h-20 bg-black/50 backdrop-blur-md border border-white/15 border-l-0 rounded-r-md flex items-center justify-center hover:bg-black/75 transition-colors group z-10"
                    >
                        <ChevronRight size={20} className="text-gray-400 group-hover:text-white transition-colors" />
                    </button>
                </div>


                {/* --- 右侧：大图预览与确认 --- */}
                <div className="flex-1 flex flex-col items-center justify-center relative">
                    <h2 className="text-4xl font-black tracking-[0.5em] text-white/20 mb-8 absolute top-0">{title}</h2>

                    {/* 预览窗口 */}
                    <div
                        className={`
                            relative shadow-2xl transition-all duration-500 ease-out
                            ${type === 'cardBack' ? 'h-[70vh] aspect-[2/3] rounded-2xl' : 'w-[80%] aspect-video rounded-xl'}
                            border border-white/10 bg-black overflow-hidden
                        `}
                        onWheel={handleWheel}
                    >
                        {/* 切换动画需要 Key 变化（[2026-08-13] 牌桌类型用动态视频 DeskMedia；[2026-08-23] 卡背类型用动态视频 CardBackVideo） */}
                        {type === 'cardBack' ? (
                            cardBackDynamic && getCardBackVideo(previewIndex) ? (
                                <CardBackVideo key={previewIndex} src={getCardBackVideo(previewIndex)!} className="w-full h-full object-cover animate-fade-in" />
                            ) : (
                                <img
                                    key={previewIndex}
                                    src={assets[previewIndex]}
                                    className="w-full h-full object-cover animate-fade-in"
                                    alt="预览"
                                />
                            )
                        ) : (
                            <DeskMedia key={previewIndex} deskIndex={previewIndex} dynamic={deskDynamic} className="w-full h-full object-cover animate-fade-in" />
                        )}

                        {/* [新增] 未解锁时的全屏遮罩/提示 */}
                        {!isPreviewUnlocked && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 backdrop-blur-[2px]">
                                <Lock size={64} className="text-white/50 mb-4" />
                                <span className="text-2xl font-black tracking-widest text-white/50 border-2 border-white/50 px-6 py-2 rounded">
                                    LOCKED
                                </span>
                            </div>
                        )}

                        {/* 滚轮提示 */}
                        <div className="absolute bottom-4 right-4 text-xs font-mono text-white/40 bg-black/50 px-2 py-1 rounded border border-white/10">
                            SCROLL TO SWITCH
                        </div>
                    </div>


                    {/* 底部操作栏 */}
                    <div className="mt-12 flex gap-8 items-center">
                        <div className="text-xl font-mono text-gray-400">
                            风格 {String(previewIndex + 1).padStart(2, '0')} / {String(assets.length).padStart(2, '0')}
                        </div>


                        <button
                            onClick={() => {
                                if (isPreviewUnlocked) {
                                    onSelect(previewIndex);
                                }
                            }}
                            // 禁用条件：已经是当前选择 OR 未解锁
                            disabled={currentSelected === previewIndex || !isPreviewUnlocked}
                            className={`
                                px-12 py-4 rounded-full font-black tracking-widest text-lg transition-all
                                flex items-center gap-3
                                ${!isPreviewUnlocked
                                    ? 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed' // 锁定样式
                                    : (currentSelected === previewIndex
                                        ? 'bg-green-600/20 text-green-500 border border-green-500/50 cursor-default' // 已选中样式
                                        : 'bg-orange-600 hover:bg-orange-500 text-white shadow-[0_0_30px_rgba(234,88,12,0.4)] hover:scale-105') // 可选样式
                                }
                            `}
                        >
                            {!isPreviewUnlocked ? (
                                <><Lock size={20} /> 锁定</>
                            ) : (
                                currentSelected === previewIndex ? (
                                    <><Check /> 装备中</>
                                ) : (
                                    '风格选择'
                                )
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        {/* ================= [2026-09-26 莉莉子] 全览网格 =================
            形态对齐大厅「背景选择」的 isGridOpen 面板：4 列铺满 + 毛玻璃底 + 点选即生效
            左侧 w-64 列表一屏只能看到约 3 个（卡背 2:3 太高），全览网格才是找款式的主力 */}
        <AnimatePresence>
            {isGridOpen && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    className="fixed inset-0 z-[700] bg-black/85 backdrop-blur-xl p-12 pt-14 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                >
                    <div className="max-w-7xl mx-auto flex items-end justify-between mb-7">
                        <div>
                            <h3 className="text-2xl font-black tracking-[0.3em] text-white">{title} · 全览</h3>
                            <p className="text-xs text-white/40 font-mono mt-1">共 {visible.length} / {assets.length} 款{isFilterActive ? ' · 已筛选' : ''}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); resetFilters(); }}
                                disabled={!isFilterActive}
                                className={`px-4 py-2 rounded-md text-xs font-bold border transition-all ${isFilterActive ? 'bg-red-600/30 text-red-300 border-red-500/40 hover:bg-red-600 hover:text-white' : 'bg-white/5 text-white/20 border-white/10'}`}
                            >
                                清空筛选
                            </button>
                            <button
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsGridOpen(false); }}
                                className="p-2.5 rounded-md bg-white/10 hover:bg-white/20 border border-white/15 text-white transition-colors"
                                title="收起全览"
                            >
                                <X size={22} />
                            </button>
                        </div>
                    </div>

                    {visible.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-32 text-center">
                            <LayoutGrid size={40} className="text-white/15 mb-4" />
                            <p className="text-sm text-white/50 font-bold">没有符合条件的款式</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-4 gap-6 max-w-7xl mx-auto">
                            {visible.map(it => {
                                const active = previewIndex === it.index;
                                return (
                                    <div
                                        key={it.index}
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setPreviewIndex(it.index); setIsGridOpen(false); }}
                                        className={`relative rounded-lg overflow-hidden cursor-pointer transition-all duration-300 border-2 ${active ? 'border-orange-500 scale-[1.03] shadow-[0_0_20px_rgba(249,115,22,0.5)]' : 'border-white/15 hover:border-white/60 hover:scale-[1.03]'} ${type === 'cardBack' ? 'aspect-[2/3]' : 'aspect-video'}`}
                                    >
                                        {type === 'cardBack' ? (
                                            <img src={it.img} className={`w-full h-full object-cover ${!it.unlocked ? 'grayscale' : ''}`} alt={it.name} />
                                        ) : (
                                            <DeskMedia deskIndex={it.index} className={`w-full h-full object-cover ${!it.unlocked ? 'grayscale' : ''}`} />
                                        )}

                                        {/* 名称 + 色调/来源速览（网格里信息密度高，一眼看清分类） */}
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pt-6 pb-2 pointer-events-none">
                                            <span className="block text-xs font-bold text-white truncate">{it.name}</span>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {it.tone && (
                                                    <span className="text-[10px] font-mono" style={{ color: TEMP_COLORS[it.tone.temp] }}>
                                                        {TEMP_LABELS[it.tone.temp]}·{LIGHT_LABELS[it.tone.light]}
                                                    </span>
                                                )}
                                                {hasSourceDim && it.source && (
                                                    <span className="text-[10px] font-mono" style={{ color: SOURCE_COLORS[it.source] }}>
                                                        {SOURCE_LABELS[it.source]}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {currentSelected === it.index && (
                                            <div className="absolute top-2 right-2 bg-green-500 text-black p-1 rounded-full shadow-lg z-10">
                                                <Check size={12} strokeWidth={4} />
                                            </div>
                                        )}
                                        {!it.unlocked && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                                <Lock size={26} className="text-white/80" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <p className="max-w-7xl mx-auto mt-8 text-center text-[11px] text-white/30 font-mono">
                        点击任意款式 → 选中并返回主视图预览
                    </p>
                </motion.div>
            )}
        </AnimatePresence>
        </>
    );
};