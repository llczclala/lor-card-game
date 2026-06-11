import React, { useState, useRef, useEffect } from 'react';
import {
    Settings, RefreshCw, Eye, EyeOff, Sword, Hexagon, Plus,
    Image as ImageIcon, ClipboardList, ShoppingBag, Users,
    X, Check
} from 'lucide-react';
import { eventBus, GameEvents } from '../utils/eventBus';
import { motion, AnimatePresence } from 'framer-motion';
import { useUserSystem } from '../hooks/useUserSystem';
import { HERO_IMAGES, CURRENCY_ICONS, LOADING_SCREEN_IMAGES, UNIT_IMAGES, SPELL_IMAGES } from '../data/imageData';
import { getHallMovies } from '../data/movieData';
import { ChevronRight, Play, User, Copy, Edit3, Crop, Wrench } from 'lucide-react'; // [修改] 新增 Wrench 图标

// [新增] 引入 GM 工作室主控台
import { Studio } from './Studio/Studio';
// [新增] 引入全新的全息科技图鉴舱
import { GalleryCodex } from './GalleryCodex';
// [新增] 导出背景类型，供 App.tsx 等外部调用
export type BgType = 'movie' | 'pic';
export interface BgConfig { type: BgType; url: string; index: number; }

interface GameLobbyProps {
    userSystem: ReturnType<typeof useUserSystem>;
    onStartBattle: () => void;
    onSwitchVideo: () => void;
    onOpenSettings: () => void;
    onGachaClick: () => void;
    onOpenMission?: () => void;
    onOpenShop?: () => void;
    onOpenDeck?: () => void;
    onSelectBackground?: () => void;
    // [新增] 背景管理 Props
    customBg: BgConfig | null;
    onUpdateCustomBg: (bg: BgConfig | null) => void;
}

// [新增] 通用磨砂透视按钮组件
const GlassButton = ({
    onClick, children, className = "", active = false, label, subLabel
}: {
    onClick?: () => void, children?: React.ReactNode, className?: string, active?: boolean, label?: string, subLabel?: string
}) => (
    <motion.button
        whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.15)" }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
            eventBus.emit(GameEvents.UI_CLICK);
            if (onClick) onClick();
        }}
        className={`
            relative flex flex-col items-center justify-center
            backdrop-blur-md border transition-all duration-300 group
            ${active ? 'bg-white/20 border-white/40 text-white' : 'bg-black/20 border-white/10 text-gray-300 hover:text-white hover:border-white/30'}
            ${className}
        `}
    >
        {children}
        {label && <span className="mt-1 text-sm font-black tracking-widest">{label}</span>}
        {subLabel && <span className="text-[10px] font-mono opacity-60">{subLabel}</span>}
    </motion.button>
);

export const GameLobby: React.FC<GameLobbyProps> = ({
    userSystem,
    onStartBattle,
    onSwitchVideo,
    onOpenSettings,
    onGachaClick,
    onOpenMission,
    onOpenShop,
    onOpenDeck,
    onSelectBackground,
    customBg,           // [新增]
    onUpdateCustomBg    // [新增]
}) => {
    const [showUI, setShowUI] = useState(true);
    const { profile, collection } = userSystem;
    // 1. 本地资源状态 (用于实现大厅资源的实时扣除和增加显示)
    const [localRes, setLocalRes] = useState({
        silverCoin: collection?.resources?.silverCoin || 0,
        dataGold: collection?.resources?.dataGold || 0,
        bitGold: collection?.resources?.bitGold || 0,
    });

    // 监听后端数据刷新并同步
    useEffect(() => {
        if (collection?.resources) {
            setLocalRes({
                silverCoin: collection.resources.silverCoin || 0,
                dataGold: collection.resources.dataGold || 0,
                bitGold: collection.resources.bitGold || 0,
            });
        }
    }, [collection?.resources]);

    // 2. 兑换系统状态管理
    const [exchangeConfig, setExchangeConfig] = useState<{
        type: 'DATA_TO_SILVER' | 'BIT_TO_DATA';
        sourceIcon: string; targetIcon: string;
        sourceColor: string; targetColor: string; // Tailwind边框颜色类名
        sourceName: string; targetName: string;
        costPerUnit: number; gainPerUnit: number;
        maxUnits: number;
    } | null>(null);
    const [exchangeAmount, setExchangeAmount] = useState(1);
    const [successData, setSuccessData] = useState<{ icon: string; amount: number; color: string } | null>(null);

    // 3. 长按连续增减逻辑 (Refs)
    const intervalRef = useRef<number | null>(null);
    const timeoutRef = useRef<number | null>(null);

    const stopPress = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (intervalRef.current) clearInterval(intervalRef.current);
    };

    const handleAmountChange = (action: 'add' | 'sub', currentMax: number) => {
        setExchangeAmount(prev => {
            if (action === 'add') return Math.min(prev + 1, currentMax);
            return Math.max(prev - 1, 1);
        });
    };

    const startPress = (action: 'add' | 'sub', currentMax: number) => {
        handleAmountChange(action, currentMax);
        timeoutRef.current = setTimeout(() => {
            intervalRef.current = setInterval(() => {
                handleAmountChange(action, currentMax);
            }, 100); // 连续触发速度
        }, 400); // 长按判定延迟
    };

    // 4. 打开兑换弹窗函数
    const openExchange = (type: 'DATA_TO_SILVER' | 'BIT_TO_DATA') => {
        eventBus.emit(GameEvents.UI_CLICK);
        if (type === 'DATA_TO_SILVER') {
            const maxUnits = Math.floor(localRes.dataGold / 10);
            setExchangeConfig({
                type, sourceIcon: CURRENCY_ICONS.dataGold, targetIcon: CURRENCY_ICONS.silverCoin,
                sourceColor: 'border-yellow-400', targetColor: 'border-green-400',
                sourceName: '数据金', targetName: '通用银', costPerUnit: 10, gainPerUnit: 4680, maxUnits
            });
        } else {
            const maxUnits = Math.floor(localRes.bitGold / 1);
            setExchangeConfig({
                type, sourceIcon: CURRENCY_ICONS.bitGold, targetIcon: CURRENCY_ICONS.dataGold,
                sourceColor: 'border-red-500', targetColor: 'border-yellow-400',
                sourceName: '比特金', targetName: '数据金', costPerUnit: 1, gainPerUnit: 1000, maxUnits
            });
        }
        setExchangeAmount(1);
    };

    // 5. 确认兑换结算逻辑
    const confirmExchange = () => {
        if (!exchangeConfig) return;
        const totalCost = exchangeAmount * exchangeConfig.costPerUnit;
        const totalGain = exchangeAmount * exchangeConfig.gainPerUnit;

        // 实时更新大厅资源显示
        setLocalRes(prev => {
            const next = { ...prev };
            if (exchangeConfig.type === 'DATA_TO_SILVER') {
                next.dataGold -= totalCost;
                next.silverCoin += totalGain;
            } else {
                next.bitGold -= totalCost;
                next.dataGold += totalGain;
            }
            return next;
        });

        // 记录成功界面数据并关闭原弹窗
        setSuccessData({
            icon: exchangeConfig.targetIcon,
            amount: totalGain,
            color: exchangeConfig.targetColor
        });
        setExchangeConfig(null);
    };
