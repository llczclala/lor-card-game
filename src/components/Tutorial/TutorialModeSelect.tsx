import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Home, Sword, BookOpen, Lock } from 'lucide-react';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { EXAM_CATEGORIES } from '../../data/tutorialStages';
import type { ExamCategoryId } from '../../data/tutorialStages';

interface TutorialModeSelectProps {
    onSelectCategory: (categoryId: ExamCategoryId) => void;
    onBack: () => void;
    onBackToLobby?: () => void; // [2026-08-07] 直达大厅
}

/** 分类图标映射 */
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    basic: <Sword size={36} />,
    keyword: <BookOpen size={36} />,
    xx: <Lock size={36} />,
};

/** 分类主题色 */
const CATEGORY_THEMES: Record<string, {
    border: string;
    borderHover: string;
    bg: string;
    bgHover: string;
    glow: string;
    accent: string;
}> = {
    basic: {
        border: 'border-blue-500/30',
        borderHover: 'hover:border-blue-400',
        bg: 'from-blue-900/40 to-slate-900/60',
        bgHover: 'hover:from-blue-900/60 hover:to-slate-900/80',
        glow: 'shadow-[0_0_30px_rgba(59,130,246,0.3)]',
        accent: 'text-blue-400',
    },
    keyword: {
        border: 'border-purple-500/30',
        borderHover: 'hover:border-purple-400',
        bg: 'from-purple-900/40 to-slate-900/60',
        bgHover: 'hover:from-purple-900/60 hover:to-slate-900/80',
        glow: 'shadow-[0_0_30px_rgba(147,51,234,0.3)]',
        accent: 'text-purple-400',
    },
    xx: {
        border: 'border-gray-600/30',
        borderHover: 'hover:border-gray-500/50',
        bg: 'from-gray-800/40 to-slate-900/60',
        bgHover: 'hover:from-gray-800/60 hover:to-slate-900/80',
        glow: 'shadow-[0_0_30px_rgba(100,100,100,0.1)]',
        accent: 'text-gray-500',
    },
};

export const TutorialModeSelect: React.FC<TutorialModeSelectProps> = ({
    onSelectCategory,
    onBack,
    onBackToLobby,
}) => {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-black font-sans select-none text-white overflow-hidden relative">
            {/* 背景氛围 */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(30,58,138,0.08)_0%,transparent_70%)] pointer-events-none"></div>

            {/* 返回按钮 + 返回大厅（[2026-08-07] 返回模式选择旁补直达大厅） */}
            <div className="absolute top-8 right-8 z-[999] flex items-center gap-3">
                {onBackToLobby && (
                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_BACK); onBackToLobby(); }}
                        className="p-3 rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/50 transition-all group"
                        title="返回大厅"
                    >
                        <Home size={24} className="text-gray-400 group-hover:text-white transition-colors" />
                    </button>
                )}
                <button
                    onClick={() => {
                        eventBus.emit(GameEvents.UI_BACK);
                        onBack();
                    }}
                    className="p-3 rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/50 transition-all group"
                    title="返回模式选择"
                >
                    <ArrowLeft size={24} className="text-gray-400 group-hover:text-white transition-colors" />
                </button>
            </div>

            {/* 标题 */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-12 text-center"
            >
                <h2 className="text-4xl font-black tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 drop-shadow-lg">
                    战术考核
                </h2>
                <p className="text-sm text-gray-500 font-mono tracking-wider mt-2">
                    选择考核科目 · 开始实战训练
                </p>
            </motion.div>

            {/* 三个考核大类按钮 */}
            <div className="flex gap-8 items-center justify-center">
                {EXAM_CATEGORIES.map((category, index) => {
                    const theme = CATEGORY_THEMES[category.id] || CATEGORY_THEMES.xx;
                    const isLocked = category.id === 'xx';

                    return (
                        <motion.div
                            key={category.id}
                            initial={{ opacity: 0, y: 40 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: index * 0.15 }}
                        >
                            <div
                                onClick={() => {
                                    if (isLocked) return;
                                    eventBus.emit(GameEvents.UI_CLICK);
                                    onSelectCategory(category.id as ExamCategoryId);
                                }}
                                className={`
                                    relative w-72 h-96 rounded-3xl overflow-hidden cursor-pointer
                                    bg-gradient-to-b ${theme.bg} ${theme.bgHover}
                                    border ${theme.border} ${theme.borderHover}
                                    transition-all duration-300
                                    ${isLocked
                                        ? 'grayscale opacity-50 cursor-not-allowed'
                                        : `hover:scale-105 ${theme.glow}`
                                    }
                                    group
                                `}
                            >
                                {/* 装饰顶条 */}
                                <div className={`absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-current to-transparent opacity-50 ${theme.accent}`}></div>

                                {/* 内容区 */}
                                <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-8 relative z-10">
                                    {/* 图标 */}
                                    <div className={`${theme.accent} transition-all duration-300 group-hover:scale-110`}>
                                        {CATEGORY_ICONS[category.id]}
                                    </div>

                                    {/* 名称 */}
                                    <h3 className={`text-2xl font-black tracking-wider ${theme.accent}`}>
                                        {category.name}
                                    </h3>

                                    {/* 描述 */}
                                    <p className="text-sm text-gray-400 text-center leading-relaxed">
                                        {category.description}
                                    </p>

                                    {/* 关卡数 */}
                                    <div className="absolute bottom-8 text-xs font-mono text-gray-600">
                                        {category.stageIds.length > 0
                                            ? `${category.stageIds.length} 个考核关卡`
                                            : '待开放'
                                        }
                                    </div>
                                </div>

                                {/* 锁定遮罩 */}
                                {isLocked && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                                        <span className="text-sm font-mono font-bold text-white/80">COMING SOON</span>
                                    </div>
                                )}

                                {/* hover 光效 */}
                                <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.03)_0%,transparent_60%)]`}></div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* 底部提示 */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="absolute bottom-8 text-xs text-gray-600 font-mono"
            >
                选择考核科目开始你的战术训练
            </motion.div>
        </div>
    );
};
