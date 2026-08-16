import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, RefreshCw, ChevronUp, ChevronDown, ShoppingCart, ExternalLink, Zap, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GachaPoolEnum, type CardData, type GameStats } from '../types';
import { POOLS, type PoolId } from '../logic/gachaLogic';
import { KEYWORD_DB, GLOSSARY_DB } from '../data/keywords'; // [核心修改] 引入术语字典
import { getCardLore } from '../data/loreData';
import { ChampionLevelUp } from './ChampionLevelUp';
import { CARD_DB } from '../data/cards';
import { getLeveledUpCard, getCardPrice } from '../utils/gameRules';
import { UI_ICONS, CURRENCY_ICONS, SKIN_IMAGES, getSkinImage } from '../data/imageData'; // [皮肤]
import { calculateGameScore } from '../logic/scoring'; // [新增] 评分逻辑
import { STORAGE_KEYS } from '../utils/storageUtils';
import { Card } from './Card';
import { gameLogger } from '../utils/gameLogger'; // [核心新增] 引入黑匣子
import { MissionToast } from './MissionUI'; // [核心新增] 引入结算滑动提示框

// [新增] 自定义购买确认弹窗组件
const PurchaseConfirmModal = ({ cardName, count, cost, onConfirm, onCancel }: any) => (
    <div className="absolute inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="bg-slate-900 border border-white/20 p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center transform scale-100 animate-pop-in">
            <h3 className="text-2xl font-black text-white mb-4 tracking-widest">CONFIRM PURCHASE</h3>
            <div className="text-gray-300 mb-8 text-lg leading-relaxed">
                花费 <span className="text-yellow-400 font-bold font-mono text-xl mx-1">{cost}</span> 银币<br/>
                购买 <span className="text-blue-400 font-bold mx-1">{count} 张</span>
                <div className="font-bold text-white mt-1 text-xl">"{cardName}"</div>
            </div>
            <div className="flex gap-4 justify-center">
                <button onClick={onCancel} className="px-6 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-bold border border-white/10 transition-colors">取消</button>
                <button onClick={onConfirm} className="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold shadow-[0_0_20px_rgba(22,163,74,0.4)] transition-all hover:scale-105">确认</button>
            </div>
        </div>
    </div>
);
// ==========================================
// [新增] 商业级富文本解析引擎 (Rich Text Parser)
// ==========================================
// [核心修改] 接收深度跳转方法
const RichTextParser = ({ text, onNavigate }: { text: string, onNavigate?: (card: CardData) => void }) => {
    if (!text) return null;

    // 1. 动态生成正则
    const glossaryKeys = Object.keys(GLOSSARY_DB).sort((a, b) => b.length - a.length);
    // [修改 2026-07-27] 术语后允许跟数字（如"飞剑4"→匹配"飞剑"），但排除紧跟中文的情况（避免误吞）
    const GLOSSARY_PATTERN = glossaryKeys.map(k => `${k}(?![\\u4e00-\\u9fff])`).join('|');
    // [核心修改] 增加 4. 匹配中文双引号包裹的关联卡牌 (如 “镜爻”)
    const PARSE_REGEX = new RegExp(`(“[^”]+”|\\[.*?\\]|[+-]\\d+\\/[+-]\\d+|${GLOSSARY_PATTERN})`, 'g');

    // 2. 切割文本
    const parts = text.split(PARSE_REGEX);

    return (
        <>
            {parts.map((part, index) => {
                if (!part) return null;

                // [核心新增] 规则 D：衍生卡/关联卡 (如 “镜爻”)
                if (part.startsWith('“') && part.endsWith('”')) {
                    const tokenName = part.slice(1, -1);
                    // 在全局卡牌库中反查该实体卡牌
                    const associatedCard = Object.values(CARD_DB).find(c => c.name.includes(tokenName) || c.key.includes(tokenName));

                    if (associatedCard) {
                        return (
                            <span
                                key={index}
                                className="group relative inline-block text-blue-400 font-bold mx-1 cursor-pointer hover:brightness-125 transition-all"
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    if (onNavigate) onNavigate(associatedCard as CardData);
                                }}
                            >
                                {part}
                                {/* [核心修改] 切换为 deck-builder 尺寸，恢复完整的卡面排版与介绍信息 */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-[400] text-center translate-y-2 group-hover:translate-y-0 origin-bottom drop-shadow-2xl">
                                    <Card data={associatedCard as CardData} location="deck-builder" />
                                </div>
                            </span>
                        );
                    }
                    // 兜底：找不到关联卡牌则纯蓝字显示
                    return <span key={index} className="text-blue-400 font-bold mx-1">{part}</span>;
                }

                // 规则 A：核心机制关键词 (如 [碾压])
                if (part.startsWith('[') && part.endsWith(']')) {
                    const kw = part.slice(1, -1);
                    // [核心修复] 遍历字典的值，匹配中文 label，而不是用英文 Key 直查
                    const kwConfig = Object.values(KEYWORD_DB).find(config => config.label === kw);

                    if (kwConfig) {
                        return (
                            <span key={index} className="group relative inline-flex items-center text-yellow-400 font-bold mx-1 cursor-help">
                                {kw}
                                <img src={kwConfig.icon} alt={kw} className="w-5 h-5 ml-1 inline-block align-middle drop-shadow-md -mt-0.5" />

                                {/* 悬浮精美解释气泡 */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 bg-gray-900/95 border border-white/20 p-3 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-[300] text-center translate-y-2 group-hover:translate-y-0 backdrop-blur-sm">
                                    <div className="font-bold text-yellow-400 mb-1 text-sm">{kwConfig.label}</div>
                                    <div className="text-gray-300 text-xs leading-relaxed font-normal">{kwConfig.description}</div>
                                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-900 border-b border-r border-white/20 rotate-45"></div>
                                </div>
                            </span>
                        );
                    }
                    // 兜底：词条术语 (如 [觉悟])
                    const glConfig = Object.values(GLOSSARY_DB).find(config => config.label === kw);
                    if (glConfig) {
                        return (
                            <span key={index} className="group relative inline-block text-yellow-300 font-bold mx-1 border-b border-yellow-500/50 cursor-help border-dashed">
                                {kw}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-slate-900 border border-yellow-600/50 p-3 rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-[300] text-center translate-y-2 group-hover:translate-y-0">
                                    <div className="font-bold text-yellow-400 mb-1 text-sm">{glConfig.label}</div>
                                    <div className="text-gray-300 text-xs leading-relaxed font-normal">{glConfig.description}</div>
                                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-b border-r border-yellow-600/50 rotate-45"></div>
                                </div>
                            </span>
                        );
                    }
                    // 兜底：找不到任何配置的直接金字显示
                    return <span key={index} className="text-yellow-400 font-bold mx-1">{part}</span>;
                }

                // 规则 B：身材增减益数值 (如 +2/+0, -1/-1)
                if (/^[+-]\d+\/[+-]\d+$/.test(part)) {
                    // 粗略判断是否是纯负面减益
                    const isDebuff = part.startsWith('-');
                    return (
                        <span key={index} className={`font-black tracking-wider mx-1 px-1 rounded-sm bg-black/30 border border-white/10 ${isDebuff ? 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]' : 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]'}`}>
                            {part}
                        </span>
                    );
                }

                // 规则 C：术语字典词汇 (如 入场, 进攻)
                if (GLOSSARY_DB[part]) {
                    const glConfig = GLOSSARY_DB[part];
                    return (
                        <span key={index} className="group relative inline-block text-yellow-300 font-bold mx-1 border-b border-yellow-500/50 cursor-help border-dashed">
                            {part}

                            {/* 悬浮术语气泡 */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-slate-900 border border-yellow-600/50 p-3 rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-[300] text-center translate-y-2 group-hover:translate-y-0">
                                <div className="font-bold text-yellow-400 mb-1 text-sm">{glConfig.label}</div>
                                <div className="text-gray-300 text-xs leading-relaxed font-normal">{glConfig.description}</div>
                                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-b border-r border-yellow-600/50 rotate-45"></div>
                            </div>
                        </span>
                    );
                }

                // 兜底：其余普通文本
                return <span key={index}>{part}</span>;
            })}
        </>
    );
};
// [皮肤] 扩展 Props 定义
interface SkinOverlayData {
    ownedSkins: Record<string, number[]>; // 已拥有的皮肤
    currentSkinId: number;                // 当前皮肤ID
    onSkinChange: (cardKey: string, newSkinId: number) => void; // 切换回调
}

interface FullArtOverlayProps {
    card: CardData;
    onClose: () => void;
    // 购买相关参数 (可选，仅在备战环节传入)
    onBuy?: (count: number, cost: number) => boolean;
    ownedCount?: number;
    playerSilver?: number;
    // [2026-08-02] 跳转到对应卡池（备战详情页购买按钮下方）
    onGachaNav?: (poolId: PoolId) => void;
    // [皮肤] 皮肤切换相关（不传则不显示皮肤UI）
    skinData?: SkinOverlayData;
    // [卡牌导航] 左右翻页
    navigation?: CardNavigation;
}

// [卡牌导航] 导航上下文
interface CardNavigation {
    cardList: CardData[];
    currentIndex: number;
    onNavigate: (index: number) => void;
}


export const FullArtOverlay = ({ card, onClose, onBuy, onGachaNav, ownedCount = 0, playerSilver = 0, skinData, navigation }: FullArtOverlayProps) => {
    const [isLoreOpen, setIsLoreOpen] = useState(false);

    // [核心新增] 深度跳转状态接管
    // 将外部传入的 card 转为内部状态，右键衍生卡时直接替换此状态！
    const [currentCard, setCurrentCard] = useState<CardData>(card);
    useEffect(() => {
        setCurrentCard(card);
        setViewLevel(card.level);
        setAnimState('idle');
    }, [card]);

    const [confirmState, setConfirmState] = useState<{count: number, cost: number} | null>(null);

    const [viewLevel, setViewLevel] = useState(currentCard.level);
    const [animState, setAnimState] = useState<'idle' | 'up' | 'down'>('idle');

    // --- [皮肤] 皮肤浏览状态 ---
    const availableSkins = useMemo(() => {
        const skins = SKIN_IMAGES[currentCard.key];
        if (!skins) return [];
        return Object.keys(skins).map(Number).sort((a, b) => a - b);
    }, [currentCard.key]);

    // 当前正在浏览的 skinId（初始为传入的 currentSkinId，否则为 0）
    const [browsingSkinId, setBrowsingSkinId] = useState(skinData?.currentSkinId ?? 0);
    // 当传入 currentSkinId 变化时同步
    useEffect(() => {
        setBrowsingSkinId(skinData?.currentSkinId ?? 0);
    }, [skinData?.currentSkinId]);

    const currentBrowsingIdx = availableSkins.indexOf(browsingSkinId);
    const hasPrevSkin = currentBrowsingIdx > 0;
    const hasNextSkin = currentBrowsingIdx < availableSkins.length - 1;
    const isSkinOwned = skinData ? (skinData.ownedSkins[currentCard.key]?.includes(browsingSkinId) ?? browsingSkinId === 0) : true;
    const isSkinCurrent = skinData ? browsingSkinId === skinData.currentSkinId : true;
    // 是否启用完整的皮肤切换功能（传了 onSkinChange 才启用）
    const enableSkinUI = !!skinData;

    // [卡牌导航] 翻页逻辑
    const canNavigate = navigation && navigation.cardList.length > 1;
    const navigateCard = (direction: 'prev' | 'next') => {
        if (!navigation || !canNavigate) return;
        const { cardList, currentIndex, onNavigate } = navigation;
        if (direction === 'prev') {
            const newIndex = currentIndex > 0 ? currentIndex - 1 : cardList.length - 1;
            onNavigate(newIndex);
        } else {
            const newIndex = currentIndex < cardList.length - 1 ? currentIndex + 1 : 0;
            onNavigate(newIndex);
        }
    };

    const { baseCard, leveledCard } = useMemo(() => {
        const base = CARD_DB[currentCard.key] as CardData;
        const leveled = getLeveledUpCard(base);
        return { baseCard: base, leveledCard: leveled };
    }, [currentCard.key]);

    const targetCard = !currentCard.isChampion ? currentCard : (viewLevel === 1 ? baseCard : leveledCard);
    // [皮肤] 浏览皮肤时优先使用皮肤图片
    const displayImage = useMemo(() => {
        if (targetCard.level === 2 && targetCard.level2ImageUrl) return targetCard.level2ImageUrl;
        if (enableSkinUI && browsingSkinId !== undefined && browsingSkinId !== null) {
            return getSkinImage(currentCard.key, browsingSkinId) || targetCard.imageUrl;
        }
        return targetCard.imageUrl;
    }, [targetCard, currentCard.key, browsingSkinId, enableSkinUI]);

    const getRegionLabel = (region: string, key: string) => {
        if (key.startsWith('test_')) return 'TEST';
        return region.toUpperCase();
    };

    const getTypeLabel = (card: CardData) => {
        if (card.isChampion) return 'HERO';
        if (card.type?.includes('spell')) return 'SPELL';
        return 'UNIT';
    };

    // [2026-08-08 莉莉子] 法术速度展示：极速/快速/慢速 文字 + 图标
    const getSpellSpeedInfo = (type: string) => {
        switch (type) {
            case 'spell-burst': return { label: '极速', color: 'text-yellow-400', icon: <Zap size={22} className="text-yellow-400 fill-yellow-400" />, desc: '任意阶段打出，立即结算' };
            case 'spell-fast': return { label: '快速', color: 'text-white', icon: <Zap size={22} className="text-white" />, desc: '战斗阶段可打出，按序结算' };
            case 'spell-slow': return { label: '慢速', color: 'text-purple-300', icon: <Clock size={22} className="text-purple-300" />, desc: '仅主阶段打出，最晚结算' };
            default: return null;
        }
    };

    const loreText = getCardLore(currentCard.key); // [修正] 用 currentCard

    // [核心新增] 深度跳转处理方法
    const handleDeepNavigate = (newCard: CardData) => {
        setCurrentCard(newCard);
        setViewLevel(newCard.level);
        setIsLoreOpen(false); // 跳转后自动关闭故事抽屉，保持整洁
    };

    // [2026-08-08 莉莉子] ESC 键关闭详情：按优先级 购买确认 → 故事抽屉 → 整个详情
    // capture 阶段 + stopImmediatePropagation：拦截全局 ESC（App.tsx 会呼出设置面板），确保 ESC 只关详情
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (confirmState) {
                setConfirmState(null); // 先取消购买确认弹窗
            } else if (isLoreOpen) {
                setIsLoreOpen(false);   // 再收起故事抽屉
            } else {
                onClose();              // 最后关闭整个详情
            }
        };
        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [confirmState, isLoreOpen, onClose]);

    // 4. 切换处理函数
    const handleLevelToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (animState !== 'idle') return; // 防止动画中重复点击

        if (viewLevel === 1) {
            // 升级：橙色向上遮罩
            setAnimState('up');
            // 动画总时长 0.8s，中点 0.4s (遮罩完全覆盖) 时切换数据
            setTimeout(() => setViewLevel(2), 400);
            setTimeout(() => setAnimState('idle'), 800);
        } else {
            // 降级：蓝色向下遮罩
            setAnimState('down');
            setTimeout(() => setViewLevel(1), 400);
            setTimeout(() => setAnimState('idle'), 800);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/95 backdrop-blur-md animate-fade-in p-4 md:p-8"
            onClick={onClose}
            onWheel={(e) => {
                if (!canNavigate) return;
                e.preventDefault();
                if (e.deltaY > 0) navigateCard('next');
                else navigateCard('prev');
            }}
        >
            {/* 关闭按钮 */}
            <button onClick={onClose} className="absolute top-4 right-4 md:top-8 md:right-8 text-white/80 hover:text-white bg-black/50 hover:bg-red-500/80 rounded-full p-2 transition-all z-[210]">
                <X size={32} />
            </button>

            {/* [修改] 主容器：添加 overflow-hidden 以限制动画遮罩的范围，确保遮罩只在内容区出现 */}
            <div className="relative flex flex-col md:flex-row max-w-5xl w-full h-full md:h-[90vh] items-stretch justify-center gap-0 md:gap-6 overflow-hidden rounded-2xl" onClick={e => e.stopPropagation()}>

                {/* [新增] 购买确认弹窗挂载点 */}
                {confirmState && (
                    <PurchaseConfirmModal
                        cardName={currentCard.name}
                        count={confirmState.count}
                        cost={confirmState.cost}
                        onCancel={() => setConfirmState(null)}
                        onConfirm={() => {
                            if (onBuy) onBuy(confirmState.count, confirmState.cost);
                            setConfirmState(null);
                        }}
                    />
                )}
                {/* --- [新增] 动画遮罩层 (Mask Layers) --- */}
                {/* 使用 AnimatePresence 处理进出场 */}
                <AnimatePresence>
                    {animState === 'up' && (
                        <motion.div
                            className="absolute inset-0 z-[100] bg-orange-500/90 flex items-center justify-center pointer-events-none"
                            initial={{ y: '100%' }} // 从下方进入
                            animate={{ y: '-100%' }} // 向上移出
                            transition={{ duration: 0.8, ease: "easeInOut" }}
                        >
                            <img src={UI_ICONS.levelup} className="w-32 h-32 opacity-80 animate-pulse drop-shadow-lg" alt="升级" />
                        </motion.div>
                    )}
                    {animState === 'down' && (
                        <motion.div
                            className="absolute inset-0 z-[100] bg-blue-600/90 flex items-center justify-center pointer-events-none"
                            initial={{ y: '-100%' }} // 从上方进入
                            animate={{ y: '100%' }}  // 向下移出
                            transition={{ duration: 0.8, ease: "easeInOut" }}
                        >
                            <img src={UI_ICONS.leveldown} className="w-32 h-32 opacity-80 animate-pulse drop-shadow-lg" alt="降级" />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* --- 左侧：原画容器 --- */}
                <div className="relative flex-1 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-white/20 group select-none bg-black">

                    {/* 图层 1 (底层): 高斯模糊填充背景 */}
                    <div className="absolute inset-0 z-0">
                        <img
                            src={displayImage} // [修改] 使用动态 displayImage
                            className="w-full h-full object-cover blur-2xl opacity-60 scale-110 transition-all duration-300"
                            alt="背景模糊"
                        />
                    </div>

                    {/* 图层 2 (顶层): 完整原画展示 */}
                    <div
                        className="absolute inset-0 z-10 flex items-center justify-center p-4"
                        onWheel={(e) => {
                            if (!enableSkinUI || availableSkins.length <= 1) return;
                            e.stopPropagation();
                            if (e.deltaY > 0 && hasNextSkin) {
                                const idx = availableSkins.indexOf(browsingSkinId);
                                if (idx < availableSkins.length - 1) setBrowsingSkinId(availableSkins[idx + 1]);
                            } else if (e.deltaY < 0 && hasPrevSkin) {
                                const idx = availableSkins.indexOf(browsingSkinId);
                                if (idx > 0) setBrowsingSkinId(availableSkins[idx - 1]);
                            }
                        }}
                    >
                        <img
                            src={displayImage} // [修改] 使用动态 displayImage
                            className="w-full h-full object-contain drop-shadow-2xl transition-all duration-300"
                            alt="全屏原画"
                        />
                    </div>

                    {/* [新增] 等级切换按钮 (仅英雄显示) */}
                    {/* 位置：右下角，bottom-20 避开底部故事抽屉 */}
                    {currentCard.isChampion && animState === 'idle' && (
                        <motion.button
                            onClick={handleLevelToggle}
                            className="absolute bottom-20 right-6 z-30 p-2 bg-black/60 hover:bg-white/20 rounded-full border border-white/20 backdrop-blur-md shadow-xl group/btn cursor-pointer"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            title={viewLevel === 1 ? "查看升级形态" : "查看初始形态"}
                        >
                            <img
                                src={viewLevel === 1 ? UI_ICONS.levelup : UI_ICONS.leveldown}
                                className="w-12 h-12 object-contain group-hover/btn:brightness-125 transition-all"
                                alt="切换等级"
                            />
                        </motion.button>
                    )}

                    {/* [修正] 购买按钮组：调整位置到底部靠左，避开原画主体 */}
                    {onBuy && animState === 'idle' && (
                        <div className="absolute left-6 bottom-[18%] flex flex-col gap-3 z-40 items-start">
                            {(() => {
                                const price = getCardPrice(currentCard.cost);
                                const isTest = currentCard.region === 'TEST';
                                const canBuyMore = isTest || ownedCount < 3;

                                if (!canBuyMore) return null;

                                return (
                                    <>
                                        {/* 买 1 张 */}
                                        <motion.button
                                            whileHover={{ scale: 1.05, x: 5 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                // [修改] 唤起自定义弹窗
                                                setConfirmState({ count: 1, cost: price });
                                            }}
                                            className="flex items-center gap-3 px-6 py-3 bg-blue-600/90 hover:bg-blue-500 text-white rounded-xl shadow-lg border border-white/20 backdrop-blur-md group"
                                        >
                                            <div className="flex flex-col items-start">
                                                <span className="text-[10px] font-bold text-blue-200 tracking-wider">BUY x1</span>
                                                <div className="flex items-center gap-1 font-mono font-black text-lg">
                                                    <img src={CURRENCY_ICONS.silverCoin} className="w-4 h-4" />
                                                    {price}
                                                </div>
                                            </div>
                                            <ShoppingCart size={20} className="text-blue-200 group-hover:text-white" />
                                        </motion.button>

                                        {/* 买 3 张 */}
                                        {(ownedCount === 0 || isTest) && (
                                            <motion.button
                                                whileHover={{ scale: 1.05, x: 5 }}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // [修改] 唤起自定义弹窗
                                                    setConfirmState({ count: 3, cost: price * 3 });
                                                }}
                                                className="flex items-center gap-3 px-6 py-3 bg-orange-600/90 hover:bg-orange-500 text-white rounded-xl shadow-lg border border-white/20 backdrop-blur-md group"
                                            >
                                                <div className="flex flex-col items-start">
                                                    <span className="text-[10px] font-bold text-orange-200 tracking-wider">BUY x3</span>
                                                    <div className="flex items-center gap-1 font-mono font-black text-lg">
                                                        <img src={CURRENCY_ICONS.silverCoin} className="w-4 h-4" />
                                                        {price * 3}
                                                    </div>
                                                </div>
                                                <div className="relative">
                                                    <ShoppingCart size={20} className="text-orange-200 group-hover:text-white" />
                                                    <div className="absolute -top-2 -right-2 bg-red-500 text-[10px] px-1 rounded font-bold shadow-sm">ALL</div>
                                                </div>
                                            </motion.button>
                                        )}

                                        {/* [2026-08-02] 前往对应卡池按钮（购买按钮下方） */}
                                        {onGachaNav && (() => {
                                            const navPoolId = currentCard.gachaPool ?? GachaPoolEnum.Permanent;
                                            return (
                                                <motion.button
                                                    whileHover={{ scale: 1.05, x: 5 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onGachaNav(navPoolId);
                                                    }}
                                                    className="flex items-center gap-3 px-6 py-3 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-xl shadow-lg border border-white/20 backdrop-blur-md group mt-2"
                                                    title="前往卡池"
                                                >
                                                    <div className="flex flex-col items-start">
                                                        <span className="text-[10px] font-bold text-emerald-200 tracking-wider">前往卡池</span>
                                                        <span className="text-xs font-black text-white">{POOLS[navPoolId]?.name}</span>
                                                    </div>
                                                    <ExternalLink size={20} className="text-emerald-200 group-hover:text-white" />
                                                </motion.button>
                                            );
                                        })()}
                                    </>
                                );
                            })()}
                        </div>
                    )}

                    {/* [新增] 钱包余额展示 (左上角) */}
                    {onBuy && (
                        <div className="absolute top-6 left-6 z-50 flex items-center gap-2 bg-black/60 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md shadow-xl animate-fade-in-down">
                            <span className="text-xs text-gray-400 font-bold uppercase mr-2">Wallet</span>
                            <img src={CURRENCY_ICONS.silverCoin} className="w-5 h-5 object-contain" />
                            <span className="font-mono font-black text-xl text-white">{playerSilver.toLocaleString()}</span>
                        </div>
                    )}

                    {/* ============== [皮肤] 皮肤浏览/切换层 ============== */}
                    {enableSkinUI && availableSkins.length > 1 && animState === 'idle' && (
                        <>
                            {/* 左右箭头（金属感半透明浮层） */}
                            {/* 左箭头 */}
                            {hasPrevSkin && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const idx = availableSkins.indexOf(browsingSkinId);
                                        if (idx > 0) setBrowsingSkinId(availableSkins[idx - 1]);
                                    }}
                                    className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-14 h-14 rounded-full bg-black/50 hover:bg-yellow-600/60 border border-white/20 backdrop-blur-md flex items-center justify-center transition-all hover:scale-110 cursor-pointer shadow-xl group/nav"
                                >
                                    <span className="text-3xl font-black text-white group-hover/nav:text-yellow-300 transition-colors">‹</span>
                                </button>
                            )}
                            {/* 右箭头 */}
                            {hasNextSkin && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const idx = availableSkins.indexOf(browsingSkinId);
                                        if (idx < availableSkins.length - 1) setBrowsingSkinId(availableSkins[idx + 1]);
                                    }}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-14 h-14 rounded-full bg-black/50 hover:bg-yellow-600/60 border border-white/20 backdrop-blur-md flex items-center justify-center transition-all hover:scale-110 cursor-pointer shadow-xl group/nav"
                                >
                                    <span className="text-3xl font-black text-white group-hover/nav:text-yellow-300 transition-colors">›</span>
                                </button>
                            )}

                            {/* 底部皮肤信息栏 */}
                            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4 bg-black/70 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/15 shadow-xl">
                                {/* 锁定/拥有状态 */}
                                {!isSkinOwned ? (
                                    <span className="text-red-400 text-xs font-bold tracking-wider mr-2">🔒 未拥有</span>
                                ) : isSkinCurrent ? (
                                    <span className="text-green-400 text-xs font-bold tracking-wider mr-2">✓ 当前皮肤</span>
                                ) : null}

                                {/* 皮肤编号 */}
                                <span className="text-yellow-400 font-mono font-bold text-sm">
                                    皮肤 {browsingSkinId}
                                </span>
                                <span className="text-gray-500 text-xs font-mono">
                                    {currentBrowsingIdx + 1}/{availableSkins.length}
                                </span>

                                {/* 切换按钮 */}
                                {!isSkinCurrent && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (isSkinOwned) {
                                                skinData?.onSkinChange(currentCard.key, browsingSkinId);
                                            }
                                        }}
                                        disabled={!isSkinOwned}
                                        className={`px-4 py-1.5 rounded-full font-black text-xs tracking-wider transition-all ${
                                            isSkinOwned
                                                ? 'bg-gradient-to-r from-yellow-600 to-orange-500 hover:from-yellow-500 hover:to-orange-400 text-white shadow-[0_0_15px_rgba(234,179,8,0.4)] cursor-pointer'
                                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                        }`}
                                    >
                                        {isSkinOwned ? '更换皮肤' : '已锁定'}
                                    </button>
                                )}
                            </div>
                        </>
                    )}

                    {/* 故事抽屉 (Lore Drawer) - 保持不变 */}
                    <div
                        className={`
                            absolute bottom-0 left-0 w-full z-20
                            bg-black/80 backdrop-blur-xl border-t border-white/10
                            transition-all duration-500 ease-in-out flex flex-col
                            ${isLoreOpen ? 'h-[85%]' : 'h-16 hover:bg-black/90'}
                        `}
                    >
                        {/* 把手 */}
                        <div
                            className="h-16 w-full flex items-center justify-center cursor-pointer transition-colors shrink-0 group/drawer"
                            onClick={() => setIsLoreOpen(!isLoreOpen)}
                        >
                            <div className="flex flex-col items-center gap-1">
                                {isLoreOpen ? <ChevronDown className="text-yellow-500 animate-bounce" /> : <ChevronUp className="text-yellow-500 animate-bounce" />}
                                <span className="text-[10px] tracking-[0.3em] font-bold text-yellow-500/50 group-hover/drawer:text-yellow-500 transition-colors uppercase">
                                    {isLoreOpen ? 'Close Biography' : 'Read Biography'}
                                </span>
                            </div>
                        </div>

                        {/* 故事文本区 */}
                        <div className={`flex-1 overflow-y-auto px-12 pb-12 custom-scrollbar ${isLoreOpen ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}>
                            <h3 className="text-2xl font-black text-white/20 mb-8 tracking-[0.5em] border-b border-white/10 pb-4 text-center">
                                ARCHIVE // {targetCard.name}
                            </h3>
                            <p className="text-xl leading-loose text-gray-300 font-serif whitespace-pre-line text-justify">
                                {loreText}
                            </p>
                        </div>
                    </div>
                </div>

                {/* --- 右侧：详细信息面板 --- */}
                {/* [修改] 引用 targetCard 数据 */}
                <div
                    className="w-full md:w-[380px] bg-gray-900/95 p-8 rounded-3xl border border-white/10 text-white shadow-2xl flex flex-col gap-6 self-center h-fit max-h-full overflow-y-auto custom-scrollbar mt-4 md:mt-0 relative z-10"
                    onWheel={(e) => e.stopPropagation()}
                >

                    {/* 1. 顶部标题 */}
                    <div className="flex flex-col items-center text-center">
                        <div className="text-sm font-black text-gray-500 uppercase tracking-[0.3em] mb-2 flex items-center gap-3 bg-black/40 px-4 py-1 rounded-full border border-white/5">
                            <span className={targetCard.region === 'Lyfe' ? 'text-yellow-500' : (targetCard.region === 'Fenny' ? 'text-red-500' : (targetCard.region === 'Analyst' ? 'text-white' : 'text-purple-500'))}>
                                {getRegionLabel(targetCard.region, targetCard.key)}
                            </span>
                            <span className="text-gray-600">|</span>
                            <span className="text-blue-400">{getTypeLabel(targetCard)}</span>
                            {/* [新增] 等级标识 */}
                            {targetCard.isChampion && (
                                <>
                                    <span className="text-gray-600">|</span>
                                    <span className={`font-bold ${targetCard.level === 2 ? 'text-orange-400' : 'text-blue-400'}`}>
                                        LV.{targetCard.level}
                                    </span>
                                </>
                            )}
                        </div>
                        <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-gray-200 to-gray-500 drop-shadow-md tracking-tight py-2">
                            {targetCard.name}
                        </h2>
                    </div>

                    {/* 2. 数值栏 (使用 targetCard) */}
                    <div className="flex justify-center items-center gap-8 py-6 border-y border-white/10 bg-white/5 rounded-2xl mx-4">
                        <div className="flex flex-col items-center gap-1">
                            <div className="w-14 h-14 rounded-full bg-blue-600 border-4 border-blue-400 flex items-center justify-center text-3xl font-black shadow-[0_0_20px_rgba(37,99,235,0.5)]">
                                {targetCard.cost}
                            </div>
                            <span className="text-[10px] text-gray-500 font-bold tracking-widest">COST</span>
                        </div>

                        {targetCard.type.includes('unit') ? (
                            <>
                                <div className="h-10 w-px bg-white/10"></div>
                                <div className="flex flex-col items-center gap-1">
                                    <div className="text-5xl font-black text-yellow-500 drop-shadow-[0_2px_0_rgba(0,0,0,1)] font-impact">
                                        {targetCard.power}
                                    </div>
                                    <span className="text-[10px] text-gray-500 font-bold tracking-widest">POWER</span>
                                </div>
                                <div className="h-10 w-px bg-white/10"></div>
                                <div className="flex flex-col items-center gap-1">
                                    <div className="text-5xl font-black text-red-500 drop-shadow-[0_2px_0_rgba(0,0,0,1)] font-impact">
                                        {targetCard.health}
                                    </div>
                                    <span className="text-[10px] text-gray-500 font-bold tracking-widest">HEALTH</span>
                                </div>
                            </>
                        ) : (
                            (() => {
                                const speed = getSpellSpeedInfo(targetCard.type);
                                return speed ? (
                                    <div className="flex items-center gap-3 px-4">
                                        <div className="w-12 h-12 rounded-full bg-black/40 border border-white/10 flex items-center justify-center shadow-lg">
                                            {speed.icon}
                                        </div>
                                        <div className="flex flex-col items-start">
                                            <span className={`text-2xl font-black tracking-widest ${speed.color}`}>{speed.label}</span>
                                            <span className="text-[10px] text-gray-500 font-bold tracking-widest">{speed.desc}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-sm font-mono text-gray-500 tracking-widest px-8">SPELL CARD</div>
                                );
                            })()
                        )}
                    </div>

                    {/* 3. 关键词 (使用 targetCard) */}
                    {targetCard.keywords.length > 0 && (
                        <div className="flex flex-col items-center space-y-4">
                            <h3 className="text-gray-600 text-[10px] font-black uppercase tracking-[0.4em]">KEYWORDS</h3>
                            <div className="flex flex-wrap justify-center gap-6">
                                {targetCard.keywords.map(k => {
                                    const kwConfig = KEYWORD_DB[k];
                                    if (!kwConfig) return null;
                                    return (
                                        <div key={k} className="group relative flex flex-col items-center gap-2 cursor-help">
                                            <div className="w-16 h-16 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6 bg-black/30 rounded-xl p-2 border border-white/5 group-hover:border-white/20 shadow-lg">
                                                <img src={kwConfig.icon} alt={kwConfig.label} className="w-full h-full object-contain drop-shadow-md" />
                                            </div>
                                            <span className="text-sm font-bold text-gray-400 group-hover:text-white transition-colors tracking-wide">
                                                {kwConfig.label}
                                            </span>
                                            <div className="absolute top-full mt-3 w-56 bg-gray-800 border border-white/20 p-4 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 text-center translate-y-2 group-hover:translate-y-0">
                                                <div className="font-bold text-yellow-400 mb-1 text-sm">{kwConfig.label}</div>
                                                <div className="text-gray-300 text-xs leading-relaxed">{kwConfig.description}</div>
                                                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-800 border-t border-l border-white/20 rotate-45"></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* 4. 升级条件 (仅英雄且 Level 1 显示) */}
                    {/* [修改] 增加 viewLevel === 1 判断 */}
                    {targetCard.isChampion && viewLevel === 1 && (
                        <div className="flex flex-col items-center gap-3 py-4">
                            <div className="text-yellow-600 font-black tracking-[0.2em] text-xs uppercase bg-yellow-900/10 px-4 py-1 rounded-full border border-yellow-700/30">
                                Level Up Condition
                            </div>
                            <p className="text-white text-xl font-medium italic text-center leading-relaxed max-w-[80%]">
                                "{targetCard.name.includes('里芙') ? '此牌打击 2 次。' :
                                 (targetCard.name.includes('芬妮') ? '水晶生命值 ≤ 10。' :
                                 (targetCard.name.includes('卜卜 灵鉴') ? '目睹打击敌方水晶 3 次' :
                                 (targetCard.name.includes('猫汐尔 莲驱') ? '召唤师和召唤衍生物累计造成30点伤害' :
                                 (targetCard.name.includes('安卡希雅 时之重奏') ? '我方打出“朔望之期”' :'满足特定条件。'))))}"
                            </p>
                        </div>
                    )}

                    {/* 5. 卡牌描述 / 升级后效果 */}
                    {/* [修改] 根据 viewLevel 显示不同的标题 */}
                    {targetCard.description && (
                        <div className="space-y-3 pt-6 border-t border-white/5 text-center">
                            <h3 className="text-gray-600 text-[10px] font-black uppercase tracking-[0.4em]">
                                {viewLevel === 2 ? 'LEVEL 2 EFFECT' : 'EFFECT'}
                            </h3>
                            {/* [核心修改] 传入 handleDeepNavigate 支持衍生卡右键下钻 */}
                            <p className="text-gray-300 text-lg leading-relaxed font-light px-4 whitespace-pre-wrap">
                                <RichTextParser text={targetCard.description} onNavigate={handleDeepNavigate} />
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* [卡牌导航] 蓝色矩形翻页按钮 — 改为 absolute 定位适应 ScaleWrapper */}
            {canNavigate && (
                <>
                    {/* 左箭头 */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            navigateCard('prev');
                        }}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-[10001] w-14 h-40 bg-blue-600/80 hover:bg-blue-500 rounded-r-xl border border-blue-400/40 backdrop-blur-sm flex items-center justify-center transition-all hover:scale-105 hover:shadow-[0_0_25px_rgba(59,130,246,0.5)] cursor-pointer shadow-xl group/nav"
                    >
                        <span className="text-4xl font-black text-white group-hover/nav:translate-x-[-2px] transition-transform">◀</span>
                    </button>
                    {/* 右箭头 */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            navigateCard('next');
                        }}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-[10001] w-14 h-40 bg-blue-600/80 hover:bg-blue-500 rounded-l-xl border border-blue-400/40 backdrop-blur-sm flex items-center justify-center transition-all hover:scale-105 hover:shadow-[0_0_25px_rgba(59,130,246,0.5)] cursor-pointer shadow-xl group/nav"
                    >
                        <span className="text-4xl font-black text-white group-hover/nav:translate-x-[2px] transition-transform">▶</span>
                    </button>
                </>
            )}
        </div>
    );
};

interface LevelUpOverlayProps {
    card: CardData;
    onClose: () => void;
    onPlayMovie: (heroKey: string, onEnd: () => void) => void;
    onPrepareMovie?: (heroKey: string) => void; // [核心新增]
    onStopMovie: () => void;
    popLevelUp?: () => void;
    playerNexusHealth?: number;
    enemyNexusHealth?: number;
}

export const LevelUpOverlay: React.FC<LevelUpOverlayProps> = ({ card, onClose, onPlayMovie, onPrepareMovie, onStopMovie, popLevelUp, playerNexusHealth, enemyNexusHealth }) => {
    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black">
            {/* 引入 ChampionLevelUp 组件处理所有动画流程 (旋转 -> 视频 -> 爆发) */}
            <ChampionLevelUp
                card={card}
                onPlayMovie={onPlayMovie}
                onPrepareMovie={onPrepareMovie} // [向下透传] 交给升级动画控制器
                onStopMovie={onStopMovie}
                playerNexusHealth={playerNexusHealth}
                enemyNexusHealth={enemyNexusHealth}
                onComplete={() => {
                    if (popLevelUp) popLevelUp(); // [核心修改] 动画/视频彻底播完后，先将英雄移除队列！
                    onClose(); // 再关闭全屏弹窗，交还控制权
                }}
            />
        </div>
    );
};

interface GameOverProps {
    result: 'victory' | 'defeat';
    stats: GameStats;
    onExit: () => void;
    onPlayMovie?: (onEnd: () => void) => void;
    onPrepareMovie?: () => void; // [核心新增]
    missionSystem: any; // [核心新增] 透传任务系统大脑 ReturnType<typeof useMissionSystem>
}

export const GameOverScreen = ({ result, stats, onExit, onPlayMovie, onPrepareMovie, missionSystem }: GameOverProps) => {
    // 阶段：init(模糊+文字) -> blackout_in -> video -> blackout_out -> menu
    const [phase, setPhase] = useState<'init' | 'blackout_in' | 'video' | 'blackout_out' | 'menu'>('init');

    const processedRef = useRef(false); // 防止重复入账

    const onPlayMovieRef = useRef(onPlayMovie);
    const onPrepareMovieRef = useRef(onPrepareMovie); // [新增]

    useEffect(() => {
        onPlayMovieRef.current = onPlayMovie;
        onPrepareMovieRef.current = onPrepareMovie; // [新增]
    }, [onPlayMovie, onPrepareMovie]);

    // [新增] 计算评分结果 (Memo 确保只算一次)
    const scoreResult = useMemo(() => {
        return calculateGameScore(stats, result, stats.heroLevelUps > 0);
    }, [stats, result]);

    // [新增] 存储本次结算产生的任务进度更新队列
    const [missionUpdates, setMissionUpdates] = useState<any[]>([]);

    useEffect(() => {
        // [关键] 在这里使用 processedRef 防止重复入账
        if ((phase === 'menu' || result === 'defeat') && !processedRef.current) {
            processedRef.current = true; // 标记为已处理

            // ==========================================
            // [军功系统接入] 抽出黑匣子日志，送入任务大脑扫描！
            // ==========================================
            const finalLogs = gameLogger.flushLogs();
            if (missionSystem && missionSystem.scanLogs) {
                const updates = missionSystem.scanLogs(finalLogs);
                if (updates.length > 0) {
                    setMissionUpdates(updates);
                }
            } else {
                 // 兜底清理，防止中途退出产生的脏数据
                 gameLogger.clearLogs();
            }

            // 1. 获取当前用户 ID
            const currentUid = localStorage.getItem(STORAGE_KEYS.USER_ID);

            // [修正] 补全逻辑：使用 currentUid 读取并更新存档
            if (currentUid && scoreResult.silverEarned > 0) {
                // 2. 构造资产 Key
                const assetsKey = `${STORAGE_KEYS.USER_ASSETS}_${currentUid}`;
                const savedAssets = localStorage.getItem(assetsKey);

                // 3. 读取并更新资产
                let newCollection;
                try {
                    if (savedAssets) {
                        newCollection = JSON.parse(savedAssets);
                        // 确保 resources 对象存在
                        if (!newCollection.resources) {
                            newCollection.resources = { silverCoin: 0, dataGold: 0, bitGold: 0 };
                        }
                        // 累加通用银
                        newCollection.resources.silverCoin = (newCollection.resources.silverCoin || 0) + scoreResult.silverEarned;
                    } else {
                        // 如果没有存档（理论上不应发生），新建一个
                        newCollection = {
                            ownedCards: {},
                            ownedSkins: {}, // [皮肤]
                            resources: { silverCoin: scoreResult.silverEarned, dataGold: 0, bitGold: 0 }
                        };
                    }

                    // 4. 保存回 LocalStorage
                    localStorage.setItem(assetsKey, JSON.stringify(newCollection));
                    console.log(`[Economy] Earned ${scoreResult.silverEarned} Silver.`);
                } catch (e) {
                    console.error("[Economy] Failed to save earnings:", e);
                }
            }
        }
    }, [phase, result, scoreResult.silverEarned]);


    // 演出流程控制 (融入预热机制)
    useEffect(() => {
        if (result === 'defeat') {
            setPhase('menu');
            return;
        }

        // [核心斩杀] 刚挂载组件、判定为胜利的瞬间，立刻让放映机后台装弹热车！
        // 此时距离真正切入黑屏(blackout_in)还有 1.5 秒，足够视频解码器把第一帧牢牢锁进显存！
        if (onPrepareMovieRef.current) {
            onPrepareMovieRef.current();
        }

        const t1 = setTimeout(() => setPhase('blackout_in'), 1500);
        const t2 = setTimeout(() => {
            // [修改 4] 使用 onPlayMovieRef.current 来调用，而不是直接用 props
            if (onPlayMovieRef.current) {
                setPhase('video');
                onPlayMovieRef.current(() => {
                    setPhase('blackout_out');
                    setTimeout(() => setPhase('menu'), 800);
                });
            } else {
                setPhase('menu');
            }
        }, 2000);

        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [result]);

    return (
        <div className="fixed inset-0 z-[300] overflow-hidden">
            {/* 1. 背景模糊层 */}
            <div className={`absolute inset-0 bg-black/60 transition-all duration-[1000ms] ${phase === 'init' ? 'backdrop-blur-[20px]' : 'backdrop-blur-md'}`}></div>

            {/* 2. 胜利文字 */}
            {phase === 'init' && result === 'victory' && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                    <h1 className="text-9xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 drop-shadow-[0_0_50px_gold] animate-victory-text tracking-widest">
                        VICTORY
                    </h1>
                </div>
            )}

            {/* 3. 黑色遮罩层 */}
            <div
                className="absolute inset-0 bg-black z-[350] transition-opacity duration-1000 pointer-events-none"
                style={{ opacity: (phase === 'blackout_in' || phase === 'video') ? 1 : (phase === 'blackout_out' ? 0 : 0) }}
            />

            {/* 4. [重构] 结算菜单层 (RPG 风格评分表) */}
            {(phase === 'menu' || result === 'defeat') && (
                <div className="absolute inset-0 flex items-center justify-center z-[400] animate-fade-in bg-black/80 backdrop-blur-xl">
                    <div className="flex gap-16 max-w-6xl w-full px-12 items-center">

                        {/* 左侧：标题与总分 */}
                        <div className="flex-1 flex flex-col items-start gap-4">
                            <div className={`text-9xl font-black italic tracking-tighter ${result === 'victory' ? 'text-transparent bg-clip-text bg-gradient-to-br from-yellow-300 to-yellow-600' : 'text-red-600'}`}>
                                {result === 'victory' ? '胜利' : '失败'}
                            </div>
                            <div className="text-2xl font-mono text-gray-400 tracking-widest">
                                作战成功
                            </div>

                            {/* 获得货币展示 */}
                            <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.5, type: "spring" }}
                                className="mt-8 flex items-center gap-6 bg-white/10 px-8 py-4 rounded-2xl border border-white/20"
                            >
                                <img src={CURRENCY_ICONS.silverCoin} className="w-16 h-16 drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]" alt="银币" />
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-gray-400 tracking-widest uppercase">战斗奖励</span>
                                    <span className="text-5xl font-black text-white font-mono">
                                        +{scoreResult.silverEarned.toLocaleString()}
                                    </span>
                                </div>
                            </motion.div>
                        </div>

                        {/* 右侧：详细评分表 */}
                        <div className="flex-1 bg-gray-900/80 p-8 rounded-2xl border border-white/10 h-[60vh] overflow-y-auto custom-scrollbar flex flex-col gap-2 shadow-2xl">
                            <h3 className="text-xl font-black text-gray-500 mb-4 border-b border-gray-700 pb-2 flex justify-between">
                                <span>作战评分</span>
                                <span>分数</span>
                            </h3>

                            {/* 基础分列表 */}
                            {scoreResult.breakdown.map((item, index) => (
                                <motion.div
                                    key={item.label}
                                    initial={{ x: 50, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    transition={{ delay: index * 0.1 }} // 逐条显示
                                    className="flex justify-between items-center text-sm"
                                >
                                    <div className="flex items-center gap-2 text-gray-300">
                                        <span>{item.label}</span>
                                        <span className="text-gray-600 font-mono">x{item.count}</span>
                                    </div>
                                    <div className="font-mono font-bold text-white">{item.total.toLocaleString()}</div>
                                </motion.div>
                            ))}

                            <div className="h-px bg-gray-700 my-4"></div>

                            {/* 加成列表 */}
                            {scoreResult.achievements.map((ach, index) => (
                                <motion.div
                                    key={ach}
                                    initial={{ x: 50, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    transition={{ delay: 0.5 + index * 0.1 }}
                                    className="flex justify-between items-center text-yellow-400 font-bold text-sm"
                                >
                                    <span>{ach}</span>
                                    <span>+50%</span>
                                </motion.div>
                            ))}

                            <div className="mt-auto pt-6 border-t border-white/20 flex justify-between items-end">
                                <div className="text-gray-400 font-bold text-lg">总计得分</div>
                                <div className="text-4xl font-black text-white font-mono">
                                    {scoreResult.finalScore.toLocaleString()}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 底部按钮栏 */}
                    <div className="absolute bottom-12 w-full flex justify-center gap-6">
                        <button
                            onClick={onExit}
                            className="px-12 py-4 bg-blue-900 hover:bg-blue-800 text-white font-bold rounded-full border-2 border-blue-500/50 flex items-center gap-4 transition-all hover:scale-105 shadow-lg shadow-blue-900/50"
                        >
                            <RefreshCw size={20} />
                            返回大厅
                        </button>
                    </div>
                </div>
            )}

            {/* [核心挂载] 军功进度滑出提示仪 (悬浮在最上层) */}
            {missionUpdates.length > 0 && (
                <MissionToast
                    updates={missionUpdates}
                    onFinish={() => setMissionUpdates([])} // 播完后销毁队列
                />
            )}
        </div>
    );
};