// --- [修改] 背景自定义系统状态 ---
    // 移除原本本地的 currentBg，改为直接使用 props 中的 customBg
    const [isBgSelecting, setIsBgSelecting] = useState(false);
    const [bgMode, setBgMode] = useState<BgType>(customBg ? customBg.type : 'movie');
    const [previewBg, setPreviewBg] = useState<BgConfig | null>(null);

    const [isSidebarTransitioning, setIsSidebarTransitioning] = useState(false);
    const [isGridOpen, setIsGridOpen] = useState(false);

    // --- [新增] GM 开发者工具状态 ---
    const [isStudioOpen, setIsStudioOpen] = useState(false);
    // [修正] 彻底更名为独立命名空间 isCodexBookOpen，绝不与原版的头像选择相册（isGalleryOpen）发生任何串线
    const [isCodexBookOpen, setIsCodexBookOpen] = useState(false);

    // --- [新增] 玩家档案与头像裁剪系统状态 ---
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [editName, setEditName] = useState("");
    const [isEditingName, setIsEditingName] = useState(false); // [新增] 控制名字编辑模式

    // 画廊与裁剪台状态
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);
    const [isCropperOpen, setIsCropperOpen] = useState(false);
    const [cropTarget, setCropTarget] = useState<{ key: string; type: 'hero' | 'unit' | 'spell'; url: string } | null>(null);
    const [cropScale, setCropScale] = useState(1);
    const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 }); // 现已改为存储“百分比(%)”

    const isDragging = useRef(false);
    // [修改] 增加 baseX 和 baseY，用于精准计算百分比拖拽增量
    const dragStart = useRef({ x: 0, y: 0, baseX: 0, baseY: 0 });

    // 动态聚合全图鉴画廊数据
    const galleryItems = React.useMemo(() => {
        const items: { type: 'hero' | 'unit' | 'spell'; key: string; url: string }[] = [];
        Object.entries(HERO_IMAGES).forEach(([key, val]) => items.push({ type: 'hero', key, url: val.base }));
        Object.entries(UNIT_IMAGES).forEach(([key, url]) => items.push({ type: 'unit', key, url }));
        Object.entries(SPELL_IMAGES).forEach(([key, url]) => items.push({ type: 'spell', key, url }));
        return items;
    }, []);

    // 核心渲染器：根据裁剪配置动态渲染1:1头像
    const renderAvatar = (config?: any, fallbackId?: string) => {
        if (config && config.scale !== undefined) {
            let src = HERO_IMAGES['lyfe']?.base;
            if (config.type === 'hero') src = HERO_IMAGES[config.imageKey]?.base || src;
            if (config.type === 'unit') src = UNIT_IMAGES[config.imageKey as keyof typeof UNIT_IMAGES] || src;
            if (config.type === 'spell') src = SPELL_IMAGES[config.imageKey as keyof typeof SPELL_IMAGES] || src;

            // 竖向图片(英雄/单位)宽撑满，横向图片(法术)高撑满，保证最短边对齐容器
            const isPortrait = config.type !== 'spell';

            return (
                <div className="w-full h-full relative overflow-hidden bg-black">
                    <img src={src} draggable={false} className="max-w-none pointer-events-none absolute"
                        style={{
                            top: '50%', left: '50%',
                            width: isPortrait ? '100%' : 'auto',
                            height: isPortrait ? 'auto' : '100%',
                            // 使用 calc 完美结合百分比偏移与缩放
                            transform: `translate(calc(-50% + ${config.offsetX}%), calc(-50% + ${config.offsetY}%)) scale(${config.scale})`
                        }}
                    />
                </div>
            );
        }
        const fallbackSrc = fallbackId ? HERO_IMAGES[fallbackId as keyof typeof HERO_IMAGES]?.base : HERO_IMAGES['lyfe'].base;
        return <img src={fallbackSrc} alt="Avatar" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />;
    };


    // 动态生成背景数据列表
    const movieList: BgConfig[] = React.useMemo(() => getHallMovies().map((url, i) => ({ type: 'movie', url, index: i })), []);
    const picList: BgConfig[] = React.useMemo(() => LOADING_SCREEN_IMAGES.map((url, i) => ({ type: 'pic', url, index: i })), []);
    const currentList = bgMode === 'movie' ? movieList : picList;

    // 模式切换逻辑
    const handleToggleBgMode = () => {
        eventBus.emit(GameEvents.UI_CLICK);
        setIsSidebarTransitioning(true);
        setTimeout(() => {
            setBgMode(prev => prev === 'movie' ? 'pic' : 'movie');
            setTimeout(() => setIsSidebarTransitioning(false), 50);
        }, 300);
    };

    // 保存逻辑 (上报给 App.tsx)
    const handleSaveBg = () => {
        eventBus.emit(GameEvents.UI_CLICK);
        if (previewBg) {
            onUpdateCustomBg(previewBg); // [修改] 交给全局接管
        }
        handleCloseBgSelect();
    };

    // [新增] NEXT 按钮智能切换逻辑
    const handleNextBg = () => {
        if (customBg) {
            const list = customBg.type === 'movie' ? movieList : picList;
            const nextIndex = (customBg.index + 1) % list.length;
            onUpdateCustomBg(list[nextIndex]); // 列表内循环切换
        } else {
            onSwitchVideo(); // 没设置自定义时，调用系统默认切换
        }
    };

    // 全局 ESC 按键拦截 (增强版，支持多层级窗口)
    useEffect(() => {
        if (!isBgSelecting && !isProfileOpen && !isGalleryOpen && !isCropperOpen) return;
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopImmediatePropagation();
                eventBus.emit(GameEvents.UI_CLICK);

                // 逐级退出逻辑
                if (isCropperOpen) { setIsCropperOpen(false); setIsGalleryOpen(true); }
                else if (isGalleryOpen) { setIsGalleryOpen(false); setIsProfileOpen(true); }
                else if (isProfileOpen) { setIsProfileOpen(false); setShowUI(true); }
                else if (isGridOpen) setIsGridOpen(false);
                else handleCloseBgSelect();
            }
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [isBgSelecting, isGridOpen, isProfileOpen, isGalleryOpen, isCropperOpen]);

    // 打开背景设置面板
    const handleOpenBgSelect = () => {
        eventBus.emit(GameEvents.UI_CLICK);
        setShowUI(false);
        setIsBgSelecting(true);
        setPreviewBg(customBg);  // [修改] 记录打开时的全局背景用于撤销
        if (onSelectBackground) onSelectBackground();
    };

    // 取消并关闭背景设置面板
    const handleCloseBgSelect = () => {
        eventBus.emit(GameEvents.UI_CLICK);
        setIsBgSelecting(false);
        setIsGridOpen(false);
        setIsSidebarTransitioning(false);
        setPreviewBg(null);
        setShowUI(true);
    };

    return (
        <div className="relative w-full h-full overflow-hidden">

            {/* --- [修改] 预览覆写层 --- */}
            {/* 现在平时由 App.tsx 在底层渲染，GameLobby 仅在“正在设置预览”时进行遮盖 */}
            <AnimatePresence>
                {isBgSelecting && previewBg && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[5] bg-black"
                    >
                        {previewBg.type === 'pic' ? (
                            <img src={previewBg.url} className="w-full h-full object-cover" alt="Preview BG" />
                        ) : (
                            <video src={previewBg.url} autoPlay loop muted className="w-full h-full object-cover" />
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 顶部兜底条 (提升 z-index 到 10，使其覆盖在自定义背景之上) */}
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-gray-200/10 to-transparent blur-2xl z-[10] pointer-events-none" />

            {/* --- 1. 顶部资源栏 (修正：分离动画与透视) --- */}
            <div
                // 外层：负责定位和进出场位移 (Tailwind transition)
                className={`absolute top-0 right-0 p-6 z-50 transition-all duration-500 ${showUI ? 'translate-y-0 opacity-100' : '-translate-y-20 opacity-0'}`}
            >
                {/* 内层：负责透视变形 (Skew) */}
                <div
                    className="flex items-start gap-4"
                    style={{ transform: 'skewY(2.5deg)' }}
                >
                    {/* 资源列表 */}
                    <div className="flex flex-col gap-2 items-end">
                        <div className="flex gap-3">
                            {/* 1. 通用银 (SILVER) */}
                            <div className="flex items-center gap-3 px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-sm min-w-[140px] justify-between hover:bg-black/60 transition-colors">
                                <div className="flex items-center gap-2">
                                    <img src={CURRENCY_ICONS.silverCoin} className="w-5 h-5 opacity-90" alt="SILVER" />
                                    <span className="text-sm font-mono font-bold text-gray-200">{localRes.silverCoin}</span>
                                </div>
                                <div
                                    onClick={() => openExchange('DATA_TO_SILVER')}
                                    className="w-4 h-4 bg-gray-700/50 hover:bg-blue-600 rounded-sm flex items-center justify-center cursor-pointer transition-colors"
                                >
                                    <Plus size={12} className="text-white" />
                                </div>
                            </div>

                            {/* 2. 数据金 (DATA) */}
                            <div className="flex items-center gap-3 px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-sm min-w-[140px] justify-between hover:bg-black/60 transition-colors">
                                <div className="flex items-center gap-2">
                                    <img src={CURRENCY_ICONS.dataGold} className="w-5 h-5 opacity-90" alt="DATA" />
                                    <span className="text-sm font-mono font-bold text-gray-200">{localRes.dataGold}</span>
                                </div>
                                <div
                                    onClick={() => openExchange('BIT_TO_DATA')}
                                    className="w-4 h-4 bg-gray-700/50 hover:bg-blue-600 rounded-sm flex items-center justify-center cursor-pointer transition-colors"
                                >
                                    <Plus size={12} className="text-white" />
                                </div>
                            </div>

                            {/* 3. 比特金 (BIT) - 移除加号 */}
                            <div className="flex items-center gap-3 px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-sm min-w-[120px] justify-between hover:bg-black/60 transition-colors">
                                <div className="flex items-center gap-2">
                                    <img src={CURRENCY_ICONS.bitGold} className="w-5 h-5 opacity-90" alt="BIT" />
                                    <span className="text-sm font-mono font-bold text-yellow-100">{localRes.bitGold}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 设置按钮 */}
                    <GlassButton onClick={onOpenSettings} className="w-12 h-10 rounded-sm">
                        <Settings size={20} className="group-hover:rotate-90 transition-transform duration-500" />
                    </GlassButton>
                </div>
            </div>

            {/* --- 2. 玩家信息 (重构为交互式入口) --- */}
            <div
                className={`absolute top-8 left-8 z-50 transition-all duration-500 ${showUI ? 'translate-x-0 opacity-100' : '-translate-x-20 opacity-0'}`}
            >
                <div
                    className="flex items-center gap-4 cursor-pointer group"
                    style={{ transform: 'skewY(-2.5deg)' }}
                    onClick={() => {
                        eventBus.emit(GameEvents.UI_CLICK);
                        setEditName(profile?.displayName || 'ADJUTANT');
                        setIsProfileOpen(true);
                        setShowUI(false);
                    }}
                >
                    {/* [修改] 头像容器接入伪裁剪渲染器与悬停遮罩 */}
                    <div className="w-16 h-16 rounded-sm border-2 border-white/20 overflow-hidden shadow-lg relative bg-black/50 group-hover:border-blue-400 transition-colors">
                        {renderAvatar(profile?.avatarConfig, profile?.avatarId)}
                        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <User size={24} className="text-white drop-shadow-md" />
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-2xl font-black text-white tracking-widest drop-shadow-md">{profile?.displayName || 'ADJUTANT'}</span>
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 text-[10px] font-bold rounded-sm border border-yellow-500/30">LV.{profile?.level || 1}</span>
                            <span className="text-xs text-white font-mono">UID: {userSystem.userId.slice(0, 8)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- 3. 左侧视觉控制区 --- */}
            <div
                // [修改] 增加针对 isBgSelecting 的左侧退场位移
                className={`absolute left-10 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-40 transition-all duration-500 ${isBgSelecting ? '-translate-x-32 opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}`}
            >
                <div style={{ transform: 'skewY(-2.5deg)' }} className="flex flex-row items-center gap-4">
                    <GlassButton
                        onClick={() => setShowUI(!showUI)}
                        className={`w-16 h-12 rounded-sm transition-opacity duration-500 ${showUI ? 'opacity-100' : 'opacity-30 hover:opacity-100'}`}
                        label={showUI ? "HIDE" : "SHOW"}
                    >
                        {showUI ? <Eye size={20} /> : <EyeOff size={20} />}
                    </GlassButton>

                    <div className={`flex flex-row gap-4 transition-all duration-500 ${showUI ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-10 pointer-events-none'}`}>
                        {/* [修改] 将原先单纯的 onSwitchVideo 替换为智能切换 handleNextBg */}
                        <GlassButton onClick={handleNextBg} className="w-16 h-12 rounded-sm" label="NEXT">
                            <RefreshCw size={20} />
                        </GlassButton>
                        <GlassButton onClick={handleOpenBgSelect} className="w-16 h-12 rounded-sm" label="BG">
                            <ImageIcon size={20} />
                        </GlassButton>
                    </div>
                </div>
            </div>

            {/* --- 4. 右侧核心行动区 (修正：解决 Framer Motion 覆盖问题) --- */}
            <AnimatePresence>
                {showUI && (
                    <div
                        // 外层：绝对定位容器 (不负责动画，避免 conflict)
                        // [关键修复] 将 skew 移到这里！
                        // 因为这里是静态的 div，不会被 framer motion 的 animate 属性覆盖 transform
                        className="absolute right-12 bottom-1/2 -translate-y-1/2 z-40"
                        style={{ transform: 'skewY(2.5deg)' }}
                    >
                        <motion.div
                            // 内层：负责进出场动画 (x, opacity)
                            // Framer Motion 会处理这里的 transform，但因为它在内部，所以是"倾斜坐标系内的位移"，效果更佳
                            initial={{ x: 100, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 100, opacity: 0 }}
                            className="flex items-center gap-4"
                        >
                            <GlassButton
                                onClick={onOpenMission}
                                className="w-20 h-20 rounded-sm bg-blue-900 border-blue-500/30 hover:bg-blue-800 text-blue-200"
                                label="TASK"
                            >
                                <ClipboardList size={24} className="text-blue-300" />
                            </GlassButton>

                            <div className="flex flex-col gap-4">
                                <GlassButton
                                    onClick={() => {eventBus.emit(GameEvents.LOBBY_START_BATTLE);onStartBattle();}}
                                    className="w-48 h-30 rounded-sm bg-orange-700 border-orange-500/50 hover:bg-orange-600 text-orange-100"
                                    label="COMBAT"
                                    subLabel="OPERATION START"
                                >
                                    <Sword size={40} className="text-orange-200 mb-2" />
                                </GlassButton>

                                <GlassButton
                                    onClick={onGachaClick}
                                    className="w-64 h-20 rounded-sm bg-purple-900 border-purple-500/50 hover:bg-purple-800 text-purple-100"
                                    label="RESONANCE"
                                >
                                    <div className="flex items-center gap-3">
                                        <Hexagon size={24} className="text-purple-300" />
                                        <span className="text-xs text-purple-100/60 font-mono">NEW ARRIVAL</span>
                                    </div>
                                </GlassButton>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* --- 5. 右下角工具区 (修正：分离动画与透视) --- */}
            <div
                // 外层：负责位移
                className={`absolute bottom-12 right-8 z-40 transition-all duration-500 ${showUI ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}
            >
                {/* 内层：负责透视 */}
                <div
                    className="flex gap-4"
                    style={{ transform: 'skewY(2.5deg)' }}
                >
                    {/* [修正] 呼叫正确的状态机，并同步执行 setShowUI(false) 瞬间隐藏大厅所有的倾斜按钮面板 */}
                    <GlassButton
                        onClick={() => {
                            setIsCodexBookOpen(true);
                            setShowUI(false);
                        }}
                        className="w-32 h-12 rounded-sm flex-row gap-2"
                        label="GALLERY"
                    >
                        <ClipboardList size={18} />
                    </GlassButton>

                    <GlassButton onClick={onOpenShop} className="w-32 h-12 rounded-sm flex-row gap-2" label="SHOP">
                        <ShoppingBag size={18} />
                    </GlassButton>

                    <GlassButton onClick={onOpenDeck} className="w-32 h-12 rounded-sm flex-row gap-2" label="SQUAD">
                        <Users size={18} />
                    </GlassButton>
                </div>
            </div>

            {/* --- 6. GM 开发者工具入口 (仅管理员可见) --- */}
            {userSystem.userId === 'dev_full_admin' && (
                <div className={`absolute bottom-12 left-10 z-50 transition-all duration-500 ${showUI ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsStudioOpen(true); setShowUI(false); }}
                        className="w-16 h-16 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center shadow-[0_0_30px_rgba(37,99,235,0.6)] border-2 border-blue-300 transition-all hover:scale-110 hover:rotate-12 group"
                        title="GM Studio"
                    >
                        <Wrench size={28} className="text-white drop-shadow-md group-hover:text-yellow-300 transition-colors" />
                    </button>
                </div>
            )}

        {/* ================= 新增：兑换设置弹窗 ================= */}
            <AnimatePresence>
                {exchangeConfig && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}
                            className="bg-gray-900/90 border border-white/20 p-8 rounded-sm shadow-2xl flex flex-col items-center gap-6 min-w-[400px]"
                        >
                            {/* 标题 */}
                            <h2 className="text-lg text-white font-bold tracking-widest text-center">
                                是否将 {exchangeAmount * exchangeConfig.costPerUnit} {exchangeConfig.sourceName}兑换成 {exchangeAmount * exchangeConfig.gainPerUnit} {exchangeConfig.targetName}
                            </h2>

                            {/* 图标展示区 */}
                            <div className="flex items-center gap-8 my-4">
                                {/* 消耗图标 */}
                                <div className={`relative w-20 h-20 border-2 ${exchangeConfig.sourceColor} bg-transparent flex items-center justify-center rounded-sm`}>
                                    <img src={exchangeConfig.sourceIcon} className="w-12 h-12 object-contain" alt="source" />
                                    <span className="absolute bottom-1 left-1 text-white text-xs font-mono">{exchangeAmount * exchangeConfig.costPerUnit}</span>
                                </div>

                                {/* 箭头 */}
                                <span className="text-gray-400 font-black tracking-tighter text-xl">》》》</span>

                                {/* 获得图标 */}
                                <div className={`relative w-20 h-20 border-2 ${exchangeConfig.targetColor} bg-transparent flex items-center justify-center rounded-sm`}>
                                    <img src={exchangeConfig.targetIcon} className="w-12 h-12 object-contain" alt="target" />
                                    <span className="absolute bottom-1 left-1 text-white text-xs font-mono">{exchangeAmount * exchangeConfig.gainPerUnit}</span>
                                </div>
                            </div>

                            {/* 数量控制区 */}
                            <div className="flex items-center gap-4 border border-white/10 bg-black/50 p-2 rounded-sm">
                                {/* 减号按钮 */}
                                <button
                                    onMouseDown={() => startPress('sub', exchangeConfig.maxUnits)}
                                    onMouseUp={stopPress} onMouseLeave={stopPress}
                                    onTouchStart={() => startPress('sub', exchangeConfig.maxUnits)}
                                    onTouchEnd={stopPress}
                                    disabled={exchangeAmount <= 1}
                                    className={`w-10 h-10 flex items-center justify-center rounded-sm transition-colors ${exchangeAmount <= 1 ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700'}`}
                                >
                                    <div className="w-4 h-0.5 bg-white rounded-full" />
                                </button>

                                {/* 文本框 */}
                                <input
                                    type="number"
                                    value={exchangeAmount}
                                    onChange={(e) => {
                                        let val = parseInt(e.target.value);
                                        if (isNaN(val) || val < 1) val = 1;
                                        if (val > exchangeConfig.maxUnits) val = Math.max(1, exchangeConfig.maxUnits);
                                        setExchangeAmount(val);
                                    }}
                                    className="w-20 bg-transparent text-center text-white font-mono text-xl outline-none"
                                />

                                {/* 加号按钮 */}
                                <button
                                    onMouseDown={() => startPress('add', exchangeConfig.maxUnits)}
                                    onMouseUp={stopPress} onMouseLeave={stopPress}
                                    onTouchStart={() => startPress('add', exchangeConfig.maxUnits)}
                                    onTouchEnd={stopPress}
                                    disabled={exchangeAmount >= exchangeConfig.maxUnits || exchangeConfig.maxUnits === 0}
                                    className={`w-10 h-10 flex items-center justify-center rounded-sm transition-colors ${exchangeAmount >= exchangeConfig.maxUnits || exchangeConfig.maxUnits === 0 ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700'}`}
                                >
                                    <Plus size={20} className="text-white" />
                                </button>
                            </div>

                            {/* 底部操作按钮 */}
                            <div className="flex w-full gap-4 mt-2">
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setExchangeConfig(null); }}
                                    className="flex-1 py-3 bg-gray-600 hover:bg-gray-500 text-white flex items-center justify-center gap-2 rounded-sm transition-colors"
                                >
                                    <X size={18} /> 取消
                                </button>
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); confirmExchange(); }}
                                    disabled={exchangeConfig.maxUnits === 0}
                                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400 text-white flex items-center justify-center gap-2 rounded-sm transition-colors"
                                >
                                    <Check size={18} /> 确定
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ================= 新增：兑换成功弹窗 ================= */}
            <AnimatePresence>
                {successData && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            className="flex flex-col items-center gap-8"
                        >
                            <h1 className="text-3xl text-white font-black tracking-[0.3em] drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
                                兑换成功
                            </h1>

                            <div className="flex flex-col items-center gap-4">
                                <div className={`w-32 h-32 border-2 ${successData.color} bg-transparent flex items-center justify-center rounded-sm shadow-[0_0_30px_rgba(255,255,255,0.1)]`}>
                                    <img src={successData.icon} className="w-20 h-20 object-contain drop-shadow-xl" alt="reward" />
                                </div>
                                <span className="text-2xl font-mono text-white tracking-widest">
                                    + {successData.amount}
                                </span>
                            </div>

                            <button
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setSuccessData(null); }}
                                className="w-16 h-16 rounded-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.5)] transition-all hover:scale-110"
                            >
                                <Check size={32} className="text-white" />
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ================= 新增：大厅背景自定义系统 UI (修复退场动画) ================= */}

            {/* --- A. 全屏网格面板 --- */}
            <AnimatePresence>
                {isBgSelecting && isGridOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute inset-0 z-[50] bg-white/10 backdrop-blur-xl p-16 pt-24 overflow-y-auto no-scrollbar"
                    >
                        <div className="grid grid-cols-4 gap-8 max-w-7xl mx-auto">
                            {currentList.map(bg => (
                                <div
                                    key={bg.url}
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setPreviewBg(bg); }}
                                    className={`relative w-full aspect-video rounded-sm overflow-hidden cursor-pointer transition-all duration-300 shadow-lg ${previewBg?.url === bg.url ? 'border-4 border-blue-500 scale-105 shadow-[0_0_20px_rgba(37,99,235,0.5)]' : 'border-2 border-white/20 hover:border-white/50 hover:scale-105'}`}
                                >
                                    {bg.type === 'movie' ? (
                                        <video src={bg.url} preload="metadata" className="w-full h-full object-cover" />
                                    ) : (
                                        <img src={bg.url} className="w-full h-full object-cover" alt="bg option" />
                                    )}
                                    {/* 视频中间的播放图标 */}
                                    {bg.type === 'movie' && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                            <Play size={32} className="text-white/70" fill="currentColor" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- B. 左侧滑动模块 --- */}
            <AnimatePresence>
                {isBgSelecting && !isGridOpen && (
                    <motion.div
                        // 动态控制 x 坐标实现两段式进退场
                        initial={{ x: -300, opacity: 0 }}
                        animate={{ x: isSidebarTransitioning ? -300 : 0, opacity: isSidebarTransitioning ? 0 : 1 }}
                        exit={{ x: -300, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="absolute left-10 top-[15%] bottom-[15%] w-64 flex flex-col z-[55] bg-black/40 backdrop-blur-md border border-white/10 rounded-sm p-4"
                    >
                        {/* 顶部模式切换按钮 */}
                        <GlassButton
                            onClick={handleToggleBgMode}
                            className="w-full h-16 rounded-sm bg-white/10 hover:bg-white/20 mb-4 flex-shrink-0"
                            label={bgMode === 'movie' ? 'MOVIE' : 'PIC'}
                        />

                        {/* 资源列表滚动区 */}
                        <div className="flex-1 overflow-y-auto flex flex-col gap-4 no-scrollbar pr-2">
                            {currentList.map(bg => (
                                <div
                                    key={bg.url}
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setPreviewBg(bg); }}
                                    className={`relative w-full h-28 rounded-sm overflow-hidden cursor-pointer transition-all duration-300 flex-shrink-0 ${previewBg?.url === bg.url ? 'border-2 border-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'border border-white/20 hover:border-white/50'}`}
                                >
                                    {bg.type === 'movie' ? (
                                        <video src={bg.url} preload="metadata" className="w-full h-full object-cover opacity-80" />
                                    ) : (
                                        <img src={bg.url} className="w-full h-full object-cover opacity-80" alt="bg option" />
                                    )}
                                    {bg.type === 'movie' && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                                            <Play size={24} className="text-white/60" fill="currentColor" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* 侧边展开网格按钮 (半透明三角形右箭头) */}
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsGridOpen(true); }}
                            className="absolute -right-8 top-1/2 -translate-y-1/2 w-8 h-24 bg-black/40 backdrop-blur-md border border-white/10 border-l-0 rounded-r-sm flex items-center justify-center hover:bg-black/60 transition-colors group"
                        >
                            <ChevronRight size={24} className="text-gray-400 group-hover:text-white transition-colors" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- C. 右下角操作区 (确保 z-index 最高，覆盖在网格和侧边栏之上) --- */}
            <AnimatePresence>
                {isBgSelecting && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="absolute right-12 bottom-12 z-[60] flex gap-6"
                    >
                        <button
                            onClick={handleCloseBgSelect}
                            className="w-16 h-16 rounded-sm bg-gray-600/80 hover:bg-gray-500 text-white flex items-center justify-center transition-all hover:scale-105 border border-white/20"
                        >
                            <X size={32} />
                        </button>
                        <button
                            onClick={handleSaveBg}
                            className="w-16 h-16 rounded-sm bg-blue-600/80 hover:bg-blue-500 text-white flex items-center justify-center transition-all hover:scale-105 shadow-[0_0_15px_rgba(37,99,235,0.5)] border border-blue-400/50"
                        >
                            <Check size={32} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ================= 新增：玩家档案与头像自定义系统 ================= */}
            <AnimatePresence>
                {/* 1. 玩家档案面板 (Profile Modal) */}
                {isProfileOpen && !isGalleryOpen && !isCropperOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-md"
                    >
                        <div className="w-[600px] bg-slate-900 border border-white/10 rounded-sm shadow-2xl p-8 flex flex-col gap-8" style={{ transform: 'skewY(-1deg)' }}>
                            {/* 顶部信息 */}
                            <div className="flex gap-6 items-start">
                                {/* 大号动态头像 */}
                                <div className="w-32 h-32 rounded-sm border-4 border-gray-600 overflow-hidden relative group">
                                    {renderAvatar(profile?.avatarConfig, profile?.avatarId)}
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsGalleryOpen(true); }} // [新增] 音效
                                        className="absolute bottom-0 w-full py-1 bg-black/70 text-white text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity flex justify-center items-center gap-1"
                                    >
                                        <Crop size={12} /> MODIFY
                                    </button>
                                </div>
                                {/* 名字与等级 */}
                                <div className="flex-1 flex flex-col gap-3">
                                    <div className="flex items-center gap-3 border-b border-white/10 pb-2 h-12">
                                        {isEditingName ? (
                                            <input
                                                autoFocus
                                                value={editName} onChange={e => setEditName(e.target.value)}
                                                onBlur={() => {
                                                    setIsEditingName(false);
                                                    if (editName !== profile?.displayName && editName.trim().length > 0) {
                                                        userSystem.updateProfile({ displayName: editName });
                                                    } else {
                                                        setEditName(profile?.displayName || 'ADJUTANT'); // 恢复原名
                                                    }
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') e.currentTarget.blur(); // 回车触发 onBlur 保存
                                                    if (e.key === 'Escape') { setEditName(profile?.displayName || 'ADJUTANT'); setIsEditingName(false); }
                                                }}
                                                className="bg-black/50 border border-blue-500/50 text-2xl font-black text-white outline-none flex-1 tracking-widest px-2 py-1 rounded-sm shadow-[0_0_10px_rgba(37,99,235,0.2)]"
                                                maxLength={12}
                                            />
                                        ) : (
                                            <>
                                                <span className="text-3xl font-black text-white outline-none flex-1 tracking-widest truncate">
                                                    {profile?.displayName || 'ADJUTANT'}
                                                </span>
                                                <button
                                                    onClick={() => { setEditName(profile?.displayName || 'ADJUTANT'); setIsEditingName(true); }}
                                                    className="p-2 bg-white/5 hover:bg-white/20 rounded-sm text-gray-400 hover:text-white transition-colors"
                                                >
                                                    <Edit3 size={18} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4 text-sm font-mono text-gray-400">
                                        <span>UID: {userSystem.userId}</span>
                                        <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); navigator.clipboard.writeText(userSystem.userId); }} className="hover:text-white"><Copy size={14} /></button> {/* [新增] 音效 */}
                                    </div>
                                    <div className="flex items-center gap-3 mt-2">
                                        <span className="px-3 py-1 bg-yellow-500/20 text-yellow-300 font-bold rounded-sm border border-yellow-500/30">LEVEL {profile?.level || 1}</span>
                                        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden border border-white/5">
                                            <div className="h-full bg-yellow-500 w-[45%]" /> {/* Mock 进度 */}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 战绩统计 (Mock 数据展示) */}
                            <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-8">
                                <div className="bg-black/30 p-4 rounded-sm border border-white/5 flex flex-col items-center">
                                    <span className="text-gray-400 text-xs font-mono mb-1">TOTAL MATCHES</span>
                                    <span className="text-2xl font-black text-white">142</span>
                                </div>
                                <div className="bg-black/30 p-4 rounded-sm border border-white/5 flex flex-col items-center">
                                    <span className="text-gray-400 text-xs font-mono mb-1">WIN RATE</span>
                                    <span className="text-2xl font-black text-green-400">68.5%</span>
                                </div>
                                <div className="bg-black/30 p-4 rounded-sm border border-white/5 flex flex-col items-center">
                                    <span className="text-gray-400 text-xs font-mono mb-1">FAV. TACTIC</span>
                                    <span className="text-lg font-black text-blue-400 mt-1">LYFE BLITZ</span>
                                </div>
                            </div>

                            {/* 关闭按钮 */}
                            <div className="flex justify-end mt-4">
                                <GlassButton onClick={() => { setIsProfileOpen(false); setShowUI(true); }} className="w-32 h-12 rounded-sm" label="CLOSE" />
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* 2. 图像画廊面板 (Gallery) */}
                {isGalleryOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[90] bg-black/90 p-12 overflow-y-auto no-scrollbar">
                        <h2 className="text-3xl font-black text-white mb-8 tracking-widest border-b border-white/20 pb-4">SELECT SOURCE IMAGE</h2>
                        <div className="grid grid-cols-6 gap-6 max-w-7xl mx-auto">
                            {galleryItems.map(item => (
                                <div
                                    key={item.key}
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setCropTarget(item); setCropScale(1); setCropOffset({x:0, y:0}); setIsGalleryOpen(false); setIsCropperOpen(true); }} // [新增] 音效
                                    className="aspect-[3/4] border-2 border-white/10 hover:border-blue-500 cursor-pointer overflow-hidden rounded-sm relative group transition-all hover:scale-105"
                                >
                                    <img src={item.url} className="w-full h-full object-cover" />
                                    <div className="absolute bottom-0 w-full bg-black/60 py-1 text-center text-[10px] text-white/50 font-mono font-bold uppercase">{item.type}</div>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => { eventBus.emit(GameEvents.UI_BACK); setIsGalleryOpen(false); }} className="fixed right-12 bottom-12 w-16 h-16 rounded-full bg-gray-600 hover:bg-gray-500 text-white flex items-center justify-center"><X size={32}/></button> {/* [新增] 音效 */}
                    </motion.div>
                )}

                {/* 3. 头像裁剪工作台 (Cropper) - 专业无遮挡级 */}
                {isCropperOpen && cropTarget && (
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className="absolute inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center select-none cursor-move"
                        // [修复 1] 增加滚轮缩放支持
                        onWheel={(e) => {
                            const zoomAmount = e.deltaY > 0 ? -0.1 : 0.1;
                            setCropScale(prev => Math.min(Math.max(0.5, prev + zoomAmount), 3));
                        }}
                        // 拖拽事件挂载在全屏容器上，避免鼠标滑出框外失效
                        onMouseDown={(e) => {
                            isDragging.current = true;
                            dragStart.current = { x: e.clientX, y: e.clientY, baseX: cropOffset.x, baseY: cropOffset.y };
                        }}
                        onMouseMove={(e) => {
                            if(!isDragging.current) return;
                            const deltaX = e.clientX - dragStart.current.x;
                            const deltaY = e.clientY - dragStart.current.y;
                            // [修复 3] 移除不必要的 scale 除数，保证拖拽完全1:1跟随鼠标
                            const percentX = (deltaX / 300) * 100;
                            const percentY = (deltaY / 300) * 100;
                            setCropOffset({ x: dragStart.current.baseX + percentX, y: dragStart.current.baseY + percentY });
                        }}
                        onMouseUp={() => isDragging.current = false}
                        onMouseLeave={() => isDragging.current = false}
                        // 移动端支持
                        onTouchStart={(e) => {
                            isDragging.current = true;
                            dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, baseX: cropOffset.x, baseY: cropOffset.y };
                        }}
                        onTouchMove={(e) => {
                            if(!isDragging.current) return;
                            const deltaX = e.touches[0].clientX - dragStart.current.x;
                            const deltaY = e.touches[0].clientY - dragStart.current.y;
                            const percentX = (deltaX / 300) * 100;
                            const percentY = (deltaY / 300) * 100;
                            setCropOffset({ x: dragStart.current.baseX + percentX, y: dragStart.current.baseY + percentY });
                        }}
                        onTouchEnd={() => isDragging.current = false}
                    >
                        {/* 顶层标题区 (z-20 确保在暗色蒙版之上) */}
                        <h2 className="text-2xl font-black text-white mb-8 tracking-widest z-20 drop-shadow-lg">ADJUST AVATAR FRAME</h2>

                        {/* 裁剪区核心框 (视觉窗口) */}
                        <div className="w-[300px] h-[300px] relative z-10 flex items-center justify-center">
                            {/* 取消 overflow-hidden，让图片可以渲染到框外 */}
                            <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
                                <img src={cropTarget.url} draggable={false} className="max-w-none absolute"
                                    style={{
                                        // [核心修复 2] 增加 top 和 left 50%，使裁剪基准点与正式渲染的基准点完全统一！
                                        top: '50%', left: '50%',
                                        width: cropTarget.type !== 'spell' ? '100%' : 'auto',
                                        height: cropTarget.type !== 'spell' ? 'auto' : '100%',
                                        transform: `translate(calc(-50% + ${cropOffset.x}%), calc(-50% + ${cropOffset.y}%)) scale(${cropScale})`
                                    }}
                                />
                            </div>

                            {/* 用一个超巨大的内部 box-shadow 作为周围的暗色蒙版，只把 300x300 的中心留亮 */}
                            <div className="absolute inset-0 z-10 pointer-events-none" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.85)' }}></div>

                            {/* 参考十字线与蓝色亮边 (z-20) */}
                            <div className="absolute inset-0 z-20 border-2 border-blue-500 pointer-events-none shadow-[0_0_30px_rgba(37,99,235,0.3)]">
                                <div className="w-full h-[1px] bg-white/30 absolute top-1/2" />
                                <div className="w-[1px] h-full bg-white/30 absolute left-1/2" />
                            </div>
                        </div>

                        {/* 缩放控制 (z-20，并阻止事件冒泡防止拖拽冲突) */}
                        <div className="flex items-center gap-4 mt-8 w-[300px] bg-white/10 backdrop-blur-md p-4 rounded-sm border border-white/10 z-20"
                             onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}
                             onWheel={e => e.stopPropagation()} // 防止滑块区域滚轮穿透
                        >
                            <span className="text-white/50 font-mono text-xs">ZOOM</span>
                            <input
                                type="range" min="0.5" max="3" step="0.05" value={cropScale}
                                onChange={(e) => setCropScale(parseFloat(e.target.value))}
                                className="flex-1 accent-blue-500 cursor-pointer"
                            />
                        </div>

                        {/* 操作按钮 (z-20，阻止冒泡) */}
                        <div className="flex gap-6 mt-8 z-20" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
                            <GlassButton onClick={() => { setIsCropperOpen(false); setIsGalleryOpen(true); }} className="w-32 h-14" label="CANCEL"><X size={18}/></GlassButton>
                            <GlassButton
                                onClick={() => {
                                    // 保存时直接提交当前的百分比
                                    userSystem.updateProfile({
                                        avatarConfig: { imageKey: cropTarget.key, type: cropTarget.type, scale: cropScale, offsetX: cropOffset.x, offsetY: cropOffset.y }
                                    });
                                    setIsCropperOpen(false);
                                    setIsProfileOpen(true);
                                }}
                                className="w-32 h-14 bg-blue-600 border-blue-400" label="APPLY"><Check size={18}/></GlassButton>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ================= 新增：GM 开发者工具全屏覆盖层 ================= */}
            <AnimatePresence>
                {isStudioOpen && (
                    <Studio onClose={() => { setIsStudioOpen(false); setShowUI(true); }} />
                )}
            </AnimatePresence>

            {/* ================= [修正] 挂载正确的组件开关，并在关闭时通过 setShowUI(true) 完美唤醒大厅原本的UI面板 ================= */}
            <AnimatePresence>
                {isCodexBookOpen && (
                    <GalleryCodex
                        onClose={() => {
                            setIsCodexBookOpen(false);
                            setShowUI(true);
                        }}
                        userSystem={userSystem} // [核心修正] 将大厅现有的资产数据完美注入图鉴，一秒点亮全彩与灰阶黑白锁定！
                    />
                )}
            </AnimatePresence>

        </div>
    );
};