// ==========================================
// 悖论迷宫 · 肉鸽专属任务面板（悖论推演委派）
// [2026-08-29 莉莉子] 参考普通军功任务界面（MissionUI）但独立成肉鸽专属：
//   - 只显示 rogue 标记的任务（普通军功面板已过滤）
//   - Tab：每日 / 里程碑（daily+rogue / achievement+rogue）
//   - 奖励：数据金 / 分析员经验 / 稀有武装（复用 grantMissionReward）
// ==========================================
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Award, Coins, Sparkles, Target } from 'lucide-react';
import { MISSIONS, type MissionDef } from '../../data/missionData';
import type { MissionProgress } from '../../hooks/useMissionSystem';
import { getEquipmentById } from '../../data/equipment';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { RewardClaimPopup, buildRewardPopupData, type RewardPopupData } from '../../components/RewardClaimPopup'; // [2026-09-09 莉莉子] 肉鸽委派领取金光弹窗对齐主大厅

interface RogueMissionPanelProps {
    isOpen: boolean;
    onClose: () => void;
    missionSystem: any; // useMissionSystem
    userSystem: any;    // useUserSystem（grantMissionReward）
}

type RogueTab = 'daily' | 'milestone';

/** [2026-09-08] 脉冲黄点（tab 可领提示，同款大厅/军需 tab） */
const Dot = () => (
    <span className="relative ml-auto flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
    </span>
);

