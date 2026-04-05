import React from 'react';
import { Sword, Dices, Swords, Skull, BookOpen, ArrowLeft } from 'lucide-react';
import { eventBus, GameEvents } from '../utils/eventBus';

interface ModeSelectScreenProps {
    onPvESelect: () => void;
    onBack: () => void;
}

export const ModeSelectScreen: React.FC<ModeSelectScreenProps> = ({
    onPvESelect,
    onBack
}) => {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center animate-fade-in z-20 relative font-sans select-none text-white">

            {/* 纯黑背景 (复刻原 TitleScreen 的 mode check else 分支) */}
            <div className="absolute inset-0 bg-black z-0"></div>

            {/* 右上角返回按钮 */}
            <button
                onClick={() => {
                    eventBus.emit(GameEvents.UI_BACK); // 触发撤回音效
                    onBack();
                }}
                className="absolute top-8 right-8 z-[999] p-3 rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/50 transition-all group"
            >
                <ArrowLeft size={24} className="text-gray-400 group-hover:text-white transition-colors" />
            </button>

            {/* 标题 */}
            <h2 className="absolute top-12 text-4xl font-black tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 drop-shadow-lg z-30">
                模式选择
            </h2>

            {/* [核心布局] 3x3 网格布局实现环绕效果 */}
            <div className="grid grid-cols-3 grid-rows-3 gap-6 w-full max-w-6xl h-[65vh] p-8 items-center justify-items-center z-20">

                {/* 1. 左上角: PvE (可用) */}
                <div className="col-start-1 row-start-1 w-full h-full flex justify-end items-end">
                    <div
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_CLICK);
                            onPvESelect();
                        }}
                        className="w-64 h-40 group relative bg-gradient-to-br from-blue-900/60 to-slate-900/60 border border-blue-400/30 rounded-2xl overflow-hidden hover:border-blue-400 hover:bg-blue-900/80 transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(59,130,246,0.4)] cursor-pointer flex flex-col items-center justify-center gap-2"
                    >
                        <Sword size={40} className="text-blue-400 group-hover:text-white transition-colors" />
                        <div className="text-center">
                            <h3 className="text-xl font-black tracking-widest text-blue-100 group-hover:text-white">地下清理</h3>
                            <p className="text-[10px] font-mono text-blue-300/60">开始一场人机对局</p>
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
                            <h3 className="text-xl font-black tracking-widest text-gray-400">悖论迷宫</h3>
                            <p className="text-[10px] font-mono text-gray-600">点击开启推演</p>
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
                            <h3 className="text-4xl font-black tracking-tighter text-red-100 drop-shadow-md">超元链接</h3>
                            <p className="text-xs font-mono text-red-400/80 tracking-[0.5em] mt-2">开始一场真人对局</p>
                        </div>
                        <div className="absolute bottom-12 px-4 py-1 bg-black/60 rounded-full border border-white/10 text-[10px] text-gray-400 font-mono">
                            绝赞开发中。。。
                        </div>
                    </div>
                </div>

                {/* 4. 左下角: BOSS (挑战) - 占位 */}
                <div className="col-start-1 row-start-3 w-full h-full flex justify-end items-start">
                    <div className="w-64 h-40 group relative bg-slate-800/40 border border-white/5 rounded-2xl overflow-hidden grayscale opacity-60 cursor-not-allowed flex flex-col items-center justify-center gap-2 hover:opacity-80 transition-opacity">
                        <Skull size={40} className="text-red-400" />
                        <div className="text-center">
                            <h3 className="text-xl font-black tracking-widest text-gray-400">精神拟境</h3>
                            <p className="text-[10px] font-mono text-gray-600">紧张刺激的BOSS战</p>
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
                            <h3 className="text-xl font-black tracking-widest text-gray-400">战术考核</h3>
                            <p className="text-[10px] font-mono text-gray-600">学习各种操作战术技巧</p>
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                            <span className="text-xs font-mono font-bold text-white/80">LOCKED</span>
                        </div>
                    </div>
                </div>

            </div>

            {/* 底部返回按钮 */}
            <button
                onClick={() => {
                    eventBus.emit(GameEvents.UI_BACK);
                    onBack();
                }}
                className="absolute bottom-12 text-gray-500 hover:text-white transition-colors font-mono text-sm border-b border-transparent hover:border-white/50 z-30"
            >
                返回大厅
            </button>
        </div>
    );
};