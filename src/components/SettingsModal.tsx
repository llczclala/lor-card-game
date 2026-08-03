import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { eventBus, GameEvents } from '../utils/eventBus';
import { X, Music, Volume2, Mic, Film, VolumeX, Settings as SettingsIcon, Power, RotateCw, Home } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    // 音量控制回调 (0.0 - 1.0)
    volumes: {
        bgm: number;
        sfx: number;
        voice: number;
        movie: number;
    };
    onVolumeChange: (type: 'bgm' | 'sfx' | 'voice' | 'movie', value: number) => void;
    // [新增] 画质控制回调
    videoResolution?: '1k' | '2k' | '4k';
    onResolutionChange?: (res: '1k' | '2k' | '4k') => void;
    // [新增] 开局抽卡动画跳过开关
    skipStartDrawAnimation?: boolean;
    onToggleSkipDraw?: () => void;
    // [新增] 默认跳过升级影片
    skipLevelupMovie?: boolean;
    onToggleSkipLevelup?: () => void;
    // [新增] 默认跳过胜利影片
    skipVictoryMovie?: boolean;
    onToggleSkipVictory?: () => void;
    // [新增] 对局操作
    isInGame?: boolean;
    onRestartMatch?: () => void;
    onReturnToLobby?: () => void;
}

