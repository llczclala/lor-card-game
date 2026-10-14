import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Layers, Image as ImageIcon, CreditCard, Search, Play, Zap, Clock, ShoppingCart, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { CARD_DB } from '../data/cards';
import { KEYWORD_DB } from '../data/keywords';
import { PERSONALIZATION_ASSETS, CURRENCY_ICONS, getSkinImage } from '../data/imageData';
import { getShopItems } from '../data/skinData'; // [核心修复] 补充引入通用商品获取 API
import { getCardPrice } from '../logic/gachaLogic';
import { Card } from './Card';
import { FullArtOverlay } from './Overlays';
import type { CardData } from '../types';
import { eventBus, GameEvents } from '../utils/eventBus';

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 商店 · 翻页与视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 【为什么要翻页】原来这里一次性渲染全部商品（卡牌 117 / 皮肤 114 / 饰品 33），
// 每张都是重型 <Card>，且全项目几乎没有图片懒加载 ⇒ 手机端直接卡死、电脑端很卡。
// 现在一页只挂 cols×rows 张，滚轮（PC）/ 左右滑动（手机）翻页。
// ══════════════════════════════════════════════════════════════════════
export const SHOP_UI = {
    /** 每页网格：列数 × 行数（三个选项卡共用）。3 × 2 = 一页 6 张 */
    cols: 3,
    rows: 2,

    /** 卡片整体缩放（1 = Card 在 collection 模式的原生尺寸 130×202）
     *  ⚠️ 上限约 1.75 —— 再大 2 行就装不下主展柜的高度了 */
    cardScale: 1.65,

    /** 网格间距 px */
    gapX: 24,
    gapY: 28,

    /** 翻页动画时长（秒） */
    pageAnim: 0.25,

    /** 滚轮翻页：节流 ms + 触发所需的最小 |deltaY| */
    wheelThrottle: 350,
    wheelThreshold: 20,

    /** 触摸左右滑动翻页的阈值（屏幕 px） */
    swipeThreshold: 50,

    /** 是否显示底部「页码 + 左右箭头」 */
    showPager: true,
} as const;

/** 一页几张 */
const PAGE_SIZE = SHOP_UI.cols * SHOP_UI.rows;

/** Card 在 collection 模式下的原生容器尺寸（来自 Card.tsx 的 else 分支，勿随意改） */
const CARD_W = 130;
const CARD_H = 202;

interface ShopScreenProps {
    userSystem: any;
    onClose: () => void;
}

type TabType = 'cards' | 'skins' | 'cosmetics';

// 静态数据组装厂
const toFullCardData = (staticData: any): CardData => ({
    ...staticData,
    id: 'shop_item_' + staticData.key,
    strikeCount: 0,
    animState: 'idle',
    damageTaken: 0,
    buffs: { power: 0, health: 0 }
});

