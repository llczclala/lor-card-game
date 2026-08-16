import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Image as ImageIcon, X, Wrench, Database, Sword } from 'lucide-react';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { ArtStudio } from './ArtStudio';
import { SandboxSession } from './SandboxSession';
import { EnemyDeckEditor } from './EnemyDeckEditor';
import { RogueMapEditor } from '../roguelike/RogueMapEditor';

interface StudioProps {
    onClose: () => void;
}

export const Studio: React.FC<StudioProps> = ({ onClose }) => {
    // 控制左侧抽屉的开关
    const [isDrawerOpen, setIsDrawerOpen] = useState(true);
    // 控制当前激活的工具 (预留接口)
    const [activeTool, setActiveTool] = useState<'art' | 'sandbox' | 'ai' | 'level'>('art');

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-0 z-[999] flex bg-black text-white overflow-hidden font-sans"
        >
            {/* 左侧工具抽屉 (Drawer) */}
            <motion.div
                initial={false}
                animate={{ width: isDrawerOpen ? 280 : 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="relative bg-slate-900 border-r border-white/10 shadow-[10px_0_30px_rgba(0,0,0,0.5)] flex-shrink-0 flex flex-col z-20"
            >
                {/* [修复] 新增 wrapper 控制溢出，恢复外层 motion.div 的 visible 状态使得箭头不被裁切 */}
                <div className="w-full h-full overflow-hidden flex flex-col">
                    {/* 抽屉内容区 (宽度固定) */}
                    <div className="w-[280px] h-full flex flex-col">
                        {/* 标题 */}
                    <div className="h-20 flex items-center px-6 border-b border-white/10 bg-black/20 shrink-0">
                        <Wrench size={24} className="text-blue-400 mr-3" />
                        <span className="text-xl font-black tracking-widest">GM STUDIO</span>
                    </div>

                    {/* 工具列表 */}
                    <div className="flex-1 p-4 flex flex-col gap-2 overflow-y-auto">
                        <span className="text-xs font-mono text-gray-500 font-bold mb-2 ml-2 tracking-widest">PLUGINS</span>

                        {/* 1. 卡面编辑器 */}
                        <button
                            onClick={() => setActiveTool('art')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-all ${
                                activeTool === 'art'
                                ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]'
                                : 'text-gray-400 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            <ImageIcon size={18} />
                            <span className="font-bold tracking-wide text-sm">卡面编辑器</span>
                        </button>

                        {/* 2. 预留：AI 卡组配置 */}
                        <button
                            onClick={() => setActiveTool('sandbox')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-all ${
                                activeTool === 'sandbox'
                                ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]'
                                : 'text-gray-400 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            <Sword size={18} />
                            <span className="font-bold tracking-wide text-sm">特效与战斗沙盒</span>
                        </button>

                        {/* 3. 敌方卡组编辑器 */}
                        <button
                            onClick={() => setActiveTool('ai')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-all ${
                                activeTool === 'ai'
                                ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]'
                                : 'text-gray-400 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            <Sword size={18} />
                            <span className="font-bold tracking-wide text-sm">敌方卡组编辑器</span>
                        </button>

                        {/* 4. 肉鸽地图编辑器 */}
                        <button
                            onClick={() => setActiveTool('level')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-all ${
                                activeTool === 'level'
                                ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]'
                                : 'text-gray-400 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            <Database size={18} />
                            <span className="font-bold tracking-wide text-sm">肉鸽地图编辑器</span>
                        </button>
                    </div>

                    {/* 底部退出按钮 */}
                    <div className="p-4 border-t border-white/10 bg-black/20 shrink-0">
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                            className="w-full py-3 bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white rounded-md flex items-center justify-center gap-2 transition-colors border border-red-500/30 font-bold tracking-widest text-sm"
                        >
                            <X size={18} /> EXIT STUDIO
                        </button>
                    </div>
                </div>
                </div> {/* <--- [修复] 闭合新增的 wrapper */}

                {/* 抽屉收缩控制按钮 (挂载在抽屉右侧外边缘) */}
                <button
                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsDrawerOpen(!isDrawerOpen); }}
                    className="absolute -right-6 top-1/2 -translate-y-1/2 w-6 h-24 bg-slate-800 border-y border-r border-white/20 rounded-r-md flex items-center justify-center hover:bg-slate-700 hover:text-blue-400 transition-colors shadow-[5px_0_10px_rgba(0,0,0,0.3)] z-30 group"
                >
                    {isDrawerOpen ? (
                        <ChevronLeft size={20} className="text-gray-400 group-hover:text-blue-400" />
                    ) : (
                        <ChevronRight size={20} className="text-gray-400 group-hover:text-blue-400" />
                    )}
                </button>
            </motion.div>

            {/* 右侧主工作区 (Workspace) */}
            <div className="flex-1 relative bg-black overflow-hidden flex z-10">
                <AnimatePresence mode="wait">
                    {activeTool === 'art' && (
                        <motion.div
                            key="art-studio"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 flex"
                        >
                            <ArtStudio onClose={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }} />
                        </motion.div>
                    )}
                    {activeTool === 'sandbox' && (
                        <motion.div
                            key="sandbox-session"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 flex"
                        >
                            <SandboxSession onClose={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }} />
                        </motion.div>
                    )}
                    {/* 敌方卡组编辑器工作区 */}
                    {activeTool === 'ai' && (
                        <motion.div
                            key="enemy-deck-editor"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 flex"
                        >
                            <EnemyDeckEditor onClose={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }} />
                        </motion.div>
                    )}
                    {/* 肉鸽地图编辑器 */}
                    {activeTool === 'level' && (
                        <motion.div
                            key="rogue-map-editor"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 flex"
                        >
                            <RogueMapEditor onClose={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
};