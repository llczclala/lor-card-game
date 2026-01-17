import React, { useState } from 'react';
import { Settings, RefreshCw, Eye, EyeOff, Sword, Hexagon, Plus } from 'lucide-react';
import { eventBus, GameEvents } from '../utils/eventBus';
import { motion, AnimatePresence } from 'framer-motion';
import { useUserSystem } from '../hooks/useUserSystem';
import { HERO_IMAGES, CURRENCY_ICONS } from '../data/imageData';

interface GameLobbyProps {
    userSystem: ReturnType<typeof useUserSystem>;
    onStartBattle: () => void;   // 点击“开战”
    onSwitchVideo: () => void;   // 点击左下角切换视频
    onOpenSettings: () => void;  // 点击设置齿轮 (暂留接口)
    // [新增] 抽卡回调
    onGachaClick: () => void;
}

export const GameLobby: React.FC<GameLobbyProps> = ({
    userSystem,
    onStartBattle,
    onSwitchVideo,
    onOpenSettings,
    onGachaClick // [新增]
}) => {
    // UI 显隐状态
    const [showUI, setShowUI] = useState(true);

    const { profile, collection} = userSystem;

    // 获取头像图片 (默认里芙)
    const avatarUrl = profile ? HERO_IMAGES[profile.avatarId as keyof typeof HERO_IMAGES]?.base : HERO_IMAGES['lyfe'].base;

    const res = {
        silverCoin: 0,
        dataGold: 0,
        bitGold: 0,
        ...(collection?.resources || {})
    };


    return (
        <div className="relative w-full h-screen font-sans select-none overflow-hidden">
            {/* 1. 左上角：用户信息栏 */}
            <AnimatePresence>
                {showUI && (
                    <motion.div
                        initial={{ x: -100, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -100, opacity: 0 }}
                        className="absolute top-6 left-6 z-20 flex gap-4 items-start"
                    >
                        {/* 头像 */}
                        <div className="relative group cursor-pointer">
                            <div className="w-24 h-24 rounded-full border-4 border-white/20 overflow-hidden shadow-xl bg-black/50 backdrop-blur-sm">
                                <img src={avatarUrl} className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500" alt="Avatar" />
                            </div>
                            <div className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-xs font-black border-2 border-white">
                                {profile?.level || 1}
                            </div>
                        </div>

                        {/* 信息文本 */}
                        <div className="flex flex-col gap-1 mt-2">
                            <div className="text-2xl font-black italic tracking-wider text-white drop-shadow-md">
                                {profile?.displayName || 'ANALYSIS'}
                            </div>
                            <div className="text-xs font-mono text-gray-400 bg-black/40 px-2 py-0.5 rounded w-fit">
                                UID: {profile?.uid.slice(0, 8).toUpperCase() || 'UNKNOWN'}
                            </div>

                            {/* 经验条 */}
                            <div className="w-48 h-2 bg-gray-700/50 rounded-full mt-2 overflow-hidden backdrop-blur-sm border border-white/5">
                                <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 w-1/3 shadow-[0_0_10px_#22d3ee]"></div>
                            </div>
                            <div className="text-[10px] text-gray-400 text-right mt-0.5">EXP 1250 / 3000</div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 2. 右上角：资源栏与设置 */}
            <AnimatePresence>
                {showUI && (
                    <motion.div
                        initial={{ y: -50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -50, opacity: 0 }}
                        className="absolute top-6 right-6 z-20 flex items-center gap-6"
                    >
                        {/* 资源栏 */}
                        <div className="flex gap-4">

                            {/* 1. 通用银 (Silver Coin) */}
                            <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 hover:border-white/30 transition-colors cursor-help group" title="通用银">
                                <img src={CURRENCY_ICONS.silverCoin} className="w-5 h-5 object-contain drop-shadow-md group-hover:scale-110 transition-transform" alt="Silver" />
                                <span className="font-mono font-bold text-white tracking-widest">
                                    {res.silverCoin.toLocaleString()}
                                </span>
                            </div>

                            {/* 2. 数据金 (Data Gold) */}
                            <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-blue-500/20 hover:border-blue-400/50 transition-colors cursor-pointer group" title="数据金">
                                <img src={CURRENCY_ICONS.dataGold} className="w-5 h-5 object-contain drop-shadow-md group-hover:scale-110 transition-transform" alt="Data" />
                                <span className="font-mono font-bold text-blue-100 tracking-widest">
                                    {res.dataGold.toLocaleString()}
                                </span>
                                {/* 加号按钮 */}
                                <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center text-[10px] text-white font-bold ml-1 hover:bg-blue-500">
                                    <Plus size={10} />
                                </div>
                            </div>

                            {/* 3. 比特金 (Bit Gold) */}
                            <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-yellow-500/20 hover:border-yellow-400/50 transition-colors cursor-pointer group" title="比特金">
                                <img src={CURRENCY_ICONS.bitGold} className="w-5 h-5 object-contain drop-shadow-md group-hover:scale-110 transition-transform" alt="Bit" />
                                <span className="font-mono font-bold text-yellow-100 tracking-widest">
                                    {res.bitGold.toLocaleString()}
                                </span>
                                {/* 加号按钮 */}
                                <div className="w-4 h-4 bg-yellow-600 rounded-full flex items-center justify-center text-[10px] text-white font-bold ml-1 hover:bg-yellow-500">
                                    <Plus size={10} />
                                </div>
                            </div>
                        </div>

                        {/* 设置齿轮 */}
                        <button
                            onClick={() => {eventBus.emit(GameEvents.UI_CLICK);onOpenSettings();}}
                            className="p-3 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md transition-all hover:rotate-90 active:scale-95 border border-white/10"
                        >
                            <Settings size={24} className="text-white" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 3. 主要功能入口 (右侧透视按钮) */}
            <AnimatePresence>
                {showUI && (
                    <div className="absolute top-1/2 right-[10%] -translate-y-1/2 z-20 flex flex-col gap-6 perspective-[1000px]">

                        {/* 开战按钮 (Battle) */}
                        <motion.div
                            initial={{ x: 100, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 100, opacity: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            <button
                                onClick={() => {eventBus.emit(GameEvents.LOBBY_START_BATTLE);onStartBattle();}}
                                className="group relative w-64 h-32 transform transition-all duration-300 hover:scale-105 hover:-translate-x-4"
                                style={{ transformStyle: 'preserve-3d', transform: 'rotateY(-15deg)' }}
                            >
                                {/* 按钮主体 */}
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-900 opacity-90 group-hover:opacity-100 border-2 border-blue-400/50 backdrop-blur-md flex items-center justify-center shadow-[0_0_30px_rgba(37,99,235,0.5)] clip-path-slant">
                                    <div className="flex flex-col items-center gap-2">
                                        <Sword size={32} className="text-white fill-white" />
                                        <span className="text-2xl font-black italic tracking-[0.2em] text-white">战斗</span>
                                        <span className="text-[10px] text-blue-200 tracking-widest">作战开始</span>
                                    </div>
                                </div>
                                {/* 装饰性发光边 */}
                                <div className="absolute -inset-1 bg-blue-400/30 blur-md -z-10 group-hover:bg-blue-400/50 transition-colors"></div>
                            </button>
                        </motion.div>

                        {/* [激活] 共鸣按钮 (Gacha) */}
                        <motion.div
                            initial={{ x: 100, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 100, opacity: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            <button
                                onClick={() => {
                                    eventBus.emit(GameEvents.UI_CLICK);
                                    onGachaClick(); // [核心] 触发跳转
                                }}
                                className="group relative w-64 h-32 transform transition-all duration-300 hover:scale-105 hover:-translate-x-4"
                                style={{ transformStyle: 'preserve-3d', transform: 'rotateY(-15deg)' }}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-purple-900 opacity-90 group-hover:opacity-100 border-2 border-purple-400/50 backdrop-blur-md flex items-center justify-center shadow-[0_0_30px_rgba(147,51,234,0.5)]">
                                    <div className="flex flex-col items-center gap-2">
                                        <Hexagon size={32} className="text-white" />
                                        <span className="text-2xl font-black italic tracking-[0.2em] text-white">共鸣</span>
                                        <span className="text-[10px] text-purple-200 tracking-widest">收集卡牌</span>
                                    </div>
                                </div>
                            </button>
                        </motion.div>

                    </div>
                )}
            </AnimatePresence>

            {/* 4. 左下角：背景控制 */}
            <div className="absolute bottom-6 left-6 z-30 flex items-center gap-4 group/controls">
                {/* 显隐控制 (一直显示，但在 showUI=false 时变淡) */}
                <button
                    onClick={() => {eventBus.emit(GameEvents.UI_CLICK); setShowUI(!showUI);}}
                    className={`p-3 rounded-full backdrop-blur-md transition-all border ${showUI ? 'bg-black/40 border-white/10 text-white/50 hover:text-white' : 'bg-transparent border-transparent text-white/20 hover:text-white'}`}
                    title="Toggle UI"
                >
                    {showUI ? <Eye size={20} /> : <EyeOff size={20} />}
                </button>

                {/* 切换背景 (仅在 UI 显示时可见) */}
                <AnimatePresence>
                    {showUI && (
                        <motion.button
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 'auto', opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            onClick={() => {eventBus.emit(GameEvents.UI_CLICK);onSwitchVideo();}}
                            className="flex items-center gap-2 px-4 py-2 bg-black/40 hover:bg-white/10 rounded-full border border-white/10 hover:border-white/30 text-xs font-mono text-gray-400 hover:text-white transition-all overflow-hidden"
                        >
                            <RefreshCw size={14} />
                            <span>切换背景</span>
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};