export const ShopScreen: React.FC<ShopScreenProps> = ({ userSystem, onClose }) => {
    const [activeTab, setActiveTab] = useState<TabType>('cards');
    const [viewCard, setViewCard] = useState<CardData | null>(null);
    const [purchaseModal, setPurchaseModal] = useState<any | null>(null);

    // === 筛选状态机 (仅对卡牌生效) ===
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCosts, setSelectedCosts] = useState<number[]>([]);
    const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const [selectedSpellSpeeds, setSelectedSpellSpeeds] = useState<string[]>([]);
    const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
    // [核心修复] 彻底删除 currentPage 状态，全面拥抱瀑布流滚动

    const [isCostOpen, setIsCostOpen] = useState(false);
    const [isTypeOpen, setIsTypeOpen] = useState(false);

    // === 翻页状态（三个选项卡共用一个页码；切 Tab / 改筛选时归零）===
    const [page, setPage] = useState(0);

    const resources = userSystem?.collection?.resources || { silverCoin: 0, dataGold: 0, bitGold: 0 };
    const ownedCards = userSystem?.collection?.ownedCards || {};
    const ownedSkins = userSystem?.collection?.ownedSkins || {};
    const unlockedCardBacks = userSystem?.settings?.unlockedCardBacks || [0];
    const unlockedDesks = userSystem?.settings?.unlockedDesks || [0];

    // ==========================================
    // 1. 卡牌专区数据派发
    // ==========================================
    const filteredCards = useMemo(() => {
        let result = Object.values(CARD_DB).filter(c => c.isCollectible !== false).map(toFullCardData);

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(c => c.name.toLowerCase().includes(lower) || (c.description?.toLowerCase().includes(lower)));
        }
        if (selectedCosts.length > 0) {
            result = result.filter(c => (selectedCosts.includes(9) && c.cost >= 9) || selectedCosts.includes(c.cost));
        }
        // [核心修复] 补齐遗漏的阵营(Region)筛选卡口
        if (selectedRegions.length > 0) {
            result = result.filter(c => selectedRegions.includes(c.region));
        }
        if (selectedTypes.length > 0) {
            result = result.filter(c => {
                const isHero = c.isChampion === true;
                const isSpell = c.type?.toLowerCase().includes('spell');
                const isUnit = !isHero && !isSpell;
                return (selectedTypes.includes('HERO') && isHero) || (selectedTypes.includes('SPELL') && isSpell) || (selectedTypes.includes('UNIT') && isUnit);
            });
        }
        if (selectedTypes.includes('SPELL') && selectedSpellSpeeds.length > 0) {
            result = result.filter(c => {
                const typeStr = c.type?.toLowerCase() || '';
                return typeStr.includes('spell') && selectedSpellSpeeds.some(speed => typeStr.includes(speed.toLowerCase()));
            });
        }
        if ((selectedTypes.length === 0 || selectedTypes.includes('HERO') || selectedTypes.includes('UNIT')) && selectedKeywords.length > 0) {
            result = result.filter(c => {
                if (!c.keywords || c.keywords.length === 0) return false;
                return selectedKeywords.some(kw => c.keywords!.includes(kw as any));
            });
        }

        // [核心修复] 排序逻辑：满编沉底 → 天启者→单位→法术 → 单位内按阵营→小队→费用
        result.sort((a, b) => {
            const isMaxA = (ownedCards[a.key] || 0) >= 3;
            const isMaxB = (ownedCards[b.key] || 0) >= 3;
            if (isMaxA !== isMaxB) return isMaxA ? 1 : -1;

            // 1. 类型大类：天启者(0) → 单位(1) → 法术(2)
            const typeOrderA = a.isChampion ? 0 : (a.type.includes('spell') ? 2 : 1);
            const typeOrderB = b.isChampion ? 0 : (b.type.includes('spell') ? 2 : 1);
            if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB;

            // 2. 天启者与法术：直接按费用
            if (a.isChampion || a.type.includes('spell')) {
                return a.cost - b.cost;
            }

            // 3. 单位卡牌：按阵营 → 按小队 → 按费用
            if (a.region !== b.region) return a.region.localeCompare(b.region);
            const squadA = a.key.split('_').slice(0, 2).join('_');
            const squadB = b.key.split('_').slice(0, 2).join('_');
            if (squadA !== squadB) return squadA.localeCompare(squadB);
            return a.cost - b.cost;
        });

        return result;
    // [核心修复] 将 selectedRegions 补充进依赖数组，确保勾选阵营时触发重绘
    }, [searchTerm, selectedCosts, selectedRegions, selectedTypes, selectedSpellSpeeds, selectedKeywords, ownedCards]);

    // ==========================================
    // 2. 皮肤专区数据派发
    // ==========================================
    const shopSkins = useMemo(() => {
        // [核心修复] 调用通用 API 并传入 'skin' 类型，提取高定皮肤！
        const skins = getShopItems('skin').map(config => {
            const cardData = CARD_DB[config.cardKey!]; // config.cardKey 必定存在于 skin 类型中
            if (!cardData) return null; // 数据库安全兜底

            const isOwned = (ownedSkins[config.cardKey!] || []).includes(config.skinId);
            return {
                cardKey: config.cardKey!, // [2026-08-16] 已用 ! 断言存在（L126），返回对象直接收窄为 string
                skinId: config.skinId,
                isOwned,
                cardData,
                price: config.price || 1 // 直接读取注册单上的商品定价
            };
        }).filter((s): s is NonNullable<typeof s> => s !== null); // 剔除 null（类型守卫，让 TS 收窄 possibly-null）

        // [核心修复] 皮肤阵营排序逻辑同样适配：未拥有 -> 阵营聚拢 -> 小队聚拢 -> 按费用
        skins.sort((a: any, b: any) => {
            if (a.isOwned !== b.isOwned) return a.isOwned ? 1 : -1;

            if (a.cardData.region !== b.cardData.region) return a.cardData.region.localeCompare(b.cardData.region);

            const squadA = a.cardKey.split('_').slice(0, 2).join('_');
            const squadB = b.cardKey.split('_').slice(0, 2).join('_');
            if (squadA !== squadB) return squadA.localeCompare(squadB);

            return a.cardData.cost - b.cardData.cost;
        });
        return skins;
    }, [ownedSkins]);

    // ==========================================
    // 3. 饰品专区数据派发
    // ==========================================
    const shopCosmetics = useMemo(() => {
        // [核心修复] 废除硬编码循环，直接从《全息外观资产调度局》抓取进货单！
        const rawItems = getShopItems().filter(item => item.type === 'cardBack' || item.type === 'desk');

        const items = rawItems.map(config => {
            const idx = config.index as number;
            const isOwned = config.type === 'cardBack'
                ? unlockedCardBacks.includes(idx)
                : unlockedDesks.includes(idx);

            const url = config.type === 'cardBack'
                ? PERSONALIZATION_ASSETS.cardBacks[idx]
                : PERSONALIZATION_ASSETS.desks[idx];

            return {
                type: config.type,
                index: idx,
                isOwned,
                url,
                name: config.name,          // 动态挂载调度局分配的名称 (目前是 1234)
                price: config.price || 5    // 动态挂载定价
            };
        });

        items.sort((a: any, b: any) => {
            if (a.isOwned !== b.isOwned) return a.isOwned ? 1 : -1;
            return a.type === 'cardBack' ? -1 : 1;
        });
        return items;
    }, [unlockedCardBacks, unlockedDesks]);

    // ==========================================
    // 4. 翻页控制（滚轮 / 触摸左右滑动 / 页码箭头）
    // ==========================================
    const listLength = activeTab === 'cards'
        ? filteredCards.length
        : activeTab === 'skins'
            ? shopSkins.length
            : shopCosmetics.length;
    const totalPages = Math.max(1, Math.ceil(listLength / PAGE_SIZE));
    /** 夹紧后的当前页（筛选后列表变短时不会停在空白页） */
    const safePage = Math.min(page, totalPages - 1);

    // 翻页方向：1 = 向后、-1 = 向前（给入场动画用）
    const dirRef = useRef(1);
    const wheelLockRef = useRef(0);
    const touchXRef = useRef(0);

    const goPage = (delta: number) => {
        dirRef.current = delta > 0 ? 1 : -1;
        setPage(prev => Math.min(Math.max(prev + delta, 0), totalPages - 1));
    };

    /** 滚轮翻页（PC）：带节流，避免一次滚动连翻好几页 */
    const handleWheel = (e: React.WheelEvent) => {
        if (Math.abs(e.deltaY) < SHOP_UI.wheelThreshold) return;
        const now = Date.now();
        if (now - wheelLockRef.current < SHOP_UI.wheelThrottle) return;
        wheelLockRef.current = now;
        goPage(e.deltaY > 0 ? 1 : -1);
    };

    /** 触摸左右滑动翻页（手机） */
    const handleTouchStart = (e: React.TouchEvent) => {
        touchXRef.current = e.touches[0].clientX;
    };
    const handleTouchEnd = (e: React.TouchEvent) => {
        const dx = e.changedTouches[0].clientX - touchXRef.current;
        if (Math.abs(dx) < SHOP_UI.swipeThreshold) return;
        goPage(dx < 0 ? 1 : -1);
    };

    /** 切换选项卡：换列表 ⇒ 页码归零 */
    const changeTab = (t: TabType) => {
        setActiveTab(t);
        setPage(0);
    };

    const toggleFilter = (setter: React.Dispatch<React.SetStateAction<any[]>>, val: any) => {
        setter(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
        setPage(0);   // [翻页] 筛选条件变了 ⇒ 回第一页
    };
    // [核心修复] 独立的一键重置筛选钩子
    const isFilterActive = selectedCosts.length > 0 || selectedTypes.length > 0 || selectedSpellSpeeds.length > 0 || selectedKeywords.length > 0 || searchTerm !== '';
    const resetFilters = () => {
        setSearchTerm('');
        setSelectedCosts([]);
        setSelectedRegions([]);
        setSelectedTypes([]);
        setSelectedSpellSpeeds([]);
        setSelectedKeywords([]);
        setPage(0);   // [翻页] 重置筛选 ⇒ 回第一页
    };


    // ==========================================
    // 购买处理中心
    // ==========================================
    // [新增] 专门用于挂载错误提示的独立状态
    const [purchaseError, setPurchaseError] = useState<string | null>(null);

    const handlePurchase = (item: any) => {
        if (!userSystem) return;
        setPurchaseError(null);

        if (item.currency === 'bitGold') {
            if (resources.bitGold < item.cost) { setPurchaseError("比特金不足！(Insufficient Bit Gold)"); return; }
            if (userSystem.purchaseBitGoldItem) {
                userSystem.purchaseBitGoldItem(item.type, item.key, item.skinId, item.cost);
                setPurchaseModal(null);
                eventBus.emit(GameEvents.GACHA_CONVERT); // 播放成交音效
            }
        } else {
            if (resources.silverCoin < item.cost) { setPurchaseError("通用银不足！(Insufficient Silver Coins)"); return; }
            if (userSystem.purchaseCard) {
                userSystem.purchaseCard(item.key, 1, item.cost);
                setPurchaseModal(null);
                eventBus.emit(GameEvents.GACHA_CONVERT);
            }
        }
    };

    // === 核心动画物理参数 (深蓝风+上下拉展) ===
    const splitSpring = { type: "spring" as const, stiffness: 120, damping: 15, delay: 0.2 };
    // [翻页改造] 原 gridItemVariants / pageVariants 已废弃 ——
    //   一页只剩 6 张，逐张 stagger 入场不再必要；商品的入场动画改为各 item 上的 spring 内联。

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden font-sans select-none">

            {/* 暗影底衬 */}
            <motion.div
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
            />

            {/* 右上角资源区 */}
            <motion.div
                className="absolute top-8 right-24 z-[210] flex items-center gap-6 bg-slate-900/80 backdrop-blur-md px-6 py-3 rounded-full border border-blue-500/30 shadow-2xl"
                initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            >
                <div className="flex items-center gap-2">
                    <img src={CURRENCY_ICONS.silverCoin} className="w-5 h-5" alt="银币" />
                    <span className="font-mono font-bold text-gray-200">{resources.silverCoin.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                    <img src={CURRENCY_ICONS.dataGold} className="w-5 h-5" alt="数据金" />
                    <span className="font-mono font-bold text-purple-300">{resources.dataGold.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                    <img src={CURRENCY_ICONS.bitGold} className="w-5 h-5" alt="比特金" />
                    <span className="font-mono font-bold text-yellow-300">{resources.bitGold.toLocaleString()}</span>
                </div>
            </motion.div>

            {/* 关闭按钮 */}
            <motion.button
                onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                className="absolute top-6 right-6 w-12 h-12 rounded-full border border-blue-500/50 bg-black/50 text-blue-400 flex items-center justify-center hover:bg-blue-900/50 hover:text-white hover:scale-110 hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] transition-all duration-200 z-[210]"
                initial={{ opacity: 0, scale: 0.5, rotate: -90 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ delay: 0.6, type: "spring" }}
            >
                <X size={24} strokeWidth={2.5} />
            </motion.button>

            {/* 图鉴主体容器 - 宽高焊死，完美适配 */}
            <div className="relative w-[2200px] h-[900px] flex items-center justify-center pointer-events-none">

                {/* 核心承载屏 (向上下拉展) */}
                <motion.div
                    className="absolute w-[80%] bg-slate-900/60 border-x border-blue-500/30 shadow-[0_0_80px_rgba(30,58,138,0.3)] flex overflow-hidden backdrop-blur-xl pointer-events-auto"
                    style={{ height: '900px', originY: 0.5 }}
                    initial={{ scaleY: 0, opacity: 0 }}
                    animate={{ scaleY: 1, opacity: 1 }}
                    exit={{ scaleY: 0, opacity: 0, transition: { duration: 0.2 } }}
                    transition={{ scaleY: splitSpring, opacity: { delay: 0.2, duration: 0.1 } }}
                >
                    {/* 扫描线背景 */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
                    <div className="absolute top-0 w-full h-[20%] bg-gradient-to-b from-blue-900/20 to-transparent pointer-events-none" />

                    {/* 左侧侧边栏 */}
                    <motion.div
                        className="relative w-64 h-full shrink-0 border-r border-blue-500/30 pt-12 px-4 z-10 bg-slate-950/50"
                        initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.5, duration: 0.4 }}
                    >
                        <div className="text-blue-400 text-[10px] font-black tracking-[0.3em] mb-8 pl-2 animate-pulse">BLACK MARKET //</div>

                        <div className="flex flex-col gap-2 relative z-20">
                            {/* [翻页] 切换选项卡同时把页码归零 */}
                            <TabButton id="cards" active={activeTab} icon={<Layers size={18} />} label="数据卡带" labelCn="数据卡带" onClick={() => changeTab('cards')} />
                            <TabButton id="skins" active={activeTab} icon={<ImageIcon size={18} />} label="高定工坊" labelCn="高定工坊" onClick={() => changeTab('skins')} />
                            <TabButton id="cosmetics" active={activeTab} icon={<CreditCard size={18} />} label="个性涂装" labelCn="个性涂装" onClick={() => changeTab('cosmetics')} />
                        </div>

                        {/* 卡牌专属筛选面板 */}
                        <AnimatePresence>
                            {activeTab === 'cards' && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-8 border-t border-blue-500/20 pt-4 overflow-hidden">
                                    {/* [核心修复] 搜索框与重置按钮并排 */}
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="relative flex-1">
                                            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-blue-500/50" />
                                            <input type="text" placeholder="搜索黑市物资..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-blue-950/40 border border-blue-800/50 rounded text-xs text-blue-100 pl-7 py-2.5 focus:outline-none focus:border-blue-400 transition-all" />
                                        </div>
                                        <button
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); resetFilters(); }}
                                            disabled={!isFilterActive}
                                            className={`p-2 rounded transition-colors border ${isFilterActive ? 'bg-red-900/40 border-red-500/50 text-red-400 hover:bg-red-600 hover:text-white' : 'bg-slate-800/50 border-transparent text-gray-600 cursor-not-allowed'}`}
                                            title="清空所有筛选"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>

                                    {/* 费用抽屉 */}
                                    <CategoryButton id="cost" active={isCostOpen ? "cost" : null} label="费用筛查" onClick={() => setIsCostOpen(!isCostOpen)} />
                                    <AnimatePresence>
                                        {isCostOpen && (
                                            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden pl-3 border-l-2 border-blue-500/20 ml-3 mb-2">
                                                <div className="flex flex-wrap gap-1 py-2">
                                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(c => (
                                                        <button key={c} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); toggleFilter(setSelectedCosts, c); }} className={`w-8 h-8 rounded text-sm font-black transition-colors ${selectedCosts.includes(c) ? 'bg-blue-600 text-white shadow-[0_0_10px_blue]' : 'bg-slate-800/80 text-blue-400 hover:bg-blue-900/50'}`}>
                                                            {c}{c === 10 ? '+' : ''}
                                                        </button>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* 类型抽屉 */}
                                    <CategoryButton id="type" active={isTypeOpen ? "type" : null} label="种类筛查" onClick={() => setIsTypeOpen(!isTypeOpen)} />
                                    <AnimatePresence>
                                        {isTypeOpen && (
                                            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden pl-3 border-l-2 border-blue-500/20 ml-3 mb-2">
                                                <div className="flex flex-col gap-1.5 py-2">
                                                    {['HERO', 'UNIT', 'SPELL'].map(t => (
                                                        <button key={t} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); toggleFilter(setSelectedTypes, t); }} className={`text-left px-3 py-2 rounded text-xs font-bold transition-all ${selectedTypes.includes(t) ? 'bg-blue-600 text-white border border-blue-400' : 'bg-slate-800 text-blue-400 border border-transparent hover:bg-blue-900/50'}`}>
                                                            {t === 'HERO' ? '天启者 (HERO)' : t === 'UNIT' ? '随从 (UNIT)' : '法术 (SPELL)'}
                                                        </button>
                                                    ))}
                                                </div>

                                                {/* 法术速度级联 */}
                                                <AnimatePresence>
                                                    {selectedTypes.includes('SPELL') && (
                                                        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden mt-1 mb-2">
                                                            <div className="flex gap-2">
                                                                {['Burst', 'Fast', 'Slow'].map(s => (
                                                                    <button key={s} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); toggleFilter(setSelectedSpellSpeeds, s); }} className={`flex-1 py-1.5 rounded flex justify-center items-center transition-colors border ${selectedSpellSpeeds.includes(s) ? 'bg-purple-600/40 border-purple-400' : 'bg-slate-800 hover:bg-slate-700 border-transparent'}`}>
                                                                        {s === 'Burst' ? <Zap size={14} className="text-yellow-400"/> : s === 'Fast' ? <Zap size={14} className="text-white"/> : <Clock size={14} className="text-purple-300"/>}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>

                                                {/* 机制级联 */}
                                                <AnimatePresence>
                                                    {(selectedTypes.length === 0 || selectedTypes.includes('HERO') || selectedTypes.includes('UNIT')) && (
                                                        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden mt-2 pt-2 border-t border-blue-500/20">
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {Object.entries(KEYWORD_DB).map(([kw, config]) => (
                                                                    <button key={kw} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); toggleFilter(setSelectedKeywords, kw); }} title={config.label} className={`w-7 h-7 rounded flex justify-center items-center transition-all border ${selectedKeywords.includes(kw) ? 'bg-green-600/30 border-green-400' : 'bg-slate-800 border-transparent opacity-60 hover:opacity-100 hover:bg-slate-700'}`}>
                                                                        {config.icon ? <img src={config.icon} className="w-4 h-4 object-contain" /> : <span className={`text-[8px] font-bold text-${config.color}-400`}>{config.label.substring(0, 1)}</span>}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>

                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>

                    {/* 右侧主展柜 —— 翻页容器：滚轮（PC）/ 左右滑动（手机）切页 */}
                    <motion.div
                        className="relative flex-1 p-8 z-10 flex flex-col overflow-hidden"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.4 }}
                        onWheel={handleWheel}
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                    >
                        {/* 一页 cols×rows 张。key 里带页码 ⇒ 翻页 / 换 Tab / 改筛选都会重建这一页并重播入场动画 */}
                        <motion.div
                            key={`${activeTab}_${safePage}_${searchTerm}_${selectedCosts.join('-')}_${selectedRegions.join('-')}_${selectedTypes.join('-')}_${selectedSpellSpeeds.join('-')}_${selectedKeywords.join('-')}`}
                            initial={{ opacity: 0, x: dirRef.current * 60 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: SHOP_UI.pageAnim, ease: 'easeOut' }}
                            className="flex-1 grid place-items-center content-center min-h-0"
                            style={{
                                gridTemplateColumns: `repeat(${SHOP_UI.cols}, minmax(0, 1fr))`,
                                gridTemplateRows: `repeat(${SHOP_UI.rows}, minmax(0, 1fr))`,
                                columnGap: SHOP_UI.gapX,
                                rowGap: SHOP_UI.gapY,
                            }}
                        >

                            {/* --- 卡牌陈列（一页 6 张，靠 slice 分页；布局由外层 3×2 网格管）--- */}
                            {activeTab === 'cards' && filteredCards
                                .slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
                                .map(c => {
                                    const count = ownedCards[c.key] || 0;
                                    const isMaxed = count >= 3;
                                    const price = c.isChampion ? 5 : getCardPrice(c.cost);
                                    const currency = c.isChampion ? 'bitGold' : 'silverCoin';

                                    return (
                                        <motion.div
                                            key={c.id}
                                            initial={{ opacity: 0, scale: 0.85 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ type: 'spring', stiffness: 110, damping: 14 }}
                                            className={`flex flex-col items-center gap-2 relative ${isMaxed ? 'opacity-50 grayscale' : 'hover:scale-105 hover:z-20 transition-all'}`}
                                        >
                                            {/* 卡片：Card 的原生容器是 130×202，这里整体放大 SHOP_UI.cardScale 倍 */}
                                            <div
                                                className="cursor-pointer relative flex items-center justify-center"
                                                style={{ width: CARD_W * SHOP_UI.cardScale, height: CARD_H * SHOP_UI.cardScale }}
                                                onClick={() => { if (isMaxed) return; eventBus.emit(GameEvents.UI_CLICK); setPurchaseModal({ type: c.isChampion ? 'hero' : 'card', key: c.key, data: c, cost: price, currency }); }}
                                            >
                                                <div style={{ transform: `scale(${SHOP_UI.cardScale})`, transformOrigin: 'center center' }}>
                                                    <Card data={c} location="collection" isFaceUp={true} />
                                                </div>
                                                {isMaxed && (
                                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-xl z-20">
                                                        <span className="bg-black/80 text-gray-400 font-black px-4 py-1 border border-gray-600 rounded tracking-widest text-sm">已满编</span>
                                                    </div>
                                                )}
                                            </div>
                                            {/* 底部价签 */}
                                            <div className="flex items-center gap-1.5 bg-slate-900/90 px-3 py-1.5 rounded-full border border-blue-500/20 shadow-lg">
                                                <img src={currency === 'bitGold' ? CURRENCY_ICONS.bitGold : CURRENCY_ICONS.silverCoin} className="w-3 h-3" />
                                                <span className={`text-xs font-mono font-bold ${isMaxed ? 'text-gray-500' : 'text-white'}`}>{price.toLocaleString()}</span>
                                            </div>
                                        </motion.div>
                                    );
                                })}

                            {/* --- 皮肤陈列（一页 6 张）--- */}
                            {activeTab === 'skins' && shopSkins
                                .slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
                                .map(s => (
                                    <motion.div
                                        key={s.cardKey}
                                        initial={{ opacity: 0, scale: 0.85 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ type: 'spring', stiffness: 110, damping: 14 }}
                                        className={`relative flex flex-col items-center gap-2 ${s.isOwned ? 'opacity-50 grayscale' : 'hover:scale-105 hover:z-20 transition-all'}`}
                                    >
                                        <div
                                            className="rounded-xl overflow-hidden border-2 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.2)] bg-slate-900 relative cursor-pointer group"
                                            style={{ width: CARD_W * SHOP_UI.cardScale, height: CARD_H * SHOP_UI.cardScale }}
                                            // [核心修复] 从写死的 1 比特金改为动态读取注册单的 s.price
                                            onClick={() => { if (s.isOwned) return; eventBus.emit(GameEvents.UI_CLICK); setPurchaseModal({ type: 'skin', key: s.cardKey, skinId: s.skinId, data: s.cardData, cost: s.price, currency: 'bitGold', image: getSkinImage(s.cardKey, s.skinId, s.cardData.imageUrl) }); }}
                                        >
                                            <img src={getSkinImage(s.cardKey, s.skinId, s.cardData.imageUrl)} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                            <div className="absolute bottom-0 w-full h-1/3 bg-gradient-to-t from-purple-950 via-purple-900/80 to-transparent flex flex-col justify-end p-4 border-t border-purple-500/30">
                                                <span className="text-purple-300 text-[10px] font-black tracking-widest mb-1">修习一刻</span>
                                                <span className="text-white text-sm font-bold truncate">{s.cardData.name}</span>
                                            </div>
                                            {s.isOwned && (
                                                <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20">
                                                    <span className="flex items-center gap-2 text-purple-300 bg-purple-900/80 px-4 py-2 rounded-full border border-purple-500/50 text-sm font-black tracking-widest"><CheckCircle size={16}/> 已入库</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 bg-slate-900/90 px-4 py-1.5 rounded-full border border-purple-500/30 shadow-lg">
                                            <img src={CURRENCY_ICONS.bitGold} className="w-4 h-4" />
                                            {/* [核心修复] 同样改为读取 s.price 展示价格 */}
                                            <span className={`text-sm font-mono font-bold ${s.isOwned ? 'text-gray-500' : 'text-yellow-400'}`}>{s.price}</span>
                                        </div>
                                    </motion.div>
                                ))}

                            {/* --- 饰品陈列（一页 6 个）--- */}
                            {activeTab === 'cosmetics' && shopCosmetics
                                .slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
                                .map(c => (
                                    <motion.div
                                        key={`${c.type}-${c.index}`}
                                        initial={{ opacity: 0, scale: 0.85 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ type: 'spring', stiffness: 110, damping: 14 }}
                                        className={`relative flex flex-col items-center gap-2 ${c.isOwned ? 'opacity-50 grayscale' : 'hover:scale-105 hover:z-20 transition-all'}`}
                                    >
                                        {/* 卡背是 2:3 竖版 → 与卡牌同尺寸；牌桌是 16:9 横版 → 宽取卡背的 1.6 倍 */}
                                        <div
                                            className="rounded-xl overflow-hidden border-2 border-blue-400/50 shadow-lg bg-slate-900 relative cursor-pointer group"
                                            style={c.type === 'cardBack'
                                                ? { width: CARD_W * SHOP_UI.cardScale, height: CARD_H * SHOP_UI.cardScale }
                                                : (() => {
                                                    const w = CARD_W * SHOP_UI.cardScale * 1.6;
                                                    return { width: w, height: w * 9 / 16 };
                                                })()}
                                            // [核心修复] 将硬编码的 5 替换为注册单中的动态定价 c.price
                                            onClick={() => { if (c.isOwned) return; eventBus.emit(GameEvents.UI_CLICK); setPurchaseModal({ type: c.type, key: c.index, cost: c.price, currency: 'bitGold', image: c.url, name: c.name }); }}
                                        >
                                            <img src={c.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                            <div className="absolute bottom-0 w-full h-10 bg-black/80 flex items-center justify-center border-t border-blue-500/30">
                                                <span className="text-white text-xs font-bold tracking-widest">{c.name}</span>
                                            </div>
                                            {c.isOwned && (
                                                <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20">
                                                    <span className="text-gray-400 bg-black/80 px-4 py-1 border border-gray-600 rounded text-xs font-black tracking-widest">已持有</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 bg-slate-900/90 px-4 py-1.5 rounded-full border border-blue-500/30 shadow-lg">
                                            <img src={CURRENCY_ICONS.bitGold} className="w-4 h-4" />
                                            {/* [核心修复] 同样更新界面显示的价签 */}
                                            <span className={`text-sm font-mono font-bold ${c.isOwned ? 'text-gray-500' : 'text-yellow-400'}`}>{c.price}</span>
                                        </div>
                                    </motion.div>
                                ))}

                        </motion.div>

                        {/* --- 页码指示器：滚轮/滑动之外，也能直接点箭头翻页 --- */}
                        {SHOP_UI.showPager && totalPages > 1 && (
                            <div className="shrink-0 flex items-center justify-center gap-6 pt-4">
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); goPage(-1); }}
                                    disabled={safePage === 0}
                                    className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all ${safePage === 0 ? 'border-white/10 text-gray-700 cursor-not-allowed' : 'border-blue-500/50 text-blue-300 hover:bg-blue-900/40 hover:text-white'}`}
                                    title="上一页"
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <span className="font-mono text-sm text-blue-300 tracking-widest">
                                    {safePage + 1} <span className="text-gray-600">/</span> {totalPages}
                                </span>
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); goPage(1); }}
                                    disabled={safePage >= totalPages - 1}
                                    className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all ${safePage >= totalPages - 1 ? 'border-white/10 text-gray-700 cursor-not-allowed' : 'border-blue-500/50 text-blue-300 hover:bg-blue-900/40 hover:text-white'}`}
                                    title="下一页"
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        )}
                    </motion.div>

                </motion.div>

                {/* 轨道：双生白色长柄 (上下拉展) */}
                <motion.div
                    className="absolute w-full h-3 bg-white rounded-full z-20 shadow-[0_0_20px_white,0_0_40px_blue]"
                    initial={{ scaleX: 0, y: 0, filter: "brightness(1)" }}
                    animate={{ scaleX: 1, y: -450, filter: ["brightness(3)", "brightness(1)"] }}
                    exit={{ scaleX: 0, y: 0, transition: { duration: 0.2 } }}
                    transition={{ scaleX: { duration: 0.2 }, y: splitSpring, filter: { duration: 0.5 } }}
                />
                <motion.div
                    className="absolute w-full h-3 bg-white rounded-full z-20 shadow-[0_0_20px_white,0_0_40px_blue]"
                    initial={{ scaleX: 0, y: 0, filter: "brightness(1)" }}
                    animate={{ scaleX: 1, y: 450, filter: ["brightness(3)", "brightness(1)"] }}
                    exit={{ scaleX: 0, y: 0, transition: { duration: 0.2 } }}
                    transition={{ scaleX: { duration: 0.2 }, y: splitSpring, filter: { duration: 0.5 } }}
                />

            </div>

            {/* 购买确认弹窗 */}
            <AnimatePresence>
                {purchaseModal && (
                    <div className="absolute inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => { eventBus.emit(GameEvents.UI_BACK); setPurchaseModal(null); setPurchaseError(null); }}>
                        {/* [核心修复] 改为精致的横向布局紧凑型窗口 */}
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            className="bg-slate-900 border border-blue-500/30 p-6 rounded-2xl shadow-[0_0_40px_rgba(30,58,138,0.6)] w-fit flex flex-col gap-6"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* 横向：左商品 + 右信息 */}
                            <div className="flex gap-8 items-center">
                                {/* 左侧：微缩版商品预览 */}
                                <div className="w-32 h-44 bg-slate-950 rounded-xl overflow-hidden shadow-inner flex items-center justify-center border border-white/10 relative">
                                    {purchaseModal.type === 'card' || purchaseModal.type === 'hero' ? (
                                        <div className="scale-75 origin-center"><Card data={purchaseModal.data} location="collection" isFaceUp={true} /></div>
                                    ) : (
                                        <img src={purchaseModal.image} className="w-full h-full object-cover" alt="商品" />
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none"></div>
                                </div>

                                {/* 右侧：交易账单 */}
                                <div className="flex flex-col gap-4 min-w-[200px]">
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-gray-500 tracking-widest uppercase">商品名称</span>
                                        <span className="text-lg font-black text-blue-200">{purchaseModal.name || purchaseModal.data?.name}</span>
                                    </div>
                                    <div className="h-px bg-white/10 w-full"></div>
                                    <div className="flex flex-col gap-2">
                                        <span className="text-xs font-bold text-gray-500 tracking-widest uppercase">应付金额</span>
                                        <div className="flex items-center gap-2">
                                            <img src={purchaseModal.currency === 'bitGold' ? CURRENCY_ICONS.bitGold : CURRENCY_ICONS.silverCoin} className="w-5 h-5" />
                                            <span className="text-3xl font-black font-mono text-white tracking-wider">{purchaseModal.cost.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* [核心修复] 原生错误阻断提示条 */}
                            {purchaseError && (
                                <div className="bg-red-950/50 border border-red-500/50 text-red-400 text-sm font-bold text-center py-2 rounded-lg animate-shake">
                                    {purchaseError}
                                </div>
                            )}

                            {/* 紧凑型按钮组 */}
                            <div className="flex gap-3 w-full">
                                <button onClick={() => { eventBus.emit(GameEvents.UI_BACK); setPurchaseModal(null); setPurchaseError(null); }} className="px-6 py-2.5 rounded border border-white/20 text-gray-400 font-bold hover:bg-white/10 transition-colors">取消</button>
                                <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); handlePurchase(purchaseModal); }} className="flex-1 py-2.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-black shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all flex items-center justify-center gap-2">
                                    <ShoppingCart size={16}/> 确认购买
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* 卡牌立绘鉴赏层 */}
            <AnimatePresence>
                {viewCard && (
                    <div className="absolute inset-0 z-[400]">
                        <FullArtOverlay card={viewCard} onClose={() => setViewCard(null)} />
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

// 侧边栏按钮组件
const TabButton = ({ id, active, icon, label, labelCn, onClick }: any) => {
    const isActive = active === id;
    return (
        <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onClick?.(); }} className={`relative w-full py-4 px-4 flex items-center justify-between transition-all duration-300 group rounded-r-lg ${isActive ? 'bg-blue-900/60 border-l-4 border-blue-400 text-blue-50' : 'border-l-4 border-transparent text-blue-500/70 hover:bg-blue-900/30 hover:text-blue-300'}`}>
            <div className="relative z-10 flex items-center gap-3">
                <div className={`${isActive ? 'text-blue-400' : ''}`}>{icon}</div>
                <div className="flex flex-col items-start leading-tight">
                    <span className="font-black tracking-wider text-sm">{label}</span>
                    <span className="text-[10px] opacity-70 font-bold">{labelCn}</span>
                </div>
            </div>
            <Play size={14} className={`transition-transform duration-300 ${isActive ? 'rotate-90 drop-shadow-[0_0_8px_white]' : 'rotate-0'}`} fill={isActive ? "#ffffff" : "transparent"} stroke={isActive ? "#ffffff" : "currentColor"} />
        </button>
    );
};

const CategoryButton = ({ id, active, label, onClick }: any) => {
    const isActive = active === id;
    return (
        <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onClick?.(); }} className={`relative w-full py-2.5 px-3 flex items-center justify-between transition-all duration-300 rounded-md ${isActive ? 'bg-blue-800/40 text-white' : 'text-blue-500/70 hover:bg-blue-800/20 hover:text-blue-300'}`}>
            <span className="text-xs font-bold tracking-widest">{label}</span>
            <Play size={12} className={`transition-transform duration-300 ${isActive ? 'rotate-90 drop-shadow-[0_0_5px_white]' : 'rotate-0'}`} fill={isActive ? "#ffffff" : "transparent"} stroke={isActive ? "#ffffff" : "currentColor"} strokeWidth={2} />
        </button>
    );
};