import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UI_IMAGES } from '../../data/imageData';

interface TutorialGuidanceProps {
    /** 引导层弹出条件是否满足（未完成教程 + 未关闭过） */
    visible: boolean;
    /** 点击"我是萌新"后触发：进入教程关卡 */
    onStartTutorial: () => void;
    /** 引导层完全淡出后触发（两种选择都会调用） */
    onClosed: () => void;
}

/**
 * 大厅新手引导层
 *
 * 弹出条件（由外层控制）：
 *  - 未完成任何一个教程关卡
 *  - 未关闭过本引导层
 *
 * 流程：
 *  选择"我是萌新" → 跳转教程
 *  选择"我是老玩家" → 关闭引导，不再弹出
 */
export const TutorialGuidance: React.FC<TutorialGuidanceProps> = ({
    visible,
    onStartTutorial,
    onClosed,
}) => {
    const [choice, setChoice] = useState<'newbie' | 'veteran' | null>(null);
    const [exiting, setExiting] = useState(false);

    const handleNewbie = useCallback(() => {
        setChoice('newbie');
        // 等待文字显示后淡出，再触发跳转
        setTimeout(() => {
            setExiting(true);
            setTimeout(() => {
                onClosed();
                onStartTutorial();
            }, 500);
        }, 1500);
    }, [onClosed, onStartTutorial]);

    const handleVeteran = useCallback(() => {
        setChoice('veteran');
        setTimeout(() => {
            setExiting(true);
            setTimeout(() => {
                onClosed();
            }, 500);
        }, 1500);
    }, [onClosed]);

    return (
        <AnimatePresence>
            {visible && !exiting && (
                <motion.div
                    key="tutorial-guidance"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="absolute inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md select-none"
                >
                    <div className="flex flex-col items-center gap-8 max-w-lg px-8">
                        {/* 游戏标题图 — 像标题界面那样大大方方展示 */}
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.2, duration: 0.5 }}
                        >
                            <img
                                src={UI_IMAGES.titleLogo}
                                alt="Snowbreak Rivals"
                                className="w-[420px] drop-shadow-[0_0_40px_rgba(0,200,255,0.2)]"
                            />
                        </motion.div>

                        {/* 文字区域 */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4, duration: 0.5 }}
                            className="text-center"
                        >
                            {choice === null ? (
                                <p className="text-white text-lg font-bold tracking-wide leading-relaxed">
                                    亲爱的分析员，你是否体验过大话丶EZ制作的尘白禁区同人卡牌游戏Snowbreak Rivals？
                                </p>
                            ) : choice === 'newbie' ? (
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="text-white text-lg font-bold tracking-wide"
                                >
                                    正在进入战术考核关卡，请耐心等待。。。。
                                </motion.p>
                            ) : (
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="text-white text-lg font-bold tracking-wide"
                                >
                                    欢迎回来，分析员
                                </motion.p>
                            )}
                        </motion.div>

                        {/* 选项按钮 */}
                        {choice === null && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.6, duration: 0.5 }}
                                className="flex gap-6 w-full"
                            >
                                {/* 我是萌新 - 蓝色 */}
                                <button
                                    onClick={handleNewbie}
                                    className="flex-1 py-4 rounded-xl font-bold text-lg tracking-widest
                                        bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500
                                        text-white shadow-[0_0_20px_rgba(34,211,238,0.4)] hover:shadow-[0_0_30px_rgba(34,211,238,0.6)]
                                        transition-all hover:scale-[1.03] active:scale-[0.97] border border-cyan-400/30"
                                >
                                    我是萌新
                                </button>

                                {/* 我是老玩家 - 橙色 */}
                                <button
                                    onClick={handleVeteran}
                                    className="flex-1 py-4 rounded-xl font-bold text-lg tracking-widest
                                        bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500
                                        text-white shadow-[0_0_20px_rgba(251,146,60,0.4)] hover:shadow-[0_0_30px_rgba(251,146,60,0.6)]
                                        transition-all hover:scale-[1.03] active:scale-[0.97] border border-amber-400/30"
                                >
                                    我是老玩家
                                </button>
                            </motion.div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
