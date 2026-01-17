import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, RefreshCw, ChevronUp, ChevronDown,ShoppingCart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CardData, GameStats } from '../types';
import { KEYWORD_DB } from '../data/keywords';
import { getCardLore } from '../data/loreData';
import { ChampionLevelUp } from './ChampionLevelUp';
import { CARD_DB } from '../data/cards';
import { getLeveledUpCard, getCardPrice } from '../utils/gameRules';
import { UI_ICONS, CURRENCY_ICONS } from '../data/imageData';
import { calculateGameScore } from '../logic/scoring'; // [新增] 评分逻辑
import { STORAGE_KEYS } from '../utils/storageUtils';

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
                <button onClick={onCancel} className="px-6 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-bold border border-white/10 transition-colors">CANCEL</button>
                <button onClick={onConfirm} className="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold shadow-[0_0_20px_rgba(22,163,74,0.4)] transition-all hover:scale-105">CONFIRM</button>
            </div>
        </div>
    </div>
);

// [新增] 扩展 Props 定义
interface FullArtOverlayProps {
    card: CardData;
    onClose: () => void;
    // 购买相关参数 (可选，仅在备战环节传入)
    onBuy?: (count: number, cost: number) => boolean;
    ownedCount?: number;
    playerSilver?: number;
}


