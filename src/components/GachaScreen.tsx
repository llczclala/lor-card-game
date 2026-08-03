import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {ArrowLeft, Search, RefreshCw} from 'lucide-react';
import { useUserSystem } from '../hooks/useUserSystem';
import { rollOne, GACHA_COST_SINGLE, GACHA_COST_TEN, MAX_PITY, POOLS, type GachaResult, type PoolId } from '../logic/gachaLogic';
import { GachaAnimation } from './GachaAnimation';
import { GachaTargetSelector } from './GachaTargetSelector';
import { GachaPoolViewer } from './GachaPoolViewer';
import { CURRENCY_ICONS,gacha_icon } from '../data/imageData';
import { eventBus, GameEvents } from '../utils/eventBus';


interface GachaScreenProps {
    userSystem: ReturnType<typeof useUserSystem>;
    onBack: () => void;
    initialPool?: PoolId; // [2026-08-02] 初始卡池（备战详情跳转指定）
}

// [核心新增] 按池子读取独立保底/定轨的辅助函数
const getPoolPity = (profile: any, poolId: PoolId): number =>
    (profile as any)[`pityCounter_${poolId}`] ?? (profile as any).pityCounter ?? 0;

const getPoolSkinPity = (profile: any, poolId: PoolId): number =>
    (profile as any)[`skinPityCounter_${poolId}`] ?? (profile as any).skinPityCounter ?? 0;

const getPoolTarget = (profile: any, poolId: PoolId): string | null =>
    (profile as any)[`gachaTarget_${poolId}`] ?? (profile as any).gachaTarget ?? null;

