import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { eventBus, GameEvents } from '../utils/eventBus';
import { X, Music, Volume2, Mic, Film, VolumeX, Settings as SettingsIcon, Power, RotateCw, Home, Swords, RotateCcw } from 'lucide-react';

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
    // [2026-08-13] 动态牌桌开关
    deskDynamic?: boolean;
    onToggleDeskDynamic?: () => void;
    // [2026-08-16] 天启者动态卡面开关
    heroDynamic?: boolean;
    onToggleHeroDynamic?: () => void;
    // [2026-08-16] 恢复默认设置（系统标签页入口）
    onResetSettings?: () => void;
    // [新增] 对局操作
    isInGame?: boolean;
    onRestartMatch?: () => void;
    onReturnToLobby?: () => void;
}

// 设置标签页类型
type SettingsTab = 'audio' | 'video' | 'game' | 'system';

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

// [2026-08-16] 通用开关行（标题 + 描述 + 右侧 toggle），避免多个设置项重复 JSX
const ToggleRow = ({ title, desc, enabled, onToggle }: { title: string; desc: string; enabled: boolean; onToggle?: () => void }) => (
    <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
        <div className="flex flex-col">
            <span className="text-sm font-bold text-gray-200">{title}</span>
            <span className="text-xs text-gray-500 mt-0.5">{desc}</span>
        </div>
        <button
            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onToggle?.(); }}
            className={`relative w-14 h-7 rounded-full transition-all duration-300 ${enabled ? 'bg-blue-500' : 'bg-gray-700'}`}
        >
            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${enabled ? 'left-8' : 'left-1'}`}></div>
        </button>
    </div>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, volumes, onVolumeChange, videoResolution = '1k', onResolutionChange, skipStartDrawAnimation = false, onToggleSkipDraw, skipLevelupMovie = false, onToggleSkipLevelup, skipVictoryMovie = false, onToggleSkipVictory, deskDynamic = false, onToggleDeskDynamic, heroDynamic = false, onToggleHeroDynamic, onResetSettings, isInGame = false, onRestartMatch, onReturnToLobby }) => {

    // [2026-08-16] 当前激活的标签页
    const [activeTab, setActiveTab] = useState<SettingsTab>('audio');

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

    // [2026-08-16] 左侧标签栏定义（图标 + 文字，按游戏尺度分组）
    const TABS: { key: SettingsTab; label: string; icon: any }[] = [
        { key: 'audio', label: '音频', icon: Volume2 },
        { key: 'video', label: '画面', icon: Film },
        { key: 'game', label: '游戏', icon: Swords },
        { key: 'system', label: '系统', icon: SettingsIcon },
    ];

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 z-[1000] bg-[#0f172a] flex flex-col overflow-hidden"
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

                        {/* [2026-08-16 重构] 主体：左侧标签栏 + 中间内容区（flex-1 min-h-0 保证内容区可滚动不撑高） */}
                        <div className="flex flex-1 min-h-0">
                            {/* 左侧标签栏 */}
                            <div className="w-44 shrink-0 border-r border-white/10 p-4 space-y-1 bg-black/20 overflow-y-auto">
                                {TABS.map(tab => (
                                    <button
                                        key={tab.key}
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setActiveTab(tab.key); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold tracking-widest transition-all ${
                                            activeTab === tab.key
                                                ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30 shadow-lg shadow-blue-900/30'
                                                : 'text-gray-400 hover:bg-white/5 hover:text-white border border-transparent'
                                        }`}
                                    >
                                        <tab.icon size={18} />
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* 中间内容区：随标签切换（AnimatePresence 淡入过渡）；条目多时内部鼠标滚轮滚动，不撑高面板 */}
                            <div className="flex-1 p-6 overflow-y-auto min-h-0">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={activeTab}
                                        initial={{ opacity: 0, x: 12 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -12 }}
                                        transition={{ duration: 0.15 }}
                                        className="space-y-6"
                                    >
                                        {/* ========== 音频标签 ========== */}
                                        {activeTab === 'audio' && (
                                            <div className="space-y-4">
                                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Audio Volume</h3>
                                                <VolumeSlider label="音乐" icon={Music} value={volumes.bgm} onChange={(v) => onVolumeChange('bgm', v)} />
                                                <VolumeSlider label="音效" icon={Volume2} value={volumes.sfx} onChange={(v) => onVolumeChange('sfx', v)} />
                                                <VolumeSlider label="语音" icon={Mic} value={volumes.voice} onChange={(v) => onVolumeChange('voice', v)} />
                                                <VolumeSlider label="过场" icon={Film} value={volumes.movie} onChange={(v) => onVolumeChange('movie', v)} />
                                            </div>
                                        )}

                                        {/* ========== 画面标签 ========== */}
                                        {activeTab === 'video' && (
                                            <>
                                                {onResolutionChange && (
                                                    <div className="space-y-4">
                                                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Video Quality</h3>
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
                                                <div className="space-y-4 pt-2">
                                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">动态特效</h3>
                                                    <ToggleRow title="动态牌桌" desc="使用动态视频牌桌（10 张牌桌全部支持）" enabled={deskDynamic} onToggle={onToggleDeskDynamic} />
                                                    <ToggleRow title="动态卡面" desc="对局内英雄卡面使用动态视频（5 位天启者全部支持）" enabled={heroDynamic} onToggle={onToggleHeroDynamic} />
                                                </div>
                                            </>
                                        )}

                                        {/* ========== 游戏标签 ========== */}
                                        {activeTab === 'game' && (
                                            <div className="space-y-4">
                                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Gameplay</h3>
                                                <ToggleRow title="快速开局抽卡" desc="换牌后直接获得卡牌，跳过抽卡动画" enabled={skipStartDrawAnimation} onToggle={onToggleSkipDraw} />
                                                <ToggleRow title="默认跳过升级影片" desc="英雄升级时自动跳过动画影片" enabled={skipLevelupMovie} onToggle={onToggleSkipLevelup} />
                                                <ToggleRow title="默认跳过胜利影片" desc="对局胜利时自动跳过胜利动画影片" enabled={skipVictoryMovie} onToggle={onToggleSkipVictory} />
                                            </div>
                                        )}

                                        {/* ========== 系统标签 ========== */}
                                        {activeTab === 'system' && (
                                            <div className="space-y-4">
                                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">System</h3>
                                                <div className="flex flex-col items-center justify-center gap-4 p-8 bg-white/5 rounded-xl border border-white/5">
                                                    <p className="text-sm text-gray-400">
                                                        当前版本 <span className="text-blue-300 font-black tracking-widest ml-1">v{import.meta.env.PACKAGE_VERSION}</span>
                                                    </p>
                                                    <button
                                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onResetSettings?.(); }}
                                                        className="flex items-center gap-2 px-5 py-2.5 bg-red-900/30 hover:bg-red-600 border border-red-800 hover:border-red-500 text-red-200 hover:text-white rounded-xl transition-all text-sm font-bold tracking-wider group"
                                                    >
                                                        <RotateCcw size={16} className="group-hover:scale-110 transition-transform" />
                                                        恢复默认设置
                                                    </button>
                                                    <p className="text-xs text-gray-500">将重置音频、画面、游戏等所有设置为初始值</p>
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* 底部功能区（固定，始终可见） */}
                        <div className="px-6 py-4 border-t border-white/10 flex justify-between items-center bg-black/20">
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
                </motion.div>
            )}
        </AnimatePresence>
    );
};
