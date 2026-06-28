/**
 * ==============================================================================
 * 《Snowbreak Rivals》 军需处视觉终端 (Mission UI)
 * ==============================================================================
 * 职责：
 * 1. MissionPanel: 大厅唤出的任务与成就管理面板，负责展示与奖励领取。
 * 2. MissionToast: 对局结算画面专用的滑动提示框，支持队列依次展示。
 * ==============================================================================
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Target, Calendar, Zap, Award, Gift, CheckCircle, Sparkles, Clock } from 'lucide-react';
import { MISSIONS, type MissionCategory } from '../data/missionData';
import type { MissionUpdateResult, MissionProgress } from '../hooks/useMissionSystem';
import { CURRENCY_ICONS, getSkinImage, PERSONALIZATION_ASSETS, HERO_IMAGES } from '../data/imageData'; // [新增] 引入外观图库
import { getMissionItems } from '../data/skinData'; // [新增] 引入外观调度局 API
import { CARD_DB } from '../data/cards'; // [新增] 用于卡牌奖励名称查询
import { eventBus, GameEvents } from '../utils/eventBus';

// ============================================================================
// 奖励弹窗数据结构
// ============================================================================
interface RewardPopupData {
    title: string;
    type: 'dataGold' | 'skin' | 'cardBack' | 'card';
    amount?: number;
    imageSrc?: string;
    itemName?: string;
    cards?: Array<{ imageSrc: string; name: string; count: number }>;
}

// ============================================================================
// 子组件 1：大厅军需面板 (MissionPanel)
// ============================================================================

interface MissionPanelProps {
    isOpen: boolean;
    onClose: () => void;
    missionSystem: any; // ReturnType<typeof useMissionSystem>
    userSystem: any;    // 玩家系统，用于发货
}

export const MissionPanel: React.FC<MissionPanelProps> = ({ isOpen, onClose, missionSystem, userSystem }) => {
    const [activeTab, setActiveTab] = useState<MissionCategory>('daily');
    // [金光弹窗] 领取奖励后展示
    const [rewardPopup, setRewardPopup] = useState<RewardPopupData | null>(null);
    // [悬停预览] 鼠标悬停缩略图时放大
    const [hoverPreview, setHoverPreview] = useState<{ src: string; x: number; y: number } | null>(null);

    if (!isOpen) return null;

    // 筛选当前标签页的任务
    // [fix] 由 missionSystem 决定哪些任务存在（showCondition 已在初始化时处理）
    const displayMissions = MISSIONS.filter(m => {
        if (m.category !== activeTab) return false;
        return !!missionSystem.progress[m.id]; // 不在 progress 中的任务不显示
    });

    // 领取奖励的业务封装
    const handleClaim = (mission: typeof MISSIONS[0]) => {
        // 1. 调用大脑标记签收，并获取奖励配方
        const reward = missionSystem.claimReward(mission.id);
        if (reward) {
            // 2. 将奖励配方发给 UserSystem 提货
            if (userSystem.grantMissionReward) {
                userSystem.grantMissionReward(reward);
                eventBus.emit(GameEvents.GACHA_CONVERT);
            } else {
                console.warn("[MissionUI] UserSystem 缺失 grantMissionReward 接口！");
            }

            // 3. 组装金光弹窗数据
            const popup: RewardPopupData = { title: mission.title, type: reward.type };
            if (reward.type === 'dataGold' && reward.amount) {
                popup.amount = reward.amount;
            } else if (reward.type === 'card' && reward.cardKeys) {
                popup.cards = reward.cardKeys.map(cardKey => {
                    let imageSrc = '';
                    if (cardKey === 'mauxir_lotus_drive') {
                        imageSrc = HERO_IMAGES.mauxir_lotus_drive?.base || '';
                    } else {
                        imageSrc = getSkinImage(cardKey) || '';
                    }
                    const cardDef = CARD_DB[cardKey];
                    return { imageSrc, name: cardDef?.name || cardKey, count: 1 };
                });
            } else if (reward.cosmeticId) {
                const config = getMissionItems().find(item => item.missionId === reward.cosmeticId);
                if (config) {
                    popup.itemName = config.name;
                    if (config.type === 'skin' && config.cardKey && config.skinId !== undefined) {
                        popup.imageSrc = getSkinImage(config.cardKey, config.skinId);
                    } else if (config.type === 'cardBack' && config.index !== undefined) {
                        popup.imageSrc = PERSONALIZATION_ASSETS.cardBacks[config.index];
                    }
                }
            }
            setRewardPopup(popup);
        }
    };

    return (
     <>
        <div className="fixed inset-0 z-[600] flex items-center justify-center font-sans select-none">
            {/* 暗影底衬 */}
            <motion.div
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={onClose}
            />

            {/* 面板主体 */}
            <motion.div
                className="relative w-[1000px] h-[700px] bg-slate-900/90 border border-blue-500/30 rounded-2xl shadow-[0_0_80px_rgba(30,58,138,0.4)] flex overflow-hidden backdrop-blur-xl"
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
            >
                {/* 内部高光与扫描线 */}
                <div className="absolute top-0 w-full h-[30%] bg-gradient-to-b from-blue-600/10 to-transparent pointer-events-none" />

                {/* 左侧侧边栏 */}
                <div className="w-64 bg-slate-950/50 border-r border-blue-500/20 flex flex-col p-6 shrink-0 relative z-10">
                    <div className="flex items-center gap-3 mb-10">
                        <div className="w-10 h-10 bg-blue-900/50 rounded-lg flex items-center justify-center border border-blue-500/50 shadow-[0_0_15px_blue]">
                            <Target className="text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white tracking-widest">战区军功</h2>
                            <p className="text-[10px] text-blue-500/80 font-mono tracking-wider">COMMAND CENTER</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <TabButton id="daily" active={activeTab} icon={<Calendar size={18} />} label="每日委派" onClick={() => { setActiveTab('daily'); eventBus.emit(GameEvents.UI_CLICK); }} />
                        <TabButton id="weekly" active={activeTab} icon={<Zap size={18} />} label="每周清剿" onClick={() => { setActiveTab('weekly'); eventBus.emit(GameEvents.UI_CLICK); }} />
                        <TabButton id="achievement" active={activeTab} icon={<Award size={18} />} label="生涯成就" onClick={() => { setActiveTab('achievement'); }} />
								<TabButton id="version" active={activeTab} icon={<Sparkles size={18} />} label="版本活动" onClick={() => { setActiveTab('version'); eventBus.emit(GameEvents.UI_CLICK); }} />
                    </div>
                </div>

                {/* 右侧任务列表区 */}
                <div className="flex-1 p-8 flex flex-col relative z-10">
                    {/* 关闭按钮 */}
                    <button onClick={() => { onClose(); eventBus.emit(GameEvents.UI_BACK); }} className="absolute top-6 right-6 p-2 rounded-full text-blue-500/50 hover:bg-blue-900/30 hover:text-white transition-all">
                        <X size={24} />
                    </button>

                    <h3 className="text-2xl font-black text-white mb-6 border-b border-white/10 pb-4">
                        {activeTab === 'daily' ? '每日委派 (DAILY)' : activeTab === 'weekly' ? '每周清剿 (WEEKLY)' : activeTab === 'version' ? '版本活动 (VERSION)' : '生涯成就 (ACHIEVEMENT)'}
                    </h3>

                    {activeTab !== 'achievement' && activeTab !== 'version' && <CountdownTimer category={activeTab as 'daily' | 'weekly'} />}

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 space-y-4">
                        {displayMissions.map(mission => {
                            const prog: MissionProgress = missionSystem.progress[mission.id] || { current: 0, target: mission.targetCount, status: 'ongoing' };
                            const isCompleted = prog.status === 'completed';
                            const isClaimed = prog.status === 'claimed';
                            const percent = Math.min(100, (prog.current / prog.target) * 100);

                            return (
                                <div key={mission.id} className={`relative flex items-center justify-between p-5 rounded-xl border transition-all duration-300 ${
                                    isClaimed ? 'bg-slate-900/50 border-white/5 opacity-50 grayscale' :
                                    isCompleted ? 'bg-blue-900/20 border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.1)]' :
                                    'bg-slate-800/50 border-blue-500/20 hover:border-blue-500/50'
                                }`}>

                                    {/* 左侧信息 */}
                                    <div className="flex flex-col gap-2 flex-1 pr-8">
                                        <h4 className={`text-lg font-bold ${isCompleted && !isClaimed ? 'text-yellow-400' : 'text-white'}`}>{mission.title}</h4>
                                        <p className="text-sm text-gray-400 font-medium">{mission.description}</p>

                                        {!mission.rewardDirect && (<>
                                        {/* 进度条 */}
                                        <div className="mt-2 w-full max-w-md h-2 bg-black/50 rounded-full overflow-hidden border border-white/10 relative">
                                            <motion.div
                                                className={`absolute left-0 top-0 h-full ${isCompleted ? 'bg-yellow-500' : 'bg-blue-500'}`}
                                                initial={{ width: 0 }}
                                                animate={{ width: `${percent}%` }}
                                                transition={{ duration: 0.5, ease: "easeOut" }}
                                            />
                                        </div>
                                        <span className="text-[10px] font-mono text-gray-500 mt-1">
                                            PROGRESS: {prog.current} / {prog.target}
                                        </span>
                                        </>)}
                                    </div>

                                    {/* 右侧奖励与按钮 */}
                                    <div className="flex items-center gap-6 shrink-0 min-w-[180px] justify-end">
                                        {/* 奖励展示 */}
                                        <div className="flex flex-col items-center justify-center">
                                            {(() => {
                                                if (mission.reward.type === 'card') {
                                                    const cardKeys = mission.reward.cardKeys || [];
                                                    const firstKey = cardKeys[0];
                                                    const previewSrc = firstKey === 'mauxir_lotus_drive'
                                                        ? HERO_IMAGES.mauxir_lotus_drive?.base || ''
                                                        : getSkinImage(firstKey);
                                                    return (
                                                        <div
                                                            className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-green-500/30 min-w-[120px] cursor-pointer"
                                                            onMouseEnter={(e) => {
                                                                if (previewSrc) {
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    setHoverPreview({ src: previewSrc, x: rect.right + 12, y: rect.top - 30 });
                                                                }
                                                            }}
                                                            onMouseMove={(e) => {
                                                                setHoverPreview(prev => prev ? { ...prev, x: e.clientX + 18, y: e.clientY - 10 } : null);
                                                            }}
                                                            onMouseLeave={() => setHoverPreview(null)}
                                                        >
                                                            <div className="w-8 h-8 rounded border border-green-500/50 overflow-hidden shrink-0 bg-slate-900">
                                                                <img src={previewSrc} className="w-full h-full object-cover" alt="卡牌" />
                                                            </div>
                                                            <div className="flex flex-col items-start overflow-hidden">
                                                                <span className="text-[8px] font-bold text-green-500/80 tracking-widest uppercase">CARD</span>
                                                                <span className="font-bold text-xs text-green-300 max-w-[90px] truncate">{cardKeys.length} 张</span>
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                if (mission.reward.type === 'dataGold') {
                                                    return (
                                                        <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-lg border border-purple-500/30">
                                                            <img src={CURRENCY_ICONS.dataGold} className="w-5 h-5" alt="数据金" />
                                                            <span className="font-mono font-bold text-purple-300">{mission.reward.amount}</span>
                                                        </div>
                                                    );
                                                }

                                                // [核心重构] 动态向调度局拉取绝密外观的名称与高清缩略图！
                                                let cosmeticPreview = null;
                                                let cosmeticName = '未定资产';

                                                if (mission.reward.cosmeticId) {
                                                    const config = getMissionItems().find(item => item.missionId === mission.reward.cosmeticId);
                                                    if (config) {
                                                        cosmeticName = config.name;
                                                        if (config.type === 'skin' && config.cardKey && config.skinId !== undefined) {
                                                            cosmeticPreview = getSkinImage(config.cardKey, config.skinId);
                                                        } else if (config.type === 'cardBack' && config.index !== undefined) {
                                                            cosmeticPreview = PERSONALIZATION_ASSETS.cardBacks[config.index];
                                                        }
                                                    }
                                                }

                                                return (
                                                    <div
                                                        className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-yellow-500/30 min-w-[120px] cursor-pointer"
                                                        onMouseEnter={(e) => {
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setHoverPreview({ src: cosmeticPreview, x: rect.right + 12, y: rect.top - 30 });
                                                        }}
                                                        onMouseMove={(e) => {
                                                            setHoverPreview(prev => prev ? { ...prev, x: e.clientX + 18, y: e.clientY - 10 } : null);
                                                        }}
                                                        onMouseLeave={() => setHoverPreview(null)}
                                                    >
                                                        {cosmeticPreview ? (
                                                            <div className="w-8 h-8 rounded border border-yellow-500/50 overflow-hidden shadow-sm shrink-0 bg-slate-900">
                                                                <img src={cosmeticPreview} className="w-full h-full object-cover" alt={cosmeticName} />
                                                            </div>
                                                        ) : (
                                                            <Gift size={18} className="text-yellow-400 shrink-0" />
                                                        )}
                                                        <div className="flex flex-col items-start overflow-hidden">
                                                            <span className="text-[8px] font-bold text-yellow-500/80 tracking-widest uppercase">
                                                                {mission.reward.type === 'skin' ? 'SKIN' : 'CARDBACK'}
                                                            </span>
                                                            <span className="font-bold text-xs text-yellow-400 max-w-[90px] truncate" title={cosmeticName}>
                                                                {cosmeticName}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* 状态按钮 */}
                                        {mission.rewardDirect && !isClaimed ? (
                                            <button
                                                onClick={() => handleClaim(mission)}
                                                className="px-6 py-2.5 rounded-lg bg-green-500 hover:bg-green-400 text-black font-black text-sm shadow-[0_0_15px_rgba(34,197,94,0.5)] transition-all animate-pulse-slow active:scale-95"
                                            >
                                                领取奖励
                                            </button>
                                        ) : isClaimed ? (
                                            <div className="px-6 py-2.5 rounded-lg bg-black/50 text-gray-500 font-bold text-sm border border-gray-700 flex items-center gap-2">
                                                <CheckCircle size={16} /> 已领取
                                            </div>
                                        ) : isCompleted ? (
                                            <button
                                                onClick={() => handleClaim(mission)}
                                                className="px-6 py-2.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-black font-black text-sm shadow-[0_0_15px_rgba(234,179,8,0.5)] transition-all animate-pulse-slow active:scale-95"
                                            >
                                                领取奖励
                                            </button>
                                        ) : (
                                            <div className="px-6 py-2.5 rounded-lg bg-slate-800 text-gray-500 font-bold text-sm border border-transparent">
                                                进行中
                                            </div>
                                        )}
                                    </div>

                                </div>
                            );
                        })}
                    </div>
                </div>
            </motion.div>
        </div>

        {/* 金光领取弹窗 */}
        <AnimatePresence>
            {rewardPopup && (
                <motion.div
                    className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setRewardPopup(null)}
                >
                    {/* 金光光晕 */}
                    <div className="absolute w-[500px] h-[500px] rounded-full bg-gradient-radial from-yellow-500/25 via-yellow-500/10 to-transparent pointer-events-none" />

                    <motion.div
                        className="relative flex flex-col items-center"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* 标题 */}
                        <motion.div
                            initial={{ y: -20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.15 }}
                            className="text-center mb-6"
                        >
                            <span className="text-3xl font-black text-yellow-400 tracking-widest drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]">
                                奖励领取成功
                            </span>
                        </motion.div>

                        {/* 奖励展示 */}
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.25 }}
                            className="bg-slate-900/90 border border-yellow-500/30 rounded-2xl p-8 shadow-2xl"
                        >
                            {rewardPopup.type === 'dataGold' ? (
                                <div className="flex flex-col items-center gap-4 px-8">
                                    <img src={CURRENCY_ICONS.dataGold} className="w-20 h-20" alt="dataGold" />
                                    <span className="text-5xl font-black text-purple-300">+{rewardPopup.amount}</span>
                                    <span className="text-sm text-gray-400 font-mono tracking-widest">数据金</span>
                                </div>
                            ) : rewardPopup.type === 'card' && rewardPopup.cards ? (
                                <div className="flex flex-col items-center gap-4 px-4">
                                    <span className="text-3xl font-black text-green-400 tracking-widest drop-shadow-[0_0_15px_rgba(34,197,94,0.5)]">
                                        ✦ 卡牌解锁 ✦
                                    </span>
                                    <div className="grid grid-cols-2 gap-3">
                                        {rewardPopup.cards.map((card, i) => (
                                            <div key={i} className="relative w-36 h-48 rounded-xl overflow-hidden border-2 border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.2)] bg-slate-900 group">
                                                <img src={card.imageSrc} className="w-full h-full object-cover" alt={card.name} />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                                <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                                                    <span className="text-[10px] font-bold text-green-300 truncate block">{card.name}</span>
                                                </div>
                                                <div className="absolute top-1 right-1 bg-green-600/90 text-white text-[10px] font-black px-1.5 py-0.5 rounded-md shadow-lg">
                                                    x{card.count}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <span className="text-xs text-gray-400 font-mono tracking-widest">已加入收藏</span>
                                </div>
                            ) : rewardPopup.imageSrc ? (
                                <div className="flex flex-col items-center gap-4">
                                    <div className="w-64 h-80 rounded-xl overflow-hidden border-2 border-yellow-500/50 shadow-[0_0_30px_rgba(234,179,8,0.3)]">
                                        <img src={rewardPopup.imageSrc} className="w-full h-full object-cover" />
                                    </div>
                                    <span className="text-lg font-bold text-yellow-400">{rewardPopup.itemName || '未知奖励'}</span>
                                    <span className="text-xs text-gray-400 font-mono tracking-widest uppercase">
                                        {rewardPopup.type === 'skin' ? '🎨 皮肤已解锁' : '🃏 卡背已解锁'}
                                    </span>
                                </div>
                            ) : null}
                        </motion.div>

                        {/* 确认按钮 */}
                        <motion.button
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            onClick={() => setRewardPopup(null)}
                            className="mt-8 px-10 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-full tracking-widest shadow-[0_0_20px_rgba(234,179,8,0.4)] transition-all active:scale-95"
                        >
                            确 认
                        </motion.button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>

        {/* 悬停预览大图 */}
        {hoverPreview && createPortal(
            <motion.div
                className="fixed pointer-events-none z-[800]"
                style={{ left: hoverPreview.x, top: hoverPreview.y }}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
                <div className="w-80 h-[420px] rounded-xl overflow-hidden border-2 border-yellow-500/50 shadow-[0_0_30px_rgba(0,0,0,0.9)] bg-slate-900">
                    <img src={hoverPreview.src} className="w-full h-full object-cover" />
                </div>
            </motion.div>,
            document.body
        )}
     </>
    );
};

// 侧边栏按钮微件
const TabButton = ({ id, active, icon, label, onClick }: any) => {
    const isActive = active === id;
    return (
        <button
            onClick={onClick}
            className={`w-full py-3 px-4 flex items-center gap-3 transition-all duration-300 rounded-lg ${isActive ? 'bg-blue-600 text-white shadow-lg' : 'text-blue-500/60 hover:bg-blue-900/30 hover:text-blue-300'}`}
        >
            {icon}
            <span className="font-bold tracking-widest text-sm">{label}</span>
        </button>
    );
};


// ============================================================================
// 子组件 2：结算滑出提示队列 (MissionToast)
// ============================================================================

interface MissionToastProps {
    updates: MissionUpdateResult[];
    onFinish: () => void;
}

export const MissionToast: React.FC<MissionToastProps> = ({ updates, onFinish }) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    // 内部状态机：控制每一个 Toast 显示 2.5 秒后切换下一个
    useEffect(() => {
        if (updates.length === 0) return;

        if (currentIndex >= updates.length) {
            onFinish(); // 队列播放完毕，通知父组件销毁
            return;
        }

        const timer = setTimeout(() => {
            setCurrentIndex(prev => prev + 1);
        }, 2500);

        return () => clearTimeout(timer);
    }, [currentIndex, updates, onFinish]);

    if (updates.length === 0 || currentIndex >= updates.length) return null;

    const currentUpdate = updates[currentIndex];
    const isCompleted = currentUpdate.justCompleted;

    return (
        <div className="absolute top-20 left-8 z-[1000] pointer-events-none">
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentUpdate.missionId}
                    initial={{ x: -300, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -300, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className={`relative w-[340px] p-4 rounded-xl border-l-4 shadow-[0_10px_30px_rgba(0,0,0,0.8)] backdrop-blur-md flex items-center gap-4 ${
                        isCompleted
                            ? 'bg-yellow-900/80 border-yellow-400'
                            : 'bg-blue-950/80 border-blue-500'
                    }`}
                >
                    {/* 左侧图标 */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${
                        isCompleted ? 'bg-yellow-500/20 border-yellow-400 text-yellow-400' : 'bg-blue-500/20 border-blue-400 text-blue-400'
                    }`}>
                        {isCompleted ? <Award size={20} /> : <Target size={20} />}
                    </div>

                    {/* 中间信息 */}
                    <div className="flex-1 flex flex-col min-w-0">
                        <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400">
                            {isCompleted ? 'ACHIEVEMENT UNLOCKED' : 'MISSION UPDATE'}
                        </span>
                        <span className={`text-sm font-bold truncate ${isCompleted ? 'text-yellow-400' : 'text-white'}`}>
                            {currentUpdate.title}
                        </span>

                        {/* 进度数值与划线特效 */}
                        <div className="flex items-center mt-1 relative">
                            {/* [核心特效] 如果刚刚完成，播放一道划过数字的特效 */}
                            <span className={`text-xs font-mono font-bold transition-all relative ${isCompleted ? 'text-gray-500' : 'text-blue-300'}`}>
                                {currentUpdate.current} / {currentUpdate.target}
                                {isCompleted && (
                                    <motion.div
                                        className="absolute left-0 top-1/2 w-full h-[2px] bg-yellow-500"
                                        initial={{ width: 0 }}
                                        animate={{ width: '100%' }}
                                        transition={{ duration: 0.3, delay: 0.2 }}
                                    />
                                )}
                            </span>

                            {/* [核心特效] 金色大勾砸下 */}
                            {isCompleted && (
                                <motion.div
                                    className="ml-2"
                                    initial={{ scale: 0, opacity: 0, rotate: -45 }}
                                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 10, delay: 0.4 }}
                                >
                                    <Check className="text-yellow-400 drop-shadow-[0_0_5px_yellow]" size={18} strokeWidth={4} />
                                </motion.div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

const CountdownTimer = ({ category }: { category: 'daily' | 'weekly' }) => {
    const [timeLeft, setTimeLeft] = useState('');
    useEffect(() => {
        const calc = () => {
            const now = new Date();
            let target;
            if (category === 'daily') {
                target = new Date(now);
                target.setHours(now.getHours() >= 6 ? 24 + 6 : 6, 0, 0, 0);
            } else {
                target = new Date(now);
                const d = now.getDay();
                const add = d === 0 ? 1 : d === 1 && now.getHours() < 6 ? 0 : 8 - d;
                target.setDate(now.getDate() + add);
                target.setHours(6, 0, 0, 0);
            }
            const diff = target.getTime() - now.getTime();
            if (diff <= 0) return '即将重置...';
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        };
        setTimeLeft(calc());
        const t = setInterval(() => setTimeLeft(calc()), 1000);
        return () => clearInterval(t);
    }, [category]);
    return (
        <div className="flex items-center gap-2 text-blue-400/80 mb-4 pb-2 border-b border-white/5">
            <Clock size={14} />
            <span className="text-xs font-mono tracking-wider">
                {category === 'daily' ? '每日重置倒计时' : '每周重置倒计时'}：<span className="text-white font-bold">{timeLeft}</span>
            </span>
        </div>
    );
};