export const RogueMissionPanel: React.FC<RogueMissionPanelProps> = ({ isOpen, onClose, missionSystem, userSystem }) => {
    const [tab, setTab] = useState<RogueTab>('daily');
    // [2026-09-09 莉莉子] 领取金光弹窗（对齐主大厅 MissionUI）
    const [rewardPopup, setRewardPopup] = useState<RewardPopupData | null>(null);

    // 关面板时顺带清掉可能残留的弹窗
    const closeAll = () => { setRewardPopup(null); onClose(); };

    // ESC 关闭（capture + stopImmediatePropagation 拦截全局 ESC）；弹窗开着时优先关弹窗
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopImmediatePropagation();
            if (rewardPopup) { setRewardPopup(null); return; }
            onClose();
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [isOpen, onClose, rewardPopup]);

    if (!isOpen) return null;

    // [2026-09-08] 各 tab 是否有可领（点亮标签黄点，与推演任务入口黄点同语义：统计本面板可见 rogue 任务）
    const rogueTabClaimable = (cat: 'daily' | 'achievement'): boolean =>
        MISSIONS.some(m => m.rogue && m.category === cat && missionSystem?.progress?.[m.id]?.status === 'completed');

    // 只显示肉鸽专属任务，按 Tab 分每日/里程碑
    const displayMissions = MISSIONS
        .filter(m => m.rogue && (tab === 'daily' ? m.category === 'daily' : m.category === 'achievement'))
        .filter(m => missionSystem?.progress?.[m.id])
        .sort((a, b) => (missionSystem?.progress?.[a.id]?.sort ?? 101) - (missionSystem?.progress?.[b.id]?.sort ?? 101));

    /** 奖励文案 */
    const rewardLabel = (m: MissionDef): string => {
        if (m.reward.type === 'analystExp') return `+${m.reward.amount} 分析员经验`;
        if (m.reward.type === 'armament' && m.reward.armamentId) return `武装「${getEquipmentById(m.reward.armamentId)?.name ?? m.reward.armamentId}」`;
        if (m.reward.type === 'dataGold') return `+${m.reward.amount} 数据金`;
        return '';
    };

    const handleClaim = (m: MissionDef) => {
        const reward = missionSystem?.claimReward?.(m.id);
        if (!reward) return;
        userSystem?.grantMissionReward?.(reward);
        eventBus.emit(GameEvents.GACHA_CONVERT);
        // [2026-09-09 莉莉子] 领取后弹金光奖励窗（与主大厅任务一致，含数据金/武装/分析员经验等）
        setRewardPopup(buildRewardPopupData(m.title, reward));
    };

    return (
        <>
        <AnimatePresence>
            <motion.div className="fixed inset-0 z-[950] flex items-center justify-center font-sans select-none">
                <motion.div
                    className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={closeAll}
                />
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                    className="relative w-[900px] h-[640px] bg-slate-900/95 border border-purple-500/30 rounded-2xl shadow-[0_0_80px_rgba(88,28,135,0.4)] flex overflow-hidden backdrop-blur-xl"
                >
                    {/* 内部高光 */}
                    <div className="absolute top-0 w-full h-[30%] bg-gradient-to-b from-purple-600/10 to-transparent pointer-events-none" />

                    {/* 左侧 Tab 侧边栏（肉鸽主题） */}
                    <div className="w-60 bg-slate-950/50 border-r border-purple-500/20 flex flex-col p-6 shrink-0 relative z-10">
                        <div className="flex items-center gap-3 mb-10">
                            <div className="w-10 h-10 bg-purple-900/50 rounded-lg flex items-center justify-center border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.5)]">
                                <Target size={18} className="text-purple-400" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-white tracking-widest">悖论推演委派</h2>
                                <p className="text-[10px] text-purple-500/80 font-mono tracking-wider">PARADOX COMMISSION</p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <button onClick={() => { setTab('daily'); eventBus.emit(GameEvents.UI_CLICK); }}
                                className={`relative flex items-center gap-3 px-4 py-2.5 rounded-lg font-black text-sm transition-all ${tab === 'daily' ? 'bg-purple-600/30 border border-purple-400/50 text-purple-200' : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-white'}`}>
                                <Calendar size={18} /> 每日委派
                                {rogueTabClaimable('daily') && <Dot />}
                            </button>
                            <button onClick={() => { setTab('milestone'); eventBus.emit(GameEvents.UI_CLICK); }}
                                className={`relative flex items-center gap-3 px-4 py-2.5 rounded-lg font-black text-sm transition-all ${tab === 'milestone' ? 'bg-purple-600/30 border border-purple-400/50 text-purple-200' : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-white'}`}>
                                <Award size={18} /> 里程碑
                                {rogueTabClaimable('achievement') && <Dot />}
                            </button>
                        </div>

                        <div className="mt-auto text-[10px] text-purple-500/60 font-mono tracking-wider">
                            推演委派 · 仅限悖论迷宫
                        </div>
                    </div>

                    {/* 右侧任务列表 */}
                    <div className="flex-1 p-8 flex flex-col relative z-10">
                        <button onClick={() => { closeAll(); eventBus.emit(GameEvents.UI_BACK); }} className="absolute top-6 right-6 p-2 rounded-full text-purple-500/50 hover:bg-purple-900/30 hover:text-white transition-all">
                            <X size={24} />
                        </button>

                        <h3 className="text-2xl font-black text-white mb-6 border-b border-white/10 pb-4">
                            {tab === 'daily' ? '每日委派 (DAILY COMMISSION)' : '里程碑 (MILESTONE)'}
                        </h3>

                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 space-y-4">
                            {displayMissions.length === 0 && (
                                <p className="text-gray-500 text-sm text-center pt-10">暂无委派任务</p>
                            )}
                            {displayMissions.map(mission => {
                                const prog: MissionProgress = missionSystem?.progress[mission.id] || { current: 0, target: mission.targetCount, status: 'ongoing' };
                                const isCompleted = prog.status === 'completed';
                                const isClaimed = prog.status === 'claimed';
                                const percent = Math.min(100, (prog.current / prog.target) * 100);
                                return (
                                    <div key={mission.id} className={`relative flex items-center justify-between p-5 rounded-xl border transition-all duration-300 ${
                                        isClaimed ? 'bg-slate-900/50 border-white/5 opacity-50 grayscale' :
                                        isCompleted ? 'bg-purple-900/20 border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.15)]' :
                                        'bg-slate-800/50 border-purple-500/20 hover:border-purple-500/50'
                                    }`}>
                                        {/* 左侧信息 */}
                                        <div className="flex flex-col gap-2 flex-1 pr-8">
                                            <h4 className={`text-lg font-bold ${isCompleted && !isClaimed ? 'text-yellow-400' : 'text-white'}`}>{mission.title}</h4>
                                            <p className="text-sm text-gray-400 font-medium">{mission.description}</p>
                                            <div className="mt-2 w-full max-w-md h-2 bg-black/50 rounded-full overflow-hidden border border-white/10 relative">
                                                <motion.div
                                                    className={`absolute left-0 top-0 h-full ${isCompleted ? 'bg-yellow-500' : 'bg-purple-500'}`}
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${percent}%` }}
                                                    transition={{ duration: 0.5, ease: 'easeOut' }}
                                                />
                                            </div>
                                            <span className="text-[10px] font-mono text-gray-500 mt-1">
                                                PROGRESS: {prog.current} / {prog.target}
                                            </span>
                                        </div>

                                        {/* 右侧奖励与按钮 */}
                                        <div className="flex items-center gap-4 shrink-0 min-w-[170px] justify-end">
                                            <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-lg border border-purple-500/30">
                                                {mission.reward.type === 'armament' && mission.reward.armamentId ? (
                                                    <img src={getEquipmentById(mission.reward.armamentId)?.icon} className="w-5 h-5 object-cover" alt="" />
                                                ) : mission.reward.type === 'dataGold' ? (
                                                    <Coins size={16} className="text-amber-300" />
                                                ) : (
                                                    <Sparkles size={16} className="text-purple-300" />
                                                )}
                                                <span className="font-mono font-bold text-xs text-purple-200 max-w-[100px] truncate">{rewardLabel(mission)}</span>
                                            </div>
                                            {isCompleted ? (
                                                <button onClick={() => handleClaim(mission)}
                                                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-yellow-600 to-amber-400 text-black font-black text-sm shrink-0 hover:scale-105 transition-all">
                                                    领取
                                                </button>
                                            ) : isClaimed ? (
                                                <span className="text-xs text-gray-500 shrink-0">已领取</span>
                                            ) : (
                                                <span className="text-xs text-gray-500 font-mono shrink-0">{prog.current}/{prog.target}</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
        {/* 领取金光弹窗（共享组件，对齐主大厅） */}
        {rewardPopup && <RewardClaimPopup data={rewardPopup} onClose={() => setRewardPopup(null)} />}
        </>
    );
};
