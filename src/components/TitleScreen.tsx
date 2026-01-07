import React, { useState } from 'react';
import { Sword,Dices, UserCircle, Skull, BookOpen,Swords, ArrowLeft,RefreshCw} from 'lucide-react';
import { eventBus, GameEvents } from '../utils/eventBus';
import { UI_IMAGES } from '../data/imageData';
import { motion, AnimatePresence } from 'framer-motion';
import { AccountSelectionModal } from './AccountSelectionModal';
import type { useUserSystem } from '../hooks/useUserSystem';

interface TitleScreenProps {
    onTitleStartClick: () => void;
    mode: 'title' | 'mode_select';
    onPvESelect: () => void;
    onEnterModeSelect: () => void;
    onBack?: () => void;
    userSystem: ReturnType<typeof useUserSystem>;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
    onTitleStartClick,mode,onPvESelect,onEnterModeSelect,
    onBack,userSystem // [修复] 在这里解构出 userSystem
}) => {
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [isSwitching, setIsSwitching] = useState(false); // 控制全屏遮罩
    const [welcomeToast, setWelcomeToast] = useState<string | null>(null); // 欢迎文本

    // 处理切换逻辑
    const handleSwitch = async (uid: string) => {
        setShowAccountModal(false);
        setIsSwitching(true); // 显示遮罩

        // 模拟网络请求/加载过程 (1.5秒)
        setTimeout(() => {
            userSystem.switchUser(uid);
            setIsSwitching(false); // 关闭遮罩

            // 显示欢迎 Toast
            // 注意：userSystem.switchUser 是同步更新 state，
            // 但 profile 更新需要一点时间，这里我们直接从 list 里找名字显示
            const targetUser = userSystem.userList.find(u => u.uid === uid);
            const name = targetUser ? targetUser.displayName : 'Analyst';
            setWelcomeToast(`欢迎回来, ${name}`);

            // 3秒后关闭 Toast
            setTimeout(() => setWelcomeToast(null), 3000);
        }, 1500);
    };

    return (
        <div className="w-full h-screen bg-transparent text-white flex flex-col items-center justify-end pb-12 relative overflow-hidden font-sans select-none z-10">

            {mode === 'title' ? (
                <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] pointer-events-none animate-pulse-slow"></div>
            ) : (
                <div className="absolute inset-0 bg-black z-0"></div> // 模式选择页纯黑背景
            )}
            {/* [新增] 右上角返回按钮 (仅在模式选择页显示) */}
            {mode === 'mode_select' && onBack && (
                <button
                    onClick={() => {
                        eventBus.emit(GameEvents.UI_BACK); // 触发撤回音效
                        onBack();
                    }}
                    className="absolute top-8 right-8 z-[999] p-3 rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/50 transition-all group"
                >
                    <ArrowLeft size={24} className="text-gray-400 group-hover:text-white transition-colors" />
                </button>
            )}

            {/* --- 左上角账户按钮 --- */}
            {mode === 'title' && (
                <button
                    onClick={() => setShowAccountModal(true)}
                    className="absolute top-4 left-4 z-[50] flex items-center gap-2 px-4 py-2 bg-black/40 hover:bg-white/10 rounded-full border border-white/10 hover:border-white/30 transition-all text-xs font-mono text-gray-400 hover:text-white group"
                >
                    <UserCircle size={16} className="text-blue-400 group-hover:text-white transition-colors" />
                    {userSystem.profile?.displayName || 'GUEST ACCOUNT'}
                </button>
            )}

            {/* --- 弹窗组件 --- */}
            {showAccountModal && (
                <AccountSelectionModal
                    currentUserUid={userSystem.userId}
                    userList={userSystem.userList}
                    onConfirmSwitch={handleSwitch}
                    onDeleteUser={userSystem.deleteUser}
                    onCreateUser={userSystem.createNewUser}
                    onClose={() => setShowAccountModal(false)}
                />
            )}

            {/* --- 切换账号时的全屏遮罩 (Loading) --- */}
            <AnimatePresence>
                {isSwitching && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[2000] bg-black flex flex-col items-center justify-center gap-4"
                    >
                        <RefreshCw size={48} className="text-blue-500 animate-spin" />
                        <span className="text-blue-200 font-mono tracking-widest text-sm animate-pulse">SWITCHING ACCOUNT...</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- 欢迎回来 Toast --- */}
            <AnimatePresence>
                {welcomeToast && (
                    <motion.div
                        initial={{ y: -100, opacity: 0 }}
                        animate={{ y: 20, opacity: 1 }}
                        exit={{ y: -100, opacity: 0 }}
                        className="fixed top-0 left-1/2 -translate-x-1/2 z-[1500] px-8 py-3 bg-white text-black font-bold rounded-full shadow-[0_10px_30px_rgba(255,255,255,0.3)] flex items-center gap-3 border-2 border-blue-500"
                    >
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        {welcomeToast}
                    </motion.div>
                )}
            </AnimatePresence>

            {mode === 'title' ? (
                /* --- 模式 A: 标题页 (保持不变) --- */
                <div className="flex flex-col items-center animate-fade-in-up z-20 pb-20">
                    <img src={UI_IMAGES.titleLogo} className="w-[450px] mb-8 drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]" alt="Snowbreak Rivals" />

                    <button
                        onClick={() => {
                            eventBus.emit(GameEvents.GAME_START);
                            if (onTitleStartClick) onTitleStartClick();
                        }}
                        className="group relative px-12 py-4 bg-transparent overflow-hidden rounded-full transition-all hover:scale-105"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 opacity-80 group-hover:opacity-100 transition-opacity"></div>
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30"></div>
                        <span className="relative z-10 text-xl font-black tracking-[0.3em] flex items-center gap-4">
                            <Sword className="fill-white" /> START GAME
                        </span>
                    </button>

                    <div className="mt-8 text-xs text-gray-500 font-mono tracking-widest">
                        PRESS START TO INITIALIZE NEURO-LINK
                    </div>
                </div>
            ) : (
                /* --- 模式 B: 模式选择页 (全新重构) --- */
                <div className="w-full h-full flex flex-col items-center justify-center animate-fade-in z-20 relative">

                    <h2 className="absolute top-12 text-4xl font-black tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 drop-shadow-lg">
                        SELECT OPERATION
                    </h2>

                    {/* [核心布局] 3x3 网格布局实现环绕效果 */}
                    <div className="grid grid-cols-3 grid-rows-3 gap-6 w-full max-w-6xl h-[65vh] p-8 items-center justify-items-center">

                        {/* 1. 左上角: PvE (可用) */}
                        <div className="col-start-1 row-start-1 w-full h-full flex justify-end items-end">
                            <div
                                onClick={() => {
                                    eventBus.emit(GameEvents.UI_CLICK);
                                    if (onPvESelect) onPvESelect();
                                    else if (onEnterModeSelect) onEnterModeSelect();
                                }}
                                className="w-64 h-40 group relative bg-gradient-to-br from-blue-900/60 to-slate-900/60 border border-blue-400/30 rounded-2xl overflow-hidden hover:border-blue-400 hover:bg-blue-900/80 transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(59,130,246,0.4)] cursor-pointer flex flex-col items-center justify-center gap-2"
                            >
                                <Sword size={40} className="text-blue-400 group-hover:text-white transition-colors" />
                                <div className="text-center">
                                    <h3 className="text-xl font-black tracking-widest text-blue-100 group-hover:text-white">PvE</h3>
                                    <p className="text-[10px] font-mono text-blue-300/60">SIMULATION</p>
                                </div>
                                {/* 装饰角标 */}
                                <div className="absolute top-0 left-0 w-full h-1 bg-blue-500/50 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></div>
                            </div>
                        </div>

                        {/* 2. 右上角: Roguelike (肉鸽) - 占位 */}
                        <div className="col-start-3 row-start-1 w-full h-full flex justify-start items-end">
                            <div className="w-64 h-40 group relative bg-slate-800/40 border border-white/5 rounded-2xl overflow-hidden grayscale opacity-60 cursor-not-allowed flex flex-col items-center justify-center gap-2 hover:opacity-80 transition-opacity">
                                <Dices size={40} className="text-purple-400" />
                                <div className="text-center">
                                    <h3 className="text-xl font-black tracking-widest text-gray-400">ROGUE</h3>
                                    <p className="text-[10px] font-mono text-gray-600">LABYRINTH</p>
                                </div>
                                <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                                    <span className="text-xs font-mono font-bold text-white/80">LOCKED</span>
                                </div>
                            </div>
                        </div>

                        {/* 3. 中心: PvP (核心模式) - 占位 */}
                        <div className="col-start-2 row-start-2 w-full h-full flex justify-center items-center z-30">
                            <div className="w-80 h-80 group relative bg-gradient-to-b from-red-900/40 to-black/60 border-2 border-red-500/30 rounded-full overflow-hidden grayscale opacity-80 hover:opacity-100 hover:border-red-500 transition-all hover:scale-105 cursor-not-allowed shadow-2xl flex flex-col items-center justify-center gap-4">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.2),transparent)] opacity-50 group-hover:opacity-100 animate-pulse-slow"></div>
                                <Swords size={80} className="text-red-500 drop-shadow-[0_0_10px_rgba(220,38,38,0.8)]" />
                                <div className="text-center z-10">
                                    <h3 className="text-4xl font-black tracking-tighter text-red-100 drop-shadow-md">PvP</h3>
                                    <p className="text-xs font-mono text-red-400/80 tracking-[0.5em] mt-2">ARENA</p>
                                </div>
                                <div className="absolute bottom-12 px-4 py-1 bg-black/60 rounded-full border border-white/10 text-[10px] text-gray-400 font-mono">
                                    COMING SOON
                                </div>
                            </div>
                        </div>

                        {/* 4. 左下角: BOSS (挑战) - 占位 */}
                        <div className="col-start-1 row-start-3 w-full h-full flex justify-end items-start">
                            <div className="w-64 h-40 group relative bg-slate-800/40 border border-white/5 rounded-2xl overflow-hidden grayscale opacity-60 cursor-not-allowed flex flex-col items-center justify-center gap-2 hover:opacity-80 transition-opacity">
                                <Skull size={40} className="text-red-400" />
                                <div className="text-center">
                                    <h3 className="text-xl font-black tracking-widest text-gray-400">BOSS</h3>
                                    <p className="text-[10px] font-mono text-gray-600">CHALLENGE</p>
                                </div>
                                <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                                    <span className="text-xs font-mono font-bold text-white/80">LOCKED</span>
                                </div>
                            </div>
                        </div>

                        {/* 5. 右下角: Tutorial (教程) - 占位 */}
                        <div className="col-start-3 row-start-3 w-full h-full flex justify-start items-start">
                            <div className="w-64 h-40 group relative bg-slate-800/40 border border-white/5 rounded-2xl overflow-hidden grayscale opacity-60 cursor-not-allowed flex flex-col items-center justify-center gap-2 hover:opacity-80 transition-opacity">
                                <BookOpen size={40} className="text-yellow-400" />
                                <div className="text-center">
                                    <h3 className="text-xl font-black tracking-widest text-gray-400">TUTORIAL</h3>
                                    <p className="text-[10px] font-mono text-gray-600">ACADEMY</p>
                                </div>
                                <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                                    <span className="text-xs font-mono font-bold text-white/80">LOCKED</span>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* [修改] 底部按钮改为返回 (功能同右上角) */}
                    <button
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_BACK);
                            if (onBack) onBack();
                        }}
                        className="absolute bottom-12 text-gray-500 hover:text-white transition-colors font-mono text-sm border-b border-transparent hover:border-white/50"
                    >
                        BACK TO LOBBY
                    </button>
                </div>
            )}
        </div>
    );
};