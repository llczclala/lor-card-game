import React, { useState } from 'react';
import { Sword, UserCircle, RefreshCw } from 'lucide-react';
import { eventBus, GameEvents } from '../utils/eventBus';
import { UI_IMAGES } from '../data/imageData';
import { motion, AnimatePresence } from 'framer-motion';
import { AccountSelectionModal } from './AccountSelectionModal';
import type { useUserSystem } from '../hooks/useUserSystem';
import chengAvatar from '../image/icon/CQWRSZDSA432.jpg'; // [哨兵] 程的头像

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
                <img src={UI_IMAGES.titleLogo} className="w-[450px] mb-8 drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]" alt="尘白禁区 Rivals" />

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

                {/* [哨兵] 程的头像 & B站链接 */}
                <div className="mt-10 flex items-center justify-center gap-5 opacity-60 hover:opacity-100 transition-opacity duration-300">
                    {/* 头像 */}
                    <img
                        src={chengAvatar}
                        className="w-14 h-14 rounded-full object-cover border border-white/20 ring-2 ring-white/10"
                        alt="大话丶EZ"
                        title="独立开发者：大话丶EZ"
                    />
                    {/* B站小电视按钮 */}
                    <a
                        href="https://space.bilibili.com/45083978?spm_id_from=333.1007.0.0"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 hover:bg-pink-600/20 border border-white/10 hover:border-pink-400/40 transition-all group"
                        title="B站主页：大话丶EZ"
                    >
                        {/* B站小电视 SVG */}
                        <svg
                            viewBox="0 0 24 24"
                            className="w-7 h-7 fill-current text-white/60 group-hover:text-pink-400 transition-colors"
                        >
                            <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.559 3.76v7.36c-.035 1.51-.555 2.765-1.559 3.761-1.004.995-2.263 1.519-3.773 1.574H5.333c-1.51-.055-2.769-.579-3.773-1.574C.556 20.112.036 18.857 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.263-1.52 3.773-1.574h.854L4.134 1.91a.428.428 0 01.058-.488.468.468 0 01.354-.168.467.467 0 01.373.158L7.2 4.653h9.6l2.281-3.241a.467.467 0 01.373-.158.468.468 0 01.354.168.428.428 0 01.058.488l-2.053 2.743zm-2.453 6.507c.211 0 .395-.075.554-.224a.742.742 0 00.229-.546.742.742 0 00-.229-.547.765.765 0 00-.554-.223c-.211 0-.394.074-.553.223a.742.742 0 00-.23.547c0 .22.077.404.23.546.159.15.342.224.553.224zm-6.72 0c.212 0 .396-.075.555-.224a.742.742 0 00.229-.546.742.742 0 00-.229-.547.765.765 0 00-.554-.223c-.212 0-.395.074-.554.223a.742.742 0 00-.23.547c0 .22.077.404.23.546.159.15.343.224.554.224zm5.253 1.973c-.264-.232-.594-.348-.99-.348-.396 0-.726.116-.99.348-.264.232-.396.537-.396.914 0 .377.132.682.396.914.264.232.594.348.99.348.396 0 .726-.116.99-.348.264-.232.396-.537.396-.914 0-.377-.132-.682-.396-.914zM12 17.733c1.912 0 3.507-.442 4.787-1.326a4.6 4.6 0 001.746-1.86.467.467 0 00-.186-.605.475.475 0 00-.6.177 3.722 3.722 0 01-1.4 1.498c-1.092.694-2.395 1.041-3.907 1.041-1.512 0-2.815-.347-3.907-1.041a3.722 3.722 0 01-1.4-1.498.475.475 0 00-.6-.177.467.467 0 00-.186.605 4.6 4.6 0 001.746 1.86c1.28.884 2.875 1.326 4.787 1.326z"/>
                        </svg>
                        <span className="text-sm text-white/40 group-hover:text-pink-300 transition-colors tracking-wider font-medium">
                            大话丶EZ
                        </span>
                    </a>
                </div>
            </div>
        </div>
    );
};