const VolumeSlider = ({ label, icon: Icon, value, onChange }: { label: string, icon: any, value: number, onChange: (val: number) => void }) => {
    const [lastValue, setLastValue] = useState(value > 0 ? value : 0.5);

    const handleMuteToggle = () => {
        eventBus.emit(GameEvents.UI_CLICK); // [新增] 点击音效
        if (value > 0) {
            setLastValue(value);
            onChange(0);
        } else {
            onChange(lastValue);
        }
    };

    return (
        <div className="flex items-center gap-6 p-4 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
            {/* 左侧：图标与标签 */}
            <div className="flex items-center gap-4 w-32">
                <button
                    onClick={handleMuteToggle}
                    className={`p-2 rounded-full transition-colors ${value === 0 ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}
                >
                    {value === 0 ? <VolumeX size={20} /> : <Icon size={20} />}
                </button>
                <span className="font-bold text-sm tracking-wider text-gray-300">{label}</span>
            </div>

            {/* 中间：滑块 */}
            <div className="flex-1 relative h-2 bg-gray-700 rounded-full group cursor-pointer">
                {/* 进度条背景 */}
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    // [新增] 只有在松开鼠标/手指时才播放音效，避免拖动时噪音过于密集
                    onMouseUp={() => eventBus.emit(GameEvents.UI_CLICK)}
                    onTouchEnd={() => eventBus.emit(GameEvents.UI_CLICK)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                />
                <div
                    className="absolute left-0 top-0 h-full bg-blue-500 rounded-full transition-all group-hover:bg-blue-400"
                    style={{ width: `${value * 100}%` }}
                ></div>
                {/* 滑块圆点 */}
                <div
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg transition-all group-hover:scale-125 pointer-events-none z-10"
                    style={{ left: `${value * 100}%`, transform: 'translate(-50%, -50%)' }}
                ></div>
            </div>

            {/* 右侧：数值 */}
            <div className="w-12 text-right font-mono font-bold text-blue-200">
                {Math.round(value * 100)}%
            </div>
        </div>
    );
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, volumes, onVolumeChange, videoResolution = '1k', onResolutionChange, skipStartDrawAnimation = false, onToggleSkipDraw, skipLevelupMovie = false, onToggleSkipLevelup, skipVictoryMovie = false, onToggleSkipVictory, isInGame = false, onRestartMatch, onReturnToLobby }) => {

    // ESC 键监听
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                eventBus.emit(GameEvents.UI_BACK); // [新增] 关闭音效
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const handleExitGame = () => {
        eventBus.emit(GameEvents.UI_CLICK);
        // 在 Electron (nodeIntegration: true) 环境下，这会直接关闭窗口并退出应用
        window.close();
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in" onClick={() => {
                    eventBus.emit(GameEvents.UI_BACK); // [新增] 点击背景关闭音效
                    onClose();
                }}>
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        className="w-full max-w-2xl bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* 标题栏 */}
                        <div className="flex justify-between items-center px-8 py-6 border-b border-white/10 bg-white/5">
                            <h2 className="text-2xl font-black italic tracking-widest text-white flex items-center gap-3">
                                <SettingsIcon size={24} className="text-blue-500" />
                                系统设置
                            </h2>
                            <button
                                onClick={() => {
                                    eventBus.emit(GameEvents.UI_BACK); // [新增] 关闭音效
                                    onClose();
                                }}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* 内容区 */}
                        <div className="p-8 space-y-6">
                            <div className="space-y-4">
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Audio Volume</h3>

                                <VolumeSlider
                                    label="音乐"
                                    icon={Music}
                                    value={volumes.bgm}
                                    onChange={(v) => onVolumeChange('bgm', v)}
                                />
                                <VolumeSlider
                                    label="音效"
                                    icon={Volume2}
                                    value={volumes.sfx}
                                    onChange={(v) => onVolumeChange('sfx', v)}
                                />
                                <VolumeSlider
                                    label="语音"
                                    icon={Mic}
                                    value={volumes.voice}
                                    onChange={(v) => onVolumeChange('voice', v)}
                                />
                                <VolumeSlider
                                    label="过场"
                                    icon={Film}
                                    value={volumes.movie}
                                    onChange={(v) => onVolumeChange('movie', v)}
                                />
                            </div>

                            {/* [核心新增] 影片画质设置 (Video Resolution) */}
                            {onResolutionChange && (
                                <div className="space-y-4 pt-4 border-t border-white/5">
                                    <div className="flex justify-between items-center px-2">
                                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Video Quality</h3>
                                    </div>
                                    <div className="flex bg-black/60 p-1 rounded-xl border border-white/5">
                                        {(['1k', '2k', '4k'] as const).map(res => (
                                            <button
                                                key={res}
                                                onClick={() => {
                                                    eventBus.emit(GameEvents.UI_CLICK);
                                                    onResolutionChange(res);
                                                }}
                                                className={`flex-1 py-2.5 text-sm font-black tracking-widest rounded-lg transition-all ${videoResolution === res ? 'bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-900/50' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                                            >
                                                {res.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* [新增] 开局抽卡动画跳过 + 默认跳过升级/胜利影片 */}
                            <div className="space-y-4 pt-4 border-t border-white/5">
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Gameplay</h3>
                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-gray-200">快速开局抽卡</span>
                                        <span className="text-xs text-gray-500 mt-0.5">换牌后直接获得卡牌，跳过抽卡动画</span>
                                    </div>
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onToggleSkipDraw?.(); }}
                                        className={`relative w-14 h-7 rounded-full transition-all duration-300 ${skipStartDrawAnimation ? 'bg-blue-500' : 'bg-gray-700'}`}
                                    >
                                        <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${skipStartDrawAnimation ? 'left-8' : 'left-1'}`}></div>
                                    </button>
                                </div>
                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-gray-200">默认跳过升级影片</span>
                                        <span className="text-xs text-gray-500 mt-0.5">英雄升级时自动跳过动画影片</span>
                                    </div>
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onToggleSkipLevelup?.(); }}
                                        className={`relative w-14 h-7 rounded-full transition-all duration-300 ${skipLevelupMovie ? 'bg-blue-500' : 'bg-gray-700'}`}
                                    >
                                        <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${skipLevelupMovie ? 'left-8' : 'left-1'}`}></div>
                                    </button>
                                </div>
                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-gray-200">默认跳过胜利影片</span>
                                        <span className="text-xs text-gray-500 mt-0.5">对局胜利时自动跳过胜利动画影片</span>
                                    </div>
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onToggleSkipVictory?.(); }}
                                        className={`relative w-14 h-7 rounded-full transition-all duration-300 ${skipVictoryMovie ? 'bg-blue-500' : 'bg-gray-700'}`}
                                    >
                                        <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${skipVictoryMovie ? 'left-8' : 'left-1'}`}></div>
                                    </button>
                                </div>
                            </div>

                            {/* 底部功能区 */}
                            <div className="pt-6 border-t border-white/10 flex justify-between items-center mt-6">
                                <div className="flex items-center gap-3">
                                    {isInGame && (
                                        <>
                                        <button
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onRestartMatch?.(); }}
                                            className="flex items-center gap-2 px-5 py-2 bg-yellow-900/30 hover:bg-yellow-600 border border-yellow-800 hover:border-yellow-500 text-yellow-200 hover:text-white rounded-full transition-all text-sm font-bold tracking-wider group"
                                        >
                                            <RotateCw size={16} className="group-hover:scale-110 transition-transform" />
                                            重开对局
                                        </button>
                                        <button
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onReturnToLobby?.(); }}
                                            className="flex items-center gap-2 px-5 py-2 bg-blue-900/30 hover:bg-blue-600 border border-blue-800 hover:border-blue-500 text-blue-200 hover:text-white rounded-full transition-all text-sm font-bold tracking-wider group"
                                        >
                                            <Home size={16} className="group-hover:scale-110 transition-transform" />
                                            返回大厅
                                        </button>
                                        </>
                                    )}
                                </div>

                                <button
                                    onClick={handleExitGame}
                                    className="flex items-center gap-2 px-6 py-2 bg-red-900/30 hover:bg-red-600 border border-red-800 hover:border-red-500 text-red-200 hover:text-white rounded-full transition-all text-sm font-bold tracking-wider group"
                                >
                                    <Power size={16} className="group-hover:scale-110 transition-transform" />
                                    QUIT GAME
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};