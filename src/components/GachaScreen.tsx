import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {ArrowLeft, Search, RefreshCw,Database} from 'lucide-react';
import { useUserSystem } from '../hooks/useUserSystem';
import { rollOne, GACHA_COST_SINGLE, GACHA_COST_TEN, MAX_PITY, type GachaResult } from '../logic/gachaLogic';
import { GachaAnimation } from './GachaAnimation';
import { GachaTargetSelector } from './GachaTargetSelector';
import { CURRENCY_ICONS,gacha_icon } from '../data/imageData';
import { eventBus, GameEvents } from '../utils/eventBus';


interface GachaScreenProps {
    userSystem: ReturnType<typeof useUserSystem>;
    onBack: () => void;
}

export const GachaScreen: React.FC<GachaScreenProps> = ({ userSystem, onBack }) => {
    // 状态管理
    const [isAnimating, setIsAnimating] = useState(false);
    const [gachaResults, setGachaResults] = useState<GachaResult[]>([]);
    const [showTargetSelector, setShowTargetSelector] = useState(false);
    const [showProbModal, setShowProbModal] = useState(false);

    const { collection, profile } = userSystem;

    // 获取当前资源 (防御性读取)
    const resources = collection?.resources || { silverCoin: 0, dataGold: 0, bitGold: 0 };

    // 获取保底和定轨状态 (注意：需要先在 initialUserData 里添加这两个字段，这里先用 fallback)
    // 稍后我们会去 initialUserData.ts 补上这些字段定义
    const pityCounter = (profile as any).pityCounter || 0;
    const skinPityCounter = (profile as any).skinPityCounter || 0; // [核心新增] 获取皮肤保底进度
    const currentTarget = (profile as any).gachaTarget || null;

    // --- 核心操作：执行抽卡 ---
    const handleGacha = (count: number) => {
        const cost = count === 1 ? GACHA_COST_SINGLE : GACHA_COST_TEN;


        // 1. 检查余额
        if (resources.dataGold < cost) {
            // 这里应该弹出一个充值提示或者 Toast
            eventBus.emit(GameEvents.UI_BACK);
            alert("资源不足");
            return;
        }

        if (count === 1) {
            eventBus.emit(GameEvents.GACHA_START_SINGLE);
        } else {
            eventBus.emit(GameEvents.GACHA_START_TEN);
        }

        // 2. 扣除资源 & 计算结果

        const results: GachaResult[] = [];
        let newPity = pityCounter;
        let newSkinPity = skinPityCounter; // [核心新增] 初始化局部皮肤保底变量
        let newSilver = resources.silverCoin;
        let newBitGold = resources.bitGold;

        // 循环执行抽卡逻辑
        for (let i = 0; i < count; i++) {
            // [核心修复] 喂给 rollOne 皮肤保底参数，以及 userSettings 查缺补漏重复饰品
            const res = rollOne(collection!, newPity, newSkinPity, currentTarget, userSystem.settings);
            results.push(res);

            // [核心修复] 分离双轨保底重置逻辑
            // 常规百抽保底（仅在出金且非皮肤时重置）
            if (res.isRare && res.type !== 'skin') {
                newPity = 0;
            } else {
                newPity++;
            }

            // 皮肤 30 抽保底（出皮肤时重置）
            if (res.type === 'skin') {
                newSkinPity = 0;
            } else {
                newSkinPity++;
            }

            // 处理转化货币 (模拟累加，实际需要写入数据库)
            if (res.convertedCurrency) {
                if (res.convertedCurrency.type === 'silverCoin') {
                    newSilver += res.convertedCurrency.amount;
                } else {
                    newBitGold += res.convertedCurrency.amount;
                }
            }
        }

        // 3. 执行数据写入 (这一步非常重要，必须原子化)
        // 我们调用 userSystem 的一个新方法 (稍后在 hooks 里补充)
        // 这里暂时用一个假设的方法名 performGachaTransaction
        // 如果 useUserSystem 还没更新，这里先只做扣费演示，结果只在动画里显示
        // 实际上：你应该在 GachaAnimation 结束后再写入？不，应该先写入防止掉线吞卡。

        // [临时逻辑] 直接更新资源，假装写入了
        // 真正的写入需要在 useUserSystem.ts 里实现 updateCollection 等方法
        if (userSystem.performGacha) {
             // [核心修复] 向发货中枢同步更新后的 newSkinPity
             userSystem.performGacha(cost, results, newPity, newSkinPity);
        } else {
             console.warn("useUserSystem.performGacha not implemented yet!");
        }

        // 4. 启动动画
        setGachaResults(results);
        setIsAnimating(true);
    };

    // 设置定轨
    const handleSetTarget = (target: string) => {
        // 调用 userSystem 更新 profile.gachaTarget
        if (userSystem.setGachaTarget) {
            userSystem.setGachaTarget(target);
        }
        setShowTargetSelector(false);
    };

    return (
        <div className="relative w-full h-full bg-slate-950 overflow-hidden font-sans select-none text-white">

            {/* 1. 背景层 (动态流光) */}
            <div className="absolute inset-0 z-10">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 to-slate-900"></div>
                {/* 模拟全息网格 */}
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
                <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-purple-600/10 blur-[100px] rounded-full mix-blend-screen animate-pulse-slow"></div>
            </div>

            {/* 2. 左侧：卡池列表 (简化版) */}
            <div className="absolute top-0 left-0 w-80 h-full z-20 flex flex-col pt-32 px-4 gap-4">
                {/* [修改] 使用 button.png 作为背景的卡池按钮 */}
                <div
                    onClick={() => eventBus.emit(GameEvents.UI_CLICK)}
                    className="w-full h-32 rounded-xl relative cursor-pointer transform hover:scale-105 transition-all shadow-lg border border-white/20 overflow-hidden group"
                >
                    <img
                        src={gacha_icon.PGgachaBtnImg}
                        className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        alt="Standard Pool"
                    />
                    {/* 文字叠加层 */}
                    <div className="absolute inset-0 flex flex-col justify-end p-3 bg-gradient-to-t from-black/80 to-transparent">
                        <div className="text-[10px] font-black tracking-widest text-purple-200 mb-0.5">当前选择</div>
                        <div className="font-black text-sm leading-tight text-white drop-shadow-md">常驻卡池</div>
                    </div>
                    {/* 选中高亮条 */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-400 box-shadow-[0_0_10px_orange]"></div>
                </div>

                {/* 占位：未来活动卡池 */}
                <div
                    onClick={() => eventBus.emit(GameEvents.UI_CLICK)} // [新增]
                    className="w-full h-24 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 cursor-pointer transition-all flex items-center justify-center"
                >
                    <div className="text-center opacity-50">
                        <div className="text-[10px] font-bold tracking-widest mb-1">正在路上。。。</div>
                        <div className="text-xs">镜中烬火</div>
                    </div>
                </div>
            </div>

            {/* 3. [核心修改] 右侧主展示区：放置 desk.png */}
            {/* 这里的定位策略是：让图片填满右侧区域，位于 TopBar 下方，BottomBar 上方 */}
            <div className="absolute inset-0 z-10 pointer-events-none">
                {/* 封面图容器 */}
                <motion.div
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8 }}
                    className="absolute right-0 top-0 bottom-0 w-[80%] h-full flex items-center justify-center"
                >
                    {/* desk.png */}
                    {/* 我们使用 object-contain 配合 max-h/max-w 确保它完整显示在空白处 */}
                    {/* 位置微调：translate-y-[-5%] 稍微往上一点，避开下面的抽卡按钮 */}
                    <img
                        src={gacha_icon.PGgachaDeskImg}
                        className="w-full h-full object-contain object-right-center p-12 translate-y-[-2.5%]"
                        alt="Gacha Cover"
                    />
                </motion.div>
            </div>

            {/* 4. 顶部栏：资源与返回 */}
            <div className="absolute top-0 right-0 p-8 z-20 flex items-center gap-8">
                {/* 资源显示 */}
                <div className="flex gap-6 bg-black/60 backdrop-blur-md px-6 py-3 rounded-full border border-white/10">
                    <div className="flex items-center gap-2">
                        <img src={CURRENCY_ICONS.silverCoin} className="w-5 h-5" alt="Silver" />
                        <span className="font-mono font-bold">{resources.silverCoin.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <img src={CURRENCY_ICONS.dataGold} className="w-5 h-5" alt="Gold" />
                        <span className="font-mono font-bold text-purple-300">{resources.dataGold.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <img src={CURRENCY_ICONS.bitGold} className="w-5 h-5" alt="Bit" />
                        <span className="font-mono font-bold text-yellow-300">{resources.bitGold.toLocaleString()}</span>
                    </div>
                </div>

                {/* 返回按钮 */}
                <button
                    onClick={() => {
                        eventBus.emit(GameEvents.UI_BACK); // [新增] 退出音效
                        onBack();
                    }}
                    className="p-4 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition-all border border-white/10 group"
                >
                    <ArrowLeft className="group-hover:-translate-x-1 transition-transform" />
                </button>
            </div>

            {/* 5. 底部栏：定轨与抽卡操作 */}
            <div className="absolute bottom-0 left-0 w-full p-8 z-20 flex items-end justify-between pointer-events-none">

                {/* 左下：定轨与保底 */}
                <div className="flex flex-col gap-4 pointer-events-auto ml-64">
                    {/* 定轨按钮 */}
                    <div className="relative group">
                        <button
                            onClick={() => {
                                eventBus.emit(GameEvents.UI_CLICK); // [新增] 打开定轨
                                setShowTargetSelector(true);
                            }}
                            className="w-16 h-16 rounded-xl bg-black/60 border border-purple-500/50 flex items-center justify-center hover:bg-purple-900/40 transition-colors shadow-[0_0_20px_rgba(168,85,247,0.2)]"
                        >
                            <RefreshCw size={24} className="text-purple-400 group-hover:rotate-180 transition-transform duration-500" />
                        </button>
                        {/* 定轨状态提示 */}
                        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 bg-black/80 px-4 py-2 rounded text-xs font-mono border border-white/10 whitespace-nowrap">
                            定向目标: <span className="text-yellow-400 font-bold">{currentTarget ? currentTarget.split(':')[1].toUpperCase() : 'NONE'}</span>
                        </div>
                    </div>

                    {/* 概率详情按钮 */}
                    <button
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_CLICK); // [新增] 打开详情
                            setShowProbModal(true);
                        }}
                        className="flex items-center gap-2 text-gray-400 hover:text-white text-xs font-bold transition-colors w-fit"
                    >
                        <Search size={14} /> 概率查看
                    </button>

                    {/* 双轨保底看板 */}
                    <div className="flex gap-8">
                        {/* 常规保底计数器 */}
                        <div className="flex flex-col gap-1">
                            <div className="text-[10px] text-yellow-500 font-black tracking-widest uppercase">绝密保底进度</div>
                            <div className="text-4xl font-black italic text-white flex items-baseline gap-1">
                                <span className="text-yellow-400">{pityCounter}</span>
                                <span className="text-lg text-gray-500">/ {MAX_PITY}</span>
                            </div>
                        </div>

                        {/* 皮肤保底计数器 */}
                        <div className="flex flex-col gap-1">
                            <div className="text-[10px] text-purple-400 font-black tracking-widest uppercase">高定皮肤保底</div>
                            <div className="text-4xl font-black italic text-white flex items-baseline gap-1">
                                <span className="text-purple-400">{skinPityCounter}</span>
                                <span className="text-lg text-gray-500">/ 30</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 右下：抽卡按钮组 */}
                <div className="flex gap-4 pointer-events-auto">
                    {/* 单抽 */}
                    <GachaButton
                        cost={GACHA_COST_SINGLE}
                        count={1}
                        canAfford={resources.dataGold >= GACHA_COST_SINGLE}
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_CLICK); // [新增] 打开定轨
                            handleGacha(1);
                        }}
                    />

                    {/* 十连 */}
                    <GachaButton
                        cost={GACHA_COST_TEN}
                        count={10}
                        canAfford={resources.dataGold >= GACHA_COST_TEN}
                        isPrimary
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_CLICK); // [新增] 打开定轨
                            handleGacha(10);
                        }}
                    />
                </div>
            </div>

            {/* --- 弹窗层 --- */}

            {/* 1. 抽卡动画 (覆盖全屏) */}
            <AnimatePresence>
                {isAnimating && (
                    <GachaAnimation
                        results={gachaResults}
                        onClose={() => setIsAnimating(false)}
                    />
                )}
            </AnimatePresence>

            {/* 2. 定轨选择器 */}
            {showTargetSelector && (
                <GachaTargetSelector
                    currentTarget={currentTarget}
                    onConfirm={handleSetTarget}
                    onClose={() => setShowTargetSelector(false)}
                />
            )}

            {/* 3. 概率详情 (简单文本弹窗) */}
            {showProbModal && (
                <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/80 backdrop-blur-sm"
                onClick={() => {
                        eventBus.emit(GameEvents.UI_BACK); // [新增] 关闭详情音效
                        setShowProbModal(false);
                    }}
                >
                    <div className="bg-slate-900 p-8 rounded-2xl border border-white/10 max-w-md" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Database size={20} /> DROP RATES</h3>
                        <div className="space-y-4 text-sm text-gray-300">
                            <div className="flex justify-between">
                                <span>Legendary (Heroes/Styles)</span>
                                <span className="text-yellow-400 font-bold">2.00%</span>
                            </div>
                            {/* [核心新增] 公示 4% 的独立皮肤爆率 */}
                            <div className="flex justify-between">
                                <span>Epic (Exclusive Skins)</span>
                                <span className="text-purple-400 font-bold">4.00%</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Common (Unit/Spell Cards)</span>
                                <span className="text-white font-bold">94.00%</span>
                            </div>
                            <div className="h-px bg-white/10 my-2"></div>
                            <p className="text-xs text-gray-500">
                                * Guaranteed legendary item every 100 pulls.<br/>
                                * Duplicate items are converted into Silver Coin or Bit Gold.
                            </p>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

// 子组件：抽卡按钮
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
        {/* 装饰角标 */}
        {isPrimary && (
            <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-400 rotate-45 shadow-lg"></div>
        )}
    </button>
);