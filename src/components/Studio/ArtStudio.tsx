import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Filter, X, Check, Layers, Shield, Sword,
    ArrowUpCircle, ArrowDownCircle, Download, User, Box, AlertTriangle
} from 'lucide-react';
import { CARD_DB } from '../../data/cards';
import { CARD_CROP_CONFIG } from '../../data/cardCropConfig';
import { Card } from '../Card';
import type { CardData, CardCropData } from '../../types';

// ================= 类型定义 =================
type EditMode = 'hand' | 'bench' | 'combat';
type CategoryFilter = 'ALL' | 'HERO' | 'UNIT';

// [新增] 定义 Props 接收关闭回调
interface ArtStudioProps {
    onClose?: () => void;
}

export const ArtStudio: React.FC<ArtStudioProps> = ({ onClose }) => {
    // === 左侧屏状态 (Filters & Selection) ===
    const [searchTerm, setSearchTerm] = useState('');
    const [category, setCategory] = useState<CategoryFilter>('ALL');
    const [costFilter, setCostFilter] = useState<string>('ALL');
    const [regionFilter, setRegionFilter] = useState<string>('ALL');
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    // === 右侧屏状态 (Preview & Modes) ===
    const [activeMode, setActiveMode] = useState<EditMode>('hand');
    const [heroLevel, setHeroLevel] = useState<1 | 2>(1);

    // === 中间屏状态 (Cropping Engine) ===
    const [cropScale, setCropScale] = useState(1);
    const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0, baseX: 0, baseY: 0 });

    // === 数据层 (Overrides) ===
    const [localOverrides, setLocalOverrides] = useState<Record<string, CardCropData>>({});

    // 1. 初始化读取 localStorage
    useEffect(() => {
        try {
            const stored = localStorage.getItem('dev_crop_overrides');
            if (stored) setLocalOverrides(JSON.parse(stored));
        } catch (e) { console.error("Failed to parse local overrides", e); }
    }, []);

    // 2. 当选中卡牌或切换模式时，加载对应的坐标
    useEffect(() => {
        if (!selectedKey) return;

        const loadCropData = () => {
            // [修改] 根据 heroLevel 决定读取哪个键
            const targetMode = heroLevel === 2 ? `${activeMode}_lv2` as keyof CardCropData : activeMode;

            // 优先读取本地热更新，其次读静态字典，最后默认
            const override = localOverrides[selectedKey]?.[targetMode];
            const staticData = CARD_CROP_CONFIG[selectedKey]?.[targetMode];

            if (override) {
                setCropScale(override.scale);
                setCropOffset({ x: override.offsetX, y: override.offsetY });
            } else if (staticData) {
                setCropScale(staticData.scale);
                setCropOffset({ x: staticData.offsetX, y: staticData.offsetY });
            } else {
                setCropScale(1);
                setCropOffset({ x: 0, y: 0 });
            }
        };
        loadCropData();
    }, [selectedKey, activeMode, heroLevel]); // [修改] 加入 heroLevel 触发重载

    // === 逻辑过滤 ===
    const isFilterActive = category !== 'ALL' || costFilter !== 'ALL' || regionFilter !== 'ALL' || searchTerm !== '';
    const resetFilters = () => {
        setSearchTerm(''); setCategory('ALL'); setCostFilter('ALL'); setRegionFilter('ALL');
    };

    const filteredCards = useMemo(() => {
        return Object.values(CARD_DB).filter(c => {
            // [新增] 全局过滤：法术卡没有战场/备战席形态，直接从卡面编辑器中彻底移除
            if (c.type.includes('spell')) return false;

            if (searchTerm && !c.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;

            // [修改] 简化类别判断 (因为法术已经被全局移除了)
            if (category === 'HERO' && !c.isChampion) return false;
            if (category === 'UNIT' && c.isChampion) return false;

            if (regionFilter !== 'ALL' && c.region !== regionFilter) return false;

            if (costFilter !== 'ALL') {
                if (costFilter === '10+' && c.cost < 10) return false;
                if (costFilter !== '10+' && c.cost.toString() !== costFilter) return false;
            }
            return true;
        });
    }, [searchTerm, category, costFilter, regionFilter]);

    // === 核心功能 ===
    const handleSaveCrop = () => {
        if (!selectedKey) return;

        const newOverrides = { ...localOverrides };
        if (!newOverrides[selectedKey]) newOverrides[selectedKey] = {};

        // [修改] 根据 heroLevel 存入对应的键名
        const targetMode = heroLevel === 2 ? `${activeMode}_lv2` as keyof CardCropData : activeMode;

        newOverrides[selectedKey][targetMode] = {
            scale: parseFloat(cropScale.toFixed(2)),
            offsetX: parseFloat(cropOffset.x.toFixed(2)),
            offsetY: parseFloat(cropOffset.y.toFixed(2))
        };

        setLocalOverrides(newOverrides);
        localStorage.setItem('dev_crop_overrides', JSON.stringify(newOverrides));

        // 触发全局事件，让大厅和游戏里的卡牌瞬间刷新
        window.dispatchEvent(new Event('CROP_UPDATED'));
    };

    const handleExport = () => {
        // 生成漂亮的 TypeScript 代码
        const tsCode = `export const CARD_CROP_CONFIG: Record<string, any> = {\n${
            Object.entries(localOverrides).map(([key, data]) => {
                return `    '${key}': ${JSON.stringify(data).replace(/"([^"]+)":/g, '$1:')}`;
            }).join(',\n')
        }\n};`;

        navigator.clipboard.writeText(tsCode).then(() => {
            alert("✅ TypeScript 代码已复制到剪贴板！请粘贴至 cardCropConfig.ts 中。");
        });
    };

    const targetCard = selectedKey ? CARD_DB[selectedKey] : null;

    // 动态计算工作台裁剪框尺寸
    const getCropperDimensions = () => {
        switch (activeMode) {
            case 'hand': return { width: 288, height: 448, rounded: 'rounded-2xl' };
            case 'bench': return { width: 120, height: 162, rounded: 'rounded-md' };
            case 'combat': return { width: 240, height: 162, rounded: 'rounded-md' }; // 模拟战斗时的拉伸宽度
        }
    };
    const cropperDim = getCropperDimensions();

    return (
        <div className="w-full h-full flex bg-[#0f172a] text-white">

            {/* ================= PANEL 1: 左侧卡牌库 ================= */}
            {/* [修复] 加宽左侧面板到 480px，给卡牌更多展示空间 */}
            <div className="w-[480px] h-full border-r border-white/10 flex flex-col bg-slate-900 shadow-xl z-20 shrink-0">
                {/* 顶部工具栏 */}
                <div className="p-4 border-b border-white/10 space-y-3 bg-black/20">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="text" placeholder="Search cards..." value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)}
                                className="w-full bg-slate-800 rounded-md py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                            />
                        </div>
                        {/* 类别单选 */}
                        <div className="flex gap-1 bg-slate-800 p-1 rounded-md">
                            <button onClick={()=>setCategory('HERO')} className={`p-1.5 rounded-sm ${category==='HERO'?'bg-yellow-600 text-white':'text-gray-400'}`} title="Heroes"><User size={16}/></button>
                            {/* [修改] 移除了法术 (Zap) 按钮 */}
                            <button onClick={()=>setCategory('UNIT')} className={`p-1.5 rounded-sm ${category==='UNIT'?'bg-orange-600 text-white':'text-gray-400'}`} title="Units"><Box size={16}/></button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            className={`flex-1 py-1.5 flex items-center justify-center gap-2 text-sm rounded-md transition-colors ${isFilterOpen ? 'bg-blue-600 text-white' : 'bg-slate-800 text-gray-300 hover:bg-slate-700'}`}
                        >
                            <Filter size={16} /> ADVANCED FILTERS
                        </button>
                        <button
                            onClick={resetFilters} disabled={!isFilterActive}
                            className={`p-1.5 rounded-md transition-colors ${isFilterActive ? 'bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white' : 'bg-slate-800 text-gray-600'}`}
                            title="Reset Filters"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* 高级过滤弹窗 */}
                    <AnimatePresence>
                        {isFilterOpen && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <div className="p-3 bg-slate-800 rounded-md mt-2 space-y-3 border border-white/5 shadow-inner">
                                    {/* Cost */}
                                    <div>
                                        <span className="text-[10px] text-gray-400 font-bold tracking-widest block mb-1">COST</span>
                                        <div className="flex flex-wrap gap-1">
                                            {/* [修复] 补全 7 到 10 */}
                                            {['ALL', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '10+'].map(c => (
                                                <button key={c} onClick={()=>setCostFilter(c)} className={`w-7 h-7 rounded-full text-xs font-mono font-bold flex items-center justify-center ${costFilter===c ? 'bg-blue-500 text-white':'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}>
                                                    {c}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Region */}
                                    <div>
                                        <span className="text-[10px] text-gray-400 font-bold tracking-widest block mb-1">REGION</span>
                                        <div className="flex flex-wrap gap-1">
                                            {['ALL', 'Lyfe', 'Fenny', 'Logistics', 'TEST'].map(r => (
                                                <button key={r} onClick={()=>setRegionFilter(r)} className={`px-2 py-1 rounded-sm text-xs font-bold ${regionFilter===r ? 'bg-blue-500 text-white':'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}>
                                                    {r.toUpperCase()}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* 卡牌网格 (双击选择) */}
                {/* [修复] 增加间距和最小高度，实现舒适的 4x4 大致排版 */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <div className="grid grid-cols-4 gap-5 auto-rows-[minmax(130px,auto)]">
                        {filteredCards.map(c => (
                            <div
                                key={c.key}
                                onDoubleClick={() => {
                                    setSelectedKey(selectedKey === c.key ? null : c.key);
                                    // [核心修复] 每次切换或取消选中卡牌时，强制将英雄形态重置回 1 级，防止状态残留导致非英雄卡把坐标存入 lv2 中
                                    setHeroLevel(1);
                                }}
                                className={`aspect-[3/4] rounded-md overflow-hidden cursor-pointer transition-all border-2 ${selectedKey === c.key ? 'border-green-400 scale-105 shadow-[0_0_15px_rgba(74,222,128,0.5)] z-10' : 'border-slate-700 hover:border-slate-500 opacity-70 hover:opacity-100'}`}
                            >
                                <img src={c.imageUrl} className="w-full h-full object-cover" alt={c.name} draggable={false} />
                                <div className="absolute bottom-0 left-0 w-full bg-black/80 px-1 py-0.5 text-[8px] font-mono truncate text-white/60">
                                    {c.name.replace('\n', ' ')}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ================= PANEL 2: 中间多模态裁剪台 ================= */}
            <div className="flex-1 relative flex flex-col bg-slate-950 overflow-hidden items-center justify-center">
                {!targetCard ? (
                    <div className="text-gray-600 flex flex-col items-center gap-4 animate-pulse">
                        <Layers size={64} />
                        <span className="font-black tracking-widest text-xl">DOUBLE CLICK A CARD TO EDIT</span>
                    </div>
                ) : (
                    <>
                        <h2 className="absolute top-10 font-black text-3xl tracking-[0.3em] text-white/20">CROPPING WORKBENCH</h2>

                        {/* [修复 5 & 6] 沉浸式拖拽区 (扩大拖拽范围，修复坐标算法，实现暗色底图覆盖) */}
                        <div
                            className="absolute inset-0 top-24 bottom-32 z-10 flex items-center justify-center cursor-move"
                            onWheel={(e) => setCropScale(p => Math.min(Math.max(0.2, p + (e.deltaY > 0 ? -0.05 : 0.05)), 4))}
                            onMouseDown={(e) => {
                                isDragging.current = true;
                                dragStart.current = { x: e.clientX, y: e.clientY, baseX: cropOffset.x, baseY: cropOffset.y };
                            }}
                            onMouseMove={(e) => {
                                if(!isDragging.current) return;
                                // [修复 6] 坐标算法修正：百分比位移需除以 scale，抵消放大带来的位移加速，实现像素级跟手
                                const percentX = (e.clientX - dragStart.current.x) / cropperDim.width * 100 / cropScale;
                                const percentY = (e.clientY - dragStart.current.y) / cropperDim.height * 100 / cropScale;
                                setCropOffset({ x: dragStart.current.baseX + percentX, y: dragStart.current.baseY + percentY });
                            }}
                            onMouseUp={() => isDragging.current = false}
                            onMouseLeave={() => isDragging.current = false}
                        >
                            {/* 裁剪基准框 */}
                            <div className="relative shadow-2xl" style={{ width: cropperDim.width, height: cropperDim.height }}>

                                {/* 1. 底层：完整图片（暗色）- flex居中，利用宽高自适应打破 object-cover 带来的物理裁切 */}
                                <div className="absolute inset-0 flex items-center justify-center overflow-visible">
                                    <img
                                        src={heroLevel === 2 && targetCard.level2ImageUrl ? targetCard.level2ImageUrl : targetCard.imageUrl}
                                        draggable={false}
                                        className="max-w-none opacity-30 pointer-events-none transition-none block"
                                        style={{
                                            width: targetCard.type.includes('spell') ? 'auto' : '100%',
                                            height: targetCard.type.includes('spell') ? '100%' : 'auto',
                                            transform: `translate(${cropOffset.x}%, ${cropOffset.y}%) scale(${cropScale})`
                                        }}
                                    />
                                </div>

                                {/* 2. 顶层：高亮裁剪框 - overflow-hidden 只显示框内 */}
                                <div className={`absolute inset-0 overflow-hidden ${cropperDim.rounded} border border-white/20 bg-black flex items-center justify-center`}>
                                    <img
                                        src={heroLevel === 2 && targetCard.level2ImageUrl ? targetCard.level2ImageUrl : targetCard.imageUrl}
                                        draggable={false}
                                        className="max-w-none pointer-events-none transition-none block"
                                        style={{
                                            width: targetCard.type.includes('spell') ? 'auto' : '100%',
                                            height: targetCard.type.includes('spell') ? '100%' : 'auto',
                                            transform: `translate(${cropOffset.x}%, ${cropOffset.y}%) scale(${cropScale})`
                                        }}
                                    />
                                </div>

                                {/* 3. 辅助线 */}
                                <div className={`absolute inset-0 z-20 border-2 border-green-500/50 pointer-events-none ${cropperDim.rounded}`}>
                                    <div className="w-full h-[1px] bg-green-500/30 absolute top-1/2" />
                                    <div className="w-[1px] h-full bg-green-500/30 absolute left-1/2" />
                                </div>
                            </div>
                        </div>

                        {/* 底部保存按钮 (点击才会更新) */}
                        <div className="absolute bottom-12 flex flex-col items-center gap-4">
                            <div className="bg-black/50 backdrop-blur-sm px-6 py-2 rounded-full border border-white/10 font-mono text-sm text-green-300">
                                SCALE: {cropScale.toFixed(2)} | X: {cropOffset.x.toFixed(2)}% | Y: {cropOffset.y.toFixed(2)}%
                            </div>
                            <button
                                onClick={handleSaveCrop}
                                className="w-16 h-16 rounded-full bg-green-600 hover:bg-green-500 text-white flex items-center justify-center shadow-[0_0_30px_rgba(22,163,74,0.5)] transition-all hover:scale-110 active:scale-95"
                                title="Save to Workspace"
                            >
                                <Check size={32} />
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* ================= PANEL 3: 右侧预览与控制台 ================= */}
            <div className="w-[420px] h-full border-l border-white/10 flex flex-col bg-slate-900 shadow-[-10px_0_30px_rgba(0,0,0,0.5)] shrink-0 z-20">

                {/* 实时预览舱 */}
                <div className="h-[60%] border-b border-white/10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-slate-800 relative flex items-center justify-center">

                    {/* [新增] 右上角常驻返回大厅按钮 */}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 z-50 bg-black/60 hover:bg-red-600 text-white px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors border border-white/20 font-bold text-xs"
                            title="Exit Studio"
                        >
                            <X size={16}/> EXIT
                        </button>
                    )}

                    {!targetCard ? (
                        <div className="text-gray-600 font-mono tracking-widest text-sm">NO PREVIEW</div>
                    ) : (
                        <>
                            {/* 英雄形态切换器 */}
                            {targetCard.isChampion && (
                                <button
                                    onClick={() => setHeroLevel(p => p === 1 ? 2 : 1)}
                                    className="absolute top-4 left-4 z-50 bg-black/60 hover:bg-blue-600 text-white px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors border border-white/20 font-bold text-xs"
                                >
                                    {heroLevel === 1 ? <><ArrowUpCircle size={16}/> LEVEL UP</> : <><ArrowDownCircle size={16}/> LEVEL DOWN</>}
                                </button>
                            )}

                            {/* 提示：此处的预览会随着 CROP_UPDATED 事件，通过 Card 内部的 useCardCrop 热更新！ */}
                            {/* [修复 4] 强行放大预览图，更利于开发观察 */}
                            <div className={`transform scale-[1.55] origin-center shadow-2xl ${activeMode === 'combat' ? 'w-[240px] h-[162px]' : ''}`}>
                                <Card
                                    // [核心修复 1] 加入 key，强制 React 在切换卡牌、等级、形态时彻底销毁并重建组件，清除生命值对比残留，阻止错误播放受伤动画
                                    key={`${targetCard.key}-${heroLevel}-${activeMode}`}
                                    data={(() => {
                                        // [核心修复 2] 模拟游戏引擎：如果是 2 级，手动赋予数值增长
                                        const cardInfo = { ...targetCard, level: heroLevel };
                                        if (heroLevel === 2) {
                                            if (cardInfo.key === 'fenny') {
                                                cardInfo.power += 4;
                                                cardInfo.health += 1;
                                                cardInfo.maxHealth += 1;
                                            } else {
                                                cardInfo.power += 1;
                                                cardInfo.health += 1;
                                                cardInfo.maxHealth += 1;
                                            }
                                        }
                                        return cardInfo as CardData;
                                    })()}
                                    location={activeMode}
                                    isFaceUp={true}
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* 控制台面板 */}
                <div className="flex-1 p-6 flex flex-col gap-8 bg-slate-900 relative">

                    {/* 模态切换按钮组 */}
                    <div>
                        <span className="text-xs font-black tracking-[0.2em] text-gray-500 mb-3 block">EDITING MODE</span>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setActiveMode('hand')}
                                className={`flex-1 h-16 rounded-lg flex flex-col items-center justify-center gap-1 transition-all border-2 ${activeMode === 'hand' ? 'bg-blue-900/40 border-green-400 text-green-400 scale-105 shadow-[0_0_15px_rgba(74,222,128,0.2)]' : 'bg-slate-800 border-transparent text-gray-400 hover:bg-slate-700'}`}
                            >
                                <Layers size={20} /> <span className="text-[10px] font-bold">HAND</span>
                            </button>
                            <button
                                onClick={() => setActiveMode('bench')}
                                className={`flex-1 h-16 rounded-lg flex flex-col items-center justify-center gap-1 transition-all border-2 ${activeMode === 'bench' ? 'bg-orange-900/40 border-green-400 text-green-400 scale-105 shadow-[0_0_15px_rgba(74,222,128,0.2)]' : 'bg-slate-800 border-transparent text-gray-400 hover:bg-slate-700'}`}
                            >
                                <Shield size={20} /> <span className="text-[10px] font-bold">BENCH</span>
                            </button>
                            <button
                                onClick={() => setActiveMode('combat')}
                                className={`flex-1 h-16 rounded-lg flex flex-col items-center justify-center gap-1 transition-all border-2 ${activeMode === 'combat' ? 'bg-red-900/40 border-green-400 text-green-400 scale-105 shadow-[0_0_15px_rgba(74,222,128,0.2)]' : 'bg-slate-800 border-transparent text-gray-400 hover:bg-slate-700'}`}
                            >
                                <Sword size={20} /> <span className="text-[10px] font-bold">COMBAT</span>
                            </button>
                        </div>
                    </div>

                    {/* 使用说明 */}
                    <div className="bg-black/30 border border-yellow-500/20 rounded-md p-4 flex gap-3 text-sm text-gray-400 leading-relaxed">
                        <AlertTriangle size={16} className="text-yellow-500 shrink-0 mt-0.5" />
                        <p>调整完毕后点击中间的 <b className="text-green-400">√</b> 保存至本地。所有修改完成后，点击下方按钮导出 TypeScript 配置并覆盖源代码。</p>
                    </div>

                    {/* 极客风导出按钮 */}
                    <button
                        onClick={handleExport}
                        className="mt-auto w-full py-4 bg-gradient-to-r from-blue-700 to-indigo-600 hover:from-blue-600 hover:to-indigo-500 text-white rounded-md font-black tracking-widest flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(79,70,229,0.5)] transition-all hover:scale-[1.02] active:scale-95"
                    >
                        <Download size={20} /> EXPORT CONFIG TO CLIPBOARD
                    </button>
                </div>
            </div>
        </div>
    );
};