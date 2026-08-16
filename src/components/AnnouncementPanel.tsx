import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Megaphone, ChevronDown, ChevronUp, Newspaper } from 'lucide-react';
import { ANNOUNCEMENTS } from '../data/announcements';
import { renderMarkdown } from '../utils/markdownRender';
import { eventBus, GameEvents } from '../utils/eventBus';

// ============================================================================
// 📢 公告中心面板 (AnnouncementPanel)
// 大厅「公告」按钮唤起：左侧「更新公告」下拉版本列表 + 右侧正文（默认最新一期）
// ============================================================================

interface AnnouncementPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AnnouncementPanel: React.FC<AnnouncementPanelProps> = ({ isOpen, onClose }) => {
    // 默认选中最新一期（ANNOUNCEMENTS 按版本降序，[0] 即最新）
    const [selectedVersion, setSelectedVersion] = useState(ANNOUNCEMENTS[0]?.version ?? '');
    // 左侧「更新公告」版本列表是否展开（默认展开，方便玩家看到全部版本）
    const [listOpen, setListOpen] = useState(true);

    const selected = ANNOUNCEMENTS.find(a => a.version === selectedVersion) ?? ANNOUNCEMENTS[0];

    // ESC 关闭：capture + stopImmediatePropagation 拦截 App.tsx 全局 ESC（避免误呼出设置面板）
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopImmediatePropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
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
                {/* 内部高光 */}
                <div className="absolute top-0 w-full h-[30%] bg-gradient-to-b from-blue-600/10 to-transparent pointer-events-none" />

                {/* 左侧侧边栏 */}
                <div className="w-64 bg-slate-950/50 border-r border-blue-500/20 flex flex-col p-6 shrink-0 relative z-10">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 bg-blue-900/50 rounded-lg flex items-center justify-center border border-blue-500/50 shadow-[0_0_15px_blue]">
                            <Megaphone size={20} className="text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white tracking-widest">公告中心</h2>
                            <p className="text-[10px] text-blue-500/80 font-mono tracking-wider">ANNOUNCEMENT</p>
                        </div>
                    </div>

                    {/* 「更新公告」主按钮：点击下拉/收起版本列表 */}
                    <button
                        onClick={() => { setListOpen(!listOpen); eventBus.emit(GameEvents.UI_CLICK); }}
                        className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-all duration-300 ${
                            listOpen
                                ? 'bg-blue-900/40 border-blue-500/50 text-white'
                                : 'bg-slate-800/40 border-white/10 text-gray-300 hover:border-blue-500/40 hover:text-white'
                        }`}
                    >
                        <span className="flex items-center gap-2 text-sm font-black tracking-widest">
                            <Newspaper size={16} className="text-blue-400" /> 更新公告
                        </span>
                        {listOpen ? <ChevronUp size={16} className="text-blue-300" /> : <ChevronDown size={16} className="text-gray-400" />}
                    </button>

                    {/* 版本列表（下拉展开，可滚动） */}
                    <AnimatePresence initial={false}>
                        {listOpen && (
                            <motion.div
                                key="ann-version-list"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: 'easeOut' }}
                                className="overflow-hidden"
                            >
                                <div className="mt-2 max-h-[440px] overflow-y-auto custom-scrollbar pr-1 space-y-1">
                                    {ANNOUNCEMENTS.map(a => {
                                        const active = a.version === selectedVersion;
                                        return (
                                            <button
                                                key={a.version}
                                                onClick={() => { setSelectedVersion(a.version); eventBus.emit(GameEvents.UI_CLICK); }}
                                                className={`w-full text-left px-3 py-2 rounded-md text-sm font-mono tracking-wide transition-all duration-200 border-l-2 ${
                                                    active
                                                        ? 'bg-blue-900/50 border-blue-400 text-white'
                                                        : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-white'
                                                }`}
                                            >
                                                <span className="flex items-center justify-between">
                                                    {a.version}
                                                    {active && <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* 右侧正文区 */}
                <div className="flex-1 flex flex-col relative z-10">
                    {/* 关闭按钮 */}
                    <button
                        onClick={() => { onClose(); eventBus.emit(GameEvents.UI_BACK); }}
                        className="absolute top-6 right-6 p-2 rounded-full text-blue-500/50 hover:bg-blue-900/30 hover:text-white transition-all"
                    >
                        <X size={24} />
                    </button>

                    {/* 顶栏：当前版本标题 */}
                    <div className="px-8 pt-8 pb-4 border-b border-white/10 pr-16">
                        <h3 className="text-2xl font-black text-white tracking-widest">
                            <span className="text-blue-400 font-mono mr-2">{selected?.version ?? ''}</span>更新公告
                        </h3>
                        {selected?.date && (
                            <p className="mt-1 text-xs text-gray-500 font-mono">发布于 {selected.date}</p>
                        )}
                    </div>

                    {/* 正文滚动区 */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-6">
                        {selected ? renderMarkdown(selected.content) : null}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