export const GachaScreen: React.FC<GachaScreenProps> = ({ userSystem, onBack, initialPool }) => {
    const [activePool, setActivePool] = useState<PoolId>(initialPool ?? 'permanent');
    const [isAnimating, setIsAnimating] = useState(false);
    const [gachaResults, setGachaResults] = useState<GachaResult[]>([]);
    const [showTargetSelector, setShowTargetSelector] = useState(false);
    const [showPoolViewer, setShowPoolViewer] = useState(false);

    const { collection, profile } = userSystem;

    const resources = collection?.resources || { silverCoin: 0, dataGold: 0, bitGold: 0 };

    // [修改] 按当前池子读取独立保底/定轨
    const pityCounter = getPoolPity(profile, activePool);
    const skinPityCounter = getPoolSkinPity(profile, activePool);
    const currentTarget = getPoolTarget(profile, activePool);

    const currentPoolConfig = POOLS[activePool];

    // --- 切换池子 ---
    const handleSwitchPool = (poolId: PoolId) => {
        if (poolId === activePool) return;
        eventBus.emit(GameEvents.UI_CLICK);
        setActivePool(poolId);
    };

    // --- 核心操作：执行抽卡 ---
    const handleGacha = (count: number) => {
        const cost = count === 1 ? GACHA_COST_SINGLE : GACHA_COST_TEN;

        if (resources.dataGold < cost) {
            eventBus.emit(GameEvents.UI_BACK);
            alert("资源不足");
            return;
        }

        if (count === 1) {
            eventBus.emit(GameEvents.GACHA_START_SINGLE);
        } else {
            eventBus.emit(GameEvents.GACHA_START_TEN);
        }

        const results: GachaResult[] = [];
        let newPity = pityCounter;
        let newSkinPity = skinPityCounter;
        let newSilver = resources.silverCoin;
        let newBitGold = resources.bitGold;

        for (let i = 0; i < count; i++) {
            const res = rollOne(collection!, newPity, newSkinPity, currentTarget, userSystem.settings, activePool);
            results.push(res);

            if (res.isRare && res.type !== 'skin') {
                newPity = 0;
            } else {
                newPity++;
            }

            if (res.type === 'skin') {
                newSkinPity = 0;
            } else {
                newSkinPity++;
            }

            if (res.convertedCurrency) {
                if (res.convertedCurrency.type === 'silverCoin') {
                    newSilver += res.convertedCurrency.amount;
                } else {
                    newBitGold += res.convertedCurrency.amount;
                }
            }
        }

        // [修改] 传入 activePool，按池子写入独立保底
        if (userSystem.performGacha) {
             userSystem.performGacha(cost, results, newPity, newSkinPity, activePool);
        } else {
             console.warn("useUserSystem.performGacha not implemented yet!");
        }

        setGachaResults(results);
        setIsAnimating(true);
    };

    // 设置定轨 — [修改] 按池子独立写入
    const handleSetTarget = (target: string) => {
        if (userSystem.setGachaTarget) {
            userSystem.setGachaTarget(target, activePool);
        }
        setShowTargetSelector(false);
    };

    return (
        <div className="relative w-full h-full bg-slate-950 overflow-hidden font-sans select-none text-white">

            {/* 背景层 */}
            <div className="absolute inset-0 z-10">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 to-slate-900"></div>
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
                <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-purple-600/10 blur-[100px] rounded-full mix-blend-screen animate-pulse-slow"></div>
            </div>

            {/* 左侧：卡池列表 */}
            <div className="absolute top-0 left-0 w-80 h-full z-20 flex flex-col pt-32 px-4 gap-4">
                {/* 常守之誓 */}
                <div
                    onClick={() => handleSwitchPool('permanent')}
                    className={`w-full h-32 rounded-xl relative cursor-pointer transform hover:scale-105 transition-all shadow-lg border overflow-hidden group ${
                        activePool === 'permanent'
                            ? 'border-yellow-400/60 shadow-yellow-400/20'
                            : 'border-white/20'
                    }`}
                >
                    <img
                        src={gacha_icon.PGgachaBtnImg}
                        className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        alt="常守之誓"
                    />
                    <div className="absolute inset-0 flex flex-col justify-end p-3 bg-gradient-to-t from-black/80 to-transparent">
                        <div className="text-[10px] font-black tracking-widest text-purple-200 mb-0.5">
                            {activePool === 'permanent' ? '当前选择' : '点击切换'}
                        </div>
                        <div className="font-black text-sm leading-tight text-white drop-shadow-md">常守之誓</div>
                    </div>
                    {activePool === 'permanent' && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-400 shadow-[0_0_10px_orange]"></div>
                    )}
                </div>

                {/* 烬中镜火卡池 */}
                <div
                    onClick={() => handleSwitchPool('lotus')}
                    className={`w-full h-32 rounded-xl relative cursor-pointer transform hover:scale-105 transition-all shadow-lg border overflow-hidden group ${
                        activePool === 'lotus'
                            ? 'border-yellow-400/60 shadow-yellow-400/20'
                            : 'border-white/20'
                    }`}
                >
                    <img
                        src={gacha_icon.LgachaBtnImg}
                        className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        alt="烬中镜火"
                    />
                    <div className="absolute inset-0 flex flex-col justify-end p-3 bg-gradient-to-t from-black/80 to-transparent">
                        <div className="text-[10px] font-black tracking-widest text-purple-200 mb-0.5">
                            {activePool === 'lotus' ? '当前选择' : '点击切换'}
                        </div>
                        <div className="font-black text-sm leading-tight text-white drop-shadow-md">烬中镜火</div>
                    </div>
                    {activePool === 'lotus' && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-400 shadow-[0_0_10px_orange]"></div>
                    )}
                </div>

                {/* 池子信息摘要 */}
                <div className="mt-auto mb-8 px-2 text-[10px] text-gray-500 leading-relaxed">
                    <div className="font-bold text-gray-400 mb-1">—— 当前卡池信息 ——</div>
                    <div>✦ 稀有英雄: {currentPoolConfig.heroKeys.length} 位</div>
                    <div>✦ 可抽取卡背: {currentPoolConfig.cardBackIndices.length} 款</div>
                    <div>✦ 可抽取牌桌: {currentPoolConfig.deskIndices.length} 款</div>
                </div>
            </div>

            {/* 右侧封面图 */}
            <div className="absolute inset-0 z-10 pointer-events-none">
                <motion.div
                    key={activePool}
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8 }}
                    className="absolute right-0 top-0 bottom-0 w-[80%] h-full flex items-center justify-center"
                >
                    <img
                        src={activePool === 'lotus' ? gacha_icon.LgachaDeskImg : gacha_icon.PGgachaDeskImg}
                        className="w-full h-full object-contain object-right-center p-12 translate-y-[-2.5%]"
                        alt="抽卡封面"
                    />
                </motion.div>
            </div>

            {/* 顶部栏 */}
            <div className="absolute top-0 right-0 p-8 z-20 flex items-center gap-8">
                <div className="flex gap-6 bg-black/60 backdrop-blur-md px-6 py-3 rounded-full border border-white/10">
                    <div className="flex items-center gap-2">
                        <img src={CURRENCY_ICONS.silverCoin} className="w-5 h-5" alt="银币" />
                        <span className="font-mono font-bold">{resources.silverCoin.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <img src={CURRENCY_ICONS.dataGold} className="w-5 h-5" alt="数据金" />
                        <span className="font-mono font-bold text-purple-300">{resources.dataGold.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <img src={CURRENCY_ICONS.bitGold} className="w-5 h-5" alt="比特金" />
                        <span className="font-mono font-bold text-yellow-300">{resources.bitGold.toLocaleString()}</span>
                    </div>
                </div>

                <button
                    onClick={() => {
                        eventBus.emit(GameEvents.UI_BACK);
                        onBack();
                    }}
                    className="p-4 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition-all border border-white/10 group"
                >
                    <ArrowLeft className="group-hover:-translate-x-1 transition-transform" />
                </button>
            </div>

            {/* 底部栏：定轨与抽卡 */}
            <div className="absolute bottom-0 left-0 w-full p-8 z-20 flex items-end justify-between pointer-events-none">

                <div className="flex flex-col gap-4 pointer-events-auto ml-64">
                    <div className="flex items-center gap-4">
                        {/* 定轨按钮 */}
                        <div className="relative group">
                            <button
                                onClick={() => {
                                    eventBus.emit(GameEvents.UI_CLICK);
                                    setShowTargetSelector(true);
                                }}
                                className="w-16 h-16 rounded-xl bg-black/60 border border-purple-500/50 flex items-center justify-center hover:bg-purple-900/40 transition-colors shadow-[0_0_20px_rgba(168,85,247,0.2)]"
                            >
                                <RefreshCw size={24} className="text-purple-400 group-hover:rotate-180 transition-transform duration-500" />
                            </button>
                            <div className="absolute -top-11 left-1/2 -translate-x-1/2 bg-black/80 px-4 py-2 rounded text-xs font-mono border border-white/10 whitespace-nowrap">
                                定向目标: <span className="text-yellow-400 font-bold">{currentTarget ? currentTarget.split(':')[1].toUpperCase() : 'NONE'}</span>
                            </div>
                        </div>

                        {/* [2026-08-02] 放大镜按钮 —— 整合卡池内容查看（原"概率查看"按钮升级） */}
                        <button
                            onClick={() => {
                                eventBus.emit(GameEvents.UI_CLICK);
                                setShowPoolViewer(true);
                            }}
                            className="w-16 h-16 rounded-xl bg-black/60 border border-white/20 flex items-center justify-center hover:bg-white/10 transition-colors shadow-lg group/lens"
                            title="查看卡池内容"
                        >
                            <Search size={24} className="text-gray-300 group-hover/lens:text-white group-hover/lens:scale-110 transition-all duration-300" />
                        </button>
                    </div>

                    {/* 双轨保底看板 — [修改] 显示当前池子的保底 */}
                    <div className="flex gap-8">
                        <div className="flex flex-col gap-1">
                            <div className="text-[10px] text-yellow-500 font-black tracking-widest uppercase">
                                {activePool === 'lotus' ? '莲驱保底进度' : '绝密保底进度'}
                            </div>
                            <div className="text-4xl font-black italic text-white flex items-baseline gap-1">
                                <span className="text-yellow-400">{pityCounter}</span>
                                <span className="text-lg text-gray-500">/ {MAX_PITY}</span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1">
                            <div className="text-[10px] text-purple-400 font-black tracking-widest uppercase">高定皮肤保底</div>
                            <div className="text-4xl font-black italic text-white flex items-baseline gap-1">
                                <span className="text-purple-400">{skinPityCounter}</span>
                                <span className="text-lg text-gray-500">/ 30</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 抽卡按钮 */}
                <div className="flex gap-4 pointer-events-auto">
                    <GachaButton
                        cost={GACHA_COST_SINGLE}
                        count={1}
                        canAfford={resources.dataGold >= GACHA_COST_SINGLE}
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_CLICK);
                            handleGacha(1);
                        }}
                    />

                    <GachaButton
                        cost={GACHA_COST_TEN}
                        count={10}
                        canAfford={resources.dataGold >= GACHA_COST_TEN}
                        isPrimary
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_CLICK);
                            handleGacha(10);
                        }}
                    />
                </div>
            </div>

            {/* 弹窗层 */}

            <AnimatePresence>
                {isAnimating && (
                    <GachaAnimation
                        results={gachaResults}
                        onClose={() => setIsAnimating(false)}
                    />
                )}
            </AnimatePresence>

            {showTargetSelector && (
                <GachaTargetSelector
                    currentTarget={currentTarget}
                    onConfirm={handleSetTarget}
                    onClose={() => setShowTargetSelector(false)}
                    poolId={activePool}
                    ownedCards={collection?.ownedCards || {}}
                    unlockedCardBacks={userSystem.settings?.unlockedCardBacks || []}
                    unlockedDesks={userSystem.settings?.unlockedDesks || []}
                />
            )}

            {showPoolViewer && (
                <GachaPoolViewer
                    poolId={activePool}
                    onClose={() => setShowPoolViewer(false)}
                />
            )}

        </div>
    );
};

const GachaButton = ({ cost, count, canAfford, isPrimary, onClick }: { cost: number, count: number, canAfford: boolean, isPrimary?: boolean, onClick: () => void }) => (
    <button
        onClick={onClick}
        className={`
            relative w-48 h-24 rounded-lg flex flex-col items-center justify-center gap-1 transition-all duration-200
            ${isPrimary
                ? 'bg-purple-600 hover:bg-purple-500 shadow-[0_0_30px_rgba(147,51,234,0.4)]'
                : 'bg-slate-800 hover:bg-slate-700 border border-white/10'
            }
            ${!canAfford ? 'opacity-50 grayscale cursor-not-allowed' : 'active:scale-95'}
        `}
    >
        <div className="text-white font-black text-xl italic tracking-widest">
            x{count}
        </div>
        <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded-full">
            <img src={CURRENCY_ICONS.dataGold} className="w-4 h-4" />
            <span className={`font-mono text-sm font-bold ${canAfford ? 'text-white' : 'text-red-400'}`}>
                {cost}
            </span>
        </div>
        {isPrimary && (
            <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-400 rotate-45 shadow-lg"></div>
        )}
    </button>
);