export const FullArtOverlay = ({ card, onClose,onBuy,ownedCount = 0,playerSilver = 0 }: FullArtOverlayProps) => {
    const [isLoreOpen, setIsLoreOpen] = useState(false);

    // [新增] 购买确认弹窗状态
    const [confirmState, setConfirmState] = useState<{count: number, cost: number} | null>(null);

    // [新增] 1. 视图状态管理：当前查看的等级 (默认跟随传入卡牌的等级)
    const [viewLevel, setViewLevel] = useState(card.level);
    // [新增] 动画状态：'idle' (静止) | 'up' (升级遮罩) | 'down' (降级遮罩)
    const [animState, setAnimState] = useState<'idle' | 'up' | 'down'>('idle');

    // [新增] 2. 准备 Level 1 和 Level 2 数据
    // 使用 useMemo 避免重复计算，依赖 card.key 变化
    const { baseCard, leveledCard } = useMemo(() => {
        // 始终基于卡牌库中的基础数据 (Level 1)
        const base = CARD_DB[card.key] as CardData;
        // 动态计算升级后数据 (Level 2)
        const leveled = getLeveledUpCard(base);
        return { baseCard: base, leveledCard: leveled };
    }, [card.key]);

    // [新增] 3. 确定当前展示的目标卡牌数据
    // 如果不是英雄，直接显示原卡；如果是英雄，根据 viewLevel 切换数据对象
    const targetCard = !card.isChampion ? card : (viewLevel === 1 ? baseCard : leveledCard);

    // [新增] 确定当前图片 URL (优先使用 Level 2 专属图)
    const displayImage = targetCard.level === 2 && targetCard.level2ImageUrl ? targetCard.level2ImageUrl : targetCard.imageUrl;

    const getRegionLabel = (region: string, key: string) => {
        if (key.startsWith('test_')) return 'TEST';
        return region.toUpperCase();
    };

    const getTypeLabel = (isChampion: boolean) => {
        return isChampion ? 'HERO' : 'UNIT';
    };

    const loreText = getCardLore(card.key);

    // [新增] 4. 切换处理函数
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-md animate-fade-in p-4 md:p-8" onClick={onClose}>
            {/* 关闭按钮 */}
            <button onClick={onClose} className="absolute top-4 right-4 md:top-8 md:right-8 text-white/80 hover:text-white bg-black/50 hover:bg-red-500/80 rounded-full p-2 transition-all z-[210]">
                <X size={32} />
            </button>

            {/* [修改] 主容器：添加 overflow-hidden 以限制动画遮罩的范围，确保遮罩只在内容区出现 */}
            <div className="relative flex flex-col md:flex-row max-w-7xl w-full h-full md:h-[90vh] items-stretch justify-center gap-0 md:gap-8 overflow-hidden rounded-2xl" onClick={e => e.stopPropagation()}>

                {/* [新增] 购买确认弹窗挂载点 */}
                {confirmState && (
                    <PurchaseConfirmModal
                        cardName={card.name}
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
                            <img src={UI_ICONS.levelup} className="w-32 h-32 opacity-80 animate-pulse drop-shadow-lg" alt="Level Up" />
                        </motion.div>
                    )}
                    {animState === 'down' && (
                        <motion.div
                            className="absolute inset-0 z-[100] bg-blue-600/90 flex items-center justify-center pointer-events-none"
                            initial={{ y: '-100%' }} // 从上方进入
                            animate={{ y: '100%' }}  // 向下移出
                            transition={{ duration: 0.8, ease: "easeInOut" }}
                        >
                            <img src={UI_ICONS.leveldown} className="w-32 h-32 opacity-80 animate-pulse drop-shadow-lg" alt="Level Down" />
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
                            alt="Background Blur"
                        />
                    </div>

                    {/* 图层 2 (顶层): 完整原画展示 */}
                    <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
                        <img
                            src={displayImage} // [修改] 使用动态 displayImage
                            className="w-full h-full object-contain drop-shadow-2xl transition-all duration-300"
                            alt="Full Art"
                        />
                    </div>

                    {/* [新增] 等级切换按钮 (仅英雄显示) */}
                    {/* 位置：右下角，bottom-20 避开底部故事抽屉 */}
                    {card.isChampion && animState === 'idle' && (
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
                                alt="Toggle Level"
                            />
                        </motion.button>
                    )}

                    {/* [修正] 购买按钮组：调整位置到底部靠左，避开原画主体 */}
                    {onBuy && animState === 'idle' && (
                        <div className="absolute left-6 bottom-[18%] flex flex-col gap-3 z-40 items-start">
                            {(() => {
                                const price = getCardPrice(card.cost);
                                const isTest = card.region === 'TEST';
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
                <div className="w-full md:w-[500px] bg-gray-900/95 p-10 rounded-3xl border border-white/10 text-white shadow-2xl flex flex-col gap-8 self-center h-fit max-h-full overflow-y-auto custom-scrollbar mt-4 md:mt-0 relative z-10">

                    {/* 1. 顶部标题 */}
                    <div className="flex flex-col items-center text-center">
                        <div className="text-sm font-black text-gray-500 uppercase tracking-[0.3em] mb-2 flex items-center gap-3 bg-black/40 px-4 py-1 rounded-full border border-white/5">
                            <span className={targetCard.region === 'Lyfe' ? 'text-yellow-500' : (targetCard.region === 'Fenny' ? 'text-red-500' : 'text-purple-500')}>
                                {getRegionLabel(targetCard.region, targetCard.key)}
                            </span>
                            <span className="text-gray-600">|</span>
                            <span className="text-blue-400">{getTypeLabel(targetCard.isChampion)}</span>
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
                            <div className="text-sm font-mono text-gray-500 tracking-widest px-8">SPELL CARD</div>
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
                                "{targetCard.name.includes('里芙') ? '我打击 2 次。' : (targetCard.name.includes('芬妮') ? '造成过伤害。' : '满足特定条件。')}"
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
                            <p className="text-gray-300 text-lg leading-relaxed font-light px-4 whitespace-pre-line">
                                {targetCard.description}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

interface LevelUpOverlayProps {
    card: CardData;
    onClose: () => void;
    onPlayMovie: (heroKey: string, onEnd: () => void) => void;
    onStopMovie: () => void; // [新增] 定义回调
}

export const LevelUpOverlay: React.FC<LevelUpOverlayProps> = ({ card, onClose, onPlayMovie, onStopMovie }) => {
    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black">
            {/* 引入 ChampionLevelUp 组件处理所有动画流程 (旋转 -> 视频 -> 爆发) */}
            <ChampionLevelUp
                card={card}
                onPlayMovie={onPlayMovie}
                onStopMovie={onStopMovie} // [新增] 透传给核心组件
                onComplete={onClose}
            />
        </div>
    );
};

interface GameOverProps {
    result: 'victory' | 'defeat';
    // [新增] 接收统计数据
    stats: GameStats;
    onExit: () => void;
    onPlayMovie?: (onEnd: () => void) => void;
}

export const GameOverScreen = ({ result, stats,onExit, onPlayMovie }: GameOverProps) => {
    // 阶段：init(模糊+文字) -> blackout_in -> video -> blackout_out -> menu
    const [phase, setPhase] = useState<'init' | 'blackout_in' | 'video' | 'blackout_out' | 'menu'>('init');

    const processedRef = useRef(false); // 防止重复入账

    const onPlayMovieRef = useRef(onPlayMovie);
    useEffect(() => {
        onPlayMovieRef.current = onPlayMovie;
    }, [onPlayMovie]);

    // [新增] 计算评分结果 (Memo 确保只算一次)
    const scoreResult = useMemo(() => {
        return calculateGameScore(stats, result, stats.heroLevelUps > 0);
    }, [stats, result]);

    useEffect(() => {
        // [关键] 在这里使用 processedRef 防止重复入账
        if ((phase === 'menu' || result === 'defeat') && !processedRef.current) {
            processedRef.current = true; // 标记为已处理

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


    // 演出流程控制 (保持原有逻辑)
    useEffect(() => {
        if (result === 'defeat') {
            setPhase('menu');
            return;
        }

        // [修改 3] 移除了 sequenceTriggeredRef 检查，防止死锁

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
                                <img src={CURRENCY_ICONS.silverCoin} className="w-16 h-16 drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]" alt="Silver" />
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
        </div>
    );
};