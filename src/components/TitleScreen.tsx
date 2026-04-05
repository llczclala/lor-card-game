import React, { useState } from 'react';
import { Sword, UserCircle, RefreshCw } from 'lucide-react';
import { eventBus, GameEvents } from '../utils/eventBus';
import { UI_IMAGES } from '../data/imageData';
import { motion, AnimatePresence } from 'framer-motion';
import { AccountSelectionModal } from './AccountSelectionModal';
import type { useUserSystem } from '../hooks/useUserSystem';

interface User {
    uid: string;
    displayName: string;
    // 可补充其他属性（如 avatar、createdAt 等，根据实际业务）
}

interface TitleScreenProps {
    onTitleStartClick: () => void;
    userSystem: ReturnType<typeof useUserSystem>;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
    onTitleStartClick,
    userSystem
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
            const targetUser = userSystem.userList.find((u: User) => u.uid === uid);
            const name = targetUser ? targetUser.displayName : 'Analyst';
            setWelcomeToast(`欢迎回来, ${name}`);

            // 3秒后关闭 Toast
            setTimeout(() => setWelcomeToast(null), 3000);
        }, 1500);
    };

    return (
        <div className="w-full h-full bg-transparent text-white flex flex-col items-center justify-end pb-12 relative overflow-hidden font-sans select-none z-10">

            <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] pointer-events-none animate-pulse-slow"></div>

                <button
                    onClick={() => setShowAccountModal(true)}
                    className="absolute top-4 left-4 z-[50] flex items-center gap-2 px-4 py-2 bg-black/40 hover:bg-white/10 rounded-full border border-white/10 hover:border-white/30 transition-all text-xs font-mono text-gray-400 hover:text-white group"
                >
                    <UserCircle size={16} className="text-blue-400 group-hover:text-white transition-colors" />
                    {userSystem.profile?.displayName || 'GUEST ACCOUNT'}
                </button>

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

            {/* --- 标题页核心内容 --- */}
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
                        <Sword className="fill-white" /> 开始游戏
                    </span>
                </button>

                <div className="mt-8 text-xs text-gray-500 font-mono tracking-widest">
                    PRESS START TO INITIALIZE NEURO-LINK
                </div>
            </div>
        </div>
    );
};